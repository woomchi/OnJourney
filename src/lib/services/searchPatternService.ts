export interface SearchPattern {
  suffix: string;
  pattern_name: string;
  priority: 'high' | 'medium' | 'low' | 'normal';
  description: string;
  categories: string[];
}

export interface QueryAnalysis {
  baseWord: string;
  suffix: string | null;
  pattern: string | null;
  priority: 'high' | 'medium' | 'low' | 'normal';
}

export const SEARCH_PATTERNS: Record<string, SearchPattern> = {
  bus_stop: {
    suffix: '버스정류장',
    pattern_name: 'transit',
    priority: 'high',
    description: '버스 정류장',
    categories: ['버스', '정류장', '정류소']
  },
  transit_station: {
    suffix: '역',
    pattern_name: 'transit',
    priority: 'high',
    description: '지하철역, 기차역',
    categories: ['지하철', '기차', '역']
  },
  restaurant: {
    suffix: '음식점',
    pattern_name: 'food',
    priority: 'medium',
    description: '음식점',
    categories: ['음식점', '식당', '한식', '중식', '일식', '양식']
  },
  cafe: {
    suffix: '카페',
    pattern_name: 'food',
    priority: 'medium',
    description: '카페',
    categories: ['카페', '커피', '디저트']
  },
  hospital: {
    suffix: '병원',
    pattern_name: 'medical',
    priority: 'medium',
    description: '병원',
    categories: ['병원', '의원', '종합병원']
  },
  pharmacy: {
    suffix: '약국',
    pattern_name: 'medical',
    priority: 'medium',
    description: '약국',
    categories: ['약국']
  },
  parking: {
    suffix: '주차장',
    pattern_name: 'parking',
    priority: 'medium',
    description: '주차장',
    categories: ['주차장']
  }
};

/**
 * 2.1 검색어 분석 (Query Analysis)
 */
export function analyzeQuery(query: string): QueryAnalysis {
  const cleanQuery = query.trim();
  
  if (!cleanQuery) {
    return {
      baseWord: '',
      suffix: null,
      pattern: null,
      priority: 'normal'
    };
  }

  // 접미사 길이가 긴 패턴부터 우선 체크 (예: "버스정류장" > "역")
  const sortedPatternKeys = Object.keys(SEARCH_PATTERNS).sort(
    (a, b) => SEARCH_PATTERNS[b].suffix.length - SEARCH_PATTERNS[a].suffix.length
  );

  for (const key of sortedPatternKeys) {
    const p = SEARCH_PATTERNS[key];
    if (cleanQuery.endsWith(p.suffix) && cleanQuery.length > p.suffix.length) {
      const base = cleanQuery.slice(0, cleanQuery.length - p.suffix.length).trim();
      return {
        baseWord: base,
        suffix: p.suffix,
        pattern: p.pattern_name,
        priority: p.priority
      };
    }
  }

  return {
    baseWord: cleanQuery,
    suffix: null,
    pattern: null,
    priority: 'normal'
  };
}

/**
 * 3.3 카테고리 우선순위 점수 (0.0 ~ 1.0)
 */
export function getCategoryPatternScore(
  pattern: string | null,
  groupCode: string | undefined | null,
  categoryName: string | undefined | null
): number {
  if (!pattern) return 0.5; // 패턴 지정 없으면 기본 중립 점수

  const catLower = (categoryName || '').toLowerCase();

  switch (pattern) {
    case 'transit':
      if (groupCode === 'SW8' || catLower.includes('지하철') || catLower.includes('철도')) return 1.0;
      if (catLower.includes('버스') || catLower.includes('정류소') || catLower.includes('정류장')) return 0.8;
      if (catLower.includes('기차') || catLower.includes('역')) return 0.7;
      return 0.1;

    case 'food':
      if (groupCode === 'CE7' || catLower.includes('카페') || catLower.includes('커피')) return 1.0;
      if (groupCode === 'FD6' || catLower.includes('음식점') || catLower.includes('식당')) return 0.9;
      return 0.2;

    case 'medical':
      if (catLower.includes('병원') || catLower.includes('의원')) return 1.0;
      if (groupCode === 'PM9' || catLower.includes('약국')) return 0.7;
      return 0.1;

    case 'parking':
      if (groupCode === 'PK6' || catLower.includes('주차장')) return 1.0;
      return 0.1;

    default:
      return 0.5;
  }
}

/**
 * 명시적 타 지역 키워드 포함 여부 판별 (50km 하드 컷오프 예외 처리용)
 */
export function hasExplicitRegionKeyword(query: string): boolean {
  const regionRegex = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|수원|성남|용인|고양|창원|화성|청주|부천|남양주|천안|전주|안산|평택|안양|포항|시흥|파주|김해|의정부|구미|순천|부여|경주|여수|강릉|속초|가평|양평|춘천)/i;
  return regionRegex.test(query);
}
