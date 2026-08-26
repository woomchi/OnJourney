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

// ─── 9호선 운행 계통 ─────────────────────────────────────────────────────────

const LINE_9_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '9-main-all',
      name: '일반 (개화 - 중앙보훈병원)',
      startStation: '개화',
      endStation: '중앙보훈병원',
      stationCount: 38,
    },
    stationNames: [
      '개화', '김포공항', '공항시장', '신방화', '마곡나루', '양천향교', '가양', '증미', '등촌', '염창',
      '신목동', '선유도', '당산', '국회의사당', '여의도', '샛강', '노량진', '노들', '흑석', '동작',
      '구반포', '신반포', '고속터미널', '사평', '신논현', '언주', '선정릉', '삼성중앙', '봉은사', '종합운동장',
      '삼전', '석촌고분', '석촌', '송파나루', '한성백제', '올림픽공원', '둔촌오륜', '중앙보훈병원'
    ],
    downDestinations: ['중앙보훈병원', '신논현', '종합운동장', '삼전', '동작'],
    upDestinations: ['개화', '김포공항', '가양', '당산', '여의도', '노량진'],
  },
  {
    branch: {
      id: '9-express-all',
      name: '급행 (김포공항 - 중앙보훈병원)',
      startStation: '김포공항',
      endStation: '중앙보훈병원',
      stationCount: 16,
    },
    stationNames: [
      '김포공항', '마곡나루', '가양', '염창', '당산', '여의도', '노량진', '동작',
      '고속터미널', '신논현', '선정릉', '봉은사', '종합운동장', '석촌', '올림픽공원', '중앙보훈병원'
    ],
    downDestinations: ['중앙보훈병원', '신논현', '종합운동장'],
    upDestinations: ['김포공항', '가양', '당산'],
  },
];

// ─── 신분당선 운행 계통 ───────────────────────────────────────────────────────

const LINE_SHINBUNDANG_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'shinbundang-main',
      name: '본선 (신사 - 광교)',
      startStation: '신사',
      endStation: '광교',
      stationCount: 16,
    },
    stationNames: [
      '신사', '논현', '신논현', '강남', '양재', '양재시민의숲', '청계산입구',
      '판교', '정자', '미금', '동천', '수지구청', '성복', '상현', '광교중앙', '광교'
    ],
    downDestinations: ['광교', '광교중앙', '정자'],
    upDestinations: ['신사', '강남'],
  },
];

// ─── 공항철도 운행 계통 ───────────────────────────────────────────────────────

const LINE_AIRPORT_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'airport-main',
      name: '일반 (서울역 - 인천공항2터미널)',
      startStation: '서울역',
      endStation: '인천공항2터미널',
      stationCount: 14,
    },
    stationNames: [
      '서울역', '공덕', '홍대입구', '디지털미디어시티', '마곡나루', '김포공항', '계양',
      '검암', '청라국제도시', '영종', '운서', '공항화물청사', '인천공항1터미널', '인천공항2터미널'
    ],
    downDestinations: ['인천공항2터미널', '인천공항1터미널', '검암'],
    upDestinations: ['서울역', '디지털미디어시티'],
  },
];

// ─── 우이신설선 운행 계통 ─────────────────────────────────────────────────────

const LINE_UI_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'ui-main',
      name: '본선 (북한산우이 - 신설동)',
      startStation: '북한산우이',
      endStation: '신설동',
      stationCount: 13,
    },
    stationNames: [
      '북한산우이', '솔밭공원', '4.19민주묘지', '가오리', '화계', '삼양', '삼양사거리',
      '솔샘', '북한산보국문', '정릉', '성신여대입구', '보문', '신설동'
    ],
    downDestinations: ['신설동'],
    upDestinations: ['북한산우이'],
  },
];

// ─── 대전 1호선 운행 계통 ───────────────────────────────────────────────────

const LINE_DAEJEON_1_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'daejeon-1-main',
      name: '대전 1호선 (판암 - 반석)',
      startStation: '판암',
      endStation: '반석',
      stationCount: 22,
    },
    stationNames: [
      '판암', '신흥', '대동', '대전역', '중앙로', '중구청', '서대전네거리', '오룡', '용문', '탄방',
      '시청', '정부청사', '갈마', '월평', '갑천', '유성온천', '구암', '현충원', '월드컵경기장', '노은',
      '지족', '반석'
    ],
    downDestinations: ['반석'],
    upDestinations: ['판암'],
  },
];

