import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/directions/public/route';

const mockFetchPublicDirections = vi.fn();

vi.mock('@/lib/services/serverDirectionsService', () => ({
  fetchPublicDirections: (...args: unknown[]) => mockFetchPublicDirections(...args),
}));

describe('GET /api/directions/public 엔드포인트 검증', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('필수 파라미터가 누락된 경우 400 Bad Request 에러를 반환한다', async () => {
    // sx, sy만 있고 ex, ey 누락
    const req = new NextRequest('http://localhost:3000/api/directions/public?sx=127.0&sy=37.5');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('좌표 범위를 벗어난 경우 400 Bad Request 에러를 반환한다', async () => {
    // 위도가 90 초과
    const req = new NextRequest('http://localhost:3000/api/directions/public?sx=127.0&sy=95.5&ex=127.1&ey=37.5');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('올바른 좌표 파라미터 요청 시 대중교통 경로 데이터를 200 응답으로 반환한다', async () => {
    const mockRoutes = [
      {
        pathType: 1,
        totalTime: 35,
        totalDistance: 12000,
      },
    ];
    mockFetchPublicDirections.mockResolvedValueOnce(mockRoutes);

    const req = new NextRequest('http://localhost:3000/api/directions/public?sx=126.9780&sy=37.5665&ex=127.0276&ey=37.4979');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.public).toEqual(mockRoutes);
    expect(mockFetchPublicDirections).toHaveBeenCalledWith({
      sx: 126.978,
      sy: 37.5665,
      ex: 127.0276,
      ey: 37.4979,
    });
  });
});
