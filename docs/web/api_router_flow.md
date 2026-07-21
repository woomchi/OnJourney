# API Router Flow

다음은 현재 프로젝트의 `src/app/api` 내 라우트들이 요청을 처리하는 흐름을 보여주는 시각화 다이어그램입니다.

```mermaid
flowchart TB
    Client((Client Request))

    subgraph "Next.js App Router (src/app/api)"
        direction TB
        api_bus["GET /api/bus/realtime"]
        api_subway["GET /api/subway/realtime"]
        api_places["GET /api/places"]
        api_car["GET /api/directions/car"]
        api_public["GET /api/directions/public"]
        api_waypoints["GET /api/directions-waypoints"]
    end

    subgraph "Error Handling Layer"
        ErrorHandler{"withErrorHandler()"}
    end

    subgraph "Validation Layer (Zod)"
        val_bus["busRealtimeQuerySchema"]
        val_subway["subwayRealtimeQuerySchema"]
        val_places["placesQuerySchema"]
        val_dir["directionsQuerySchema"]
        val_waypoints["directionsWaypointsQuerySchema"]
    end

    subgraph "Service Layer (src/lib/services)"
        svc_bus["fetchBusRealtime()"]
        svc_subway["fetchSubwayRealtime()"]
        svc_places["fetchPlaces()"]
        svc_car["fetchCarWalkDirections()"]
        svc_public["fetchPublicDirections()"]
        svc_waypoints["fetchDirectionsWaypoints()"]
    end

    subgraph "Response Layer"
        SuccessRes["successResponse()"]
    end

    %% Client to Routes
    Client --> api_bus
    Client --> api_subway
    Client --> api_places
    Client --> api_car
    Client --> api_public
    Client --> api_waypoints

    %% Routes to Error Handler (Wrapper)
    api_bus --> ErrorHandler
    api_subway --> ErrorHandler
    api_places --> ErrorHandler
    api_car --> ErrorHandler
    api_public --> ErrorHandler
    api_waypoints --> ErrorHandler

    %% Error Handler to Validation
    ErrorHandler -.-> |Validates Query Params| val_bus
    ErrorHandler -.-> val_subway
    ErrorHandler -.-> val_places
    ErrorHandler -.-> val_dir
    ErrorHandler -.-> val_waypoints

    %% Validation to Services
    val_bus --> svc_bus
    val_subway --> svc_subway
    val_places --> svc_places
    val_dir --> svc_car
    val_dir --> svc_public
    val_waypoints --> svc_waypoints

    %% Services to Response
    svc_bus --> SuccessRes
    svc_subway --> SuccessRes
    svc_places --> SuccessRes
    svc_car --> SuccessRes
    svc_public --> SuccessRes
    svc_waypoints --> SuccessRes

    SuccessRes --> Return((JSON Response))
    
    %% Error Flow
    ErrorHandler -- "Error Caught" --> ErrorResponse((Error Response))

    classDef route fill:#f9f,stroke:#333,stroke-width:2px;
    class api_bus,api_subway,api_places,api_car,api_public,api_waypoints route;
    
    classDef wrapper fill:#ff9,stroke:#333,stroke-width:2px;
    class ErrorHandler wrapper;

    classDef validation fill:#bbf,stroke:#333,stroke-width:2px;
    class val_bus,val_subway,val_places,val_dir,val_waypoints validation;

    classDef service fill:#bfb,stroke:#333,stroke-width:2px;
    class svc_bus,svc_subway,svc_places,svc_car,svc_public,svc_waypoints service;
```

## 주요 처리 단계

1. **라우팅 (Routing):** `src/app/api` 폴더 기반의 Next.js App Router가 클라이언트의 `GET` 요청을 각 도메인(Bus, Subway, Places, Directions 등)에 맞게 수신합니다.
2. **에러 핸들링 (Error Handling Layer):** 모든 API 엔드포인트는 `@/lib/apiResponse`의 `withErrorHandler` 래퍼로 감싸져 있어, 내부 로직(검증 및 비즈니스 로직)에서 발생하는 에러를 일괄적으로 처리하고 일관된 에러 응답을 반환합니다.
3. **데이터 검증 (Validation Layer):** 각 요청의 URL 쿼리 파라미터는 `@/lib/validations` 내의 Zod 스키마를 통해 안전하게 파싱 및 검증됩니다. 
4. **비즈니스 로직 (Service Layer):** 검증이 완료된 데이터는 `@/lib/services` 폴더에 있는 각각의 서비스 함수로 전달되어 외부 API 호출이나 내부 연산을 수행합니다.
5. **응답 (Response Layer):** 로직이 정상적으로 완료되면 `successResponse()`를 통해 일관된 JSON 포맷으로 클라이언트에게 결과가 반환됩니다.
