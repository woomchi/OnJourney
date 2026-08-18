/**
 * @fileoverview 서울시 지하철 실시간 열차 위치 서비스 (subwayPositionService)
 *
 * REAL_TIME_SUBWAY_LOCATION_API_KEY를 사용하여
 * 서울 지하철 노선별 실시간 운행 열차의 위치와 상태(진입, 도착, 출발)를 조회하고
 * 15초 동안 인메모리에 캐싱하여 실시간 도착 정보(ETA) 보정 및 노선도 뷰에 제공합니다.
 */

import { SubwayPosition } from '@/types/journey';
import { resolveSubwayNameForApi } from '@/lib/constants/subwayLineMap';
import { fetchCachedPositionsByLine } from '@/lib/infrastructure/subwayCacheService';

// ─── 노선명 정규화 헬퍼 ───────────────────────────────────────────────────────

/**
 * subwayId 또는 노선명을 서울시 realtimePosition API가 요구하는 subwayNm으로 변환합니다.
 * (subwayLineMap으로 위임)
 */
export function resolveSubwayNameForPositionApi(subwayIdOrName: string): string {
  return resolveSubwayNameForApi(subwayIdOrName);
}

function getSubwayLocationApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  const rawKey =
    env.REAL_TIME_SUBWAY_LOCATION_API_KEY ||
    env.REAL_TIME_SUBWAY_API_KEY ||
    '';
  return rawKey.trim().replace(/^["']|["']$/g, '');
}

// ─── 공개 API 함수 ───────────────────────────────────────────────────────────

/**
 * 특정 노선(예: '2호선', '1002')의 모든 실시간 열차 위치를 조회하거나 Next.js 캐시를 반환합니다.
 */
export async function fetchSubwayPositionsByLine(
  subwayIdOrName: string
): Promise<SubwayPosition[]> {
  const subwayNm = resolveSubwayNameForPositionApi(subwayIdOrName);
  if (!subwayNm) return [];

  const apiKey = getSubwayLocationApiKey();
  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    return [];
  }

  return fetchCachedPositionsByLine(apiKey, subwayNm);
}

/**
 * 특정 열차번호(trainNo)의 현재 위치 정보를 조회합니다.
 */
export async function getTrainPositionByTrainNo(
  subwayIdOrName: string,
  trainNo: string
): Promise<SubwayPosition | null> {
  if (!trainNo) return null;
  const positions = await fetchSubwayPositionsByLine(subwayIdOrName);
  const cleanTrainNo = String(trainNo).trim();
  const matched = positions.find((p) => p.trainNo === cleanTrainNo || p.trainNo.endsWith(cleanTrainNo));
  return matched || null;
}
