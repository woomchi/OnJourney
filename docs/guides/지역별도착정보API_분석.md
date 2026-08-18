# 한국 대중교통 버스도착정보 API 상세 분석

세 가지 주요 버스도착정보 API(국토교통부 TAGO, 경기도, 부산광역시)의 엔드포인트와 기능을 상세히 정리한 명세서입니다.

---

## 1. 국토교통부(TAGO) 버스도착정보 API

### 1.1 기본 정보

| 항목 | 내용 |
|------|------|
| **제공기관** | 국토교통부 |
| **서비스명** | 국토교통부_(TAGO)_버스도착정보 |
| **공공데이터포털 ID** | 15098530 |
| **지원 범위** | 전국 (지역별 도시코드 필요) |
| **데이터 형식** | JSON / XML |
| **응답 속도** | 약 30초 갱신 주기 |
| **신뢰도** | 높음 (정부 공식 데이터) |
| **문서** | Swagger UI 제공 |

### 1.2 주요 API 엔드포인트

#### 1.2.1 도착정보 조회 (메인)
```
GET http://apis.data.go.kr/1613000/BusArrInfoService/getArrInfoList
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 공공데이터포털 인증 키 |
| `stationId` | String | O | 정류소 ID (9자리 숫자) |
| `numOfRows` | Integer | X | 한 페이지 결과 수 (기본값: 10, 최대: 100) |
| `pageNo` | Integer | X | 페이지 번호 (기본값: 1) |
| `format` | String | X | 응답 형식 (json 또는 xml, 기본값: xml) |

**응답 필드:**

```json
{
  "response": {
    "header": {
      "resultCode": "00",
      "resultMsg": "OK"
    },
    "body": {
      "items": [
        {
          "stationId": "200000177",
          "stationName": "강남역",
          "routeId": "200000037",
          "routeNum": "502",
          "routeType": "일반",
          "direction": "상행",
          "nextBusTime": 150,
          "arrivalMsg": "2분 후 도착",
          "busType": "일반버스",
          "busSectionOrd": 12,
          "distance": 2000,
          "busLocationSectionId": "200000500"
        }
      ],
      "totalCount": 8,
      "pageNo": 1,
      "numOfRows": 10
    }
  }
}
```

**응답 필드 상세:**

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `stationId` | String | 정류소 고유 ID |
| `stationName` | String | 정류소명 |
| `routeId` | String | 노선 고유 ID |
| `routeNum` | String | 버스 노선 번호 |
| `routeType` | String | 버스 유형 (일반, 급행, 좌석, 마을 등) |
| `direction` | String | 방향 (상행/하행) |
| `nextBusTime` | Integer | 도착 예정 시간 (초 단위) |
| `arrivalMsg` | String | 도착 메시지 (예: "2분 후 도착") |
| `busType` | String | 버스 타입 분류 |
| `busSectionOrd` | Integer | 현재 구간 순서 번호 |
| `distance` | Integer | 남은 거리 (미터) |
| `busLocationSectionId` | String | 버스 위치 섹션 ID |

#### 1.2.2 도착정보 항목 조회
```
GET http://apis.data.go.kr/1613000/BusArrInfoService/getArrInfoItemList
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 공공데이터포털 인증 키 |
| `stationId` | String | O | 정류소 ID |
| `routeId` | String | O | 노선 ID (조회하려는 특정 노선) |
| `format` | String | X | 응답 형식 (json 또는 xml) |

**기능:** 특정 정류소에서 특정 노선의 도착정보만 조회 (필터링 가능)

---

### 1.3 보조 API 엔드포인트

#### 1.3.1 정류소 정보 조회
```
GET http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getStationTminalList
```
정류소명으로 정류소 기본정보(ID, 좌표, 관할청) 조회

#### 1.3.2 버스 노선 정보 조회
```
GET http://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteInfoList
```
노선번호 또는 노선ID로 노선정보(경유 정류소, 시간표) 조회