// ─── 3호선 운행 계통 ─────────────────────────────────────────────────────────

const LINE_3_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '3-main',
      name: '본선 (대화 - 오금)',
      startStation: '대화',
      endStation: '오금',
      stationCount: 44,
    },
    stationNames: [
      '대화', '주엽', '정발산', '마두', '백석', '대곡', '화정', '원당', '원흥', '삼송',
      '지축', '구파발', '연신내', '불광', '녹번', '홍제', '무악재', '독립문', '경복궁', '안국',
      '종로3가', '을지로3가', '충무로', '동대입구', '약수', '금호', '옥수', '압구정', '신사', '잠원',
      '고속터미널', '교대', '남부터미널', '양재', '매봉', '도곡', '대치', '학여울', '대청', '일원',
      '수서', '가락시장', '경찰병원', '오금'
    ],
    downDestinations: ['오금', '수서', '압구정', '도곡'],
    upDestinations: ['대화', '구파발', '독립문', '삼송'],
  },
];

// ─── 4호선 운행 계통 ─────────────────────────────────────────────────────────

const LINE_4_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '4-main',
      name: '본선 (진접 - 오이도)',
      startStation: '진접',
      endStation: '오이도',
      stationCount: 51,
    },
    stationNames: [
      '진접', '오남', '별내별가람', '당고개', '상계', '노원', '창동', '쌍문', '수유', '미아',
      '미아사거리', '길음', '성신여대입구', '한성대입구', '혜화', '동대문', '동대문역사문화공원', '충무로', '명동', '회현',
      '서울역', '숙대입구', '삼각지', '신용산', '이촌', '동작', '총신대입구', '사당', '남태령', '선바위',
      '경마공원', '대공원', '과천', '정부과천청사', '인덕원', '평촌', '범계', '금정', '산본', '수리산',
      '대야미', '반월', '상록수', '한대앞', '중앙', '고잔', '초지', '안산', '신길온천', '정왕',
      '오이도'
    ],
    downDestinations: ['오이도', '안산', '사당', '금정', '남태령'],
    upDestinations: ['진접', '당고개', '노원', '창동', '한성대입구', '혜화', '서울역'],
  },
];

// ─── 6호선 운행 계통 ─────────────────────────────────────────────────────────

const LINE_6_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '6-main',
      name: '본선 (응암순환 - 신내)',
      startStation: '응암',
      endStation: '신내',
      stationCount: 39,
    },
    stationNames: [
      '응암', '역촌', '불광', '독바위', '연신내', '구산', '새절', '증산', '디지털미디어시티', '월드컵경기장',
      '마포구청', '망원', '합정', '상수', '광흥창', '대흥', '공덕', '효창공원앞', '삼각지', '녹사평',
      '이태원', '한강진', '버티고개', '약수', '청구', '신당', '동묘앞', '창신', '보문', '안암',
      '고려대', '월곡', '상월곡', '돌곶이', '석계', '태릉입구', '화랑대', '봉화산', '신내'
    ],
    downDestinations: ['신내', '봉화산', '안암'],
    upDestinations: ['응암', '응암순환', '새절', '디지털미디어시티', '공덕'],
  },
];

// ─── 7호선 운행 계통 ─────────────────────────────────────────────────────────

const LINE_7_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '7-main',
      name: '본선 (장암 - 석남)',
      startStation: '장암',
      endStation: '석남',
      stationCount: 53,
    },
    stationNames: [
      '장암', '도봉산', '수락산', '마들', '노원', '중계', '하계', '공릉', '태릉입구', '먹골',
      '중화', '상봉', '면목', '사가정', '용마산', '중곡', '군자', '어린이대공원', '건대입구', '뚝섬유원지',
      '청담', '강남구청', '학동', '논현', '반포', '고속터미널', '내방', '이수', '남성', '숭실대입구',
      '상도', '장승배기', '신대방삼거리', '보라매', '신풍', '대림', '남구로', '가산디지털단지', '철산', '광명사거리',
      '천왕', '온수', '까치울', '부천종합운동장', '춘의', '신중동', '부천시청', '상동', '삼산체육관', '굴포천',
      '부평구청', '산곡', '석남'
    ],
    downDestinations: ['석남', '부평구청', '온수', '신풍', '내방'],
    upDestinations: ['장암', '도봉산', '수락산', '태릉입구', '건대입구', '청담'],
  },
];

