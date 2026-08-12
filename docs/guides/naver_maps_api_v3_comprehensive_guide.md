# NAVER 지도 API v3 종합 기술 문서

> **최종 업데이트**: 2024년 기준  
> **API 버전**: NAVER Maps API v3  
> **문서 위치**: https://navermaps.github.io/maps.js.ncp/docs/

---

## 목차

1. [개요](#개요)
2. [API 특징](#api-특징)
3. [브라우저 호환성](#브라우저-호환성)
4. [핵심 개념](#핵심-개념)
5. [설치 및 초기화](#설치-및-초기화)
6. [지도(Map) 클래스](#지도map-클래스)
7. [지도 유형(Map Types)](#지도-유형map-types)
8. [좌표 및 투영](#좌표-및-투영)
9. [이벤트 시스템](#이벤트-시스템)
10. [컨트롤](#컨트롤)
11. [레이어](#레이어)
12. [데이터 레이어](#데이터-레이어)
13. [오버레이](#오버레이)
14. [시각화](#시각화)
15. [파노라마](#파노라마)
16. [좌표-주소 변환](#좌표-주소-변환)
17. [그리기 도구](#그리기-도구)
18. [GL 모듈](#gl-모듈)
19. [타입 정의](#타입-정의)
20. [마이그레이션 가이드](#마이그레이션-가이드)

---

## 개요

### NAVER 지도 API v3이란?

NAVER 지도 API v3는 **JavaScript 형태의 NAVER 지도 플랫폼**으로서, 웹 서비스 또는 애플리케이션에 NAVER 지도 기능을 구현할 수 있도록 설계되었습니다. 다양한 클래스와 메서드를 제공하며, 데스크톱과 모바일 환경 모두에 최적화되어 있습니다.

### 주요 특징

- **높은 성능**: 데스크톱과 모바일 환경에 최적화
- **주요 브라우저 완벽 지원**: Chrome, Safari, Firefox, IE 11 이상
- **독립적인 API**: JindoJS 등 다른 프레임워크에 의존하지 않음
- **CSS 불필요**: 별도의 CSS 파일 로드 필요 없음
- **풍부한 기능**: 마커, 도형, 레이어, 데이터 시각화 등 다양한 기능 제공

---

## API 특징

### 1. 독립적인 API

NAVER 지도 API v3은 이전 버전(v1, v2)과 달리 **JindoJS 프레임워크의 의존성 제거**:

- DOM(Document Object Model) 처리 및 웹 브라우저 호환 코드 내장
- 어떠한 프레임워크 또는 라이브러리와도 완벽히 독립적으로 동작
- React, Vue, Angular 등 모던 프레임워크와 자유롭게 사용 가능
- 별도의 CSS 파일 필요 없음

### 2. 모바일 최적화

모바일 웹 브라우징 환경에 맞춘 설계:

#### 터치 이벤트
- `touchstart`: 손가락이 화면에 닿음
- `touchmove`: 손가락이 화면을 따라 움직임
- `touchend`: 손가락이 화면에서 떨어짐

#### 제스처 이벤트
- **`tap`**: 한 손가락으로 빠르게 터치
- **`doubletap`**: 한 손가락으로 빠르게 두 번 터치
- **`longtap`**: 한 손가락으로 1초 이상 터치 유지
- **`twofingertap`**: 두 손가락으로 동시에 터치
- **`pinch in/out`**: 두 손가락을 모으거나 펼침

#### 렌더링 최적화
- **CSS3 Transform** 적극 활용
- 성능이 낮은 환경에서는 자동으로 **CSS2 렌더링**으로 전환
- 각 환경에서 최적의 성능 제공

### 3. KVO(Key-Value Observing) 디자인

NAVER 지도 API v3 설계의 핵심:

- KVO 클래스를 상속받은 클래스의 속성 변경을 효율적으로 감시
- 속성 바인딩(`bind`)을 통해 상태 변화에 자동으로 대응
- 이벤트 기반 프로그래밍 가능
- 복잡한 콜백 코드 감소

### 4. 단일 버전 관리

- NAVER 지도 API v3은 **단일 버전으로 제공**
- 버전 정보는 JavaScript 파일 시작 부분의 주석에서 확인 가능
- 예: `mantle - NAVER Maps API v3.0.0 - 2016-05-26`
- 버전 관련 문의는 NAVER Cloud Platform 지원 센터

---

## 브라우저 호환성

### PC 환경
| 브라우저 | 지원 버전 |
|---------|---------|
| Internet Explorer | 11 이상 |
| Chrome | 최신 버전 |
| Safari | 5 이상 |
| Firefox | 최신 버전 |

### 모바일 환경
| OS | 지원 버전 |
|----|---------|
| Android | 5.0 이상 |
| iOS | 9 이상 |

### 서브 모듈 API 호환성

특정 서브 모듈의 호환성은 코어 API와 다를 수 있습니다:
- **panorama** (파노라마)
- **geocoder** (좌표-주소 변환)
- **drawing** (그리기 도구)
- **visualization** (데이터 시각화)
- **gl** (3D 지도)

---

## 핵심 개념

### Namespace 구조

```javascript
naver
├── maps (코어 API)
│   ├── drawing (그리기 도구 서브모듈)
│   ├── visualization (시각화 서브모듈)
│   └── ...
```

### 주요 Class 분류

#### Base Classes (기본 클래스)
- **LatLng**: 위도/경도 좌표 표현
- **LatLngBounds**: 좌표 경계 표현
- **Point**: 픽셀 좌표 표현
- **PointBounds**: 픽셀 좌표 경계 표현
- **Size**: 크기(너비, 높이) 표현

#### Core Classes (핵심 클래스)
- **Map**: 지도 인스턴스 생성 및 관리
- **KVO**: Key-Value Observing 상속 클래스
- **KVOArray**: 배열 형태의 KVO 객체

#### Map Type Classes
- **MapType**: 지도 유형 인터페이스
- **MapTypeRegistry**: 지도 유형 컬렉션
- **CanvasMapType**: 캔버스 기반 지도 유형
- **ImageMapType**: 이미지 기반 지도 유형

#### Control Classes
- **CustomControl**: 사용자 정의 컨트롤
- **LogoControl**: NAVER 로고 컨트롤
- **MapTypeControl**: 지도 유형 선택 컨트롤
- **ScaleControl**: 축척 컨트롤
- **ZoomControl**: 줌 컨트롤
- **MapDataControl**: 지도 데이터 저작권 컨트롤

#### Layer Classes
- **Layer**: 레이어 기본 클래스
- **BicycleLayer**: 자전거 도로 레이어
- **CadastralLayer**: 지적도 레이어
- **LabelLayer**: 라벨 레이어
- **StreetLayer**: 거리뷰 레이어
- **TrafficLayer**: 실시간 교통정보 레이어

#### Overlay Classes
- **Marker**: 마커
- **InfoWindow**: 정보 창
- **Polyline**: 선
- **Polygon**: 다각형
- **Rectangle**: 사각형
- **Circle**: 원
- **Ellipse**: 타원
- **GroundOverlay**: 지상 오버레이
- **OverlayView**: 사용자 정의 오버레이

#### Data Layer Classes
- **Data**: GeoJSON/KML/GPX 데이터 처리
- **Feature**: 지오메트리 피처
- **Geometry**: 기하학 도형 정의

#### Visualization Classes
- **HeatMap**: 열 지도
- **DotMap**: 점 지도
- **WeightedLocation**: 가중치 위치 데이터

#### Panorama Classes
- **Panorama**: 파노라마 뷰
- **FlightSpot**: 항공뷰 마크
- **AroundControl**: 거리/항공뷰 전환 컨트롤

---

## 설치 및 초기화

### 1. API 로드

HTML 파일에 API 스크립트 추가:

```html
<script type="text/javascript" src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=YOUR_CLIENT_ID"></script>
```

> **주의**: `YOUR_CLIENT_ID`를 NAVER Cloud Platform에서 발급받은 클라이언트 ID로 교체해야 합니다.

### 2. 지도 컨테이너 준비

HTML에 지도를 표시할 요소 생성:

```html
<div id="map" style="width: 100%; height: 600px;"></div>
```

### 3. 기본 지도 초기화

```javascript
const mapOptions = {
    center: new naver.maps.LatLng(37.5666103, 126.9783882), // 서울시청 좌표
    zoom: 11,
    mapTypeControl: true,
    zoomControl: true
};

const map = new naver.maps.Map('map', mapOptions);
```

### 4. TypeScript 지원

TypeScript를 사용하는 경우:

```typescript
import { Map, MapOptions, LatLng } from 'naver-maps';

const mapOptions: MapOptions = {
    center: new LatLng(37.5666103, 126.9783882),
    zoom: 11
};

const map = new Map('map', mapOptions);
```

---

## 지도(Map) 클래스

### Map 클래스 개요

`Map` 클래스는 애플리케이션에서 **지도 인스턴스를 정의**합니다. 이 객체를 생성함으로써 개발자는 지정한 DOM 요소에 지도를 삽입할 수 있습니다.

### 생성자

```javascript
new naver.maps.Map(mapDiv, mapOptions)
```

#### 매개변수

| 이름 | 타입 | 설명 |
|------|------|------|
| `mapDiv` | `string` \| `HTMLElement` | 지도를 삽입할 HTML 요소 또는 요소의 `id` |
| `mapOptions` | `naver.maps.MapOptions` | 지도 옵션 객체 |

### Map 주요 Properties

| 속성명 | 타입 | 설명 |
|--------|------|------|
| `controls` | `naver.maps.KVOArray` | 지도 컨트롤 위치별 인스턴스. 사용자 정의 컨트롤을 추가할 수 있음 |
| `data` | `naver.maps.Data` | 데이터 레이어 (GeoJSON, KML, GPX) |
| `layers` | `LayerRegistry` | 지도 레이어 컬렉션 (자전거, 교통, 거리뷰 등) |
| `mapTypes` | `naver.maps.MapTypeRegistry` | 지도 유형 컬렉션 |
| `mapSystemProjection` | `naver.maps.MapSystemProjection` | 좌표 변환 메서드 제공 |

### 주요 메서드

#### 지도 위치 제어

##### `setCenter(center)`
지도의 중심 좌표를 설정합니다.

```javascript
map.setCenter(new naver.maps.LatLng(37.5666103, 126.9783882));
```

##### `getCenter()`
지도의 현재 중심 좌표를 반환합니다.

```javascript
const center = map.getCenter();
console.log(center.lat(), center.lng());
```

##### `panTo(coord, transitionOptions)`
지정한 좌표로 지도를 부드럽게 이동합니다.

```javascript
map.panTo(new naver.maps.LatLng(37.4979, 127.0276));
```

##### `panBy(offset)`
픽셀 단위로 지도를 이동합니다.

```javascript
map.panBy(new naver.maps.Point(100, 50));
```

##### `fitBounds(bounds, fitBoundsOptions)`
지정한 좌표 경계를 포함하도록 지도를 설정합니다.

```javascript
const bounds = new naver.maps.LatLngBounds(
    new naver.maps.LatLng(37.4979, 127.0276),
    new naver.maps.LatLng(37.5666103, 126.9783882)
);
map.fitBounds(bounds);
```

#### 줌 제어

##### `setZoom(zoom, effect)`
지도의 줌 레벨을 설정합니다.

```javascript
map.setZoom(15); // 줌 레벨 15로 설정
map.setZoom(15, true); // 줌 효과 포함
```

##### `getZoom()`
현재 줌 레벨을 반환합니다.

```javascript
const zoom = map.getZoom();
console.log(`현재 줌: ${zoom}`);
```

##### `zoomBy(deltaZoom, zoomOrigin, effect)`
줌 레벨을 상대값으로 변경합니다.

```javascript
map.zoomBy(2); // 현재 줌에서 +2
map.zoomBy(-1); // 현재 줌에서 -1
```

##### `getMaxZoom()` / `getMinZoom()`
지도의 최대/최소 줌 레벨을 반환합니다.

```javascript
const maxZoom = map.getMaxZoom();
const minZoom = map.getMinZoom();
```

#### 지도 경계 제어

##### `getBounds()`
현재 지도 화면의 좌표 경계를 반환합니다.

```javascript
const bounds = map.getBounds();
const sw = bounds.getSouthWest();
const ne = bounds.getNorthEast();
```

##### `panToBounds(bounds, transitionOptions, margin)`
지정한 경계가 보이도록 부드럽게 지도를 이동합니다.

```javascript
map.panToBounds(bounds, {duration: 500}, {top: 10, right: 10, bottom: 10, left: 10});
```

#### 지도 크기 제어

##### `getSize()`
지도의 현재 크기(픽셀 단위)를 반환합니다.

```javascript
const size = map.getSize();
console.log(`가로: ${size.width}px, 세로: ${size.height}px`);
```

##### `setSize(size)`
지도의 크기를 설정합니다.

```javascript
map.setSize(new naver.maps.Size(800, 600));
```

##### `autoResize()`
지도 DOM 요소의 CSS 크기에 따라 지도를 자동으로 조정합니다.

```javascript
map.autoResize();
```

#### 애니메이션 제어

##### `morph(coord, zoom, transitionOptions)`
거리가 가까우면 부드럽게, 멀면 애니메이션으로 지도를 이동합니다.

```javascript
map.morph(
    new naver.maps.LatLng(37.4979, 127.0276),
    15,
    {duration: 500}
);
```

##### `updateBy(coord, zoom)`
지정한 좌표와 줌으로 즉시 지도를 이동합니다 (애니메이션 없음).

```javascript
map.updateBy(new naver.maps.LatLng(37.4979, 127.0276), 15);
```

##### `stop()`
진행 중인 애니메이션 효과를 중지합니다.

```javascript
map.stop();
```

#### 지도 유형 제어

##### `setMapTypeId(mapTypeId)`
지도 유형을 변경합니다.

```javascript
map.setMapTypeId(naver.maps.MapTypeId.NORMAL); // 일반 지도
map.setMapTypeId(naver.maps.MapTypeId.SATELLITE); // 위성 지도
map.setMapTypeId(naver.maps.MapTypeId.TERRAIN); // 지형 지도
map.setMapTypeId(naver.maps.MapTypeId.HYBRID); // 하이브리드 지도
```

##### `getMapTypeId()`
현재 지도 유형 ID를 반환합니다.

```javascript
const typeId = map.getMapTypeId();
```

#### 지도 옵션 제어

##### `setOptions(newOptionsOrKey, value)`
지도 옵션을 변경합니다.

```javascript
// 여러 옵션 동시 설정
map.setOptions({
    draggable: true,
    scrollWheel: true,
    keyboardShortcuts: true
});

// 단일 옵션 설정
map.setOptions('draggable', false);
```

##### `getOptions(key)`
지도 옵션을 조회합니다.

```javascript
const allOptions = map.getOptions();
const draggable = map.getOptions('draggable');
```

#### 투영 및 변환

##### `getProjection()`
지도의 투영 객체를 반환합니다.

```javascript
const projection = map.getProjection();
```

##### `getPrimitiveProjection()`
지도 유형의 원본 투영을 반환합니다.

```javascript
const primitiveProjection = map.getPrimitiveProjection();
```

##### `getCenterPoint()`
지도 중심 좌표를 세계 좌표(월드 좌표)로 변환합니다.

```javascript
const centerPoint = map.getCenterPoint();
```

##### `setCenterPoint(point)`
세계 좌표를 받아 지도 중심을 설정합니다.

```javascript
map.setCenterPoint(new naver.maps.Point(12345, 67890));
```

#### 사용자 정의 Pane 관리

##### `addPane(name, elementOrZIndex)`
지도에 사용자 정의 창(pane)을 추가합니다.

```javascript
const customPane = document.createElement('div');
map.addPane('customPane', customPane);
```

##### `removePane(name)`
사용자 정의 창을 제거합니다.

```javascript
map.removePane('customPane');
```

##### `getPanes()`
오버레이 요소를 추가할 수 있는 지도의 창들을 반환합니다.

```javascript
const panes = map.getPanes();
console.log(panes.overlayLayer); // 폴리라인, 폴리곤
console.log(panes.overlayImage); // 마커
console.log(panes.floatPane); // 정보 창
```

#### 기타 메서드

##### `refresh(noEffect)`
지도를 새로 고칩니다. 기본적으로 페이드 인 효과가 적용됩니다.

```javascript
map.refresh(); // 효과 포함
map.refresh(true); // 효과 제외
```

##### `destroy()`
모든 이벤트 및 DOM 요소를 포함하여 지도를 안전하게 제거합니다.

```javascript
map.destroy();
```

#### `getElement()`
지도의 HTML 요소를 반환합니다.

```javascript
const mapElement = map.getElement();
```

### MapOptions 상세 설명

지도를 생성할 때 전달하는 옵션 객체입니다.

#### 위치 및 줌 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `center` | `Coord \| CoordLiteral` | 서울시청 | 지도의 초기 중심 좌표 (37.5666103, 126.9783882) |
| `zoom` | `number` | 11 | 지도의 초기 줌 레벨 |
| `minZoom` | `number` | - | 지도의 최소 줌 레벨 |
| `maxZoom` | `number` | - | 지도의 최대 줌 레벨 |
| `bounds` | `Bounds \| BoundsLiteral` | null | 초기 좌표 경계 (설정 시 center, zoom 무시) |
| `maxBounds` | `Bounds \| BoundsLiteral` | null | 지도에서 보이는 최대 좌표 경계 |
| `zoomOrigin` | `Coord \| CoordLiteral` | null | 줌 효과 시 고정할 기준 좌표 |

#### 사용자 인터랙션 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `draggable` | `boolean` | true | 마우스/터치로 지도 이동 허용 |
| `scrollWheel` | `boolean` | true | 마우스 스크롤 휠로 줌 제어 허용 |
| `keyboardShortcuts` | `boolean` | true | 키보드 방향키로 이동 허용 |
| `disableDoubleClickZoom` | `boolean` | false | 더블 클릭 줌 비활성화 |
| `disableDoubleTapZoom` | `boolean` | false | 더블 탭 줌 비활성화 (모바일) |
| `disableTwoFingerTapZoom` | `boolean` | false | 두 손가락 탭 줌 비활성화 (모바일) |
| `disableKineticPan` | `boolean` | true | 관성 효과 비활성화 |
| `pinchZoom` | `boolean` | true | 핀치 제스처 줌 허용 (모바일) |

#### 시각 효과 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `background` | `string` | - | 지도 배경 이미지 URL 또는 CSS 색상값 |
| `baseTileOpacity` | `number` | 1 | 지도 기본 타일 불투명도 (0~1) |
| `tileTransition` | `boolean` | true | 타일 전환 페이드 인 효과 |
| `tileDuration` | `number` | 300~600 | 타일 페이드 인 지속시간 (ms) |
| `tileSpare` | `number` | 0 | 여유있게 로딩할 타일 개수 |
| `overlayZoomEffect` | `null \| string` | null | 오버레이 줌 효과 적용 대상 (pane 이름) |
| `resizeOrigin` | `naver.maps.Position` | CENTER | 지도 크기 조정 시 고정할 원점 |

#### 크기 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `size` | `Size \| SizeLiteral` | - | 지도의 초기 크기 (설정 없으면 CSS로 자동 조정) |
| `padding` | `padding` | {top:0, right:0, bottom:0, left:0} | 지도 뷰포트 안쪽 여백 (픽셀) |

#### 지도 유형 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `mapTypeId` | `string` | NORMAL | 초기 지도 유형 ID |
| `mapTypes` | `MapTypeRegistry` | - | 지도 유형 컬렉션 (기본값 사용 시 생략 가능) |

#### 컨트롤 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `logoControl` | `boolean` | true | NAVER 로고 컨트롤 표시 여부 |
| `logoControlOptions` | `LogoControlOptions` | - | 로고 컨트롤 옵션 |
| `mapTypeControl` | `boolean` | false | 지도 유형 컨트롤 표시 여부 |
| `mapTypeControlOptions` | `MapTypeControlOptions` | - | 지도 유형 컨트롤 옵션 |
| `zoomControl` | `boolean` | false | 줌 컨트롤 표시 여부 |
| `zoomControlOptions` | `ZoomControlOptions` | - | 줌 컨트롤 옵션 |
| `scaleControl` | `boolean` | true | 축척 컨트롤 표시 여부 |
| `scaleControlOptions` | `ScaleControlOptions` | - | 축척 컨트롤 옵션 |
| `mapDataControl` | `boolean` | true | 지도 데이터 저작권 컨트롤 표시 여부 |
| `mapDataControlOptions` | `MapDataControlOptions` | - | 저작권 컨트롤 옵션 |

#### GL 모듈 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `gl` | `boolean` | false | GL 벡터맵 활성화 (gl 서브모듈 필수 로드) |
| `customStyleId` | `string` | - | Style Editor에서 발행한 My Style ID (GL 전용) |

#### 빈 타일 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `blankTileImage` | `null \| string` | null | 빈 타일 이미지 URL (기본값: 투명 gif) |

### MapPanes 객체

지도의 레이어 스택 구조를 나타냅니다:

```javascript
const panes = map.getPanes();

// 폴리라인, 폴리곤 등 도형이 렌더링됨
// DOM 이벤트를 받지 않음
panes.overlayLayer;

// 마커가 렌더링됨
panes.overlayImage;

// 정보 창이 렌더링됨
// 모든 오버레이보다 위에 위치
panes.floatPane;
```

### Map 이벤트

Map 클래스에서 발생하는 이벤트:

#### 위치/줌 이벤트

| 이벤트 | 설명 | 매개변수 |
|--------|------|---------|
| `center_changed` | 지도 중심 좌표 변경 | `center: Coord` |
| `centerPoint_changed` | 지도 중심 세계 좌표 변경 | `centerPoint: Point` |
| `zoom_changed` | 줌 레벨 변경 완료 | `zoom: number` |
| `zoom` | 줌 레벨 변경 중 (실수) | - |
| `zoomstart` | 줌 애니메이션 시작 | - |
| `zoomend` | 줌 애니메이션 종료 | - |
| `bounds_changed` | 좌표 경계 변경 | `bounds: Bounds` |
| `size_changed` | 지도 크기 변경 | `size: Size` |
| `mapType_changed` | 지도 유형 변경 | `mapType: MapType` |
| `mapTypeId_changed` | 지도 유형 ID 변경 | `mapTypeId: string` |
| `projection_changed` | 투영 변경 | `projection: Projection` |

#### 마우스 이벤트

| 이벤트 | 설명 | 매개변수 |
|--------|------|---------|
| `click` | 지도 클릭 (오버레이 제외) | `pointerEvent: PointerEvent` |
| `dblclick` | 지도 더블 클릭 | `pointerEvent: PointerEvent` |
| `rightclick` | 지도 우클릭 | `pointerEvent: PointerEvent` |
| `mousedown` | 마우스 버튼 누름 | `pointerEvent: PointerEvent` |
| `mouseup` | 마우스 버튼 뗌 | `pointerEvent: PointerEvent` |
| `mousemove` | 마우스 이동 | `pointerEvent: PointerEvent` |
| `mouseover` | 마우스 진입 | `pointerEvent: PointerEvent` |
| `mouseout` | 마우스 이탈 | `pointerEvent: PointerEvent` |

#### 터치/제스처 이벤트

| 이벤트 | 설명 | 매개변수 |
|--------|------|---------|
| `touchstart` | 터치 시작 | `pointerEvent: PointerEvent` |
| `touchmove` | 터치 이동 | `pointerEvent: PointerEvent` |
| `touchend` | 터치 종료 | `pointerEvent: PointerEvent` |
| `tap` | 한 손가락 탭 | `pointerEvent: PointerEvent` |
| `doubletap` | 두 번 탭 | `pointerEvent: PointerEvent` |
| `longtap` | 길게 누름 (1초+) | `pointerEvent: PointerEvent` |
| `twofingertap` | 두 손가락 탭 | `pointerEvent: PointerEvent` |
| `pinchstart` | 핀치 제스처 시작 | `pointerEvent: PointerEvent` |
| `pinch` | 핀치 제스처 중 | `pointerEvent: PointerEvent` |
| `pinchend` | 핀치 제스처 종료 | `pointerEvent: PointerEvent` |

#### 드래그/패닝 이벤트

| 이벤트 | 설명 | 매개변수 |
|--------|------|---------|
| `dragstart` | 드래그 시작 | `pointerEvent: PointerEvent` |
| `drag` | 드래그 진행 중 | `pointerEvent: PointerEvent` |
| `dragend` | 드래그 종료 | `pointerEvent: PointerEvent` |
| `panning` | 패닝 시작 (panTo, morph 등) | - |

#### 키보드 이벤트

| 이벤트 | 설명 | 매개변수 |
|--------|------|---------|
| `keydown` | 키 누름 | `keyboardEvent: KeyboardEvent` |
| `keyup` | 키 뗌 | `keyboardEvent: KeyboardEvent` |

#### 상태 이벤트

| 이벤트 | 설명 | 매개변수 |
|--------|------|---------|
| `init` | 지도 초기화 완료 | - |
| `idle` | 지도 움직임 종료 (유휴 상태) | - |
| `resize` | 지도 크기 재설정 | - |
| `tilesloaded` | 모든 타일 로드 완료 | - |

#### 레이어 이벤트

| 이벤트 | 설명 | 매개변수 |
|--------|------|---------|
| `addLayer` | 레이어 추가 | `layer: Layer` |
| `removeLayer` | 레이어 제거 | `layername: string` |

#### 이벤트 등록 및 제거

```javascript
// 이벤트 리스너 등록
naver.maps.Event.addListener(map, 'click', (e) => {
    console.log(`클릭 위치: ${e.coord}`);
});

// 이벤트 리스너 제거
naver.maps.Event.removeListener(map, 'click', callbackFunction);

// 모든 리스너 제거
naver.maps.Event.removeListener(map);
```

---

## 지도 유형(Map Types)

### 기본 지도 유형

네이버 지도 API는 다음과 같은 기본 지도 유형을 제공합니다:

#### MapTypeId

| 유형 | ID | 설명 |
|------|----|----|
| 일반 지도 | `NORMAL` | 기본 도로 지도 |
| 위성 지도 | `SATELLITE` | 위성/항공사진 |
| 지형 지도 | `TERRAIN` | 지형정보 표시 |
| 하이브리드 지도 | `HYBRID` | 위성사진 + 라벨 |

#### 지도 유형 변경

```javascript
// 일반 지도로 변경
map.setMapTypeId(naver.maps.MapTypeId.NORMAL);

// 위성 지도로 변경
map.setMapTypeId(naver.maps.MapTypeId.SATELLITE);

// 현재 지도 유형 확인
const currentType = map.getMapTypeId();
```

### 커스텀 지도 유형 만들기

#### ImageMapType 사용

이미지 기반의 사용자 정의 지도 유형:

```javascript
const customMapType = new naver.maps.ImageMapType({
    getTile: (x, y, z) => {
        return new naver.maps.ImageTile(
            `https://example.com/tiles/${z}/${x}/${y}.png`
        );
    },
    tileSize: new naver.maps.Size(256, 256),
    minZoom: 0,
    maxZoom: 20,
    opacity: 1,
    projection: naver.maps.UTMK
});

// 지도 유형 등록
map.mapTypes.set('custom', customMapType);

// 커스텀 지도 유형 사용
map.setMapTypeId('custom');
```

#### CanvasMapType 사용

캔버스 기반의 동적 지도 유형:

```javascript
const canvasMapType = new naver.maps.CanvasMapType({
    getTile: (x, y, z) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 캔버스에 그리기
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0000';
        ctx.fillText(`${z}/${x}/${y}`, 10, 10);
        
        return new naver.maps.CanvasTile(canvas);
    },
    tileSize: new naver.maps.Size(256, 256),
    minZoom: 0,
    maxZoom: 20,
    opacity: 1,
    projection: naver.maps.UTMK
});

map.mapTypes.set('canvas', canvasMapType);
map.setMapTypeId('canvas');
```

### MapType 인터페이스

```javascript
{
    getTile(x, y, z) {
        // 타일 객체 반환
        return tile;
    },
    tileSize: Size,
    minZoom: number,
    maxZoom: number,
    opacity: number,    // 0~1
    projection: Projection,
    name: string,       // 선택사항
    alt: string         // 선택사항
}
```

### MapTypeRegistry

지도 유형을 관리하는 레지스트리:

```javascript
// 모든 지도 유형 조회
map.mapTypes.forEach((type, key) => {
    console.log(`${key}: ${type.name}`);
});

// 특정 지도 유형 조회
const normalType = map.mapTypes.get('normal');

// 지도 유형 등록
map.mapTypes.set('myType', customMapType);

// 지도 유형 제거
map.mapTypes.unset('myType');
```

---

## 좌표 및 투영

### 좌표 표현

#### LatLng (위도/경도)

NAVER 지도의 기본 좌표 표현:

```javascript
// 객체 생성
const latlng = new naver.maps.LatLng(37.5666103, 126.9783882);

// 메서드
const lat = latlng.lat(); // 위도
const lng = latlng.lng(); // 경도

// 문자열 표현
const str = latlng.toString();  // "(37.5666103, 126.9783882)"
```

#### LatLngBounds (좌표 경계)

좌표 범위를 나타냅니다:

```javascript
// 생성 방법 1: 두 개의 LatLng 전달
const bounds = new naver.maps.LatLngBounds(
    new naver.maps.LatLng(37.4979, 127.0276),  // 남서쪽
    new naver.maps.LatLng(37.5666103, 126.9783882) // 북동쪽
);

// 생성 방법 2: 리터럴 표현
const bounds = new naver.maps.LatLngBounds(
    {lat: 37.4979, lng: 127.0276},
    {lat: 37.5666103, lng: 126.9783882}
);

// 생성 방법 3: 배열 표현
const bounds = new naver.maps.LatLngBounds(
    [37.4979, 127.0276],
    [37.5666103, 126.9783882]
);

// 메서드
bounds.getSouthWest();  // 남서쪽 좌표
bounds.getNorthEast();  // 북동쪽 좌표
bounds.getCenter();     // 중심 좌표
bounds.getSize();       // 크기
bounds.isEmpty();       // 비어있는지 확인
bounds.extend(latlng);  // 경계 확장
bounds.contain(latlng); // 좌표 포함 여부
```

#### Point (픽셀 좌표)

화면 픽셀 좌표:

```javascript
const point = new naver.maps.Point(100, 200);

const x = point.x;  // X 좌표
const y = point.y;  // Y 좌표

// 메서드
const clone = point.clone();
```

#### Size (크기)

너비와 높이:

```javascript
const size = new naver.maps.Size(800, 600);

const width = size.width;   // 800
const height = size.height; // 600

// 메서드
const clone = size.clone();
```

### 좌표 변환 (투영)

지도는 서로 다른 좌표 체계를 지원합니다:

#### UTMK (Unified TM Korea)

NAVER 지도의 기본 좌표계:
- 한반도 중심의 정확한 거리 계산
- 모든 기본 기능에서 사용

```javascript
const utmk = naver.maps.UTMK;
const converted = utmk.projectLatLng(new naver.maps.LatLng(37.5666103, 126.9783882));
```

#### EPSG3857 (Web Mercator)

일반적인 웹 지도 좌표계:

```javascript
const epsg3857 = naver.maps.EPSG3857;
const converted = epsg3857.projectLatLng(new naver.maps.LatLng(37.5666103, 126.9783882));
```

#### Projection 인터페이스

커스텀 투영 구현:

```javascript
const customProjection = {
    projectLatLng: (latlng) => {
        // LatLng를 원하는 좌표계로 변환
        return new naver.maps.Point(x, y);
    },
    projectPoint: (point) => {
        // Point를 LatLng로 역변환
        return new naver.maps.LatLng(lat, lng);
    },
    getWorldSize: () => {
        return new naver.maps.Size(width, height);
    }
};
```

### MapSystemProjection

지도에 내장된 투영 시스템:

```javascript
const projection = map.getProjection();

// 지도 좌표 → 픽셀 좌표
const pixelCoord = projection.fromCoordToPoint(
    new naver.maps.LatLng(37.5666103, 126.9783882)
);

// 픽셀 좌표 → 지도 좌표
const latlng = projection.fromPointToCoord(
    new naver.maps.Point(100, 200)
);

// 세계 좌표 → 픽셀 좌표
const pixel = projection.fromPointToPixel(
    new naver.maps.Point(x, y)
);

// 픽셀 좌표 → 세계 좌표
const worldPoint = projection.fromPixelToPoint(
    new naver.maps.Point(100, 200)
);
```

---

## 이벤트 시스템

### Event 클래스

`naver.maps.Event`는 정적 메서드로 이벤트를 관리합니다.

#### 이벤트 리스너 등록

##### `addListener(target, type, listener)`

```javascript
// 지도 클릭 이벤트
naver.maps.Event.addListener(map, 'click', (e) => {
    console.log('클릭:', e.coord);
});

// 마커 클릭 이벤트
naver.maps.Event.addListener(marker, 'click', (e) => {
    console.log('마커 클릭');
});

// 이벤트 객체 참조 유지 (제거 시 필요)
const clickHandler = (e) => {
    console.log('클릭:', e.coord);
};
naver.maps.Event.addListener(map, 'click', clickHandler);
```

##### `addListenerOnce(target, type, listener)`

한 번만 실행되는 리스너:

```javascript
naver.maps.Event.addListenerOnce(map, 'tilesloaded', () => {
    console.log('타일 로드 완료 (1회만)');
});
```

#### 이벤트 리스너 제거

##### `removeListener(target, type, listener)`

```javascript
// 특정 리스너 제거
naver.maps.Event.removeListener(map, 'click', clickHandler);

// 특정 이벤트의 모든 리스너 제거
naver.maps.Event.removeListener(map, 'click');

// 모든 이벤트의 모든 리스너 제거
naver.maps.Event.removeListener(map);
```

### 이벤트 객체

각 이벤트는 특정 정보를 담은 이벤트 객체를 전달합니다.

#### PointerEvent (포인터 이벤트)

마우스/터치 이벤트의 기본 정보:

```javascript
naver.maps.Event.addListener(map, 'click', (e) => {
    console.log('좌표:', e.coord);           // LatLng
    console.log('픽셀:', e.point);           // Point
    console.log('원본 이벤트:', e.domEvent); // DOM Event
});
```

#### KeyboardEvent (키보드 이벤트)

```javascript
naver.maps.Event.addListener(map, 'keydown', (e) => {
    console.log('키 코드:', e.keyCode);
    console.log('DOM 이벤트:', e.domEvent);
});
```

### KVO (Key-Value Observing)

속성 변경을 감시하는 메커니즘:

#### Marker의 위치 변경 감시

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    map: map
});

// 'position' 속성의 변경을 감시
marker.addListener('position_changed', function() {
    const newPosition = this.getPosition();
    console.log('마커 위치 변경:', newPosition);
});

// 마커 위치 변경 (자동으로 이벤트 발생)
marker.setPosition(new naver.maps.LatLng(37.4979, 127.0276));
```

#### Map의 줌 레벨 변경 감시

```javascript
map.addListener('zoom_changed', (zoom) => {
    console.log('줌 레벨:', zoom);
});

map.setZoom(15); // zoom_changed 이벤트 발생
```

### 이벤트 위임 (Event Delegation)

한 번에 여러 객체에 리스너 등록:

```javascript
// 마커 배열에 일괄 등록
const markers = [...]; // 마커 목록

markers.forEach((marker) => {
    naver.maps.Event.addListener(marker, 'click', (e) => {
        console.log('마커 클릭:', e);
    });
});

// Map의 addListener 메서드 활용
naver.maps.Event.addListener(map, 'center_changed', function() {
    console.log('중심 변경:', this.getCenter());
});
```

---

## 컨트롤

### 컨트롤 개요

컨트롤은 지도 위에 표시되는 UI 요소입니다.

### 기본 제공 컨트롤

#### ZoomControl (줌 컨트롤)

```javascript
// 옵션과 함께 생성
const zoomControl = new naver.maps.ZoomControl({
    position: naver.maps.Position.TOP_RIGHT
});

// 지도에 추가
map.addControl(zoomControl);

// 또는 MapOptions에서 설정
const map = new naver.maps.Map('map', {
    zoomControl: true,
    zoomControlOptions: {
        position: naver.maps.Position.TOP_RIGHT
    }
});
```

#### MapTypeControl (지도 유형 컨트롤)

```javascript
const mapTypeControl = new naver.maps.MapTypeControl({
    position: naver.maps.Position.TOP_LEFT
});

map.addControl(mapTypeControl);
```

#### ScaleControl (축척 컨트롤)

```javascript
const scaleControl = new naver.maps.ScaleControl({
    position: naver.maps.Position.BOTTOM_LEFT
});

map.addControl(scaleControl);
```

#### LogoControl (로고 컨트롤)

NAVER 로고:

```javascript
const logoControl = new naver.maps.LogoControl({
    position: naver.maps.Position.BOTTOM_LEFT
});

map.addControl(logoControl);
```

#### MapDataControl (저작권 컨트롤)

```javascript
const dataControl = new naver.maps.MapDataControl({
    position: naver.maps.Position.BOTTOM_RIGHT
});

map.addControl(dataControl);
```

### 컨트롤 위치

```javascript
naver.maps.Position.TOP_LEFT      // 좌상단
naver.maps.Position.TOP_CENTER    // 상단 중앙
naver.maps.Position.TOP_RIGHT     // 우상단
naver.maps.Position.CENTER_LEFT   // 좌측 중앙
naver.maps.Position.CENTER        // 중앙
naver.maps.Position.CENTER_RIGHT  // 우측 중앙
naver.maps.Position.BOTTOM_LEFT   // 좌하단
naver.maps.Position.BOTTOM_CENTER // 하단 중앙
naver.maps.Position.BOTTOM_RIGHT  // 우하단
```

### 사용자 정의 컨트롤

CustomControl을 상속하여 만들기:

```javascript
class MyCustomControl extends naver.maps.CustomControl {
    constructor(options) {
        const element = document.createElement('div');
        element.innerHTML = '<button>내 컨트롤</button>';
        element.style.cssText = 'padding: 10px; background: white; border: 1px solid #ccc; border-radius: 4px;';
        
        super({element, ...options});
        this._element = element;
    }
}

// 사용
const myControl = new MyCustomControl({
    position: naver.maps.Position.TOP_RIGHT
});

map.addControl(myControl);
```

### 컨트롤 제어

```javascript
// 컨트롤 추가
map.addControl(control);

// 컨트롤 제거
map.removeControl(control);

// 특정 위치의 컨트롤들 접근
const topLeftControls = map.controls.get(naver.maps.Position.TOP_LEFT);

// 모든 컨트롤 순회
map.controls.forEach((control, position) => {
    console.log(position, control);
});
```

---

## 레이어

### 레이어 개요

레이어는 지도 위에 겹겹이 쌓인 정보 계층입니다.

### 기본 제공 레이어

#### TrafficLayer (교통정보 레이어)

실시간 교통상황을 표시합니다:

```javascript
const trafficLayer = new naver.maps.TrafficLayer();
map.layers.add(trafficLayer);

// 제거
map.layers.remove('traffic');
```

#### BicycleLayer (자전거 도로 레이어)

자전거 도로 정보를 표시합니다:

```javascript
const bicycleLayer = new naver.maps.BicycleLayer();
map.layers.add(bicycleLayer);
```

#### StreetLayer (거리뷰 레이어)

거리뷰 촬영 경로를 표시합니다:

```javascript
const streetLayer = new naver.maps.StreetLayer();
map.layers.add(streetLayer);
```

#### CadastralLayer (지적도 레이어)

지적도 경계를 표시합니다:

```javascript
const cadastralLayer = new naver.maps.CadastralLayer();
map.layers.add(cadastralLayer);
```

#### LabelLayer (라벨 레이어)

지도의 라벨(지명, 도로명 등) 표시 제어:

```javascript
// 라벨 숨기기
map.layers.setLabelLayer(naver.maps.LayerGroupType.NONE);

// 기본 라벨 표시
map.layers.setLabelLayer(naver.maps.LayerGroupType.LABEL);

// 배경 라벨 표시
map.layers.setLabelLayer(naver.maps.LayerGroupType.BACKGROUND);
```

### LayerRegistry (레이어 컬렉션)

```javascript
// 레이어 추가
map.layers.add(layer);

// 레이어 제거
map.layers.remove(layer);

// 이름으로 레이어 조회
const trafficLayer = map.layers.get('traffic');

// 모든 레이어 순회
map.layers.forEach((layer, name) => {
    console.log(name, layer);
});

// 레이어 존재 여부
if (map.layers.has('traffic')) {
    console.log('교통 레이어 있음');
}
```

### 사용자 정의 레이어

Layer 클래스를 상속하여 만들기:

```javascript
class MyLayer extends naver.maps.Layer {
    constructor(options) {
        super(options);
    }
    
    onAdd(map) {
        // 레이어가 지도에 추가될 때 호출
        console.log('레이어 추가됨');
    }
    
    onRemove(map) {
        // 레이어가 지도에서 제거될 때 호출
        console.log('레이어 제거됨');
    }
}

const myLayer = new MyLayer();
map.layers.add(myLayer, 'myLayer');
```

---

## 데이터 레이어

### 데이터 레이어 개요

GeoJSON, KML, GPX 형식의 지리정보 데이터를 지도에 표시합니다.

### Data 클래스

```javascript
// 빈 데이터 레이어 생성
const data = new naver.maps.Data({
    map: map,
    style: {
        strokeColor: '#ff0000',
        fillColor: '#ffff00',
        fillOpacity: 0.5
    }
});

// map.data로도 접근 가능
map.data;
```

### 데이터 형식 지원

#### GeoJSON

```javascript
const geojsonData = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [126.9783882, 37.5666103]
            },
            properties: {
                name: '서울시청'
            }
        },
        {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [[126.9783882, 37.5666103], [127.0276, 37.4979]]
            },
            properties: {
                name: '도로'
            }
        }
    ]
};

// 데이터 추가
map.data.addGeoJson(geojsonData);
```

#### KML

```javascript
// KML 파일 URL
map.data.loadGeoJson('http://example.com/data.kml');

// KML 문자열
const kmlString = `<?xml version="1.0"?>
<kml>
    <Placemark>
        <name>위치</name>
        <Point>
            <coordinates>126.9783882,37.5666103</coordinates>
        </Point>
    </Placemark>
</kml>`;

map.data.addGeoJson(kmlString);
```

#### GPX

```javascript
// GPX 파일 URL
map.data.loadGeoJson('http://example.com/route.gpx');
```

### 피처(Feature) 관리

```javascript
// 모든 피처 조회
map.data.getFeatures().forEach((feature) => {
    console.log(feature.getProperty('name'));
});

// 특정 피처 제거
map.data.removeFeature(feature);

// 모든 피처 제거
map.data.revertStyle();
```

### 스타일 설정

#### 자동 스타일(autoStyle)

```javascript
// 피처의 'style' 속성에 따라 자동으로 스타일 적용
map.data.setStyle((feature) => {
    if (feature.getProperty('type') === 'danger') {
        return {
            strokeColor: '#ff0000',
            fillColor: '#ffcccc'
        };
    } else {
        return {
            strokeColor: '#0000ff',
            fillColor: '#ccccff'
        };
    }
});
```

#### 고정 스타일

```javascript
map.data.setStyle({
    strokeColor: '#ff0000',
    fillColor: '#ffff00',
    fillOpacity: 0.5,
    strokeWeight: 2,
    strokeOpacity: 1
});
```

### 데이터 이벤트

```javascript
// 피처 클릭
naver.maps.Event.addListener(map.data, 'click', (e) => {
    const feature = e.feature;
    console.log('피처:', feature.getProperty('name'));
});

// 피처 마우스 오버
naver.maps.Event.addListener(map.data, 'mouseover', (e) => {
    e.feature.setStyle({fillColor: '#ff0000'});
});

// 피처 마우스 아웃
naver.maps.Event.addListener(map.data, 'mouseout', (e) => {
    map.data.revertStyle();
});
```

---

## 오버레이

### 오버레이 개요

오버레이는 지도 위에 그려지는 객체(마커, 도형, 정보 창 등)입니다.

### Marker (마커)

지도 위의 특정 위치에 표시되는 아이콘입니다.

#### 기본 마커 생성

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    map: map,
    title: '서울시청'
});
```

#### 마커 옵션

| 옵션 | 타입 | 설명 |
|------|------|------|
| `position` | `LatLng \| CoordLiteral` | 마커 위치 (필수) |
| `map` | `Map` | 지도 객체 |
| `title` | `string` | 마우스 오버 시 표시되는 텍스트 |
| `icon` | `string \| Object` | 아이콘 이미지 또는 옵션 |
| `visible` | `boolean` | 표시 여부 (기본값: true) |
| `zIndex` | `number` | 레이어 순서 |
| `draggable` | `boolean` | 드래그 가능 여부 (기본값: false) |
| `animation` | `number` | 애니메이션 타입 (DROP, BOUNCE 등) |

#### 마커 메서드

```javascript
// 위치 제어
marker.setPosition(new naver.maps.LatLng(37.4979, 127.0276));
const position = marker.getPosition();

// 표시/숨김
marker.setVisible(true);
const visible = marker.getVisible();

// 제목
marker.setTitle('새로운 제목');
const title = marker.getTitle();

// 아이콘 변경
marker.setIcon({
    content: '<img src="custom.png">',
    size: new naver.maps.Size(32, 32)
});

// 지도 추가/제거
marker.setMap(map);
marker.setMap(null); // 제거

// 드래그 활성화
marker.setDraggable(true);

// 마커 제거 (완전 삭제)
marker.setMap(null);
```

#### 마커 이벤트

```javascript
// 클릭
naver.maps.Event.addListener(marker, 'click', (e) => {
    console.log('마커 클릭');
});

// 더블 클릭
naver.maps.Event.addListener(marker, 'dblclick', (e) => {
    console.log('마커 더블 클릭');
});

// 우클릭
naver.maps.Event.addListener(marker, 'rightclick', (e) => {
    console.log('마커 우클릭');
});

// 드래그 시작/진행/종료
naver.maps.Event.addListener(marker, 'dragstart', (e) => {
    console.log('드래그 시작');
});

naver.maps.Event.addListener(marker, 'drag', (e) => {
    console.log('드래그 중', e.coord);
});

naver.maps.Event.addListener(marker, 'dragend', (e) => {
    console.log('드래그 종료', e.coord);
});

// 마우스 오버
naver.maps.Event.addListener(marker, 'mouseover', () => {
    marker.setImage('hover.png');
});

// 마우스 아웃
naver.maps.Event.addListener(marker, 'mouseout', () => {
    marker.setImage('normal.png');
});

// 위치 변경
naver.maps.Event.addListener(marker, 'position_changed', function() {
    console.log('새로운 위치:', this.getPosition());
});
```

#### 아이콘 커스터마이징

##### 이미지 아이콘

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    map: map,
    icon: {
        url: 'custom-marker.png',
        size: new naver.maps.Size(32, 32),
        origin: new naver.maps.Point(0, 0),
        anchor: new naver.maps.Point(16, 32)
    }
});
```

##### HTML 아이콘

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    map: map,
    icon: {
        content: '<div style="background: red; color: white; padding: 5px;">마커</div>',
        anchor: new naver.maps.Point(30, 50)
    }
});
```

##### 심벌 아이콘

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    map: map,
    icon: {
        path: naver.maps.Symbol.CIRCLE,
        fillColor: '#00ff00',
        fillOpacity: 1,
        strokeColor: '#000000',
        strokeWeight: 2,
        size: new naver.maps.Size(20, 20)
    }
});
```

### InfoWindow (정보 창)

마커나 지도 위의 특정 위치에 정보를 표시합니다.

#### 기본 정보 창 생성

```javascript
const infoWindow = new naver.maps.InfoWindow({
    content: '<div style="padding:10px;">정보 창 내용</div>',
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    maxWidth: 200,
    backgroundColor: '#ffffff',
    borderColor: '#000000',
    borderWidth: 2,
    anchorSize: new naver.maps.Size(0, 0),
    pixelOffset: new naver.maps.Point(0, -10)
});

infoWindow.open(map);
```

#### 마커와 함께 사용

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    map: map
});

const infoWindow = new naver.maps.InfoWindow({
    content: '<div style="padding:10px;">서울시청</div>'
});

// 마커 클릭 시 정보 창 표시
naver.maps.Event.addListener(marker, 'click', () => {
    if (infoWindow.getMap()) {
        infoWindow.close();
    } else {
        infoWindow.open(map, marker);
    }
});
```

#### 정보 창 메서드

```javascript
// 정보 창 열기
infoWindow.open(map, marker);  // 마커에 연결
infoWindow.open(map);          // 위치에 열기

// 정보 창 닫기
infoWindow.close();

// 내용 변경
infoWindow.setContent('새로운 내용');

// 위치 변경
infoWindow.setPosition(new naver.maps.LatLng(37.4979, 127.0276));

// 표시 여부
infoWindow.setVisible(true);

// 현재 지도에 열려있는지 확인
const isOpen = infoWindow.getMap() !== null;
```

### 도형 (Shape)

#### Polyline (선)

점들을 연결하는 선:

```javascript
const polyline = new naver.maps.Polyline({
    path: [
        new naver.maps.LatLng(37.5666103, 126.9783882),
        new naver.maps.LatLng(37.4979, 127.0276),
        new naver.maps.LatLng(37.4979, 126.9783882)
    ],
    map: map,
    strokeColor: '#ff0000',
    strokeWeight: 3,
    strokeOpacity: 1,
    strokeLineCap: 'round',
    strokeLineJoin: 'round'
});
```

#### Polygon (다각형)

폐곡선으로 둘러싸인 영역:

```javascript
const polygon = new naver.maps.Polygon({
    paths: [
        [
            new naver.maps.LatLng(37.5666103, 126.9783882),
            new naver.maps.LatLng(37.4979, 127.0276),
            new naver.maps.LatLng(37.4979, 126.9783882)
        ]
    ],
    map: map,
    fillColor: '#0000ff',
    fillOpacity: 0.5,
    strokeColor: '#000000',
    strokeWeight: 1,
    strokeOpacity: 1
});
```

#### Rectangle (사각형)

```javascript
const rectangle = new naver.maps.Rectangle({
    bounds: new naver.maps.LatLngBounds(
        new naver.maps.LatLng(37.4979, 126.9783882),
        new naver.maps.LatLng(37.5666103, 127.0276)
    ),
    map: map,
    fillColor: '#0000ff',
    fillOpacity: 0.5,
    strokeColor: '#000000',
    strokeWeight: 2
});
```

#### Circle (원)

```javascript
const circle = new naver.maps.Circle({
    center: new naver.maps.LatLng(37.5666103, 126.9783882),
    radius: 1000,  // 미터
    map: map,
    fillColor: '#00ff00',
    fillOpacity: 0.5,
    strokeColor: '#000000',
    strokeWeight: 1
});
```

#### Ellipse (타원)

```javascript
const ellipse = new naver.maps.Ellipse({
    center: new naver.maps.LatLng(37.5666103, 126.9783882),
    majorAxis: 2000,  // 장축 (미터)
    minorAxis: 1000,  // 단축 (미터)
    map: map,
    fillColor: '#ffff00',
    fillOpacity: 0.5,
    strokeColor: '#000000',
    strokeWeight: 1
});
```

#### 도형 메서드 및 이벤트

```javascript
// 공통 메서드
shape.setMap(map);           // 지도에 추가
shape.setMap(null);          // 제거
shape.setVisible(true);      // 표시/숨김
shape.setFillColor('#ff0000'); // 채우기 색상
shape.setFillOpacity(0.5);   // 채우기 투명도
shape.setStrokeColor('#000000'); // 선 색상
shape.setStrokeWeight(2);    // 선 굵기
shape.setStrokeOpacity(1);   // 선 투명도

// Polyline/Polygon 메서드
const path = polyline.getPath();
polyline.setPath([...]);

// 도형 이벤트
naver.maps.Event.addListener(shape, 'click', (e) => {
    console.log('도형 클릭');
});

naver.maps.Event.addListener(shape, 'mouseover', (e) => {
    shape.setFillColor('#ff0000');
});
```

### GroundOverlay (지상 오버레이)

이미지를 지도 위에 겹쳐 표시합니다:

```javascript
const groundOverlay = new naver.maps.GroundOverlay(
    'overlay-image.png',
    new naver.maps.LatLngBounds(
        new naver.maps.LatLng(37.4979, 126.9783882),
        new naver.maps.LatLng(37.5666103, 127.0276)
    ),
    {
        map: map,
        opacity: 0.7
    }
);
```

### OverlayView (사용자 정의 오버레이)

완전히 커스터마이징된 오버레이:

```javascript
class CustomOverlay extends naver.maps.OverlayView {
    constructor(position, content) {
        super();
        this._position = position;
        this._element = document.createElement('div');
        this._element.innerHTML = content;
        this._element.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ccc;
            padding: 10px;
            border-radius: 4px;
        `;
    }

    onAdd() {
        const map = this.getMap();
        const projection = this.getProjection();
        
        // 지도에 추가
        map.getPanes().floatPane.appendChild(this._element);
    }

    draw() {
        const projection = this.getProjection();
        const point = projection.fromCoordToPoint(this._position);
        
        // 위치 업데이트
        this._element.style.left = point.x + 'px';
        this._element.style.top = point.y + 'px';
    }

    onRemove() {
        this._element.parentNode.removeChild(this._element);
    }
}

// 사용
const overlay = new CustomOverlay(
    new naver.maps.LatLng(37.5666103, 126.9783882),
    '사용자 정의 오버레이'
);
overlay.setMap(map);
```

---

## 시각화

### 시각화 개요

`naver.maps.visualization` 서브모듈은 대량의 데이터를 효과적으로 시각화합니다.

### HeatMap (열 지도)

데이터 밀도를 색상 그래디언트로 표현합니다:

```javascript
const heatmap = new naver.maps.visualization.HeatMap({
    data: [
        new naver.maps.LatLng(37.5666103, 126.9783882),
        new naver.maps.LatLng(37.4979, 127.0276),
        new naver.maps.LatLng(37.4979, 126.9783882)
    ],
    map: map,
    radius: 50,
    opacity: 0.8,
    gradient: {
        0.0: 'blue',
        0.5: 'yellow',
        1.0: 'red'
    }
});
```

#### 가중치가 있는 열 지도

```javascript
const weightedData = [
    new naver.maps.visualization.WeightedLocation(
        new naver.maps.LatLng(37.5666103, 126.9783882),
        100  // 가중치
    ),
    new naver.maps.visualization.WeightedLocation(
        new naver.maps.LatLng(37.4979, 127.0276),
        50
    )
];

const heatmap = new naver.maps.visualization.HeatMap({
    data: weightedData,
    map: map,
    radius: 50
});
```

### DotMap (점 지도)

데이터 포인트를 개별 점으로 표현합니다:

```javascript
const dotmap = new naver.maps.visualization.DotMap({
    data: [
        new naver.maps.LatLng(37.5666103, 126.9783882),
        new naver.maps.LatLng(37.4979, 127.0276),
        new naver.maps.LatLng(37.4979, 126.9783882)
    ],
    map: map,
    color: 'red',
    opacity: 0.8,
    size: 3
});
```

#### 가중치가 있는 점 지도

```javascript
const weightedData = [
    new naver.maps.visualization.WeightedLocation(
        new naver.maps.LatLng(37.5666103, 126.9783882),
        100
    )
];

const dotmap = new naver.maps.visualization.DotMap({
    data: weightedData,
    map: map,
    color: 'blue',
    opacity: 0.8
});
```

### SpectrumStyle (스펙트럼 스타일)

열 지도의 색상 스펙트럼 커스터마이징:

```javascript
const spectrum = new naver.maps.visualization.SpectrumStyle([
    '#0000ff',  // 파랑
    '#00ffff',  // 청록
    '#00ff00',  // 초록
    '#ffff00',  // 노랑
    '#ff0000'   // 빨강
]);

const heatmap = new naver.maps.visualization.HeatMap({
    data: [...],
    map: map,
    radius: 50,
    gradient: spectrum.getGradient()
});
```

---

## 파노라마

### 파노라마 개요

거리뷰 이미지를 표시하는 기능입니다.

### Panorama 클래스

```javascript
const panorama = new naver.maps.Panorama(
    'panorama',  // 컨테이너 요소 ID
    {
        position: new naver.maps.LatLng(37.5666103, 126.9783882),
        pan: 0,      // 팬각도 (0~360)
        tilt: 0,     // 틸트각도 (-90~90)
        zoom: 1,     // 줌 레벨
        visible: true,
        range: [90, 110]  // 허용 팬 범위
    }
);
```

### 파노라마 메서드

```javascript
// 위치 제어
panorama.setPosition(new naver.maps.LatLng(37.4979, 127.0276));
const position = panorama.getPosition();

// 각도 제어
panorama.setPan(45);     // 팬
panorama.setTilt(30);    // 틸트
const pan = panorama.getPan();
const tilt = panorama.getTilt();

// 줌 제어
panorama.setZoom(2);
const zoom = panorama.getZoom();
const maxZoom = panorama.getMaxZoom();
const minZoom = panorama.getMinZoom();

// 표시/숨김
panorama.setVisible(true);

// 크기 변경
panorama.setSize(new naver.maps.Size(800, 600));
```

### 파노라마 마커

파노라마 위에 마커를 추가합니다:

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    panorama: panorama,
    title: 'POI'
});
```

### AroundControl (거리/항공뷰 전환 컨트롤)

```javascript
const control = new naver.maps.AroundControl();
panorama.addControl(control);
```

### FlightSpot (항공뷰 마크)

지도에서 항공뷰가 가능한 위치를 표시:

```javascript
const spot = new naver.maps.FlightSpot(
    new naver.maps.LatLng(37.5666103, 126.9783882),
    {
        map: map
    }
);

naver.maps.Event.addListener(spot, 'click', () => {
    panorama.setPosition(spot.getPosition());
});
```

---

## 좌표-주소 변환

### Geocoder 서브모듈

좌표와 주소를 서로 변환합니다.

### 주소로 좌표 검색 (지오코딩)

```javascript
naver.maps.Service.geocode({
    query: '서울시청'
}, function(status, response) {
    if (status === naver.maps.Service.Status.OK) {
        const result = response.v2.addresses[0];
        console.log(result.roadAddress);  // 도로명 주소
        console.log(result.jibunAddress); // 지번 주소
        console.log(result.x);            // 경도
        console.log(result.y);            // 위도
    }
});
```

### 좌표로 주소 검색 (역지오코딩)

```javascript
naver.maps.Service.reverseGeocode({
    location: new naver.maps.LatLng(37.5666103, 126.9783882)
}, function(status, response) {
    if (status === naver.maps.Service.Status.OK) {
        const result = response.v2.results[0];
        console.log(result.region.area1.name);  // 도
        console.log(result.region.area2.name);  // 시/구
        console.log(result.region.area3.name);  // 동
    }
});
```

### 좌표 변환

다양한 좌표계 간 변환:

```javascript
const latlng = new naver.maps.LatLng(37.5666103, 126.9783882);

// UTMK ↔ 경위도
naver.maps.TransCoord.fromLatLngToUTMK(latlng);
naver.maps.TransCoord.fromUTMKToLatLng(utmkCoord);

// EPSG3857 ↔ 경위도
naver.maps.TransCoord.fromLatLngToEPSG3857(latlng);
naver.maps.TransCoord.fromEPSG3857ToLatLng(epsg3857Coord);
```

---

## 그리기 도구

### DrawingManager

사용자가 지도 위에 도형을 그릴 수 있는 도구입니다.

### 기본 사용

```javascript
const drawingManager = new naver.maps.drawing.DrawingManager({
    map: map,
    drawingControl: [
        naver.maps.drawing.DrawingMode.HAND,
        naver.maps.drawing.DrawingMode.MARKER,
        naver.maps.drawing.DrawingMode.POLYLINE,
        naver.maps.drawing.DrawingMode.POLYGON,
        naver.maps.drawing.DrawingMode.RECTANGLE,
        naver.maps.drawing.DrawingMode.CIRCLE,
        naver.maps.drawing.DrawingMode.ELLIPSE
    ],
    drawingControlOptions: {
        position: naver.maps.Position.TOP_RIGHT
    }
});
```

### 그리기 모드

- `HAND`: 자유로운 손으로 그리기
- `MARKER`: 마커 추가
- `POLYLINE`: 선 그리기
- `POLYGON`: 다각형 그리기
- `RECTANGLE`: 사각형 그리기
- `CIRCLE`: 원 그리기
- `ELLIPSE`: 타원 그리기

### 그리기 이벤트

```javascript
// 그리기 완료
naver.maps.Event.addListener(drawingManager, 'drawingcomplete', (overlay) => {
    console.log('그리기 완료:', overlay);
    
    if (overlay instanceof naver.maps.Marker) {
        console.log('마커:', overlay.getPosition());
    } else if (overlay instanceof naver.maps.Polyline) {
        console.log('선:', overlay.getPath());
    }
});

// 그리기 시작
naver.maps.Event.addListener(drawingManager, 'drawingstart', (mode) => {
    console.log('그리기 시작:', mode);
});
```

### 데이터 추출 및 복원

```javascript
// 그려진 오버레이 데이터 추출
const overlays = drawingManager.getDrawings();
const data = JSON.stringify(overlays.map(o => ({
    type: o.constructor.name,
    position: o.getPosition ? o.getPosition() : null,
    path: o.getPath ? o.getPath() : null
})));

// 데이터 복원
// (서버에서 데이터를 받아 오버레이 재생성)
```

---

## GL 모듈

### GL 벡터맵 개요

WebGL 기반의 3D 벡터 지도입니다.

### GL 활성화

```javascript
const map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(37.5666103, 126.9783882),
    zoom: 15,
    gl: true  // GL 모듈 활성화
});
```

### Style Editor 연동

커스텀 지도 스타일 적용:

```javascript
const map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(37.5666103, 126.9783882),
    zoom: 15,
    gl: true,
    customStyleId: 'YOUR_STYLE_ID'  // Style Editor에서 발행
});
```

---

## 타입 정의

### 주요 타입들

#### Coord (좌표)

LatLng 또는 CoordLiteral 형식:

```typescript
type Coord = naver.maps.LatLng | CoordLiteral;
type CoordLiteral = [number, number] | {lat: number, lng: number};
```

#### Bounds (경계)

LatLngBounds 또는 BoundsLiteral 형식:

```typescript
type Bounds = naver.maps.LatLngBounds | BoundsLiteral;
type BoundsLiteral = [Coord, Coord] | {min: Coord, max: Coord};
```

#### Point (픽셀 좌표)

```typescript
type PointLiteral = [number, number] | {x: number, y: number};
```

#### Size (크기)

```typescript
type SizeLiteral = [number, number] | {width: number, height: number};
```

#### Position (컨트롤 위치)

```typescript
enum Position {
    TOP_LEFT, TOP_CENTER, TOP_RIGHT,
    CENTER_LEFT, CENTER, CENTER_RIGHT,
    BOTTOM_LEFT, BOTTOM_CENTER, BOTTOM_RIGHT
}
```

#### Padding/Margin

```typescript
type padding = {
    top?: number,
    right?: number,
    bottom?: number,
    left?: number
};

type margin = padding;
```

#### TransitionOptions

애니메이션 옵션:

```typescript
interface TransitionOptions {
    duration?: number;      // 밀리초
    easing?: (progress: number) => number;
}
```

#### FitBoundsOptions

경계에 맞추기 옵션:

```typescript
interface FitBoundsOptions {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
    maxZoom?: number;
}
```

---

## 마이그레이션 가이드

### v4에서 v5로 마이그레이션

v5는 GL 벡터맵과 신규 타일 지도 시스템을 도입했습니다.

#### 주요 변경사항

1. **GL 모듈 활성화**
   ```javascript
   // v4
   const map = new naver.maps.Map('map', {...});
   
   // v5
   const map = new naver.maps.Map('map', {
       ...options,
       gl: true  // GL 벡터맵 활성화
   });
   ```

2. **Custom OverlayType 설정**
   ```javascript
   // 새로운 타일 지도 스타일 지원
   map.setOptions({
       overlayZoomEffect: 'all'
   });
   ```

3. **Style Editor 연동**
   ```javascript
   // Style Editor에서 생성한 스타일 적용
   const map = new naver.maps.Map('map', {
       ...options,
       customStyleId: 'YOUR_CUSTOM_STYLE_ID'
   });
   ```

---

## 주요 예제 모음

### 1. 지도 초기화 및 기본 설정

```javascript
// HTML
<div id="map" style="width: 100%; height: 600px;"></div>

// JavaScript
const mapOptions = {
    center: new naver.maps.LatLng(37.5666103, 126.9783882),
    zoom: 15,
    mapTypeControl: true,
    zoomControl: true,
    scaleControl: true,
    draggable: true,
    scrollWheel: true,
    keyboardShortcuts: true,
    disableKineticPan: false
};

const map = new naver.maps.Map('map', mapOptions);
```

### 2. 마커 추가 및 이벤트 처리

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    map: map,
    title: '서울시청'
});

naver.maps.Event.addListener(marker, 'click', () => {
    map.setCenter(marker.getPosition());
    map.setZoom(17);
});

naver.maps.Event.addListener(marker, 'mouseover', () => {
    marker.setImage('hover-marker.png');
});

naver.maps.Event.addListener(marker, 'mouseout', () => {
    marker.setImage('normal-marker.png');
});
```

### 3. 정보 창 표시

```javascript
const marker = new naver.maps.Marker({
    position: new naver.maps.LatLng(37.5666103, 126.9783882),
    map: map
});

const infoWindow = new naver.maps.InfoWindow({
    content: `<div style="padding:15px; width:250px;">
                <h4>서울시청</h4>
                <p>주소: 서울시 중구 태평로 1</p>
              </div>`
});

naver.maps.Event.addListener(marker, 'click', () => {
    infoWindow.open(map, marker);
});
```

### 4. 도형 그리기

```javascript
// 선
const polyline = new naver.maps.Polyline({
    path: [
        new naver.maps.LatLng(37.5666103, 126.9783882),
        new naver.maps.LatLng(37.4979, 127.0276)
    ],
    map: map,
    strokeColor: '#ff0000',
    strokeWeight: 3
});

// 다각형
const polygon = new naver.maps.Polygon({
    paths: [[
        new naver.maps.LatLng(37.5666103, 126.9783882),
        new naver.maps.LatLng(37.4979, 127.0276),
        new naver.maps.LatLng(37.4979, 126.9783882)
    ]],
    map: map,
    fillColor: '#0000ff',
    fillOpacity: 0.5
});

// 원
const circle = new naver.maps.Circle({
    center: new naver.maps.LatLng(37.5666103, 126.9783882),
    radius: 1000,
    map: map,
    fillColor: '#00ff00',
    fillOpacity: 0.5
});
```

### 5. 데이터 레이어 (GeoJSON)

```javascript
const geojsonData = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [126.9783882, 37.5666103]
        },
        properties: {
            name: '서울시청',
            type: 'building'
        }
    }]
};

map.data.addGeoJson(geojsonData);

map.data.setStyle({
    fillColor: '#ffff00',
    fillOpacity: 0.5,
    strokeColor: '#ff0000',
    strokeWeight: 2
});

naver.maps.Event.addListener(map.data, 'click', (e) => {
    console.log('피처:', e.feature.getProperty('name'));
});
```

### 6. 조회 및 좌표 변환

```javascript
naver.maps.Service.geocode({
    query: '서울시청'
}, (status, response) => {
    if (status === naver.maps.Service.Status.OK) {
        const result = response.v2.addresses[0];
        map.setCenter(
            new naver.maps.LatLng(result.y, result.x)
        );
    }
});

// 역지오코딩
naver.maps.Service.reverseGeocode({
    location: map.getCenter()
}, (status, response) => {
    if (status === naver.maps.Service.Status.OK) {
        console.log(response.v2.results[0]);
    }
});
```

---

## 자주 묻는 질문 (FAQ)

### Q. API 클라이언트 ID는 어디서 얻나요?
A. [NAVER Cloud Platform](https://www.ncloud.com)에서 계정을 만들고, Console → Application → Maps를 통해 발급받을 수 있습니다.

### Q. 마커 이미지를 변경하고 싶습니다.
A. `setIcon()` 메서드를 사용하거나, 마커 생성 시 `icon` 옵션으로 설정합니다.

### Q. 대량의 마커를 표시할 때 성능이 좋지 않습니다.
A. 마커 클러스터링이나 줌 레벨에 따라 마커를 표시/숨기는 방식을 사용하세요.

### Q. 지도 타일을 커스터마이징할 수 있나요?
A. `MapType`을 상속하여 커스텀 지도 유형을 만들거나, Style Editor를 통해 스타일을 적용할 수 있습니다.

### Q. 모바일에서 지도가 작동하지 않습니다.
A. 모바일 환경에서 지도가 제대로 작동하는지 확인하세요. API 로드 시 `<script>` 태그의 위치와 DOM 준비 상태를 확인하세요.

---

## 참고 자료

- **공식 문서**: https://navermaps.github.io/maps.js.ncp/docs/
- **GitHub**: https://github.com/navermaps/maps.js.ncp
- **NAVER Cloud Platform**: https://www.ncloud.com
- **문의/지원**: https://www.ncloud.com/support/question/service

---

*이 문서는 NAVER Maps API v3의 공식 기술 문서를 기반으로 작성되었습니다.*
