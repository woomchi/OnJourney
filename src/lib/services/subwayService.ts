/**
 * @fileoverview 지하철 관련 서비스 (역 조회, 소요 시간 계산, 실시간 ETA) Facade 엔트리포인트
 *
 * 각 도메인 책임별로 분리된 서브 모듈들을 통합 Re-export하여 100% 하위 호환성을 제공합니다.
 * - types: 데이터 인터페이스 및 타입 선언
 * - trainMetadata: 역명 정규화, 행선지/급행 파싱, 서울시 날짜 포맷팅
 * - stationDistance: 역간 거리 DB 로드, O(1) 누적합 Prefix Sum 인덱스, 소요시간 계산
 * - timetableService: ODsay API 연동, 시간표 LRU 캐싱, 다음 열차 탐색
 * - etaCalculator: 실시간 도착 정보 기반 정밀 동적 ETA 및 상태 텍스트 산출
 */

// ─── 공통 타입 및 인터페이스 Re-export ──────────────────────────────────────────
export type {
  ScheduleItem,
  SubwayEtaResult,
  StationIndexedInfo,
  LineDistanceIndex,
  SubwayIndexedStation,
  TrainMetadata,
  StationDistanceRow,
  StationDistanceDb,
} from './subway/types';

// ─── 메타데이터 및 역명/급행 파싱 Re-export ──────────────────────────────────
export {
  normalizeStationName,
  parseMinSecToSeconds,
  extractTrainMetadata,
  extractTrainDestination,
  extractCurrentStation,
  extractRemainingStations,
  isExpressTrain,
  parseSeoulApiDate,
} from './subway/trainMetadata';

// ─── 역간 거리, 인덱스 및 도달 가능성 Re-export ──────────────────────────────
export {
  getLineDistanceIndexMap,
  getLineStationListWithBranches,
  getLineStationList,
  resolveCandidateLineCodes,
  calculateTimeBetweenStations,
  isStationReachableOnLine,
  calculateFallbackTimeSec,
} from './subway/stationDistance';

// ─── 시간표 조회 및 캐싱 Re-export ────────────────────────────────────────────
export {
  timeToSeconds,
  parseOdsaySubwayTimeList,
  fetchStationId,
  fetchDynamicTravelTimeSec,
  fetchAndCacheTimetable,
  calculateNextTrainFromTimetable,
} from './subway/timetableService';

// ─── 수인분당선 공식 시간표 Re-export ─────────────────────────────────────────
export {
  getNextTrainFromSuinbundangTimetable,
  getSuinbundangTimetableList,
  loadSuinbundangStationTimetable,
  isSuinbundangStation,
  isSuinbundangLine,
  resolveOfficialSuinbundangStationName,
  SUINBUNDANG_STATIONS,
  SUINBUNDANG_UNIQUE_STATIONS,
} from './subway/suinbundangTimetableService';

// ─── 경강선 공식 시간표 Re-export ─────────────────────────────────────────────
export {
  getNextTrainFromGyeonggangTimetable,
  getGyeonggangTimetableList,
  loadGyeonggangStationTimetable,
  isGyeonggangStation,
  isGyeonggangLine,
  resolveOfficialGyeonggangStationName,
  resolveGyeonggangDirection,
  GYEONGGANG_STATIONS,
  GYEONGGANG_UNIQUE_STATIONS,
} from './subway/gyeonggangTimetableService';

// ─── 경의중앙선 공식 시간표 Re-export ─────────────────────────────────────────
export {
  getNextTrainFromGyeonguiTimetable,
  getGyeonguiTimetableList,
  loadGyeonguiStationTimetable,
  isGyeonguiStation,
  isGyeonguiLine,
  resolveOfficialGyeonguiStationName,
  resolveGyeonguiDirection,
  GYEONGUI_STATIONS,
  GYEONGUI_UNIQUE_STATIONS,
} from './subway/gyeonguiTimetableService';

