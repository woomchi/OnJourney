import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSubwayRealtime, getTrainNoVariations } from '@/lib/services/subwayRealtimeService';
import * as subwayPositionService from '@/lib/services/subwayPositionService';

vi.mock('@/lib/services/subwayPositionService', () => ({
  fetchSubwayPositionsByLine: vi.fn(),
  resolveSubwayNameForPositionApi: vi.fn((id: string) => id),
}));

function getKstDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  // UTC + 9시간 KST 계산
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  return `${kst.getFullYear()}-${pad(kst.getMonth() + 1)}-${pad(kst.getDate())} ${pad(kst.getHours())}:${pad(kst.getMinutes())}:${pad(kst.getSeconds())}`;
}

describe('subwayRealtimeService - fetchSubwayRealtime and train positions', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      REAL_TIME_SUBWAY_API_KEY: 'test-api-key',
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getTrainNoVariations', () => {
    it('열차 번호의 다양한 변형(앞자리 0 제거, 영문 접두사 제거, 4자리 패딩 등)을 반환해야 한다', () => {
      const vars = getTrainNoVariations('K0123');
      expect(vars).toContain('K0123');
      expect(vars).toContain('0123');
      expect(vars).toContain('123');
    });

    it('빈 값이면 빈 배열을 반환해야 한다', () => {
      expect(getTrainNoVariations(undefined)).toEqual([]);
      expect(getTrainNoVariations('')).toEqual([]);
    });
  });

  describe('fetchSubwayRealtime with position join', () => {
    const getMockSeoulApiResponse = () => ({
      errorMessage: {
        status: 200,
        code: 'INFO-000',
        message: '정상 처리되었습니다',
      },
      realtimeArrivalList: [
        {
          subwayId: '1002',
          updnLine: '내선',
          trainLineNm: '2호선 내선순환 (시청 방면)',
          btrainNo: '2024',
          statnNm: '강남',
          arvlMsg2: '3분 후 (역삼)',
          arvlCd: '99',
          barvlDt: '180',
          recptnDt: getKstDateString(),
        },
      ],
    });

    it('위치 API 성공 시 위치 정보와 정상 조인되어 도착 정보를 반환해야 한다', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => getMockSeoulApiResponse(),
      } as unknown as Response);

      vi.mocked(subwayPositionService.fetchSubwayPositionsByLine).mockResolvedValue([
        {
          subwayId: '1002',
          subwayNm: '2호선',
          statnId: '1002000222',
          statnNm: '역삼',
          trainNo: '2024',
          recptnDt: getKstDateString(),
          updnLine: '0',
          trainSttus: '1',
          directAt: '0',
          isExpress: false,
        },
      ]);

      const result = await fetchSubwayRealtime({
        station: '강남',
        subwayId: '1002',
      });

      expect(result).toHaveLength(1);
      expect(result[0].statnNm).toBe('강남');
      expect(result[0].trainNo).toBe('2024');
      expect(subwayPositionService.fetchSubwayPositionsByLine).toHaveBeenCalledWith('1002');
    });

    it('위치 API 실패 시 전체 조회가 중단되지 않고 console.warn 로깅 후 기본 도착 정보를 반환해야 한다 (Graceful Degradation)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => getMockSeoulApiResponse(),
      } as unknown as Response);

      const positionError = new Error('서울시 열차 위치 API 타임아웃');
      vi.mocked(subwayPositionService.fetchSubwayPositionsByLine).mockRejectedValue(positionError);

      const result = await fetchSubwayRealtime({
        station: '강남',
        subwayId: '1002',
      });

      // 1. 전체 도착 조회가 중단되지 않고 기본 도착 정보를 정상 반환
      expect(result).toHaveLength(1);
      expect(result[0].statnNm).toBe('강남');
      expect(result[0].trainNo).toBe('2024');

      // 2. 사일런트 무시되지 않고 console.warn 로깅이 정확히 발생했는지 확인
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[subwayRealtimeService] 실시간 열차 위치 조회 실패 (노선: 1002):'),
        positionError
      );

      warnSpy.mockRestore();
    });
  });
});
