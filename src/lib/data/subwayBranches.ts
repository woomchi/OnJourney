/**
 * @fileoverview 서울/수도권 지하철 주요 복합 노선의 운행 계통(Branch) 및 정차역 정의
 *
 * 네이버 지도 스타일의 운행 계통 탭 분기 시스템을 지원합니다.
 * 1호선 (경부선 신창, 서동탄 지선, 경인선 인천, 경원선 연천, 광명 셔틀)
 * 2호선 (본선 순환, 신정지선, 성수지선)
 * 5호선 (하남검단산행, 마천행)
 * 3호선, 4호선, 수인분당선, 경의중앙선 등
 */

import { SubwayLineBranch, SubwayLineStation, SubwayPosition } from '@/types/journey';

export interface BranchStationData {
  branch: SubwayLineBranch;
  stationNames: string[];
  /** 상행(updnLine='0') 시 유효 종착역(statnTnm) 목록 */
  upDestinations?: string[];
  /** 하행(updnLine='1') 시 유효 종착역(statnTnm) 목록 */
  downDestinations?: string[];
}

export interface LineBranchesConfig {
  subwayNm: string;
  subwayId: string;
  branches: BranchStationData[];
}

// ─── 1호선 운행 계통 ─────────────────────────────────────────────────────────

const LINE_1_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '1-gyeongbu-sinchang',
      name: '경부선 (청량리 - 신창)',
      startStation: '청량리',
      endStation: '신창',
      stationCount: 52,
    },
    stationNames: [
      '청량리', '제기동', '신설동', '동묘앞', '동대문', '종로5가', '종로3가', '종각', '시청', '서울역',
      '남영', '용산', '노량진', '대방', '신길', '영등포', '신도림', '구로', '가산디지털단지', '독산',
      '금천구청', '석수', '관악', '안양', '명학', '금정', '군포', '당정', '의왕', '성균관대',
      '화서', '수원', '세류', '병점', '세마', '오산대', '오산', '진위', '송탄', '서정리',
      '평택지제', '평택', '성환', '직산', '두정', '천안', '봉명', '쌍용', '아산', '탕정',
      '배방', '온양온천', '신창'
    ],
    // 하행: 신창/천안/수원/병점 등 (서동탄행, 인천행, 광명행 제외)
    downDestinations: ['신창', '천안', '병점', '수원', '평택', '오산', '서정리', '성환', '배방', '온양온천'],
    // 상행: 청량리, 광운대, 의정부, 양주, 동두천, 소요산, 연천, 서울역, 용산, 구로 등
    upDestinations: ['청량리', '광운대', '의정부', '양주', '동두천', '소요산', '연천', '서울역', '용산', '구로', '영등포', '창동'],
  },
  {
    branch: {
      id: '1-seodongtan-branch',
      name: '서동탄 지선 (청량리 - 서동탄)',
      startStation: '청량리',
      endStation: '서동탄',
      stationCount: 35,
    },
    stationNames: [
      '청량리', '제기동', '신설동', '동묘앞', '동대문', '종로5가', '종로3가', '종각', '시청', '서울역',
      '남영', '용산', '노량진', '대방', '신길', '영등포', '신도림', '구로', '가산디지털단지', '독산',
      '금천구청', '석수', '관악', '안양', '명학', '금정', '군포', '당정', '의왕', '성균관대',
      '화서', '수원', '세류', '병점', '서동탄'
    ],
    // 하행: 서동탄행만 엄격 필터링
    downDestinations: ['서동탄'],
    upDestinations: ['청량리', '광운대', '의정부', '양주', '동두천', '소요산', '연천', '서울역', '용산', '구로', '영등포'],
  },
  {
    branch: {
      id: '1-gyeongin-incheon',
      name: '경인선 (소요산 - 인천)',
      startStation: '소요산',
      endStation: '인천',
      stationCount: 42,
    },
    stationNames: [
      '소요산', '동두천', '보산', '동두천중앙', '지행', '덕정', '덕계', '양주', '녹양', '가능',
      '의정부', '회룡', '망월사', '도봉산', '도봉', '방학', '창동', '쌍문', '수유', '미아',
      '광운대', '월계', '녹천', '석계', '신이문', '외대앞', '회기', '청량리', '제기동',
      '신설동', '동묘앞', '동대문', '종로5가', '종로3가', '종각', '시청', '서울역', '남영', '용산',
      '노량진', '대방', '신길', '영등포', '신도림', '구로', '구일', '개봉', '오류동', '온수',
      '역곡', '소사', '부천', '중동', '송내', '부개', '부평', '백운', '동암', '간석',
      '주안', '도화', '제물포', '도원', '동인천', '인천'
    ],
    // 하행: 인천/동인천/부평/부천 등
    downDestinations: ['인천', '동인천', '부평', '부천', '구로', '온수', '주안', '송내'],
    upDestinations: ['용산', '청량리', '광운대', '의정부', '양주', '동두천', '소요산', '연천', '서울역', '창동'],
  },
  {
    branch: {
      id: '1-gyeongwon-yeoncheon',
      name: '경원선 (용산 - 연천)',
      startStation: '용산',
      endStation: '연천',
      stationCount: 35,
    },
    stationNames: [
      '용산', '남영', '서울역', '시청', '종각', '종로3가', '종로5가', '동대문', '동묘앞', '신설동',
      '제기동', '청량리', '회기', '외대앞', '신이문', '석계', '광운대', '월계', '녹천', '창동',
      '방학', '도봉', '도봉산', '망월사', '회룡', '의정부', '가능', '녹양', '양주', '덕계',
      '덕정', '지행', '동두천중앙', '보산', '동두천', '소요산', '청산', '전곡', '연천'
    ],
    downDestinations: ['용산', '서울역', '청량리', '구로', '인천', '신창', '천안'],
    upDestinations: ['연천', '소요산', '동두천', '양주', '의정부', '창동', '광운대', '청량리'],
  },
  {
    branch: {
      id: '1-gwangmyeong-shuttle',
      name: '광명 셔틀선 (영등포 - 광명)',
      startStation: '영등포',
      endStation: '광명',
      stationCount: 7,
    },
    stationNames: [
      '영등포', '신도림', '구로', '가산디지털단지', '독산', '금천구청', '광명'
    ],
    downDestinations: ['광명'],
    upDestinations: ['영등포', '구로'],
  },
];