// ─── 경춘선 공식 시간표 Re-export ───────────────────────────────────────────
export {
  getNextTrainFromGyeongchunTimetable,
  getGyeongchunTimetableList,
  loadGyeongchunStationTimetable,
  isGyeongchunStation,
  isGyeongchunLine,
  resolveOfficialGyeongchunStationName,
  resolveGyeongchunDirection,
  GYEONGCHUN_STATIONS,
  GYEONGCHUN_UNIQUE_STATIONS,
} from './subway/gyeongchunTimetableService';

// ─── 에버라인 공식 시간표 Re-export ───────────────────────────────────────────
export {
  getNextTrainFromEverlineTimetable,
  getEverlineTimetableList,
  loadEverlineStationTimetable,
  isEverlineStation,
  isEverlineLine,
  resolveOfficialEverlineStationName,
  resolveEverlineDirection,
  EVERLINE_STATIONS,
  EVERLINE_UNIQUE_STATIONS,
} from './subway/everlineTimetableService';

// ─── 서해선 공식 시간표 Re-export ─────────────────────────────────────────────
export {
  getNextTrainFromSeohaeTimetable,
  getSeohaeTimetableList,
  loadSeohaeStationTimetable,
  isSeohaeStation,
  isSeohaeLine,
  resolveOfficialSeohaeStationName,
  resolveSeohaeDirection,
  SEOHAE_STATIONS,
  SEOHAE_UNIQUE_STATIONS,
} from './subway/seohaeTimetableService';

// ─── 신분당선 공식 시간표 Re-export ───────────────────────────────────────────
export {
  getNextTrainFromShinbundangTimetable,
  getShinbundangTimetableList,
  loadShinbundangStationTimetable,
  isShinbundangStation,
  isShinbundangLine,
  resolveOfficialShinbundangStationName,
  resolveShinbundangDirection,
  SHINBUNDANG_STATIONS,
  SHINBUNDANG_UNIQUE_STATIONS,
} from './subway/shinbundangTimetableService';

// ─── 공항철도(AREX) 공식 시간표 Re-export ─────────────────────────────────────
export {
  getArexNextTrain,
  getNextTrainFromArexTimetable,
  getArexTimetableList,
  loadArexStationTimetable,
  isArexStation,
  isArexLine,
  isArexExclusiveStation,
  resolveOfficialArexStationName,
  resolveArexDirection,
  AREX_STATIONS,
  AREX_UNIQUE_STATIONS,
} from './subway/arexTimetableService';

// ─── 신림선 공식 시간표 Re-export ─────────────────────────────────────────────
export {
  getSillimNextTrain,
  getNextTrainFromSillimTimetable,
  getSillimTimetableList,
  loadSillimStationTimetable,
  isSillimStation,
  isSillimLine,
  isSillimExclusiveStation,
  resolveOfficialSillimStationName,
  resolveSillimDirection,
  SILLIM_STATIONS,
  SILLIM_UNIQUE_STATIONS,
} from './subway/sillimTimetableService';


// ─── 김포골드라인 공식 시간표 Re-export ─────────────────────────────────────────
export {
  getGimpoGoldNextTrain,
  getNextTrainFromGimpoGoldTimetable,
  getGimpoGoldTimetableList,
  loadGimpoGoldStationTimetable,
  isGimpoGoldStation,
  isGimpoGoldLine,
  isGimpoGoldExclusiveStation,
  resolveOfficialGimpoGoldStationName,
  resolveGimpoGoldDirection,
  GIMPO_GOLD_STATIONS,
  GIMPO_GOLD_UNIQUE_STATIONS,
} from './subway/gimpoGoldTimetableService';

// ─── 우이신설선 공식 시간표 Re-export ─────────────────────────────────────────
export {
  getUiLineNextTrain,
  getNextTrainFromUiLineTimetable,
  getUiLineTimetableList,
  loadUiLineStationTimetable,
  isUiLineStation,
  isUiLineLine,
  isUiLineExclusiveStation,
  resolveOfficialUiLineStationName,
  resolveUiLineDirection,
  UI_LINE_STATIONS,
  UI_LINE_UNIQUE_STATIONS,
} from './subway/uiLineTimetableService';

// ─── 실시간 동적 ETA 계산기 Re-export ─────────────────────────────────────────
export {
  calculateSubwayETADynamic,
} from './subway/etaCalculator';

