/**
 * @fileoverview 장소 검색 서비스
 *
 * 카카오 로컬 API를 호출하여 검색어에 가장 적합한 장소 목록을 반환합니다.
 * 복합 점수 공식(매칭·카테고리·거리·인기도)을 사용해 결과를 랭킹합니다.
 *
 * @see https://developers.kakao.com/docs/latest/ko/local/dev-guide
 */

import { unstable_cache } from 'next/cache';
import { PlacesQueryType } from '../validations/places';
import { createClient } from '@/lib/supabase/server';
import {
  analyzeQuery,
  getCategoryPatternScore,
  hasExplicitRegionKeyword,
} from './searchPatternService';
import { calculateHaversineDistance } from '@/lib/naverMapRouteService';
import type { PlaceResult } from '@/types/journey';

// ─── 상수 ────────────────────────────────────────────────────────────────────

/** 카카오 로컬 API Base URL */
const KAKAO_API_BASE_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

/** 1회 요청당 최대 결과 수 */
const RESULTS_PER_PAGE = 15;

/** 병렬로 호출할 페이지 수 (총 후보군: RESULTS_PER_PAGE × MAX_PAGES) */
const MAX_PAGES = 3;

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

// ─── 카테고리 분류 상수 (함수 호출마다 재생성 방지) ───────────────────────────

/** Tier 1: 관광·숙박·문화 (여행 목적에 가장 직결) */
const CATEGORY_TIER_1_CODES = ['AT4', 'AD5', 'CT1'];

/** Tier 2: 음식점·카페·주차장 */
const CATEGORY_TIER_2_CODES = ['FD6', 'CE7', 'PK6'];

/** Tier 3: 편의시설 (편의점·약국·마트 등) */
const CATEGORY_TIER_3_CODES = ['CS2', 'PM9', 'MT1', 'OL7', 'SW8', 'PO3', 'BK9'];

/** 외곽 지역 식별 키워드 */
const SUBURBAN_KEYWORDS = ['제주', '강원', '울릉', '독도', '가평', '양평', '강화', '태안', '남해'];

/** 여행/이동 목적과 거리가 먼 특수 카페 유형 (제외 대상) */
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
}

// ─── 내부 헬퍼: 거리 계산 ────────────────────────────────────────────────────

/**
 * 두 좌표 사이의 거리를 km 단위로 반환합니다.
 * naverMapRouteService의 Haversine 구현을 재사용합니다 (m → km 환산).
 */
function getDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  return calculateHaversineDistance(lat1, lng1, lat2, lng2) / 1_000;
}

// ─── 내부 헬퍼: 점수 계산 ────────────────────────────────────────────────────

/**
 * 거리 감쇠 점수(S_dist)를 계산합니다 (Gaussian Decay).
 *
 * 기준 위치가 없으면 0.0을 반환합니다.
 * @param refLat   기준 위도 (사용자 현재 위치 등)
 * @param refLng   기준 경도
 * @param placeLat 장소 위도
 * @param placeLng 장소 경도
 * @param scale    Gaussian scale 파라미터 (작을수록 가까운 장소 선호)
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
 * 카테고리 적합도 점수(S_cat)를 계산합니다.
 *
 * - 카카오 카테고리 그룹 코드(groupCode)를 우선 사용합니다.
 * - 코드가 없으면 categoryName 키워드로 역매핑합니다.
 * - 여행/이동과 무관한 카테고리는 0.0을 반환하여 필터링합니다.
 */
