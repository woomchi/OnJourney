import { describe, it, expect } from 'vitest';
import { parseKakaoTransitResponse, getKakaoBusColor } from '@/lib/services/directions/transit/kakaoTransitParser';
import type { KakaoPublicTrafficResponse } from '@/types/kakaoTransit';
import { BUS_COLORS } from '@/constants/colors';

describe('kakaoTransitParser', () => {
  describe('getKakaoBusColor', () => {
    it('광역/직행 버스는 RED 색상을 반환해야 한다', () => {
      expect(getKakaoBusColor('직행좌석', '7200')).toBe(BUS_COLORS.RED);
      expect(getKakaoBusColor('광역', '9401')).toBe(BUS_COLORS.RED);
      expect(getKakaoBusColor('일반', 'M4403')).toBe(BUS_COLORS.RED);
    });

    it('마을/지선 버스는 GREEN 색상을 반환해야 한다', () => {
      expect(getKakaoBusColor('마을', '17-1')).toBe(BUS_COLORS.GREEN);
      expect(getKakaoBusColor('지선', '7016')).toBe(BUS_COLORS.GREEN);
    });

    it('간선/일반 버스는 BLUE 색상을 반환해야 한다', () => {
      expect(getKakaoBusColor('간선', '400')).toBe(BUS_COLORS.BLUE);
      expect(getKakaoBusColor('일반', '62-1')).toBe(BUS_COLORS.BLUE);
    });
  });

  describe('parseKakaoTransitResponse', () => {
    const mockKakaoData: KakaoPublicTrafficResponse = {
      status: 'OK',
      properties: {
        total: 1,
        bus: 0,
        subway: 0,
        busAndSubway: 1,
        landingURL: 'https://map.kakao.com/...',
      },
      routes: [
        {
          properties: {
            type: 'BUS_AND_SUBWAY',
            totalDistance: 14000,
            totalTime: 2900,
            transfers: 1,
            fare: { value: 1750 },
          },
          steps: [
            {
              properties: {
                type: 'BUS',
                guidance: '일반 62-1 (한빛마을 > 망포역)',
                distance: 6000,
                time: 1800,
                stops: [{ name: '한빛마을' }, { name: '망포역' }],
                vehicles: [
                  { name: '62-1', type: '일반' },
                  { name: '13-5', type: '일반' },
                ],
              },
              path: {
                points: [
                  [127.07, 37.20],
                  [127.06, 37.22],
                  [127.05, 37.24],
                ],
              },
            },
            {
              properties: {
                type: 'WALKING',
                guidance: '망포역 4번 출구로 이동',
                distance: 200,
                time: 250,
              },
              path: {
                points: [
                  [127.05, 37.24],
                  [127.051, 37.241],
                ],
              },
            },
            {
              properties: {
                type: 'SUBWAY',
                guidance: '수인분당선 (망포 > 기흥)',
                distance: 7400,
                time: 500,
                stops: [{ name: '망포' }, { name: '기흥' }],
                vehicles: [{ name: '수인분당선', type: '급행' }],
              },
              path: {
                points: [
                  [127.051, 37.241],
                  [127.115, 37.275],
                ],
              },
            },
          ],
        },
      ],
    };

    it('카카오 대중교통 응답을 OnJourney DirectionResult[]로 정상 변환해야 한다', () => {
      const sx = 127.0694;
      const sy = 37.2053;
      const ex = 127.1159;
      const ey = 37.2754;

      const results = parseKakaoTransitResponse(mockKakaoData, sx, sy, ex, ey);

      expect(results).toHaveLength(1);
      const r = results[0];

      expect(r.id).toBe('kakao-transit-0');
      expect(r.type).toBe('public');
      expect(r.name).toContain('62-1');
      expect(r.name).toContain('수인분당선');
      expect(r.duration).toBe(48); // 2900초 -> 48분
      expect(r.distance).toBe(14); // 14000m -> 14.0km
      expect(r.fare).toBe(1750);
      expect(r.tags).toContain('최적');
      expect(r.tags).toContain('환승 1회');

      // 세부 스텝 검증
      expect(r.steps.length).toBeGreaterThanOrEqual(3);
      
      const busStep = r.steps.find((s) => s.type === 'bus');
      expect(busStep).toBeDefined();
      expect(busStep?.name).toBe('62-1');
      expect(busStep?.stationCount).toBe(2);
      expect(busStep?.subPathOptions).toHaveLength(2); // 62-1, 13-5
      expect(busStep?.pathPoints).toHaveLength(3);

      const subwayStep = r.steps.find((s) => s.type === 'subway');
      expect(subwayStep).toBeDefined();
      expect(subwayStep?.name).toBe('수인분당선');

      const walkStep = r.steps.find((s) => s.type === 'walk');
      expect(walkStep).toBeDefined();

      // 전체 궤적(pathPoints) 통합 확인
      expect(r.pathPoints.length).toBeGreaterThanOrEqual(3 + 2 + 2);
    });

    it('status가 NO_RESULTS인 경우 빈 배열을 반환해야 한다', () => {
      const emptyData: KakaoPublicTrafficResponse = {
        status: 'NO_RESULTS',
        routes: [],
      };

      const results = parseKakaoTransitResponse(emptyData, 127.0, 37.0, 129.0, 35.0);
      expect(results).toEqual([]);
    });
  });
});