// ─── 8호선 운행 계통 (별내선 연장구간 포함) ───────────────────────────────────

const LINE_8_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: '8-main',
      name: '본선 (별내 - 모란)',
      startStation: '별내',
      endStation: '모란',
      stationCount: 24,
    },
    stationNames: [
      '별내', '다산', '동구릉', '구리', '장자호수공원', '암사역사공원', '암사', '천호', '강동구청', '몽촌토성',
      '잠실', '석촌', '송파', '가락시장', '문정', '장지', '복정', '남위례', '산성', '남한산성입구',
      '단대오거리', '신흥', '수진', '모란'
    ],
    downDestinations: ['모란', '잠실'],
    upDestinations: ['별내', '암사', '잠실'],
  },
];

// ─── 수인분당선 운행 계통 ───────────────────────────────────────────────────

const LINE_SUIN_BUNDANG_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'suin-bundang-main',
      name: '본선 (청량리 - 인천)',
      startStation: '청량리',
      endStation: '인천',
      stationCount: 63,
    },
    stationNames: [
      '청량리', '왕십리', '서울숲', '압구정로데오', '강남구청', '선정릉', '선릉', '한티', '도곡', '구룡',
      '개포동', '대모산입구', '수서', '복정', '가천대', '태평', '모란', '야탑', '이매', '서현',
      '수내', '정자', '미금', '오리', '죽전', '보정', '구성', '신갈', '기흥', '상갈',
      '청명', '영통', '망포', '매탄권선', '수원시청', '매교', '수원', '고색', '오목천', '어천',
      '야목', '사리', '한대앞', '중앙', '고잔', '초지', '안산', '신길온천', '정왕', '오이도',
      '달월', '월곶', '소래포구', '인천논현', '호구포', '남동인더스파크', '원인재', '연수', '송도', '인하대',
      '숭의', '신포', '인천'
    ],
    downDestinations: ['인천', '오이도', '고색', '수원', '죽전'],
    upDestinations: ['청량리', '왕십리', '수서', '죽전'],
  },
];

// ─── 경의중앙선 운행 계통 ───────────────────────────────────────────────────

const LINE_GYEONGUI_JUNGANG_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'gyeongui-jungang-main',
      name: '본선 (문산 - 지평)',
      startStation: '문산',
      endStation: '지평',
      stationCount: 56,
    },
    stationNames: [
      '문산', '파주', '월롱', '금촌', '금릉', '운정', '야당', '탄현', '일산', '풍산',
      '백마', '곡산', '대곡', '능곡', '행신', '강매', '화전', '수색', '디지털미디어시티', '가좌',
      '홍대입구', '서강대', '공덕', '효창공원앞', '용산', '이촌', '서빙고', '한남', '옥수', '응봉',
      '왕십리', '청량리', '회기', '중랑', '상봉', '망우', '양원', '구리', '도농', '양정',
      '덕소', '도심', '팔당', '운길산', '양수', '신원', '국수', '아신', '오빈', '양평',
      '원덕', '용문', '지평'
    ],
    downDestinations: ['지평', '용문', '양평', '덕소', '팔당', '청량리', '용산'],
    upDestinations: ['문산', '일산', '대곡', '디지털미디어시티', '용산'],
  },
  {
    branch: {
      id: 'gyeongui-jungang-seoul',
      name: '서울역 지선 (문산 - 서울역)',
      startStation: '문산',
      endStation: '서울역',
      stationCount: 21,
    },
    stationNames: [
      '문산', '파주', '월롱', '금촌', '금릉', '운정', '야당', '탄현', '일산', '풍산',
      '백마', '곡산', '대곡', '능곡', '행신', '강매', '화전', '수색', '디지털미디어시티', '가좌',
      '신촌', '서울역'
    ],
    downDestinations: ['서울역'],
    upDestinations: ['문산', '일산', '대곡', '디지털미디어시티'],
  },
];

// ─── 경춘선 운행 계통 ───────────────────────────────────────────────────────

