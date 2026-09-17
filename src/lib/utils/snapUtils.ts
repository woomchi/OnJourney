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

export interface SnapTarget {
  y: number;
  name: 'min' | 'default' | 'max';
}

export interface ResolveSnapParams {
  currentY: number;
  activeSnapY: number;
  velocityY: number;
  maxHeight: number;
  defaultHeight: number;
  minHeight: number;
  velocityThreshold?: number;
  pixelThreshold?: number;
}

/**
 * 사용자의 드래그/스와이프 제스처 종료 시 도달해야 할 다음 스냅 포인트를 안전하게 결정합니다.
 *
 * - 한계점(최대/최소 높이) 초과 제스처 시 반대편 극단으로 튕기지 않고 현재 한계점을 유지(Clamping)
 * - 동일한 높이 전달 시 스냅 포인트 중복 제거
 */
export const resolveNextSnapPoint = ({
  currentY,
  activeSnapY,
  velocityY,
  maxHeight,
  defaultHeight,
  minHeight,
  velocityThreshold = 500,
  pixelThreshold = 30,
}: ResolveSnapParams): SnapTarget => {
  const rawSnapPoints: SnapTarget[] = [
    { y: -maxHeight, name: 'max' },
    { y: -defaultHeight, name: 'default' },
    { y: -minHeight, name: 'min' },
  ];

  // 중복 스냅 포인트 제거 및 y값 오름차순 정렬 (max -> default -> min)
  const uniqueSnapPoints = rawSnapPoints
    .filter((pt, idx, self) => idx === self.findIndex((p) => Math.abs(p.y - pt.y) < 1))
    .sort((a, b) => a.y - b.y);

  const maxPoint = uniqueSnapPoints[0];
  const minPoint = uniqueSnapPoints[uniqueSnapPoints.length - 1];

  let targetSnap =
    uniqueSnapPoints.find((p) => Math.abs(p.y - activeSnapY) < 1) ||
    uniqueSnapPoints.find((p) => p.name === 'default') ||
    uniqueSnapPoints[0];

  if (velocityY > velocityThreshold) {
    // Swiping DOWN -> 더 낮은 높이(더 큰 y값)로 이동
    const belowPoints = uniqueSnapPoints.filter((p) => p.y > currentY + 5);
    targetSnap = belowPoints.length > 0 ? belowPoints[0] : minPoint;
  } else if (velocityY < -velocityThreshold) {
    // Swiping UP -> 더 높은 높이(더 작은 y값)로 이동
    const abovePoints = uniqueSnapPoints.filter((p) => p.y < currentY - 5);
    targetSnap = abovePoints.length > 0 ? abovePoints[abovePoints.length - 1] : maxPoint;
  } else {
    // Slow Drag -> 임계치 기준 이동
    const deltaY = currentY - activeSnapY;
    if (deltaY > pixelThreshold) {
      const belowPoints = uniqueSnapPoints.filter((p) => p.y > activeSnapY);
      targetSnap = belowPoints.length > 0 ? belowPoints[0] : minPoint;
    } else if (deltaY < -pixelThreshold) {
      const abovePoints = uniqueSnapPoints.filter((p) => p.y < activeSnapY);
      targetSnap = abovePoints.length > 0 ? abovePoints[abovePoints.length - 1] : maxPoint;
    } else {
      targetSnap = uniqueSnapPoints.find((p) => Math.abs(p.y - activeSnapY) < 1) || minPoint;
    }
  }

  return targetSnap;
};