#### 1.3.3 버스 위치 정보 조회
```
GET http://apis.data.go.kr/1613000/BusLocationInfoInqireService/getBusLocationList
```
노선ID 기준으로 실시간 버스 위치정보 조회

#### 1.3.4 도시 코드 조회
```
GET http://apis.data.go.kr/1613000/CommonCodeService/getCommonCodeList
```
지원하는 도시 코드 목록 및 지역명 매핑

---

### 1.4 TAGO API 특징

**장점:**
- ✅ 전국 통일된 API (모든 지역 하나의 엔드포인트)
- ✅ 공식 정부 데이터로 신뢰도 높음
- ✅ 문서화 잘됨 (공공데이터포털 Swagger UI)
- ✅ 개발/운영 계정 자동승인
- ✅ 무료 이용

**단점:**
- ❌ 지역별 도시코드 조회 필요 (별도 API 호출)
- ❌ 응답 시간 상대적으로 느림 (~30초 갱신)
- ❌ 정류소ID 형식이 복잡함 (9자리 숫자, 지역별 범위 다름)
- ❌ 일부 지역에서는 지원 안 할 수 있음

---

## 2. 경기도 버스도착정보 API

### 2.1 기본 정보

| 항목 | 내용 |
|------|------|
| **제공기관** | 경기도청 / 경기버스정보센터 |
| **서비스명** | 경기도_버스도착정보 조회 |
| **공공데이터포털 ID** | 15080346 |
| **지원 범위** | 경기도 전역 |
| **데이터 형식** | JSON / XML |
| **응답 속도** | 약 20초 갱신 주기 |
| **신뢰도** | 높음 (지역 공식 API) |
| **관리** | 경기버스정보 (https://www.gbis.go.kr) |

### 2.2 주요 API 엔드포인트

#### 2.2.1 버스 도착정보 목록 조회
```
GET http://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 공공데이터포털 인증 키 |
| `stationId` | String | O | 정류소 ID (경기도 기준) |
| `format` | String | X | 응답 형식 (json 또는 xml) |

**응답 구조:**

```json
{
  "response": {
    "msgBody": {
      "itemList": [
        {
          "stationId": "200000177",
          "stationName": "강남역",
          "routeId": "200000037",
          "routeNum": "502",
          "routeType": 1,
          "direction": 1,
          "arrivalTime": 150,
          "arrivalMsg": "2분",
          "busNumber": "502-1234",
          "busSectionOrd": 5,
          "distance": 1500,
          "lowBus": false
        }
      ],
      "totalCount": 12
    },
    "msgHeader": {
      "resultCode": "0",
      "resultMsg": "OK"
    }
  }
}
```

#### 2.2.2 특정 노선 도착정보 조회
```
GET http://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalItemv2
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 공공데이터포털 인증 키 |
| `stationId` | String | O | 정류소 ID |
| `routeId` | String | O | 노선 ID |
| `staOrder` | Integer | O | 정류소 순번 (중요: 상행/하행 구분) |
| `format` | String | X | 응답 형식 |

**특수성:** 같은 정류소에 상행/하행이 모두 정차하면 `staOrder`로 구분해야 함

---

### 2.3 보조 API 엔드포인트

#### 2.3.1 버스 위치 정보 조회
```
GET http://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2
```
노선ID 기준으로 실시간 버스 위치정보 조회

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 인증 키 |
| `routeId` | String | O | 노선 ID |
| `format` | String | X | 응답 형식 |

**응답:**
```json
{
  "response": {
    "msgBody": {
      "itemList": [
        {
          "busNumber": "502-1234",
          "routeId": "200000037",
          "latitude": 37.4979,
          "longitude": 127.0276,
          "speed": 25,
          "direction": 90,
          "busSectionOrd": 12
        }
      ]
    }
  }
}
```

#### 2.3.2 기반정보 조회
```
GET http://apis.data.go.kr/6410000/baseinfoservice/v2/getBaseInfoItemv2
```
기본 정보 조회 (정류소, 노선 기본정보)

---

### 2.4 경기도 API 특징

**장점:**
- ✅ 빠른 응답 속도 (20초 갱신)
- ✅ v2 버전으로 최신 구조 제공
- ✅ 상행/하행 명확하게 구분 (`staOrder`)
- ✅ 경기도 공식 웹사이트 (GBIS) 제공
- ✅ 직관적인 JSON 응답

**단점:**
- ❌ 경기도 지역만 지원
- ❌ stationId와 routeId 형식이 경기 기준 (TAGO와 호환 안 됨)
- ❌ 다중 도시 확장 불가
- ❌ 상행/하행 구분을 위해 추가 파라미터(`staOrder`) 필수

---

## 3. 부산광역시 부산버스정보시스템 API

### 3.1 기본 정보

| 항목 | 내용 |
|------|------|
| **제공기관** | 부산광역시청 |
| **서비스명** | 부산광역시_부산버스정보시스템 |
| **공공데이터포털 ID** | 15092750 |
| **지원 범위** | 부산광역시 전역 |
| **데이터 형식** | JSON / XML |
| **응답 속도** | 실시간 갱신 |
| **신뢰도** | 높음 (부산시 공식) |
| **관리** | 부산시 버스정보시스템 (https://bus.busan.go.kr) |

### 3.2 주요 API 엔드포인트

#### 3.2.1 정류소 도착정보 조회
```
GET http://apis.data.go.kr/6480000/busstationarrinfo/getStationArrInfoList
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 공공데이터포털 인증 키 |
| `stationId` | String | O | 정류소 ID (부산 기준) |
| `pageNo` | Integer | X | 페이지 번호 (기본값: 1) |
| `numOfRows` | Integer | X | 한 페이지 행 수 (기본값: 10) |
| `format` | String | X | 응답 형식 (json 또는 xml) |

**응답 구조:**

```json
{
  "response": {
    "header": {
      "resultCode": "00",
      "resultMsg": "OK"
    },
    "body": {
      "items": [
        {
          "stationId": "100001",
          "stationName": "서면역",
          "routeId": "10001",
          "routeNumber": "1-1",
          "routeType": "일반",
          "direction": "산성동방향",
          "arrivalTime": 180,
          "arrivalMessage": "3분",
          "busNumber": "1-1-1234",
          "busType": "일반",
          "distance": 2500,
          "currentStop": 8,
          "totalStops": 45,
          "lowFloor": false
        }
      ],
      "totalCount": 5,
      "pageNo": 1,
      "numOfRows": 10
    }
  }
}
```

#### 3.2.2 ARS 번호로 정류소 정보 조회
```
GET http://apis.data.go.kr/6480000/busstationinfo/getStationInfoByArsNumber
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 인증 키 |
| `arsNumber` | String | O | ARS 4자리 번호 (예: "1903") |
| `format` | String | X | 응답 형식 |

**특징:** ARS 번호로 검색 가능 (정류소ID 모를 때 유용)

**응답:**
```json
{
  "response": {
    "body": {
      "stationId": "100001",
      "stationName": "서면역",
      "latitude": 35.1595,
      "longitude": 129.0706,
      "arsNumber": "1903",
      "routes": [
        {
          "routeId": "10001",
          "routeNumber": "1-1",
          "direction": "산성동방향"
        }
      ]
    }
  }
}
```

#### 3.2.3 정류소명으로 정류소 정보 조회
```
GET http://apis.data.go.kr/6480000/busstationinfo/getStationInfoByStationName
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 인증 키 |
| `stationName` | String | O | 정류소명 (예: "서면역") |
| `pageNo` | Integer | X | 페이지 번호 |
| `numOfRows` | Integer | X | 행 수 (기본값: 10) |
| `format` | String | X | 응답 형식 |

**기능:** 부분 검색 지원 (예: "서면" 검색 → 모든 "서면" 정류소 반환)

---

### 3.3 보조 API 엔드포인트

#### 3.3.1 노선 정보 조회
```
GET http://apis.data.go.kr/6480000/busrouteinfo/getRouteInfoByRouteName
```
노선명 또는 노선번호로 노선 정보 조회

#### 3.3.2 노선별 정류소 조회
```
GET http://apis.data.go.kr/6480000/busrouteinfo/getStationsByRouteId
```
특정 노선의 모든 정류소 목록 조회

#### 3.3.3 노선 정류소 도착정보 조회
```
GET http://apis.data.go.kr/6480000/busroutestation/getRouteStationArrInfoList
```
ARS 번호와 정류장명으로 노선별 도착정보 조회

#### 3.3.4 정류소 도착정보 (ARS/정류장명 기준)
```
GET http://apis.data.go.kr/6480000/busstationarrinfo/getArsArrInfoList
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 인증 키 |
| `arsNumber` | String | O | ARS 4자리 번호 |
| `format` | String | X | 응답 형식 |

---

### 3.4 부산 API 특징

**장점:**
- ✅ ARS 번호로 검색 가능 (사용자 친화적)
- ✅ 정류소명 부분검색 지원
- ✅ 상세한 도착정보 (현재 정류소/전체 정류소 수)
- ✅ 저상버스 여부 제공 (`lowFloor`)
- ✅ 실시간 갱신

**단점:**
- ❌ 부산시 지역만 지원
- ❌ API 엔드포인트가 많음 (통합되지 않음)
- ❌ stationId 형식이 부산 기준 (TAGO/경기도와 호환 안 됨)
- ❌ 페이지네이션 필수 (한 번에 많은 데이터 못 가져옴)

---

## 4. 인천광역시 버스도착정보 API

### 4.1 기본 정보

| 항목 | 내용 |
|------|------|
| **제공기관** | 인천광역시 |
| **서비스명** | 인천광역시_버스도착정보 |
| **기본 엔드포인트** | `https://apis.data.go.kr/6280000/busArrivalService` |
| **지원 범위** | 인천광역시 전역 |
| **데이터 형식** | JSON / XML |
| **응답 주기** | 실시간 |
| **신뢰도** | 높음 (인천시 공식 BIMS 연계) |

### 4.2 주요 API 엔드포인트

#### 4.2.1 정류소별 전체 노선 버스 도착 정보 조회 (`getAllRouteBusArrivalList`)
```
GET https://apis.data.go.kr/6280000/busArrivalService/getAllRouteBusArrivalList
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 공공데이터포털 인증 키 |
| `bstopId` | String | O | 정류소 고유번호 |
| `pageNo` | Integer | X | 페이지 번호 (기본값: 1) |
| `numOfRows` | Integer | X | 한 페이지 결과 수 (기본값: 10, 최대: 50) |

**주요 응답 필드:**

| 필드명 | 설명 |
|--------|------|
| `ARRIVALESTIMATETIME` | 도착 예정 시간 (초 단위) |
| `REST_STOP_COUNT` | 남은 정류소 수 |
| `ROUTENO` | 버스 노선 번호 |
| `ROUTEID` | 노선 고유 ID |
| `DIR_END` | 종점 / 운행 방향 |
| `BSTOPID` | 정류소 고유번호 |
| `BUS_NUM` | 차량 번호 |
| `LATEST_YN` | 막차 여부 (Y/N) |
| `LOW_TP` | 저상버스 여부 |

#### 4.2.2 특정 노선 버스 도착 정보 조회 (`getBusArrivalList`)
```
GET https://apis.data.go.kr/6280000/busArrivalService/getBusArrivalList
```

**요청 파라미터:**

| 파라미터명 | 타입 | 필수 | 설명 |
|-----------|------|------|------|
| `serviceKey` | String | O | 공공데이터포털 인증 키 |
| `bstopId` | String | O | 정류소 고유번호 |
| `routeId` | String | O | 노선 고유번호 |
| `pageNo` | Integer | X | 페이지 번호 |
| `numOfRows` | Integer | X | 한 페이지 결과 수 |

---

## 5. 지자체별 API 비교표

| 항목 | TAGO (국토부) | 경기도 (GBIS) | 부산광역시 (BIMS) | 인천광역시 (BIMS) |
|------|--------------|--------------|-------------------|-------------------|
| **지역** | 전국 | 경기도만 | 부산만 | 인천만 |
| **도착정보 엔드포인트** | `/getArrInfoList` | `/getBusArrivalListv2` | `/stopArrByBstopid` | `/getAllRouteBusArrivalList` |
| **응답 속도** | ~30초 | ~20초 | 실시간 | 실시간 |
| **응답 형식** | JSON/XML | JSON/XML | JSON/XML | JSON/XML |
| **정류소ID 형식** | 9자리 (전국 통일) | 경기 기준 (부분 호환) | 부산 기준 (독립) | 인천 기준 (`bstopId`) |
| **검색 방식** | 정류소ID 필수 | 정류소ID (staOrder 추가) | ID/ARS/명칭 복합 | 정류소ID (`bstopId`) |
| **상행/하행 구분** | routeId로 자동 | routeId + staOrder | direction으로 제공 | DIR_END 제공 |
| **페이지네이션** | 지원 | 미지원 | 지원 | 지원 |
| **저상버스 정보** | ❌ | ❌ | ✅ | ✅ |
| **신뢰도** | 높음 (0.80) | 높음 (0.85) | 높음 (0.85) | 높음 (0.85) |
| **개발자 친화도** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 5. API 선택 가이드

### 5.1 상황별 권장 API

#### **전국 서비스 개발 시:**
→ **TAGO 사용 권장**
- 하나의 엔드포인트로 모든 지역 커버
- 도시코드 조회로 지역 관리
- 확장성 최고

#### **경기도 전용 서비스:**
→ **경기도 API 사용**
- 빠른 응답 속도 (20초)
- v2 버전으로 최신
- 경기버스정보 웹사이트 통합

#### **부산시 전용 서비스:**
→ **부산 API 사용**
- ARS 번호 검색 가능
- 저상버스 정보 제공
- 사용자 입장에서 검색 편함

#### **하이브리드 서비스 (다지역):**
→ **TAGO + 지역별 API**

```typescript
// 의사코드
async function getArrivalInfo(region: string, stationId: string) {
  if (region === "경기도") {
    return await getFromGgApi(stationId);
  } else if (region === "부산") {
    return await getFromBusanApi(stationId);
  } else {
    return await getFromTagoApi(stationId);
  }
}
```

---

## 6. 구현 시 주의사항

### 6.1 CORS 이슈
> **중요:** 공공 API는 직접 프론트엔드에서 호출 불가 → 반드시 백엔드를 거쳐야 함

```typescript
// ❌ 잘못된 방법 (CORS 에러 발생)
const response = await fetch('http://apis.data.go.kr/1613000/BusArrInfoService/getArrInfoList?...');

// ✅ 올바른 방법 (백엔드 프록시)
const response = await fetch('/api/bus/arrival?stationId=123456');
```

### 6.2 응답 포맷 변환
- XML 응답 처리 시 `xml2js` 라이브러리 필수
- JSON 응답도 구조가 다르므로 정규화 필요

```typescript
// 응답 정규화
interface NormalizedArrival {
  stationId: string;
  stationName: string;
  routeNumber: string;
  arrivalTimeSec: number;
  arrivalMessage: string;
  distance: number;
  busNumber?: string;
}
```

### 6.3 Rate Limiting 대비
- 개발계정: 10,000 요청/일
- 운영계정: 활용사례 등록 시 증가 가능
- **재시도 로직 필수** (Exponential Backoff)

```typescript
async function callApiWithRetry(
  url: string,
  maxRetries: number = 3
): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      if (response.status === 429) throw new Error("Rate limited");
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```

### 6.4 캐싱 전략
```typescript
// L1: 프론트엔드 캐시 (10초)
// L2: 백엔드 메모리 (30초)
// L3: Redis (60초)

const CACHE_TTL = {
  FRONTEND: 10 * 1000,      // 10초
  BACKEND: 30 * 1000,       // 30초
  REDIS: 60 * 1000          // 60초
};
```

### 6.5 에러 처리
```typescript
enum ApiErrorCode {
  SERVICE_ERROR = "SERVICE_ERROR",      // 서비스 오류
  INVALID_STATION = "INVALID_STATION",  // 존재하지 않는 정류소
  RATE_LIMITED = "RATE_LIMITED",        // Rate limit 초과
  NETWORK_ERROR = "NETWORK_ERROR",      // 네트워크 오류
}
```

---

## 7. On-Journey 프로젝트 적용 전략

### 7.1 권장 아키텍처

```
┌─────────────────┐
│  React Frontend │
│  (On-Journey)   │
└────────┬────────┘
         │ /api/transit/arrival
         ▼
┌──────────────────────────────┐
│   Node.js Backend            │
│  (Express + Redis Cache)     │
├──────────────────────────────┤
│ ┌────────┬────────┬────────┐ │
│ │ TAGO   │ 경기도 │ 부산   │ │
│ │ Service│Service │Service │ │
│ └────────┴────────┴────────┘ │
└──────────────────────────────┘
```

### 7.2 단계별 구현 계획

**Phase 1 (1주):**
- TAGO 기본 통합 (도시코드 조회 + 도착정보 조회)
- 응답 정규화
- 기본 에러 처리

**Phase 2 (1주):**
- Redis 캐싱 구현
- Exponential backoff 재시도
- 응답 포맷 최적화

**Phase 3 (1주):**
- 경기도/부산 API 추가
- 지역 자동 감지
- UI 통합

**Phase 4 (선택):**
- 실시간 업데이트 (WebSocket)
- 모니터링 & 알림

---

## 8. 참고 자료

### 공공데이터포털
- TAGO 버스도착정보: https://www.data.go.kr/data/15098530/openapi.do
- 경기도 버스도착정보: https://www.data.go.kr/data/15080346/openapi.do
- 부산 버스정보시스템: https://www.data.go.kr/data/15092750/openapi.do

### 지역 공식 웹사이트
- 경기버스정보: https://www.gbis.go.kr
- 부산버스정보: https://bus.busan.go.kr
- TAGO 국가대중교통정보센터: https://www.tago.go.kr

### 필요 라이브러리
```json
{
  "axios": "^1.4.0",
  "xml2js": "^0.6.0",
  "redis": "^4.6.0",
  "express": "^4.18.0",
  "typescript": "^5.0.0"
}
```

---

## 9. 문제 해결 FAQ

### Q: 정류소 ID를 모를 때는?
**A:** 
- **TAGO:** 정류소명으로 검색 후 ID 조회 필요
- **경기도:** 경기버스정보 웹사이트에서 ID 확인
- **부산:** ARS 번호 또는 정류소명 검색 가능

### Q: 응답이 느릴 때는?
**A:** Redis 캐싱 도입 (TTL 30-60초)

### Q: Rate limit 초과 시?
**A:** 
1. Exponential backoff 재시도
2. 캐싱 활용도 증가
3. 운영계정 신청 (활용사례 등록)

### Q: 여러 지역을 동시에 지원하려면?
**A:** TAGO를 기본으로 하되, 각 지역별 API를 병렬 호출하여 성능 비교

---

**마지막 업데이트:** 2026년 8월 14일  
**작성자:** Claude  
**목적:** On-Journey 프로젝트 장거리 대중교통 정보 연동
