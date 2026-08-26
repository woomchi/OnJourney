/**
 * @fileoverview 전체 지하철 및 경전철 노선 브랜드 테마 색상 — 단일 진실 공급원(SSoT)
 */

export interface SubwayColorTheme {
  primary: string;
  badgeBg: string;
  badgeText: string;
  line: string;
  dot: string;
  activeTabBg: string;
  lightBg: string;
  text: string;
  border: string;
}

/**
 * subwayId 또는 노선명(subwayNm)을 기반으로 일관된 UI 테마 색상을 반환합니다.
 */
export function getSubwayLineTheme(subwayNmOrId: string): SubwayColorTheme {
  const clean = String(subwayNmOrId || '').trim();

  // 1. 지방 도시철도
  if (clean.includes('대전')) {
    return {
      primary: '#007448',
      badgeBg: 'bg-[#007448]',
      badgeText: 'text-white',
      line: 'bg-[#007448]',
      dot: 'border-[#007448]',
      activeTabBg: 'bg-[#007448] text-white',
      lightBg: 'bg-[#007448]/10',
      text: 'text-[#007448]',
      border: 'border-[#007448]',
    };
  }
  if (clean.includes('부산')) {
    return {
      primary: '#0075C4',
      badgeBg: 'bg-[#0075C4]',
      badgeText: 'text-white',
      line: 'bg-[#0075C4]',
      dot: 'border-[#0075C4]',
      activeTabBg: 'bg-[#0075C4] text-white',
      lightBg: 'bg-[#0075C4]/10',
      text: 'text-[#0075C4]',
      border: 'border-[#0075C4]',
    };
  }
  if (clean.includes('대구')) {
    return {
      primary: '#D9381E',
      badgeBg: 'bg-[#D9381E]',
      badgeText: 'text-white',
      line: 'bg-[#D9381E]',
      dot: 'border-[#D9381E]',
      activeTabBg: 'bg-[#D9381E] text-white',
      lightBg: 'bg-[#D9381E]/10',
      text: 'text-[#D9381E]',
      border: 'border-[#D9381E]',
    };
  }
  if (clean.includes('광주')) {
    return {
      primary: '#00904B',
      badgeBg: 'bg-[#00904B]',
      badgeText: 'text-white',
      line: 'bg-[#00904B]',
      dot: 'border-[#00904B]',
      activeTabBg: 'bg-[#00904B] text-white',
      lightBg: 'bg-[#00904B]/10',
      text: 'text-[#00904B]',
      border: 'border-[#00904B]',
    };
  }

  // 2. 수도권 1~9호선
  if (clean === '1001' || clean === '1' || clean === '1호선' || clean === '수도권 1호선') {
    return {
      primary: '#0052A4',
      badgeBg: 'bg-[#0052A4]',
      badgeText: 'text-white',
      line: 'bg-[#0052A4]',
      dot: 'border-[#0052A4]',
      activeTabBg: 'bg-[#0052A4] text-white',
      lightBg: 'bg-[#0052A4]/10',
      text: 'text-[#0052A4]',
      border: 'border-[#0052A4]',
    };
  }
  if (clean === '1002' || clean === '2' || clean.includes('2호선')) {
    return {
      primary: '#00A84D',
      badgeBg: 'bg-[#00A84D]',
      badgeText: 'text-white',
      line: 'bg-[#00A84D]',
      dot: 'border-[#00A84D]',
      activeTabBg: 'bg-[#00A84D] text-white',
      lightBg: 'bg-[#00A84D]/10',
      text: 'text-[#00A84D]',
      border: 'border-[#00A84D]',
    };
  }
  if (clean === '1003' || clean === '3' || clean.includes('3호선')) {
    return {
      primary: '#EF7C1C',
      badgeBg: 'bg-[#EF7C1C]',
      badgeText: 'text-white',
      line: 'bg-[#EF7C1C]',
      dot: 'border-[#EF7C1C]',
      activeTabBg: 'bg-[#EF7C1C] text-white',
      lightBg: 'bg-[#EF7C1C]/10',
      text: 'text-[#EF7C1C]',
      border: 'border-[#EF7C1C]',
    };
  }
  if (clean === '1004' || clean === '4' || clean.includes('4호선')) {
    return {
      primary: '#00A5DE',
      badgeBg: 'bg-[#00A5DE]',
      badgeText: 'text-white',
      line: 'bg-[#00A5DE]',
      dot: 'border-[#00A5DE]',
      activeTabBg: 'bg-[#00A5DE] text-white',
      lightBg: 'bg-[#00A5DE]/10',
      text: 'text-[#00A5DE]',
      border: 'border-[#00A5DE]',
    };
  }
  if (clean === '1005' || clean === '5' || clean.includes('5호선')) {
    return {
      primary: '#996CAC',
      badgeBg: 'bg-[#996CAC]',
      badgeText: 'text-white',
      line: 'bg-[#996CAC]',
      dot: 'border-[#996CAC]',
      activeTabBg: 'bg-[#996CAC] text-white',
      lightBg: 'bg-[#996CAC]/10',
      text: 'text-[#996CAC]',
      border: 'border-[#996CAC]',
    };
  }
  if (clean === '1006' || clean === '6' || clean.includes('6호선')) {
    return {
      primary: '#CD7C2F',
      badgeBg: 'bg-[#CD7C2F]',
      badgeText: 'text-white',
      line: 'bg-[#CD7C2F]',
      dot: 'border-[#CD7C2F]',
      activeTabBg: 'bg-[#CD7C2F] text-white',
      lightBg: 'bg-[#CD7C2F]/10',
      text: 'text-[#CD7C2F]',
      border: 'border-[#CD7C2F]',
    };
  }
  if (clean === '1007' || clean === '7' || clean.includes('7호선')) {
    return {
      primary: '#747F00',
      badgeBg: 'bg-[#747F00]',
      badgeText: 'text-white',
      line: 'bg-[#747F00]',
      dot: 'border-[#747F00]',
      activeTabBg: 'bg-[#747F00] text-white',
      lightBg: 'bg-[#747F00]/10',
      text: 'text-[#747F00]',
      border: 'border-[#747F00]',
    };
  }
  if (clean === '1008' || clean === '8' || clean.includes('8호선')) {
    return {
      primary: '#EA545D',
      badgeBg: 'bg-[#EA545D]',
      badgeText: 'text-white',
      line: 'bg-[#EA545D]',
      dot: 'border-[#EA545D]',
      activeTabBg: 'bg-[#EA545D] text-white',
      lightBg: 'bg-[#EA545D]/10',
      text: 'text-[#EA545D]',
      border: 'border-[#EA545D]',
    };
  }
  if (clean === '1009' || clean === '9' || clean.includes('9호선')) {
    return {
      primary: '#BDB092',
      badgeBg: 'bg-[#BDB092]',
      badgeText: 'text-white',
      line: 'bg-[#BDB092]',
      dot: 'border-[#BDB092]',
      activeTabBg: 'bg-[#8C7B58] text-white',
      lightBg: 'bg-[#BDB092]/10',
      text: 'text-[#8C7B58]',
      border: 'border-[#BDB092]',
    };
  }

  // 3. 수도권 광역/특수 노선
  if (clean.includes('신분당')) {
    return {
      primary: '#D4003B',
      badgeBg: 'bg-[#D4003B]',
      badgeText: 'text-white',
      line: 'bg-[#D4003B]',
      dot: 'border-[#D4003B]',
      activeTabBg: 'bg-[#D4003B] text-white',
      lightBg: 'bg-[#D4003B]/10',
      text: 'text-[#D4003B]',
      border: 'border-[#D4003B]',
    };
  }
  if (clean.includes('수인분당') || clean.includes('분당선')) {
    return {
      primary: '#F5A200',
      badgeBg: 'bg-[#F5A200]',
      badgeText: 'text-white',
      line: 'bg-[#F5A200]',
      dot: 'border-[#F5A200]',
      activeTabBg: 'bg-[#D88D00] text-white',
      lightBg: 'bg-[#F5A200]/10',
      text: 'text-[#D88D00]',
      border: 'border-[#F5A200]',
    };
  }
  if (clean.includes('경의중앙')) {
    return {
      primary: '#77C4A3',
      badgeBg: 'bg-[#77C4A3]',
      badgeText: 'text-white',
      line: 'bg-[#77C4A3]',
      dot: 'border-[#77C4A3]',
      activeTabBg: 'bg-[#4EA680] text-white',
      lightBg: 'bg-[#77C4A3]/10',
      text: 'text-[#4EA680]',
      border: 'border-[#77C4A3]',
    };
  }
  if (clean.includes('공항철도') || clean === '1065') {
    return {
      primary: '#0090D2',
      badgeBg: 'bg-[#0090D2]',
      badgeText: 'text-white',
      line: 'bg-[#0090D2]',
      dot: 'border-[#0090D2]',
      activeTabBg: 'bg-[#0090D2] text-white',
      lightBg: 'bg-[#0090D2]/10',
      text: 'text-[#0090D2]',
      border: 'border-[#0090D2]',
    };
  }
  if (clean.includes('경춘')) {
    return {
      primary: '#0C8E72',
      badgeBg: 'bg-[#0C8E72]',
      badgeText: 'text-white',
      line: 'bg-[#0C8E72]',
      dot: 'border-[#0C8E72]',
      activeTabBg: 'bg-[#0C8E72] text-white',
      lightBg: 'bg-[#0C8E72]/10',
      text: 'text-[#0C8E72]',
      border: 'border-[#0C8E72]',
    };
  }
  if (clean.includes('서해')) {
    return {
      primary: '#81A914',
      badgeBg: 'bg-[#81A914]',
      badgeText: 'text-white',
      line: 'bg-[#81A914]',
      dot: 'border-[#81A914]',
      activeTabBg: 'bg-[#81A914] text-white',
      lightBg: 'bg-[#81A914]/10',
      text: 'text-[#81A914]',
      border: 'border-[#81A914]',
    };
  }
  if (clean.includes('경강')) {
    return {
      primary: '#0054A6',
      badgeBg: 'bg-[#0054A6]',
      badgeText: 'text-white',
      line: 'bg-[#0054A6]',
      dot: 'border-[#0054A6]',
      activeTabBg: 'bg-[#0054A6] text-white',
      lightBg: 'bg-[#0054A6]/10',
      text: 'text-[#0054A6]',
      border: 'border-[#0054A6]',
    };
  }
  if (clean.includes('우이신설') || clean.includes('우이')) {
    return {
      primary: '#B0CE18',
      badgeBg: 'bg-[#B0CE18]',
      badgeText: 'text-zinc-900',
      line: 'bg-[#B0CE18]',
      dot: 'border-[#B0CE18]',
      activeTabBg: 'bg-[#8CA800] text-white',
      lightBg: 'bg-[#B0CE18]/10',
      text: 'text-[#6D8200]',
      border: 'border-[#B0CE18]',
    };
  }
  if (clean.includes('신림')) {
    return {
      primary: '#6789CA',
      badgeBg: 'bg-[#6789CA]',
      badgeText: 'text-white',
      line: 'bg-[#6789CA]',
      dot: 'border-[#6789CA]',
      activeTabBg: 'bg-[#4B6FA8] text-white',
      lightBg: 'bg-[#6789CA]/10',
      text: 'text-[#4B6FA8]',
      border: 'border-[#6789CA]',
    };
  }
  if (clean.includes('인천1') || clean.includes('인천 1')) {
    return {
      primary: '#7CA8D5',
      badgeBg: 'bg-[#7CA8D5]',
      badgeText: 'text-white',
      line: 'bg-[#7CA8D5]',
      dot: 'border-[#7CA8D5]',
      activeTabBg: 'bg-[#5B8CBF] text-white',
      lightBg: 'bg-[#7CA8D5]/10',
      text: 'text-[#5B8CBF]',
      border: 'border-[#7CA8D5]',
    };
  }
  if (clean.includes('인천2') || clean.includes('인천 2')) {
    return {
      primary: '#ED8B00',
      badgeBg: 'bg-[#ED8B00]',
      badgeText: 'text-white',
      line: 'bg-[#ED8B00]',
      dot: 'border-[#ED8B00]',
      activeTabBg: 'bg-[#D07800] text-white',
      lightBg: 'bg-[#ED8B00]/10',
      text: 'text-[#D07800]',
      border: 'border-[#ED8B00]',
    };
  }
  if (clean.includes('GTX-A') || clean.includes('gtx-a')) {
    return {
      primary: '#9A5A9B',
      badgeBg: 'bg-[#9A5A9B]',
      badgeText: 'text-white',
      line: 'bg-[#9A5A9B]',
      dot: 'border-[#9A5A9B]',
      activeTabBg: 'bg-[#9A5A9B] text-white',
      lightBg: 'bg-[#9A5A9B]/10',
      text: 'text-[#9A5A9B]',
      border: 'border-[#9A5A9B]',
    };
  }

  return {
    primary: '#2563eb',
    badgeBg: 'bg-blue-600',
    badgeText: 'text-white',
    line: 'bg-blue-600',
    dot: 'border-blue-600',
    activeTabBg: 'bg-blue-600 text-white',
    lightBg: 'bg-blue-50',
    text: 'text-blue-600',
    border: 'border-blue-600',
  };
}
