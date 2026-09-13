import { describe, it, expect } from 'vitest';
import { KakaoTransitAdapter } from '@/lib/infrastructure/kakaoTransitAdapter';
import { AppError } from '@/lib/infrastructure/odsayAdapter';
import * as fs from 'fs';

// .env.local에서 KAKAO_REST_API_KEY 로드
const envContent = fs.readFileSync('c:/Users/hitsz/Desktop/OnJourney/.env.local', 'utf-8');
const match = envContent.match(/KAKAO_REST_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
if (match) {
  process.env.KAKAO_REST_API_KEY = match[1].trim();
}

describe('KakaoTransitAdapter Integration Tests', () => {
  it('동탄 CGV -> 기흥역 실제 경로 탐색이 성공해야 한다', async () => {
    const res = await KakaoTransitAdapter.fetchPublicTraffic({
      startX: 127.069414,
      startY: 37.205304,
      sName: 'CGV 동탄',
      endX: 127.115955,
      endY: 37.275497,
      eName: '기흥역',
    });

    expect(res.status).toBe('OK');
    expect(res.properties?.total).toBeGreaterThan(0);
    expect(res.routes && res.routes.length).toBeGreaterThan(0);

    const firstRoute = res.routes![0];
    expect(firstRoute.properties.totalDistance).toBeGreaterThan(1000);
    expect(firstRoute.properties.totalTime).toBeGreaterThan(60);
    expect(firstRoute.steps.length).toBeGreaterThan(0);

    // 첫 스텝에 좌표(points)가 들어있는지 확인
    const hasPathPoints = firstRoute.steps.some(s => s.path?.points && s.path.points.length > 0);
    expect(hasPathPoints).toBe(true);
  });

  it('수원역 -> 부산역 장거리 시외 경로는 NO_RESULTS로 안전 반환되어야 한다', async () => {
    const res = await KakaoTransitAdapter.fetchPublicTraffic({
      startX: 127.0001,
      startY: 37.2658,
      sName: '수원역',
      endX: 129.0415,
      endY: 35.1152,
      eName: '부산역',
    });

    expect(res.status).toBe('NO_RESULTS');
    expect(res.routes || []).toHaveLength(0);
  });

  it('동일 좌표 호출 시 EQUAL_POINTS에 의해 AppError를 던져야 한다', async () => {
    await expect(
      KakaoTransitAdapter.fetchPublicTraffic({
        startX: 127.069414,
        startY: 37.205304,
        endX: 127.069414,
        endY: 37.205304,
      })
    ).rejects.toThrow(AppError);
  });
});
