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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

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
    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=8&sort=random`;

    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      // 동일 쿼리는 30초간 캐시 (API 정책 준수 - 장기보관 금지)
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[places] Naver API error:', res.status, text);
      return NextResponse.json(
        { error: '장소 검색에 실패했습니다.' },
        { status: res.status }
      );
    }

    const data = await res.json() as { items: NaverPlaceItem[] };

    // HTML 태그 제거 유틸
    const stripHtml = (str: string) => str.replace(/<[^>]+>/g, '');

    const items: PlaceResult[] = data.items.map((item, idx) => ({
      // 네이버 Local API는 고유 ID를 안 내려주므로 인덱스+좌표 조합으로 생성
      id: `${item.mapx}-${item.mapy}-${idx}`,
      place_name: stripHtml(item.title),
      address: item.roadAddress || item.address,
      category: item.category,
      // 네이버 Local API 좌표계: 카텍(KATEC) → WGS84 변환 필요
      // mapx, mapy는 1/10000000 스케일의 KATEC 좌표
      lat: parseInt(item.mapy) / 1e7,
      lng: parseInt(item.mapx) / 1e7,
    }));

    return NextResponse.json({ items });
  } catch (err) {
    console.error('[places] fetch error:', err);
    return NextResponse.json(
      { error: '네트워크 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
