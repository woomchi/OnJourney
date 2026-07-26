import { DirectionsWaypointsQueryType } from '../validations/directions';

export async function fetchDirectionsWaypoints(params: DirectionsWaypointsQueryType) {
  const { start, goal, waypoints, option } = params;

  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('서버에 네이버 API 인증 키 설정이 누락되었습니다.');
  }

  let naverApiUrl = `https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=${start}&goal=${goal}&option=${option}`;

  if (waypoints) {
    naverApiUrl += `&waypoints=${waypoints}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(naverApiUrl, {
      method: 'GET',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 },
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 보안: 외부 API 에러 상세 메시지는 서버 로그로만 남기고 클라이언트에는 일반적인 에러 메시지 반환
      console.error(`[directions-waypoints] Naver API Error: ${response.status} - ${errorText}`);
      throw new Error(`네이버 API 통신 중 오류가 발생했습니다. (Status: ${response.status})`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('네이버 API 호출 시간이 초과되었습니다.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
