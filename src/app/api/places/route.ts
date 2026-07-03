import { NextRequest, NextResponse } from 'next/server';

export interface NaverPlaceItem {
  title: string;
  link: string;
  category: string;
  description: string;
  telephone: string;
  address: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
}

export interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

async function fetchNaverPlaces(query: string, clientId: string, clientSecret: string): Promise<PlaceResult[]> {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=8&sort=random`;

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    // 동일 쿼리는 30초간 캐시
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[places] Naver API error:', res.status, text);
    throw new Error(`Naver API error: ${res.status}`);
  }

  const data = await res.json() as { items: NaverPlaceItem[] };

  // HTML 태그 제거 유틸
  const stripHtml = (str: string) => str.replace(/<[^>]+>/g, '');

  return data.items.map((item, idx) => ({
    id: `${item.mapx}-${item.mapy}-${idx}`,
    place_name: stripHtml(item.title),
    address: item.roadAddress || item.address,
    category: item.category,
    lat: parseInt(item.mapy) / 1e7,
    lng: parseInt(item.mapx) / 1e7,
  }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const region = searchParams.get('region');
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');

  if (!query || query.trim().length < 1) {
    return NextResponse.json({ items: [] });
  }

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: '네이버 검색 API 키가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  try {
    let items: PlaceResult[] = [];

    // 1. region이 전달되었을 때, 점진적으로 범위를 좁혀가며 검색 (동 -> 구 -> 시/도 순)
    if (region && region.trim().length > 0) {
      const regionParts = region.split(' ').filter(Boolean);
      
      // 예: ["부산광역시", "남구", "감만동"] -> "부산광역시 남구 감만동", "부산광역시 남구", "부산광역시" 순서로 시도
      for (let i = regionParts.length; i > 0; i--) {
        const subRegion = regionParts.slice(0, i).join(' ');
        try {
          const localQuery = `${subRegion} ${query}`;
          items = await fetchNaverPlaces(localQuery, clientId, clientSecret);
          if (items.length > 0) {
            break; // 결과를 찾았으므로 루프 중단
          }
        } catch (err) {
          console.error(`[places] Local search failed for query: ${subRegion} ${query}`, err);
        }
      }
    }

    // 2. 검색 결과가 여전히 없거나 region이 없을 시, 원본 검색어로 최종 검색 시도 (전국단위 혹은 사용자 명시 지역)
    if (items.length === 0) {
      items = await fetchNaverPlaces(query, clientId, clientSecret);
    }

    // 3. 지도의 현재 중심 좌표가 전달되었을 경우, 해당 중심점과의 거리를 기준으로 필터링 및 정렬 수행
    const lat = latStr ? parseFloat(latStr) : null;
    const lng = lngStr ? parseFloat(lngStr) : null;
    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      // 거리 기반 필터링 (MAX_DIST_SQ: 유클리디안 거리 0.3의 제곱 = 약 30km 반경을 넘어서면 차단)
      const MAX_DIST_SQ = 0.3 * 0.3; 
      items = items.filter((item) => {
        const distSq = Math.pow(item.lat - lat, 2) + Math.pow(item.lng - lng, 2);
        return distSq <= MAX_DIST_SQ;
      });

      items.sort((a, b) => {
        const distA = Math.pow(a.lat - lat, 2) + Math.pow(a.lng - lng, 2);
        const distB = Math.pow(b.lat - lat, 2) + Math.pow(b.lng - lng, 2);
        return distA - distB;
      });
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error('[places] fetch error:', err);
    return NextResponse.json(
      { error: '네트워크 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
