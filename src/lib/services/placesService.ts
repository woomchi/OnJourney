import { PlacesQueryType } from '../validations/places';
import { createClient } from '@/lib/supabase/server';
import { 
  analyzeQuery, 
  getCategoryPatternScore, 
  hasExplicitRegionKeyword 
} from './searchPatternService';

export interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  score?: number;
  category_group_code?: string;
}

// 헬퍼: 두 위경도 좌표 사이의 거리를 km 단위로 계산 (Haversine 공식)
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 지구 반경 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 헬퍼: 거리 감쇠 점수 (S_dist) 계산 (Gaussian Decay)
function getDistanceDecayScore(
  lat: number | undefined,
  lng: number | undefined,
  placeLat: number,
  placeLng: number,
  scale: number
): number {
  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    return 0.0; // 기준 위치가 없으면 감쇠 점수 0.0 부여
  }

  const d = getDistanceKm(lat, lng, placeLat, placeLng);
  
  return Math.exp(- (d * d) / (2 * scale * scale));
}

// 헬퍼: 카테고리 적합도 점수 (S_cat) 계산 및 필터링
function getCategoryScore(groupCode: string | null | undefined, categoryName: string | null | undefined): number {
  if (groupCode) {
    const tier1 = ['AT4', 'AD5', 'CT1']; // 관광명소, 숙박, 문화시설
    const tier2 = ['FD6', 'CE7', 'PK6']; // 음식점, 카페, 주차장
    const tier3 = ['CS2', 'PM9', 'MT1', 'OL7', 'SW8', 'PO3', 'BK9']; // 편의점, 약국, 대형마트, 주유소, 지하철역, 공공기관, 은행
    
    if (tier1.includes(groupCode)) return 1.0;
    if (tier2.includes(groupCode)) return 0.8;
    if (tier3.includes(groupCode)) return 0.4;
    return 0.0; // 그 외 카카오 카테고리 그룹 코드는 노이즈로 간주하고 필터링
  }

  if (!categoryName) return 0.0;

  // 카카오 카테고리 그룹 코드가 비어 있는 경우 categoryName 키워드 기반으로 역매핑
  const catLower = categoryName.toLowerCase();
  
  // 2차 정밀 필터링: 여행/이동 목적과 거리가 먼 세부 업종 정규식 제외
  const excludeSubCategoryRegex = /(만화카페|키즈카페|보드게임카페|룸카페|스터디카페|애견카페|고양이카페)/i;
  if (excludeSubCategoryRegex.test(catLower)) {
    return 0.0;
  }

  const tier1Keywords = [
    '관광', '명소', '여행', '숙박', '호텔', '펜션', '콘도', '리조트', '민박', '게스트하우스', 
    '캠핑', '글램핑', '야영장', '문화', '박물관', '미술관', '전시관', '유적', '사찰', '공원', 
    '수목원', '식물원', '해변', '해수욕장', '계곡', '산', '섬', '레저', '테마파크', '놀이공원', 
    '휴양림', '온천', '폭포', '전망대', '랜드마크', '유람선', '케이블카', '아쿠아리움', '동물원',
    '공연장', '연극', '영화관', '극장', '유적지', '성지'
  ];
  if (tier1Keywords.some(kw => catLower.includes(kw))) {
    return 1.0;
  }

  const tier2Keywords = [
    '음식점', '식당', '한식', '중식', '일식', '양식', '카페', '커피', '디저트', '베이커리', 
    '빵집', '주차장', '맛집', '일반음식점', '패밀리레스토랑', '패스트푸드', '뷔페', '바', '술집'
  ];
  if (tier2Keywords.some(kw => catLower.includes(kw))) {
    return 0.8;
  }

  const tier3Keywords = [
    '편의점', '약국', '마트', '슈퍼', '주유소', '충전소', '터미널', '역', '공항', '대형마트',
    '교통', '정류소', '정류장', '지하철', '기관', '시청', '구청', '주민센터', '동사무소', '은행', '금융',
    '우체국', '경찰서', '소방서', '법원', '검찰청', '병원', '의원', '대학교'
  ];
  if (tier3Keywords.some(kw => catLower.includes(kw))) {
    return 0.4;
  }

  return 0.0; // 매칭되지 않는 기타 카테고리는 필터링
}

