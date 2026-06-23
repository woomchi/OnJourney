// UI 및 교통수단 렌더링 관련 색상 상수

// 여정 구간별 기본 색상 (Sequence Colors)
export const SEQUENCE_COLORS = [
  '#4F46E5', // 1번째 구간: Indigo Blue
  '#0D9488', // 2번째 구간: Teal Green
  '#D97706', // 3번째 구간: Amber Golden
  '#EC4899', // 4번째 구간: Coral Pink
  '#DC2626', // 5번째 이상: Rose Red
];

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
