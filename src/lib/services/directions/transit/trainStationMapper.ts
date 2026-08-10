import { OdsayAdapter } from '@/lib/infrastructure/odsayAdapter';

/**
 * 주요 기차역 명칭 → ODsay 기차역 Station ID 정적 매핑 딕셔너리
 */
const TRAIN_STATION_ID_MAP: Record<string, string> = {
  서울: '3300128',
  서울역: '3300128',
  용산: '3300129',
  용산역: '3300129',
  수서: '3300300',
  수서역: '3300300',
  영등포: '3300130',
  영등포역: '3300130',
  청량리: '3300127',
  청량리역: '3300127',
  수원: '3300131',
  수원역: '3300131',
  평택지제: '3300305',
  평택지제역: '3300305',
  지제역: '3300305',
  지제: '3300305',
  천안아산: '3300088',
  천안아산역: '3300088',
  아산: '3300088',
  아산역: '3300088',
  대전: '3300052',
  대전역: '3300052',
  서대전: '3300053',
  서대전역: '3300053',
  오송: '3300086',
  오송역: '3300086',
  동대구: '3300037',
  동대구역: '3300037',
  대구: '3300036',
  대구역: '3300036',
  신경주: '3300089',
  신경주역: '3300089',
  경주: '3300041',
  경주역: '3300041',
  울산: '3300090',
  울산역: '3300090',
  통도사: '3300090',
  부산: '3300108',
  부산역: '3300108',
  구포: '3300109',
  구포역: '3300109',
  마산: '3300115',
  마산역: '3300115',
  창원: '3300114',
  창원역: '3300114',
  광주송정: '3300067',
  광주송정역: '3300067',
  목포: '3300072',
  목포역: '3300072',
  전주: '3300079',
  전주역: '3300079',
  순천: '3300076',
  순천역: '3300076',
  여수엑스포: '3300078',
  여수엑스포역: '3300078',
  여수: '3300078',
  강릉: '3300021',
  강릉역: '3300021',
  원주: '3300015',
  원주역: '3300015',
  서원주: '3300016',
  서원주역: '3300016',
};

const INVALID_NAMES = new Set(['출발역', '도착역', '출발', '도착', '기차역', '기차', '버스터미널', '']);

/**
 * 기차역 이름으로 ODsay Station ID 반환 (3단계 예외 방어 스마트 매퍼)
 */
export async function resolveTrainStationId(
  stationName: string,
  providedId?: string | number,
  apiKey?: string
): Promise<string> {
  const rawId = String(providedId || '').trim();

  // 이미 올바른 3300번대 기차역 ID인 경우 즉시 반환
  if (rawId.startsWith('3300') && rawId.length >= 7) {
    return rawId;
  }

  // 1차: 입력 텍스트 정제 (괄호, 부가 텍스트 제거)
  const trimmedName = (stationName || '')
    .replace(/\([^)]*\)/g, '') // 괄호 제거
    .replace(/(호선|역|\s+)*$/g, '') // 끝 부분 노선/역 제거
    .trim();

  // 불완전한 이름 사전 차단
  if (INVALID_NAMES.has(trimmedName) || INVALID_NAMES.has(stationName.trim())) {
    // rawId가 유효하면 rawId 사용, 아니면 서울역 기본값
    return rawId && rawId !== '0' && rawId !== '130' && rawId !== '110' ? rawId : '3300128';
  }

  // 2차: 딕셔너리 매핑 검사
  const staticId =
    TRAIN_STATION_ID_MAP[trimmedName] ||
    TRAIN_STATION_ID_MAP[`${trimmedName}역`] ||
    TRAIN_STATION_ID_MAP[stationName.trim()];

  if (staticId) {
    return staticId;
  }

  // 3차: ODsay 동적 검색 (trimmedName이 2글자 이상인 경우만 실행)
  if (trimmedName.length >= 2) {
    try {
      const searchRes = await OdsayAdapter.fetchSearchStation(trimmedName, '1', apiKey);
      const stationList = searchRes?.result?.station;
      if (Array.isArray(stationList) && stationList.length > 0) {
        const trainStation = stationList.find(
          (st: any) => st.stationClass === 1 || st.stationName?.includes('역')
        );
        if (trainStation && trainStation.stationID) {
          return String(trainStation.stationID);
        }
      }
    } catch (err) {
      console.warn(`[trainStationMapper] 동적 역 ID 검색 실패 (${stationName}):`, err);
    }
  }

  // 최후 Fallback: 안전 기차역 ID (기본 서울역 또는 부산역)
  return rawId && rawId !== '0' ? rawId : '3300128';
}
