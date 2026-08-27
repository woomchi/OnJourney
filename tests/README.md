# OnJourney Test Suite

이 디렉토리는 프로젝트의 모든 단위(Unit), 통합(Integration), 컴포넌트(Component) 테스트를 단일 지점에서 중앙 관리하는 테스트 루트 디렉토리입니다.

## 디렉토리 구조

```
tests/
├── components/   # React UI 컴포넌트 단위/스냅샷 테스트
├── lib/          # 도메인 서비스 및 비즈니스 로직 테스트 (ODsay, TAGO, 지하철/버스 등)
├── utils/        # 공통 유틸리티 함수 테스트 (geoUtils, journeyUtils, routeUtils 등)
└── integration/  # 통합 및 E2E 테스트
```

## 가이드라인
1. 개별 소스 코드 디렉토리(`src/**`) 내부에 분산된 `__tests__` 폴더를 생성하지 않고, 본 `tests/` 디렉토리 아래에 대응하는 경로 구조로 테스트 파일을 작성합니다.
2. 예시:
   - `src/lib/utils/geoUtils.ts` 테스트 -> `tests/utils/geoUtils.test.ts`
   - `src/lib/services/subwayService.ts` 테스트 -> `tests/lib/subwayService.test.ts`
   - `src/components/sidebar/timeline/TimelineHeader.tsx` 테스트 -> `tests/components/TimelineHeader.test.tsx`
