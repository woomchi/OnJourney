/**
 * @fileoverview 지하철 역간 거리 DB 로드, O(1) Prefix Sum 인덱스, 노선별 역간 소요 시간 및 분기선 검증 모듈
 */

import fs from 'fs';
import path from 'path';
import type {
  StationDistanceDb,
  StationDistanceRow,
  LineDistanceIndex,
  StationIndexedInfo,
  SubwayIndexedStation,
} from './types';
import type { SubwayLineBranch } from '@/types/journey';
import { normalizeStationName, parseMinSecToSeconds, extractTrainMetadata } from './trainMetadata';
import { getLineBranchesAndStations } from '@/lib/data/subwayBranches';
import {
  resolveCandidateLineCodes as resolveCandidateCodesFromMap,
  resolveWayCode,
} from '@/lib/constants/subwayLineMap';

// ─── 파일 경로 상수 ──────────────────────────────────────────────────────────
const STATION_DISTANCE_UNIFIED_FILENAME = '지하철_통합_역간거리.json';
const STATION_DISTANCE_FALLBACK_FILENAME = '서울교통공사_역간거리.json';

const STATION_DISTANCE_UNIFIED_FILEPATH = path.join(process.cwd(), 'data', STATION_DISTANCE_UNIFIED_FILENAME);
const STATION_DISTANCE_FALLBACK_FILEPATH = path.join(process.cwd(), 'data', STATION_DISTANCE_FALLBACK_FILENAME);

/** 코레일 등 barvlDt 없는 노선의 기본 Fallback 소요 시간 (초/역) */
const FALLBACK_SECONDS_PER_STATION = 120;

// ─── 분기선 노선 정의 ────────────────────────────────────────────────────────
const LINE_1_MAIN_AXIS = [
  '신창', '온양온천', '배방', '탕정', '아산', '쌍용', '봉명', '천안', '두정', '직산', '성환', '평택', '평택지제', '서정리', '송탄', '진위', '오산', '오산대', '세마', '병점', '세류', '수원', '화서', '성균관대', '의왕', '당정', '군포', '금정', '명학', '안양', '관악', '석수', '금천구청', '독산', '가산디지털단지', '구로', '신도림', '영등포', '신길', '대방', '노량진', '용산', '남영', '서울역', '시청', '종각', '종로3가', '종로5가', '동대문', '동묘앞', '신설동', '제기동', '청량리', '회기', '외대앞', '신이문', '석계', '광운대', '월계', '녹천', '창동', '방학', '도봉', '도봉산', '망월사', '회룡', '의정부', '가능', '녹양', '양주', '덕계', '덕정', '지행', '보산', '동두천', '소요산'
];

const line1AxisMap = new Map<string, number>(
  LINE_1_MAIN_AXIS.map((name, idx) => [name, idx])
);

const GYEONGIN_STATIONS = new Set([
  '구일', '개봉', '오류동', '온수', '역곡', '부천', '중동', '송내', '부개', '부평', '백운', '동암', '간석', '주안', '제물포', '도화', '도원', '동인천', '인천'
]);

const GYEONGBU_SOUTH_STATIONS = new Set([
  '가산디지털단지', '독산', '금천구청', '석수', '관악', '안양', '명학', '금정', '군포', '당정', '의왕', '성균관대', '화서', '수원', '세류', '병점', '세마', '오산대', '오산', '진위', '송탄', '서정리', '평택지제', '평택', '성환', '직산', '두정', '천안', '봉명', '쌍용', '아산', '탕정', '배방', '온양온천', '신창'
]);

const HANAM_STATIONS = new Set([
  '상일동', '강일', '미사', '하남풍산', '하남시청', '하남검단산'
]);

const MACHEON_STATIONS = new Set([
  '둔촌동', '올림픽공원', '방이', '오금', '개롱', '거여', '마천'
]);

// ─── 메모리 캐시 ─────────────────────────────────────────────────────────────
let stationDistanceDb: StationDistanceDb | null = null;
let lineDistanceIndexMap: Map<string, LineDistanceIndex> | null = null;

/**
 * 역간 거리 DB에서 노선별 O(1) 누적합(Prefix Sum) 및 해시맵 인덱스를 빌드합니다.
 */