// 헬퍼: Supabase DB의 journeys 테이블을 조회하여 내부 인기도 점수 (S_pop) 산출
async function getPopularityScores(placeIds: string[]): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};
  placeIds.forEach(id => {
    scores[id] = 0.0;
  });

  try {
    const supabase = await createClient();
    const { data: journeys, error } = await supabase.from('journeys').select('places');
    
    if (error || !journeys) {
      console.error('[placesService] getPopularityScores DB query failed:', error);
      return scores;
    }

    const counts: Record<string, number> = {};
    let maxCount = 0;

    // 각 장소 ID가 등록된 빈도 집계
    for (const journey of journeys) {
      if (Array.isArray(journey.places)) {
        for (const place of journey.places) {
          if (place && typeof place === 'object' && 'id' in place) {
            const pId = String(place.id);
            counts[pId] = (counts[pId] || 0) + 1;
            if (counts[pId] > maxCount) {
              maxCount = counts[pId];
            }
          }
        }
      }
    }

    // 0.0 ~ 1.0 범위로 정규화 (최소 기본값은 0.1, 등록되지 않은 장소는 0.0)
    placeIds.forEach(id => {
      const count = counts[id] || 0;
      if (count > 0) {
        scores[id] = maxCount > 0 ? 0.1 + (count / maxCount) * 0.9 : 0.1;
      } else {
        scores[id] = 0.0;
      }
    });
  } catch (err) {
    console.error('[placesService] getPopularityScores error:', err);
  }

  return scores;
}

