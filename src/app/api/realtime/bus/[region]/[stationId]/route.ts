import { NextRequest, NextResponse } from 'next/server';
import { RealtimeTransitService } from '@/lib/transit/RealtimeTransitService';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ region: string; stationId: string }> | { region: string; stationId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const { region, stationId } = resolvedParams;

    const { searchParams } = new URL(request.url);
    const stationName = searchParams.get('stationName') || undefined;
    const cityCode = searchParams.get('cityCode') || undefined;
    const destination = searchParams.get('destination') || undefined;
    const headsign = searchParams.get('headsign') || undefined;
    const latParam = searchParams.get('lat') || searchParams.get('gpsLati');
    const lngParam = searchParams.get('lng') || searchParams.get('gpsLong');
    const lat = latParam ? parseFloat(latParam) : undefined;
    const lng = lngParam ? parseFloat(lngParam) : undefined;

    if (!stationId) {
      return NextResponse.json(
        {
          success: false,
          error: '정류소 ID(stationId)가 누락되었습니다.',
          timestamp: Date.now(),
        },
        { status: 400 }
      );
    }

    const realtimeData = await RealtimeTransitService.getBusArrivals({
      region: region || 'seoul',
      stationId,
      stationName,
      cityCode,
      destination,
      headsign,
      lat,
      lng,
    });

    return NextResponse.json({
      success: true,
      data: realtimeData,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('[API /api/realtime/bus] 서버 핸들링 에러:', error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || '실시간 버스 정보를 가져오지 못했습니다.',
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
