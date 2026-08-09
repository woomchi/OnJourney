# 네이버 지도 API v3 (NAVER Maps JavaScript API) 기술 문서

> **공식 문서**: https://navermaps.github.io/maps.js.ncp/docs/  
> **버전**: NAVER Maps API v3 (NCP 기반)  
> **작성일**: 2026-08-09

---

## 목차

1. [개요 및 시작하기](#1-개요-및-시작하기)
2. [네임스페이스 구조](#2-네임스페이스-구조)
3. [기본 클래스 (Base Classes)](#3-기본-클래스-base-classes)
4. [KVO 시스템](#4-kvo-시스템)
5. [지도 (Map)](#5-지도-map)
6. [컨트롤 (Controls)](#6-컨트롤-controls)
7. [레이어 (Layers)](#7-레이어-layers)
8. [데이터 레이어 (Data Layer)](#8-데이터-레이어-data-layer)
9. [오버레이 (Overlays)](#9-오버레이-overlays)
10. [이벤트 시스템 (Event)](#10-이벤트-시스템-event)
11. [좌표계 및 Projection](#11-좌표계-및-projection)
12. [서비스 (Geocoder / Service)](#12-서비스-geocoder--service)
13. [서브모듈: Drawing](#13-서브모듈-drawing)
14. [서브모듈: Panorama (거리뷰)](#14-서브모듈-panorama-거리뷰)
15. [서브모듈: Visualization](#15-서브모듈-visualization)
16. [전역 타입 (Global Types)](#16-전역-타입-global-types)
17. [실전 코드 예제](#17-실전-코드-예제)

---

## 1. 개요 및 시작하기

### 스크립트 로드

```html
<!-- 기본 지도 로드 -->
<script type="text/javascript" src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_CLIENT_ID"></script>

<!-- 서브모듈 포함 (복수 지정 가능) -->
<script type="text/javascript"
  src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_CLIENT_ID&submodules=geocoder,drawing,visualization,panorama">
</script>
```

### 최소 지도 구현

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>네이버 지도</title>
  <style>
    #map { width: 100%; height: 400px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=YOUR_CLIENT_ID"></script>
  <script>
    var map = new naver.maps.Map('map', {
      center: new naver.maps.LatLng(37.5665, 126.9780),
      zoom: 10
    });
  </script>
</body>
</html>
```

---

## 2. 네임스페이스 구조

```
naver
└── naver.maps                          // 핵심 지도 API
    ├── naver.maps.drawing              // 도형 그리기 서브모듈
    └── naver.maps.visualization        // 시각화 서브모듈
```

| 네임스페이스 | 설명 |
|---|---|
| `naver` | 최상위 루트 네임스페이스 |
| `naver.maps` | 지도 API 전체 기능 |
| `naver.maps.drawing` | 사용자 인터랙티브 도형 그리기 |
| `naver.maps.visualization` | HeatMap, DotMap 등 데이터 시각화 |

---

## 3. 기본 클래스 (Base Classes)

### `naver.maps.LatLng`
지리 좌표(위도·경도)를 나타내는 핵심 클래스.

```javascript
// 생성
var coord = new naver.maps.LatLng(37.5665, 126.9780);

// 주요 메서드
coord.lat()          // 위도 반환 (number)
coord.lng()          // 경도 반환 (number)
coord.equals(other)  // 좌표 동일 여부 비교
coord.toJSON()       // { lat, lng } 객체 반환
coord.toString()     // "(lat, lng)" 문자열 반환
```

---

### `naver.maps.LatLngBounds`
위도·경도 범위(Bounding Box)를 나타내는 클래스.

```javascript
// 생성: (남서 좌표, 북동 좌표)
var bounds = new naver.maps.LatLngBounds(
  new naver.maps.LatLng(37.0, 126.0),
  new naver.maps.LatLng(38.0, 127.0)
);

// 주요 메서드
bounds.getSW()             // 남서 LatLng
bounds.getNE()             // 북동 LatLng
bounds.getCenter()         // 중심 LatLng
bounds.extend(latlng)      // 범위 확장
bounds.contains(latlng)    // 포함 여부
bounds.union(other)        // 범위 합집합
bounds.intersects(other)   // 교차 여부
bounds.isEmpty()           // 빈 범위 여부
bounds.toJSON()            // 직렬화
```

---

### `naver.maps.Point`
픽셀 좌표(x, y)를 나타내는 클래스. 화면상의 위치 표현에 사용.

```javascript
var point = new naver.maps.Point(100, 200);
point.x   // 100
point.y   // 200
point.add(other)        // 덧셈
point.sub(other)        // 뺄셈
point.equals(other)     // 비교
point.clone()           // 복사
```

---

### `naver.maps.PointBounds`
픽셀 좌표의 범위를 나타내는 클래스.

```javascript
var pb = new naver.maps.PointBounds(
  new naver.maps.Point(0, 0),
  new naver.maps.Point(100, 100)
);
pb.getMin()    // 최솟값 Point
pb.getMax()    // 최댓값 Point
pb.getCenter() // 중심 Point
```

---

### `naver.maps.Size`
너비·높이를 나타내는 클래스. 아이콘, 앵커, 오프셋 등 크기 지정에 사용.

```javascript
var size = new naver.maps.Size(32, 32);
size.width   // 32
size.height  // 32
size.add(other)
size.sub(other)
size.equals(other)
size.clone()
```

---

## 4. KVO 시스템

KVO(Key-Value Observing): 네이버 지도 API의 핵심 이벤트/속성 변경 감지 시스템.

### `naver.maps.KVO`
모든 지도 객체의 기반 클래스. 속성 변경을 관찰(Observe)할 수 있음.

```javascript
// 속성 설정/조회
obj.set('key', value)
obj.get('key')
obj.setOptions({ key: value })
obj.getOptions()

// 변경 감지
obj.addListener('key_changed', function(newVal) {
  console.log('변경됨:', newVal);
});
```

---

### `naver.maps.KVOArray`
KVO 기반의 관찰 가능한 배열. 오버레이 경로 등에 사용.

```javascript
var arr = new naver.maps.KVOArray([
  new naver.maps.LatLng(37.5, 126.9),
  new naver.maps.LatLng(37.6, 127.0)
]);

arr.push(newCoord)
arr.pop()
arr.getAt(index)
arr.setAt(index, value)
arr.insertAt(index, value)
arr.removeAt(index)
arr.getLength()
arr.forEach(callback)
```

---

## 5. 지도 (Map)

### `naver.maps.Map`
지도 인스턴스를 생성하고 제어하는 핵심 클래스.

#### 생성자

```javascript
var map = new naver.maps.Map(mapDiv, options);
// mapDiv: HTMLElement 또는 문자열 ID
```

#### 주요 옵션 (MapOptions)

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `center` | `LatLng` | 서울 | 지도 초기 중심 좌표 |
| `zoom` | `number` | `11` | 초기 줌 레벨 (1~21) |
| `minZoom` | `number` | `1` | 최소 줌 레벨 |
| `maxZoom` | `number` | `21` | 최대 줌 레벨 |
| `mapTypeId` | `string` | `'normal'` | 지도 타입 |
| `zoomControl` | `boolean` | `false` | 줌 컨트롤 표시 |
| `zoomControlOptions` | `object` | - | 줌 컨트롤 옵션 |
| `mapDataControl` | `boolean` | `true` | 지도 데이터 컨트롤 표시 |
| `scaleControl` | `boolean` | `true` | 축척 컨트롤 표시 |
| `mapTypeControl` | `boolean` | `false` | 지도 타입 컨트롤 표시 |
| `logoControl` | `boolean` | `true` | 로고 컨트롤 표시 |
| `draggable` | `boolean` | `true` | 드래그 이동 허용 |
| `scrollWheel` | `boolean` | `true` | 스크롤 줌 허용 |
| `disableDoubleTapZoom` | `boolean` | `false` | 더블탭 줌 비활성화 |
| `disableDoubleClickZoom` | `boolean` | `false` | 더블클릭 줌 비활성화 |
| `background` | `string` | - | 지도 배경색 |
| `projection` | `Projection` | - | 좌표 투영 방식 |
| `tileSpare` | `number` | `3` | 타일 여분 수 |

#### 지도 타입 ID

| 값 | 설명 |
|---|---|
| `naver.maps.MapTypeId.NORMAL` | 일반 지도 |
| `naver.maps.MapTypeId.TERRAIN` | 지형 지도 |
| `naver.maps.MapTypeId.SATELLITE` | 위성 지도 |
| `naver.maps.MapTypeId.HYBRID` | 위성 + 지명 혼합 |

#### 주요 메서드

```javascript
// 뷰 제어
map.getCenter()                          // 현재 중심 LatLng 반환
map.setCenter(latlng)                    // 중심 이동
map.panTo(latlng)                        // 애니메이션 이동
map.panBy(x, y)                          // 픽셀 단위 이동
map.getZoom()                            // 현재 줌 레벨
map.setZoom(level)                       // 줌 설정
map.zoomIn()                             // 줌 인
map.zoomOut()                            // 줌 아웃
map.fitBounds(bounds, opts)             // 범위에 맞게 뷰 조정

// 지도 정보
map.getBounds()                          // 현재 화면 영역 LatLngBounds
map.getSize()                            // 지도 크기 Size
map.getProjection()                      // 현재 Projection
map.getMapTypeId()                       // 현재 지도 타입 ID
map.setMapTypeId(typeId)                 // 지도 타입 변경

// 좌표 변환
map.getProjection().fromCoordToOffset(latlng)   // LatLng → 픽셀 Point
map.getProjection().fromOffsetToCoord(point)    // 픽셀 Point → LatLng

// 컨트롤 관리
map.addControl(control, position)        // 컨트롤 추가
map.removeControl(control)              // 컨트롤 제거

// 레이어 관리
map.addLayer(layer)
map.removeLayer(layer)

// 이벤트
naver.maps.Event.addListener(map, 'click', handler)
naver.maps.Event.addListener(map, 'zoom_changed', handler)
naver.maps.Event.addListener(map, 'center_changed', handler)
naver.maps.Event.addListener(map, 'bounds_changed', handler)
naver.maps.Event.addListener(map, 'drag', handler)
naver.maps.Event.addListener(map, 'dragend', handler)
naver.maps.Event.addListener(map, 'idle', handler)
naver.maps.Event.addListener(map, 'init', handler)      // 지도 초기화 완료
```

#### 타일 관련 하위 클래스

| 클래스 | 설명 |
|---|---|
| `naver.maps.Tile` | 기본 타일 추상 클래스 |
| `naver.maps.ImageTile` | 이미지 기반 타일 |
| `naver.maps.CanvasTile` | Canvas 기반 타일 |

#### 지도 타입 관련 클래스

| 클래스 | 설명 |
|---|---|
| `naver.maps.ImageMapType` | 이미지 타일로 구성된 지도 타입 |
| `naver.maps.CanvasMapType` | Canvas 타일로 구성된 지도 타입 |
| `naver.maps.MapTypeRegistry` | 지도 타입 등록/관리 레지스트리 |
| `naver.maps.NaverMapTypeOptions` | 기본 제공 지도 타입 옵션 |
| `naver.maps.NaverStyleMapTypeOptions` | 스타일 지도 타입 옵션 |

---

## 6. 컨트롤 (Controls)

### 컨트롤 위치 상수

```javascript
naver.maps.Position.TOP_LEFT
naver.maps.Position.TOP_CENTER
naver.maps.Position.TOP_RIGHT
naver.maps.Position.LEFT_CENTER
naver.maps.Position.RIGHT_CENTER
naver.maps.Position.BOTTOM_LEFT
naver.maps.Position.BOTTOM_CENTER
naver.maps.Position.BOTTOM_RIGHT
```

---

### `naver.maps.CustomControl`
사용자 정의 HTML 컨트롤.

```javascript
var customControl = new naver.maps.CustomControl(
  '<button id="myBtn">내 버튼</button>',
  { position: naver.maps.Position.TOP_RIGHT }
);

customControl.setMap(map);

// 내부 DOM 접근
naver.maps.Event.addDOMListener(customControl.getElement(), 'click', function() {
  console.log('버튼 클릭');
});
```

---

### 기본 제공 컨트롤

| 클래스 | 설명 | 주요 옵션 |
|---|---|---|
| `naver.maps.ZoomControl` | +/- 줌 버튼 | `position`, `style` |
| `naver.maps.MapTypeControl` | 지도 타입 선택 탭 | `position`, `style` |
| `naver.maps.ScaleControl` | 축척 바 | `position` |
| `naver.maps.MapDataControl` | 지도 데이터 출처 표기 | `position` |
| `naver.maps.LogoControl` | 네이버 로고 | `position` |

```javascript
// 예시: 줌 컨트롤
var zoomControl = new naver.maps.ZoomControl({
  position: naver.maps.Position.TOP_RIGHT,
  style: naver.maps.ZoomControlStyle.SMALL
});
map.addControl(zoomControl, naver.maps.Position.TOP_RIGHT);

// MapOptions에서 한 번에 설정
var map = new naver.maps.Map('map', {
  center: new naver.maps.LatLng(37.5665, 126.9780),
  zoom: 10,
  zoomControl: true,
  zoomControlOptions: {
    style: naver.maps.ZoomControlStyle.LARGE,
    position: naver.maps.Position.TOP_RIGHT
  }
});
```

---

## 7. 레이어 (Layers)

### `naver.maps.Layer`
커스텀 타일 레이어의 기반 추상 클래스.

```javascript
var layer = new naver.maps.Layer();
layer.setMap(map)    // 지도에 추가
layer.getMap()       // 현재 지도 반환
layer.setOpacity(0.7)
layer.getOpacity()
```

---

### 기본 제공 레이어

| 클래스 | 설명 |
|---|---|
| `naver.maps.BicycleLayer` | 자전거도로 레이어 |
| `naver.maps.CadastralLayer` | 지적도 레이어 |
| `naver.maps.LabelLayer` | 지명 라벨 레이어 |
| `naver.maps.StreetLayer` | 거리뷰 위치 레이어 |
| `naver.maps.TrafficLayer` | 실시간 교통 레이어 |

```javascript
// 교통 레이어 예시
var trafficLayer = new naver.maps.TrafficLayer({
  interval: 60000  // 갱신 주기 (ms)
});
trafficLayer.setMap(map);

// 자전거 레이어
var bicycleLayer = new naver.maps.BicycleLayer();
bicycleLayer.setMap(map);

// 지적도 레이어
var cadastralLayer = new naver.maps.CadastralLayer();
cadastralLayer.setMap(map);
```

---

## 8. 데이터 레이어 (Data Layer)

### `naver.maps.Data`
GeoJSON, GPX 데이터를 지도에 표시하는 레이어.

```javascript
var dataLayer = new naver.maps.Data();
dataLayer.setMap(map);

// GeoJSON 로드
dataLayer.loadGeoJson('data.geojson', null, function(features) {
  console.log('로드된 피처:', features.length);
});

// 스타일 설정
dataLayer.setStyle({
  fillColor: '#ff0000',
  fillOpacity: 0.4,
  strokeColor: '#ff0000',
  strokeWeight: 2
});

// 함수형 스타일 (피처별 동적 스타일)
dataLayer.setStyle(function(feature) {
  return {
    fillColor: feature.getProperty('color') || '#blue'
  };
});

// 이벤트
dataLayer.addListener('click', function(e) {
  console.log('클릭된 피처:', e.feature);
});
```

---

### `naver.maps.Feature`
데이터 레이어의 개별 지리 피처.

```javascript
feature.getId()
feature.getGeometry()
feature.getProperty(name)
feature.setProperty(name, value)
feature.forEachProperty(callback)
feature.toGeoJson()
```

---

### `naver.maps.Geometry`
GeoJSON 기하 도형의 추상 기반 클래스 (Point, LineString, Polygon 등 포함).

---

## 9. 오버레이 (Overlays)

### `naver.maps.OverlayView`
커스텀 오버레이의 기반 추상 클래스. 지도 위에 임의의 DOM 요소를 그릴 때 상속.

```javascript
function CustomOverlay(options) {
  this.setOptions(options);
}

CustomOverlay.prototype = new naver.maps.OverlayView();

CustomOverlay.prototype.onAdd = function() {
  // 오버레이 DOM 생성 및 pane에 추가
  var div = document.createElement('div');
  this._div = div;
  var panes = this.getPanes();
  panes.overlayLayer.appendChild(div);
};

CustomOverlay.prototype.draw = function() {
  // 좌표 → 픽셀 변환 후 DOM 위치 업데이트
  var projection = this.getProjection();
  var position = this.getOptions('position');
  var point = projection.fromCoordToOffset(position);
  this._div.style.left = point.x + 'px';
  this._div.style.top  = point.y + 'px';
};

CustomOverlay.prototype.onRemove = function() {
  this._div.parentNode.removeChild(this._div);
  this._div = null;
};

var overlay = new CustomOverlay({
  position: new naver.maps.LatLng(37.5665, 126.9780),
  map: map
});
```

---

### `naver.maps.Marker`
지도 위에 위치 마커를 표시.

#### 생성자 옵션 (MarkerOptions)

| 옵션 | 타입 | 설명 |
|---|---|---|
| `position` | `LatLng` | 마커 위치 (필수) |
| `map` | `Map` | 표시할 지도 |
| `icon` | `string \| ImageIcon \| SymbolIcon \| HtmlIcon` | 마커 아이콘 |
| `shape` | `MarkerShape` | 클릭 영역 모양 |
| `title` | `string` | 툴팁 텍스트 |
| `cursor` | `string` | 마우스 커서 |
| `clickable` | `boolean` | 클릭 가능 여부 |
| `draggable` | `boolean` | 드래그 가능 여부 |
| `visible` | `boolean` | 표시 여부 |
| `zIndex` | `number` | Z-인덱스 |
| `animation` | `Animation` | 등장 애니메이션 |

```javascript
// 기본 마커
var marker = new naver.maps.Marker({
  position: new naver.maps.LatLng(37.5665, 126.9780),
  map: map
});

// 이미지 아이콘 마커
var marker = new naver.maps.Marker({
  position: new naver.maps.LatLng(37.5665, 126.9780),
  map: map,
  icon: {
    url: 'marker.png',
    size: new naver.maps.Size(40, 50),
    anchor: new naver.maps.Point(20, 50),    // 이미지 기준 앵커 포인트
    scaledSize: new naver.maps.Size(40, 50) // 실제 렌더링 크기
  }
});

// HTML 아이콘 마커 (커스텀 DOM)
var marker = new naver.maps.Marker({
  position: new naver.maps.LatLng(37.5665, 126.9780),
  map: map,
  icon: {
    content: '<div class="my-marker">★</div>',
    anchor: new naver.maps.Point(15, 30)
  }
});

// 심볼 아이콘 (SVG Path)
var marker = new naver.maps.Marker({
  position: new naver.maps.LatLng(37.5665, 126.9780),
  map: map,
  icon: {
    path: naver.maps.SymbolPath.CIRCLE,
    scale: 8,
    fillColor: '#ff0000',
    fillOpacity: 0.8,
    strokeColor: '#ffffff',
    strokeWeight: 2
  }
});

// 애니메이션
var marker = new naver.maps.Marker({
  position: new naver.maps.LatLng(37.5665, 126.9780),
  map: map,
  animation: naver.maps.Animation.BOUNCE  // 또는 DROP
});

// 주요 메서드
marker.getPosition()             // 현재 위치 LatLng
marker.setPosition(latlng)       // 위치 변경
marker.getMap()                  // 현재 지도
marker.setMap(map)               // 지도에 추가 (null이면 제거)
marker.getIcon()                 // 아이콘
marker.setIcon(icon)             // 아이콘 변경
marker.getTitle()
marker.setTitle(title)
marker.getVisible()
marker.setVisible(bool)
marker.setAnimation(animation)

// 이벤트
naver.maps.Event.addListener(marker, 'click', function(e) {
  console.log('마커 클릭:', e.coord);
});
naver.maps.Event.addListener(marker, 'dragend', function(e) {
  console.log('드래그 종료:', marker.getPosition());
});
```

---

### `naver.maps.InfoWindow`
지도 위에 정보창(풍선 말풍선)을 표시.

#### 주요 옵션 (InfoWindowOptions)

| 옵션 | 타입 | 설명 |
|---|---|---|
| `content` | `string \| HTMLElement` | 정보창 내용 (HTML 가능) |
| `position` | `LatLng` | 정보창 위치 |
| `map` | `Map` | 표시할 지도 |
| `maxWidth` | `number` | 최대 너비 |
| `backgroundColor` | `string` | 배경색 |
| `borderColor` | `string` | 테두리 색 |
| `borderWidth` | `number` | 테두리 너비 |
| `anchorSize` | `Size` | 꼬리 부분 크기 |
| `anchorColor` | `string` | 꼬리 색상 |
| `anchorSkew` | `boolean` | 꼬리 기울기 |
| `pixelOffset` | `Point` | 픽셀 오프셋 |
| `zIndex` | `number` | Z-인덱스 |
| `disableAnchor` | `boolean` | 꼬리 비활성화 |

```javascript
var infoWindow = new naver.maps.InfoWindow({
  content: '<div style="padding:10px"><b>서울시청</b><p>서울특별시 중구</p></div>',
  maxWidth: 300,
  backgroundColor: '#fff',
  borderColor: '#ccc',
  borderWidth: 1,
  anchorSkew: true
});

// 특정 위치에서 열기
infoWindow.open(map, new naver.maps.LatLng(37.5665, 126.9780));

// 마커와 연동
infoWindow.open(map, marker);

// 닫기
infoWindow.close();

// 상태 확인
infoWindow.getIsOpen()    // boolean

// 내용 변경
infoWindow.setContent('<div>새로운 내용</div>');
infoWindow.setPosition(new naver.maps.LatLng(37.57, 126.97));
```

---

### `naver.maps.Polyline`
지도 위에 선(경로)을 그림.

#### 주요 옵션 (PolylineOptions)

| 옵션 | 타입 | 설명 |
|---|---|---|
| `path` | `Array<LatLng> \| KVOArray` | 경로 좌표 배열 |
| `map` | `Map` | 표시할 지도 |
| `strokeColor` | `string` | 선 색상 |
| `strokeWeight` | `number` | 선 두께 |
| `strokeOpacity` | `number` | 선 불투명도 (0~1) |
| `strokeStyle` | `string` | 선 스타일 (`solid`, `shortdash`, `dash`, `dot` 등) |
| `startIcon` | `PointingIcon` | 시작점 아이콘 |
| `endIcon` | `PointingIcon` | 끝점 아이콘 |
| `clickable` | `boolean` | 클릭 가능 여부 |
| `visible` | `boolean` | 표시 여부 |
| `zIndex` | `number` | Z-인덱스 |

```javascript
var polyline = new naver.maps.Polyline({
  path: [
    new naver.maps.LatLng(37.5665, 126.9780),
    new naver.maps.LatLng(37.5700, 126.9830),
    new naver.maps.LatLng(37.5750, 126.9900)
  ],
  strokeColor: '#0000ff',
  strokeWeight: 4,
  strokeOpacity: 0.8,
  strokeStyle: 'solid',
  map: map
});

// 경로 변경
polyline.setPath(newPathArray);
polyline.getPath()  // KVOArray 반환

// 길이 계산
polyline.getDistance()  // 미터 단위 거리

// 이벤트
naver.maps.Event.addListener(polyline, 'click', function(e) {
  console.log('클릭된 좌표:', e.coord);
});
```

---

### `naver.maps.Polygon`
지도 위에 다각형을 그림.

```javascript
var polygon = new naver.maps.Polygon({
  paths: [
    [
      new naver.maps.LatLng(37.56, 126.97),
      new naver.maps.LatLng(37.57, 126.97),
      new naver.maps.LatLng(37.57, 126.98),
      new naver.maps.LatLng(37.56, 126.98)
    ]
    // 두 번째 배열은 홀(hole) 지정 가능
  ],
  fillColor: '#ff0000',
  fillOpacity: 0.4,
  strokeColor: '#ff0000',
  strokeWeight: 2,
  strokeOpacity: 0.8,
  map: map
});

polygon.getAreaSize()  // 면적 계산 (제곱미터)
```

---

### `naver.maps.Circle`
지도 위에 원을 그림.

```javascript
var circle = new naver.maps.Circle({
  center: new naver.maps.LatLng(37.5665, 126.9780),
  radius: 500,                 // 미터 단위
  fillColor: '#00ff00',
  fillOpacity: 0.3,
  strokeColor: '#00ff00',
  strokeWeight: 2,
  map: map
});

circle.getCenter()
circle.setCenter(latlng)
circle.getRadius()
circle.setRadius(meters)
circle.getBounds()             // 원의 LatLngBounds
```

---

### `naver.maps.Rectangle`
지도 위에 직사각형을 그림.

```javascript
var rectangle = new naver.maps.Rectangle({
  bounds: new naver.maps.LatLngBounds(
    new naver.maps.LatLng(37.56, 126.97),
    new naver.maps.LatLng(37.57, 126.98)
  ),
  fillColor: '#ffff00',
  fillOpacity: 0.4,
  strokeColor: '#ffff00',
  strokeWeight: 2,
  map: map
});
```

---

### `naver.maps.Ellipse`
지도 위에 타원을 그림.

```javascript
var ellipse = new naver.maps.Ellipse({
  bounds: new naver.maps.LatLngBounds(
    new naver.maps.LatLng(37.56, 126.97),
    new naver.maps.LatLng(37.57, 126.98)
  ),
  fillColor: '#ff00ff',
  fillOpacity: 0.3,
  strokeColor: '#ff00ff',
  strokeWeight: 2,
  map: map
});
```

---

### `naver.maps.GroundOverlay`
지정한 경계 영역에 이미지를 지도 위에 표시.

```javascript
var groundOverlay = new naver.maps.GroundOverlay(
  'overlay-image.png',
  new naver.maps.LatLngBounds(
    new naver.maps.LatLng(37.56, 126.97),
    new naver.maps.LatLng(37.57, 126.98)
  ),
  {
    map: map,
    opacity: 0.7,
    clickable: true
  }
);

groundOverlay.setOpacity(0.5)
groundOverlay.getOpacity()
groundOverlay.getBounds()
```

---

## 10. 이벤트 시스템 (Event)

### `naver.maps.Event`
이벤트 등록/제거/트리거를 담당하는 정적 유틸리티.

```javascript
// 이벤트 등록
var listener = naver.maps.Event.addListener(target, eventName, handler);

// 이벤트 제거
naver.maps.Event.removeListener(listener);

// 일회성 이벤트
naver.maps.Event.once(target, eventName, handler);

// 이벤트 트리거 (프로그래밍 방식)
naver.maps.Event.trigger(target, eventName, eventObject);

// DOM 이벤트 등록 (컨트롤 내부 버튼 등에 사용)
naver.maps.Event.addDOMListener(domElement, eventName, handler);
naver.maps.Event.removeDOMListener(domElement, eventName, handler);

// 이벤트 일시 비활성화
naver.maps.Event.disableListener(listener);
naver.maps.Event.enableListener(listener);

// 모든 이벤트 제거
naver.maps.Event.clearListeners(target, eventName);
naver.maps.Event.clearInstanceListeners(target);
```

#### 지도(Map) 주요 이벤트

| 이벤트명 | 발생 시점 | 콜백 파라미터 |
|---|---|---|
| `init` | 지도 초기화 완료 | - |
| `idle` | 지도 이동/줌 완료 후 대기 상태 | - |
| `center_changed` | 중심 좌표 변경 | `LatLng` |
| `zoom_changed` | 줌 레벨 변경 | `number` |
| `bounds_changed` | 화면 영역 변경 | `LatLngBounds` |
| `mapType_changed` | 지도 타입 변경 | `string` |
| `click` | 지도 클릭 | `PointerEvent` |
| `dblclick` | 더블클릭 | `PointerEvent` |
| `rightclick` | 우클릭 | `PointerEvent` |
| `drag` | 드래그 중 | `PointerEvent` |
| `dragstart` | 드래그 시작 | `PointerEvent` |
| `dragend` | 드래그 종료 | `PointerEvent` |
| `mousemove` | 마우스 이동 | `PointerEvent` |
| `mouseup` | 마우스 버튼 해제 | `PointerEvent` |
| `mousedown` | 마우스 버튼 누름 | `PointerEvent` |
| `touchstart` | 터치 시작 | - |
| `touchend` | 터치 종료 | - |
| `pinch` | 핀치 줌 | - |
| `size_changed` | 지도 크기 변경 | `Size` |
| `projection_changed` | Projection 변경 | - |

#### 마커(Marker) 주요 이벤트

| 이벤트명 | 설명 |
|---|---|
| `click` | 클릭 |
| `dblclick` | 더블클릭 |
| `rightclick` | 우클릭 |
| `mouseover` | 마우스 오버 |
| `mouseout` | 마우스 아웃 |
| `mousedown` | 마우스 누름 |
| `mouseup` | 마우스 해제 |
| `drag` | 드래그 중 |
| `dragstart` | 드래그 시작 |
| `dragend` | 드래그 종료 |
| `position_changed` | 위치 변경 |
| `visible_changed` | 표시 상태 변경 |
| `icon_changed` | 아이콘 변경 |

---

## 11. 좌표계 및 Projection

### 지원 좌표계

| 클래스 | 좌표계 | 설명 |
|---|---|---|
| `naver.maps.EPSG3857` | WGS84 / 웹 메르카토르 | 기본 좌표계 (Google Maps 호환) |
| `naver.maps.UTMK` | UTMK | 국토지리정보원 UTMK 좌표계 |
| `naver.maps.UTMK_NAVER` | UTMK(네이버 변형) | 네이버 내부 좌표계 |
| `naver.maps.TM128` | TM128 | 국토지리정보원 TM128 좌표계 |

### 좌표 변환 (TransCoord)

```javascript
// TransCoord (Submodule: geocoder 필요)

// WGS84 → UTMK
naver.maps.TransCoord.fromLatLngToUTMK(latlng)

// UTMK → WGS84
naver.maps.TransCoord.fromUTMKToLatLng(utmkPoint)

// WGS84 → TM128
naver.maps.TransCoord.fromLatLngToTM128(latlng)

// WGS84 → EPSG3857
naver.maps.TransCoord.fromLatLngToEPSG3857(latlng)

// 그 외 변환도 동일 패턴으로 제공
```

### 지도 Projection 활용

```javascript
var projection = map.getProjection();

// 좌표 → 화면 픽셀 오프셋 (지도 컨테이너 기준)
var point = projection.fromCoordToOffset(latlng);

// 화면 픽셀 오프셋 → 좌표
var latlng = projection.fromOffsetToCoord(point);

// 좌표 → 타일 픽셀 좌표
var point = projection.fromCoordToPoint(latlng);

// 타일 픽셀 좌표 → 좌표
var latlng = projection.fromPointToCoord(point);
```

---

## 12. 서비스 (Geocoder / Service)

> **서브모듈 필요**: `submodules=geocoder`

### `naver.maps.Service`
주소-좌표 변환(Geocoding/Reverse Geocoding)을 수행하는 정적 서비스.

#### Geocoding (주소 → 좌표)

```javascript
naver.maps.Service.geocode({
  query: '서울특별시 중구 세종대로 110'   // 검색할 주소
}, function(status, response) {
  if (status === naver.maps.Service.Status.ERROR) {
    console.error('Geocoding 오류');
    return;
  }
  if (response.v2.meta.totalCount === 0) {
    console.log('검색 결과 없음');
    return;
  }

  var result = response.v2.addresses[0];
  var latlng = new naver.maps.LatLng(result.y, result.x);
  console.log('좌표:', latlng.lat(), latlng.lng());
  console.log('주소:', result.roadAddress);
});
```

#### Reverse Geocoding (좌표 → 주소)

```javascript
naver.maps.Service.reverseGeocode({
  coords: new naver.maps.LatLng(37.5665, 126.9780),
  orders: [
    naver.maps.Service.OrderType.ADDR,
    naver.maps.Service.OrderType.ROAD_ADDR
  ].join(',')
}, function(status, response) {
  if (status === naver.maps.Service.Status.ERROR) {
    console.error('Reverse Geocoding 오류');
    return;
  }
  var result = response.v2;
  console.log('법정주소:', result.address.jibunAddress);
  console.log('도로명주소:', result.address.roadAddress);
});
```

#### 응답 상태 코드

| 상수 | 설명 |
|---|---|
| `naver.maps.Service.Status.OK` | 정상 응답 |
| `naver.maps.Service.Status.ERROR` | 오류 |

#### OrderType 상수

| 상수 | 설명 |
|---|---|
| `naver.maps.Service.OrderType.ADDR` | 법정동 주소 |
| `naver.maps.Service.OrderType.ROAD_ADDR` | 도로명 주소 |
| `naver.maps.Service.OrderType.ADMCODE` | 행정구역 코드 |

---

## 13. 서브모듈: Drawing

> **서브모듈 필요**: `submodules=drawing`

### `naver.maps.drawing.DrawingManager`
사용자가 지도 위에 직접 도형을 그릴 수 있는 도구.

```javascript
var drawingManager = new naver.maps.drawing.DrawingManager({
  map: map,
  drawingControl: [
    naver.maps.drawing.DrawingMode.HAND,
    naver.maps.drawing.DrawingMode.RECTANGLE,
    naver.maps.drawing.DrawingMode.POLYLINE,
    naver.maps.drawing.DrawingMode.POLYGON,
    naver.maps.drawing.DrawingMode.MARKER,
    naver.maps.drawing.DrawingMode.ELLIPSE,
    naver.maps.drawing.DrawingMode.CIRCLE
  ],
  drawingControlOptions: {
    position: naver.maps.Position.TOP_CENTER,
    style: naver.maps.drawing.DrawingManagerStyle.HORIZONTAL
  },
  // 각 도형 기본 스타일
  markerOptions: {
    icon: 'marker.png'
  },
  rectangleOptions: {
    fillColor: '#ff0000',
    fillOpacity: 0.3
  },
  polylineOptions: {
    strokeColor: '#0000ff',
    strokeWeight: 3
  },
  polygonOptions: {
    fillColor: '#00ff00',
    fillOpacity: 0.3
  }
});

// 현재 그리기 모드 변경
drawingManager.setOptions('drawingMode', naver.maps.drawing.DrawingMode.POLYGON);

// 완료된 도형 목록
drawingManager.getDrawings()   // DrawingOverlay 배열

// 이벤트
naver.maps.Event.addListener(drawingManager, 'drawing_added', function(overlay) {
  console.log('도형 그리기 완료:', overlay);
});

naver.maps.Event.addListener(drawingManager, 'drawing_removed', function(overlay) {
  console.log('도형 삭제:', overlay);
});
```

#### DrawingMode 상수

| 상수 | 설명 |
|---|---|
| `HAND` | 일반 탐색 모드 |
| `RECTANGLE` | 직사각형 그리기 |
| `POLYLINE` | 선 그리기 |
| `POLYGON` | 다각형 그리기 |
| `MARKER` | 마커 그리기 |
| `ELLIPSE` | 타원 그리기 |
| `CIRCLE` | 원 그리기 |

---

## 14. 서브모듈: Panorama (거리뷰)

> **서브모듈 필요**: `submodules=panorama`

### `naver.maps.Panorama`
네이버 거리뷰(Street View)를 표시.

```javascript
var panorama = new naver.maps.Panorama('panorama-div', {
  position: new naver.maps.LatLng(37.5665, 126.9780),
  pov: {
    pan: -135,    // 수평 회전 각도
    tilt: 10,     // 수직 기울기 각도
    fov: 100      // 시야각
  }
});

// 위치 이동
panorama.setPosition(new naver.maps.LatLng(37.57, 126.98));

// 지도와 연동
panorama.setLinkedMap(map);

// 거리뷰 위치 존재 여부 확인
naver.maps.Event.addListener(panorama, 'pano_changed', function() {
  console.log('파노라마 변경');
});
```

### `naver.maps.FlightSpot`
항공 파노라마 뷰.

### `naver.maps.AroundControl`
거리뷰 주변 탐색 컨트롤.

---

## 15. 서브모듈: Visualization

> **서브모듈 필요**: `submodules=visualization`

### `naver.maps.visualization.HeatMap`
데이터 밀도를 색상으로 시각화하는 히트맵.

```javascript
var heatmap = new naver.maps.visualization.HeatMap({
  map: map,
  data: [
    new naver.maps.visualization.WeightedLocation(37.5665, 126.9780, 1.0),
    new naver.maps.visualization.WeightedLocation(37.5700, 126.9830, 0.8),
    new naver.maps.visualization.WeightedLocation(37.5750, 126.9900, 0.5)
  ],
  radius: 20,          // 각 포인트의 영향 반경 (픽셀)
  opacity: 0.7,
  colorMap: naver.maps.visualization.SpectrumStyle.JET  // 색상 스펙트럼
});

heatmap.setMap(map);
heatmap.setData(newDataArray);
```

---

### `naver.maps.visualization.DotMap`
데이터 포인트를 점으로 표시하는 시각화.

```javascript
var dotmap = new naver.maps.visualization.DotMap({
  map: map,
  data: [
    new naver.maps.visualization.WeightedLocation(37.5665, 126.9780, 1.0),
    // ...
  ],
  radius: 5,
  opacity: 0.8
});
```

---

### `naver.maps.visualization.WeightedLocation`
가중치가 있는 위치 데이터 포인트.

```javascript
// 생성자: (lat, lng, weight)
var point = new naver.maps.visualization.WeightedLocation(37.5665, 126.9780, 1.0);

point.getLat()     // 위도
point.getLng()     // 경도
point.getWeight()  // 가중치 (0.0 ~ 1.0)
```

---

### `naver.maps.visualization.SpectrumStyle` (정적)
히트맵/닷맵의 색상 스펙트럼 프리셋.

| 상수 | 설명 |
|---|---|
| `JET` | 파랑 → 초록 → 빨강 (기본) |
| `HSV` | HSV 색상 공간 |
| `HOT` | 검정 → 빨강 → 노랑 → 흰색 |
| `COOL` | 청록 → 보라 |
| `GREYS` | 흑백 그라디언트 |
| `YIOrRd` | 노랑 → 주황 → 빨강 |
| `RdBu` | 빨강 ↔ 파랑 (발산형) |
| `Accent` | 강조색 팔레트 |

---

## 16. 전역 타입 (Global Types)

### 주요 타입 정의

| 타입 | 설명 |
|---|---|
| `Coord` | `LatLng` 또는 `CoordLiteral` |
| `CoordLiteral` | `{ lat: number, lng: number }` |
| `Bounds` | `LatLngBounds` 또는 `BoundsLiteral` |
| `BoundsLiteral` | `{ sw: CoordLiteral, ne: CoordLiteral }` |
| `ArrayOfCoords` | `Coord[]` |
| `ArrayOfBounds` | `Bounds[]` |
| `DOMEvent` | 브라우저 DOM 이벤트 |
| `DOMEventListener` | DOM 이벤트 핸들러 함수 |
| `DrawingOverlay` | 드로잉 서브모듈 오버레이 객체 |
| `FitBoundsOptions` | `fitBounds()` 추가 옵션 |
| `GeoJSON` | GeoJSON 형식 객체 |
| `GPX` | GPX 형식 객체 |
| `HTMLElement` | 브라우저 HTML 요소 |
| `ImageData` | Canvas ImageData |

### 아이콘 타입

```typescript
// 이미지 아이콘
interface ImageIcon {
  url: string;
  size?: Size;
  scaledSize?: Size;
  origin?: Point;
  anchor?: Point;
}

// HTML 아이콘
interface HtmlIcon {
  content: string | HTMLElement;
  anchor?: Point;
  size?: Size;
}

// 심볼 아이콘 (SVG Path 기반)
interface SymbolIcon {
  path: SymbolPath | string;  // SVG 경로 데이터
  scale?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  anchor?: Point;
  rotation?: number;
}
```

### `naver.maps.SymbolPath` 상수

| 상수 | 설명 |
|---|---|
| `CIRCLE` | 원형 |
| `PATH` | 커스텀 SVG 경로 |

### `naver.maps.Animation` 상수

| 상수 | 설명 |
|---|---|
| `BOUNCE` | 바운스 애니메이션 (반복) |
| `DROP` | 위에서 떨어지는 애니메이션 (1회) |

---

## 17. 실전 코드 예제

### 예제 1: 마커 클릭 시 정보창 열기

```javascript
var map = new naver.maps.Map('map', {
  center: new naver.maps.LatLng(37.5665, 126.9780),
  zoom: 13
});

var marker = new naver.maps.Marker({
  position: new naver.maps.LatLng(37.5665, 126.9780),
  map: map,
  title: '서울시청'
});

var infoWindow = new naver.maps.InfoWindow({
  content: [
    '<div style="padding:10px;min-width:200px">',
    '  <h4 style="margin:0 0 6px">서울시청</h4>',
    '  <p style="margin:0;color:#666">서울특별시 중구 세종대로 110</p>',
    '</div>'
  ].join('')
});

naver.maps.Event.addListener(marker, 'click', function() {
  if (infoWindow.getIsOpen()) {
    infoWindow.close();
  } else {
    infoWindow.open(map, marker);
  }
});
```

---

### 예제 2: 클릭한 위치에 마커 생성

```javascript
var markers = [];

naver.maps.Event.addListener(map, 'click', function(e) {
  var marker = new naver.maps.Marker({
    position: e.coord,
    map: map,
    animation: naver.maps.Animation.DROP
  });
  markers.push(marker);
});

// 모든 마커 제거
function clearMarkers() {
  markers.forEach(function(m) { m.setMap(null); });
  markers = [];
}
```

---

### 예제 3: 경로 그리기 (Polyline)

```javascript
var path = new naver.maps.KVOArray([]);
var polyline = new naver.maps.Polyline({
  path: path,
  strokeColor: '#5347AA',
  strokeWeight: 5,
  strokeOpacity: 0.9,
  map: map
});

naver.maps.Event.addListener(map, 'click', function(e) {
  path.push(e.coord);
});
```

---

### 예제 4: 주소 검색 후 지도 이동 (Geocoding)

```javascript
// submodules=geocoder 필요
function searchAddress(address) {
  naver.maps.Service.geocode({ query: address }, function(status, response) {
    if (status !== naver.maps.Service.Status.OK) {
      alert('주소를 찾을 수 없습니다.');
      return;
    }

    var result = response.v2.addresses[0];
    var latlng = new naver.maps.LatLng(
      parseFloat(result.y),
      parseFloat(result.x)
    );

    map.setCenter(latlng);
    map.setZoom(16);

    new naver.maps.Marker({
      position: latlng,
      map: map
    });
  });
}

searchAddress('서울특별시 중구 세종대로 110');
```

---

### 예제 5: 히트맵 시각화

```javascript
// submodules=visualization 필요
var data = [];
for (var i = 0; i < 200; i++) {
  data.push(
    new naver.maps.visualization.WeightedLocation(
      37.5 + Math.random() * 0.2,
      126.9 + Math.random() * 0.2,
      Math.random()
    )
  );
}

var heatmap = new naver.maps.visualization.HeatMap({
  map: map,
  data: data,
  radius: 25,
  opacity: 0.8,
  colorMap: naver.maps.visualization.SpectrumStyle.JET
});
```

---

### 예제 6: 지도 타입 전환

```javascript
var mapTypes = [
  naver.maps.MapTypeId.NORMAL,
  naver.maps.MapTypeId.TERRAIN,
  naver.maps.MapTypeId.SATELLITE,
  naver.maps.MapTypeId.HYBRID
];
var currentIndex = 0;

document.getElementById('switchBtn').addEventListener('click', function() {
  currentIndex = (currentIndex + 1) % mapTypes.length;
  map.setMapTypeId(mapTypes[currentIndex]);
});
```

---

### 예제 7: 현재 위치 표시

```javascript
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(function(pos) {
    var latlng = new naver.maps.LatLng(
      pos.coords.latitude,
      pos.coords.longitude
    );

    map.setCenter(latlng);
    map.setZoom(15);

    new naver.maps.Marker({
      position: latlng,
      map: map,
      icon: {
        content: '<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.4)"></div>',
        anchor: new naver.maps.Point(8, 8)
      }
    });
  });
}
```

---

### 예제 8: fitBounds로 여러 마커 포함

```javascript
var locations = [
  new naver.maps.LatLng(37.5665, 126.9780),
  new naver.maps.LatLng(37.5700, 126.9830),
  new naver.maps.LatLng(37.5750, 126.9900)
];

// 마커 생성
locations.forEach(function(latlng) {
  new naver.maps.Marker({ position: latlng, map: map });
});

// 모든 마커를 포함하는 범위로 지도 조정
var bounds = new naver.maps.LatLngBounds();
locations.forEach(function(latlng) { bounds.extend(latlng); });
map.fitBounds(bounds, { padding: 50 });
```

---

## 참고 링크

| 문서 | URL |
|---|---|
| 공식 API 레퍼런스 | https://navermaps.github.io/maps.js.ncp/docs/ |
| GitHub 소스 | https://github.com/navermaps/maps.js.ncp |
| 네이버 클라우드 플랫폼 콘솔 | https://console.ncloud.com |
| API 키 발급 | https://console.ncloud.com/naver-service/application |

> **Note**: API 사용을 위해서는 네이버 클라우드 플랫폼에서 `Maps` 서비스를 신청하고 `ncpKeyId`를 발급받아야 합니다. 허용 도메인 설정도 필수입니다.
