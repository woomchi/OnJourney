// UI 및 교통수단 렌더링 관련 색상 상수

// 여정 구간별 기본 색상 (Sequence Colors)
export const SEQUENCE_COLORS = [
  '#4F46E5', // 1번째 구간: Indigo Blue (어두운 계열)
  '#EC4899', // 2번째 구간: Coral Pink (밝은 계열)
  '#0D9488', // 3번째 구간: Teal Green (어두운 계열)
  '#D97706', // 4번째 구간: Amber Golden (밝은 계열)
  '#6D28D9', // 5번째 구간: Deep Purple (어두운 계열)
  '#DC2626', // 6번째 이상: Rose Red (어두운 계열)
];

export interface SequenceTheme {
  color: string;
  gradientStart: string;
  gradientEnd: string;
}

export function getSequenceTheme(idx: number, totalPlaces: number): SequenceTheme {
  // 맨 마지막 장소는 항상 파란색 (Blue)으로 고정
  if (totalPlaces > 1 && idx === totalPlaces - 1) {
    return {
      color: '#3B82F6', // Blue
      gradientStart: '#60A5FA', // Blue 400
      gradientEnd: '#2563EB',   // Blue 700
    };
  }

  const colorIndex = idx % SEQUENCE_COLORS.length;

  switch (colorIndex) {
    case 0:
      return {
        color: '#4F46E5',
        gradientStart: '#818CF8', // Indigo 400
        gradientEnd: '#4338CA',   // Indigo 700
      };
    case 1:
      return {
        color: '#EC4899',
        gradientStart: '#F472B6', // Pink 400
        gradientEnd: '#BE185D',   // Pink 700
      };
    case 2:
      return {
        color: '#0D9488',
        gradientStart: '#2DD4BF', // Teal 400
        gradientEnd: '#0F766E',   // Teal 700
      };
    case 3:
      return {
        color: '#D97706',
        gradientStart: '#FBBF24', // Amber 400
        gradientEnd: '#B45309',   // Amber 700
      };
    case 4:
      return {
        color: '#6D28D9',
        gradientStart: '#8B5CF6', // Purple 500
        gradientEnd: '#5B21B6',   // Purple 800
      };
    case 5:
    default:
      return {
        color: '#DC2626',
        gradientStart: '#F87171', // Red 400
        gradientEnd: '#B91C1C',   // Red 700
      };
  }
}

// 지하철 호선별 색상 매핑
export const SUBWAY_COLORS: Record<string, string> = {
  '1호선': '#0052A4',
  '2호선': '#00A84D',
  '3호선': '#EF7C1C',
  '4호선': '#00A5DE',
  '5호선': '#996CAC',
  '6호선': '#CD7C2F',
  '7호선': '#747F28',
  '8호선': '#E6186C',
  '9호선': '#BDB092',
  '수인분당': '#E0A100',
  '신분당': '#D4003B',
  '경의중앙': '#77C4A3',
  '공항철도': '#0090D2',
  'DEFAULT': '#00A84D',
};

// 버스 유형별 색상 상수
export const BUS_COLORS = {
  RED: '#e60012',    // 광역/급행
  GREEN: '#33b35a',  // 지선/마을
  YELLOW: '#f9a825', // 순환
  BLUE: '#0068b7',   // 간선/좌석
};

// ODsay 버스 타입 코드 매핑
export const ODSAY_BUS_TYPES = {
  WIDE_AREA: [4, 14], // 고속/급행, 광역
  LOCAL: [3, 12],     // 마을, 지선
  CIRCULAR: [13],     // 순환
  MAIN: [2, 11],      // 좌석, 간선
};
