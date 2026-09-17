import { SUBWAY_COLORS, BUS_COLORS, ODSAY_BUS_TYPES } from '@/constants/colors';

/**
 * 지하철 색상 매핑
 */
export function getSubwayColor(laneName: string): string {
  const match = Object.keys(SUBWAY_COLORS).find((key) => laneName.includes(key));
  return match ? SUBWAY_COLORS[match] : SUBWAY_COLORS['DEFAULT'];
}

/**
 * 지하철 노선명 정리 (수도권 등 불필요한 지역 접두사 및 온점/가운데점 제거)
 */
export function cleanSubwayName(laneName: string): string {
  return laneName
    .replace(/^(수도권|인천|부산|대구|대전|광주|울산)\s+/, '')
    .replace(/[·\.]/g, '');
}

/**
 * 버스 색상 매핑 (ODsay type 코드 및 버스 번호 기반)
 */
export function getBusColor(busType: number, laneName: string): string {
  if (ODSAY_BUS_TYPES.WIDE_AREA.includes(busType)) return BUS_COLORS.RED;
  if (ODSAY_BUS_TYPES.LOCAL.includes(busType)) return BUS_COLORS.GREEN;
  if (ODSAY_BUS_TYPES.CIRCULAR.includes(busType)) return BUS_COLORS.YELLOW;
  if (ODSAY_BUS_TYPES.MAIN.includes(busType)) return BUS_COLORS.BLUE;

  // fallback: 버스 번호나 텍스트 기반 매핑
  if (laneName.includes('광역') || laneName.includes('급행') || laneName.includes('red') || laneName.includes('M'))
    return BUS_COLORS.RED;
  if (laneName.includes('지선') || laneName.includes('green') || laneName.includes('마을'))
    return BUS_COLORS.GREEN;
  if (laneName.includes('순환') || laneName.includes('yellow')) return BUS_COLORS.YELLOW;
  return BUS_COLORS.BLUE;
}

/**
 * 카카오 버스 타입 및 노선명 기반 버스 색상 매핑
 */
export function getKakaoBusColor(busType?: string, routeName?: string): string {
  const type = busType || '';
  const name = routeName || '';

  if (
    type.includes('광역') ||
    type.includes('직행') ||
    type.includes('급행') ||
    type.includes('시외') ||
    name.startsWith('M')
  ) {
    return BUS_COLORS.RED;
  }
  if (type.includes('마을') || type.includes('지선')) {
    return BUS_COLORS.GREEN;
  }
  if (type.includes('순환')) {
    return BUS_COLORS.YELLOW;
  }
  if (type.includes('간선') || type.includes('일반') || type.includes('좌석')) {
    return BUS_COLORS.BLUE;
  }
  return BUS_COLORS.BLUE;
}

