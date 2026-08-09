import { unstable_cache } from 'next/cache';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { PlacesQueryType } from '../validations/places';
import {
  analyzeQuery,
  getCategoryPatternScore,
  hasExplicitRegionKeyword,
  getPatternGroupCodes,
} from './searchPatternService';
import { calculateHaversineDistance } from '@/lib/naverMapRouteService';
import type { PlaceResult, ServiceCategoryTag } from '@/types/journey';

// ─── 상수 ────────────────────────────────────────────────────────────────────

/** 카카오 로컬 API Base URL */
const KAKAO_API_BASE_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

/** 카카오 로컬 카테고리 검색 API Base URL */
const KAKAO_CATEGORY_API_BASE_URL = 'https://dapi.kakao.com/v2/local/search/category.json';

/** 1회 요청당 최대 결과 수 */
const RESULTS_PER_PAGE = 15;

/** 최종 반환 결과 최대 개수 */
const MAX_RESULTS = 20;

/** Fetch 타임아웃 (밀리초) */
const FETCH_TIMEOUT_MS = 5_000;

/** 도보 이동 시 거리 하드 컷오프 (km) */
const MAX_DISTANCE_WALK_KM = 5.0;

/** 차량 이동 시 일반 지역 거리 하드 컷오프 (km) */
const MAX_DISTANCE_DEFAULT_KM = 50.0;

/** 차량 이동 시 외곽/관광지 거리 하드 컷오프 (km) */
const MAX_DISTANCE_SUBURBAN_KM = 70.0;

/** Gaussian Decay scale — 도보 (반경 약 1km에서 급감) */
const DIST_SCALE_WALK = 1.0;

/** Gaussian Decay scale — 차량 도심 */
const DIST_SCALE_URBAN = 3.0;

/** Gaussian Decay scale — 차량 외곽 */
const DIST_SCALE_SUBURBAN = 7.0;

/** 콜드 스타트 방지용 Tier1 카테고리 인기도 가산점 */
const COLD_START_POPULARITY_BONUS = 0.3;

/** 인기도 정규화 시 최소 하한값 (0.0 제외, 최소 등록된 경우) */
const MIN_POPULARITY_SCORE = 0.1;

// ─── 카테고리 분류 상수 ───────────────────────────────────────────────────

/** Tier 1: 관광·숙박·문화 (여행 목적에 가장 직결) */
const CATEGORY_TIER_1_CODES = ['AT4', 'AD5', 'CT1'];

/** Tier 2: 음식점·카페·주차장 */
const CATEGORY_TIER_2_CODES = ['FD6', 'CE7', 'PK6'];

/** Tier 3: 편의시설 (편의점·약국·마트 등) */
const CATEGORY_TIER_3_CODES = ['CS2', 'PM9', 'MT1', 'OL7', 'SW8', 'PO3', 'BK9'];

/** 외곽 지역 식별 키워드 */
const SUBURBAN_KEYWORDS = ['제주', '강원', '울릉', '독도', '가평', '양평', '강화', '태안', '남해'];

/** 특수 카페 유형 (Drop 대신 etc 태그 부여) */
const EXCLUDED_CAFE_TYPES_REGEX =
  /(만화카페|키즈카페|보드게임카페|룸카페|스터디카페|애견카페|고양이카페)/i;

/** Tier 1 카테고리명 키워드 */
const TIER_1_KEYWORDS = [
  '관광', '명소', '여행', '숙박', '호텔', '펜션', '콘도', '리조트', '민박', '게스트하우스',
  '캠핑', '글램핑', '야영장', '문화', '박물관', '미술관', '전시관', '유적', '사찰', '공원',
  '수목원', '식물원', '해변', '해수욕장', '계곡', '산', '섬', '레저', '테마파크', '놀이공원',
  '휴양림', '온천', '폭포', '전망대', '랜드마크', '유람선', '케이블카', '아쿠아리움', '동물원',
  '공연장', '연극', '영화관', '극장', '유적지', '성지',
];