const LINE_GYEONGCHUN_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'gyeongchun-main',
      name: '본선 (청량리 - 춘천)',
      startStation: '청량리',
      endStation: '춘천',
      stationCount: 25,
    },
    stationNames: [
      '청량리', '회기', '중랑', '상봉', '망우', '신내', '갈매', '별내', '퇴계원', '사릉',
      '금곡', '평내호평', '천마산', '마석', '대성리', '청평', '상천', '가평', '굴봉산', '백양리',
      '강촌', '김유정', '남춘천', '춘천'
    ],
    downDestinations: ['춘천', '남춘천', '마석', '평내호평'],
    upDestinations: ['청량리', '상봉', '망우'],
  },
];

// ─── 서해선 운행 계통 ───────────────────────────────────────────────────────

const LINE_SEOHAE_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'seohae-main',
      name: '본선 (일산 - 원시)',
      startStation: '일산',
      endStation: '원시',
      stationCount: 20,
    },
    stationNames: [
      '일산', '풍산', '백마', '곡산', '대곡', '능곡', '김포공항', '원종', '부천종합운동장', '소새울',
      '시흥대야', '신천', '신현', '시흥시청', '시흥능곡', '달미', '선부', '초지', '원곡', '원시'
    ],
    downDestinations: ['원시', '시흥시청'],
    upDestinations: ['일산', '대곡', '김포공항'],
  },
];

// ─── 경강선 운행 계통 ───────────────────────────────────────────────────────

const LINE_GYEONGGANG_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'gyeonggang-main',
      name: '본선 (판교 - 여주)',
      startStation: '판교',
      endStation: '여주',
      stationCount: 11,
    },
    stationNames: [
      '판교', '이매', '삼동', '경기광주', '초월', '곤지암', '신둔도예촌', '이천', '부발', '세종대왕릉', '여주'
    ],
    downDestinations: ['여주', '부발'],
    upDestinations: ['판교'],
  },
];

// ─── 신림선 운행 계통 ───────────────────────────────────────────────────────

const LINE_SILLIM_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'sillim-main',
      name: '본선 (샛강 - 관악산)',
      startStation: '샛강',
      endStation: '관악산',
      stationCount: 11,
    },
    stationNames: [
      '샛강', '대방', '서울지방병무청', '보라매', '보라매공원', '보라매병원', '당곡', '신림', '서원', '서울대벤처타운', '관악산'
    ],
    downDestinations: ['관악산'],
    upDestinations: ['샛강'],
  },
];

// ─── 인천 1호선 운행 계통 ───────────────────────────────────────────────────

const LINE_INCHEON_1_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'incheon-1-main',
      name: '본선 (계양 - 송도달빛축제공원)',
      startStation: '계양',
      endStation: '송도달빛축제공원',
      stationCount: 30,
    },
    stationNames: [
      '계양', '귤현', '박촌', '임학', '계산', '경인교대입구', '작전', '갈산', '부평구청', '부평시장',
      '부평', '동수', '부평삼거리', '간석오거리', '인천시청', '예술회관', '인천터미널', '문학경기장', '선학', '신연수',
      '원인재', '동춘', '동막', '캠퍼스타운', '테크노파크', '지식정보단지', '인천대입구', '센트럴파크', '국제업무지구', '송도달빛축제공원'
    ],
    downDestinations: ['송도달빛축제공원', '국제업무지구', '동막'],
    upDestinations: ['계양', '박촌'],
  },
];

// ─── 인천 2호선 운행 계통 ───────────────────────────────────────────────────

const LINE_INCHEON_2_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'incheon-2-main',
      name: '본선 (검단오류 - 운연)',
      startStation: '검단오류',
      endStation: '운연',
      stationCount: 27,
    },
    stationNames: [
      '검단오류', '왕길', '검단사거리', '마전', '완정', '독정', '검암', '검바위', '아시아드주경기장', '서구청',
      '가정', '가정중앙시장', '석남', '서부여성회관', '인천가좌', '가재울', '주안국가산단', '주안', '시민공원', '석바위시장',
      '인천시청', '석천사거리', '모래내시장', '만수', '남동구청', '인천대공원', '운연'
    ],
    downDestinations: ['운연'],
    upDestinations: ['검단오류', '검암'],
  },
];