// ─── 2호선 운행 계통 ─────────────────────────────────────────────────────────

const LINE_2_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '2-main-circle',
      name: '본선 순환 (시청 ↔ 시청)',
      startStation: '시청',
      endStation: '시청',
      stationCount: 44,
    },
    stationNames: [
      '시청', '을지로입구', '을지로3가', '을지로4가', '동대문역사문화공원', '신당', '상왕십리', '왕십리',
      '한양대', '뚝섬', '성수', '건대입구', '구의', '강변', '잠실나루', '잠실', '잠실새내', '종합운동장',
      '삼성', '선릉', '역삼', '강남', '교대', '서초', '방배', '사당', '낙성대', '서울대입구',
      '봉천', '신림', '신대방', '구로디지털단지', '대림', '신도림', '문래', '영등포구청', '당산',
      '합정', '홍대입구', '신촌', '이대', '아현', '충정로', '시청'
    ],
  },
  {
    branch: {
      id: '2-sinjeong-branch',
      name: '신정지선 (신도림 - 까치산)',
      startStation: '신도림',
      endStation: '까치산',
      stationCount: 5,
    },
    stationNames: ['신도림', '도림천', '양천구청', '신정네거리', '까치산'],
    downDestinations: ['까치산'],
    upDestinations: ['신도림'],
  },
  {
    branch: {
      id: '2-seongsu-branch',
      name: '성수지선 (성수 - 신설동)',
      startStation: '성수',
      endStation: '신설동',
      stationCount: 5,
    },
    stationNames: ['성수', '용답', '신답', '용두', '신설동'],
    downDestinations: ['신설동'],
    upDestinations: ['성수'],
  },
];