function buildStationDistanceIndex(db: StationDistanceDb): Map<string, LineDistanceIndex> {
  const indexMap = new Map<string, LineDistanceIndex>();
  if (!db?.DATA || !Array.isArray(db.DATA)) return indexMap;

  // 1. 노선별 그룹화
  const groupedByLine = new Map<string, StationDistanceRow[]>();
  for (const row of db.DATA) {
    const lineCode = String(row.sbwy_rout_ln || '').trim();
    if (!lineCode) continue;

    let rows = groupedByLine.get(lineCode);
    if (!rows) {
      rows = [];
      groupedByLine.set(lineCode, rows);
    }
    rows.push(row);
  }

  // 2. 각 노선별로 누적합(Prefix Sum) 및 StationIndexedInfo 생성
  for (const [lineCode, rows] of groupedByLine.entries()) {
    const stationMap = new Map<string, StationIndexedInfo>();
    const stations: StationIndexedInfo[] = [];
    let runningCumulativeSec = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cleanName = normalizeStationName(String(row.sbwy_stns_nm || ''));
      const hmSec = parseMinSecToSeconds(String(row.hm || ''));
      runningCumulativeSec += hmSec;

      const info: StationIndexedInfo = {
        index: i,
        stationName: cleanName,
        hmSeconds: hmSec,
        cumulativeSeconds: runningCumulativeSec,
        distKm: typeof row.dist_km === 'number' ? row.dist_km : undefined,
        acmlDist: typeof row.acml_dist === 'number' ? row.acml_dist : undefined,
      };

      stations.push(info);
      if (cleanName && !stationMap.has(cleanName)) {
        stationMap.set(cleanName, info);
      }
    }

    indexMap.set(lineCode, {
      lineCode,
      stationMap,
      stations,
      totalSeconds: runningCumulativeSec,
    });
  }

  return indexMap;
}

/**
 * 역간 거리 DB를 로드하고 O(1) 인덱스를 초기화합니다.
 */
function getStationDistanceDb(): StationDistanceDb | null {
  if (stationDistanceDb && lineDistanceIndexMap) return stationDistanceDb;

  try {
    const targetPath = fs.existsSync(STATION_DISTANCE_UNIFIED_FILEPATH)
      ? STATION_DISTANCE_UNIFIED_FILEPATH
      : fs.existsSync(STATION_DISTANCE_FALLBACK_FILEPATH)
      ? STATION_DISTANCE_FALLBACK_FILEPATH
      : null;

    if (!targetPath) return null;
    const fileContent = fs.readFileSync(targetPath, 'utf-8');
    stationDistanceDb = JSON.parse(fileContent) as StationDistanceDb;
    lineDistanceIndexMap = buildStationDistanceIndex(stationDistanceDb);
    return stationDistanceDb;
  } catch (e) {
    console.error('[subwayService] 역간 거리 JSON 로드 실패:', e);
    return null;
  }
}

/**
 * 노선 인덱스 맵을 반환합니다 (필요 시 자동 초기화).
 */
export function getLineDistanceIndexMap(): Map<string, LineDistanceIndex> | null {
  if (!lineDistanceIndexMap) {
    getStationDistanceDb();
  }
  return lineDistanceIndexMap;
}

/**
 * 특정 노선의 운행 계통 목록과 정차역 목록을 반환합니다 (노선도 뷰용).
 */
export function getLineStationListWithBranches(
  subwayIdOrName: string,
  branchId?: string,
  currentStationName?: string
): {
  branches: SubwayLineBranch[];
  selectedBranchId: string;
  stations: SubwayIndexedStation[];
} {
  // 1. 사전 정의된 운행 계통 데이터 우선 확인 (1호선, 2호선, 5호선 등)
  const branchResult = getLineBranchesAndStations(subwayIdOrName, branchId, currentStationName);
  if (branchResult.stations && branchResult.stations.length > 0) {
    return {
      branches: branchResult.branches,
      selectedBranchId: branchResult.selectedBranchId,
      stations: branchResult.stations.map((st) => ({
        index: st.index,
        stationName: st.stationName,
        hmSeconds: 120,
        cumulativeSeconds: (st.index + 1) * 120,
        distKm: 1.5,
      })),
    };
  }

  // 2. 단일 계통 노선은 기존 역간거리 DB 인덱스 맵 활용
  const defaultStations = getLineStationList(subwayIdOrName);
  return {
    branches: [],
    selectedBranchId: '',
    stations: defaultStations,
  };
}

/**
 * 특정 노선의 전체 정차역 순서 목록을 반환합니다 (노선도 뷰용).
 */
