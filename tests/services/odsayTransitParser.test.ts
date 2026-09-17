import { describe, it, expect } from 'vitest';
import {
  parseOdsayIntercityResponse,
  getOdsayStepType,
} from '@/lib/services/directions/transit/odsayTransitParser';
import {
  parseTrainSchedule,
  parseBusSchedule,
  parseFirstLegFromPath,
} from '@/lib/services/directions/transit/odsayResponseParser';

describe('ODsay Transit & Schedule Parsers', () => {
  describe('odsayTransitParser', () => {
    it('이동수단 trafficType을 올바른 DirectionStep type으로 매핑해야 한다', () => {
      expect(getOdsayStepType(1)).toBe('subway');
      expect(getOdsayStepType(2)).toBe('bus');
      expect(getOdsayStepType(3)).toBe('walk');
      expect(getOdsayStepType(4)).toBe('train');
      expect(getOdsayStepType(5)).toBe('expressbus');
      expect(getOdsayStepType(6)).toBe('airplane');
    });

    it('육상 시외 searchPubTransPathT 응답(result.path)을 정상 파싱해야 한다', () => {
      const mockData = {
        result: {
          path: [
            {
              info: {
                totalTime: 120,
                totalDistance: 150000,
                payment: 25000,
              },
              subPath: [
                {
                  trafficType: 4,
                  sectionTime: 80,
                  distance: 140000,
                  startName: '서울역',
                  endName: '대전역',
                  lane: [{ name: 'KTX' }],
                },
                {
                  trafficType: 1,
                  sectionTime: 15,
                  distance: 5000,
                  startName: '대전역',
                  endName: '서대전네거리역',
                  lane: [{ name: '대전 1호선' }],
                },
              ],
            },
          ],
        },
      };

      const results = parseOdsayIntercityResponse(mockData, 126.97, 37.55, 127.40, 36.32);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('public');
      expect(results[0].isIntercity).toBe(true);
      expect(results[0].duration).toBe(120);
      expect(results[0].distance).toBe(150);
      expect(results[0].fare).toBe(25000);
      expect(results[0].steps).toHaveLength(2);
      expect(results[0].steps[0].type).toBe('train');
      expect(results[0].steps[0].trainClass).toBe('KTX');
    });

    it('도서/제주 지역 maasRP 응답(result.paths)도 정상 파싱해야 한다', () => {
      const mockMaasData = {
        result: {
          paths: [
            {
              info: {
                totalTime: 70,
                totalDistance: 450000,
                payment: 80000,
              },
              subPath: [
                {
                  trafficType: 6,
                  sectionTime: 60,
                  distance: 440000,
                  startName: '김포공항',
                  endName: '제주공항',
                  lane: [{ name: '대한항공' }],
                },
              ],
            },
          ],
        },
      };

      const results = parseOdsayIntercityResponse(mockMaasData, 126.80, 37.55, 126.49, 33.51);
      expect(results).toHaveLength(1);
      expect(results[0].name).toContain('항공');
      expect(results[0].steps[0].type).toBe('airplane');
      expect(results[0].fare).toBe(80000);
    });

    it('비정상 응답이거나 빈 경로일 경우 빈 배열을 안전하게 반환해야 한다', () => {
      expect(parseOdsayIntercityResponse(null, 0, 0, 0, 0)).toEqual([]);
      expect(parseOdsayIntercityResponse({}, 0, 0, 0, 0)).toEqual([]);
      expect(parseOdsayIntercityResponse({ result: {} }, 0, 0, 0, 0)).toEqual([]);
    });
  });

  describe('odsayResponseParser (Schedule & FirstLeg)', () => {
    it('열차 시간표 응답을 안전하게 파싱해야 한다', () => {
      const mockTrainData = {
        result: {
          station: [
            {
              trainClass: 'KTX',
              trainNo: 101,
              departureTime: '0600',
              arrivalTime: '0815',
              wasteTime: '2시간 15분',
              fare: { general: 59800, special: 83700 },
            },
          ],
        },
      };

      const parsed = parseTrainSchedule(mockTrainData);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].trainNumber).toBe('KTX 101');
      expect(parsed[0].departureTime).toBe('06:00');
      expect(parsed[0].arrivalTime).toBe('08:15');
      expect(parsed[0].fare.general).toBe(59800);
    });

    it('버스 시간표 응답을 안전하게 파싱해야 한다', () => {
      const mockBusData = {
        result: {
          station: [
            {
              startTerminal: '서울고속버스터미널',
              destTerminal: '부산종합버스터미널',
              wasteTime: '4시간',
              normalFare: 26800,
              specialFare: 39000,
              schedule: '06:00, 07:00, 08:00',
            },
          ],
        },
      };

      const parsed = parseBusSchedule(mockBusData);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].busTypeLabel).toBe('고속버스');
      expect(parsed[0].normalFare).toBe(26800);
      expect(parsed[0].specialFare).toBe(39000);
    });

    it('첫 번째 Leg(접속 이동수단)을 올바르게 파싱해야 한다', () => {
      const mockPathData = {
        result: {
          path: [
            {
              subPath: [
                {
                  trafficType: 1,
                  sectionTime: 12,
                  distance: 3500,
                  lane: [{ name: '4호선' }],
                  stationCount: 5,
                },
              ],
            },
          ],
        },
      };

      const firstLeg = parseFirstLegFromPath(mockPathData);
      expect(firstLeg).not.toBeNull();
      expect(firstLeg?.type).toBe('subway');
      expect(firstLeg?.lineName).toBe('4호선');
      expect(firstLeg?.stationCount).toBe(5);
      expect(firstLeg?.duration).toBe(12);
    });
  });
});
