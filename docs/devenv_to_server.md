# 🚀 On-Journey 개인 개발 & 배포 가이드라인

운영 중인 실제 서비스(Production)의 안정성을 유지하면서, 안전하게 새로운 기능을 테스트하고 배포하기 위한 Git Workflow 문서입니다.

---

## 🛠️ 브랜치 구조 및 역할

| 브랜치명 | Vercel 환경 | 역할 및 특징 |
|---|---|---|
| **`main`** | **Production (운영)** | 실제 사용자가 접속하는 서버. **완벽하게 검증된 코드만 배포**됩니다. |
| **`dev`** | **Preview (미리보기)** | 개인 개발 및 테스트용 서버. 푸시 시 독립된 임시 URL이 생성됩니다. |

---

## 🔄 작업 및 배포 절차 (4-Step Workflow)

### Step 1. 개발 브랜치에서 작업 시작
작업을 시작하기 전, 현재 위치가 `dev` 브랜치인지 확인하고 이동합니다.

```bash
# dev 브랜치로 이동 (생성되어 있지 않다면 git checkout -b dev)
git checkout dev

# 최신 코드 상태 반영 (선택)
git pull origin dev
```

---

### Step 2. AI/바이브 코딩 진행 및 로컬 확인
자유롭게 코드를 수정하거나 새로운 기능을 개발합니다. 로컬 서버에서 1차 테스트를 거칩니다.

```bash
# 로컬 개발 서버 실행
npm run dev
```

---

### Step 3. `dev` 브랜치 푸시 및 Preview URL 테스트 (안전 검증)
수정한 코드를 `dev` 브랜치에 올립니다. 운영 서버(`main`)에는 아무런 영향을 주지 않습니다.

```bash
# 변경 사항 저장
git add .
git commit -m "feat: [기능명] 작업 내용 요약"

# dev 브랜치에 푸시
git push origin dev
```

> **🔍 Preview 테스트 확인**
> 1. `git push` 완료 후 Vercel Dashboard 접속 ➔ 해당 프로젝트 선택
> 2. **Deployments** 탭에서 생성된 **Preview URL**(`https://on-journey-git-dev-xxxx.vercel.app`) 클릭
> 3. PC/모바일 환경, F12 개발자 도구, Supabase API 연동, 화면 전환 등을 자유롭게 테스트합니다.

---

### Step 4. `main` 브랜치 병합 및 정식 배포 (Production)
Preview URL에서 에러가 없고 모든 기능이 완벽히 작동하는 것을 확인했다면, `main` 브랜치로 가져와 실제 사이트에 반영합니다.

```bash
# 1. main 브랜치로 이동
git checkout main

# 2. dev 브랜치에서 완성한 코드 병합
git merge dev

# 3. main 브랜치 푸시 (🚀 실제 라이브 서비스 자동 업데이트!)
git push origin main

# 4. 다음 작업을 위해 다시 dev 브랜치로 복귀
git checkout dev
```

---

## 💡 개발 팁 & 체크리스트

* **Vercel 환경 변수 세팅:** 새로운 API 키나 환경 변수를 추가했다면 Vercel의 **Settings ➔ Environment Variables**에도 꼭 등록했는지 확인합니다.
* **캐시 없는 재배포:** Vercel 환경 변수를 변경한 후에는 대시보드의 **Deployments ➔ Redeploy (Use existing Build Cache 체크 해제)**를 진행해야 확실하게 반영됩니다.
* **항상 `dev`에서 시작:** 코드 수정을 시작하기 직전 터미널에 `git branch`를 입력하여 현 위치가 `dev`인지 꼭 체크하세요!