export function getLineStationList(subwayIdOrName: string): SubwayIndexedStation[] {
  const indexMap = getLineDistanceIndexMap();
  if (!indexMap) return [];

  const candidateCodes = resolveCandidateLineCodes(subwayIdOrName);
  for (const code of candidateCodes) {
    const lineIndex = indexMap.get(code);
    if (lineIndex && lineIndex.stations.length > 0) {
      return lineIndex.stations.map((st) => ({
        index: st.index,
        stationName: st.stationName,
        hmSeconds: st.hmSeconds,
        cumulativeSeconds: st.cumulativeSeconds,
        distKm: st.distKm,
      }));
    }
  }

  return [];
}

/**
 * subwayId 또는 노선명을 바탕으로 매칭 가능한 노선 코드/이름 목록을 반환합니다.
 */
export function resolveCandidateLineCodes(subwayId: string): string[] {
  return resolveCandidateCodesFromMap(subwayId);
}

/**
 * O(1) Prefix Sum을 활용하여 두 역 사이의 이동 소요 시간(초)을 계산합니다.
 */
export function calculateTimeBetweenStations(
  currentStation: string,
  targetStation: string,
  subwayIdOrName: string,
  updnLine?: string
): number | null {
  const cleanCur = normalizeStationName(currentStation);
  const cleanTgt = normalizeStationName(targetStation);

  if (cleanCur === cleanTgt) return 0;

  const indexMap = getLineDistanceIndexMap();
  if (!indexMap) return null;

  const candidateCodes = resolveCandidateLineCodes(subwayIdOrName);
  let fallbackDistanceSeconds: number | null = null;

  for (const code of candidateCodes) {
    const lineIndex = indexMap.get(code);
    if (!lineIndex) continue;

    const curInfo = lineIndex.stationMap.get(cleanCur);
    const tgtInfo = lineIndex.stationMap.get(cleanTgt);

    if (curInfo && tgtInfo) {
      const currentIdx = curInfo.index;
      const targetIdx = tgtInfo.index;

      // 2호선 순환선 특수 처리 (내선/외선 순환)
      if (code === '2' || code === '1002' || code === '2호선') {
        const totalSec = lineIndex.totalSeconds;
        const wayCode = updnLine ? resolveWayCode(updnLine) : null;

        let forwardSec = 0;
        if (targetIdx >= currentIdx) {
          forwardSec = tgtInfo.cumulativeSeconds - curInfo.cumulativeSeconds;
        } else {
          forwardSec = (totalSec - curInfo.cumulativeSeconds) + tgtInfo.cumulativeSeconds;
        }

        let backwardSec = totalSec - forwardSec;

        if (wayCode === '1') {
          return Math.max(60, forwardSec);
        } else if (wayCode === '2') {
          return Math.max(60, backwardSec);
        } else {
          return Math.max(60, Math.min(forwardSec, backwardSec));
        }
      }

      // 일반 노선 (1~9호선, 국철 등)
      const diffSec = Math.abs(tgtInfo.cumulativeSeconds - curInfo.cumulativeSeconds);
      fallbackDistanceSeconds = diffSec;

      if (updnLine) {
        const wayCode = resolveWayCode(updnLine);
        const isForwardForDirection =
          (wayCode === '1' && currentIdx > targetIdx) ||
          (wayCode === '2' && currentIdx < targetIdx);

        if (isForwardForDirection) {
          return diffSec;
        }
      } else {
        return diffSec;
      }
    }
  }

  return fallbackDistanceSeconds;
}

/**
 * 탑승역, 목표역, 열차 종착역 간의 분기선 불일치(Mismatch) 여부를 판별합니다.
 */
function checkBranchMismatch(cleanStart: string, cleanTarget: string, trainDest: string): boolean {
  // 1. 1호선 구로 이남 분기 (경인선 vs 경부선)
  const isTargetGyeongin = GYEONGIN_STATIONS.has(cleanTarget);
  const isTargetGyeongbu = GYEONGBU_SOUTH_STATIONS.has(cleanTarget);

  if (isTargetGyeongin || isTargetGyeongbu) {
    const isDestGyeongin = GYEONGIN_STATIONS.has(trainDest) || trainDest === '인천' || trainDest === '동인천' || trainDest === '부천';
    const isDestGyeongbu = GYEONGBU_SOUTH_STATIONS.has(trainDest) || trainDest === '천안' || trainDest === '신창' || trainDest === '병점' || trainDest === '수원' || trainDest === '서동탄' || trainDest === '광명';

    if (isTargetGyeongin && isDestGyeongbu && !isDestGyeongin) {
      return true;
    }
    if (isTargetGyeongbu && isDestGyeongin && !isDestGyeongbu) {
      return true;
    }
  }

  // 2. 5호선 강동 이남 분기 (하남선 vs 마천선)
  const isTargetHanam = HANAM_STATIONS.has(cleanTarget);
  const isTargetMacheon = MACHEON_STATIONS.has(cleanTarget);

  if (isTargetHanam || isTargetMacheon) {
    const isDestHanam = HANAM_STATIONS.has(trainDest) || trainDest === '상일동' || trainDest === '하남검단산';
    const isDestMacheon = MACHEON_STATIONS.has(trainDest) || trainDest === '마천';

    if (isTargetHanam && isDestMacheon && !isDestHanam) return true;
    if (isTargetMacheon && isDestHanam && !isDestMacheon) return true;
  }

  // 3. 1호선 서동탄 지선 / 광명 지선 Mismatch
  if (trainDest === '서동탄' && (cleanTarget === '오산' || cleanTarget === '평택' || cleanTarget === '천안' || cleanTarget === '신창')) {
    return true;
  }

  if (trainDest === '광명' && cleanTarget !== '광명' && GYEONGBU_SOUTH_STATIONS.has(cleanTarget) && cleanTarget !== '금천구청') {
    return true;
  }

  return false;
}

