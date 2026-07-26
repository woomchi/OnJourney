import { PlacesQueryType } from '../validations/places';
import { createClient } from '@/lib/supabase/server';

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
  transportType: string | undefined
): number {
  if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
    return 0.0; // 기준 위치가 없으면 감쇠 점수 0.0 부여
  }

  const d = getDistanceKm(lat, lng, placeLat, placeLng);
  const scale = transportType === 'walk' ? 1.0 : 5.0; // 도보 모드는 1km, 차량/대중교통 모드는 5km 적용
  
  return Math.exp(- (d * d) / (2 * scale * scale));
}

// 헬퍼: 카테고리 적합도 점수 (S_cat) 계산 및 필터링
function getCategoryScore(groupCode: string | null | undefined, categoryName: string | null | undefined): number {
  if (groupCode) {
    const tier1 = ['AT4', 'AD5', 'CT1']; // 관광명소, 숙박, 문화시설
    const tier2 = ['FD6', 'CE7', 'PK6']; // 음식점, 카페, 주차장
    const tier3 = ['CS2', 'PM9', 'MT1', 'OL7']; // 편의점, 약국, 대형마트, 주유소
    
    if (tier1.includes(groupCode)) return 1.0;
    if (tier2.includes(groupCode)) return 0.8;
    if (tier3.includes(groupCode)) return 0.4;
    return 0.0; // 그 외 카카오 카테고리 그룹 코드는 노이즈로 간주하고 필터링
  }

  if (!categoryName) return 0.0;

  // 카카오 카테고리 그룹 코드가 비어 있는 경우 categoryName 키워드 기반으로 역매핑
  const catLower = categoryName.toLowerCase();
  
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
    '교통', '정류소', '정류장'
  ];
  if (tier3Keywords.some(kw => catLower.includes(kw))) {
    return 0.4;
  }

  // 명시적 제외 키워드
  const excludedKeywords = [
    '부동산', '공공기관', '시청', '구청', '주민센터', '동사무소', '학교', '초등학교', '중학교', 
    '고등학교', '대학교', '학원', '유치원', '어린이집', '병원', '의원', '치과', '한의원', '은행', 
    '금융', '회사', '기업', '사무실', '공장', '아파트', '빌라', '오피스텔', '주택', '건설',
    '세무서', '경찰서', '소방서', '우체국', '법원', '검찰청'
  ];
  if (excludedKeywords.some(kw => catLower.includes(kw))) {
    return 0.0;
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

  // Step 4. 내부 인기도 데이터 결합 (조회 및 연동)
  const activePlaceIds = categoryEvaluated.map(entry => entry.item.id);
  const popularityScores = await getPopularityScores(activePlaceIds);

  // Step 3 & 5. 거리 감쇠 계산 및 최종 복합 점수 산출
  const scoredItems = categoryEvaluated.map(entry => {
    const item = entry.item;
    const sCat = entry.sCat;
    const sDist = getDistanceDecayScore(lat, lng, item.lat, item.lng, transport_type);
    const sPop = popularityScores[item.id] || 0.0;

    // 복합 점수 계산 공식: S_total = (S_cat * W_cat) + (S_dist * W_dist) + (S_pop * W_pop)
    // 가중치 추천 설정값: W_cat = 0.4, W_dist = 0.4, W_pop = 0.2
    const totalScore = (sCat * 0.4) + (sDist * 0.4) + (sPop * 0.2);

    return {
      ...item,
      score: Number(totalScore.toFixed(4)) // 소수점 4자리까지 포맷
    };
  });

  // 최종 점수 기준 내림차순 정렬
  scoredItems.sort((a, b) => (b.score || 0) - (a.score || 0));

  // 상위 N개(최대 20개)만 절삭하여 반환
  return scoredItems.slice(0, 20);
}
