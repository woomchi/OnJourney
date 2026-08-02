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