export async function fetchPlaces(params: PlacesQueryType): Promise<PlaceResult[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    throw new Error('카카오 REST API 키가 설정되지 않았습니다.');
  }

  const { query, lat, lng, minLat, maxLat, minLng, maxLng, sort, transport_type } = params;

  let items: PlaceResult[] = [];
  const baseUrl = 'https://dapi.kakao.com/v2/local/search/keyword.json';

  const urlParams = new URLSearchParams();
  urlParams.set('query', query);
  urlParams.set('size', '15'); // 1회 요청당 최대 결과 수 (페이지당 15개)
  urlParams.set('sort', sort || 'accuracy'); // 설계서의 요구사항대로 accuracy(정확도)로 기본값 강제 적용

  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    urlParams.set('y', lat.toString());
    urlParams.set('x', lng.toString());
  }

  if (
    minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined &&
    !isNaN(minLat) && !isNaN(maxLat) && !isNaN(minLng) && !isNaN(maxLng)
  ) {
    urlParams.set('rect', `${minLng},${minLat},${maxLng},${maxLat}`);
  }

  // Fetch a single page
  const fetchPage = async (page: number): Promise<PlaceResult[]> => {
    const pageParams = new URLSearchParams(urlParams);
    pageParams.set('page', page.toString());
    const url = `${baseUrl}?${pageParams.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `KakaoAK ${apiKey}`
        },
        next: { revalidate: 30 },
        signal: controller.signal
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[placesService] Kakao API page ${page} error:`, res.status, text);
        try {
          const errData = JSON.parse(text);
          if (errData.message) {
            throw new Error(`카카오 API 오류: ${errData.message}`);
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('카카오 API 오류')) {
            throw e;
          }
        }
        throw new Error(`카카오 API 호출에 실패했습니다. (Status: ${res.status})`);
      }

      const data = await res.json();
      if (!data.documents) return [];

      return data.documents.map((doc: any) => ({
        id: doc.id,
        place_name: doc.place_name,
        address: doc.road_address_name || doc.address_name,
        category: doc.category_name,
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        category_group_code: doc.category_group_code,
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('카카오 API 호출 시간이 초과되었습니다.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // 3개 페이지를 병렬로 호출 (총 45개 후보군 획득)
  const [page1, page2, page3] = await Promise.all([fetchPage(1), fetchPage(2), fetchPage(3)]);
  const combinedItems = [...page1, ...page2, ...page3];

  // 중복 항목 제거
  const seen = new Set<string>();
  items = combinedItems.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // Step 2. 카테고리 적합도 평가 및 필터링
  const categoryEvaluated = items.map(item => {
    const sCat = getCategoryScore(item.category_group_code, item.category);
    return { item, sCat };
  }).filter(entry => entry.sCat > 0.0); // 점수가 0.0인 노이즈 장소는 드롭

  if (categoryEvaluated.length === 0) {
    return [];
  }

  // Step 1.5 쿼리 패턴 분석 (analyzeQuery)
  const queryAnalysis = analyzeQuery(query);
  const isExplicitRegion = hasExplicitRegionKeyword(query);

  // Step 4. 내부 인기도 데이터 결합 (조회 및 연동)
  const activePlaceIds = categoryEvaluated.map(entry => entry.item.id);
  const popularityScores = await getPopularityScores(activePlaceIds);

  // 외곽 지역 판별 헬퍼
  const isSuburbanArea = (address: string | undefined): boolean => {
    if (!address) return false;
    const suburbanKeywords = ['제주', '강원', '울릉', '독도', '가평', '양평', '강화', '태안', '남해'];
    return suburbanKeywords.some(kw => address.includes(kw));
  };

  const isSuburban = items.length > 0 && isSuburbanArea(items[0].address);

  // 50km 하드 컷오프 제한 (도보 시 5km, 명시적 타지역 검색어 제외)
  const maxDistanceKm = transport_type === 'walk' ? 5.0 : (isSuburban ? 70.0 : 50.0);

  // Step 3 & 5. 기본 단어 매칭, 패턴 카테고리, 거리 감쇠 계산 및 최종 복합 점수 산출
  const scoredItems: PlaceResult[] = [];

  for (const entry of categoryEvaluated) {
    const item = entry.item;
    const sCat = entry.sCat;

    // 거리 검증 및 하드 컷오프 (경도/위도 좌표가 존재하고 명시적 지역명이 없으면 반경 검증)
    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      const d = getDistanceKm(lat, lng, item.lat, item.lng);
      if (!isExplicitRegion && d > maxDistanceKm) {
        continue; // 허용 거리 초과 장소 드롭
      }
    }

    // 기본 단어(baseWord) 매칭 점수 (S_match)
    const placeNameLower = item.place_name.toLowerCase();
    const itemCategoryLower = (item.category || '').toLowerCase();
    const baseWordLower = (queryAnalysis.baseWord || query).toLowerCase();

    let sMatch = 0.1; // 기본 최저 점수
    if (placeNameLower.includes(baseWordLower)) {
      sMatch = 1.0; // 장소명에 baseWord 포함 시 100점(1.0)
    } else if (itemCategoryLower.includes(baseWordLower)) {
      sMatch = 0.6; // 카테고리에 포함 시 60점(0.6)
    }

    // 패턴별 카테고리 점수 (S_pattern)
    const sPattern = getCategoryPatternScore(
      queryAnalysis.pattern,
      item.category_group_code,
      item.category
    );

    // 가우시안 scale 동적 결정 (도보: 1.0, 차량 도심: 3.0, 차량 외곽: 7.0)
    const scale = transport_type === 'walk'
      ? 1.0
      : (isSuburban ? 7.0 : 3.0);

    const sDist = getDistanceDecayScore(lat, lng, item.lat, item.lng, scale);

    // 콜드 스타트 방지 가산점 계산
    let sPop = popularityScores[item.id] || 0.0;
    if (sPop === 0.0 && item.category_group_code && ['AT4', 'AD5', 'CT1'].includes(item.category_group_code)) {
      sPop = 0.3; // Tier 1인 경우 콜드 스타트 가산점 부여
    }

    // 복합 점수 계산 공식:
    // 패턴이 감지된 경우: S_total = (S_match * 0.40) + (S_pattern * 0.25) + (S_cat * 0.15) + (S_dist * 0.10) + (S_pop * 0.10)
    // 일반 키워드인 경우: S_total = (S_match * 0.40) + (S_cat * 0.30) + (S_dist * 0.20) + (S_pop * 0.10)
    let totalScore = 0;
    if (queryAnalysis.pattern) {
      totalScore = (sMatch * 0.40) + (sPattern * 0.25) + (sCat * 0.15) + (sDist * 0.10) + (sPop * 0.10);
    } else {
      totalScore = (sMatch * 0.40) + (sCat * 0.30) + (sDist * 0.20) + (sPop * 0.10);
    }

    scoredItems.push({
      ...item,
      score: Number(totalScore.toFixed(4)) // 소수점 4자리까지 포맷
    });
  }

  // 최종 점수 기준 내림차순 정렬
  scoredItems.sort((a, b) => (b.score || 0) - (a.score || 0));

  // 상위 N개(최대 20개)만 절삭하여 반환
  return scoredItems.slice(0, 20);
}
