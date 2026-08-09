# ODsay LAB API Reference (전체 완전 상세 명세서)

> **원문 출처**: https://lab.odsay.com/guide/releaseReference  
> **Base URL**: `https://api.odsay.com/v1/api/`  
> **기본 인증**: 모든 요청 URL 파라미터에 `apiKey` (필수) 포함  
> **응답 포맷**: `json` (기본값) / `xml`  
> **요청 방식**: `GET` / `POST` 지원

---

## 📌 목차 (총 34개 기능 및 코드 정의)

| 번호 | API / 항목 명 | 메서드 | 엔드포인트 / ID | 비고 |
|:---:|---------------|:---:|------------------|------|
| 1 | [버스노선 조회 (Bus Route)](#searchBusLane) | GET/POST | `searchBusLane` |  |
| 2 | [버스노선 상세정보 조회 (Bus Route Information)](#busLaneDetail) | GET/POST | `busLaneDetail` |  |
| 3 | [버스정류장 세부 정보 조회 (Bus Stop Information)](#busStationInfo) | GET/POST | `busStationInfo` |  |
| 4 | [열차/KTX 운행정보 검색 (Train/KTX Operation Information)](#trainServiceTime) | GET/POST | `trainServiceTime` |  |
| 5 | [고속버스 운행정보 검색 (Express Bus Operation Information)](#expressServiceTime) | GET/POST | `expressServiceTime` | 구버전 (신버전 권장) |
| 6 | [시외버스 운행정보 검색 (Intercity Bus Operation Information)](#intercityServiceTime) | GET/POST | `intercityServiceTime` | 구버전 (신버전 권장) |
| 7 | [고속/시외버스 운행정보 검색 (Express/Intercity Bus Operation Information)](#searchInterBusSchedule) | GET/POST | `searchInterBusSchedule` | 신버전 권장 |
| 8 | [항공 운행정보 검색 (Aviation Operation Information)](#airServiceTime) | GET/POST | `airServiceTime` |  |
| 9 | [운수회사별 버스노선 조회 (Bus Route by Transportation Company)](#searchByCompany) | GET/POST | `searchByCompany` |  |
| 10 | [지하철역 세부 정보 조회 (Subway Station Information)](#subwayStationInfo) | GET/POST | `subwayStationInfo` |  |
| 11 | [(구) 지하철역 전체 시간표 조회 (Subway Station Timetable)](#subwayTimeTable) | GET/POST | `subwayTimeTable` | 구버전 |
| 12 | [(신) 지하철역 전체 시간표 조회 (Subway Station Timetable)](#searchSubwaySchedule) | GET/POST | `searchSubwaySchedule` | 2024.05 신규 |
| 13 | [노선 그래픽 데이터 검색 (Route Graphic Data)](#loadLane) | GET/POST | `loadLane` |  |
| 14 | [대중교통 정류장 검색 (Public Transit Stop)](#searchStation) | GET/POST | `searchStation` |  |
| 15 | [반경내 대중교통 POI 검색 (Public Transit POI within Radius)](#pointSearch) | GET/POST | `pointSearch` |  |
| 16 | [지도 위 대중교통 POI 검색 (Public Transit POI on Map)](#boundarySearch) | GET/POST | `boundarySearch` |  |
| 17 | [지하철 경로검색 조회(지하철 노선도) (Subway Route Search)](#subwayPath) | GET/POST | `subwayPath` |  |
| 18 | [시간표 기반 지하철 경로검색 조회 (Scheduled Subway Route Search)](#subwayPathSchedule) | GET/POST | `subwayPathSchedule` |  |
| 19 | [대중교통 길찾기 v1.7 (Public Transit Route Search)](#searchPubTransPath) | GET/POST | `searchPubTransPath` | 구버전 |
| 20 | [대중교통 길찾기 v1.8 (Public Transit Route Search)](#searchPubTransPathT) | GET/POST | `searchPubTransPathT` | 신버전 (권장) |
| 21 | [지하철역 환승 정보 조회 (Subway Station Transfer Information)](#subwayTransitInfo) | GET/POST | `subwayTransitInfo` |  |
| 22 | [고속버스 터미널 검색 (Express Bus Terminal)](#expressBusTerminals) | GET/POST | `expressBusTerminals` |  |
| 23 | [시외버스 터미널 검색 (Intercity Bus Terminal)](#intercityBusTerminals) | GET/POST | `intercityBusTerminals` |  |
| 24 | [도시코드 조회 (City Code)](#searchCID) | GET/POST | `searchCID` |  |
| 25 | [기차역 터미널 조회 (Train Station Terminal)](#trainTerminals) | GET/POST | `trainTerminals` |  |
| 26 | [반경 내 버스/지하철 정류장 및 버스노선 조회 (Bus/Subway Stop & Bus Route within Radius)](#pointBusStation) | GET/POST | `pointBusStation` |  |
| 27 | [대중교통 접근성 영역 조회 (Public Transit Accessibility Area Search)](#searchPubTransIsochrone) | GET/POST | `searchPubTransIsochrone` |  |
| 28 | [멀티모달 대중교통 길찾기 (Multi-modal Route Search)](#maasRP) | GET/POST | `maasRP` |  |
| 29 | [열차 노선도 길찾기 (Train Route Search)](#searchTrainPath) | GET/POST | `searchTrainPath` |  |
| 30 | [도보 접근성 영역 조회 (Walk Accessibility Area Search)](#searchWalkIsochrone) | GET/POST | `searchWalkIsochrone` |  |
| 31 | [도보 길찾기 (Walk Route Search)](#searchWalkPathV2) | GET/POST | `searchWalkPathV2` |  |
| 32 | [자전거 길찾기 (Bike Route Search)](#searchBikePathV2) | GET/POST | `searchBikePathV2` |  |
| 33 | [지하철 노선도 (Subway Map)](#subwayMap) | GET/POST | `subwayMap` |  |
| 34 | [코드정의 (Code Definition)](#defineCode) | - | `defineCode` | 코드 정의 참조 |

---

## 공통 파라미터 (모든 API 요청에 적용)

| 파라미터 | 필수값 | 설명 | 예시 |
|:---:|:---:|---|---|
| `apiKey` | **Y** | 발급된 API 키 | `apiKey=xxxxxxxxxxx` |
| `lang` | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>※ 베트남어의 경우 수도권(CID=1000)에 한하여 제공 (default = 0) | `lang=1` |
| `output` | N | 출력포맷 (`json`, `xml`) (default = json) | `output=xml` |

---

## 공통 에러 코드

| 코드 | 메시지 |
|:---:|---|
| `500` | 서버 내부 오류 |
| `-8` | 필수 입력값 형식 및 범위 오류 |
| `-9` | 필수 입력값 누락 |

---

## 1. 버스노선 조회 (Bus Route)

- **API Anchor ID**: `searchBusLane`
> 💡 **설명**: 버스노선 리스트를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchBusLane | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | busNo | Y | 조회할 버스노선번호 | busNo=10 |
| 2 | CID | N | 도시코드 | CID=1000 |
| 3 | stationListYn | N | 주요정류장 표현 옵션(default:no) | stationListYn=no |
| 4 | displayCnt | N | 리턴 결과 개수 | displayCnt=10 |
| 5 | startNO | N | 결과 개수 중 시작번호 | startNO=1 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장 노드 | Y | 1 | 데이터를 포함하는 최상위 노드 |
| 1-1 | totalCount | int | Y | 1 | 검색 결과 개수 |
| 1-2 | totalCityList | 확장 노드 | Y | 1 | 도시 리스트 |
| 1-2-1 | includeCity | 확장 노드 | Y | 1...n | 도시 리스트 |
| 1-2-1-1 | CID | int | Y | 1 | 도시코드 |
| 1-2-1-2 | cityName | string | Y | 1 | 도시명 |
| 1-2-1-3 | cityNameKor | string | N | 1 | 도시명 국문<br>(다국어 서비스 시 표출) |
| 1-2-1-4 | cityNameJpnKata | string | N | 1 | 도시명 일문(가타카나)<br>(lang = 2 일 경우 표출) |
| 1-3 | lane | 확장 노드 | Y | 1...n | 버스노선 정보 리스트 |
| 1-3-1 | busNo | string | Y | 1 | 버스번호 |
| 1-3-2 | busNoKor | string | N | 1 | 버스번호 국문<br>(다국어 서비스 시 표출) |
| 1-3-3 | busNoJpnKata | string | N | 1 | 버스번호 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-3-4 | busID | int | Y | 1 | 버스노선ID |
| 1-3-5 | localBusID | string | Y | 1 | 각 지역버스노선 ID<br>수도권 : busCityCode가 1000 인 경우<br>서울, 그 외에는 경기 실시간 사용<br>울산시 : 노선하나에 상행노선ID, 하행노선ID 모두제공<br>Ex) 상행ID/하행ID 형태. |
| 1-3-6 | type | int | Y | 1 | 버스노선 종류<br>문서하단 버스노선타입 참조 |
| 1-3-7 | busCityName | string | Y | 1 | 운수회사 승인 도시이름 |
| 1-3-8 | busCityNameKor | string | N | 1 | 운수회사 승인 도시이름 국문<br>(다국어 서비스 시 표출) |
| 1-3-9 | busCityNameJpnKata | string | N | 1 | 운수회사 승인 도시이름 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-3-10 | busCityCode | int | Y | 1 | 운수회사 승인 도시코드 |
| 1-3-11 | busStartPoint | string | Y | 1 | 버스노선 기점 |
| 1-3-12 | busStartPointKor | string | N | 1 | 버스노선 기점 국문<br>(다국어 서비스 시 표출) |
| 1-3-13 | busStartPointJpnKata | string | N | 1 | 버스노선 기점 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-3-14 | busEndPoint | string | Y | 1 | 버스노선 종점 |
| 1-3-15 | busEndPointKor | string | N | 1 | 버스노선 종점 국문<br>(다국어 서비스 시 표출) |
| 1-3-16 | busEndPointJpnKata | string | N | 1 | 버스노선 종점 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-3-17 | busFirstTime | string | N | 1 | 첫차시간 |
| 1-3-18 | busLastTime | string | N | 1 | 막차시간 |
| 1-3-19 | busInterval | string | Y | 1 | 운행간격(분) or 운행횟수(#1) |
| 1-3-20 | mainBusStop | string | N | 1 | 주요 버스정류장 |
| 1-3-21 | bus_Ep_FirstTime | string | N | 1 | 종점기준 첫차 |
| 1-3-22 | bus_Ep_LastTime | string | N | 1 | 종점기준 막차 |
| 1-3-23 | bus_Interval_Week | string | Y | 1 | 평일 배차간격 |
| 1-3-24 | bus_Interval_Sat | string | Y | 1 | 토요일 배차간격 |
| 1-3-25 | bus_Interval_Sun | string | Y | 1 | 일요일(공휴일) 배차간격 |
| 1-3-26 | busCompanyNameKor | string | Y | 1 | 운수회사명 |
| 1-3-27 | busCompanyID | string | Y | 1 | 운수회사ID |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 2. 버스노선 상세정보 조회 (Bus Route Information)

- **API Anchor ID**: `busLaneDetail`
> 💡 **설명**: 특정 버스노선의 운행경로에 대한 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/busLaneDetail | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | busID | Y | 운행경로를 조회할 버스노선코드 | busID=12018 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장 노드 | Y | 1 | 데이터를 포함하는 최상위노드 |
| 1-1 | busID | int | Y | 1 | 버스노선코드 |
| 1-2 | busNo | string | Y | 1 | 버스번호 |
| 1-3 | busNoKor | string | N | 1 | 버스번호 국문<br>(다국어 서비스 시 표출) |
| 1-4 | busNoJpnKata | string | N | 1 | 버스번호 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-5 | type | int | Y | 1 | 버스노선 종류<br>문서하단 버스노선타입 참조. |
| 1-6 | busCityName | string | Y | 1 | 운수회사 승인 도시이름 |
| 1-7 | busCityNameKor | string | N | 1 | 운수회사 승인 도시이름 국문<br>(다국어 서비스 시 표출) |
| 1-8 | busCityNameJpnKata | string | N | 1 | 운수회사 승인 도시이름 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-9 | busCityCode | int | Y | 1 | 운수회사 승인 도시코드 |
| 1-10 | busStartPoint | string | Y | 1 | 버스노선 기점 |
| 1-11 | busStartPointKor | string | N | 1 | 버스노선 기점 국문<br>(다국어 서비스 시 표출) |
| 1-12 | busStartPointJpnKata | string | N | 1 | 버스노선 기점 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-13 | busEndPoint | string | Y | 1 | 버스노선 종점 |
| 1-14 | busEndPointKor | string | N | 1 | 버스노선 종점 국문<br>(다국어 서비스 시 표출) |
| 1-15 | busEndPointJpnKata | string | N | 1 | 버스노선 종점 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-16 | busFirstTime | string | N | 1 | 첫차시간 |
| 1-17 | busLastTime | string | N | 1 | 막차시간 |
| 1-18 | busInterval | string | Y | 1 | 운행간격(분) or 운행횟수(1회 -) |
| 1-19 | busTotalDistance | int | Y | 1 | 버스노선 전체 운행거리 |
| 1-20 | bus_Ep_FirstTime | string | N | 1 | 종점기준 첫차 |
| 1-21 | bus_Ep_LastTime | string | N | 1 | 종점기준 막차 |
| 1-22 | bus_Interval_Week | string | N | 1 | 평일 배차간격(분) or 운행횟수(1회 -) |
| 1-23 | bus_Interval_Sat | string | N | 1 | 토요일 배차간격(분) or 운행횟수(1회 -) |
| 1-24 | bus_Interval_Sun | string | N | 1 | 일요일(공휴일) 배차간격(분) or 운행횟수(1회 -) |
| 1-25 | bus_Interval_Rushhour | string | N | 1 | 출퇴근시간 배차간격(분) or 운행횟수(1회 -) |
| 1-26 | busLocalBlID | string | Y | 1 | 각 지역 버스노선 ID |
| 1-27 | station | 확장노드 | Y | 1...n | 정류장 리스트 |
| 1-27-1 | idx | int | Y | 1 | 정류장순번 |
| 1-27-2 | stationID | int | Y | 1 | 정류장 ID |
| 1-27-3 | stationName | string | Y | 1 | 정류장 이름 |
| 1-27-4 | stationNameKor | string | N | 1 | 정류장 이름 국문<br>(다국어 서비스 시 표출) |
| 1-27-5 | stationNameJpnKata | string | N | 1 | 정류장 이름 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-27-6 | stationDistance | long | Y | 1 | 정류장간 누적거리<br>(현재정류장에서 다음정류장까지) |
| 1-27-7 | stationDirection | int | Y | 1 | 상하행 구분코드<br>(0:없음,1:하행,2:상행) |
| 1-27-8 | arsID | string | Y | 1 | 정류장 고유번호<br>(0:없음) |
| 1-27-9 | x | double | Y | 1 | 정류장 x좌표(경위도) |
| 1-27-10 | y | double | Y | 1 | 정류장 y좌표(경위도) |
| 1-27-11 | localStationID | string | Y | 1 | 정류장 LocalID |
| 1-27-12 | stationCityCode | string | Y | 1 | 정류장 도시코드 |
| 1-27-13 | nonstopStation | int | Y | 1 | 미정차정류장<br>(0:정차, 1:미정차) |
| 1-27-14 | busOnlyCentralLane | int | Y | 1 | 버스전용 중앙차로 정류장 해당 여부<br>(0: 비해당, 1: 해당) |
| 1-28 | turningPointIdx | int | N | 1 | 회차점 index |
| 1-29 | busCompanyNameKor | string | Y | 1 | 운수회사명 |
| 1-30 | busCompanyID | string | Y | 1 | 운수회사ID |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 3. 버스정류장 세부 정보 조회 (Bus Stop Information)

- **API Anchor ID**: `busStationInfo`
> 💡 **설명**: 특정 버스정류장의 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/busStationInfo | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | stationID | Y | 정류장 정보를 조회할 정류장코드 | stationID=107475 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장노드 | Y | 1 | 데이터를 포함하는 최 상위 노드 |
| 1-1 | stationName | string | Y | 1 | 정류장 이름 |
| 1-2 | stationNameKor | string | N | 1 | 정류장 이름 국문<br>(다국어 서비스 시 표출) |
| 1-3 | stationNameJpnKata | string | N | 1 | 정류장 이름 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4 | stationID | int | Y | 1 | 정류장 ID |
| 1-5 | x | double | Y | 1 | 정류장 x좌표(경위도) |
| 1-6 | y | double | Y | 1 | 정류장 y좌표(경위도) |
| 1-7 | lane | 확장노드 | Y | 1...n | 정류장의 버스 노선 리스트 |
| 1-7-1 | busNo | string | Y | 1 | 버스노선 번호 |
| 1-7-2 | busNoKor | string | N | 1 | 버스노선 번호 국문<br>(다국어 서비스 시 표출) |
| 1-7-3 | busNoJpnKata | string | N | 1 | 버스노선 번호 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-7-4 | type | int | Y | 1 | 버스노선 종류<br>(문서하단 버스노선타입 참조) |
| 1-7-5 | busID | int | Y | 1 | 버스노선 ID |
| 1-7-6 | busStartPoint | string | Y | 1 | 버스노선 기점 |
| 1-7-7 | busStartPointKor | string | N | 1 | 버스노선 기점 국문<br>(다국어 서비스 시 표출) |
| 1-7-8 | busStartPointJpnKata | string | N | 1 | 버스노선 기점 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-7-9 | busEndPoint | string | Y | 1 | 버스노선 종점 |
| 1-7-10 | busEndPointKor | string | N | 1 | 버스노선 종점 국문<br>(다국어 서비스 시 표출) |
| 1-7-11 | busEndPointJpnKata | string | N | 1 | 버스노선 종점 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-7-12 | busFirstTime | string | N | 1 | 첫차시간 |
| 1-7-13 | busLastTime | string | N | 1 | 막차시간 |
| 1-7-14 | busInterval | string | Y | 1 | 운행간격(분) or 운행횟수(#1) |
| 1-7-15 | busCityCode | int | Y | 1 | 운수회사 승인 도시코드 |
| 1-7-16 | busCityName | string | Y | 1 | 운수회사 승인 도시이름 |
| 1-7-17 | busCityNameKor | string | N | 1 | 운수회사 승인 도시이름 국문<br>(다국어 서비스 시 표출) |
| 1-7-18 | busCityNameJpnKata | string | N | 1 | 운수회사 승인 도시이름 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-7-19 | busLocalBlID | string | Y | 1 | 각 지역 버스노선 ID |
| 1-7-20 | busStationIdx | int | Y | 1 | 정류장 순번 |
| 1-7-21 | busDirectionName | string | Y | 1 | 방향/방면 명 |
| 1-7-22 | busDirectionNameKor | string | N | 1 | 방향/방면 명 국문<br>(다국어 서비스 시 표출) |
| 1-7-23 | busDirectionNameJpnKata | string | N | 1 | 방향/방면 명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-7-24 | busDirectionStationID | int | N | 1 | 방향/방면 정류장 ID<br>(busDirectionType = 1 또는 2 인 경우 표출) |
| 1-7-25 | busDirectionType | int | Y | 1 | 종점/방향/방면 구분<br>(0: 종점, 1:방향, 2:방면) |
| 1-8 | localStationID | string | Y | 1 | 각 지역 버스정류장 ID |
| 1-9 | stationCityCode | int | Y | 1 | 정류장의 도시코드 |
| 1-10 | arsID | string | Y | 1 | 정류장 고유번호 |
| 1-11 | do | string | Y | 1 | 정류장주소 도 |
| 1-12 | gu | string | Y | 1 | 정류장주소 구 |
| 1-13 | dong | string | Y | 1 | 정류장주소 동 |
| 1-14 | nonstopStation | int | Y | 1 | 미정차정류장<br>(0:정차, 1:미정차) |
| 1-15 | busOnlyCentralLane | int | Y | 1 | 버스전용 중앙차로 정류장 해당 여부<br>(0: 비해당, 1: 해당) |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 4. 열차/KTX 운행정보 검색 (Train/KTX Operation Information)

- **API Anchor ID**: `trainServiceTime`
> 💡 **설명**: 열차·KTX 운행정보를 리턴합니다.<br> * 열차 시간표는 코레일 등 공식 홈페이지에서 공지하는 시간표를 기준으로 제공되며, 임시 운행 열차 시간표는 제외됩니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/trainServiceTime | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | startStationID | Y | 역 ID | startStationID=3300128 |
| 2 | endStationID | Y | 역 ID | endStationID=3300108 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장노드 | Y | 1 | 데이터를 포함하는 최 상위 노드 |
| 1-1 | count | int | Y | 1 | 검색결과 개수 |
| 1-2 | startStationID | int | Y | 1 | 출발역ID |
| 1-3 | startStationName | string | Y | 1 | 출발역명 |
| 1-4 | startStationNameKor | string | N | 1 | 출발역명 국문<br>(다국어 서비스 시 표출) |
| 1-5 | startStationNameJpnKata | string | N | 1 | 출발역명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-6 | endStationID | int | Y | 1 | 도착역ID |
| 1-7 | endStationName | string | Y | 1 | 도착역명 |
| 1-8 | endStationNameKor | string | N | 1 | 도착역명 국문<br>(다국어 서비스 시 표출) |
| 1-9 | endStationNameJpnKata | string | N | 1 | 도착역명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-10 | station | 확장노드 | Y | 1...n | 상위노드 |
| 1-10-1 | railName | string | Y | 1 | 노선명(경부선, 호남선 등) |
| 1-10-2 | trainClass | string | Y | 1 | 열차종류(KTX, 무궁화, 새마을, 누리로, 통근, ITX, ITX-청춘, SRT) |
| 1-10-3 | trainNo | int | Y | 1 | 열차번호 |
| 1-10-4 | departureTime | string | Y | 1 | 출발시간 |
| 1-10-5 | arrivalTime | string | Y | 1 | 도착시간 |
| 1-10-6 | wasteTime | string | Y | 1 | 소요시간 |
| 1-10-7 | runDay | string | Y | 1 | 운행일<br>ex) 토 / 금토일 / 토일 /<br>화수목금토일 / 월화수목토일/<br>금 / 금토 / 금일 / 월 / 매일/<br>월화수목금토 |
| 1-10-8 | generalFare | 확장노드 | Y | 1 | 일반 요금 |
| 1-10-8-1 | weekday | string | N | 1 | 평일 |
| 1-10-8-2 | weekend | string | N | 1 | 주말 |
| 1-10-8-3 | holiday | string | N | 1 | 공휴일 |
| 1-10-9 | specialFare | 확장노드 | Y | 1 | 특실 요금 |
| 1-10-9-1 | weekday | string | N | 1 | 평일 |
| 1-10-9-2 | weekend | string | N | 1 | 주말 |
| 1-10-9-3 | holiday | string | N | 1 | 공휴일 |
| 1-10-10 | standingFare | 확장노드 | Y | 1 | 입석/자유석 요금 |
| 1-10-10-1 | weekday | string | N | 1 | 평일 |
| 1-10-10-2 | weekend | string | N | 1 | 주말 |
| 1-10-10-3 | holiday | string | N | 1 | 공휴일 |
| 1-10-11 | fare | 확장노드 | Y | 1 | 요금(평일 운행편인 경우 제공) |
| 1-10-11-1 | general | string | N | 1 | 일반요금 |
| 1-10-11-2 | special | string | N | 1 | 특실요금 |
| 1-10-11-3 | standing | string | N | 1 | 입석/자유석 요금 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 5. 고속버스 운행정보 검색 (Express Bus Operation Information)

- **API Anchor ID**: `expressServiceTime`
> 💡 **설명**: 고속버스 운행정보를 리턴합니다.<br> * 고속/시외버스 운행정보 검색 API 사용을 권장합니다. 고속/시외버스 운행정보 검색 바로가기<br> * 고속•시외버스 운행정보는 업데이트 및 정보 수집과정에서 시간차이로 실제 정보와 다소 차이가 있을 수 있습니다. 현재 시각 기준의 정보를 얻기 위해서는 예매사이트를 확인하시기를 권장합니다. (제공 데이터는 금요일 기준)

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/expressServiceTime | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | startStationID | Y | 터미널 ID | startStationID=4000057 |
| 2 | endStationID | Y | 터미널 ID | endStationID=4000030 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장노드 | Y | 1 | 데이터를 포함하는 최 상위 노드 |
| 1-1 | count | int | Y | 1 | 검색결과 개수 |
| 1-2 | startStationID | int | Y | 1 | 출발역ID |
| 1-3 | endStationID | int | Y | 1 | 도착역ID |
| 1-4 | station | 확장노드 | Y | 1...n | 상위노드 |
| 1-4-1 | startTerminal | string | Y | 1 | 출발 터미널명 |
| 1-4-2 | startTerminalKor | string | N | 1 | 출발 터미널명 국문<br>(다국어 서비스 시 표출) |
| 1-4-3 | startTerminalJpnKata | string | N | 1 | 출발 터미널명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-4 | destTerminal | string | Y | 1 | 도착 터미널명 |
| 1-4-5 | destTerminalKor | string | N | 1 | 도착 터미널명 국문<br>(다국어 서비스 시 표출) |
| 1-4-6 | destTerminalJpnKata | string | N | 1 | 도착 터미널명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-7 | wasteTime | string | Y | 1 | 소요시간 |
| 1-4-8 | normalFare | int | Y | 1 | 일반버스 요금 |
| 1-4-9 | specialFare | int | Y | 1 | 우등버스 요금 |
| 1-4-10 | nightFare | int | Y | 1 | 심야버스 요금 |
| 1-4-11 | nightSpecialFare | int | Y | 1 | 심야 우등버스 요금 |
| 1-4-12 | schedule | string | Y | 1 | 운행시간표 |
| 1-4-13 | nightSchedule | string | Y | 1 | 심야 운행시간표 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 6. 시외버스 운행정보 검색 (Intercity Bus Operation Information)

- **API Anchor ID**: `intercityServiceTime`
> 💡 **설명**: 시외버스 운행정보를 리턴합니다.<br> * 고속/시외버스 운행정보 검색 API 사용을 권장합니다. 고속/시외버스 운행정보 검색 바로가기<br> * 고속•시외버스 운행정보는 업데이트 및 정보 수집과정에서 시간차이로 실제 정보와 다소 차이가 있을 수 있습니다. 현재 시각 기준의 정보를 얻기 위해서는 예매사이트를 확인하시기를 권장합니다. (제공 데이터는 금요일 기준)

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/intercityServiceTime | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | startStationID | Y | 터미널 ID | startStationID=4000023 |
| 2 | endStationID | Y | 터미널 ID | endStationID=4000030 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장노드 | Y | 1 | 데이터를 포함하는 최 상위 노드 |
| 1-1 | count | int | Y | 1 | 검색결과 개수 |
| 1-2 | startStationID | int | Y | 1 | 출발역ID |
| 1-3 | endStationID | int | Y | 1 | 도착역ID |
| 1-4 | station | 확장노드 | Y | 1...n | 상위노드 |
| 1-4-1 | startTerminal | string | Y | 1 | 출발 터미널명 |
| 1-4-2 | startTerminalKor | string | N | 1 | 출발 터미널명 국문<br>(다국어 서비스 시 표출) |
| 1-4-3 | startTerminalJpnKata | string | N | 1 | 출발 터미널명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-4 | destTerminal | string | Y | 1 | 도착 터미널명 |
| 1-4-5 | destTerminalKor | string | N | 1 | 도착 터미널명 국문<br>(다국어 서비스 시 표출) |
| 1-4-6 | destTerminalJpnKata | string | N | 1 | 도착 터미널명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-7 | wasteTime | string | Y | 1 | 소요시간 |
| 1-4-8 | normalFare | int | Y | 1 | 일반버스 요금 |
| 1-4-9 | specialFare | int | Y | 1 | 우등버스 요금 |
| 1-4-10 | nightFare | int | Y | 1 | 심야버스 요금 |
| 1-4-11 | nightSpecialFare | int | Y | 1 | 심야 우등버스 요금 |
| 1-4-12 | schedule | string | Y | 1 | 운행시간표 |
| 1-4-13 | nightSchedule | string | Y | 1 | 심야 운행시간표 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 7. 고속/시외버스 운행정보 검색 (Express/Intercity Bus Operation Information)

- **API Anchor ID**: `searchInterBusSchedule`
> 💡 **설명**: 고속/시외버스 운행정보를 리턴합니다.<br> * 고속•시외버스 운행정보는 업데이트 및 정보 수집과정에서 시간차이로 실제 정보와 다소 차이가 있을 수 있습니다. 현재 시각 기준의 정보를 얻기 위해서는 예매사이트를 확인하시기를 권장합니다. (제공 데이터는 금요일 기준)

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchInterBusSchedule | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | startStationID | Y | 터미널 ID | startStationID=4000057 |
| 2 | endStationID | Y | 터미널 ID | endStationID=4000030 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장노드 | Y | 1 | 데이터를 포함하는 최 상위 노드 |
| 1-1 | count | int | Y | 1 | 검색결과 개수 |
| 1-2 | startStationID | int | Y | 1 | 출발역ID |
| 1-3 | endStationID | int | Y | 1 | 도착역ID |
| 1-4 | station | 확장노드 | Y | 1...n | 상위노드 |
| 1-4-1 | startTerminal | string | Y | 1 | 출발 터미널명 |
| 1-4-2 | startTerminalKor | string | N | 1 | 출발 터미널명 국문<br>(다국어 서비스 시 표출) |
| 1-4-3 | startTerminalJpnKata | string | N | 1 | 출발 터미널명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-4 | destTerminal | string | Y | 1 | 도착 터미널명 |
| 1-4-5 | destTerminalKor | string | N | 1 | 도착 터미널명 국문<br>(다국어 서비스 시 표출) |
| 1-4-6 | destTerminalJpnKata | string | N | 1 | 도착 터미널명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-7 | wasteTime | string | Y | 1 | 소요시간 |
| 1-4-8 | normalFare | int | Y | 1 | 일반버스 요금 |
| 1-4-9 | specialFare | int | Y | 1 | 우등버스 요금 |
| 1-4-10 | nightFare | int | Y | 1 | 심야버스 요금 |
| 1-4-11 | nightSpecialFare | int | Y | 1 | 심야 우등버스 요금 |
| 1-4-12 | schedule | string | Y | 1 | 운행시간표 |
| 1-4-13 | nightSchedule | string | Y | 1 | 심야 운행시간표 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 8. 항공 운행정보 검색 (Aviation Operation Information)

- **API Anchor ID**: `airServiceTime`
> 💡 **설명**: 항공 운행정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/airServiceTime | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | startStationID | Y | 공항 ID | startStationID=7300002 |
| 2 | endStationID | Y | 공항 ID | endStationID=7300003 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장노드 | Y | 1 | 데이터를 포함하는 최 상위 노드 |
| 1-1 | count | int | Y | 1 | 검색결과 개수 |
| 1-2 | startStationID | int | Y | 1 | 출발역ID |
| 1-3 | endStationID | int | Y | 1 | 도착역ID |
| 1-4 | station | 확장노드 | Y | 1...n | 상위노드 |
| 1-4-1 | startTerminal | string | Y | 1 | 출발 공항명 |
| 1-4-2 | startTerminalKor | string | N | 1 | 출발 공항명 국문<br>(다국어 서비스 시 표출) |
| 1-4-3 | startTerminalJpnKata | string | N | 1 | 출발 공항명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-4 | destTerminal | string | Y | 1 | 도착 공항명 |
| 1-4-5 | destTerminalKor | string | N | 1 | 도착 공항명 국문<br>(다국어 서비스 시 표출) |
| 1-4-6 | destTerminalJpnKata | string | N | 1 | 도착 공항명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-7 | flightName | string | Y | 1 | 항공사명 |
| 1-4-8 | flightNameKor | string | N | 1 | 항공사명 국문<br>(다국어 서비스 시 표출) |
| 1-4-9 | flightNameJpnKata | string | N | 1 | 항공사명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4-10 | wasteTime | string | Y | 1 | 소요시간 |
| 1-4-11 | normalFare | int | Y | 1 | 항공요금 |
| 1-4-12 | schedule | string | Y | 1 | 운행시간표 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 9. 운수회사별 버스노선 조회 (Bus Route by Transportation Company)

- **API Anchor ID**: `searchByCompany`
> 💡 **설명**: 운수회사별 버스 노선 목록을 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchByCompany | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | companyID | Y | 운수회사 ID | companyID=787 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장 노드 | Y | 1 | 데이터를 포함하는 최상위 노드 |
| 1-1 | companyName | string | Y | 1 | 운수회사 명 |
| 1-2 | companyNameKor | string | N | 1 | 운수회사 명 국문<br>(다국어 서비스 시 표출) |
| 1-3 | companyNameJpnKata | string | N | 1 | 운수회사 명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4 | companyID | int | Y | 1 | 운수회사 ID |
| 1-5 | tel | string | Y | 1 | 운수회사 전화번호 |
| 1-6 | cityCode | int | Y | 1 | 도시코드 |
| 1-7 | cityName | string | Y | 1 | 도시 명 |
| 1-8 | cityNameKor | string | N | 1 | 도시 명 국문<br>(다국어 서비스 시 표출) |
| 1-9 | cityNameJpnKata | string | N | 1 | 도시 명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-10 | lane | 확장 노드 | Y | 1...n | 버스 노선 리스트 |
| 1-10-1 | busNo | string | Y | 1 | 버스번호 |
| 1-10-2 | busNoKor | string | N | 1 | 버스번호 국문<br>(다국어 서비스 시 표출) |
| 1-10-3 | busNoJpnKata | string | N | 1 | 버스번호 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-10-4 | type | int | Y | 1 | 버스노선 종류<br>(문서하단 버스노선타입 참조) |
| 1-10-5 | busID | int | Y | 1 | 버스노선 ID |
| 1-10-6 | busStartPoint | string | Y | 1 | 버스노선 기점 |
| 1-10-7 | busStartPointKor | string | N | 1 | 버스노선 기점 국문<br>(다국어 서비스 시 표출) |
| 1-10-8 | busStartPointJpnKata | string | N | 1 | 버스노선 기점 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-10-9 | busEndPoint | string | Y | 1 | 버스노선 종점 |
| 1-10-10 | busEndPointKor | string | N | 1 | 버스노선 종점 국문<br>(다국어 서비스 시 표출) |
| 1-10-11 | busEndPointJpnKata | string | N | 1 | 버스노선 종점 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-10-12 | busFirstTime | string | N | 1 | 첫차시간 |
| 1-10-13 | busLastTime | string | N | 1 | 막차시간 |
| 1-10-14 | busInterval | string | Y | 1 | 운행간격(분) or 운행횟수(#1) |
| 1-10-15 | busLocalBlID | string | Y | 1 | 각 지역 버스노선 ID |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 10. 지하철역 세부 정보 조회 (Subway Station Information)

- **API Anchor ID**: `subwayStationInfo`
> 💡 **설명**: 특정 지하철역의 정보(첫차/막차/환승역 여부 등)를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/subwayStationInfo | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | stationID | Y | 지하철역 정류장 ID | stationID=130 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장 노드 | Y | 1 | 데이터를 포함하는 최상위 노드 |
| 1-1 | stationName | string | Y | 1 | 지하철역 이름 |
| 1-2 | stationNameKor | string | N | 1 | 지하철역 이름 국문<br>(다국어 서비스 시 표출) |
| 1-3 | stationNameJpnKata | string | N | 1 | 지하철역 이름 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-4 | stationID | int | Y | 1 | 지하철역 ID |
| 1-5 | type | int | Y | 1 | 지하철 노선 종류<br>(문서하단 지하철 노선 타입 참조) |
| 1-6 | laneName | string | Y | 1 | 노선 이름 |
| 1-7 | laneNameKor | string | N | 1 | 노선 이름 국문<br>(다국어 서비스 시 표출) |
| 1-8 | laneNameJpnKata | string | N | 1 | 노선 이름 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-9 | CID | int | Y | 1 | 도시코드 |
| 1-10 | cityName | string | Y | 1 | 도시 명 |
| 1-11 | cityNameKor | string | N | 1 | 도시 명 국문<br>(다국어 서비스 시 표출) |
| 1-12 | cityNameJpnKata | string | N | 1 | 도시 명 일문(가타카나)<br>(lang = 2 인 경우 표출) |
| 1-13 | x | double | Y | 1 | 지하철역 x좌표 |
| 1-14 | y | double | Y | 1 | 지하철역 y좌표 |
| 1-15 | tel | string | N | 1 | 전화번호 |
| 1-16 | address | string | N | 1 | 주소 |
| 1-17 | driveInfo | 확장 노드 | Y | 1 | 운행 정보 리스트 |
| 1-17-1 | upFirstTime | string | N | 1 | 평일 상행 첫차 시간 |
| 1-17-2 | upLastTime | string | N | 1 | 평일 상행 막차 시간 |
| 1-17-3 | downFirstTime | string | N | 1 | 평일 하행 첫차 시간 |
| 1-17-4 | downLastTime | string | N | 1 | 평일 하행 막차 시간 |
| 1-17-5 | satUpFirstTime | string | N | 1 | 토요일 상행 첫차 시간 |
| 1-17-6 | satUpLastTime | string | N | 1 | 토요일 상행 막차 시간 |
| 1-17-7 | satDownFirstTime | string | N | 1 | 토요일 하행 첫차 시간 |
| 1-17-8 | satDownLastTime | string | N | 1 | 토요일 하행 막차 시간 |
| 1-17-9 | sunUpFirstTime | string | N | 1 | 일요일 상행 첫차 시간 |
| 1-17-10 | sunUpLastTime | string | N | 1 | 일요일 상행 막차 시간 |
| 1-17-11 | sunDownFirstTime | string | N | 1 | 일요일 하행 첫차 시간 |
| 1-17-12 | sunDownLastTime | string | N | 1 | 일요일 하행 막차 시간 |
| 1-18 | prevStationID | int | N | 1 | 이전역 ID |
| 1-19 | prevStationName | string | N | 1 | 이전역 이름 |
| 1-20 | nextStationID | int | N | 1 | 다음역 ID |
| 1-21 | nextStationName | string | N | 1 | 다음역 이름 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 11. (구) 지하철역 전체 시간표 조회 (Subway Station Timetable)

- **API Anchor ID**: `subwayTimeTable`
> 💡 **설명**: 지하철역 전체 시간표를 리턴합니다.<br> * 2024.05.02 결과 포맷이 새로워진 신규 지하철역 전체 시간표 조회 API 가 출시되었습니다. 신규 가이드를 확인하시려면 (신) 지하철역 전체 시간표 조회를 참조하세요.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/subwayTimeTable | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=0 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | stationID | Y | 지하철역 시간표 정보를 조회 할 역코드 | stationID=130 |
| 2 | wayCode | N | 지하철역 방면 코드<br>(1:상행, 2:하행) | wayCode=1 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장 노드 | Y | 1 | 데이터를 포함하는 최상위 노드 |
| 1-1 | stationName | string | Y | 1 | 지하철역 명 |
| 1-2 | stationID | int | Y | 1 | 지하철역 ID |
| 1-3 | type | int | Y | 1 | 노선종류 |
| 1-4 | laneName | string | Y | 1 | 노선명 |
| 1-5 | laneCity | string | Y | 1 | 노선지역명 |
| 1-6 | WeekList | 확장 노드 | Y | 1 | 평일 시간 리스트 |
| 1-6-1 | up | 확장 노드 | N | 0...1 | 상행선 시간 리스트 |
| 1-6-1-1 | time | 확장 노드 | Y | 1 | 시간별 시간 data 리스트 |
| 1-6-1-1-1 | Idx | int | Y | 1 | 시간 (5~25시 까지, 25는 1시) |
| 1-6-1-1-2 | list | string | Y | 1 | 시간 data |
| 1-6-2 | down | 확장 노드 | N | 0...1 | 하행선 시간 리스트 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 12. (신) 지하철역 전체 시간표 조회 (Subway Station Timetable)

- **API Anchor ID**: `searchSubwaySchedule`
> 💡 **설명**: 지하철역 전체 시간표를 리턴합니다.<br> * 2024.05.02 결과 포맷이 새로워진 신규 지하철역 전체 시간표 조회 API 입니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchSubwaySchedule | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>(국문:0 , 영문:1, 일문:2, 중문(간체):3, 중문(번체):4, 베트남어:5)<br>* 베트남어의 경우 수도권에 한하여 제공<br>default = 0 | lang=0 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | stationID | Y | 지하철역 시간표 정보를 조회 할 역코드 | stationID=130 |
| 2 | wayCode | N | 지하철역 방면 코드<br>(1:상행, 2:하행) | wayCode=1 |
| 3 | showExpressTime | N | 급행시간 표출 여부<br>(1:급행포함) | showExpressTime=1 |
| 4 | sepExpressTime | N | 특급열차 분리 여부<br>(1:특급분리) | sepExpressTime=1 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장노드 | Y | 1 | 데이터를 포함하는 최상위 노드 |
| 1-1 | stationName | string | Y | 1 | 지하철역 명 |
| 1-2 | stationNameKor | string | N | 1 | 지하철역 명 국문 |
| 1-3 | stationNameJpnKata | string | N | 1 | 지하철역 명 일문(가타카나) |
| 1-4 | stationID | int | Y | 1 | 지하철역 ID |
| 1-5 | type | int | Y | 1 | 노선종류 |
| 1-6 | laneName | string | Y | 1 | 노선명 |
| 1-7 | laneNameKor | string | N | 1 | 노선명 국문 |
| 1-8 | laneNameJpnKata | string | N | 1 | 노선명 일문(가타카나) |
| 1-9 | laneCity | string | Y | 1 | 노선지역명 |
| 1-10 | WeekList | 확장 노드 | Y | 1 | 평일 시간 리스트 |
| 1-10-1 | up | 확장 노드 | N | 0...1 | 상행선 시간 리스트 |
| 1-10-1-1 | time | 확장 노드 | Y | 1 | 시간별 시간 data 리스트 |
| 1-10-1-1-1 | Idx | int | Y | 1 | 시간 (5~25시) |
| 1-10-1-1-2 | list | string | Y | 1 | 시간 data |
| 1-10-1-1-5 | expList | string | N | 1 | 급행시간 data |
| 1-10-1-1-8 | expSPList | string | N | 1 | 특급시간 data |
| 1-10-2 | down | 확장 노드 | N | 0...1 | 하행선 시간 리스트 |
| 1-11 | SatList | 확장 노드 | Y | 1 | 토요일 시간 리스트 |
| 1-12 | SunList | 확장 노드 | Y | 1 | 일요일 시간 리스트 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 13. 노선 그래픽 데이터 검색 (Route Graphic Data)

- **API Anchor ID**: `loadLane`
> 💡 **설명**: 지도상에 버스노선 및 지하철노선 선형(Polyline 좌표)을 그리기 위한 노선 그래픽 데이터를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/loadLane | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | mapObject | Y | 노선 그래픽 데이터 검색 패러미터 문자열<br>노선 그래픽 데이터 검색 패러미터 0:0@버스ID:노선종류@지하철노선ID:노선종류 등 | mapObject=0:0@12018:1 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장 노드 | Y | 1 | 데이터를 포함하는 최상위 노드 |
| 1-1 | lane | 확장 노드 | Y | 1...n | 노선 선형 리스트 |
| 1-1-1 | class | int | Y | 1 | 이동 수단 구분(1: 버스, 2: 지하철) |
| 1-1-2 | type | int | Y | 1 | 노선 종류 |
| 1-1-3 | section | 확장 노드 | Y | 1...n | 그래픽 섹션 |
| 1-1-3-1 | graphPos | 확장 노드 | Y | 1...n | 선형 좌표 목록 |
| 1-1-3-1-1 | x | double | Y | 1 | 경도(x) 좌표 |
| 1-1-3-1-2 | y | double | Y | 1 | 위도(y) 좌표 |

### • 에러 코드 (Error Code)

| 코드 | 메시지 |
| :---: | --- |
| 500 | 서버 내부 오류 |
| -8 | 필수 입력값 형식 및 범위 오류 |
| -9 | 필수 입력값 누락 |

---

## 14. 대중교통 정류장 검색 (Public Transit Stop)

- **API Anchor ID**: `searchStation`
> 💡 **설명**: 버스 정류장 명칭 및 지하철 역명으로 해당 정류장의 상세 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchStation | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택<br>default = 0 | lang=1 |
| 공통 | output | N | 출력포맷(json, xml)<br>default = json | output=xml |
| 1 | stationName | Y | 정류장 이름 | stationName=강남 |
| 2 | CID | N | 도시코드 | CID=1000 |
| 3 | stationClass | N | 정류장 종류 (1: 지하철, 2: 버스) | stationClass=1 |
| 4 | displayCnt | N | 리턴 결과 개수 | displayCnt=10 |
| 5 | startNO | N | 시작 번호 | startNO=1 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장 노드 | Y | 1 | 최상위 노드 |
| 1-1 | totalCount | int | Y | 1 | 검색 결과 개수 |
| 1-2 | station | 확장 노드 | Y | 1...n | 정류장 검색 결과 목록 |
| 1-2-1 | stationClass | int | Y | 1 | 정류장 구분(1: 지하철, 2: 버스) |
| 1-2-2 | stationName | string | Y | 1 | 정류장 명칭 |
| 1-2-3 | stationID | int | Y | 1 | 정류장 ID |
| 1-2-4 | x | double | Y | 1 | 경도(x) 좌표 |
| 1-2-5 | y | double | Y | 1 | 위도(y) 좌표 |

---

## 15. 반경내 대중교통 POI 검색 (Public Transit POI within Radius)

- **API Anchor ID**: `pointSearch`
> 💡 **설명**: 특정 좌표 반경 내 대중교통 POI(정류장/지하철역) 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/pointSearch | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 1 | x | Y | 경도 좌표 | x=126.978388 |
| 2 | y | Y | 위도 좌표 | y=37.566610 |
| 3 | radius | N | 반경(m) (기본값: 500m) | radius=300 |

---

## 16. 지도 위 대중교통 POI 검색 (Public Transit POI on Map)

- **API Anchor ID**: `boundarySearch`
> 💡 **설명**: 지정한 지도 바운더리(BBox) 영역 내 대중교통 POI 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/boundarySearch | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 1 | left | Y | 최소 경도(West) | left=126.970 |
| 2 | top | Y | 최대 위도(North) | top=37.570 |
| 3 | right | Y | 최대 경도(East) | right=126.980 |
| 4 | bottom | Y | 최소 위도(South) | bottom=37.560 |

---

## 17. 지하철 경로검색 조회(지하철 노선도) (Subway Route Search)

- **API Anchor ID**: `subwayPath`
> 💡 **설명**: 출발역과 도착역 간 최단시간/최소환승 지하철 경로 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/subwayPath | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 1 | CID | Y | 도시코드 (1000: 수도권 등) | CID=1000 |
| 2 | SID | Y | 출발역 ID | SID=130 |
| 3 | EID | Y | 도착역 ID | EID=135 |
| 4 | sType | N | 경로 탐색 옵션 (1: 최단시간, 2: 최소환승) | sType=1 |

---

## 18. 시간표 기반 지하철 경로검색 조회 (Scheduled Subway Route Search)

- **API Anchor ID**: `subwayPathSchedule`
> 💡 **설명**: 지하철 운행 시간표 데이터를 기반으로 정밀한 출발/도착 시각이 포함된 지하철 경로를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/subwayPathSchedule | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 1 | CID | Y | 도시코드 | CID=1000 |
| 2 | SID | Y | 출발역 ID | SID=130 |
| 3 | EID | Y | 도착역 ID | EID=135 |
| 4 | day | N | 요일 (1: 평일, 2: 토요일, 3: 일요일/공휴일) | day=1 |
| 5 | time | N | 출발 시각 (HHMM 형태) | time=0830 |

---

## 19. 대중교통 길찾기 v1.7 (Public Transit Route Search)

- **API Anchor ID**: `searchPubTransPath`
> 💡 **설명**: (구버전 v1.7) 대중교통 경로 검색 정보를 리턴합니다.<br> * v1.8 `searchPubTransPathT` API 사용을 권장합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchPubTransPath | json, xml |

---

## 20. 대중교통 길찾기 v1.8 (Public Transit Route Search)

- **API Anchor ID**: `searchPubTransPathT`
> 💡 **설명**: 출발 좌표와 도착 좌표를 바탕으로 최적의 대중교통 경로(버스, 지하철, 도보 조합) 정보를 리턴합니다. ODsay 핵심 API입니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchPubTransPathT | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 공통 | lang | N | 결과 언어 선택 (0: 국문, 1: 영문, 2: 일문, 3: 중문간체, 4: 중문번체, 5: 베트남어) | lang=0 |
| 1 | SX | Y | 출발지 경도(x) 좌표 | SX=126.9264 |
| 2 | SY | Y | 출발지 위도(y) 좌표 | SY=37.5268 |
| 3 | EX | Y | 도착지 경도(x) 좌표 | EX=126.9779 |
| 4 | EY | Y | 도착지 위도(y) 좌표 | EY=37.5665 |
| 5 | OPT | N | 경로정렬 옵션 (0: 최적경로, 1: 최소시간, 2: 최소환승) | OPT=0 |
| 6 | SearchType | N | 도시 내 / 도시 간 경로 선택 (0: 전체, 1: 시내교통, 2: 시외교통) | SearchType=0 |
| 7 | SearchPathType | N | 대중교통 수단 선택 (0: 전체, 1: 지하철, 2: 버스, 3: 버스+지하철) | SearchPathType=0 |

### • 출력 데이터 (Output Data)

| 번호 | 요소 | 데이터 타입 | 필수값 | 출력개수 | 설명 |
| :---: | --- | --- | :---: | --- | --- |
| 1 | result | 확장 노드 | Y | 1 | 최상위 데이터 노드 |
| 1-1 | searchType | int | Y | 1 | 검색 유형 |
| 1-2 | outTrafficCheck | int | Y | 1 | 시외 이동 포함 여부 (0: 시내, 1: 시외) |
| 1-3 | busCount | int | Y | 1 | 버스 경로 개수 |
| 1-4 | subwayCount | int | Y | 1 | 지하철 경로 개수 |
| 1-5 | subwayBusCount | int | Y | 1 | 버스+지하철 혼합 경로 개수 |
| 1-6 | path | 확장 노드 | Y | 1...n | 검색된 경로 목록 |
| 1-6-1 | pathType | int | Y | 1 | 경로 종류 (1: 지하철, 2: 버스, 3: 버스+지하철) |
| 1-6-2 | info | 확장 노드 | Y | 1 | 경로 요약 정보 |
| 1-6-2-1 | trafficDistance | int | Y | 1 | 총 이동 거리(m) |
| 1-6-2-2 | totalDistance | int | Y | 1 | 전체 거리(m) |
| 1-6-2-3 | totalTime | int | Y | 1 | 총 소요시간(분) |
| 1-6-2-4 | payment | int | Y | 1 | 총 요금(원) |
| 1-6-2-5 | busTransitCount | int | Y | 1 | 버스 환승 횟수 |
| 1-6-2-6 | subwayTransitCount | int | Y | 1 | 지하철 환승 횟수 |
| 1-6-2-7 | mapObj | string | Y | 1 | `loadLane` 호출용 그래픽 패러미터 ID |
| 1-6-2-8 | firstStartStation | string | Y | 1 | 최초 출발 정류장/역명 |
| 1-6-2-9 | lastEndStation | string | Y | 1 | 최종 도착 정류장/역명 |
| 1-6-3 | subPath | 확장 노드 | Y | 1...n | 세부 이동 구간 리스트 |
| 1-6-3-1 | trafficType | int | Y | 1 | 이동 수단 (1: 지하철, 2: 버스, 3: 도보) |
| 1-6-3-2 | distance | int | Y | 1 | 구간 이동 거리(m) |
| 1-6-3-3 | sectionTime | int | Y | 1 | 구간 이동 소요시간(분) |
| 1-6-3-4 | stationCount | int | N | 1 | 경유하는 정류장 수 |
| 1-6-3-5 | lane | 확장 노드 | N | 1...n | 이용하는 버스/지하철 노선 정보 |
| 1-6-3-5-1 | name | string | Y | 1 | 노선 명칭 (버스 번호 / 지하철 노선명) |
| 1-6-3-5-2 | busID | int | N | 1 | 버스 노선 ID |
| 1-6-3-5-3 | busLocalBlID | string | N | 1 | 실시간 연동용 지역 버스 노선 ID |
| 1-6-3-6 | startStation | 확장 노드 | N | 1 | 승차 정류장/역 정보 |
| 1-6-3-6-1 | stationID | int | Y | 1 | 정류장/역 ID |
| 1-6-3-6-2 | stationName | string | Y | 1 | 정류장/역 명칭 |
| 1-6-3-6-3 | x | double | Y | 1 | 승차 위치 경도 |
| 1-6-3-6-4 | y | double | Y | 1 | 승차 위치 위도 |
| 1-6-3-6-5 | arsID | string | N | 1 | 버스 정류장 고유번호 (실시간 연동) |
| 1-6-3-7 | endStation | 확장 노드 | N | 1 | 하차 정류장/역 정보 |
| 1-6-3-8 | passStopList | 확장 노드 | N | 1 | 경유 정류장 전체 리스트 |

---

## 21. 지하철역 환승 정보 조회 (Subway Station Transfer Information)

- **API Anchor ID**: `subwayTransitInfo`
> 💡 **설명**: 지하철 환승역에서의 환승 소요시간, 환승 거리, 빠른 환승 위치 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/subwayTransitInfo | json, xml |

### • 파라미터 (Parameter)

| 번호 | 파라미터 | 필수값 | 설명 | 예시 |
| :---: | --- | :---: | --- | --- |
| 공통 | apiKey | Y | 발급된 키 | apiKey=xxxxxxxxxxx |
| 1 | stationID | Y | 환승 지하철역 ID | stationID=130 |

---

## 22. 고속버스 터미널 검색 (Express Bus Terminal)

- **API Anchor ID**: `expressBusTerminals`
> 💡 **설명**: 전국 고속버스 터미널 목록 및 좌표, ID 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/expressBusTerminals | json, xml |

---

## 23. 시외버스 터미널 검색 (Intercity Bus Terminal)

- **API Anchor ID**: `intercityBusTerminals`
> 💡 **설명**: 전국 시외버스 터미널 목록 및 좌표, ID 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/intercityBusTerminals | json, xml |

---

## 24. 도시코드 조회 (City Code)

- **API Anchor ID**: `searchCID`
> 💡 **설명**: ODsay API 전반에서 사용되는 전국 행정구역 도시코드(CID) 및 도시명 매핑 목록을 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchCID | json, xml |

---

## 25. 기차역 터미널 조회 (Train Station Terminal)

- **API Anchor ID**: `trainTerminals`
> 💡 **설명**: 전국 철도역(KTX/SRT 포함) 목록 및 ID, 좌표 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/trainTerminals | json, xml |

---

## 26. 반경 내 버스/지하철 정류장 및 버스노선 조회 (Bus/Subway Stop & Bus Route within Radius)

- **API Anchor ID**: `pointBusStation`
> 💡 **설명**: 특정 좌표 반경 내 정류장 정보와 해당 정류장에 경유하는 전체 버스 노선 목록을 한 번에 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/pointBusStation | json, xml |

---

## 27. 대중교통 접근성 영역 조회 (Public Transit Accessibility Area Search)

- **API Anchor ID**: `searchPubTransIsochrone`
> 💡 **설명**: 특정 지점으로부터 지정한 소요시간(예: 30분, 60분 등) 내 대중교통으로 도달 가능한 등시간선(Isochrone) 도달 영역 폴리곤 좌표를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchPubTransIsochrone | json, xml |

---

## 28. 멀티모달 대중교통 길찾기 (Multi-modal Route Search)

- **API Anchor ID**: `maasRP`
> 💡 **설명**: 대중교통 외 개인형 이동장치(PM), 킥보드, 자전거 등과 연계된 MaaS 기반 경로 검색 결과를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/maasRP | json, xml |

---

## 29. 열차 노선도 길찾기 (Train Route Search)

- **API Anchor ID**: `searchTrainPath`
> 💡 **설명**: 기차(KTX, SRT, 일반열차) 노선망 기준 경로 및 환승 경로 검색 결과를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchTrainPath | json, xml |

---

## 30. 도보 접근성 영역 조회 (Walk Accessibility Area Search)

- **API Anchor ID**: `searchWalkIsochrone`
> 💡 **설명**: 특정 출발지 지점으로부터 제한시간 내 도보로 도착할 수 있는 영역(Isochrone Polygon) 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchWalkIsochrone | json, xml |

---

## 31. 도보 길찾기 (Walk Route Search)

- **API Anchor ID**: `searchWalkPathV2`
> 💡 **설명**: 출발 좌표와 도착 좌표 간 도보 경로 상세(소요시간, 거리, 보행 선형 좌표)를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchWalkPathV2 | json, xml |

---

## 32. 자전거 길찾기 (Bike Route Search)

- **API Anchor ID**: `searchBikePathV2`
> 💡 **설명**: 출발 좌표와 도착 좌표 간 자전거 도로 최적 경로(소요시간, 자전거 경로 선형 좌표) 정보를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/searchBikePathV2 | json, xml |

---

## 33. 지하철 노선도 (Subway Map)

- **API Anchor ID**: `subwayMap`
> 💡 **설명**: 도시별 지하철 노선도의 역 배치 및 선형 구조 데이터를 리턴합니다.

| 매서드 | 요청 URI | 출력 포맷 |
| :---: | --- | --- |
| GET/POST | https://api.odsay.com/v1/api/subwayMap | json, xml |

---

## 34. 코드정의 (Code Definition)

- **API Anchor ID**: `defineCode`
> 💡 **설명**: 버스 노선 타입, 지하철 노선 타입, 도시코드 등 ODsay 데이터베이스 내부 코드에 대한 표준 정의입니다.

### 🚌 버스노선 타입 코드 (Bus Route Type Code)

| 코드 | 버스 종류 설명 |
| :---: | --- |
| 1 | 일반 |
| 2 | 좌석 |
| 3 | 마을버스 |
| 4 | 직행좌석 |
| 5 | 공항버스 |
| 6 | 간선급행 |
| 10 | 외곽 |
| 11 | 간선 |
| 12 | 지선 |
| 13 | 순환 |
| 14 | 광역 |
| 15 | 급행 |
| 16 | 관광 |
| 20 | 농어촌버스 |
| 22 | 시외형버스 |
| 26 | 급행간선 |

### 🚇 지하철 노선 타입 코드 (Subway Line Type Code)

| 코드 | 노선명 |
| :---: | --- |
| 1 | 수도권 1호선 |
| 2 | 수도권 2호선 |
| 3 | 수도권 3호선 |
| 4 | 수도권 4호선 |
| 5 | 수도권 5호선 |
| 6 | 수도권 6호선 |
| 7 | 수도권 7호선 |
| 8 | 수도권 8호선 |
| 9 | 수도권 9호선 |
| 101 | 공항철도 |
| 102 | 자기부상철도 |
| 104 | 경의중앙선 |
| 107 | 에버라인 |
| 108 | 경춘선 |
| 109 | 신분당선 |
| 110 | 의정부경전철 |
| 112 | 경강선 |
| 113 | 우이신설경전철 |
| 114 | 서해선 |
| 115 | 김포골드라인 |
| 116 | 수인분당선 |
| 117 | 신림선 |
| 200 | 부산 1호선 |
| 201 | 부산 2호선 |
| 202 | 부산 3호선 |
| 203 | 부산 4호선 |
| 204 | 동해선 |
| 211 | 부산-김해경전철 |
| 300 | 대구 1호선 |
| 301 | 대구 2호선 |
| 302 | 대구 3호선 |
| 400 | 광주 1호선 |
| 500 | 대전 1호선 |

### 🏙️ 도시 코드 (City Code - CID)

| CID | 도시명 |
| :---: | --- |
| 1000 | 수도권 (서울, 경기, 인천) |
| 2000 | 부산 |
| 3000 | 대구 |
| 4000 | 광주 |
| 5000 | 대전 |
| 6000 | 울산 |
| 7000 | 세종 |
| 8000 | 강원도 |
| 9000 | 충청북도 |
| 10000 | 충청남도 |
| 11000 | 전라북도 |
| 12000 | 전라남도 |
| 13000 | 경상북도 |
| 14000 | 경상남도 |
| 15000 | 제주도 |

---

> [!NOTE]
> 본 문서는 ODsay LAB Release ver.1 원문 명세 페이지(`content.md`)의 전체 34개 아티클, 모든 입출력 구조 및 코드 정의를 100% 반영하여 생성되었습니다.