function getCategoryScore(
  groupCode: string | null | undefined,
  categoryName: string | null | undefined
): number {
  if (groupCode) {
    if (CATEGORY_TIER_1_CODES.includes(groupCode)) return 1.0;
    if (CATEGORY_TIER_2_CODES.includes(groupCode)) return 0.8;
    if (CATEGORY_TIER_3_CODES.includes(groupCode)) return 0.4;
    // 그 외 카카오 그룹 코드는 노이즈로 간주하여 제외
    return 0.0;
  }

  if (!categoryName) return 0.0;

  const catLower = categoryName.toLowerCase();

  // 2차 정밀 필터링: 여행 목적과 거리가 먼 특수 카페 유형 제외
  if (EXCLUDED_CAFE_TYPES_REGEX.test(catLower)) return 0.0;

  if (TIER_1_KEYWORDS.some((kw) => catLower.includes(kw))) return 1.0;
  if (TIER_2_KEYWORDS.some((kw) => catLower.includes(kw))) return 0.8;
  if (TIER_3_KEYWORDS.some((kw) => catLower.includes(kw))) return 0.4;

  // 매칭되지 않는 기타 카테고리 제외
  return 0.0;
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
      const supabase = await createClient();
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
 *
 * - 특정 장소가 여정에 등록된 횟수를 집계하고, 최고 빈도 기준으로 0.1~1.0 범위로 정규화합니다.
 * - 한 번도 등록되지 않은 장소는 0.0을 반환합니다 (Tier1 콜드 스타트 보정은 상위에서 처리).
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

/**
 * 주소 문자열에 외곽/관광지 키워드가 포함되어 있는지 확인합니다.
 * 외곽 지역은 거리 컷오프와 Gaussian scale이 더 관대하게 적용됩니다.
 */
function isSuburbanAddress(address: string | undefined): boolean {
  if (!address) return false;
  return SUBURBAN_KEYWORDS.some((kw) => address.includes(kw));
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 검색어와 위치 정보를 기반으로 랭킹된 장소 목록을 반환합니다.
 *
 * 처리 흐름:
 * 1. 카카오 API 3페이지 병렬 호출 (최대 45개 후보 확보)
 * 2. 중복 제거
 * 3. 카테고리 적합도 필터링 (S_cat = 0.0 제거)
 * 4. 쿼리 패턴 분석 및 거리 하드 컷오프 적용
 * 5. 복합 점수 산출 및 내림차순 정렬
 * 6. 상위 MAX_RESULTS(20)개 반환
 */
export async function fetchPlaces(params: PlacesQueryType): Promise<PlaceResult[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    throw new Error('카카오 REST API 키가 설정되지 않았습니다.');
  }

  const { query, lat, lng, minLat, maxLat, minLng, maxLng, sort, transport_type } = params;

  // ─ 카카오 API 쿼리 파라미터 구성 ─
  const baseUrlParams = new URLSearchParams();
  baseUrlParams.set('query', query);
  baseUrlParams.set('size', String(RESULTS_PER_PAGE));
  // 설계 요구사항에 따라 기본 정렬은 accuracy(정확도) 고정
  baseUrlParams.set('sort', sort || 'accuracy');

  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    baseUrlParams.set('y', lat.toString());
    baseUrlParams.set('x', lng.toString());
  }

  if (
    minLat !== undefined && maxLat !== undefined &&
    minLng !== undefined && maxLng !== undefined &&
    !isNaN(minLat) && !isNaN(maxLat) && !isNaN(minLng) && !isNaN(maxLng)
  ) {
    baseUrlParams.set('rect', `${minLng},${minLat},${maxLng},${maxLat}`);
  }

  // ─ 단일 페이지 Fetch 헬퍼 ─
  const fetchPage = async (page: number): Promise<PlaceResult[]> => {
    const pageParams = new URLSearchParams(baseUrlParams);
    pageParams.set('page', page.toString());
    const url = `${KAKAO_API_BASE_URL}?${pageParams.toString()}`;

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
        // 파싱 가능한 오류 메시지를 상위로 전달
        try {
          const errData = JSON.parse(text) as { message?: string };
          if (errData.message) throw new Error(`카카오 API 오류: ${errData.message}`);
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message.startsWith('카카오 API 오류')) {
            throw parseErr;
          }
        }
        throw new Error(`카카오 API 호출에 실패했습니다. (Status: ${res.status})`);
      }

      const data = await res.json() as { documents?: KakaoDocument[] };
      if (!data.documents) return [];

      return data.documents.map((doc) => ({
        id: doc.id,
        place_name: doc.place_name,
        address: doc.road_address_name || doc.address_name,
        category: doc.category_name,
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        category_group_code: doc.category_group_code,
      }));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('카카오 API 호출 시간이 초과되었습니다.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ─ 3페이지 병렬 호출 ─
  const pages = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) => fetchPage(i + 1))
  );
  const combinedItems = pages.flat();

  // ─ 중복 제거 ─
  const seen = new Set<string>();
  const uniqueItems = combinedItems.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // ─ 카테고리 적합도 평가 및 필터링 (S_cat = 0.0 제거) ─
  const categoryEvaluated = uniqueItems
    .map((item) => ({
      item,
      sCat: getCategoryScore(item.category_group_code, item.category),
    }))
    .filter((entry) => entry.sCat > 0.0);

  if (categoryEvaluated.length === 0) return [];

  // ─ 쿼리 패턴 분석 ─
  const queryAnalysis = analyzeQuery(query);
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
    // 거리 하드 컷오프 (명시적 지역명이 없으면 반경 검증)
    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      const d = getDistanceKm(lat, lng, item.lat, item.lng);
      if (!isExplicitRegion && d > maxDistanceKm) continue;
    }

    // 기본 단어(baseWord) 매칭 점수 (S_match)
    const placeNameLower = item.place_name.toLowerCase();
    const itemCategoryLower = (item.category || '').toLowerCase();
    const baseWordLower = (queryAnalysis.baseWord || query).toLowerCase();

    let sMatch = 0.1;
    if (placeNameLower.includes(baseWordLower)) {
      sMatch = 1.0; // 장소명에 포함: 100점
    } else if (itemCategoryLower.includes(baseWordLower)) {
      sMatch = 0.6; // 카테고리에 포함: 60점
    }

    // 패턴별 카테고리 점수 (S_pattern)
    const sPattern = getCategoryPatternScore(queryAnalysis.pattern, item.category_group_code, item.category);

    // Gaussian Decay scale 동적 결정
    const scale = transport_type === 'walk' ? DIST_SCALE_WALK : isSuburban ? DIST_SCALE_SUBURBAN : DIST_SCALE_URBAN;
    const sDist = getDistanceDecayScore(lat, lng, item.lat, item.lng, scale);

    // 인기도 점수 + Tier1 콜드 스타트 보정
    let sPop = popularityScores[item.id] || 0.0;
    if (sPop === 0.0 && item.category_group_code && CATEGORY_TIER_1_CODES.includes(item.category_group_code)) {
      // Tier1 카테고리는 한 번도 등록되지 않아도 기본 가산점 부여
      sPop = COLD_START_POPULARITY_BONUS;
    }

    /**
     * 복합 점수 공식:
     * - 패턴 감지 시: (S_match × 0.40) + (S_pattern × 0.25) + (S_cat × 0.15) + (S_dist × 0.10) + (S_pop × 0.10)
     * - 일반 키워드: (S_match × 0.40) + (S_cat × 0.30) + (S_dist × 0.20) + (S_pop × 0.10)
     */
    const totalScore = queryAnalysis.pattern
      ? sMatch * 0.40 + sPattern * 0.25 + sCat * 0.15 + sDist * 0.10 + sPop * 0.10
      : sMatch * 0.40 + sCat * 0.30 + sDist * 0.20 + sPop * 0.10;

    scoredItems.push({
      ...item,
      score: Number(totalScore.toFixed(4)),
    });
  }

  // ─ 내림차순 정렬 후 상위 N개 반환 ─
  scoredItems.sort((a, b) => (b.score || 0) - (a.score || 0));
  return scoredItems.slice(0, MAX_RESULTS);
}
