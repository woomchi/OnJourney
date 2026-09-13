import { describe, it, expect } from 'vitest';
import { KakaoTransitAdapter } from '@/lib/infrastructure/kakaoTransitAdapter';
import { parseKakaoTransitResponse } from '@/lib/services/directions/transit/kakaoTransitParser';
import * as fs from 'fs';

// .env.local 로드
const envContent = fs.readFileSync('c:/Users/hitsz/Desktop/OnJourney/.env.local', 'utf-8');
const match = envContent.match(/KAKAO_REST_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/);
if (match) {
  process.env.KAKAO_REST_API_KEY = match[1].trim();
}

describe('Kakao Transit Adapter + Parser E2E Pipeline', () => {
  it('동탄 CGV -> 기흥역 실제 API 응답을 DirectionResult[]로 완전 변환해야 한다', async () => {
    const sx = 127.069414;
    const sy = 37.205304;
    const ex = 127.115955;
    const ey = 37.275497;

    const rawData = await KakaoTransitAdapter.fetchPublicTraffic({
      startX: sx,
      startY: sy,
      endX: ex,
      endY: ey,
      sName: 'CGV 동탄',
      eName: '기흥역',
    });

    const parsedResults = parseKakaoTransitResponse(rawData, sx, sy, ex, ey);

    expect(parsedResults.length).toBeGreaterThan(0);

    const first = parsedResults[0];
    console.log('\n[E2E 검증] 변환된 1순위 경로:', {
      id: first.id,
      name: first.name,
      duration: `${first.duration}분`,
      distance: `${first.distance}km`,
      fare: `${first.fare}원`,
      tags: first.tags,
      stepCount: first.steps.length,
      totalPathPoints: first.pathPoints.length,
    });

    expect(first.type).toBe('public');
    expect(first.duration).toBeGreaterThan(0);
    expect(first.distance).toBeGreaterThan(0);
    expect(first.steps.length).toBeGreaterThan(0);
    expect(first.pathPoints.length).toBeGreaterThan(50); // 고정밀 Polyline 검증

    // 각 스텝의 타입과 좌표 형식 검증
    first.steps.forEach(step => {
      expect(['bus', 'subway', 'walk']).toContain(step.type);
      expect(step.duration).toBeGreaterThanOrEqual(0);
      step.pathPoints?.forEach(pt => {
        expect(typeof pt.lat).toBe('number');
        expect(typeof pt.lng).toBe('number');
        expect(pt.lat).toBeGreaterThan(30);
        expect(pt.lng).toBeGreaterThan(120);
      });
    });
  });
});