// ─── GTX-A 운행 계통 ─────────────────────────────────────────────────────────

const LINE_GTX_A_BRANCHES: BranchStationData[] = [
  {
    branch: {
      id: 'gtx-a-south',
      name: '남부선 (수서 - 동탄)',
      startStation: '수서',
      endStation: '동탄',
      stationCount: 4,
    },
    stationNames: ['수서', '성남', '구성', '동탄'],
    downDestinations: ['동탄'],
    upDestinations: ['수서'],
  },
];

// ─── 전체 노선별 계통 매핑 ───────────────────────────────────────────────────

export const LINE_BRANCHES_MAP: Record<string, BranchStationData[]> = {
  // 1. 지방 도시철도
  '대전1호선': LINE_DAEJEON_1_BRANCHES,

  // 2. 수도권 1~9호선
  '1호선': LINE_1_BRANCHES,
  '1001': LINE_1_BRANCHES,
  '1': LINE_1_BRANCHES,
  '2호선': LINE_2_BRANCHES,
  '1002': LINE_2_BRANCHES,
  '2': LINE_2_BRANCHES,
  '3호선': LINE_3_BRANCHES,
  '1003': LINE_3_BRANCHES,
  '3': LINE_3_BRANCHES,
  '4호선': LINE_4_BRANCHES,
  '1004': LINE_4_BRANCHES,
  '4': LINE_4_BRANCHES,
  '5호선': LINE_5_BRANCHES,
  '1005': LINE_5_BRANCHES,
  '5': LINE_5_BRANCHES,
  '6호선': LINE_6_BRANCHES,
  '1006': LINE_6_BRANCHES,
  '6': LINE_6_BRANCHES,
  '7호선': LINE_7_BRANCHES,
  '1007': LINE_7_BRANCHES,
  '7': LINE_7_BRANCHES,
  '8호선': LINE_8_BRANCHES,
  '1008': LINE_8_BRANCHES,
  '8': LINE_8_BRANCHES,
  '9호선': LINE_9_BRANCHES,
  '1009': LINE_9_BRANCHES,
  '9': LINE_9_BRANCHES,

  // 3. 수도권 광역/특수 노선
  '신분당선': LINE_SHINBUNDANG_BRANCHES,
  '1077': LINE_SHINBUNDANG_BRANCHES,
  '수인분당선': LINE_SUIN_BUNDANG_BRANCHES,
  '1075': LINE_SUIN_BUNDANG_BRANCHES,
  '경의중앙선': LINE_GYEONGUI_JUNGANG_BRANCHES,
  '1063': LINE_GYEONGUI_JUNGANG_BRANCHES,
  '경춘선': LINE_GYEONGCHUN_BRANCHES,
  '1067': LINE_GYEONGCHUN_BRANCHES,
  '서해선': LINE_SEOHAE_BRANCHES,
  '1093': LINE_SEOHAE_BRANCHES,
  '경강선': LINE_GYEONGGANG_BRANCHES,
  '1081': LINE_GYEONGGANG_BRANCHES,
  '공항철도': LINE_AIRPORT_BRANCHES,
  '1065': LINE_AIRPORT_BRANCHES,
  '우이신설선': LINE_UI_BRANCHES,
  '1092': LINE_UI_BRANCHES,
  '신림선': LINE_SILLIM_BRANCHES,
  '1095': LINE_SILLIM_BRANCHES,
  '인천1호선': LINE_INCHEON_1_BRANCHES,
  '1069': LINE_INCHEON_1_BRANCHES,
  '인천2호선': LINE_INCHEON_2_BRANCHES,
  '1070': LINE_INCHEON_2_BRANCHES,
  'GTX-A': LINE_GTX_A_BRANCHES,
  '1094': LINE_GTX_A_BRANCHES,
};

/**
 * 노선명 또는 subwayId를 정규화 키로 변환
 */
