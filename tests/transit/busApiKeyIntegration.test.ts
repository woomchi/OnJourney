import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BusanBusService } from '@/lib/transit/BusanBusService';
import { IncheonBusService } from '@/lib/transit/IncheonBusService';
import { DaejeonBusService } from '@/lib/transit/DaejeonBusService';

describe('버스 실시간 API 키 통합 검증 (BUS_DATA_API_KEY)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.BUS_DATA_API_KEY;
    delete process.env.REAL_TIME_BUS_API_KEY;
    delete process.env.REAL_TIME_BUS_TAGO_API_KEY;
    delete process.env.REAL_TIME_BUS_GYEONGGI_API_KEY;
    delete process.env.REAL_TIME_BUS_BUSAN_API_KEY;
    delete process.env.REAL_TIME_BUS_INCHEON_API_KEY;
    delete process.env.REAL_TIME_BUS_DAEJEON_API_KEY;
    delete process.env.TAGO_API_KEY;
    delete process.env.GYEONGGI_BUS_API_KEY;
    delete process.env.BUSAN_BUS_API_KEY;
    delete process.env.DATA_GO_KR_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('키가 전혀 없을 때 각 서비스는 API 키 미설정 에러를 반환한다', async () => {
    const busan = await BusanBusService.getArrivalInfo('BSB12345', '부산역');
    expect(busan.errorMessage).toBe('부산 버스 API 키가 설정되지 않았습니다.');

    const incheon = await IncheonBusService.getArrivalInfo('ICB12345', '인천역');
    expect(incheon.errorMessage).toBe('인천 버스 API 키가 설정되지 않았습니다.');

    const daejeon = await DaejeonBusService.getArrivalInfo('DJB12345', '대전역');
    expect(daejeon.errorMessage).toBe('대전 버스 API 키가 설정되지 않았습니다.');
  });

  it('통합 키 BUS_DATA_API_KEY만 설정되어 있어도 부산/인천/대전 서비스가 키를 인식하여 진입한다', async () => {
    process.env.BUS_DATA_API_KEY = 'TEST_CONSOLIDATED_KEY';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('<response><header><resultCode>99</resultCode></header></response>', { status: 200 }))
    );

    const busan = await BusanBusService.getArrivalInfo('BSB12345', '부산역');
    expect(busan.errorMessage).not.toBe('부산 버스 API 키가 설정되지 않았습니다.');

    const incheon = await IncheonBusService.getArrivalInfo('ICB12345', '인천역');
    expect(incheon.errorMessage).not.toBe('인천 버스 API 키가 설정되지 않았습니다.');

    const daejeon = await DaejeonBusService.getArrivalInfo('DJB12345', '대전역');
    expect(daejeon.errorMessage).not.toBe('대전 버스 API 키가 설정되지 않았습니다.');

    fetchSpy.mockRestore();
  });

  it('레거시 개별 키만 설정되어 있는 경우에도 정상적으로 Fallback 인식한다', async () => {
    process.env.REAL_TIME_BUS_BUSAN_API_KEY = 'LEGACY_BUSAN_KEY';
    process.env.REAL_TIME_BUS_INCHEON_API_KEY = 'LEGACY_INCHEON_KEY';
    process.env.REAL_TIME_BUS_DAEJEON_API_KEY = 'LEGACY_DAEJEON_KEY';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('<response><header><resultCode>99</resultCode></header></response>', { status: 200 }))
    );

    const busan = await BusanBusService.getArrivalInfo('BSB12345', '부산역');
    expect(busan.errorMessage).not.toBe('부산 버스 API 키가 설정되지 않았습니다.');

    const incheon = await IncheonBusService.getArrivalInfo('ICB12345', '인천역');
    expect(incheon.errorMessage).not.toBe('인천 버스 API 키가 설정되지 않았습니다.');

    const daejeon = await DaejeonBusService.getArrivalInfo('DJB12345', '대전역');
    expect(daejeon.errorMessage).not.toBe('대전 버스 API 키가 설정되지 않았습니다.');

    fetchSpy.mockRestore();
  });
});
