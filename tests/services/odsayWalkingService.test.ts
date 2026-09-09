import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseOdsayWalkingResponse,
  fetchOdsayWalkingRoute,
} from '@/lib/services/directions/walk/odsayWalkingService';

describe('odsayWalkingService - maasRP 도보 경로 파싱 및 서비스 검증', () => {
  const sx = 126.9725;
  const sy = 37.5559;
  const ex = 126.9778;
  const ey = 37.5663;

  it('maasRP 응답(routes의 crossXYInfos 및 xyInfos, guides)을 정밀 도보 경로로 올바르게 파싱한다', () => {
    const mockMaasRPResponse = {
      result: {
        paths: [
          {
            pathType: 1,
            pathSubType: 0,
            totalDistance: 1300,
            totalTime: 20,
            rps: [
              {
                trafficType: 3,
                distance: 1300,
                duration: 20,
                routes: [
                  {
                    rseq: 1,
                    crossXYInfos: [
                      { x: '126.9725', y: '37.5559' },
                      { x: '126.9730', y: '37.5565' },
                    ],
                    xyInfos: [
                      { x: '126.9730', y: '37.5565' }, // 중복 좌표
                      { x: '126.9740', y: '37.5580' },
                    ],
                  },
                  {
                    rseq: 2,
                    xyInfos: [
                      { x: '126.9750', y: '37.5600' },
                      { x: '126.9778', y: '37.5663' },
                    ],
                  },
                ],
                guides: [
                  {
                    gseq: 1,
                    GUIDANCE: '직진으로 100m 이동',
                    LENGTH: 100,
                    DURATION: 80,
                  },
                  {
                    gseq: 2,
                    GUIDANCE: '횡단보도 건너기',
                    LENGTH: 30,
                    DURATION: 25,
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const results = parseOdsayWalkingResponse(mockMaasRPResponse, sx, sy, ex, ey);

    expect(results).toHaveLength(3); // walk, bicycle, kickboard

    const walkResult = results.find((r) => r.id === 'walk')!;
    expect(walkResult).toBeDefined();
    expect(walkResult.type).toBe('walk');
    expect(walkResult.duration).toBe(20);
    expect(walkResult.distance).toBeCloseTo(1.3, 1);
    expect(walkResult.pathPoints.length).toBeGreaterThanOrEqual(4);

    // 중복 제거 검증: (126.9730, 37.5565) 좌표는 연속 중복 없이 1번만 포함되어야 함
    const duplicatePoints = walkResult.pathPoints.filter(
      (pt) => Math.abs(pt.lng - 126.973) < 1e-4 && Math.abs(pt.lat - 37.5565) < 1e-4
    );
    expect(duplicatePoints).toHaveLength(1);

    // 턴바이턴 가이드 노드 검증
    expect(walkResult.guide).toBeDefined();
    expect(walkResult.guide).toHaveLength(2);
    expect(walkResult.guide![0].instructions).toBe('직진으로 100m 이동');
    expect(walkResult.guide![0].distance).toBe(100);
    expect(walkResult.guide![0].duration).toBe(80000); // 80초 * 1000ms
    expect(walkResult.guide![1].instructions).toBe('횡단보도 건너기');

    // 자전거 및 킥보드 파생 검증
    const bicycleResult = results.find((r) => r.id === 'bicycle')!;
    expect(bicycleResult).toBeDefined();
    expect(bicycleResult.distance).toBeCloseTo(1.3, 1);
    expect(bicycleResult.pathPoints).toEqual(walkResult.pathPoints);

    const kickboardResult = results.find((r) => r.id === 'kickboard')!;
    expect(kickboardResult).toBeDefined();
    expect(kickboardResult.fare).toBeGreaterThan(1000);
  });

  it('응답 데이터가 null이거나 빈 paths인 경우 직선거리 Fallback을 반환한다', () => {
    const results = parseOdsayWalkingResponse(null, sx, sy, ex, ey);

    expect(results).toHaveLength(3);
    const walkResult = results.find((r) => r.id === 'walk')!;
    expect(walkResult.pathPoints).toEqual([
      { lat: sy, lng: sx },
      { lat: ey, lng: ex },
    ]);
  });

  it('ODSAY_API_KEY가 없으면 안전하게 Fallback 결과를 반환한다', async () => {
    const originalKey = process.env.ODSAY_API_KEY;
    delete process.env.ODSAY_API_KEY;

    try {
      const results = await fetchOdsayWalkingRoute(sx, sy, ex, ey);
      expect(results).toHaveLength(3);
      const walk = results.find((r) => r.id === 'walk')!;
      expect(walk.pathPoints).toHaveLength(2); // 직선 Fallback
    } finally {
      process.env.ODSAY_API_KEY = originalKey;
    }
  });
});
