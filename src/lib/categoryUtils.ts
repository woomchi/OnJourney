export interface CategoryTheme {
  type: 'cafe' | 'restaurant' | 'hotel' | 'activity' | 'transit' | 'etc';
  color: string;
  gradientStart: string;
  gradientEnd: string;
  label: string;
}

export function getCategoryTheme(categoryStr: string): CategoryTheme {
  const category = categoryStr || '';

  // 1. 카페
  if (
    category.includes('카페') ||
    category.includes('커피') ||
    category.includes('디저트') ||
    category.includes('제과점') ||
    category.includes('빵집')
  ) {
    return {
      type: 'cafe',
      color: '#F59E0B', // Amber
      gradientStart: '#FBBF24',
      gradientEnd: '#D97706',
      label: '카페',
    };
  }

  // 2. 음식점
  if (
    category.includes('음식점') ||
    category.includes('식당') ||
    category.includes('한식') ||
    category.includes('중식') ||
    category.includes('일식') ||
    category.includes('양식') ||
    category.includes('뷔페') ||
    category.includes('술집') ||
    category.includes('요리') ||
    category.includes('포차') ||
    category.includes('펍')
  ) {
    return {
      type: 'restaurant',
      color: '#EF4444', // Red
      gradientStart: '#F87171',
      gradientEnd: '#DC2626',
      label: '음식점',
    };
  }

  // 3. 숙박/숙소
  if (
    category.includes('숙박') ||
    category.includes('호텔') ||
    category.includes('콘도') ||
    category.includes('펜션') ||
    category.includes('게스트하우스') ||
    category.includes('민박') ||
    category.includes('캠핑') ||
    category.includes('글램핑') ||
    category.includes('리조트')
  ) {
    return {
      type: 'hotel',
      color: '#10B981', // Emerald
      gradientStart: '#34D399',
      gradientEnd: '#059669',
      label: '숙소',
    };
  }

  // 4. 액티비티/관광/체험
  if (
    category.includes('관광') ||
    category.includes('명소') ||
    category.includes('테마파크') ||
    category.includes('놀이공원') ||
    category.includes('레저') ||
    category.includes('체험') ||
    category.includes('공원') ||
    category.includes('해수욕장') ||
    category.includes('박물관') ||
    category.includes('미술관') ||
    category.includes('전시') ||
    category.includes('문화') ||
    category.includes('공연') ||
    category.includes('스포츠') ||
    category.includes('스키') ||
    category.includes('낚시') ||
    category.includes('수목원') ||
    category.includes('전망대') ||
    category.includes('케이블카') ||
    category.includes('아쿠아리움')
  ) {
    return {
      type: 'activity',
      color: '#3B82F6', // Blue
      gradientStart: '#60A5FA',
      gradientEnd: '#2563EB',
      label: '액티비티',
    };
  }

  // 5. 대중교통/이동
  if (
    category.includes('역') ||
    category.includes('정류장') ||
    category.includes('터미널') ||
    category.includes('공항') ||
    category.includes('주차장') ||
    category.includes('선착장')
  ) {
    return {
      type: 'transit',
      color: '#6B7280', // Gray
      gradientStart: '#9CA3AF',
      gradientEnd: '#4B5563',
      label: '교통',
    };
  }

  // 6. 기본/기타 (쇼핑, 마트, 편의점, 일반 건물 등)
  return {
    type: 'etc',
    color: '#8B5CF6', // Purple
    gradientStart: '#A78BFA',
    gradientEnd: '#7C3AED',
    label: '기타',
  };
}
