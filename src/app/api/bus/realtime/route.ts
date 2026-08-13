import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: '구형 버스 실시간 API 엔드포인트는 통폐합되었습니다. /api/realtime/bus/[region]/[stationId] 엔드포인트를 사용해 주세요.',
    },
    { status: 410 }
  );
}
