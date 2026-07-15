# 모바일 PWA 환경 테스트 가이드

이 문서는 로컬 개발 환경(PC)에서 실행 중인 On-Journey 프로젝트를 스마트폰 등 모바일 기기에서 **HTTPS** 환경으로 접속하여 PWA 기능을 완벽하게 테스트하는 방법을 안내합니다.

## 왜 이 방법이 필요한가요?
PWA의 핵심 기능인 **'앱 설치(Add to Home Screen)'**와 **'오프라인 동작(Service Worker)'**은 보안 상의 이유로 `localhost` 또는 `HTTPS` 환경에서만 동작합니다. 
단순히 같은 와이파이 내에서 내부 IP(예: `1http://192.168.x.x:3000`)로 접속하면 `HTTP` 환경이기 때문에 PWA 기능이 활성화되지 않습니다. 
따라서 `cloudflared` 터널을 이용해 임시 HTTPS 주소를 생성하여 테스트해야 합니다.

## 🚀 테스트 진행 순서

### 1. 로컬 서버 실행
먼저 평소처럼 프로젝트를 실행합니다.
```bash
npm run dev
```
(기본적으로 3000번 포트에서 서버가 열려야 합니다.)

### 2. 터널링 도구 실행
로컬 서버가 켜져 있는 상태에서 **새 터미널 탭(또는 창)을 엽니다.**
그리고 다음 명령어를 입력하여 Cloudflare 터널을 실행합니다. (별도의 회원가입이나 설치가 필요 없습니다.)

```bash
npx cloudflared tunnel --url http://localhost:3000
```

### 3. 발급된 HTTPS 주소 확인
명령어를 실행하면 터미널 창에 로그가 주르륵 올라갑니다. 그 중에서 아래와 같이 `.trycloudflare.com`으로 끝나는 주소를 찾습니다.

```text
...
INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
INF |  https://[랜덤문자열].trycloudflare.com                                                    |
...
```

### 4. 모바일 기기에서 접속
스마트폰의 웹 브라우저(사파리, 크롬 등)를 열고 위에서 찾은 주소(`https://...trycloudflare.com`)로 접속합니다.

- **앱 설치 테스트**: 브라우저 하단의 공유 버튼(Safari) 혹은 메뉴 버튼(Chrome)을 눌러 **'홈 화면에 추가'**를 선택하면 네이티브 앱처럼 바탕화면에 설치됩니다.
- **캐싱 및 오프라인 테스트**: 앱 설치 후 비행기 모드를 켜거나 인터넷 연결을 끊은 상태에서도 오프라인 배너가 뜨며 화면이 정상적으로 렌더링되는지 테스트할 수 있습니다.

> **주의사항**: 위 방법으로 생성된 터널 주소는 터미널을 종료하면 사라집니다. 다음에 테스트할 때 명령어를 다시 실행하면 새로운 랜덤 주소가 발급됩니다.

### 5. ⚠️ 모바일 기기에서 지도/경로 정보가 안 뜰 때 (네이버 지도 API 도메인 설정)

네이버 클라우드 플랫폼(NCP)의 **'Web 서비스 URL' 설정은 와일드카드(`*`) 도메인 등록을 지원하지 않습니다.** 따라서 `*.trycloudflare.com`으로 등록해 두어도 동작하지 않으며, 매번 생성되는 임시 랜덤 주소를 직접 등록해주어야 하는 번거로움이 있습니다.

이 문제를 해결하고 **주소를 고정하여 편리하게 테스트하는 3가지 방법**을 제안합니다.

---

#### 💡 해결 방법 A: LocalTunnel로 고정 서브도메인 사용하기 (추천 - 가장 간편)
Cloudflare 대신 **LocalTunnel**을 사용하면 별도의 회원가입 없이 원하는 고정 서브도메인을 임의로 지정하여 실행할 수 있습니다.

1. 터널 실행 시 `--subdomain` 옵션을 붙여 실행합니다:
   ```bash
   npx localtunnel --port 3000 --subdomain <원하는-고정-이름>
   # 예: npx localtunnel --port 3000 --subdomain onjourney-dev
   ```
2. 실행 시 발급되는 주소는 항상 `https://onjourney-dev.loca.lt`로 고정됩니다.
3. [네이버 클라우드 플랫폼 콘솔](https://console.ncloud.com/)의 **AI·NAVER API** > **Application** > **Application 정보** > **웹 서비스 URL**에 위 고정 주소를 한 번만 등록해 두면 다시 수정할 필요가 없습니다:
   - `https://onjourney-dev.loca.lt`
   - `http://onjourney-dev.loca.lt`

*주의: 해당 고정 도메인을 누군가 이미 선점하여 사용 중이라면 접속이 안 될 수 있으므로, 자신만의 고유한 서브도메인명을 사용하는 것이 좋습니다.*

---

#### 💡 해결 방법 B: Ngrok 무료 고정 도메인 사용하기 (가장 안정적)
터널링 서비스 중 가장 안정적인 **Ngrok**은 가입 시 계정당 1개의 **무료 고정 도메인(Static Domain)**을 제공합니다.

1. [ngrok 홈페이지](https://ngrok.com/)에 회원가입 후 로그인합니다.
2. 대시보드의 **Domains** 메뉴에서 무료 고정 도메인(예: `xxxxx-xxxx.ngrok-free.app`)을 생성합니다.
3. PC에 ngrok CLI를 설치하고 계정을 연동한 뒤, 다음과 같이 터널을 실행합니다:
   ```bash
   ngrok http 3000 --domain=<발급받은-고정-도메인>
   # 예: ngrok http 3000 --domain=xxxxx-xxxx.ngrok-free.app
   ```
4. NCP 콘솔의 **웹 서비스 URL**에 해당 고정 도메인을 한 번만 등록하여 사용합니다:
   - `https://xxxxx-xxxx.ngrok-free.app`
   - `http://xxxxx-xxxx.ngrok-free.app`

---

#### 💡 해결 방법 C: 안드로이드 한정 - Chrome USB 포트 포워딩 (터널링 없음)
안드로이드 기기를 사용 중이라면, 복잡한 터널링이나 외부 도메인 등록 없이 USB 연결만으로 테스트할 수 있습니다. Chrome 브라우저는 `localhost` 접속을 HTTPS와 동일한 보안 컨텍스트로 취급하여 PWA 기능이 정상 작동합니다.

1. PC와 안드로이드 스마트폰을 USB 케이블로 연결하고, 스마트폰의 **'USB 디버깅'**을 활성화합니다.
2. PC Chrome 브라우저 주소창에 `chrome://inspect`를 입력하여 접속합니다.
3. **[Port forwarding...]** 버튼을 누르고 아래와 같이 포트를 설정한 뒤 **[Enable port forwarding]**을 체크합니다:
   - Port: `3000`
   - IP address and port: `localhost:3000`
4. 스마트폰 Chrome 앱을 열고 `http://localhost:3000`으로 접속합니다.
5. NCP 콘솔의 **웹 서비스 URL**에는 이미 로컬 테스트용으로 등록되어 있는 `http://localhost:3000`을 그대로 사용하므로 추가 도메인 등록을 할 필요가 전혀 없습니다!

