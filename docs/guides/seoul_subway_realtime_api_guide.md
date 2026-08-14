# 서울시 지하철 실시간 정보 API 완벽 분석 가이드

본 문서는 서울 열린데이터광장에서 제공하는 지하철 실시간 관련 3대 핵심 API(**실시간 도착정보 OA-12764**, **실시간 도착정보 일괄 OA-15799**, **실시간 열차 위치정보 OA-12601**)의 상세 규격, 파라미터, 응답 필드 코드 체계, 그리고 실무 연동 가이드를 정리한 문서입니다.

---

## 📌 목차
1. [3대 API 한눈에 비교하기](#1-3대-api-한눈에-비교하기)
2. [API 1: 서울시 지하철 실시간 도착정보 (OA-12764)](#2-api-1-서울시-지하철-실시간-도착정보-oa-12764)
3. [API 2: 서울시 지하철 실시간 도착정보 일괄 (OA-15799)](#3-api-2-서울시-지하철-실시간-도착정보-일괄-oa-15799)
4. [API 3: 서울시 지하철 실시간 열차 위치정보 (OA-12601)](#4-api-3-서울시-지하철-실시간-열차-위치정보-oa-12601)
5. [공통 코드 매핑 테이블](#5-공통-코드-매핑-테이블)
6. [실무 구현 시 주의사항 및 모범 사례 (Gotchas & Best Practices)](#6-실무-구현-시-주의사항-및-모범-사례-gotchas--best-practices)
7. [TypeScript 인터페이스 & 예제 코드](#7-typescript-인터페이스--예제-코드)

---

## 1. 3대 API 한눈에 비교하기

| 구분 | ① 실시간 도착정보 (단일역) | ② 실시간 도착정보 (일괄) | ③ 실시간 열차 위치정보 |
| :--- | :--- | :--- | :--- |
| **데이터셋 ID** | `OA-12764` | `OA-15799` | `OA-12601` |
| **서비스 경로** | `realtimeStationArrival` | `realtimeStationArrival/ALL` | `realtimePosition` |
| **조회 기준** | **지하철 역명** (예: 강남, 서울) | **전체 노선/역 일괄** | **노선명** (예: 1호선, 2호선) |
| **주요 목적** | 특정 역 승강장 진입/도착 정보 표시 | 앱/백엔드 서버 전체 역 캐시 동기화 | 노선도 위 실시간 열차 핀/마커 렌더링 |
| **도착 남은 시간(`barvlDt`)** | ✅ 제공 (초 단위) | ✅ 제공 (초 단위) | ❌ 미제공 (열차 위치 상태만 제공) |
| **열차 위치 좌표/역** | 진입역 및 방면 텍스트 | 진입역 및 방면 텍스트 | 열차가 현재 위치한 역 ID/역명 |
| **트래픽/호출 전략** | 사용자 화면 진입 시 온디맨드 호출 | 백엔드 Cron/Batch 캐시용 (30~60초 주기) | 노선도 화면 활성화 시 10~30초 주기 폴링 |

---

## 2. API 1: 서울시 지하철 실시간 도착정보 (OA-12764)

특정 역명을 인자로 전달하여 해당 역에 진입/도착하는 상·하행 열차 목록을 조회합니다.

### 2.1 엔드포인트 URL 구조
```http
GET http://swopenAPI.seoul.go.kr/api/subway/{KEY}/{TYPE}/realtimeStationArrival/{START_INDEX}/{END_INDEX}/{STATN_NM}
```

* **인증키(`KEY`)**: 서울 열린데이터광장에서 발급받은 인증키
* **요청 파일타입(`TYPE`)**: `json` 권장 (`xml`, `xls` 지원)
* **페이징(`START_INDEX`/`END_INDEX`)**: 보통 `0`/`10` 또는 `0`/`20`
* **역명(`STATN_NM`)**: URL 인코딩된 역명 (예: `강남`, `서울`, `시청` - 끝의 '역' 제외 권장)

#### 요청 예시
```bash
# 강남역 실시간 도착정보 (0~5번째)
curl -X GET "http://swopenAPI.seoul.go.kr/api/subway/sample/json/realtimeStationArrival/0/5/%EA%B0%95%EB%82%A8"
```

### 2.2 주요 응답 필드 명세 (`realtimeArrivalList`)

| 필드명 | 타입 | 필드 한글명 | 설명 및 예시 값 |
| :--- | :--- | :--- | :--- |
| `subwayId` | String | 지하철 호선 ID | `1002` (2호선), `1077` (신분당선) |
| `subwayNm` | String | 지하철 호선명 | `2호선`, `신분당선` (일부 환경에서 null일 수 있음) |
| `statnId` | String | 지하철 역 ID | 서울교통공사 고유 역 ID (예: `1002000222`) |
| `statnNm` | String | 지하철 역명 | `강남` |
| `updnLine` | String | 상하행선 구분 | `0`: 상행/내선, `1`: 하행/외선 |
| `trainLineNm` | String | 도착지 방면 | `성수행 - 역삼방면`, `사당행 - 교대방면` |
| `statnFid` | String | 이전 지하철역 ID | `1002000221` |
| `statnTid` | String | 다음 지하철역 ID | `1002000223` |
| `statnList` | String | 연계 호선 ID 목록 | 환승 노선 ID 목록 (예: `1002, 1077`) |
| `btrainSttus` | String | 열차 종류 | `일반`, `급행`, `ITX`, `특급` |
| `barvlDt` | String | 열차 도착 예정 시간 | **단위: 초 (sec)**. `0`인 경우 즉시 진입/도착 상태 |
| `btrainNo` | String | 열차 번호 | `2142` |
| `bstatnId` | String | 종착역 ID | `1002000211` |
| `bstatnNm` | String | 종착역명 | `성수`, `성수(외선)` |
| `recptnDt` | String | 도착정보 생성 시각 | `2026-08-14 17:55:00.0` (보정에 필수) |
| `arvlMsg2` | String | 첫번째 도착 메시지 | `전역 도착`, `3분 20초 후`, `[5]번째 전역 (양재)` |
| `arvlMsg3` | String | 두번째 도착 메시지 | `역삼`, `종합운동장` (현재 열차 위치 역명) |
| `arvlCd` | String | 도착 코드 | `0`: 진입, `1`: 도착, `2`: 출발, `3`: 전역출발, `4`: 전역진입, `5`: 전역도착, `99`: 운행중 |
| `lstcarAt` | String | 막차 여부 | `1`: 막차, `0`: 일반 열차 |

---

## 3. API 2: 서울시 지하철 실시간 도착정보 일괄 (OA-15799)

서울 시내 전체 역의 실시간 도착 정보를 한 번에 대량 조회합니다.

### 3.1 엔드포인트 URL 구조
```http
GET http://swopenAPI.seoul.go.kr/api/subway/{KEY}/{TYPE}/realtimeStationArrival/ALL/{START_INDEX}/{END_INDEX}
```

* **서비스 경로**: `realtimeStationArrival/ALL`
* **페이징**: 일괄 데이터는 수백~수천 건이 반환되므로 페이징 크기를 지정하여 순차 요청하거나 필요한 범위 조회

#### 요청 예시
```bash
# 전체 역 실시간 도착정보 0~100건 조회
curl -X GET "http://swopenAPI.seoul.go.kr/api/subway/sample/json/realtimeStationArrival/ALL/0/100"
```

### 3.2 응답 데이터 구조 및 활용 가이드
* 응답 필드 구조는 OA-12764와 동일한 `realtimeArrivalList` 배열 구조입니다.
* **주요 용도**: 백엔드 스케줄러(Redis 캐싱 레이어)에서 30초~1분마다 서울 전체 지하철 도착 상태를 인메모리에 업데이트할 때 사용합니다.
* **주의**: 프론트엔드 클라이언트에서 직접 호출하면 페이로드 크기와 대역폭 낭비가 심하므로 **반드시 서버 사이드 배치/캐싱용**으로만 사용해야 합니다.

---

## 4. API 3: 서울시 지하철 실시간 열차 위치정보 (OA-12601)

지정된 호선(Line) 전체에서 현재 운행 중인 모든 열차의 실시간 위치와 상태를 조회합니다.

### 4.1 엔드포인트 URL 구조
```http
GET http://swopenAPI.seoul.go.kr/api/subway/{KEY}/{TYPE}/realtimePosition/{START_INDEX}/{END_INDEX}/{SUBWAY_NM}
```

* **호선명(`SUBWAY_NM`)**: URL 인코딩된 호선명 (예: `1호선`, `2호선`, `신분당선`, `경의중앙선` 등)
* **페이징**: 호선 내 동시 운행 열차 수에 맞게 `0`/`100` 정도로 넉넉하게 설정

#### 요청 예시
```bash
# 2호선 실시간 열차 위치 조회
curl -X GET "http://swopenAPI.seoul.go.kr/api/subway/sample/json/realtimePosition/0/100/2%ED%98%B8%EC%84%A0"
```

### 4.2 주요 응답 필드 명세 (`realtimePositionList`)

| 필드명 | 타입 | 필드 한글명 | 설명 및 코드값 |
| :--- | :--- | :--- | :--- |
| `subwayId` | String | 호선 ID | `1002` (2호선) |
| `subwayNm` | String | 호선명 | `2호선` |
| `statnId` | String | 현재 위치 지하철 역 ID | 열차가 위치하거나 접근 중인 역의 고유 ID |
| `statnNm` | String | 현재 위치 지하철 역명 | `강남`, `홍대입구` |
| `trainNo` | String | 열차 번호 | `2130` (4자리) |
| `lastRecptnDt` | String | 최종 수신 날짜 | `20260814` |
| `recptnDt` | String | 생성/수신 일시 | `2026-08-14 17:55:12` |
| `updnLine` | String | 상하행 구분 | `0`: 상행/내선, `1`: 하행/외선 |
| `statnTid` | String | 종착역 ID | 열차의 종착역 ID |
| `statnTnm` | String | 종착역명 | `성수(외선)`, `신설동` |
| `trainSttus` | String | **열차 상태 코드** | `0`: 진입, `1`: 도착, `2`: 출발, `3`: 전역출발 (운행중) |
| `directAt` | String | 급행 여부 | `1`: 급행, `0`: 일반 |
| `lstcarAt` | String | 막차 여부 | `1`: 막차, `0`: 일반 |

---

## 5. 공통 코드 매핑 테이블

### 5.1 호선 ID (`subwayId`) 매핑
서울 열린데이터광장 API 전반에서 사용되는 표준 호선 코드입니다.

| `subwayId` | 호선명 | 비고 |
| :--- | :--- | :--- |
| `1001` | 1호선 | 수도권 전철 1호선 |
| `1002` | 2호선 | 을지로순환선/지선 |
| `1003` | 3호선 | 일산선 포함 |
| `1004` | 4호선 | 과천/안산/진접선 포함 |
| `1005` | 5호선 | 마천/하남검단산 포함 |
| `1006` | 6호선 | 신내 포함 |
| `1007` | 7호선 | 석남/장암 |
| `1008` | 8호선 | 별내선 연장 포함 |
| `1009` | 9호선 | 개화~중앙보훈병원 |
| `1032` | GTX-A | 수도권 광역급행철도 A선 |
| `1063` | 경의중앙선 | 문산~용문/지평 |
| `1065` | 공항철도 | 서울역~인천공항2터미널 |
| `1067` | 경춘선 | 청량리/상봉~춘천 |
| `1075` | 수인분당선 | 청량리/왕십리~인천 |
| `1077` | 신분당선 | 신사~광교 |
| `1081` | 경강선 | 판교~여주 |
| `1092` | 우이신설선 | 경전철 |
| `1093` | 서해선 | 일산~원시 |
| `1094` | 신림선 | 샛강~관악산 |

### 5.2 도착 코드 (`arvlCd`) vs 열차 상태 (`trainSttus`)

#### 실시간 도착정보 API (`arvlCd`)
* `0`: **진입** (역 승강장 진입 중)
* `1`: **도착** (승강장에 정차 완료)
* `2`: **출발** (승강장에서 출발함)
* `3`: **전역 출발** (직전 역에서 방금 출발)
* `4`: **전역 진입** (직전 역에 진입 중)
* `5`: **전역 도착** (직전 역에 도착 정차 중)
* `99`: **운행 중** (그 외 운행 구간 주행 중)

#### 실시간 위치정보 API (`trainSttus`)
* `0`: **진입**
* `1`: **도착**
* `2`: **출발**
* `3`: **운행 중**

### 5.3 상하행선 구분 (`updnLine`)
* `0`: **상행** (일반 노선 기준) / **내선순환** (2호선 시계 방향)
* `1`: **하행** (일반 노선 기준) / **외선순환** (2호선 반시계 방향)

---

## 6. 실무 구현 시 주의사항 및 모범 사례 (Gotchas & Best Practices)

### ⚠️ 1. 역명 끝 '역' 제거 정규화
* `realtimeStationArrival` API 호출 시 역명에 '역'이 포함되어 있으면 조회가 되지 않는 역들이 많습니다.
  * 예: `강남역` (❌ 조회 실패 또는 빈 배열) ➡️ `강남` (⭕ 정상 응답)
  * 예: `서울역` (예외적으로 '서울역' 자체 또는 '서울'로 매핑 확인 필요)
* **권장 처리**:
  ```typescript
  export function normalizeStationName(name: string): string {
    if (name === '서울역') return '서울';
    return name.replace(/역$/, '').trim();
  }
  ```

### ⚠️ 2. `recptnDt` 기준 시차 지연 보정 (ETA 보정)
* API 응답의 `barvlDt`(도착 예정 초)는 데이터가 생성된 시각(`recptnDt`) 기준입니다.
* 서버에서 응답을 수신하고 클라이언트에 전달될 때까지의 시차(수 초~수십 초)를 빼주어야 정확한 남은 시간이 계산됩니다.
  ```typescript
  export function calculateAdjustedArrivalSeconds(barvlDt: string, recptnDt: string): number {
    const originalSeconds = parseInt(barvlDt, 10);
    if (isNaN(originalSeconds) || originalSeconds <= 0) return 0;

    const generatedTime = new Date(recptnDt.replace(' ', 'T')).getTime();
    const now = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((now - generatedTime) / 1000));

    return Math.max(0, originalSeconds - elapsedSeconds);
  }
  ```

### ⚠️ 3. 공공 API 에러 응답 및 `RESULT` 코드 처리
* 데이터가 없는 경우 200 HTTP OK와 함께 `RESULT.code: "INFO-200"` ("해당하는 데이터가 없습니다")가 반환됩니다.
* 인증키 오류는 `INFO-100`, `ERROR-300` 등으로 내려오므로 상태 코드가 아닌 응답 본문의 `status` / `RESULT` 필드를 반드시 확인해야 합니다.

### ⚠️ 4. 환승역 필터링
* 강남역 검색 시 2호선(`1002`)과 신분당선(`1077`) 열차가 섞여서 반환됩니다.
* 사용자가 현재 보고 있는 노선의 `subwayId`로 프론트엔드 또는 BFF(Backend For Frontend) 레이어에서 반드시 필터링해야 합니다.

---

## 7. TypeScript 인터페이스 & 예제 코드

### 7.1 TypeScript 인터페이스
```typescript
// 실시간 도착정보 항목 인터페이스
export interface RealtimeArrivalItem {
  subwayId: string;       // 호선 ID (1001 ~ 1094)
  subwayNm?: string;      // 호선명
  statnId: string;        // 지하철역 ID
  statnNm: string;        // 지하철역명
  updnLine: '0' | '1';    // 0: 상행/내선, 1: 하행/외선
  trainLineNm: string;    // 도착지 방면 (예: "성수행 - 역삼방면")
  barvlDt: string;        // 도착 예정 시간 (초)
  btrainNo: string;       // 열차 번호
  bstatnNm: string;       // 종착역명
  arvlMsg2: string;       // 첫번째 도착 메세지 (예: "전역 도착", "3분 후")
  arvlMsg3: string;       // 두번째 도착 메세지 (열차 위치 역명)
  arvlCd: string;         // 도착 코드 (0: 진입, 1: 도착, 2: 출발, 3: 전역출발 등)
  recptnDt: string;       // 도착정보 생성 시각
  btrainSttus: string;    // 일반 / 급행 / ITX
  lstcarAt: '0' | '1';    // 막차 여부
}

// 실시간 도착정보 API 응답 구조
export interface RealtimeArrivalResponse {
  errorMessage?: {
    status: number;
    code: string;
    message: string;
    total: number;
  };
  realtimeArrivalList?: RealtimeArrivalItem[];
}

// 실시간 열차 위치 항목 인터페이스
export interface RealtimePositionItem {
  subwayId: string;       // 호선 ID
  subwayNm: string;       // 호선명 (예: "2호선")
  statnId: string;        // 역 ID
  statnNm: string;        // 역명
  trainNo: string;        // 열차 번호
  lastRecptnDt: string;   // 최종 수신일자
  recptnDt: string;       // 수신 일시
  updnLine: '0' | '1';    // 0: 상행/내선, 1: 하행/외선
  statnTnm: string;       // 종착역명
  trainSttus: '0' | '1' | '2' | '3'; // 0: 진입, 1: 도착, 2: 출발, 3: 전역출발
  directAt: '0' | '1';    // 급행 여부
  lstcarAt: '0' | '1';    // 막차 여부
}
```

### 7.2 Next.js Route Handler 연동 샘플 (`/api/subway/arrival/route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server';

const SEOUL_SUBWAY_API_KEY = process.env.SEOUL_DATA_API_KEY || 'sample';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawStationName = searchParams.get('station');
  const targetSubwayId = searchParams.get('subwayId');

  if (!rawStationName) {
    return NextResponse.json({ error: 'station 파라미터가 필요합니다.' }, { status: 400 });
  }

  // 1. 역명 정규화 (끝의 '역' 제거)
  const stationName = rawStationName === '서울역' ? '서울' : rawStationName.replace(/역$/, '');
  const encodedStation = encodeURIComponent(stationName);

  const apiUrl = `http://swopenAPI.seoul.go.kr/api/subway/${SEOUL_SUBWAY_API_KEY}/json/realtimeStationArrival/0/20/${encodedStation}`;

  try {
    const res = await fetch(apiUrl, {
      next: { revalidate: 10 }, // 10초 캐싱
    });

    if (!res.ok) {
      return NextResponse.json({ error: '서울시 API 호출 실패' }, { status: res.status });
    }

    const data = await res.json();

    // 2. 에러 및 빈 데이터 처리
    if (!data.realtimeArrivalList || data.realtimeArrivalList.length === 0) {
      return NextResponse.json({ arrivals: [] });
    }

    let list = data.realtimeArrivalList;

    // 3. 특정 노선 필터링 (선택 사항)
    if (targetSubwayId) {
      list = list.filter((item: any) => String(item.subwayId) === String(targetSubwayId));
    }

    // 4. 도착 예정 시간(초) 보정
    const now = Date.now();
    const formatted = list.map((item: any) => {
      let remainingSeconds = parseInt(item.barvlDt, 10);
      if (!isNaN(remainingSeconds) && remainingSeconds > 0 && item.recptnDt) {
        const genTime = new Date(item.recptnDt.replace(' ', 'T')).getTime();
        const diff = Math.floor((now - genTime) / 1000);
        remainingSeconds = Math.max(0, remainingSeconds - Math.max(0, diff));
      }

      return {
        lineId: item.subwayId,
        stationName: item.statnNm,
        direction: item.trainLineNm,
        destination: item.bstatnNm,
        updnLine: item.updnLine === '0' ? 'UP' : 'DOWN',
        arrivalCode: item.arvlCd,
        message1: item.arvlMsg2,
        message2: item.arvlMsg3,
        remainingSeconds,
        isExpress: item.btrainSttus === '급행',
        isLastTrain: item.lstcarAt === '1',
      };
    });

    return NextResponse.json({ arrivals: formatted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```