/** Tier 2 카테고리명 키워드 */
const TIER_2_KEYWORDS = [
  '음식점', '식당', '한식', '중식', '일식', '양식', '카페', '커피', '디저트', '베이커리',
  '빵집', '주차장', '맛집', '일반음식점', '패밀리레스토랑', '패스트푸드', '뷔페', '바', '술집',
];

/** Tier 3 카테고리명 키워드 */
const TIER_3_KEYWORDS = [
  '편의점', '약국', '마트', '슈퍼', '주유소', '충전소', '터미널', '역', '공항', '대형마트',
  '교통', '정류소', '정류장', '지하철', '기관', '시청', '구청', '주민센터', '동사무소', '은행', '금융',
  '우체국', '경찰서', '소방서', '법원', '검찰청', '병원', '의원', '대학교',
];

// ─── 로컬 타입 정의 ──────────────────────────────────────────────────────────

/** 카카오 API `documents` 배열의 단일 항목 타입 */
interface KakaoDocument {
  id: string;
  place_name: string;
  road_address_name: string;
  address_name: string;
  category_name: string;
  category_group_code: string;
  x: string; // 경도(lng) 문자열
  y: string; // 위도(lat) 문자열
  distance?: string; // 거리(미터) 문자열 (x/y 좌표 검색 시 포함됨)
}

// ─── 내부 헬퍼: 거리 계산 ────────────────────────────────────────────────────

/**
 * 두 좌표 사이의 거리를 km 단위로 반환합니다.
 */
function getDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return calculateHaversineDistance(lat1, lng1, lat2, lng2) / 1_000;
}

// ─── 내부 헬퍼: 점수 및 서비스 카테고리 태깅 ───────────────────────────────

/**
 * 거리 감쇠 점수(S_dist)를 계산합니다 (Gaussian Decay).
 */
function getDistanceDecayScore(
  refLat: number | undefined,
  refLng: number | undefined,
  placeLat: number,
  placeLng: number,
  scale: number
): number {
  if (refLat === undefined || refLng === undefined || isNaN(refLat) || isNaN(refLng)) {
    return 0.0;
  }
  const d = getDistanceKm(refLat, refLng, placeLat, placeLng);
  return Math.exp(-(d * d) / (2 * scale * scale));
}

/**
 * 카카오 그룹 코드 및 카테고리명을 기준으로 ServiceCategoryTag를 판별합니다.
 */
function getServiceCategoryTag(
  groupCode: string | null | undefined,
  categoryName: string | null | undefined
): ServiceCategoryTag {
  if (groupCode) {
    if (CATEGORY_TIER_1_CODES.includes(groupCode)) {
      if (groupCode === 'AD5') return 'accommodation';
      return 'attraction';
    }
    if (groupCode === 'FD6') return 'restaurant';
    if (groupCode === 'CE7') return 'cafe';
    if (groupCode === 'PK6') return 'parking';
    if (groupCode === 'SW8') return 'transit';
    if (CATEGORY_TIER_3_CODES.includes(groupCode)) return 'convenience';
  }

  if (!categoryName) return 'etc';

  const catLower = categoryName.toLowerCase();

  // 특수 목적 카페는 etc 태그로 분류 (제거 없이 보존)
  if (EXCLUDED_CAFE_TYPES_REGEX.test(catLower)) return 'etc';

  if (TIER_1_KEYWORDS.some((kw) => catLower.includes(kw))) {
    if (
      catLower.includes('숙박') ||
      catLower.includes('호텔') ||
      catLower.includes('펜션') ||
      catLower.includes('콘도') ||
      catLower.includes('리조트') ||
      catLower.includes('게스트하우스') ||
      catLower.includes('민박')
    ) {
      return 'accommodation';
    }
    return 'attraction';
  }

  if (catLower.includes('카페') || catLower.includes('커피') || catLower.includes('디저트') || catLower.includes('빵집') || catLower.includes('제과점')) {
    return 'cafe';
  }

  if (TIER_2_KEYWORDS.some((kw) => catLower.includes(kw))) {
    if (catLower.includes('주차장')) return 'parking';
    return 'restaurant';
  }

  if (catLower.includes('역') || catLower.includes('터미널') || catLower.includes('공항') || catLower.includes('정류장') || catLower.includes('지하철')) {
    return 'transit';
  }

  if (TIER_3_KEYWORDS.some((kw) => catLower.includes(kw))) {
    return 'convenience';
  }

  return 'etc';
}

