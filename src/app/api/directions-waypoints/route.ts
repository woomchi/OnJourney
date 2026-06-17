import { NextRequest, NextResponse } from 'next/server';

/**
 * 네이버 Direction 5 API Proxy 핸들러
 * 클라이언트의 요청을 받아 네이버 API 서버에 인증 헤더를 추가하여 재요청합니다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');         // 형식: "lng,lat"
  const goal = searchParams.get('goal');           // 형식: "lng,lat"
  const waypoints = searchParams.get('waypoints'); // 형식: "lng,lat|lng,lat"
  const option = searchParams.get('option') || 'traoptimal';

  if (!start || !goal) {
    return NextResponse.json(
      { error: '출발지(start)와 목적지(goal) 좌표가 필요합니다.' },
      { status: 400 }
    );
  }

  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[directions-waypoints] Naver API Credentials are missing.');
    return NextResponse.json(
      { error: '서버에 네이버 API 인증 키 설정이 누락되었습니다.' },
      { status: 500 }
    );
  }

  try {
    let naverApiUrl = `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${start}&goal=${goal}&option=${option}`;

    if (waypoints) {
      naverApiUrl += `&waypoints=${waypoints}`;
    }

    const response = await fetch(naverApiUrl, {
      method: 'GET',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Naver API responded with status ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[directions-waypoints] Proxy Error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류로 경로 정보를 조회할 수 없습니다.', message: error.message },
      { status: 500 }
    );
  }
}