// ─── 5호선 운행 계통 ─────────────────────────────────────────────────────────

const LINE_5_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '5-hanam-branch',
      name: '하남검단산행 (방화 - 하남검단산)',
      startStation: '방화',
      endStation: '하남검단산',
      stationCount: 45,
    },
    stationNames: [
      '방화', '개화산', '김포공항', '송정', '마곡', '발산', '우장산', '화곡', '까치산', '신정',
      '목동', '오목교', '양평', '영등포구청', '영등포시장', '신길', '여의도', '여의나루', '마포', '공덕',
      '애오개', '충정로', '서대문', '광화문', '종로3가', '을지로4가', '동대문역사문화공원', '청구', '신금호', '행당',
      '왕십리', '마장', '답십리', '장한평', '군자', '아차산', '광나루', '천호', '강동', '길동',
      '굽은다리', '명일', '고덕', '상일동', '강일', '미사', '하남풍산', '하남시청', '하남검단산'
    ],
    downDestinations: ['하남검단산', '하남풍산', '상일동', '강동'],
    upDestinations: ['방화', '화곡', '여의도'],
  },
  {
    branch: {
      id: '5-macheon-branch',
      name: '마천행 (방화 - 마천)',
      startStation: '방화',
      endStation: '마천',
      stationCount: 40,
    },
    stationNames: [
      '방화', '개화산', '김포공항', '송정', '마곡', '발산', '우장산', '화곡', '까치산', '신정',
      '목동', '오목교', '양평', '영등포구청', '영등포시장', '신길', '여의도', '여의나루', '마포', '공덕',
      '애오개', '충정로', '서대문', '광화문', '종로3가', '을지로4가', '동대문역사문화공원', '청구', '신금호', '행당',
      '왕십리', '마장', '답십리', '장한평', '군자', '아차산', '광나루', '천호', '강동', '둔촌동',
      '올림픽공원', '방이', '오금', '개롱', '거여', '마천'
    ],
    downDestinations: ['마천', '오금', '강동'],
    upDestinations: ['방화', '화곡', '여의도'],
  },
];

// ─── 전체 노선별 계통 매핑 ───────────────────────────────────────────────────

export const LINE_BRANCHES_MAP: Record<string, BranchStationData[]> = {
  '1호선': LINE_1_BRANCHES,
  '1001': LINE_1_BRANCHES,
  '1': LINE_1_BRANCHES,
  '2호선': LINE_2_BRANCHES,
  '1002': LINE_2_BRANCHES,
  '2': LINE_2_BRANCHES,
  '5호선': LINE_5_BRANCHES,
  '1005': LINE_5_BRANCHES,
  '5': LINE_5_BRANCHES,
};

/**
 * 노선명 또는 subwayId를 정규화 키로 변환
 */
export function normalizeLineKey(subwayIdOrNm: string): string {
  const clean = String(subwayIdOrNm || '').trim();
  if (clean === '1001' || clean === '1' || clean.includes('1호선')) return '1호선';
  if (clean === '1002' || clean === '2' || clean.includes('2호선')) return '2호선';
  if (clean === '1003' || clean === '3' || clean.includes('3호선')) return '3호선';
  if (clean === '1004' || clean === '4' || clean.includes('4호선')) return '4호선';
  if (clean === '1005' || clean === '5' || clean.includes('5호선')) return '5호선';
  if (clean === '1006' || clean === '6' || clean.includes('6호선')) return '6호선';
  if (clean === '1007' || clean === '7' || clean.includes('7호선')) return '7호선';
  if (clean === '1008' || clean === '8' || clean.includes('8호선')) return '8호선';
  if (clean === '1009' || clean === '9' || clean.includes('9호선')) return '9호선';
  if (clean.includes('수인분당') || clean.includes('분당')) return '수인분당선';
  if (clean.includes('신분당')) return '신분당선';
  if (clean.includes('경의중앙')) return '경의중앙선';
  if (clean.includes('공항철도')) return '공항철도';
  return clean;
}