/**
 * ServiceCategoryTag에 따른 카테고리 적합도 점수(S_cat)를 산출합니다.
 * 탈락(Drop) 없이 최소 0.2점을 보장합니다.
 */
function getCategoryScoreByTag(tag: ServiceCategoryTag): number {
  switch (tag) {
    case 'attraction':
    case 'accommodation':
      return 1.0;
    case 'restaurant':
    case 'cafe':
    case 'transit':
      return 0.8;
    case 'parking':
    case 'convenience':
      return 0.5;
    case 'etc':
    default:
      return 0.2;
  }
}

// ─── 내부 헬퍼: 인기도 점수 ──────────────────────────────────────────────────

/**
 * 여정 데이터에서 모든 장소의 등록 빈도를 가져오며 10분간 캐시합니다.
 */
const fetchPopularityCountsMap = unstable_cache(
  async () => {
    const counts: Record<string, number> = {};
    let maxCount = 0;
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다.');
      }
      const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
      const { data: journeys, error } = await supabase.from('journeys').select('places');

      if (error || !journeys) {
        console.error('[placesService] 인기도 점수 DB 조회 실패:', error);
        return { counts, maxCount };
      }

      for (const journey of journeys) {
        if (!Array.isArray(journey.places)) continue;
        for (const place of journey.places) {
          if (place && typeof place === 'object' && 'id' in place) {
            const pId = String(place.id);
            counts[pId] = (counts[pId] || 0) + 1;
            if (counts[pId] > maxCount) maxCount = counts[pId];
          }
        }
      }
    } catch (err) {
      console.error('[placesService] 인기도 점수 조회 중 예외 발생:', err);
    }
    return { counts, maxCount };
  },
  ['popularity-counts-map'],
  { revalidate: 600 }
);

/**
 * 내부 journeys 테이블 기반 인기도 점수(S_pop)를 조회합니다.
 */
async function getPopularityScores(
  placeIds: string[]
): Promise<Record<string, number>> {
  const scores: Record<string, number> = Object.fromEntries(placeIds.map((id) => [id, 0.0]));

  const { counts, maxCount } = await fetchPopularityCountsMap();

  placeIds.forEach((id) => {
    const count = counts[id] || 0;
    if (count > 0) {
      scores[id] = maxCount > 0 ? MIN_POPULARITY_SCORE + (count / maxCount) * (1 - MIN_POPULARITY_SCORE) : MIN_POPULARITY_SCORE;
    }
  });

  return scores;
}

// ─── 내부 헬퍼: 외곽 지역 판별 ───────────────────────────────────────────────

