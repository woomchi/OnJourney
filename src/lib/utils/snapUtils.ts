/**
 * @fileoverview 바텀시트 스냅 값 파싱 공통 유틸리티
 *
 * 숫자, 문자열(픽셀 또는 '46vh' 등), 전체 화면(1, '1'), null/undefined를
 * 실제 픽셀 높이(number)로 변환합니다.
 */

export const parseSnapVal = (s: number | string | null | undefined): number => {
  if (!s) return 0;
  if (s === 1 || s === '1') return 1;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') {
    if (s.endsWith('vh')) {
      if (typeof window !== 'undefined') {
        const vh = parseFloat(s) || 0;
        return window.innerHeight * (vh / 100);
      }
    }
    return parseInt(s, 10) || 0;
  }
  return 0;
};
