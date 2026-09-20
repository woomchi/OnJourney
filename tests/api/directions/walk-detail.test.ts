import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/directions/walk-detail/route';

const mockFetchWalkDetailRoute = vi.fn();

vi.mock('@/lib/services/serverDirectionsService', () => ({
  fetchWalkDetailRoute: (...args: unknown[]) => mockFetchWalkDetailRoute(...args),
}));

describe('GET /api/directions/walk-detail 엔드포인트 검증', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('필수 좌표 파라미터 누락 시 400 Bad Request 에러를 반환한다', async () => {
    const req = new NextRequest('http://localhost:3000/api/directions/walk-detail?sx=126.97&sy=37.56');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('올바른 좌표 파라미터 요청 시 상세 도보 경로 데이터를 200 응답으로 반환한다', async () => {
    const mockDetail = {
      polyline: [{ lat: 37.56, lng: 126.97 }, { lat: 37.57, lng: 126.98 }],
      guide: [{ instructions: '직진', distance: 100, duration: 60000 }],
    };
    mockFetchWalkDetailRoute.mockResolvedValueOnce(mockDetail);

    const req = new NextRequest('http://localhost:3000/api/directions/walk-detail?sx=126.97&sy=37.56&ex=126.98&ey=37.57');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(mockDetail);
    expect(mockFetchWalkDetailRoute).toHaveBeenCalledWith(126.97, 37.56, 126.98, 37.57);
  });
});