function isSuburbanAddress(address: string | undefined): boolean {
  if (!address) return false;
  return SUBURBAN_KEYWORDS.some((kw) => address.includes(kw));
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 검색어와 위치 정보를 기반으로 랭킹된 장소 목록을 반환합니다 (v3 + Pipeline C).
 */
export async function fetchPlaces(params: PlacesQueryType): Promise<PlaceResult[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    throw new Error('카카오 REST API 키가 설정되지 않았습니다.');
  }

  const { query, lat, lng, minLat, maxLat, minLng, maxLng, sort, transport_type } = params;

  // ─ 파이프라인 Fetch 헬퍼 (키워드 검색) ─
  const fetchApiPage = async (
    pageParams: URLSearchParams,
    page: number
  ): Promise<PlaceResult[]> => {
    const p = new URLSearchParams(pageParams);
    p.set('page', page.toString());
    const url = `${KAKAO_API_BASE_URL}?${p.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        next: { revalidate: 30 },
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[placesService] 카카오 API 페이지 ${page} 오류:`, res.status, text);
        return [];
      }

      const data = (await res.json()) as { documents?: KakaoDocument[] };
      if (!data.documents) return [];

      return data.documents.map((doc) => {
        const serviceCategory = getServiceCategoryTag(doc.category_group_code, doc.category_name);
        return {
          id: doc.id,
          place_name: doc.place_name,
          address: doc.road_address_name || doc.address_name,
          category: doc.category_name,
          lat: parseFloat(doc.y),
          lng: parseFloat(doc.x),
          category_group_code: doc.category_group_code,
          serviceCategory,
        };
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('[placesService] 카카오 API 호출 타임아웃');
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ─ 파이프라인 C Fetch 헬퍼 (카테고리 검색) ─
  const fetchCategoryApiPage = async (
    groupCode: string,
    x: number,
    y: number,
    radiusM: number,
    page: number
  ): Promise<PlaceResult[]> => {
    const p = new URLSearchParams({
      category_group_code: groupCode,
      x: x.toString(),
      y: y.toString(),
      radius: radiusM.toString(),
      size: String(RESULTS_PER_PAGE),
      sort: 'distance',
      page: page.toString(),
    });
    const url = `${KAKAO_CATEGORY_API_BASE_URL}?${p.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        next: { revalidate: 30 },
        signal: controller.signal,
      });

      if (!res.ok) return [];

      const data = (await res.json()) as { documents?: KakaoDocument[] };
      if (!data.documents) return [];

      return data.documents.map((doc) => ({
        id: doc.id,
        place_name: doc.place_name,
        address: doc.road_address_name || doc.address_name,
        category: doc.category_name,
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        category_group_code: doc.category_group_code,
        serviceCategory: getServiceCategoryTag(doc.category_group_code, doc.category_name),
      }));
    } catch {
      return []; // 카테고리 API 실패 시 조용히 skip (keyword 결과로 fallback)
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ─ Pipeline A: 정확도 기반 (전국 범위 랜드마크 보장) ─
  const pipelineAParams = new URLSearchParams();
  pipelineAParams.set('query', query);
  pipelineAParams.set('size', String(RESULTS_PER_PAGE));
  pipelineAParams.set('sort', 'accuracy');

  // ─ Pipeline B: 현재 위치/거리 기반 주변 탐색 ─
  const pipelineBParams = new URLSearchParams();
  pipelineBParams.set('query', query);
  pipelineBParams.set('size', String(RESULTS_PER_PAGE));
  pipelineBParams.set('sort', sort || 'distance');

  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    pipelineBParams.set('y', lat.toString());
    pipelineBParams.set('x', lng.toString());
  }

  if (
    minLat !== undefined && maxLat !== undefined &&
    minLng !== undefined && maxLng !== undefined &&
    !isNaN(minLat) && !isNaN(maxLat) && !isNaN(minLng) && !isNaN(maxLng)
  ) {
    pipelineBParams.set('rect', `${minLng},${minLat},${maxLng},${maxLat}`);
  }

  // ─ 쿼리 패턴 분석 및 Pipeline C 조건 검토 ─
  const queryAnalysis = analyzeQuery(query);
  const groupCodes = getPatternGroupCodes(queryAnalysis.pattern);
  const canRunPipelineC =
    groupCodes.length > 0 &&
    lat !== undefined &&
    lng !== undefined &&
    !isNaN(lat) &&
    !isNaN(lng);

  const PATTERN_RADIUS_MAP: Record<string, number> = {
    transit: 2000,
    food: 1000,
    medical: 1500,
    parking: 1000,
    leisure: 3000,
    shopping: 1500,
    public: 2000,
  };
  const pipelineCRadius = queryAnalysis.pattern
    ? PATTERN_RADIUS_MAP[queryAnalysis.pattern] ?? 1500
    : 1500;

  // 이중/삼중 파이프라인 병렬 수집 (A: 1~2p, B: 1~2p, C: 카테고리 1p 조건부)
  const [pipelineAPages, pipelineBPages, pipelineCResults] = await Promise.all([
    Promise.all([fetchApiPage(pipelineAParams, 1), fetchApiPage(pipelineAParams, 2)]),
    Promise.all([fetchApiPage(pipelineBParams, 1), fetchApiPage(pipelineBParams, 2)]),
    canRunPipelineC
      ? Promise.all(
          groupCodes.map((code) => fetchCategoryApiPage(code, lng!, lat!, pipelineCRadius, 1))
        )
      : Promise.resolve([[]]),
  ]);

  const combinedItems = [
    ...pipelineAPages.flat(),
    ...pipelineBPages.flat(),
    ...pipelineCResults.flat(),
  ];

  // 중복 제거 (Pipeline A -> B -> C 순서 유지)
  const seen = new Set<string>();
  const uniqueItems: PlaceResult[] = [];
  for (const item of combinedItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      uniqueItems.push(item);
    }
  }

  if (uniqueItems.length === 0) return [];

  // ─ 카테고리 태깅 및 적합도 평가 (Drop 없이 모든 결과 유지) ─
  const categoryEvaluated = uniqueItems.map((item) => {
    const serviceCategory = item.serviceCategory || getServiceCategoryTag(item.category_group_code, item.category);
    const sCat = getCategoryScoreByTag(serviceCategory);
    return {
      item: {
        ...item,
        serviceCategory,
      },
      sCat,
    };
  });

  const isExplicitRegion = hasExplicitRegionKeyword(query);

  // ─ 인기도 점수 조회 ─
  const activePlaceIds = categoryEvaluated.map((entry) => entry.item.id);
  const popularityScores = await getPopularityScores(activePlaceIds);

  // ─ 외곽 지역 여부 판별 ─
  const isSuburban = uniqueItems.length > 0 && isSuburbanAddress(uniqueItems[0].address);

  // 50km 하드 컷오프 (도보: 5km, 외곽: 70km, 기본: 50km)
  const maxDistanceKm =
    transport_type === 'walk'
      ? MAX_DISTANCE_WALK_KM
      : isSuburban
      ? MAX_DISTANCE_SUBURBAN_KM
      : MAX_DISTANCE_DEFAULT_KM;

  // ─ 복합 점수 산출 ─
  const scoredItems: PlaceResult[] = [];

  for (const { item, sCat } of categoryEvaluated) {
    // 기본 단어(baseWord) 매칭 점수 (S_match) — 퍼지 매칭 적용
    const placeNameLower = item.place_name.toLowerCase();
    const itemCategoryLower = (item.category || '').toLowerCase();
    const baseWordLower = (queryAnalysis.baseWord || query).toLowerCase();

    let sMatch = 0.1;
    if (placeNameLower === baseWordLower) {
      sMatch = 1.0; // 완전 일치
    } else if (placeNameLower.startsWith(baseWordLower)) {
      sMatch = 0.95; // 접두사 일치
    } else if (placeNameLower.includes(baseWordLower)) {
      sMatch = 0.8; // 부분 일치
    } else if (itemCategoryLower.includes(baseWordLower)) {
      sMatch = 0.6; // 카테고리명 포함
    }

    // 패턴별 카테고리 점수 (S_pattern)
    const sPattern = getCategoryPatternScore(queryAnalysis.pattern, item.category_group_code, item.category);

    // Gaussian Decay scale 동적 결정
    const scale = transport_type === 'walk' ? DIST_SCALE_WALK : isSuburban ? DIST_SCALE_SUBURBAN : DIST_SCALE_URBAN;
    const sDist = getDistanceDecayScore(lat, lng, item.lat, item.lng, scale);

    // 인기도 점수 + Tier1 콜드 스타트 보정
    let sPop = popularityScores[item.id] || 0.0;
    if (sPop === 0.0 && item.serviceCategory && ['attraction', 'accommodation'].includes(item.serviceCategory)) {
      sPop = COLD_START_POPULARITY_BONUS;
    }

    // 가중치 산출 (패턴 유무에 따른 분기)
    const totalScore = queryAnalysis.pattern
      ? sMatch * 0.35 + sPattern * 0.35 + sDist * 0.20 + sPop * 0.10
      : sMatch * 0.40 + sCat * 0.30 + sDist * 0.20 + sPop * 0.10;

    scoredItems.push({
      ...item,
      serviceCategory: item.serviceCategory,
      score: Number(totalScore.toFixed(4)),
    });
  }

  // ─ 내림차순 정렬 후 상위 N개 반환 ─
  scoredItems.sort((a, b) => (b.score || 0) - (a.score || 0));
  return scoredItems.slice(0, MAX_RESULTS);
}

