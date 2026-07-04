import { NextRequest, NextResponse } from 'next/server';

export interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const minLatStr = searchParams.get('minLat');
  const maxLatStr = searchParams.get('maxLat');
  const minLngStr = searchParams.get('minLng');
  const maxLngStr = searchParams.get('maxLng');
  const sortStr = searchParams.get('sort');

  if (!query || query.trim().length < 1) {
    return NextResponse.json({ items: [] });
  }

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: '카카오 REST API 키가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  try {
    const lat = latStr ? parseFloat(latStr) : null;
    const lng = lngStr ? parseFloat(lngStr) : null;
    const minLat = minLatStr ? parseFloat(minLatStr) : null;
    const maxLat = maxLatStr ? parseFloat(maxLatStr) : null;
    const minLng = minLngStr ? parseFloat(minLngStr) : null;
    const maxLng = maxLngStr ? parseFloat(maxLngStr) : null;

    let items: PlaceResult[] = [];

    // 카카오 로컬 키워드 검색 API
    const baseUrl = 'https://dapi.kakao.com/v2/local/search/keyword.json';

    const params = new URLSearchParams();
    params.set('query', query);
    params.set('size', '15'); // 1회 요청당 최대 결과 수 (카카오 한계치)

    if (sortStr) {
      params.set('sort', sortStr);
    }

    // 지도 중심부 가중치 부여 (x가 경도, y가 위도)
    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      params.set('y', lat.toString());
      params.set('x', lng.toString());
    }

    // 영역 경계(rect) 설정 (카카오는 xMin,yMin,xMax,yMax = minLng,minLat,maxLng,maxLat)
    if (
      minLat !== null && maxLat !== null && minLng !== null && maxLng !== null &&
      !isNaN(minLat) && !isNaN(maxLat) && !isNaN(minLng) && !isNaN(maxLng)
    ) {
      params.set('rect', `${minLng},${minLat},${maxLng},${maxLat}`);
    }

    // 병렬로 Page 1, 2를 호출하여 한 화면 내 최대 30개의 고밀도 데이터 확보
    const fetchPage = async (page: number) => {
      const pageParams = new URLSearchParams(params);
      pageParams.set('page', page.toString());
      const url = `${baseUrl}?${pageParams.toString()}`;

      const res = await fetch(url, {
        headers: {
          'Authorization': `KakaoAK ${apiKey}`
        },
        next: { revalidate: 30 } // 동일 쿼리 30초간 캐시
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`[places] Kakao API page ${page} error:`, res.status, text);
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
      }));
    };

    const [page1, page2, page3] = await Promise.all([fetchPage(1), fetchPage(2), fetchPage(3)]);
    const combinedItems = [...page1, ...page2, ...page3];

    // 중복 제거
    const seen = new Set<string>();
    items = combinedItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // 카테고리 우선순위 산정 함수 (여행, 관광, 명소, 유적지 우선)
    const getCategoryPriority = (category: string) => {
      if (!category) return 99;
      if (category.includes('관광') || category.includes('명소') || category.includes('여행')) return 1;
      if (category.includes('문화') || category.includes('예술') || category.includes('유적') || category.includes('역사')) return 2;
      if (category.includes('숙박') || category.includes('호텔') || category.includes('펜션')) return 3;
      if (category.includes('음식점') || category.includes('카페') || category.includes('식당')) return 4;
      if (category.includes('교통') || category.includes('역') || category.includes('터미널')) return 5;
      
      // 관련도가 낮은 카테고리는 후순위로 배치
      if (category.includes('농업') || category.includes('부동산') || category.includes('기업') || category.includes('산업')) return 10;
      
      return 7; // 기본 우선순위
    };

    // 검색어 포함 여부, 카테고리 관련도, 카테고리명(그룹화), 그리고 지도 중심 기준 거리순으로 정렬
    items.sort((a, b) => {
      const cleanQuery = query.toLowerCase().trim();
      const aName = a.place_name.toLowerCase();
      const bName = b.place_name.toLowerCase();
      
      const aHasQuery = aName.includes(cleanQuery);
      const bHasQuery = bName.includes(cleanQuery);

      // 1. 검색어 포함 여부 우선
      if (aHasQuery && !bHasQuery) return -1;
      if (!aHasQuery && bHasQuery) return 1;

      // 2. 검색어를 포함하는 경우, 카테고리 우선순위 적용
      if (aHasQuery && bHasQuery) {
        const priorityA = getCategoryPriority(a.category);
        const priorityB = getCategoryPriority(b.category);
        
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // 우선순위가 같다면 카테고리별로 그룹화(가나다순 정렬)
        if (a.category < b.category) return -1;
        if (a.category > b.category) return 1;
      }

      // 3. 거리순 정렬
      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        const distA = Math.pow(a.lat - lat, 2) + Math.pow(a.lng - lng, 2);
        const distB = Math.pow(b.lat - lat, 2) + Math.pow(b.lng - lng, 2);
        return distA - distB;
      }

      return 0;
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error('[places] fetch error:', err);
    return NextResponse.json(
      { error: err.message || '네트워크 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