/**
 * branchId로 계통 데이터 단건 조회
 */
export function getBranchDataById(
  subwayIdOrNm: string,
  branchId?: string
): BranchStationData | undefined {
  if (!branchId) return undefined;
  const lineKey = normalizeLineKey(subwayIdOrNm);
  const branchList = LINE_BRANCHES_MAP[lineKey];
  return branchList?.find((b) => b.branch.id === branchId);
}

/**
 * 특정 열차가 현재 선택된 운행 계통(Branch)에 부합하는지 판별
 */
export function isTrainMatchingBranch(
  position: SubwayPosition,
  branchData: BranchStationData | undefined,
  direction: '0' | '1' // 0: 상행, 1: 하행
): boolean {
  if (!branchData) return true; // 다중 계통이 없거나 정의되지 않은 경우 모두 허용

  const cleanDest = (position.statnTnm || '').replace(/역$/, '').trim();
  const cleanCurrentStatn = (position.statnNm || '').replace(/역$/, '').trim();

  // 1. 열차의 현재 위치가 해당 계통의 정차역 목록에 속해 있는지 확인
  const isCurrentOnBranch = branchData.stationNames.some(
    (st) => st.replace(/역$/, '').trim() === cleanCurrentStatn
  );
  if (!isCurrentOnBranch) {
    return false;
  }

  // 2. 종착역(statnTnm) 기준 유효성 검사 (정의되어 있는 경우)
  const validDests = direction === '0' ? branchData.upDestinations : branchData.downDestinations;
  if (validDests && validDests.length > 0 && cleanDest) {
    const isDestValid = validDests.some(
      (valid) => valid.replace(/역$/, '').trim() === cleanDest
    );
    if (!isDestValid) {
      return false;
    }
  }

  return true;
}

/**
 * 특정 노선의 운행 계통 목록 및 기본 선택 계통, 정차역 목록 반환
 */
export function getLineBranchesAndStations(
  subwayIdOrNm: string,
  requestedBranchId?: string,
  currentStationName?: string
): {
  branches: SubwayLineBranch[];
  selectedBranchId: string;
  stations: SubwayLineStation[];
} {
  const lineKey = normalizeLineKey(subwayIdOrNm);
  const branchList = LINE_BRANCHES_MAP[lineKey];

  const cleanTargetStation = currentStationName
    ? currentStationName.replace(/역$/, '').trim()
    : '';

  // 1. 다중 운행 계통이 정의된 노선 (1호선, 2호선, 5호선 등)
  if (branchList && branchList.length > 0) {
    const branches: SubwayLineBranch[] = branchList.map((b) => ({
      ...b.branch,
      stationCount: b.stationNames.length,
    }));

    let activeBranchData: BranchStationData | undefined;

    if (requestedBranchId) {
      activeBranchData = branchList.find((b) => b.branch.id === requestedBranchId);
    }

    if (!activeBranchData && cleanTargetStation) {
      activeBranchData = branchList.find((b) =>
        b.stationNames.some((st) => st.replace(/역$/, '').trim() === cleanTargetStation)
      );
    }

    if (!activeBranchData) {
      activeBranchData = branchList[0];
    }

    const stations: SubwayLineStation[] = activeBranchData.stationNames.map((stName, idx) => ({
      index: idx,
      stationName: stName.endsWith('역') ? stName : `${stName}역`,
    }));

    return {
      branches,
      selectedBranchId: activeBranchData.branch.id,
      stations,
    };
  }

  // 2. 단일 계통 노선은 빈 branches 반환 (UI에서 탭 숨김)
  return {
    branches: [],
    selectedBranchId: '',
    stations: [],
  };
}