export function normalizeLineKey(subwayIdOrNm: string): string {
  const clean = String(subwayIdOrNm || '').trim();

  // 1. 지방 도시철도 우선
  if (clean.includes('대전')) return '대전1호선';
  if (clean.includes('부산')) {
    const m = clean.match(/\d/);
    return m ? `부산${m[0]}호선` : '부산1호선';
  }
  if (clean.includes('대구')) {
    const m = clean.match(/\d/);
    return m ? `대구${m[0]}호선` : '대구1호선';
  }
  if (clean.includes('광주')) return '광주1호선';

  // 2. 수도권 특수 노선 및 광역/경전철
  if (clean.includes('신분당') || clean === '1077') return '신분당선';
  if (clean.includes('수인분당') || clean.includes('분당선') || clean.includes('수인선') || clean === '1075') return '수인분당선';
  if (clean.includes('경의중앙') || clean.includes('경의선') || clean.includes('중앙선') || clean === '1063') return '경의중앙선';
  if (clean.includes('공항철도') || clean === '1065') return '공항철도';
  if (clean.includes('우이신설') || clean === '1092') return '우이신설선';
  if (clean.includes('경춘') || clean === '1067') return '경춘선';
  if (clean.includes('서해') || clean === '1093') return '서해선';
  if (clean.includes('경강') || clean === '1081') return '경강선';
  if (clean.includes('신림') || clean === '1095') return '신림선';
  if (clean.includes('인천1') || clean.includes('인천 1') || clean === '1069') return '인천1호선';
  if (clean.includes('인천2') || clean.includes('인천 2') || clean === '1070') return '인천2호선';
  if (clean.includes('GTX-A') || clean.includes('gtx-a') || clean === '1094') return 'GTX-A';

  // 3. 수도권 1~9호선
  if (clean === '1001' || clean === '1' || clean === '1호선' || clean === '수도권 1호선') return '1호선';
  if (clean === '1002' || clean === '2' || clean === '2호선' || clean === '수도권 2호선') return '2호선';
  if (clean === '1003' || clean === '3' || clean === '3호선' || clean === '수도권 3호선') return '3호선';
  if (clean === '1004' || clean === '4' || clean === '4호선' || clean === '수도권 4호선') return '4호선';
  if (clean === '1005' || clean === '5' || clean === '5호선' || clean === '수도권 5호선') return '5호선';
  if (clean === '1006' || clean === '6' || clean === '6호선' || clean === '수도권 6호선') return '6호선';
  if (clean === '1007' || clean === '7' || clean === '7호선' || clean === '수도권 7호선') return '7호선';
  if (clean === '1008' || clean === '8' || clean === '8호선' || clean === '수도권 8호선') return '8호선';
  if (clean === '1009' || clean === '9' || clean === '9호선' || clean === '수도권 9호선') return '9호선';

  if (/^\d+호선$/.test(clean)) return clean;
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
 * 특정 열차가 현재 선택된 운행 계통(Branch)에 부합하는지 판별합니다.
 * 
 * 공유 구간(Shared Segment) 지원:
 * - 열차가 현재 위치한 역이 선택된 운행 계통의 정차역 목록에 속해 있다면,
 *   종착역(예: 서동탄행, 신창행, 인천행, 마천행 등)이 서로 다른 분기선이라도
 *   공유 구간을 주행 중인 동안에는 양쪽 계통 탭에 모두 정상 노출됩니다.
 * - 열차가 분기점을 지나 타 지선 전용 역으로 진입한 경우에만 해당 계통에서 자동으로 제외됩니다.
 */
export function isTrainMatchingBranch(
  position: SubwayPosition,
  branchData: BranchStationData | undefined,
  _direction: '0' | '1' // 0: 상행, 1: 하행
): boolean {
  if (!branchData) return true; // 다중 계통이 없거나 정의되지 않은 경우 모두 허용

  const rawStatn = (position.statnNm || '').replace(/역$/, '').trim();
  if (!rawStatn) return true;
  const cleanStatn = rawStatn.replace(/\(.*?\)/g, '').trim();

  // 1. 열차의 현재 위치가 해당 계통의 정차역 목록에 속해 있는지 확인
  const isCurrentOnBranch = branchData.stationNames.some((st) => {
    const rawBranchSt = st.replace(/역$/, '').trim();
    if (rawBranchSt === rawStatn) return true;
    const cleanBranchSt = rawBranchSt.replace(/\(.*?\)/g, '').trim();
    return cleanBranchSt === cleanStatn;
  });

  // 현재 역이 해당 계통의 선로/승강장 위에 위치해 있다면 공유 구간 열차로써 표시 허용
  return isCurrentOnBranch;
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