/**
 * 특정 탑승역(startStation)에서 하차역(destinationStation)으로 갈 때,
 * 해당 실시간 열차가 하차역에 도달할 수 있는지 검증합니다.
 */
export function isStationReachableOnLine(
  subwayId: string | undefined,
  startStation: string,
  destinationStation: string | undefined,
  trainLineNm: string | undefined,
  updnLine?: string
): boolean {
  if (!destinationStation) return true;

  const cleanStart = normalizeStationName(startStation);
  const cleanTarget = normalizeStationName(destinationStation);

  if (!cleanTarget || cleanTarget === cleanStart) return true;

  const { destination: trainDest } = extractTrainMetadata(trainLineNm);
  if (!trainDest) return true;

  if (trainDest === cleanTarget) return true;

  if (checkBranchMismatch(cleanStart, cleanTarget, trainDest)) {
    return false;
  }

  const startLine1Idx = line1AxisMap.get(cleanStart);
  const targetLine1Idx = line1AxisMap.get(cleanTarget);
  const destLine1Idx = line1AxisMap.get(trainDest);

  if (startLine1Idx !== undefined && targetLine1Idx !== undefined && destLine1Idx !== undefined) {
    if (startLine1Idx < destLine1Idx && startLine1Idx < targetLine1Idx && targetLine1Idx <= destLine1Idx) {
      return true;
    }
    if (startLine1Idx > destLine1Idx && startLine1Idx > targetLine1Idx && targetLine1Idx >= destLine1Idx) {
      return true;
    }
    if ((startLine1Idx < destLine1Idx && targetLine1Idx > destLine1Idx) ||
        (startLine1Idx > destLine1Idx && targetLine1Idx < destLine1Idx)) {
      return false;
    }
  }

  const indexMap = getLineDistanceIndexMap();
  if (!indexMap) return true;

  const candidateCodes = subwayId ? resolveCandidateLineCodes(subwayId) : [];
  const linesToSearch = candidateCodes.length > 0
    ? candidateCodes.map(code => indexMap.get(code)).filter((l): l is LineDistanceIndex => Boolean(l))
    : Array.from(indexMap.values());

  for (const lineIndex of linesToSearch) {
    const startInfo = lineIndex.stationMap.get(cleanStart);
    const targetInfo = lineIndex.stationMap.get(cleanTarget);

    if (startInfo && targetInfo) {
      const startIdx = startInfo.index;
      const targetIdx = targetInfo.index;
      const destInfo = lineIndex.stationMap.get(trainDest);

      if (destInfo) {
        const destIdx = destInfo.index;
        if (startIdx < destIdx && startIdx < targetIdx && targetIdx <= destIdx) return true;
        if (startIdx > destIdx && startIdx > targetIdx && targetIdx >= destIdx) return true;

        if ((startIdx < destIdx && targetIdx > destIdx) || (startIdx > destIdx && targetIdx < destIdx)) {
          return false;
        }
      } else {
        const isUpLine = updnLine === '상행' || updnLine === '1' || updnLine?.includes('내선');
        if (isUpLine && targetIdx <= startIdx) return true;
        if (!isUpLine && targetIdx >= startIdx) return true;
      }
    }
  }

  return true;
}

/**
 * 남은 역 수 기반 기본 Fallback 소요 시간(초)을 계산합니다.
 */
export function calculateFallbackTimeSec(stationCount: number): number {
  return Math.max(60, stationCount * FALLBACK_SECONDS_PER_STATION);
}
