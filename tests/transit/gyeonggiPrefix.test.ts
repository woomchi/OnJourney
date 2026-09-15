import { describe, it, expect } from 'vitest';
import { GYEONGGI_STATION_ID_PREFIXES } from '@/constants/transit';

describe('B-2 GYEONGGI_STATION_ID_PREFIXES and Gyeonggi ID detection', () => {
  it('GYEONGGI_STATION_ID_PREFIXES 상수가 올바르게 정의되어 있어야 한다', () => {
    expect(GYEONGGI_STATION_ID_PREFIXES).toEqual(['20', '21', '22', '23', '24']);
  });

  const isGyeonggiStationId = (stationId: string) => {
    const upperStationId = stationId.toUpperCase();
    const pureId = stationId.replace(/[^0-9]/g, '');

    return (
      upperStationId.startsWith('GGB') ||
      (pureId.length === 9 && GYEONGGI_STATION_ID_PREFIXES.some((prefix) => pureId.startsWith(prefix)))
    );
  };

  it('9자리 경기도 고유 정류소 ID를 정확히 경기도로 판별해야 한다', () => {
    // 22: 성남 판교역 등
    expect(isGyeonggiStationId('228000713')).toBe(true);
    // 20: 수원
    expect(isGyeonggiStationId('201000123')).toBe(true);
    // 21: 용인
    expect(isGyeonggiStationId('210000456')).toBe(true);
    // 23: 안양
    expect(isGyeonggiStationId('230000789')).toBe(true);
    // 24: 부천
    expect(isGyeonggiStationId('240000012')).toBe(true);
    // GGB 접두사
    expect(isGyeonggiStationId('GGB228000713')).toBe(true);
  });

  it('다른 시도의 ID나 자릿수가 다른 ID는 경기도로 오인 판별되지 않아야 한다', () => {
    // 서울 5자리 정류소 ID
    expect(isGyeonggiStationId('01123')).toBe(false);
    // 부산 BSB
    expect(isGyeonggiStationId('BSB12345')).toBe(false);
    // 8자리 ID
    expect(isGyeonggiStationId('22800071')).toBe(false);
    // 9자리이지만 다른 시도 코드 (예: 서울 11, 대전 25 등)
    expect(isGyeonggiStationId('250000123')).toBe(false);
    expect(isGyeonggiStationId('110000123')).toBe(false);
  });
});
