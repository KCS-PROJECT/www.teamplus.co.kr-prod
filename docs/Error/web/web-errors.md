# TEAMPLUS Web 에러 문서

> **프로젝트**: teamplus-web (Next.js 15)
> **최종 업데이트**: 2026-07-02 (WEB-070 — Android 앱 라우트 전환 후 거대 하단 여백: WebView scrollHeight 잔존 버그)
> **총 이슈**: 65개 (실측 `## WEB-N` 일치)

---

## 📊 이슈 현황

| 심각도      | 개수 | 상태         |
| ----------- | ---- | ------------ |
| 🔴 Critical | 5    | 3 ✅ 해결됨  |
| 🟠 High     | 9    | 5 ✅ 해결됨  |
| 🟡 Medium   | 23   | 13 ✅ 해결됨 |
| 🟢 Low      | 1    | ⬜ 미해결    |

---

---

        [WEB] 작성 2026.05.29. 03:20:13 KST

---

## 🟡 WEB-065: next/image 비율 경고 — 로고에 display 크기 props 사용 (한 차원만 속성과 일치)

### 발생 환경

- teamplus-web (Next.js 15.5.15 dev / port 5001), React 19
- 로그인 헤더 워드마크 로고 + 풀스크린 로더(LoadingPuck) 워드마크 로고

### 에러 메시지

```
Image with src "/images/app_icons/splash_wordmark3.png" has either width or height
modified, but not the other. If you use CSS to change the size of your image, also
include the styles 'width: "auto"' or 'height: "auto"' to maintain the aspect ratio.
```

### 원인 분석

- Next.js 15 `next/image` 는 로드 후 `img.height !== getAttribute('height')`(heightModified), `img.width !== getAttribute('width')`(widthModified) 를 비교해 **정확히 하나만 다를 때** 비율 경고를 띄운다 (`next/dist/client/image-component.js:112-115`).
- 실제 파일은 **954×218 (비율 4.376:1)** 인데 props 를 표시 크기에 맞춰 `width={88} height={20}` (비율 4.4) 로 지정.
- CSS `h-5 w-auto` 적용 시: 렌더 height=20px → 속성 `"20"` 과 일치(**미변경**), 렌더 width=20×(954/218)=**87.5px** → 속성 `"88"` 과 불일치(**변경**). → 한 차원만 변경 → 경고. (`w-auto` 가 있어도 props 비율이 실제와 다르면 발생)

### 잘못된 코드

```tsx
<Image
  src="/images/app_icons/splash_wordmark3.png"
  width={88}            // ← 표시 크기. height(20) 와만 우연히 일치 → width 만 어긋남
  height={20}
  className="h-5 w-auto object-contain dark:invert"
/>
```

### 올바른 코드

```tsx
<Image
  src="/images/app_icons/splash_wordmark3.png"
  width={954}           // ← 실제 본질 크기. 표시는 CSS h-5 w-auto 가 제어
  height={218}          //   → 렌더(20px/87.5px)가 양쪽 모두 속성과 달라 경고 미발생 + 비율 정확
  className="h-5 w-auto object-contain dark:invert"
/>
```

### 검증

```bash
# DevTools Console → /login 진입 + 풀스크린 로더 노출 → "width or height modified" 경고 없음
# 시각적 표시 크기 동일 (h-5 / h-4 + w-auto 가 표시 제어)
```

### 재발 방지

- `next/image` 를 CSS(`h-* w-auto`)로 사이징할 때 `width`/`height` props 는 **표시 크기가 아니라 원본 본질 크기**(또는 정확히 동일한 비율)를 넣는다. 표시 크기를 넣으면 한 차원만 속성과 우연히 일치해 비율 경고가 뜬다.
- props 비율 = 실제 파일 비율 이어야 CLS(레이아웃 시프트)도 정확히 예약된다. 파일 픽셀은 `sips -g pixelWidth -g pixelHeight <file>` 로 확인.

### 관련 파일

- `teamplus-web/src/app/(auth)/login/page.tsx:796` — 헤더 워드마크 로고 (88×20 → 954×218)
- `teamplus-web/src/components/ui/LoadingPuck.tsx:182` — 풀스크린 로더 워드마크 로고 (70×16 → 954×218)

---

        [WEB] 작성 2026.05.09. 00:00:00 KST

---

## 🟡 WEB-064: BottomNav 연속 전환 후 `/team` 진입 실패처럼 보이는 라우팅/API 폴백 문제

### 발생 환경

- teamplus-web (Next.js 15.5 dev / port 5001)
- 감독/코치 BottomNav에서 `홈` 전환 직후 `팀` 탭 클릭
- `/team` 진입 사용자가 관리 팀이 없거나 관리 팀 응답이 빈 배열인 상태

### 증상

```
BottomNav 홈 클릭 → 팀 클릭 → 풀스크린 로딩 표시 → 로딩 종료 후 이전 화면이 남아 보임
GET /teams 403 이 작업을 수행할 권한이 없습니다. 필요 권한: SYSTEM, OPER, ADMIN
```

### 근본 원인

`BottomNav`가 `router.replace()`를 fire-and-forget으로 호출한 뒤 `pathname`이 한 번만 바뀌어도 pending 상태를 무조건 초기화했다. 홈 전환과 팀 전환이 연속으로 겹치면 앞선 홈 pathname commit이 늦게 도착해 마지막 목표(`/team`)의 pending 상태를 지울 수 있었다.

또한 `/team` 화면은 관리 팀 조회가 빈 배열이면 admin 전용 `GET /teams`로 폴백했다. 감독/코치/학생은 해당 API 권한이 없어 403 에러 화면이 렌더링되며, 사용자에게는 라우팅이 실패하고 이전 화면이 유지된 것처럼 보였다.

### 적용된 수정

- `teamplus-web/src/components/layout/BottomNav.tsx`
  - pending target과 실제 pathname을 비교해 목표 경로에 도달했을 때만 pending 해제
  - 목표 경로가 커밋되지 않으면 마지막 탭 target을 최대 2회 `showSpinner: false`로 재요청
  - 5초 hard cap으로 비정상 pending 누수 방지
- `teamplus-web/src/services/team.service.ts`
  - `/teams/public` 응답을 `TeamListItem[]`로 정규화하는 `listPublicTeams()` 추가
- `teamplus-web/src/app/(common)/team/page.tsx`
  - 관리 팀이 비어 있거나 일반 조회자일 때 admin 전용 `/teams` 대신 공개 `/teams/public` 사용

### 검증

```bash
cd teamplus-web
npx eslint src/components/layout/BottomNav.tsx 'src/app/(common)/team/page.tsx' src/services/team.service.ts
npx tsc --noEmit --pretty false 2>&1 | rg "src/(components/layout/BottomNav|app/\\(common\\)/team/page|services/team\\.service)" || true
```

Playwright 수동 시나리오:

- 감독 계정 seed login
- `/classes-manage`에서 BottomNav `홈` 클릭 후 0ms/50ms/250ms/1000ms 간격으로 `팀` 클릭
- 모든 케이스에서 최종 URL `/team/`, 403 API 실패 없음, 팀 카드 목록 렌더링 확인

### 예방 가이드

- App Router의 `push/replace`는 완료 Promise를 제공하지 않으므로, 탭 네비게이션처럼 연속 클릭 가능한 UI는 마지막 target과 실제 pathname을 비교해 커밋 여부를 확인한다.
- Web 공통 조회 화면에서 admin 전용 API(`/teams`)를 폴백으로 호출하지 않는다. 공개 조회는 `/teams/public`, 사용자 소속/관리 목록은 `/teams/my/*` 계열을 사용한다.

## 🟡 WEB-063: 공개 API 호출 전 만료 토큰 refresh 시도로 Network Error 로그 오염

### 발생 환경

- teamplus-web (Next.js 15.5 dev / port 5001)
- 백엔드 `localhost:5003` 미기동 또는 네트워크 불가 상태
- localStorage에 만료/만료 임박 access token + refresh token 이 남아 있는 상태

### 에러 메시지

```
[API Client] 토큰 갱신 실패: AxiosError: Network Error
[API] ✗ GET /app/settings -  Network Error [3b12a834]
```

### 근본 원인

`/app/settings`는 백엔드에서 `@Public()`인 공개 API이고 클라이언트 `PUBLIC_API_PATTERNS`에도 포함되어 있다. 하지만 `apiClient` request interceptor가 공개 API 여부를 계산한 뒤에도 토큰 조회와 선제적 refresh를 계속 수행했다.

그 결과 앱 부팅 시 공개 설정 조회가 만료된 로컬 토큰의 `/auth/refresh` 실패 로그와 함께 보였고, 백엔드 미기동 같은 실제 네트워크 문제를 진단하기 어렵게 만들었다.

### 영향

- 공개 설정 조회(`/app/settings`)가 인증 refresh 오류처럼 보임
- 백엔드 미기동/포트 불일치와 토큰 만료 문제가 콘솔에서 섞여 보임
- 사용자 인증이 필요 없는 초기 부팅 요청의 디버깅 비용 증가

### 적용된 수정

- `teamplus-web/src/services/api-client.ts` — `isPublicApiPath(requestUrl)`가 true면 인증 헤더 첨부와 선제적 토큰 갱신을 모두 건너뛰도록 변경
- `teamplus-web/src/__tests__/services/api-client.test.ts` — `/app/settings` 호출 시 `hybridAuth.getToken()`과 `/auth/refresh`가 호출되지 않는 회귀 테스트 추가

### 검증

```bash
cd teamplus-web
npm test -- --runTestsByPath src/__tests__/services/api-client.test.ts --runInBand
npx eslint src/services/api-client.ts src/__tests__/services/api-client.test.ts
```

### 예방 가이드

- `@Public()` 백엔드 엔드포인트를 클라이언트에서 호출할 때는 `PUBLIC_API_PATTERNS`에 등록하고, request interceptor에서 인증 refresh를 강제하지 않는다.
- 공개 API가 인증 사용자별 응답을 필요로 한다면 공개 API가 아니라 별도 인증 API로 분리한다.

## 🔴 WEB-062: 로그인 시 토큰 저장 실패 — `web-token-storage.ts` logger import 누락

### 발생 환경

- teamplus-web (Next.js 15.5 dev / port 5001)
- 발현: 모든 역할(parent/coach/director/admin/child/teen) 로그인 시도 시 100% 재현
- 발생 시점: 2026-05-08 (배포 전 dev 환경)

### 에러 메시지

```
[Auth] Login failed: Error: 인증 정보 저장에 실패했습니다.
    at Object.saveToken (hybrid-auth.ts:225:13)
    at async saveTokens (auth.ts:138:3)
    at async Object.login (auth.ts:205:7)
    at async AuthProvider.useCallback[login] (AuthContext.tsx:291:24)
    at async handleLogin (page.tsx:452:24)
```

### 근본 원인

`teamplus-web/src/services/web-token-storage.ts` 가 `devLog`/`devWarn`/`devError` 를 **10회 호출** 하지만 `@/lib/logger` 에서 **import 가 0회**. dev 환경에서 `saveToken` 흐름의 어느 한 분기라도 `devLog`/`devWarn`/`devError` 호출에 도달하면 `ReferenceError: devLog is not defined` 발생.

```
saveToken
  └─ setItem (line 155)
       └─ getAvailableStorage (line 103)
            └─ devWarn(...) — line 126, 134 (ReferenceError 가능)
  └─ devLog(`[WebTokenStorage] 토큰 저장 완료 (${storageType})`) — line 287-289 (NODE_ENV=development 분기에서 100% 호출)
```

`saveToken` 의 try/catch 가 ReferenceError 를 잡아 `throw error;` (line 293) → `hybrid-auth.ts:217` 의 catch 로 전파 → `handleBridgeError(...)` 가 `userMessage: '인증 정보 저장에 실패했습니다.'` 생성 → line 225 에서 throw.

### 영향

- **Critical**: 로그인 100% 실패 (모든 역할 / 모든 환경 / 모든 디바이스)
- 토큰이 실제로는 localStorage 에 정상 저장되지만 (`setItem` 자체는 성공) ReferenceError 가 catch 되어 마치 저장 실패처럼 보임
- 사용자는 "인증 정보 저장에 실패했습니다." 토스트만 받고 진행 불가
- 다른 모듈(`hybrid-auth.ts`, `api-client.ts`) 은 logger import 가 정상이므로 전염 없음

### 잘못된 코드 (수정 전)

```ts
// src/services/web-token-storage.ts (line 1-23)
const TOKEN_KEY = "teamplus_auth_token";
// ...
// devLog/devWarn/devError import 누락
```

### 올바른 코드 (수정 후)

```ts
// src/services/web-token-storage.ts (line 21)
import { devLog, devWarn, devError } from "@/lib/logger";

const TOKEN_KEY = "teamplus_auth_token";
// ...
```

### 적용된 수정

- `teamplus-web/src/services/web-token-storage.ts:21` — `import { devLog, devWarn, devError } from '@/lib/logger';` 추가

### 검증

```bash
cd teamplus-web
npx eslint src/services/web-token-storage.ts   # 0 errors
npx tsc --noEmit | grep web-token-storage       # 0 errors
# dev 서버에서 로그인 → 정상 진입 확인
```

### 재발 방지

- `@/lib/logger` 의 `devLog`/`devWarn`/`devError` 사용 시 import 누락 lint rule 강제 (no-undef ESLint 규칙은 TypeScript 가 잡아야 하나 타입 체크 우회 케이스 존재)
- 신규 service 생성 시 logger import 를 default 보일러플레이트로 포함
- CI 단계에서 `grep -L "from '@/lib/logger'" $(grep -lE 'devLog|devWarn|devError' src/**/*.ts)` 로 누락 검출

### 관련 파일

- `teamplus-web/src/services/web-token-storage.ts:21` — 수정
- `teamplus-web/src/services/hybrid-auth.ts:217-225` — 에러 전파 경로 (수정 없음)
- `teamplus-web/src/services/auth.ts:138, 205` — 호출자 (수정 없음)
- `teamplus-web/src/contexts/AuthContext.tsx:291` — 로그인 핸들러 (수정 없음)
- `teamplus-web/src/lib/logger.ts:14, 21, 28` — devLog/devError/devWarn 정의 위치

---

## 🟡 Medium Issues (최근 추가)

### WEB-061: 로그인 암호화 fallback 이 `/auth/login`에 평문 body를 보내 ValidationPipe 400 발생

| 항목            | 내용                                                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `teamplus-web/src/services/auth.ts`                                                                                                                                                                                                                              |
| **오류 메시지** | `POST /api/v1/auth/login` · `BadRequestException: Bad Request Exception` · `ValidationPipe.exceptionFactory`                                                                                                                                                     |
| **문제**        | 웹 로그인 서비스가 암호화 로그인 시도 중 예외가 발생하면 fallback으로 `{ email, password }` 평문 body를 다시 `/auth/login`에 전송했다. 하지만 백엔드 `/auth/login`은 `EncryptedLoginDto(encryptedData, iv, authTag)` 전용이라 평문 body가 DTO 검증에서 거절된다. |
| **영향**        | 개발 환경에서 암호화 초기화/브릿지 요청 예외가 발생하면 로그인 실패와 함께 백엔드에 혼란스러운 `HTTP request failed statusCode=200` 로그가 남는다.                                                                                                               |
| **상태**        | ✅ 해결됨 (2026-05-08)                                                                                                                                                                                                                                           |

**잘못된 코드**:

```ts
// fallback 에서도 암호화 전용 엔드포인트 호출
await api.post("/auth/login", { email, password });
```

**올바른 코드**:

```ts
if (process.env.NODE_ENV === "production") {
  return encryptionUnavailableError;
}

await api.post("/auth/login/dev", { email, password });
```

| **예방 가이드** | `/auth/login`은 항상 `EncryptedLoginDto`만 보낸다. 개발용 평문 fallback은 `NODE_ENV !== 'production'`에서만 `/auth/login/dev`를 사용하고, 프로덕션에서는 평문 fallback을 제공하지 않는다. |

### WEB-060: 숫자형 legacy 상품 상세 URL이 `/shop/products/:id` 404를 반복 호출

| 항목            | 내용                                                                                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `teamplus-web/src/app/(shop)/products/[id]/page.tsx`                                                                                                                                                                                   |
| **오류 메시지** | `GET http://localhost:5003/api/v1/shop/products/2 404 (Not Found)`                                                                                                                                                                     |
| **문제**        | 현재 `ShopProduct.id`는 Prisma `cuid()` 문자열인데, 캐시/legacy 링크에서 `/products/2` 같은 숫자형 ID로 상세 화면에 진입하면 존재하지 않는 상품 API를 호출했다. 개발 모드 StrictMode에서는 effect 재실행으로 404가 두 번 보일 수 있다. |
| **영향**        | 상품 상세 화면 진입 시 콘솔 404가 반복되고, 사용자에게는 실제 상품이 아닌 빈 상세 상태가 노출된다.                                                                                                                                     |
| **상태**        | ✅ 해결됨 (2026-05-07)                                                                                                                                                                                                                 |

**수정**:

```tsx
if (/^\d+$/.test(productId)) {
  setProduct(null);
  setIsLoading(false);
  return;
}

const res = await api.get<ApiProduct>(`/shop/products/${productId}`, {
  retry: false,
});
```

| **예방 가이드** | mock/fallback 상품 데이터를 만들 때 숫자형 ID를 상세 URL로 연결하지 않는다. API 상세 화면은 legacy ID 형식을 사전에 걸러 불필요한 404 네트워크 요청을 만들지 않는다. |

### WEB-059: TeamInfoPanel 내부 `useRouter` import 누락으로 route error 발생

| 항목            | 내용                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **파일**        | `teamplus-web/src/app/(common)/team/[id]/page.tsx`                                                                                                     |
| **오류 메시지** | `ReferenceError: useRouter is not defined at TeamInfoPanel`                                                                                            |
| **문제**        | `TeamInfoPanel`에서 그룹 현황 클릭 이동용 `const router = useRouter()`를 추가했지만, 파일 상단 import가 `useParams`만 가져오고 `useRouter`를 누락했다. |
| **영향**        | 팀 상세 정보 탭 렌더링 시 ErrorBoundary로 떨어지고 route error가 반복된다.                                                                             |
| **상태**        | ✅ 해결됨 (2026-05-07)                                                                                                                                 |

**잘못된 코드**:

```tsx
import { useParams } from "next/navigation";

function TeamInfoPanel() {
  const router = useRouter();
}
```

**올바른 코드**:

```tsx
import { useParams, useRouter } from "next/navigation";
```

| **예방 가이드** | App Router hook을 하위 컴포넌트에서 추가할 때 파일 상단 import를 함께 갱신하고, 변경 파일 대상 ESLint를 실행한다. |

---

        [WEB] 작성 2026.04.29. 17:52:13

---

### WEB-056: Inter gstatic 고정 woff2 URL 404로 콘솔 폰트 오류 발생

| 항목            | 내용                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `teamplus-web/src/styles/globals.css` · `teamplus-web/tailwind.config.cjs`                                                                                                                          |
| **오류 메시지** | `GET https://fonts.gstatic.com/s/inter/v18/...woff2 net::ERR_ABORTED 404 (Not Found)`                                                                                                               |
| **문제**        | 전역 CSS가 Google Fonts의 내부 `fonts.gstatic.com` woff2 파일명을 직접 참조했다. 해당 파일명은 안정 API가 아니므로 버전·subset·weight에 따라 사라질 수 있고, 일부 weight(700/800)가 404를 반환했다. |
| **영향**        | 페이지 렌더링은 fallback으로 계속되지만 콘솔 오류가 반복되고, 숫자/금액 폰트 로딩이 불필요하게 실패한다.                                                                                            |
| **상태**        | ✅ 해결됨 (2026-04-29)                                                                                                                                                                              |

**잘못된 코드**:

```css
@font-face {
  font-family: "Inter";
  src: url("https://fonts.gstatic.com/s/inter/v18/...I6YMZg.woff2")
    format("woff2");
  font-weight: 700;
}
```

**올바른 코드**:

```js
// tailwind.config.cjs
fontFamily: {
  sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
  num: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
}
```

| **예방 가이드** | Google Fonts를 써야 하면 `next/font/google` 또는 공식 CSS2 엔드포인트를 사용하고, `fonts.gstatic.com` 내부 파일명을 직접 고정하지 않는다. TEAMPLUS Web 기본 숫자 폰트는 Pretendard + `tabular-nums`로 처리한다. |

### WEB-055: TeamListCard가 aggregate/relation 필드 누락 응답에서 런타임 크래시

| 항목            | 내용                                                                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `teamplus-web/src/components/team/TeamListCard.tsx` · `teamplus-web/src/services/team.service.ts`                                                                                                                                             |
| **오류 메시지** | `TypeError: Cannot read properties of undefined (reading 'roster') at TeamListCard` · `TypeError: Cannot read properties of undefined (reading 'location') at TeamListCard`                                                                   |
| **문제**        | 팀 목록 API 응답 중 일부 경로(`listManagedTeams` fallback, 학부모 visible teams 등)에서 `_count` 또는 `club` relation이 누락될 수 있는데, 카드 컴포넌트가 `team._count.roster`, `team.club.location`, `team.club.clubName`을 무조건 접근했다. |
| **영향**        | `/team` 목록 진입 시 ErrorBoundary로 떨어지고 하단 네비게이션 이동 후에도 route error가 반복된다.                                                                                                                                             |
| **상태**        | ✅ 해결됨 (2026-04-29, `club` relation 방어 보강)                                                                                                                                                                                             |

**잘못된 코드**:

```tsx
const memberCount = team._count.roster; // _count가 없으면 크래시
const location = team.club.location; // club이 없으면 크래시
```

**올바른 코드**:

```tsx
const memberCount = team._count?.roster ?? 0;
const clubLocation = team.club?.location ?? null;
const clubName = team.club?.clubName ?? null;
const divisionText = team.division ? divisionLabel(team.division) : null;
const metaText =
  divisionText && clubName
    ? `${divisionText} · ${clubName}`
    : (divisionText ?? clubName);
```

**타입 보강**:

```ts
export interface TeamListItem {
  _count?: {
    roster?: number;
  };
  club?: {
    id?: string;
    clubName?: string | null;
    location?: string | null;
  };
}
```

| **예방 가이드** | API aggregate 필드(`_count`, `_sum`, `_avg`)와 relation 필드(`club`, `member`, `user`)는 엔드포인트별 select/include 차이로 누락될 수 있으므로 목록 카드에서는 optional로 취급한다. 필수 집계/관계가 필요한 화면은 서비스 레이어에서 normalize하거나 컴포넌트에서 optional chaining + fallback을 둔다. |

---

        [WEB] 작성 2026.04.22. — ToastProvider 무한 루프 (Context Value 참조 불안정)

---

### WEB-052: ToastProvider.toast 객체 참조 불안정 → Maximum update depth exceeded

| 항목              | 내용                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**          | `src/components/ui/Toast.tsx` (ToastProvider + ToastItem)                                                                                                                                                                                         |
| **문제**          | Provider 가 매 렌더마다 새 `toast` 객체 리터럴을 생성하고 Context value 로 전달. 이 객체를 `useCallback`/`useEffect` deps 에 쓴 30+ consumer 가 `toast.error()` 호출 시마다 deps 변경으로 무한 재실행.                                            |
| **트리거 페이지** | `/coach-students` (API 실패 catch 에서 `toast.error(MESSAGES.error.general)` 호출)                                                                                                                                                                |
| **영향**          | `/coach-students` 페이지 무한 루프 + 브라우저 freeze. 같은 패턴을 쓰는 30+ 페이지(`consultations`, `director-notices`, `overseas-trips`, `academy`, `tournaments/*`, `director-members/*`, `waitlist`, `rsvp`, `useClassForm` 등) 모두 잠재 위험. |
| **상태**          | ✅ 해결됨 (2026-04-22)                                                                                                                                                                                                                            |

**원인 Call Chain**:

1. `/coach-students` 마운트 → `fetchStudents()` 실행
2. API 실패 → `toast.error(...)` → `setToasts([...])`
3. ToastProvider 재렌더 → `toast` 객체 신규 생성 → Context value 변경
4. `useToast()` 반환값 참조 변경 → consumer 페이지 재렌더
5. `useCallback([toast])` deps 변경 감지 → `fetchStudents` 재생성
6. `useEffect([fetchStudents])` 트리거 → `fetchStudents()` 재호출
7. 또 실패 → 2번으로 GOTO (무한 루프)

동시에 ToastItem 의 `useEffect([..., toast])` 도 `toast` 참조 변경마다 재실행되어 `exitTimer` 가 중복 등록 → `onRemove` 가 같은 ID 로 여러 번 호출 → React 가 `Maximum update depth exceeded` 감지하여 throw.

**잘못된 코드**:

```tsx
// Toast.tsx
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback(...);

  // ❌ 매 렌더마다 새 객체
  const toast = {
    success: (...) => addToast(...),
    error: (...) => addToast(...),
    ...
  };

  return <ToastContext.Provider value={{ toast }}>...; // ❌ value 도 매번 새 객체
}

// ToastItem
useEffect(() => {
  if (isExiting) {
    const exitTimer = setTimeout(() => {
      onRemove(toast.id);
      toast.onClose?.();
    }, 300);
    return () => clearTimeout(exitTimer);
  }
}, [isExiting, onRemove, toast]); // ❌ toast 객체 전체가 deps
```

**올바른 코드**:

```tsx
import { ..., useMemo, ... } from 'react';

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback(...);

  // ✅ useMemo 로 참조 안정화
  const toast = useMemo(() => ({
    success: (...) => addToast(...),
    error: (...) => addToast(...),
    ...
  }), [addToast]);

  const contextValue = useMemo(() => ({ toast }), [toast]);

  return <ToastContext.Provider value={contextValue}>...;
}

// ToastItem — 필요한 필드만 deps 로
useEffect(() => {
  if (!isExiting) return;
  const exitTimer = setTimeout(() => {
    onRemove(toast.id);
    toast.onClose?.();
  }, 300);
  return () => clearTimeout(exitTimer);
}, [isExiting, onRemove, toast.id, toast.onClose]); // ✅ 참조 안정 필드만

const handleAction = useCallback(() => {
  toast.onAction?.();
  setIsExiting(true);
}, [toast.onAction]); // ✅ toast 전체 대신 onAction 만
```

| **예방 가이드** | ① React Context 가 객체 리터럴을 `value` 로 내려주면 반드시 `useMemo` 로 감싼다. ② `useCallback`/`useEffect` deps 에 객체 전체 대신 **필요한 원시 필드** 만 넣는다 (특히 Context 에서 내려받은 값). ③ 새 페이지에서 `toast.error`/`toast.success` 를 catch 블록에서 호출할 때는 `useCallback` deps 에 `toast` 전체를 넣지 말고, ref 패턴을 쓰거나 Context Provider 가 안정화되어 있는지 먼저 확인한다. ④ React 19 StrictMode 의 이중 마운트가 있어도 `initialFetchedRef` 가드로 방어 가능하지만, 근본 해결은 Context value 안정화. |

---

---

        [WEB] 작성 2026.04.22. — 세션 끊김 재발 방지 (WEB-020/WEB-032 후속)

---

### WEB-051: Refresh 실패 시 무조건 clearToken → 페이지 이동 중 강제 로그아웃

| 항목     | 내용                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/services/api-client.ts` · `teamplus-admin/src/services/api-client.ts`                                                                         |
| **문제** | `refreshAccessToken()` catch 블록이 에러 종류 구분 없이 항상 `clearToken()` + Cookie 삭제 실행. 타임아웃·5xx·네트워크 일시 오류에서도 세션 삭제됨. |
| **영향** | 모바일 LTE 일시 단절·백엔드 재시작 중에 사용자 페이지 이동 시 강제 로그아웃.                                                                       |
| **상태** | ✅ 해결됨 (2026-04-22) — WEB-032 연장선                                                                                                            |

**원인**:

- WEB-032 수정 시 "refreshToken 없음(미인증 정상 상태)"만 방어 처리.
- 타임아웃·5xx 등 "서버가 세션 무효라고 판정한 게 아닌 경우"까지 포함하여 clearToken 호출 → 정당한 세션 삭제.
- axios-auth-refresh 등 업계 표준은 401(UnauthorizedException)만 clearToken 수행.

**잘못된 코드**:

```typescript
} catch (error) {
  devError('[API Client] 토큰 갱신 실패:', error);
  onRefreshFailed(...);
  // 갱신 실패 시 무조건 토큰 삭제 ← 타임아웃/5xx도 여기로 진입
  await hybridAuth.clearToken();
  document.cookie = 'teamplus_access_token=; path=/; max-age=0';
  return null;
}
```

**올바른 코드**:

```typescript
} catch (error) {
  devError('[API Client] 토큰 갱신 실패:', error);
  onRefreshFailed(...);

  // 401 (서버가 명시적으로 세션 무효 판정)만 clearToken.
  // 타임아웃·5xx·네트워크 오류는 토큰 유지 → 다음 요청에서 자연 재시도.
  const status = (error as AxiosError)?.response?.status;
  if (status === 401) {
    await hybridAuth.clearToken();
    if (typeof document !== 'undefined') {
      document.cookie = 'teamplus_access_token=; path=/; max-age=0';
    }
  }
  return null;
}
```

| **예방 가이드** | Refresh 실패 catch에서 `clearToken`은 **서버가 명시적으로 401 응답한 경우에만** 수행한다. 네트워크·타임아웃·5xx 오류는 일시 장애로 간주하여 토큰을 유지하고 다음 요청에서 재시도하도록 한다. (업계 표준: `axios-auth-refresh`, auth0 SDK 등과 동일 패턴) |

---

### WEB-050: Cookie 선삭제가 페이지 이동 중 강제 로그아웃 유발 (WEB-020 레거시 제거)

| 항목     | 내용                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/services/web-token-storage.ts`                                                                                                                                                                                        |
| **문제** | `isTokenExpired()` (만료 5분 버퍼) 판정 시 즉시 `document.cookie = '...max-age=0'` 실행. Refresh 진행 중 Cookie 공백 창 발생 → 그 사이 사용자가 페이지 이동하면 middleware가 "토큰 없음"으로 판정하여 `/login` 리다이렉트. |
| **영향** | 세션이 유효한 사용자가 페이지 이동·링크 클릭 시 종종 강제 로그아웃.                                                                                                                                                        |
| **상태** | ✅ 해결됨 (2026-04-22) — WEB-020 해결책 레거시 제거                                                                                                                                                                        |

**배경 (WEB-020과의 관계)**:

- WEB-020(2026-01-19) 당시 `middleware.ts`는 `!!accessToken` (존재 여부만) 확인 → 만료된 Cookie가 남아있으면 인증된 것으로 오판 → 무한 로딩 발생.
- 해결책으로 "만료 감지 즉시 Cookie 삭제" 로직을 `webTokenStorage.getToken()`에 도입.
- **그러나 현재 `middleware.ts`는 이미 JWT `exp`를 직접 검증**(`middleware.ts:48`):
  ```typescript
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) return { isValid: false, isAuthorized: false };
  ```
- 따라서 Cookie 선삭제는 **중복 방어 장치**이며, 오히려 refresh 진행 중 쿠키 공백 창을 만들어 새로운 버그(페이지 이동 시 강제 로그아웃)를 유발.

**해결**:

```typescript
// 변경 전 (web-token-storage.ts:244-248)
if (isTokenExpired(accessToken)) {
  if (typeof document !== 'undefined') {
    document.cookie = 'teamplus_access_token=; path=/; max-age=0';  // ❌ 선삭제
  }
  if (refreshToken) return { accessToken, refreshToken };
  ...
}

// 변경 후
if (isTokenExpired(accessToken)) {
  // WEB-020 레거시 제거 (2026-04-22):
  // 현재 middleware.ts는 JWT exp 직접 검증 → Cookie 동기화 불필요.
  if (refreshToken) return { accessToken, refreshToken };
  ...
}
```

| **예방 가이드** | Cookie 조작은 인증 플로우 중앙(`auth.ts:saveTokens`, `clearToken`)에서만 수행한다. `getToken()` 같은 조회 함수가 부수효과로 Cookie를 변경하지 않는다. 쿠키-localStorage 동기화는 `middleware.ts`의 JWT exp 검증에 일임한다. |

---

### WEB-036: Route Segment Config `dynamic`와 `next/dynamic` import 이름 충돌로 페이지 진입 시 런타임 에러

| 항목     | 내용                                                                                                                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/app/(common)/settings/theme/page.tsx`                                                                                                                                                                                                                                       |
| **문제** | `export const dynamic = 'force-dynamic'`와 `import dynamic from 'next/dynamic'`가 같은 모듈 스코프에서 동일한 식별자 이름을 사용하여, 동적 import 함수가 문자열 값으로 덮여씀                                                                                                    |
| **증상** | 브라우저 콘솔에 `Uncaught (in promise) TypeError: dynamic is not a function`, `The above error occurred in the <ClientPageRoot> component.` 출력 후 테마 설정 페이지 렌더링 실패                                                                                                 |
| **원인** | Next.js App Router의 Route Segment Config인 `dynamic`은 예약된 export 이름이어야 하지만, 같은 파일에서 `next/dynamic` import도 `dynamic`이라는 이름으로 선언하여 충돌 발생. 결과적으로 `dynamic(() => import(...))` 호출 시 함수가 아니라 `'force-dynamic'` 문자열을 호출하게 됨 |
| **상태** | ✅ 해결됨                                                                                                                                                                                                                                                                        |

**잘못된 코드:**

```tsx
export const dynamic = "force-dynamic";

import dynamic from "next/dynamic";

const GlobalMenu = dynamic(() => import("@/components/layout/GlobalMenu"), {
  ssr: false,
});
```

**올바른 코드:**

```tsx
export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";

const GlobalMenu = nextDynamic(() => import("@/components/layout/GlobalMenu"), {
  ssr: false,
});
```

| **예방 가이드** | App Router 페이지/레이아웃에서 `export const dynamic`, `revalidate`, `fetchCache` 같은 Route Segment Config export를 사용할 때는, 같은 파일 안의 import/const 이름과 절대 중복시키지 말 것. 특히 `next/dynamic`은 `nextDynamic`처럼 별칭으로 import하는 패턴을 기본값으로 사용하면 동일 오류를 예방할 수 있다. |

---

---

        [WEB] 작성 2026.04.14. 11:33:30

---

## 🟡 Medium Issues (최근 추가)

### WEB-047: 클럽 통계 KPI 렌더링에서 `key` prop을 spread로 넘겨 React 경고 발생

| 항목     | 내용                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/app/(director)/statistics/page.tsx`                                                                                                                              |
| **문제** | KPI 배열 객체에 포함된 `key`를 그대로 spread 하면서 `<KpiCard key={...} {...kpi} />` 패턴을 사용해 React가 `key` prop spread 경고를 출력                              |
| **증상** | 브라우저 콘솔에 `A props object containing a "key" prop is being spread into JSX` 경고가 출력되고, 정적 검사에서는 `TS2783: 'key' is specified more than once`가 발생 |
| **원인** | React의 `key`는 JSX에서 직접 지정해야 하는 특수 prop인데, 렌더링용 데이터 객체 안에 `key`를 남긴 채 spread 해서 React 내부 예약 prop과 일반 prop이 중복됨             |
| **상태** | ✅ 해결됨                                                                                                                                                             |

**잘못된 코드:**

```tsx
{
  kpis.map((kpi) => <KpiCard key={kpi.key} {...kpi} />);
}
```

**올바른 코드:**

```tsx
{
  kpis.map(({ key, ...kpi }) => <KpiCard key={key} {...kpi} />);
}
```

| **예방 가이드** | 목록 렌더링용 데이터에 `key`, `ref` 같은 React 예약 prop이 들어 있으면 JSX spread 전에 반드시 구조 분해로 분리할 것. `map(({ key, ...item }) => <Comp key={key} {...item} />)` 패턴을 기본으로 사용하면 같은 실수를 막을 수 있다. |

### WEB-048: 클럽 통계 Recharts `ResponsiveContainer` 초기 치수 미확정으로 `width(-1)`, `height(-1)` 경고 발생

| 항목     | 내용                                                                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/app/(director)/statistics/page.tsx`                                                                                                                                                                                                                         |
| **문제** | 통계 차트가 `ResponsiveContainer width="100%" height="100%"`만 사용한 채 초기 렌더링될 때 부모 치수 측정 전 기본값 `-1`을 사용하여 콘솔 경고 발생                                                                                                                |
| **증상** | 브라우저 콘솔에 `The width(-1) and height(-1) of chart should be greater than 0` 경고가 반복 출력되고, 출석률/매출 차트에서 초기 마운트 시 레이아웃 계산 경고가 발생                                                                                             |
| **원인** | Recharts v3의 `ResponsiveContainer`는 부모 요소가 아직 측정되지 않은 시점에 기본 `initialDimension: { width: -1, height: -1 }`를 사용한다. 통계 카드 안 차트 래퍼에 명시적 `w-full`, `min-w-0`, 최소 높이/초기 치수를 주지 않으면 초기 측정 경고가 그대로 노출됨 |
| **상태** | ✅ 해결됨                                                                                                                                                                                                                                                        |

**잘못된 코드:**

```tsx
<div className="h-36">
  <ResponsiveContainer width="100%" height="100%">
    <RcBarChart data={items}>
      <Tooltip content={<AttendanceTooltip />} />
    </RcBarChart>
  </ResponsiveContainer>
</div>
```

**올바른 코드:**

```tsx
<div className="h-36 w-full min-w-0">
  <ResponsiveContainer
    width="100%"
    height="100%"
    minWidth={0}
    minHeight={144}
    initialDimension={{ width: 320, height: 144 }}
  >
    <RcBarChart data={items}>
      <Tooltip content={(props) => <AttendanceTooltip {...props} />} />
    </RcBarChart>
  </ResponsiveContainer>
</div>
```

| **예방 가이드** | Recharts `ResponsiveContainer`를 카드/탭/슬라이드 안에서 사용할 때는 부모 래퍼에 `w-full`과 필요한 최소 높이를 먼저 보장하고, 컨테이너에는 `minWidth`, 필요 시 `minHeight`와 `initialDimension`을 명시할 것. 커스텀 툴팁은 `content={<Comp />}`보다 `content={(props) => <Comp {...props} />}` 형태가 v3 타입과 런타임 모두 안전하다. |

---

---

        [WEB] 작성 2026.04.11. 17:00:51

---

## 🟡 Medium Issues (최근 추가)

### WEB-035: 축 잠금 캐러셀에서 touchmove Intervention 경고 (cancelable=false)

| 항목     | 내용                                                                                                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/components/ui/SwipeStatCards.tsx`, `src/components/common/QuickActionsCarousel.tsx`                                                                                                                                                                                                             |
| **문제** | 가로/세로 스와이프 축 잠금 캐러셀에서 `touchmove` 핸들러가 `e.preventDefault()`를 호출할 때, 이미 브라우저 스크롤이 진행 중이면 이벤트가 non-cancelable 상태가 되어 브라우저가 Intervention 경고 출력                                                                                                |
| **증상** | 브라우저 콘솔에 `[Intervention] Ignored attempt to cancel a touchmove event with cancelable=false, for example because scrolling is in progress and cannot be interrupted.` 경고 반복 출력 (Teen 메인화면의 "내 현황" 스와이프 카드/"바로가기" 캐러셀 스와이프 시 발생)                              |
| **원인** | `addEventListener('touchmove', ..., { passive: false })`로 등록해도, 사용자가 세로 스크롤 도중 가로로 방향을 바꾸는 경우 브라우저가 이미 스크롤 제스처를 확정하면 해당 touchmove 이벤트의 `cancelable`이 `false`로 내려옴. 이 상태에서 `preventDefault()`를 호출하면 무시되고 Intervention 경고 발생 |

**잘못된 코드:**

```typescript
const onTouchMove = (e: TouchEvent) => {
  if (!isDragging.current) return;
  // ... 축 잠금 판정 로직 ...
  if (!isHorizontal.current) return;
  e.preventDefault(); // ❌ e.cancelable=false 일 수 있음 → Intervention 경고
  handleDragMove(e.touches[0].clientX);
};
container.addEventListener("touchmove", onTouchMove, { passive: false });
```

**올바른 코드:**

```typescript
const onTouchMove = (e: TouchEvent) => {
  if (!isDragging.current) return;
  // ... 축 잠금 판정 로직 ...
  if (!isHorizontal.current) return;
  // ✅ 스크롤이 이미 시작되어 non-cancelable 인 경우 방어
  if (e.cancelable) e.preventDefault();
  handleDragMove(e.touches[0].clientX);
};
container.addEventListener("touchmove", onTouchMove, { passive: false });
```

| **예방 가이드** | `{ passive: false }`로 등록한 touchmove 핸들러라도, 브라우저가 이미 스크롤 제스처를 시작한 경우 `e.cancelable`이 `false`가 될 수 있다. 축 잠금(axis-lock) 방식의 가로 스와이프 캐러셀은 반드시 `if (e.cancelable) e.preventDefault()` 패턴으로 방어 코드를 작성할 것. React의 `onTouchMove` 합성 이벤트는 기본적으로 passive로 등록되므로, `preventDefault`가 필요한 경우 반드시 `useEffect` + native `addEventListener({ passive: false })` + `cancelable` 체크 세트로 구현해야 한다. |

---

        [WEB] 작성 2026.03.06. 22:40:00

---

## 🟡 Medium Issues (최근 추가)

### WEB-034: BannerCarousel에서 외부 이미지 호스트 미등록으로 next/image 런타임 에러

| 항목     | 내용                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/components/common/BannerCarousel.tsx`                                                                                                  |
| **문제** | 관리자/백엔드에서 내려온 배너 이미지 URL이 `next.config.js`의 `images.remotePatterns`에 없는 호스트면 `next/image`가 런타임 예외를 발생시킴 |
| **증상** | `Invalid src prop (...) on next/image, hostname "via.placeholder.com" is not configured`                                                    |
| **원인** | 배너 이미지는 운영 중 임의의 외부 호스트로 바뀔 수 있는데, 정적 화이트리스트 기반의 `next/image`를 직접 사용하고 있었음                     |

**잘못된 코드:**

```tsx
<Image src={banner.imageUrl} alt={banner.title} fill />
```

**올바른 코드:**

```tsx
{
  isRemoteImageUrl(banner.imageUrl) ? (
    <img
      src={banner.imageUrl}
      alt={banner.title}
      className="absolute inset-0 h-full w-full object-cover"
    />
  ) : (
    <Image src="/placeholder.svg" alt={banner.title} fill />
  );
}
```

| **예방 가이드** | 운영자가 입력하는 외부 이미지 URL처럼 호스트가 고정되지 않는 데이터는 `next/image`보다 일반 `<img>` 또는 서버 프록시 방식을 사용할 것. `next/image`는 호스트가 정적으로 관리되는 자산에만 적용한다. |

---

        [WEB] 작성 2026.03.06. 22:24:25

---

## 🟡 Medium Issues (최근 추가)

### WEB-033: 프로필 수정/비밀번호 변경에서 잘못된 API 경로로 404 발생

| 항목     | 내용                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/app/(common)/profile/edit/page.tsx`, `src/app/(common)/profile/password/page.tsx`                                              |
| **문제** | 프론트엔드가 존재하지 않는 `/users/profile`, `/auth/password` 엔드포인트를 호출하여 404 발생                                        |
| **증상** | 브라우저 콘솔에 `[API Error] 리소스를 찾을 수 없습니다.` 와 `[API Error] { url, method, status: 404 }` 반복 출력                    |
| **원인** | 백엔드 실제 라우트는 `PATCH /api/v1/auth/profile`, `POST /api/v1/auth/change-password`인데 프론트엔드가 예전 경로를 유지하고 있었음 |

**잘못된 코드:**

```typescript
const response = await api.patch("/users/profile", {
  name: formData.name,
  phone: formData.phone,
});

const response = await api.patch("/auth/password", {
  currentPassword: formData.currentPassword,
  newPassword: formData.newPassword,
});
```

**올바른 코드:**

```typescript
const response = await api.patch("/auth/profile", {
  name: formData.name,
  phone: formData.phone,
});

const response = await api.post("/auth/change-password", {
  currentPassword: formData.currentPassword,
  newPassword: formData.newPassword,
});
```

| **예방 가이드** | 프론트엔드 API 경로를 추가하거나 수정할 때는 먼저 백엔드 Controller 데코레이터(`@Controller`, `@Get`, `@Patch`, `@Post`) 기준으로 실제 최종 경로를 확인할 것. `users/profile`처럼 추정 경로를 직접 만들지 말고 서비스 계층 공통 함수로 묶어 재사용하는 것이 안전하다. |

---

        [WEB] 작성 2026.03.05. 00:00:00

---

## 🟡 Medium Issues (최근 추가)

### WEB-032: 미인증 상태에서 토큰 갱신 에러 중복 출력

| 항목     | 내용                                                                                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/services/api-client.ts`, `src/contexts/NotificationContext.tsx`                                                                                                                                                                               |
| **문제** | 앱 초기화 시 `AuthContext`와 `NotificationContext`가 동시에 API 호출 → 둘 다 401 → `refreshAccessToken()` 2회 실행 → `Error: No refresh token available` 2번 출력 + 불필요한 `clearToken()` 호출                                                   |
| **증상** | `[API Client] 토큰 갱신 실패: Error: No refresh token available` × 2, `[WebTokenStorage] 토큰 삭제 완료` × 2                                                                                                                                       |
| **원인** | `refreshAccessToken()`에서 리프레시 토큰 없음(미인증 정상 상태)을 `throw`로 처리 → catch 블록에서 에러 로그 + `clearToken()` 불필요하게 실행. 첫 번째 refresh 완료 후 `isRefreshing = false` 리셋 → `NotificationContext`가 두 번째 refresh 재시도 |

**잘못된 코드:**

```typescript
// api-client.ts - refreshAccessToken()
if (!tokenInfo?.refreshToken) {
  throw new Error('No refresh token available'); // ← catch로 이동 → 에러 로그 + clearToken 실행
}

// NotificationContext.tsx - 토큰 체크 없이 바로 API 호출
const loadNotifications = useCallback(async () => {
  setIsLoading(true);
  const response = await api.get('/notifications'); // ← 미인증 시 401 유발
```

**올바른 코드:**

```typescript
// api-client.ts - refreshAccessToken()
if (!tokenInfo?.refreshToken) {
  // 미인증 정상 상태 → 에러/clearToken 없이 조용히 처리
  onRefreshFailed(new Error('unauthenticated'));
  return null;
}

// NotificationContext.tsx - 토큰 존재 확인 후 호출
const loadNotifications = useCallback(async () => {
  const tokenInfo = await hybridAuth.getToken();
  if (!tokenInfo?.accessToken) {
    setIsLoading(false);
    return; // 미인증 시 API 호출 건너뜀
  }
  setIsLoading(true);
  const response = await api.get('/notifications');
```

| **예방 가이드** | Context가 초기화 시 API를 호출할 경우, 반드시 토큰 존재 여부를 먼저 확인할 것. `refreshAccessToken()`에서 "리프레시 토큰 없음"은 에러가 아닌 미인증 정상 상태이므로 catch로 넘기지 않는다. |

---

---

        [WEB] 작성 2026.01.25. 17:30:00

---

## 🟠 High Issues (최근 추가)

### WEB-030: ParentDashboardPage에서 creditData undefined 에러

| 항목     | 내용                                                                       |
| -------- | -------------------------------------------------------------------------- |
| **파일** | `src/app/(parent)/parent/page.tsx`, `src/hooks/useDashboardData.ts`        |
| **문제** | API 응답에서 `creditData`가 없을 때 `undefined is not an object` 에러 발생 |
| **영향** | 학부모 대시보드 화면이 로드되지 않음, ErrorBoundary로 폴백                 |
| **상태** | ✅ 해결됨                                                                  |

**에러 메시지**:

```
TypeError: undefined is not an object (evaluating 'data.creditData.current')
The above error occurred in the <ParentDashboardPage> component.
```

**원인 분석**:

- 백엔드 API 응답 구조가 프론트엔드 기대 구조와 다름
- `response.data`는 존재하지만 `creditData` 필드가 없거나 undefined
- Optional chaining 없이 직접 접근하여 TypeError 발생

**잘못된 코드**:

```tsx
// page.tsx
<CreditSection
  current={data.creditData.current} // ❌ creditData가 undefined면 에러
  expiryDate={data.creditData.expiryDate}
/>
```

**수정된 코드**:

```tsx
// useDashboardData.ts - API 응답 매핑 시 방어적 처리
setData({
  parentName: apiData.parentName || apiData.name || "회원님",
  creditData: {
    current:
      apiData.creditData?.current ?? apiData.credits ?? apiData.credit ?? 0,
    expiryDate: apiData.creditData?.expiryDate ?? apiData.expiryDate ?? "-",
  },
  // ...
});

// page.tsx - Optional chaining으로 이중 방어
<CreditSection
  current={data.creditData?.current ?? 0} // ✅ 안전한 접근
  expiryDate={data.creditData?.expiryDate ?? "-"}
/>;
```

**📌 예방 가이드라인**:

1. **API 응답 매핑**: Hook에서 API 응답을 프론트엔드 구조로 변환할 때 `??` 연산자로 기본값 제공
2. **컴포넌트에서 접근**: 중첩 객체 접근 시 항상 optional chaining (`?.`) 사용
3. **이중 방어**: Hook과 컴포넌트 양쪽에서 방어적 처리
4. **타입 정의**: API 응답 타입과 프론트엔드 타입 분리 관리

---

### WEB-031: Coach/Director 대시보드에서 stats/배열 undefined 에러

| 항목     | 내용                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| **파일** | `src/app/(coach)/coach/page.tsx`, `src/app/(director)/director/page.tsx`, 관련 hooks |
| **문제** | API 응답에서 `stats`, `schedules`, `coaches`, `events` 등이 없을 때 TypeError 발생   |
| **영향** | 코치/감독 대시보드 화면이 로드되지 않음                                              |
| **상태** | ✅ 해결됨                                                                            |

**에러 메시지**:

```
TypeError: undefined is not an object (evaluating 'data.stats.todayClasses')
TypeError: Cannot read properties of undefined (reading 'map')
```

**원인 분석**:

- WEB-030과 동일한 패턴의 에러
- Hook에서 API 응답을 그대로 저장하고, 페이지에서 중첩 객체/배열에 직접 접근

**수정 파일**:

1. `src/hooks/useCoachDashboardData.ts` - API 응답 매핑 시 기본값 처리
2. `src/hooks/useDirectorDashboardData.ts` - API 응답 매핑 시 기본값 처리
3. `src/app/(coach)/coach/page.tsx` - Optional chaining 추가
4. `src/app/(director)/director/page.tsx` - Optional chaining 추가

**수정 패턴**:

```typescript
// Hook에서
stats: {
  todayClasses: apiData.stats?.todayClasses ?? 0,
  // ...
},
schedules: apiData.schedules ?? [],

// Page에서
value={data.stats?.todayClasses ?? 0}
{(data.schedules ?? []).map(...)}
```

---

---

        [WEB] 작성 2026.01.25. 13:50:00

---

### WEB-029: Native 앱 BottomNav 라우트 페이지에서 useDefaultUI 누락

| 항목     | 내용                                                               |
| -------- | ------------------------------------------------------------------ |
| **파일** | `src/app/(shared)/(class)/classes/page.tsx` 외 다수                |
| **문제** | BottomNav 라우트 페이지에서 `useNativeUI`/`useDefaultUI` 호출 누락 |
| **영향** | Native 앱에서 해당 페이지 진입 시 BottomNav가 표시되지 않음        |
| **상태** | ✅ 해결됨                                                          |

**증상**:

- Flutter 앱에서 BottomNav "수업" 버튼 클릭 시 `/classes` 페이지로 이동
- `/classes` 페이지 로드 후 Native BottomNav가 표시되지 않음
- 다른 BottomNav 라우트 페이지도 동일한 증상 발생

**원인 분석**:

```
WebView 로딩 완료 → _showBottomNavDynamic = false (기본값)
→ Web 페이지에서 useNativeUI/useDefaultUI 미호출
→ Native BottomNav 숨김 상태 유지
```

**해결 방법**:
모든 BottomNav 라우트 페이지에 `useDefaultUI()` 호출 추가

**수정된 파일**:

1. `src/app/(shared)/(class)/classes/page.tsx`
2. `src/app/(student)/schedule/page.tsx`
3. `src/app/(student)/badges/page.tsx`
4. `src/app/(shared)/matches/list/page.tsx`
5. `src/app/(shared)/(class)/calendar/page.tsx`
6. `src/app/(common)/mypage/page.tsx`
7. `src/app/(common)/notifications/page.tsx`
8. `src/app/(shared)/(message)/messages/page.tsx`

**수정 패턴**:

```tsx
// 1. import 추가
import { useDefaultUI } from "@/hooks/useNativeUI";

// 2. 컴포넌트 최상단에 훅 호출
export default function SomePage() {
  // Native 앱에서 BottomNav 표시 (기본 UI 설정)
  useDefaultUI();

  // ... 나머지 코드
}
```

**📌 예방 가이드라인**:

1. **새 페이지 생성 시**: BottomNav 라우트에 해당하면 반드시 `useDefaultUI()` 추가
2. **BottomNav 라우트 목록** (teamplus_bottom_nav.dart 참조):
   - `/classes`, `/calendar`, `/schedule`, `/badges`, `/matches/list`
   - `/notifications`, `/mypage`, `/messages`
   - 각 역할별 홈: `/parent`, `/coach`, `/child`, `/teen`, `/admin`, `/director`
3. **상세 페이지**: `useDetailUI('타이틀')` 또는 `useHideBottomNav()` 사용

---

## 🔴 Critical Issues

### WEB-001: 환경 변수 노출 위험

| 항목     | 내용                                                       |
| -------- | ---------------------------------------------------------- |
| **파일** | `src/lib/crypto.ts:18`                                     |
| **문제** | `NEXT_PUBLIC_CRYPTO_SECRET_KEY`가 클라이언트 번들에 포함됨 |
| **영향** | 암호화 키가 브라우저에서 노출되어 보안 위협                |
| **상태** | ⬜ 미해결                                                  |

**현재 코드**:

```typescript
const SECRET_KEY = process.env.NEXT_PUBLIC_CRYPTO_SECRET_KEY!;
```

**해결 방안**:

1. 서버 사이드에서만 암호화 수행
2. `NEXT_PUBLIC_` 접두사 제거하고 서버 컴포넌트/API Route에서만 사용
3. 클라이언트 암호화가 필요한 경우 공개키 암호화(RSA) 사용

**수정 코드**:

```typescript
// 서버 전용으로 변경
const SECRET_KEY = process.env.CRYPTO_SECRET_KEY!;

// 또는 API Route에서만 사용
// src/app/api/encrypt/route.ts
export async function POST(req: Request) {
  const data = await req.json();
  const encrypted = await encryptOnServer(data);
  return Response.json({ encrypted });
}
```

---

### WEB-002: 런타임 암호화 검증 실패

| 항목     | 내용                                                |
| -------- | --------------------------------------------------- |
| **파일** | `src/lib/crypto.ts:20-25`                           |
| **문제** | 키 검증이 모듈 로드 시 실행되어 앱 전체 크래시 가능 |
| **영향** | 환경 변수 누락 시 앱 시작 불가                      |
| **상태** | ⬜ 미해결                                           |

**현재 코드**:

```typescript
if (!SECRET_KEY || SECRET_KEY.length !== 64) {
  throw new Error("CRYPTO_SECRET_KEY must be 64 hex chars...");
}
```

**해결 방안**:

```typescript
// Lazy initialization으로 변경
let cryptoKey: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
  if (cryptoKey) return cryptoKey;

  const secretKey = process.env.CRYPTO_SECRET_KEY;
  if (!secretKey || secretKey.length !== 64) {
    throw new CryptoConfigError("Invalid crypto key configuration");
  }

  cryptoKey = await importKey(secretKey);
  return cryptoKey;
}
```

---

## 🟠 High Priority Issues

### WEB-003: CSP 정책 미흡

| 항목     | 내용                                  |
| -------- | ------------------------------------- |
| **파일** | `next.config.js` 또는 `middleware.ts` |
| **문제** | Content Security Policy 헤더 미설정   |
| **영향** | XSS 공격에 취약                       |
| **상태** | ⬜ 미해결                             |

**해결 방안**:

```typescript
// next.config.js
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      font-src 'self';
      connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL};
    `.replace(/\n/g, ""),
  },
];

module.exports = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
```

---

### WEB-004: 빈 catch 블록

| 항목     | 내용                               |
| -------- | ---------------------------------- |
| **파일** | 다수 (services/, hooks/)           |
| **문제** | 에러를 무시하는 빈 catch 블록 존재 |
| **영향** | 디버깅 어려움, 에러 추적 불가      |
| **상태** | ⬜ 미해결                          |

**문제 코드**:

```typescript
try {
  await someOperation();
} catch (error) {
  // 빈 블록 - 에러 무시됨
}
```

**해결 방안**:

```typescript
try {
  await someOperation();
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("[Operation] Failed:", error);
  }
  // 프로덕션에서는 Sentry로 전송
  Sentry.captureException(error);
  // 사용자에게 알림 또는 fallback 처리
  throw new OperationError("작업 중 오류가 발생했습니다.");
}
```

---

### WEB-005: 타입 단언 남용

| 항목     | 내용                              |
| -------- | --------------------------------- |
| **파일** | 다수                              |
| **문제** | `as` 키워드로 타입 강제 변환 남용 |
| **영향** | 런타임 타입 오류 가능성           |
| **상태** | ⬜ 미해결                         |

**문제 코드**:

```typescript
const user = response.data as User; // 검증 없이 타입 단언
```

**해결 방안**:

```typescript
// Zod 스키마로 런타임 검증
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});

const user = UserSchema.parse(response.data); // 런타임 검증 포함
```

---

### WEB-006: 테스트 구성 오류

| 항목     | 내용                              |
| -------- | --------------------------------- |
| **파일** | `jest.config.js`, `tsconfig.json` |
| **문제** | 테스트 환경 설정 불완전           |
| **영향** | 테스트 실행 실패 가능             |
| **상태** | ⬜ 미해결                         |

**해결 방안**:

```javascript
// jest.config.js
module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
};
```

---

## 🟡 Medium Priority Issues

### WEB-007: TODO 주석 다수 존재

| 항목     | 내용      |
| -------- | --------- |
| **파일** | 다수      |
| **개수** | 약 15개   |
| **상태** | ⬜ 미해결 |

**주요 TODO 목록**:
| 위치 | 내용 |
|------|------|
| `auth.ts:147` | SMS/OTP 실제 API 연동 |
| `coach/page.tsx` | 회원 승인/거절 API 연동 |
| `notification.ts` | 알림 읽음 처리 API |
| `chat/[id]/page.tsx` | 채팅 메시지 전송 API |

---

### WEB-008: 미사용 import 문

| 항목     | 내용                               |
| -------- | ---------------------------------- |
| **파일** | 다수                               |
| **문제** | 사용하지 않는 import 문이 남아있음 |
| **영향** | 번들 크기 증가, 코드 가독성 저하   |
| **상태** | ⬜ 미해결                          |

**해결 방안**:

```bash
# ESLint 규칙 추가
# .eslintrc.json
{
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "unused-imports/no-unused-imports": "error"
  }
}

# 자동 수정
npx eslint --fix src/
```

---

### WEB-009: 에러 컨텍스트 부족

| 항목     | 내용                           |
| -------- | ------------------------------ |
| **파일** | services/                      |
| **문제** | 에러 메시지에 디버깅 정보 부족 |
| **영향** | 프로덕션 디버깅 어려움         |
| **상태** | ⬜ 미해결                      |

**해결 방안**:

```typescript
class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// 사용 예시
throw new ApiError("로그인 실패", "AUTH_FAILED", {
  email,
  attemptCount,
  timestamp: new Date().toISOString(),
});
```

---

### WEB-010: 캐시 전략 미흡

| 항목     | 내용                         |
| -------- | ---------------------------- |
| **파일** | services/, hooks/            |
| **문제** | API 응답 캐싱 전략 없음      |
| **영향** | 불필요한 API 호출, 성능 저하 |
| **상태** | ⬜ 미해결                    |

**해결 방안**:

```typescript
// TanStack Query 사용
import { useQuery } from "@tanstack/react-query";

function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
    staleTime: 5 * 60 * 1000, // 5분
    cacheTime: 30 * 60 * 1000, // 30분
  });
}
```

---

### WEB-011: 개발 환경 로깅 처리

| 항목     | 내용                                        |
| -------- | ------------------------------------------- |
| **파일** | 전체 코드베이스                             |
| **문제** | console.log가 프로덕션에서도 출력될 수 있음 |
| **영향** | 성능 저하, 정보 노출                        |
| **상태** | ✅ 해결됨 (2026-01-19)                      |

**해결 완료**:
모든 console.log/warn/error에 개발 환경 체크 추가됨

---

### WEB-012: 입력값 유효성 검증 미흡

| 항목     | 내용                                  |
| -------- | ------------------------------------- |
| **파일** | components/forms/                     |
| **문제** | 클라이언트 측 유효성 검증 일관성 없음 |
| **영향** | 사용자 경험 저하, 잠재적 보안 위험    |
| **상태** | ⬜ 미해결                             |

---

### WEB-013: Promise 에러 처리

| 항목     | 내용                               |
| -------- | ---------------------------------- |
| **파일** | services/                          |
| **문제** | unhandled promise rejection 가능성 |
| **영향** | 앱 크래시, 에러 추적 불가          |
| **상태** | ⬜ 미해결                          |

---

### WEB-014: 쿠키 보안 설정

| 항목     | 내용                                  |
| -------- | ------------------------------------- |
| **파일** | services/auth.ts                      |
| **문제** | 쿠키에 Secure, HttpOnly 플래그 미설정 |
| **영향** | 토큰 탈취 위험                        |
| **상태** | ⬜ 미해결                             |

**해결 방안**:

```typescript
// 서버 사이드에서 쿠키 설정
response.cookies.set("access_token", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 7, // 7일
});
```

---

### WEB-015: Race Condition

| 항목     | 내용                               |
| -------- | ---------------------------------- |
| **파일** | contexts/AuthContext.tsx           |
| **문제** | 토큰 갱신 시 race condition 가능성 |
| **영향** | 동시 요청 시 토큰 불일치           |
| **상태** | ⬜ 미해결                          |

---

### WEB-016: 토큰 유효성 검증

| 항목     | 내용                            |
| -------- | ------------------------------- |
| **파일** | services/auth.ts, middleware.ts |
| **문제** | JWT 토큰 만료 시간 검증 미흡    |
| **영향** | 만료된 토큰으로 요청 시도       |
| **상태** | ✅ 해결됨 (2026-01-19)          |

**참조**: WEB-025 참고

---

### WEB-017: 접근성 (A11y)

| 항목     | 내용                                |
| -------- | ----------------------------------- |
| **파일** | components/                         |
| **문제** | ARIA 속성 및 키보드 네비게이션 미흡 |
| **영향** | 스크린 리더 사용자 접근성 저하      |
| **상태** | ⬜ 미해결                           |

---

### WEB-019: NavLink 무한 로딩 스피너 (미들웨어 리다이렉트)

---

        web 작성 2026.01.19. 15:30:00

---

| 항목     | 내용                                                     |
| -------- | -------------------------------------------------------- |
| **파일** | `src/contexts/LoadingContext.tsx`                        |
| **문제** | 인증된 사용자가 `/login` 클릭 시 무한 로딩 스피너 발생   |
| **영향** | 사용자가 로그인 버튼 클릭 후 화면이 멈춤, UX 심각한 저하 |
| **상태** | ✅ 해결됨 (2026-01-19)                                   |

**원인 분석**:

1. 사용자가 `/` 페이지에서 로그인 링크 클릭
2. `NavLink`의 `handleClick`이 `startLoading('fullscreen', '이동 중...')` 호출
3. Next.js가 `/login` 페이지 요청
4. `middleware.ts`가 `access_token` 쿠키 감지 → 인증된 사용자를 `/`로 리다이렉트
5. 브라우저가 `/`로 돌아오지만, `pathname`이 `/` → `/login` → `/`로 빠르게 변경됨
6. `LoadingContext`의 `RouteChangeHandler`가 최종 pathname(`/`)만 감지
7. 처음 pathname과 동일하여 변경으로 인식하지 못함 → 로딩이 해제되지 않음

**🔴 문제 코드 (수정 전)**:

```typescript
// src/contexts/LoadingContext.tsx
export function LoadingProvider({ children, defaultVariant = "fullscreen" }) {
  const [isLoading, setIsLoading] = useState(false);
  // ...

  const handleRouteChange = useCallback(() => {
    setIsLoading(false); // pathname 변경 시에만 호출됨
  }, []);

  const startLoading = useCallback(
    (variant, message) => {
      setIsLoading(true); // 시작 pathname 추적 없음
      // ...
    },
    [defaultVariant],
  );
}
```

**🟢 해결 코드 (수정 후)**:

```typescript
// src/contexts/LoadingContext.tsx
export function LoadingProvider({ children, defaultVariant = "fullscreen" }) {
  const [isLoading, setIsLoading] = useState(false);
  const [startPathname, setStartPathname] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathname = usePathname();

  // 로딩 시작 시점의 pathname 추적 및 타임아웃 설정
  useEffect(() => {
    if (isLoading && startPathname !== null) {
      timeoutRef.current = setTimeout(() => {
        if (pathname === startPathname) {
          // 같은 페이지에 머물러 있음 → 네비게이션이 취소되었거나 리다이렉트됨
          setIsLoading(false);
          setStartPathname(null);
        }
      }, 500); // 500ms 후에도 같은 페이지면 로딩 해제
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isLoading, startPathname, pathname]);

  const startLoading = useCallback(
    (variant, message) => {
      setIsLoading(true);
      setStartPathname(pathname); // 시작 pathname 저장
      // ...
    },
    [defaultVariant, pathname],
  );
}
```

**📌 예방 가이드라인**:

1. **미들웨어 리다이렉트 고려**: 클라이언트 로딩 상태 관리 시 서버사이드 리다이렉트 가능성 고려
2. **안전 타임아웃 설정**: 네비게이션 로딩에 항상 fallback 타임아웃 구현
3. **시작/종료 상태 추적**: 비동기 작업 시 시작 상태를 저장하여 완료 여부 정확히 판단
4. **동일 경로 리다이렉트 처리**: pathname이 변경되지 않는 리다이렉트 케이스 테스트

**테스트 방법**:

```bash
# 1. 로그인 상태로 홈페이지 접속
# 2. 로그인 버튼 클릭
# 3. 스피너가 500ms 이내에 사라지는지 확인
# 4. 화면이 정상적으로 표시되는지 확인
```

---

### WEB-020: Cookie/JWT 만료 시간 불일치로 네비게이션 실패

---

        web 작성 2026.01.19. 16:45:00
        web 수정 2026.01.19. 17:30:00
        web 수정 2026.04.22. — Cookie 선삭제 로직 레거시 제거 (WEB-050 참조)

---

| 항목     | 내용                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| **파일** | `src/services/web-token-storage.ts`, `src/components/ui/NavLink.tsx`, `src/middleware.ts`                         |
| **문제** | JWT 토큰 만료 후에도 Cookie가 남아 있어 미들웨어가 사용자를 인증된 것으로 인식                                    |
| **영향** | 로그인 페이지 접근 불가, 네비게이션 시 무한 로딩 스피너                                                           |
| **상태** | ✅ 해결됨 (2026-01-19) · 🔄 Cookie 선삭제 로직 2026-04-22 제거됨 (middleware.ts exp 검증으로 대체) — WEB-050 참조 |

**원인 분석**:

1. `auth.ts`의 `saveTokens()`에서 Cookie를 7일(`max-age=604800`) 만료로 설정
2. JWT 토큰은 약 15분 만료
3. 15분 후 JWT 만료 → 하지만 Cookie는 여전히 존재 (6일 23시간 45분 남음)
4. `middleware.ts`에서 Cookie 존재 여부만 확인 (`!!accessToken`)
5. 미들웨어가 사용자를 "인증됨"으로 판단 → `/login` 접근 시 `/`로 리다이렉트
6. **핵심 문제**: `getToken()`의 Cookie 삭제는 **클라이언트**에서 실행되지만, 미들웨어는 **서버**에서 실행됨
7. 결과: 네비게이션 시작 → 미들웨어 실행(서버) → 쿠키 존재하여 리다이렉트 → 클라이언트 코드 실행 안됨 → 무한 로딩

**🔴 문제 코드 (수정 전)**:

```typescript
// src/services/auth.ts:107-118
async function saveTokens(accessToken: string, refreshToken: string) {
  await hybridAuth.saveToken({ accessToken, refreshToken });
  if (typeof document !== 'undefined') {
    const maxAge = 60 * 60 * 24 * 7; // 7일 (JWT 만료 시간과 불일치!)
    document.cookie = `access_token=${accessToken}; path=/; max-age=${maxAge}`;
  }
}

// src/middleware.ts:71-72
const accessToken = request.cookies.get('access_token')?.value;
const hasValidToken = !!accessToken; // ❌ 존재 여부만 확인, 유효성 검증 안함

// src/components/ui/NavLink.tsx - 기존 handleClick
const handleClick = useCallback(
  (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // ...
    startLoading('fullscreen', loadingMessage);
    // ❌ 토큰/쿠키 정리 없이 바로 네비게이션 시도
  },
  [...]
);
```

**🟢 해결 코드 (수정 후)**:

**1단계: web-token-storage.ts - 토큰 만료 시 Cookie 삭제**

```typescript
// getToken()에서 만료 감지 시 Cookie도 삭제
if (isTokenExpired(accessToken)) {
  // ✅ 만료 감지 즉시 Cookie 삭제 (middleware 상태 동기화)
  if (typeof document !== 'undefined') {
    document.cookie = 'access_token=; path=/; max-age=0';
  }
  // refresh 시도를 위해 토큰은 반환
  if (refreshToken) {
    return { accessToken, refreshToken };
  }
  await webTokenStorage.clearToken();
  return null;
}

// clearToken()에서도 Cookie 삭제
async clearToken(): Promise<void> {
  try {
    removeItem(TOKEN_KEY);
    removeItem(REFRESH_TOKEN_KEY);
    removeItem(TOKEN_EXPIRY_KEY);
    // ✅ 미들웨어 인증용 Cookie 삭제 추가
    if (typeof document !== 'undefined') {
      document.cookie = 'access_token=; path=/; max-age=0';
    }
  } catch (error) {
    console.error('[WebTokenStorage] 토큰 삭제 실패:', error);
  }
}
```

**2단계: NavLink.tsx - 네비게이션 전 토큰/쿠키 정리 (핵심 수정)**

```typescript
import { webTokenStorage } from "@/services/web-token-storage";

/**
 * 네비게이션 전 토큰/쿠키 정리
 * 만료된 토큰이 있으면 쿠키를 삭제하여 middleware 리다이렉트 방지
 */
async function cleanupExpiredTokenBeforeNavigation(): Promise<void> {
  try {
    // getToken()은 만료된 토큰을 감지하면 자동으로 쿠키를 삭제함
    await webTokenStorage.getToken();
  } catch {
    // 에러 무시 - 네비게이션은 계속 진행
  }
}

// NavLink handleClick - 수정 후
const handleClick = useCallback(
  async (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (target === "_blank") return;
    if (isCurrentPage) return;
    if (e.ctrlKey || e.metaKey || e.button !== 0) return;

    // ✅ 기본 Link 동작 막고 수동으로 네비게이션
    e.preventDefault();

    if (showSpinner) {
      startLoading("fullscreen", loadingMessage);
    }

    try {
      // ✅ 네비게이션 전 만료된 토큰/쿠키 정리
      await cleanupExpiredTokenBeforeNavigation();
      router.push(hrefString);
    } catch {
      stopLoading();
    }
  },
  [
    onClick,
    target,
    isCurrentPage,
    showSpinner,
    startLoading,
    stopLoading,
    loadingMessage,
    router,
    hrefString,
  ],
);

// useNavigation hook의 navigate()도 동일하게 수정
const navigate = useCallback(
  async (href: string, options: NavigateOptions = {}) => {
    const { showSpinner = true, message = "이동 중..." } = options;
    if (pathname === href) return;
    if (showSpinner) {
      startLoading("fullscreen", message);
    }
    try {
      // ✅ 네비게이션 전 만료된 토큰/쿠키 정리
      await cleanupExpiredTokenBeforeNavigation();
      router.push(href);
    } catch {
      stopLoading();
    }
  },
  [router, pathname, startLoading, stopLoading],
);
```

**해결 원리**:

```
[수정 전]
사용자 클릭 → router.push() → 미들웨어(서버, 쿠키 있음) → 리다이렉트 → 무한 로딩

[수정 후]
사용자 클릭 → e.preventDefault() → getToken()(쿠키 삭제) → router.push() → 미들웨어(서버, 쿠키 없음) → 정상 네비게이션
```

**📌 예방 가이드라인**:

1. **서버/클라이언트 실행 순서 고려**: 미들웨어는 서버에서 먼저 실행됨
2. **네비게이션 전 선제적 정리**: 클라이언트에서 쿠키 정리 후 네비게이션 시작
3. **토큰과 쿠키 수명 동기화**: JWT 만료 시간과 Cookie max-age를 일치시키거나, 만료 시 즉시 Cookie 삭제
4. **clearToken()에서 모든 저장소 삭제**: localStorage, sessionStorage, Cookie 모두 삭제

**테스트 방법**:

```bash
# 1. 로그인 후 15분 이상 대기 (또는 개발자 도구에서 토큰 만료 시간 조작)
# 2. /login 링크 클릭
# 3. 콘솔에서 "Access token이 만료되었습니다." 확인
# 4. 로그인 페이지가 정상적으로 표시되는지 확인 (리다이렉트 및 무한 로딩 없음)
```

---

### WEB-021: LoadingContext useRef 누락으로 런타임 오류

---

        web 작성 2026.01.19. 17:26:27

---

| 항목     | 내용                                                        |
| -------- | ----------------------------------------------------------- |
| **파일** | `src/contexts/LoadingContext.tsx`                           |
| **문제** | `useRef`가 import되지 않아 런타임에서 `ReferenceError` 발생 |
| **영향** | `/` 및 공통 레이아웃이 500 에러로 깨짐                      |
| **상태** | ✅ 해결됨 (2026-01-19)                                      |

**오류 메시지 (원문)**:

```
ReferenceError: useRef is not defined
```

**원인 분석**:

1. `LoadingContext`에서 `useRef`를 사용하지만 React import에 누락
2. 번들 런타임에서 `useRef`가 정의되지 않아 초기 렌더링 실패

**🔴 문제 코드 (수정 전)**:

```typescript
// src/contexts/LoadingContext.tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

const timeoutRef = useRef<NodeJS.Timeout | null>(null);
```

**🟢 해결 코드 (수정 후)**:

```typescript
// src/contexts/LoadingContext.tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

const timeoutRef = useRef<NodeJS.Timeout | null>(null);
```

**📌 예방 가이드라인**:

1. **훅 사용 시 import 확인**: `useRef`, `useMemo` 등은 자동 주입되지 않음
2. **빌드 전 타입 체크/린트**: hook 사용 누락은 `lint`/`tsc`로 사전 탐지
3. **공통 컨텍스트 변경 시 스모크 테스트**: 레이아웃/루트 렌더링 확인

**테스트 방법**:

```bash
# 1. npm run dev
# 2. /, /login 등 기본 라우트 접근
# 3. 콘솔에 ReferenceError가 없는지 확인
```

---

### WEB-023: @sentry/nextjs 모듈 누락 에러

---

        web 작성 2026.01.19. 21:15:00

---

| 항목     | 내용                                                                     |
| -------- | ------------------------------------------------------------------------ |
| **파일** | `next.config.js`                                                         |
| **문제** | `@sentry/nextjs` 패키지가 package.json에 있지만 node_modules에 설치 안됨 |
| **영향** | Next.js 서버 시작 실패, `npm run dev` 불가                               |
| **상태** | ✅ 해결됨 (2026-01-19)                                                   |

**오류 메시지 (원문)**:

```
Error: Cannot find module '@sentry/nextjs'
Require stack:
- /Users/doseunghyeon/.../teamplus-web/next.config.js
```

**원인 분석**:

1. `package.json`에 `"@sentry/nextjs": "^10.34.0"` 의존성이 선언됨
2. `next.config.js`에서 `const { withSentryConfig } = require('@sentry/nextjs')` 사용
3. `node_modules`가 없거나 불완전하여 모듈 로드 실패

**🔴 문제 상태**:

```bash
# node_modules가 없거나 의존성 누락 상태
npm run dev
# Error: Cannot find module '@sentry/nextjs'
```

**🟢 해결 방법**:

```bash
# 방법 1: 의존성 설치 (권장)
cd teamplus-web
npm install

# 방법 2: Sentry 제거 (MVP 단계에서 Sentry 불필요 시)
# next.config.js 수정
```

**Sentry 제거 방법** (필요 시):

```javascript
// next.config.js 수정 전
const { withSentryConfig } = require("@sentry/nextjs");
module.exports = withSentryConfig(nextConfig, sentryWebpackPluginOptions);

// next.config.js 수정 후
module.exports = nextConfig;
```

**📌 예방 가이드라인**:

1. **클론 후 의존성 설치**: `git clone` 후 반드시 `npm install` 실행
2. **의존성 무결성 확인**: `npm ci`로 lock 파일 기반 정확한 설치
3. **package.json 변경 시**: 새 의존성 추가 후 `npm install` 실행 필수

**테스트 방법**:

```bash
# 1. cd teamplus-web
# 2. npm install
# 3. npm run dev
# 4. http://localhost:5001 접근 확인
```

---

### WEB-022: Next.js dev 캐시 손상으로 모듈 누락/번들 에러

---

        web 작성 2026.01.19. 17:40:00
        web 재발 2026.04.11. 11:55:00 (근본 원인 추가: 훅 중복 — director 그룹)
        web 재발 2026.04.11. 22:30:00 (student 그룹에서 동일 패턴 발견·차단)

---

| 항목     | 내용                                             |
| -------- | ------------------------------------------------ |
| **파일** | `teamplus-web/.next/*`                           |
| **문제** | dev 캐시/매니페스트 손상으로 RSC 번들 모듈 누락  |
| **영향** | `/`, `/favicon.ico` 등에서 500 오류 및 빌드 실패 |
| **상태** | ✅ 해결됨 (2026-01-19)                           |

**오류 메시지 (원문)**:

```
Could not find the module ".../segment-explorer-node.js#SegmentViewNode" in the React Client Manifest
Cannot find module './vendor-chunks/@opentelemetry.js'
ENOENT: no such file or directory, open '.../.next/routes-manifest.json'
TypeError: Cannot read properties of undefined (reading 'call')
```

**원인 분석**:

1. Fast Refresh/빌드 중 오류로 `.next` 캐시가 불완전하게 생성됨
2. React Client Manifest, vendor chunk, routes manifest가 불일치/누락
3. dev 서버가 모듈을 찾지 못해 요청마다 500 발생

**🔥 재발 시(2026.04.11) 근본 원인 — 훅 중복 호출**:
로그에서 캐시 손상 **직전** `⚠ Fast Refresh had to perform a full reload` 경고가 관찰됨. 분석 결과:

- `(director)/layout.tsx` 가 `useRequireRole(['director', 'admin'])` 호출
- **동시에** 자식 page 5곳이 동일 훅을 중복 호출
  - `director/page.tsx`, `director-coaches/page.tsx`, `director-coaches/register/page.tsx`
  - `director-overseas-trips/page.tsx`, `director-overseas-trips/[id]/page.tsx`
- 훅 중복으로 redirect 경쟁·hook 순서 불일치 발생 → Fast Refresh가 보존 불가 판단 → full reload 강제 → 그 과정에서 `.next/routes-manifest.json` 포함 캐시 불일치 → ENOENT 500 연쇄

**🔴 문제 코드 (수정 전)**:

```tsx
// (director)/layout.tsx — 여기서 이미 한 번 호출
const { isLoading, isAllowed } = useRequireRole(["director", "admin"]);

// director-coaches/page.tsx — 중복! 제거 대상
export default function DirectorCoachManagePage() {
  useRequireRole(["director", "admin"]); // ❌ layout 과 중복
  // ...
}
```

**🟢 해결 코드 (수정 후)**:

```bash
# 즉시 복구
rm -rf .next && npm run dev
```

```tsx
// director-coaches/page.tsx — 중복 제거
export default function DirectorCoachManagePage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  // ...
}
```

**📌 예방 가이드라인**:

1. **인증 훅은 layout 단일 호출 원칙** (CLAUDE.md 재발 방지 MUST 규칙)
   - `useRequireRole`, `useRequireAuth`, `useAuth` 는 해당 라우트 그룹 layout.tsx 에서 **단 한 번만** 호출
   - 자식 page 에서 동일 훅 중복 호출 시 redirect 경쟁 · 도달 불가능 분기 · hook 순서 불일치
2. **Fast Refresh full reload 경고 주시**: `⚠ Fast Refresh had to perform a full reload` 가 반복되면 훅/마운트 구조에 문제 있음 → 즉시 원인 파악
3. **빌드 크래시 후 캐시 정리**: 오류가 반복되면 `.next` 삭제 후 재실행
4. **의존성 변경 시 클린 부트**: Next/React 버전 변경 후 캐시 정리
5. **오류 연쇄 시 빠른 리셋**: manifest 관련 오류는 캐시 초기화가 가장 빠름
6. **자동 검증**: `grep -rn "useRequireRole\|useRequireAuth\|useAuth(" src/app` 로 layout 외 중복 호출 주기 점검

**🔥 2026.04.11 22:30 student 그룹 재발 사례**:

- `(student)/layout.tsx`: `useRequireRole(['child', 'teen', 'admin'])` 호출 중
- 자식 page 3곳이 동일 훅 중복 호출:
  - `(student)/child/page.tsx` — `useRequireRole(['child', 'admin'])`
  - `(student)/teen/page.tsx` — `useRequireRole(['teen', 'admin'])`
  - `(student)/dashboard/page.tsx` — `useRequireRole(['teen', 'admin'])`
- 수정 방법: 각 page 를 전용 layout 으로 감싸고 page 에서 훅 제거
  - `(student)/child/layout.tsx` 신규 생성 → `useRequireRole(['child', 'admin'])`
  - page 는 `useAuth()` 만 사용 (인증 상태 확인 목적)
- `rm -rf teamplus-web/.next && npm run dev` 로 캐시 리셋 후 정상화 확인

**테스트 방법**:

```bash
# 1. rm -rf teamplus-web/.next
# 2. cd teamplus-web && npm run dev
# 3. /, /login 접근 시 500이 아닌지 확인
```

---

### WEB-024: HMR stale closure — 삭제된 모듈 상수를 참조하는 ReferenceError

---

        web 작성 2026.04.11. 12:50:00

---

| 항목     | 내용                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| **파일** | `teamplus-web/src/app/**/page.tsx` (Fast Refresh 대상)                              |
| **문제** | 리팩토링으로 삭제/개명된 모듈 최상위 상수를 이전 Fast Refresh closure가 여전히 참조 |
| **영향** | 런타임 `ReferenceError: XXX is not defined` + RouteGroupError 화면 표시             |
| **상태** | ✅ 해결됨 (2026-04-11)                                                              |

**오류 메시지 (원문)**:

```
ReferenceError: TYPE_CONFIG is not defined
    at ClassCard (page.tsx:71:18)
The above error occurred in the <ClassCard> component.
It was handled by the <ErrorBoundaryHandler> error boundary.
```

**원인 분석 (가장 중요)**:

1. 개발자가 상수 이름을 `TYPE_CONFIG` → `TYPE_ICONS` 로 변경(또는 삭제)
2. 소스 코드의 모든 참조는 새 이름으로 업데이트됨 (grep 결과 0건)
3. **그러나 Fast Refresh 는 컴포넌트 함수는 re-register 하지만 모듈 스코프 상수 변경은 반영하지 못함**
4. 장시간 실행(12시간+)된 dev-server 의 webpack HMR 가 **이전 closure 를 캐시**에 붙잡음
5. 이전 closure 가 새 render 때 여전히 `TYPE_CONFIG` 를 lookup → 런타임 ReferenceError

**정적 검증으로 코드 문제 여부 즉시 판별**:

```bash
# 에러 메시지의 symbol 이름을 코드베이스에서 검색
grep -rn "TYPE_CONFIG" teamplus-web/src

# 결과가 0 건이면 코드는 정상 → 100% HMR stale 이므로 캐시 재시작으로 해결
# 결과가 있으면 진짜 미삭제 잔재 → 해당 파일 수정 필요
```

**🔴 문제 상황 (수정 전)**:

```tsx
// 이전 버전
const TYPE_CONFIG = { LESSON: 'school', ... };
function ClassCard({ cls }) {
  const iconName = TYPE_CONFIG[cls.type] ?? 'event'; // ← 참조
}

// 리팩토링 후 (소스는 OK)
const TYPE_ICONS = { LESSON: 'school', ... };
function ClassCard({ cls }) {
  const iconName = TYPE_ICONS[cls.type] ?? 'event'; // ← OK
}

// Fast Refresh 가 ClassCard 만 업데이트하고 모듈 상수 교체는 반영 못 함
// → 런타임에서 이전 closure 가 TYPE_CONFIG 를 lookup → ReferenceError
```

**🟢 해결 방법**:

```bash
# 1) 실행 중인 dev-server 프로세스 완전 종료
ps aux | grep "next.*dev" | grep -v grep
kill <PID>

# 2) .next 캐시 완전 제거 (webpack HMR 모듈 캐시 날림)
rm -rf teamplus-web/.next

# 3) dev-server 재시작
cd teamplus-web && npm run dev
```

**📌 예방 가이드라인**:

1. **모듈 최상위 상수 이름 변경 시**: 이름 변경 / 삭제 / export 패턴 변경 후 즉시 Fast Refresh 전체 효과 확인. 이상하면 즉시 dev-server 재시작
2. **장시간 실행 금지**: 12시간 이상 dev-server 를 켜두지 말고 주기적으로 재시작 (`.next` 메모리 상의 stale 청크 누적 방지)
3. **`⚠ Fast Refresh had to perform a full reload` 경고 주시**: 이 경고가 나면 이미 HMR 가 포기한 상태 → 조만간 stale 참조 에러 유발 가능성. 즉시 캐시 리셋
4. **빠른 판별 루틴**: `ReferenceError: XXX is not defined` 발생 시 `grep -rn XXX src/` 로 코드 잔재 여부 먼저 확인. 0 건이면 100% HMR 이슈 → 재시작

**빠른 자동 진단 커맨드**:

```bash
# dev-server 프로세스 식별
ps aux | grep -iE "next.*dev|next-server" | grep -v grep

# 에러 symbol 코드 잔재 여부
grep -rn "<ERROR_SYMBOL>" teamplus-web/src

# 정상적인 복구 절차
kill <PID> && rm -rf teamplus-web/.next && cd teamplus-web && npm run dev
```

---

## 🟢 Low Priority Issues

### WEB-018: 하드코딩된 설정값

| 항목     | 내용                     |
| -------- | ------------------------ |
| **파일** | 다수                     |
| **문제** | 일부 설정값이 하드코딩됨 |
| **영향** | 환경별 설정 변경 어려움  |
| **상태** | ⬜ 미해결                |

---

## 📝 변경 이력

| 날짜       | 버전  | 변경 내용                                                               |
| ---------- | ----- | ----------------------------------------------------------------------- |
| 2026-01-19 | 1.0.0 | 초기 문서 작성                                                          |
| 2026-01-19 | 1.0.1 | WEB-011 해결 완료 (console.log 처리)                                    |
| 2026-01-19 | 1.0.2 | WEB-019 추가 및 해결 (NavLink 무한 로딩 스피너)                         |
| 2026-01-19 | 1.0.3 | WEB-020 추가 및 해결 (Cookie/JWT 만료 시간 불일치)                      |
| 2026-01-19 | 1.0.4 | WEB-020 업데이트 - NavLink.tsx 수정 내용 추가 (네비게이션 전 쿠키 정리) |
| 2026-01-19 | 1.0.5 | WEB-021 추가 및 해결 (LoadingContext useRef 누락)                       |
| 2026-01-19 | 1.0.6 | WEB-022 추가 및 해결 (Next.js dev 캐시 손상)                            |
| 2026-01-19 | 1.0.7 | WEB-023 추가 및 해결 (@sentry/nextjs 모듈 누락)                         |
| 2026-01-19 | 1.0.8 | WEB-024 추가 및 해결 (암호화 키 불일치로 로그인 실패)                   |
| 2026-01-19 | 1.0.9 | WEB-025 추가 및 해결 (미들웨어 JWT 만료 검증), WEB-016 해결됨           |
| 2026-01-20 | 1.1.0 | WEB-026 추가 및 해결 (flushSync 렌더링 사이클 충돌)                     |
| 2026-01-20 | 1.1.1 | WEB-027 추가 및 해결 (토큰 만료 시 로그인 페이지 접근 불가)             |
| 2026-01-20 | 1.1.2 | WEB-028 추가 및 해결 (페이지 전환 시 화면 깜박임) - 67+ 파일 수정       |

---

---

        web 작성 2026.01.19. 22:40:00

---

### WEB-024: 암호화 키 불일치로 로그인 복호화 실패

| 항목     | 내용                                                                     |
| -------- | ------------------------------------------------------------------------ |
| **파일** | `teamplus-web/.env.local`, `teamplus-backend/.env.local`                 |
| **문제** | Web과 Backend의 `CRYPTO_SECRET_KEY`가 불일치하여 AES-256-GCM 복호화 실패 |
| **영향** | 모든 로그인 시도가 "Invalid credentials" 에러로 실패                     |
| **상태** | ✅ 해결됨 (2026-01-19)                                                   |

**오류 메시지 (원문)**:

```
[CRYPTO] DECRYPT FAILURE
Decryption failed
UnauthorizedException: Invalid credentials
```

**원인 분석**:

1. 웹 클라이언트: `NEXT_PUBLIC_CRYPTO_SECRET_KEY=0123456789abcdef...` (테스트 키)
2. 백엔드 서버: `CRYPTO_SECRET_KEY=<REDACTED>` (실제 운영 키 — `.env.local` 에만 존재, 문서/커밋 금지)
3. 클라이언트가 테스트 키로 암호화 → 서버가 다른 키로 복호화 시도 → 실패

**🔴 문제 상태**:

```bash
# teamplus-web/.env.local
NEXT_PUBLIC_CRYPTO_SECRET_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# teamplus-backend/.env.local
CRYPTO_SECRET_KEY=<REDACTED-64-HEX-AES-256-KEY>   # 실제 값은 .env.local 에만 보관 (git 커밋 금지)
```

**🟢 해결 방법**:

```bash
# teamplus-web/.env.local - 백엔드 CRYPTO_SECRET_KEY 와 동일한 값 사용 (문서에 실제 키 기재 금지)
NEXT_PUBLIC_CRYPTO_SECRET_KEY=<REDACTED-동일-키>
```

**📌 예방 가이드라인**:

1. **환경 변수 동기화**: Web과 Backend의 암호화 키는 반드시 동일해야 함
2. **환경 변수 템플릿**: `.env.example`에 실제 키가 아닌 placeholder만 유지
3. **키 생성 일관성**: `openssl rand -hex 32`로 생성한 키를 모든 프로젝트에서 공유
4. **설정 문서화**: CLAUDE.md 또는 README에 키 동기화 필요성 명시

**테스트 방법**:

```bash
# 1. 웹 서버 재시작 (환경 변수 반영)
# 2. 로그인 시도
# 3. 백엔드 로그에서 "[CRYPTO] DECRYPT SUCCESS" 확인
# 4. 로그인 성공 응답 확인
```

---

---

        web 작성 2026.01.19. 23:10:00

---

### WEB-025: 미들웨어에서 JWT 만료 검증 누락으로 로그인 페이지 접근 불가

| 항목     | 내용                                                               |
| -------- | ------------------------------------------------------------------ |
| **파일** | `src/middleware.ts`                                                |
| **문제** | 미들웨어가 JWT 토큰 존재 여부만 확인하고 만료 여부를 검증하지 않음 |
| **영향** | 토큰 만료 후에도 `/login` 페이지 접근 시 `/`로 307 리다이렉트 발생 |
| **상태** | ✅ 해결됨 (2026-01-19)                                             |

**오류 증상**:

```
요청 URL: http://localhost:5001/login/?_rsc=vusbg
상태 코드: 307 Temporary Redirect
location: /
```

**원인 분석**:

1. 사용자의 `access_token` 쿠키가 존재함 (JWT 만료와 무관하게 Cookie는 7일간 유지)
2. `middleware.ts`에서 토큰 **존재 여부**만 확인: `const hasValidToken = !!accessToken`
3. JWT의 `exp` 클레임이 현재 시간보다 이전이어도 (만료됨) `hasValidToken = true`
4. 이미 인증된 사용자가 `/login` 접근 시 `/`로 리다이렉트하는 로직이 적용됨
5. 실제로는 토큰이 만료되어 재로그인이 필요하지만, 미들웨어가 이를 인식하지 못함

**🔴 문제 코드 (수정 전)**:

```typescript
// src/middleware.ts:70-72
const accessToken = request.cookies.get("access_token")?.value;
const hasValidToken = !!accessToken; // ❌ 토큰이 존재하면 무조건 true

// src/middleware.ts:89-93
if (isAuthPath(pathname) && hasValidToken) {
  // ❌ 만료된 토큰도 유효로 판단
  const redirectTo = request.nextUrl.searchParams.get("redirect") || "/";
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
```

**🟢 해결 코드 (수정 후)**:

```typescript
// src/middleware.ts - JWT 만료 검증 함수 추가
/**
 * JWT 토큰이 유효한지 확인 (만료 여부 체크)
 * Edge Runtime에서 동작하도록 Base64 디코딩으로 간단히 구현
 */
function isTokenValid(token: string): boolean {
  try {
    // JWT는 header.payload.signature 형식
    const parts = token.split(".");
    if (parts.length !== 3) {
      return false;
    }

    // payload 디코딩 (Base64URL → JSON)
    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = atob(base64);
    const decoded = JSON.parse(jsonPayload);

    // exp 클레임 확인 (Unix timestamp, 초 단위)
    if (!decoded.exp) {
      return false;
    }

    // 현재 시간과 비교 (5초 여유)
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp > now - 5;
  } catch {
    return false;
  }
}

// 토큰 유효성 검사 (존재 여부 + 만료 여부)
const accessToken = request.cookies.get("access_token")?.value;
const hasValidToken = accessToken ? isTokenValid(accessToken) : false;
```

**해결 원리**:

```
[수정 전]
/login 접근 → 미들웨어: 쿠키 존재 확인 → true → 리다이렉트 to /

[수정 후]
/login 접근 → 미들웨어: 쿠키 + JWT exp 확인 → 만료됨 → false → /login 정상 접근
```

**📌 예방 가이드라인**:

1. **토큰 존재 vs 유효성**: 쿠키/스토리지에 토큰이 있다고 유효한 것이 아님
2. **Edge Runtime 제약**: 미들웨어는 Edge Runtime이므로 `jose` 등 외부 라이브러리 대신 순수 JS로 구현
3. **만료 시간 여유**: 네트워크 지연을 고려해 약간의 버퍼(5초) 허용
4. **WEB-020 참조**: 클라이언트 측에서도 네비게이션 전 토큰 정리 병행 권장

**테스트 방법**:

```bash
# 1. 로그인 후 15분 이상 대기 (JWT 만료)
# 2. 브라우저 개발자 도구 > Application > Cookies에서 access_token 확인
# 3. /login 페이지로 이동 시도
# 4. 307 리다이렉트 없이 로그인 페이지가 정상 표시되는지 확인
```

---

---

        web 작성 2026.01.20. 10:15:00

---

### WEB-026: flushSync 렌더링 사이클 충돌 에러

| 항목     | 내용                                                                     |
| -------- | ------------------------------------------------------------------------ |
| **파일** | `src/contexts/LoadingContext.tsx`                                        |
| **문제** | `flushSync`가 React 렌더링 사이클 내부(useEffect)에서 호출되어 에러 발생 |
| **영향** | 콘솔에 경고 메시지, 잠재적 렌더링 불안정성                               |
| **상태** | ✅ 해결됨 (2026-01-20)                                                   |

**오류 메시지 (원문)**:

```
flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering.
Consider moving this call to a scheduler task or micro task.

Call Stack:
LoadingProvider.useCallback[startLoading] src/contexts/LoadingContext.tsx (147:16)
useNavigation.useCallback[navigate] src/components/ui/NavLink.tsx (187:9)
LoginPage.useEffect src/app/(auth)/login/page.tsx (98:7)
```

**원인 분석**:

1. 네비게이션 시 화면 깜박임(flicker) 방지를 위해 `flushSync` 도입
2. `flushSync`는 React 상태 업데이트를 즉시 DOM에 반영하도록 강제
3. 문제: `LoginPage`의 `useEffect` 내에서 `navigate()` → `startLoading()` → `flushSync()` 호출
4. `useEffect`는 React 렌더링 사이클 중 실행되므로 `flushSync` 사용 불가
5. React가 이미 렌더링 중일 때 `flushSync` 호출 시 경고 발생

**🔴 문제 코드 (수정 전)**:

```typescript
// src/contexts/LoadingContext.tsx
import { flushSync } from "react-dom";

const startLoading = useCallback(
  (variant: LoadingVariant = defaultVariant, message = "로딩 중...") => {
    // ❌ flushSync를 useEffect 내에서 호출하면 에러 발생
    flushSync(() => {
      setIsLoading(true);
      setLoadingVariant(variant);
      setLoadingMessage(message);
      setStartPathname(pathname);
    });
  },
  [defaultVariant, pathname],
);
```

**🟢 해결 코드 (수정 후)**:

```typescript
// src/contexts/LoadingContext.tsx
// flushSync 제거, queueMicrotask로 대체

const startLoading = useCallback(
  (variant: LoadingVariant = defaultVariant, message = "로딩 중...") => {
    // ✅ 즉시 상태 업데이트 (React 18+ 자동 배칭)
    // queueMicrotask로 다음 마이크로태스크에서 실행하여 렌더링 사이클 충돌 방지
    queueMicrotask(() => {
      setIsLoading(true);
      setLoadingVariant(variant);
      setLoadingMessage(message);
      setStartPathname(pathname);
    });
  },
  [defaultVariant, pathname],
);
```

**해결 원리**:

```
[flushSync 사용 시 - 문제]
useEffect 실행 중 → startLoading() → flushSync()
→ React가 이미 렌더링 중이므로 충돌 에러

[queueMicrotask 사용 시 - 해결]
useEffect 실행 중 → startLoading() → queueMicrotask에 작업 등록
→ 현재 렌더링 완료 → 마이크로태스크 실행 → setState 정상 동작
```

**📌 예방 가이드라인**:

1. **flushSync 사용 제한**: useEffect, useLayoutEffect, 이벤트 핸들러 외부에서만 사용
2. **마이크로태스크 활용**: 렌더링 사이클 충돌 시 `queueMicrotask` 또는 `Promise.resolve().then()` 사용
3. **React 18+ 자동 배칭**: 대부분의 경우 자동 배칭이 충분하므로 flushSync 필요성 재검토
4. **콘솔 경고 무시 금지**: React 렌더링 관련 경고는 잠재적 버그의 신호

**대안 비교**:
| 방법 | 장점 | 단점 | 적합한 상황 |
|------|------|------|------------|
| `flushSync` | 즉시 DOM 반영 | 렌더링 중 사용 불가 | 이벤트 핸들러에서 직접 호출 |
| `queueMicrotask` | 렌더링 사이클 안전 | 약간의 지연 | useEffect 내부 호출 |
| `setTimeout(0)` | 가장 안전 | 가장 긴 지연 | 비동기 작업 후 상태 업데이트 |

**테스트 방법**:

```bash
# 1. npm run dev 실행
# 2. 로그인 페이지에서 로그인 후 자동 리다이렉트 확인
# 3. 브라우저 콘솔에서 "flushSync was called from inside a lifecycle method" 에러가 없는지 확인
# 4. 네비게이션 시 로딩 스피너가 정상 표시되는지 확인
```

---

---

        web 작성 2026.01.20. 15:30:00

---

### WEB-027: 토큰 만료 시 로그인 페이지 접근 불가 (리다이렉트 루프)

| 항목     | 내용                                                             |
| -------- | ---------------------------------------------------------------- |
| **파일** | `src/components/ui/NavLink.tsx:129-133`, `src/middleware.ts:125` |
| **문제** | 토큰 만료 후 로그인 페이지 클릭 시 홈으로 리다이렉트됨           |
| **영향** | 사용자가 토큰 만료 후 재로그인 불가                              |
| **상태** | ✅ 해결됨 (2026-01-20)                                           |

**오류 증상**:

```
1. 사용자가 로그인 상태에서 토큰이 만료됨
2. "로그인" 버튼 클릭
3. 로그인 페이지 대신 홈페이지(localhost:5001/)로 리다이렉트됨
4. 로그인 페이지에 접근할 수 없어 재로그인 불가
```

**원인 분석**:

```
[문제 발생 순서]
1. NavLink 클릭 → handleClick 실행
2. cleanupExpiredTokenBeforeNavigation() 비동기 실행 시작 (쿠키 삭제 예정)
3. 동시에 router.push('/login') 실행 (네비게이션 시작)
4. 미들웨어(서버)가 요청 수신 - 이 시점에 쿠키가 아직 존재함!
5. 미들웨어: "쿠키 있음 + 인증 페이지 접근 → 홈으로 리다이렉트"
6. 사용자는 홈으로 강제 이동됨
7. 그제서야 비동기 쿠키 삭제 완료 (이미 늦음)

[핵심 문제]
- 비동기 함수 cleanupExpiredTokenBeforeNavigation()가 병렬로 실행됨
- router.push()가 쿠키 삭제 완료를 기다리지 않음
- 미들웨어는 서버에서 실행되므로 클라이언트 쿠키 삭제 타이밍을 알 수 없음
```

**🔴 문제 코드 (수정 전)**:

```typescript
// src/components/ui/NavLink.tsx - handleClick
const handleClick = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
  // ... 생략 ...

  // ❌ 비동기 함수가 병렬로 실행됨 (기다리지 않음)
  cleanupExpiredTokenBeforeNavigation().catch(() => {});

  // ❌ 쿠키 삭제 전에 네비게이션 시작
  router.push(hrefString, { scroll: false });
}, [...]);

// 비동기 함수 - 토큰 만료 확인 후 쿠키 삭제
async function cleanupExpiredTokenBeforeNavigation() {
  const tokenInfo = await webTokenStorage.getToken();
  if (!tokenInfo) {
    // 토큰이 만료되었거나 없으면 쿠키 삭제
    document.cookie = 'access_token=; path=/; max-age=0';
  }
}
```

**🟢 해결 코드 (수정 후)**:

```typescript
// src/components/ui/NavLink.tsx

/**
 * 인증 페이지 경로 목록
 * 이 경로로 이동 시 쿠키를 선제적으로 삭제
 */
const AUTH_PATHS = ['/login', '/register', '/signup', '/forgot-password'];

/**
 * 경로가 인증 페이지인지 확인
 */
function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => pathname.startsWith(path));
}

/**
 * 쿠키 즉시 삭제 (동기)
 * 미들웨어에서 토큰 존재 확인하기 전에 쿠키를 삭제해야 함
 */
function clearAccessTokenCookie(): void {
  if (typeof document !== 'undefined') {
    document.cookie = 'access_token=; path=/; max-age=0';
  }
}

/**
 * 네비게이션 전 쿠키 정리 (동기 버전)
 * 인증 페이지로 이동 시 쿠키를 즉시 삭제하여 middleware 리다이렉트 방지
 */
function cleanupBeforeNavigation(targetPath: string): void {
  if (isAuthPath(targetPath)) {
    clearAccessTokenCookie();
  }
}

// handleClick 내부
const handleClick = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
  // ... 생략 ...

  // ✅ 동기적으로 쿠키 삭제 (인증 페이지로 이동할 때만)
  cleanupBeforeNavigation(hrefString);

  // ✅ 쿠키 삭제 후 네비게이션 실행
  router.push(hrefString, { scroll: false });
}, [...]);
```

**해결 원리**:

```
[수정 전 - 문제]
클릭 → async cleanup 시작 → router.push() 즉시 실행
       ↓                      ↓
   (대기 없음)             미들웨어 실행 (쿠키 존재)
       ↓                      ↓
   쿠키 삭제 완료           홈으로 리다이렉트 (이미 완료)

[수정 후 - 해결]
클릭 → isAuthPath('/login')? Yes
       ↓
   clearAccessTokenCookie() (동기, 즉시 실행)
       ↓
   쿠키 삭제 완료
       ↓
   router.push('/login')
       ↓
   미들웨어 실행 (쿠키 없음)
       ↓
   로그인 페이지 정상 표시 ✅
```

**📌 예방 가이드라인**:

1. **미들웨어와 클라이언트 타이밍 이해**: 미들웨어는 서버에서 실행되므로 클라이언트 비동기 작업 완료를 기다리지 않음
2. **쿠키 삭제는 동기적으로**: 네비게이션 전 쿠키 조작은 반드시 동기 함수로 처리
3. **선제적 쿠키 삭제**: 인증 페이지로 이동할 때는 토큰 만료 여부와 관계없이 쿠키 삭제
4. **경로 기반 분기**: 모든 네비게이션이 아닌 인증 관련 경로에만 선택적으로 적용

**관련 파일**:

- `src/components/ui/NavLink.tsx` - NavLink 컴포넌트 및 useNavigation 훅
- `src/middleware.ts:125` - 인증 페이지 리다이렉트 로직
- `src/services/web-token-storage.ts` - 토큰 저장소 (비동기 함수들)

**테스트 방법**:

```bash
# 1. npm run dev 실행 (localhost:5001)
# 2. 로그인하여 토큰 획득
# 3. 브라우저 개발자 도구 → Application → Cookies에서 토큰 만료 시간 확인
# 4. 토큰 만료 후 (또는 수동으로 localStorage의 토큰 삭제)
# 5. "로그인" 버튼 클릭
# 6. 로그인 페이지가 정상 표시되는지 확인 (홈으로 리다이렉트 되지 않음)
```

---

---

        web 작성 2026.01.20. 18:45:00

---

### WEB-028: 페이지 전환 시 화면 깜박임 (Flicker) 현상

| 항목     | 내용                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------ |
| **파일** | `src/components/layout/BottomNav.tsx`, 67+ tsx 파일                                                    |
| **문제** | `active:scale-*` CSS 트랜스폼으로 인한 클릭 시 깜박임 및 `router.push`의 스크롤 동작으로 레이아웃 이동 |
| **영향** | 하단 네비게이션 클릭 시 화면이 불안정하게 보임, UX 저하                                                |
| **상태** | ✅ 해결됨 (2026-01-20)                                                                                 |

**오류 증상**:

```
1. 하단 네비게이션 버튼 클릭
2. 클릭 순간 버튼이 축소되었다가 복원됨 (scale 효과)
3. 페이지 전환 시 스크롤 위치 조정으로 화면 떨림
4. 콘솔: "Skipping auto-scroll behavior due to `position: sticky` or `position: fixed`"
```

**원인 분석**:

1. **`active:scale-*` 트랜스폼**: 클릭 시 요소를 축소(0.95~0.98)하는 CSS가 시각적 불안정 유발
2. **`router.push()` 스크롤 동작**: Next.js 기본 동작으로 페이지 상단으로 스크롤 시도
3. **sticky/fixed 요소 충돌**: 하단 네비게이션이 `position: fixed`라 스크롤 동작과 충돌

**🔴 문제 코드 (수정 전)**:

```typescript
// BottomNav.tsx - 네비게이션 핸들러
const handleNavigate = useCallback((href: string) => {
  startLoading('fullscreen', '이동 중...');
  setTimeout(() => {
    router.push(href);  // ❌ 기본 스크롤 동작으로 화면 이동
  }, 50);
}, [router, startLoading]);

// NavItem 버튼 스타일
className={cn(
  'flex flex-col items-center gap-1.5 flex-1 transition-all active:scale-95',  // ❌ scale 변환
  // ...
)}
```

```typescript
// 67+ 파일에서 사용된 패턴들
"active:scale-[0.98]";
"active:scale-[0.99]";
"active:scale-95";
"active:scale-90";
"group-active:scale-90";
```

**🟢 해결 코드 (수정 후)**:

```typescript
// BottomNav.tsx - 네비게이션 핸들러
const handleNavigate = useCallback((href: string) => {
  startLoading('fullscreen', '이동 중...');
  // ✅ scroll: false로 position: sticky/fixed 요소와의 충돌 방지
  router.push(href, { scroll: false });
}, [router, startLoading]);

// NavItem 버튼 스타일
className={cn(
  // ✅ active:scale-95 → active:brightness-95 변경 (깜박임 방지)
  'flex flex-col items-center gap-1.5 flex-1 transition-colors active:brightness-95',
  // ...
)}
```

**수정된 파일 목록** (67+ 파일):
| 디렉토리 | 주요 파일 |
|---------|---------|
| `src/app/(live)/review/` | page.tsx |
| `src/app/(menu)/more/` | page.tsx |
| `src/app/(profile)/settings/` | page.tsx |
| `src/app/(profile)/mypage/` | page.tsx |
| `src/app/(child)/gift/` | page.tsx |
| ... | 67+ 파일 전체 |

**일괄 수정 명령어**:

```bash
# 모든 active:scale-* 패턴을 active:brightness-95로 변경
for file in $(find src -name "*.tsx" -exec grep -l "active:scale" {} \;); do
  sed -i '' 's/active:scale-\[0\.98\]/active:brightness-95/g' "$file"
  sed -i '' 's/active:scale-\[0\.99\]/active:brightness-95/g' "$file"
  sed -i '' 's/active:scale-95/active:brightness-95/g' "$file"
  sed -i '' 's/active:scale-90/active:brightness-95/g' "$file"
  sed -i '' 's/group-active:scale-90/group-active:brightness-95/g' "$file"
done

# 변경 확인
grep -r "active:scale-\[0-9" src/  # 결과 없어야 함
```

**해결 원리**:

```
[active:scale 문제]
클릭 → transform: scale(0.95) → 요소 축소 → 릴리즈 → scale(1) 복원
→ 레이아웃 재계산 → 시각적 깜박임

[active:brightness 해결]
클릭 → filter: brightness(0.95) → 밝기만 변경 → 레이아웃 영향 없음
→ 부드러운 피드백

[router.push scroll 문제]
페이지 전환 → scroll: true (기본) → 스크롤 위치 조정 시도
→ fixed 요소와 충돌 → 콘솔 경고 + 화면 떨림

[scroll: false 해결]
페이지 전환 → scroll: false → 스크롤 위치 유지 → 떨림 없음
```

**📌 예방 가이드라인**:

1. **scale 트랜스폼 지양**: 클릭 피드백에는 `brightness`, `opacity`, 또는 `background-color` 변화 사용
2. **fixed/sticky 네비게이션**: `router.push(href, { scroll: false })` 옵션 필수
3. **일관성 유지**: 프로젝트 전체에서 동일한 클릭 피드백 패턴 사용
4. **Tailwind 커스텀 유틸리티**: `globals.css`에 `active:brightness-95` 관련 주석 추가됨

**테스트 방법**:

```bash
# 1. npm run dev 실행
# 2. 하단 네비게이션의 "알림" 버튼 클릭
# 3. 콘솔에서 "Skipping auto-scroll behavior" 경고 없는지 확인
# 4. 클릭 시 버튼이 축소되지 않고 밝기만 변하는지 확인
# 5. 페이지 전환 시 화면 떨림 없는지 확인
```

---

---

        [WEB] 작성 2026.03.05. 14:30:00

---

## 🟠 High Issues (최근 추가)

### WEB-033: 회원가입 API endpoint 불일치 — `POST /auth/signup` vs `POST /auth/register`

| 항목            | 내용                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| **파일**        | `src/app/(auth)/signup/page.tsx`, `src/services/auth.service.ts`                        |
| **오류 메시지** | `POST http://localhost:4001/api/v1/auth/signup 404 (Not Found)`                         |
| **원인**        | 프론트엔드가 `/auth/signup`으로 호출하지만 실제 백엔드 라우트는 `POST /auth/register`임 |
| **영향**        | 회원가입 전체 불가 (P0 Critical) — 신규 사용자 온보딩 불가                              |
| **심각도**      | 🔴 Critical                                                                             |
| **해결일**      | 2026-03-05 (Task #18 연동 수정)                                                         |

#### 🔴 잘못된 코드

```typescript
// src/services/auth.service.ts (수정 전)
export async function signup(data: SignupData) {
  const response = await apiClient.post("/auth/signup", data); // ❌ 404 발생
  return response.data;
}
```

```typescript
// 실제 백엔드 컨트롤러 (auth.controller.ts)
@Post('register')   // ✅ 실제 경로는 /auth/register
async register(@Body() dto: RegisterDto) {
  return this.authService.register(dto);
}
```

#### 🟢 올바른 코드

```typescript
// src/services/auth.service.ts (수정 후)
export async function signup(data: SignupData) {
  const response = await apiClient.post("/auth/register", data); // ✅ 실제 엔드포인트
  return response.data;
}
```

```typescript
// src/app/(auth)/signup/page.tsx — API 호출 부분도 동일하게 수정
const handleSubmit = async (formData: SignupFormData) => {
  try {
    await apiClient.post("/auth/register", {
      // ✅ /auth/register 사용
      email: formData.email,
      password: formData.password,
      name: formData.name,
      userType: formData.userType,
      phone: formData.phone,
    });
    router.push("/login?registered=true");
  } catch (error) {
    // 에러 처리
  }
};
```

#### 📌 예방 가이드라인

1. **API 호출 전 Swagger 확인**: `http://localhost:4001/api/docs`에서 실제 경로 검증
2. **중앙화된 API 상수**: 엔드포인트를 `src/lib/api-endpoints.ts`에 상수로 정의
   ```typescript
   // src/lib/api-endpoints.ts
   export const API = {
     auth: {
       register: "/auth/register", // ✅ 상수 사용으로 오타 방지
       login: "/auth/login",
       logout: "/auth/logout",
       profile: "/auth/profile",
       refreshToken: "/auth/refresh",
     },
   } as const;
   ```
3. **E2E 테스트**: 회원가입 플로우 Playwright 테스트로 endpoint 정합성 자동 검증
4. **API_SPECIFICATION.md 참조**: 변경 전 `docs/API/API_SPECIFICATION.md`에서 경로 확인

---

### WEB-034: Mock 데이터 → API 연동 전환 시 `TypeError: undefined is not iterable`

| 항목            | 내용                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/(parent)/parent/page.tsx`, `src/app/(student)/ranking/page.tsx` 외 다수                                                                                        |
| **오류 메시지** | `TypeError: undefined is not iterable (cannot read property Symbol(Symbol.iterator))`                                                                                   |
| **원인**        | Mock 데이터에서는 배열이 하드코딩되어 있었지만 실제 API 응답은 초기에 `undefined` 또는 `null`일 수 있음. `.map()`, `for...of`, 구조분해 할당 등에서 undefined 처리 누락 |
| **영향**        | 페이지 전체 렌더링 실패, 화면 빈 화면(白) 표시                                                                                                                          |
| **심각도**      | 🟠 High                                                                                                                                                                 |
| **해결일**      | 2026-03-05 (Task #12/#13 API 연동 과정에서 수정)                                                                                                                        |

#### 🔴 잘못된 코드 (Mock 데이터 시절)

```typescript
// ❌ Mock 데이터 사용 시 - 배열 보장됨
const mockClasses = [
  { id: '1', name: '초급 클래스', ... },
  { id: '2', name: '중급 클래스', ... },
];

// 절대 실패하지 않음 - 하드코딩된 배열
return (
  <ul>
    {mockClasses.map(cls => <li key={cls.id}>{cls.name}</li>)}
  </ul>
);
```

```typescript
// ❌ API 연동 후 - undefined일 때 크래시
const { data: classes } = useQuery({
  queryKey: ['classes'],
  queryFn: fetchClasses,
});

// classes가 undefined일 때 TypeError 발생
return (
  <ul>
    {classes.map(cls => <li key={cls.id}>{cls.name}</li>)}  {/* ❌ */}
  </ul>
);
```

#### 🟢 올바른 코드

```typescript
// ✅ 패턴 1: 옵셔널 체이닝 + 기본값
const { data: classes = [], isLoading, error } = useQuery({
  queryKey: ['classes'],
  queryFn: fetchClasses,
});

return (
  <ul>
    {classes.map(cls => <li key={cls.id}>{cls.name}</li>)}  {/* ✅ 기본값 [] */}
  </ul>
);
```

```typescript
// ✅ 패턴 2: 타입 가드 + 로딩/에러 상태 분기
const { data, isLoading, error } = useQuery<ClassItem[]>({
  queryKey: ['classes'],
  queryFn: fetchClasses,
});

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage message="수업 목록을 불러올 수 없습니다." />;

const classes = data ?? [];  // ✅ nullish coalescing

return (
  <ul>
    {classes.length === 0
      ? <EmptyState message="등록된 수업이 없습니다." />
      : classes.map(cls => <li key={cls.id}>{cls.name}</li>)
    }
  </ul>
);
```

```typescript
// ✅ 패턴 3: API 응답 정규화 (중첩 구조 대응)
async function fetchClasses(): Promise<ClassItem[]> {
  const response = await apiClient.get("/classes");
  // API가 { data: { classes: [] } } 또는 { classes: [] } 등 다양한 구조일 수 있음
  const raw = response.data;
  return Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.classes)
        ? raw.classes
        : []; // ✅ 항상 배열 반환 보장
}
```

```typescript
// ✅ 패턴 4: 커스텀 훅에서 안전하게 처리
function useClassList(clubId: string) {
  return useQuery({
    queryKey: ["classes", clubId],
    queryFn: () => fetchClasses(clubId),
    select: (data) => data ?? [], // ✅ select로 정규화
    placeholderData: [], // ✅ 초기값 보장
  });
}
```

#### 📌 예방 가이드라인

1. **Mock → API 전환 체크리스트**:
   - [ ] 모든 `.map()` 호출 앞에 `Array.isArray()` 또는 기본값 `?? []` 적용
   - [ ] `for...of` 루프에 `?? []` 적용
   - [ ] 구조분해 할당에 기본값 지정: `const { items = [] } = data ?? {}`
2. **TanStack Query 기본값 설정**:
   ```typescript
   const { data = [] } = useQuery(...)  // ✅ 구조분해 시 기본값
   ```
3. **API 응답 정규화**: 서비스 함수에서 항상 배열을 반환하도록 보장
4. **TypeScript strict 모드**: `tsconfig.json`에서 `"strictNullChecks": true` 필수 (현재 활성화됨)
5. **테스트**: 각 페이지별로 빈 응답(`[]`) 케이스 단위 테스트 작성

---

---

        [WEB] 작성 2026.03.05. 19:30:00

---

## 🟡 Medium Issues (검색/채팅/리뷰/코치 신규 화면)

### WEB-035: SearchEmptyQuery — 빈 검색어 제출 시 API 호출 방지

| 항목            | 내용                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| **파일**        | `src/app/(common)/search/page.tsx`                                            |
| **오류 메시지** | (에러 없음) — API 호출이 발생하지만 `q=` 빈 파라미터로 불필요한 요청 전송     |
| **원인**        | 검색 폼의 `onSubmit` 핸들러에서 빈 문자열 검증 없이 라우팅 및 API 호출 진행   |
| **영향**        | 백엔드에서 `@MinLength(2)` DTO 검증 실패 → 400 Bad Request 응답 + 사용자 혼란 |
| **심각도**      | 🟡 Medium                                                                     |
| **해결일**      | 2026-03-05 (Task #27 검색 화면 구현 시 수정)                                  |

#### 🔴 잘못된 코드

```typescript
// src/app/(common)/search/page.tsx (수정 전)
const handleSearch = (query: string) => {
  router.push(`/search/results?q=${query}`); // ❌ 빈 문자열도 라우팅
};

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  handleSearch(searchQuery); // ❌ 검증 없이 호출
};
```

#### 🟢 올바른 코드

```typescript
// src/app/(common)/search/page.tsx (수정 후)
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  const trimmed = searchQuery.trim();
  if (trimmed.length < 2) {
    setValidationError("검색어는 2자 이상 입력해 주세요."); // ✅ 클라이언트 검증
    return;
  }
  router.push(`/search/results?q=${encodeURIComponent(trimmed)}`);
};
```

#### 📌 예방 가이드라인

1. **클라이언트 검증 선행**: API 호출 전 `minLength >= 2` 검증 후 `setValidationError()` 메시지 표시
2. **인코딩 처리**: 쿼리 파라미터는 `encodeURIComponent()` 적용
3. **백엔드 일치**: `@MinLength(2)` DTO 검증과 클라이언트 검증 동기화 (BE-024 참조)

---

### WEB-036: SearchLoadingState — 검색 API 호출 중 스피너 미표시로 중복 요청 발생

| 항목            | 내용                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| **파일**        | `src/app/(common)/search/results/page.tsx`                                |
| **오류 메시지** | (에러 없음) — 검색 버튼 빠른 연타 시 동일 쿼리 API 요청 다수 발생         |
| **원인**        | `isLoading` 상태 동안 검색 버튼이 `disabled` 처리되지 않아 중복 제출 가능 |
| **영향**        | 불필요한 API 요청 증가, 레이스 컨디션으로 순서가 다른 결과 표시 가능성    |
| **심각도**      | 🟡 Medium                                                                 |
| **해결일**      | 2026-03-05 (Task #27)                                                     |

#### 🔴 잘못된 코드

```typescript
// ❌ 로딩 중 버튼 비활성화 없음
const { data, isLoading } = useQuery({
  queryKey: ['search', query],
  queryFn: () => searchApi(query),
});

return (
  <button type="submit">검색</button>  {/* ❌ 항상 클릭 가능 */}
);
```

#### 🟢 올바른 코드

```typescript
// ✅ isLoading 중 버튼 비활성화 + 스피너 표시
const { data, isLoading } = useQuery({
  queryKey: ['search', query],
  queryFn: () => searchApi(query),
  staleTime: 30_000,  // ✅ 30초 캐시로 중복 요청 방지
});

return (
  <button type="submit" disabled={isLoading}>
    {isLoading ? <Spinner className="w-4 h-4" /> : '검색'}  {/* ✅ */}
  </button>
);
```

#### 📌 예방 가이드라인

1. **모든 submit 버튼**: `disabled={isLoading || isFetching}` 패턴 적용
2. **TanStack Query staleTime**: 동일 쿼리 재요청 방지를 위해 `staleTime` 설정
3. **낙관적 업데이트**: 결과 페이지에서 이전 데이터(`placeholderData: keepPreviousData`) 유지

---

### WEB-037: ChatRoomUnauthorized — 채팅방 진입 시 401/403 응답 처리 누락

| 항목            | 내용                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/(common)/chat/[id]/page.tsx` (또는 채팅 화면 구현 위치)                                                     |
| **오류 메시지** | `Error: Request failed with status code 403`                                                                         |
| **원인**        | `GET /api/v1/chat/rooms/:id` 에서 채팅방 멤버가 아닌 사용자 접근 시 403 반환. 프론트에서 오류 처리 없이 빈 화면 표시 |
| **영향**        | 채팅방 화면 렌더링 실패, 사용자에게 에러 메시지 없음                                                                 |
| **심각도**      | 🟠 High                                                                                                              |
| **해결일**      | — (향후 채팅 화면 구현 시 적용 필요)                                                                                 |

#### 🔴 잘못된 코드

```typescript
// ❌ 403/401 오류 무처리
const { data: chatRoom } = useQuery({
  queryKey: ['chatRoom', roomId],
  queryFn: () => apiClient.get(`/chat/rooms/${roomId}`).then(r => r.data),
});

return <ChatInterface room={chatRoom} />;  // chatRoom이 undefined일 때 크래시
```

#### 🟢 올바른 코드

```typescript
// ✅ 403/401 에러 처리 + 리다이렉트
const { data: chatRoom, error } = useQuery({
  queryKey: ['chatRoom', roomId],
  queryFn: () => apiClient.get(`/chat/rooms/${roomId}`).then(r => r.data),
  retry: (failureCount, error: any) => {
    // 403/401은 재시도 불필요
    if (error?.response?.status === 403 || error?.response?.status === 401) return false;
    return failureCount < 3;
  },
});

if (error?.response?.status === 403) {
  return (
    <div className="text-center py-8">
      <p className="text-gray-500">채팅방에 접근할 수 없습니다.</p>
      <button onClick={() => router.back()}>돌아가기</button>
    </div>
  );
}
```

#### 📌 예방 가이드라인

1. **403 처리**: 채팅방 진입 전 멤버 여부 확인 또는 에러 후 사용자 안내
2. **retry 설정**: 4xx 오류는 재시도 불필요 → `retry` 콜백으로 선택적 재시도
3. **BE-021 연계**: 백엔드 `ChatRoomAccessDenied` 에러와 프론트 처리 일치

---

### WEB-038: ChatWebSocketDisconnect — WebSocket 연결 끊김 시 재연결 로직 누락

| 항목            | 내용                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/services/websocket-bridge.ts`, 채팅 화면 컴포넌트                                                                                            |
| **오류 메시지** | `WebSocket connection closed` 또는 `transport close` (Socket.io)                                                                                  |
| **원인**        | 네트워크 일시 끊김 또는 서버 재시작 후 Socket.io 클라이언트가 재연결을 시도하지만, 채팅 화면에서 연결 상태 표시 없이 메시지 전송 시도 → 전송 실패 |
| **영향**        | 채팅 메시지 전송 실패 (사용자에게 전송된 것처럼 보이지만 실제 전송 안 됨)                                                                         |
| **심각도**      | 🟠 High                                                                                                                                           |
| **해결일**      | — (채팅 화면 완성 시 적용 필요)                                                                                                                   |

#### 🔴 잘못된 코드

```typescript
// ❌ 연결 상태 확인 없이 메시지 전송
const sendMessage = (content: string) => {
  socket.emit("sendMessage", { roomId, content }); // ❌ 연결 끊겼어도 그냥 전송 시도
};
```

#### 🟢 올바른 코드

```typescript
// ✅ 연결 상태 모니터링 + 재연결 대기 후 전송
const [isConnected, setIsConnected] = useState(false);

useEffect(() => {
  socket.on('connect', () => setIsConnected(true));
  socket.on('disconnect', () => setIsConnected(false));
  socket.on('reconnect', () => {
    setIsConnected(true);
    // 재연결 시 미전송 메시지 재전송 (옵션)
  });
  return () => socket.off('connect').off('disconnect').off('reconnect');
}, [socket]);

const sendMessage = (content: string) => {
  if (!isConnected) {
    toast.error('연결이 끊겼습니다. 재연결 중입니다...');  // ✅ 사용자 안내
    return;
  }
  socket.emit('sendMessage', { roomId, content });
};

// UI에서 연결 상태 표시
{!isConnected && (
  <div className="bg-yellow-50 text-yellow-700 text-sm px-3 py-1 text-center">
    연결이 끊겼습니다. 재연결 시도 중...
  </div>
)}
```

#### 📌 예방 가이드라인

1. **연결 상태 UI 표시**: 상단 배너로 `isConnected` 상태 표시
2. **Socket.io 자동 재연결**: `reconnection: true`, `reconnectionAttempts: 5` 설정
3. **메시지 큐**: 오프라인 상태에서 작성한 메시지를 로컬 큐에 저장 후 재연결 시 전송

---

### WEB-039: ChatFileUploadPending — 파일 업로드 미구현 상태에서 UI 처리

| 항목            | 내용                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **파일**        | 채팅 화면 파일 첨부 버튼 컴포넌트                                                                                |
| **오류 메시지** | (에러 없음) — 파일 첨부 버튼 클릭 시 아무 동작 없음 또는 미구현 핸들러 호출                                      |
| **원인**        | Task #45 Multer 파일 업로드 백엔드 구현은 완료되었으나, 프론트엔드 채팅 화면에서 파일 첨부 UI가 아직 미연동 상태 |
| **영향**        | 파일 첨부 버튼 클릭 시 아무 반응 없음 → 사용자 혼란                                                              |
| **심각도**      | 🟡 Medium                                                                                                        |
| **해결일**      | — (채팅 파일 업로드 프론트 연동 시 해결 예정)                                                                    |

#### 🔴 잘못된 코드

```tsx
// ❌ 미구현 핸들러 — 클릭해도 아무것도 안 됨
<button onClick={() => {}}>
  {" "}
  {/* ❌ 빈 핸들러 */}
  <Paperclip className="w-5 h-5" />
</button>
```

#### 🟢 올바른 코드 (임시 처리)

```tsx
// ✅ 미구현 상태 명시적 처리 — disabled + 툴팁
<button
  disabled // ✅ 명시적 비활성화
  title="파일 첨부 기능은 준비 중입니다."
  className="opacity-40 cursor-not-allowed"
>
  <Paperclip className="w-5 h-5" />
</button>
```

```tsx
// ✅ 구현 완료 후 연동 패턴 (POST /api/v1/chat/upload)
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("roomId", roomId);
  const { data } = await apiClient.post("/chat/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  // 업로드된 파일 URL을 메시지로 전송
  socket.emit("sendMessage", { roomId, content: data.url, type: "file" });
};
```

#### 📌 예방 가이드라인

1. **미구현 UI**: `disabled` + `cursor-not-allowed` + 툴팁으로 명시적 처리 (빈 핸들러 금지)
2. **파일 크기 제한**: `maxSize: 10MB` 클라이언트 검증 후 업로드
3. **API 연동 참조**: `POST /api/v1/chat/upload` (Task #45 구현 완료, BE-API v1.4.1 섹션 37)

---

### WEB-040: ReviewSubmitDuplicate — 중복 리뷰 제출 시 409 응답 처리 누락

| 항목            | 내용                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **파일**        | `src/app/(parent)/review/page.tsx`                                                                                                                     |
| **오류 메시지** | `POST http://localhost:4001/api/v1/reviews 409 (Conflict)`                                                                                             |
| **원인**        | 동일 수업에 이미 리뷰를 작성한 경우 백엔드 `@@unique([classId, userId])` 제약으로 409 반환. 프론트에서 일반 에러로 처리하여 "오류가 발생했습니다" 표시 |
| **영향**        | 사용자가 중복 제출 시 원인 불명확한 에러 메시지 — UX 혼란                                                                                              |
| **심각도**      | 🟡 Medium                                                                                                                                              |
| **해결일**      | 2026-03-05 (Task #24 리뷰 시스템 구현 시 수정)                                                                                                         |

#### 🔴 잘못된 코드

```typescript
// ❌ 409 구분 없이 일반 에러로 처리
const handleSubmit = async (data: ReviewFormData) => {
  try {
    await apiClient.post("/reviews", data);
    toast.success("리뷰가 등록되었습니다.");
  } catch (error) {
    toast.error("오류가 발생했습니다. 다시 시도해주세요."); // ❌ 409도 동일 메시지
  }
};
```

#### 🟢 올바른 코드

```typescript
// ✅ 409 Conflict 별도 처리
const handleSubmit = async (data: ReviewFormData) => {
  try {
    await apiClient.post("/reviews", data);
    toast.success("리뷰가 등록되었습니다.");
    router.back();
  } catch (error: any) {
    if (error?.response?.status === 409) {
      toast.error("이미 해당 수업에 리뷰를 작성하셨습니다."); // ✅ 명확한 안내
      return;
    }
    toast.error("리뷰 등록 중 오류가 발생했습니다. 다시 시도해주세요.");
  }
};
```

```typescript
// ✅ 리뷰 작성 페이지 진입 전 이미 작성 여부 사전 확인
const { data: existingReview } = useQuery({
  queryKey: ['review', classId, userId],
  queryFn: () => apiClient.get(`/reviews?classId=${classId}`).then(r => r.data),
});

// 이미 작성한 경우 편집 화면으로 전환
if (existingReview) {
  return <ReviewEditForm review={existingReview} />;
}
```

#### 📌 예방 가이드라인

1. **HTTP 상태 코드별 처리**: 409는 "이미 존재" 패턴 → 사용자 안내 메시지 구분
2. **진입 전 사전 확인**: 리뷰 작성 페이지 진입 시 기존 리뷰 유무 확인 후 분기
3. **BE-026 연계**: 백엔드 `ReviewDuplicate` 에러와 프론트 409 처리 일치

---

### WEB-041: ReviewRatingRequired — 별점 미선택 제출 시 클라이언트 검증 누락

| 항목            | 내용                                                                                |
| --------------- | ----------------------------------------------------------------------------------- |
| **파일**        | `src/app/(parent)/review/page.tsx`                                                  |
| **오류 메시지** | (에러 없음) — 별점 0점 상태로 API 호출 → 백엔드 `@Min(1)` 검증 실패 → 400 반환      |
| **원인**        | 별점 선택을 필수 항목으로 클라이언트에서 검증하지 않아 `rating: 0` 상태로 제출 가능 |
| **영향**        | 불필요한 API 요청 + 사용자에게 generic 400 에러 표시                                |
| **심각도**      | 🟡 Medium                                                                           |
| **해결일**      | 2026-03-05 (Task #24)                                                               |

#### 🔴 잘못된 코드

```typescript
// ❌ 별점 검증 없이 바로 제출
const schema = z.object({
  comment: z.string().min(10, "최소 10자 이상 입력해주세요."),
  // ❌ rating 검증 없음 - rating: 0도 통과
});
```

#### 🟢 올바른 코드

```typescript
// ✅ Zod 스키마에 rating 필수 검증 추가
const reviewSchema = z.object({
  rating: z.number().min(1, '별점을 선택해주세요.').max(5),  // ✅ 1~5점 필수
  comment: z.string().min(10, '리뷰 내용을 10자 이상 입력해주세요.').max(500),
});

// ✅ 별점 미선택 시 UI 강조
{errors.rating && (
  <p className="text-red-500 text-sm mt-1">{errors.rating.message}</p>
)}

// ✅ 별점 컴포넌트에 에러 상태 스타일
<StarRating
  value={rating}
  onChange={setRating}
  className={errors.rating ? 'ring-2 ring-red-400 rounded' : ''}
/>
```

#### 📌 예방 가이드라인

1. **React Hook Form + Zod**: 별점, 날짜 등 필수 선택 항목도 스키마에 명시적 검증
2. **시각적 강조**: 에러 상태에서 `ring-2 ring-red-400` 으로 별점 컴포넌트 강조
3. **제출 버튼**: `disabled={rating === 0}` 패턴으로 미선택 시 제출 방지 (추가 안전장치)

---

### WEB-042: ProfileUnsavedChanges — 코치 프로필 편집 중 페이지 이탈 시 경고 미표시

| 항목            | 내용                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/(coach)/profile-edit/page.tsx`                                                               |
| **오류 메시지** | (에러 없음) — 프로필 수정 후 저장 없이 뒤로가기 클릭 시 변경사항 유실                                 |
| **원인**        | `router.back()` 또는 브라우저 뒤로가기 시 `beforeunload` 이벤트 또는 React Router 이탈 방지 로직 없음 |
| **영향**        | 코치가 장시간 편집 후 실수로 이탈 시 모든 변경사항 유실 — UX 불만 유발                                |
| **심각도**      | 🟡 Medium                                                                                             |
| **해결일**      | 2026-03-05 (Task #25 코치 프로필 편집 구현 시 수정)                                                   |

#### 🔴 잘못된 코드

```typescript
// ❌ 이탈 방지 없음
const handleBack = () => {
  router.back(); // ❌ 변경사항 유실 경고 없음
};
```

#### 🟢 올바른 코드

```typescript
// ✅ 변경사항 감지 후 이탈 경고
const { isDirty } = useFormState({ control }); // React Hook Form

// 브라우저 새로고침/탭 닫기 방지
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = ""; // ✅ 브라우저 기본 경고 표시
    }
  };
  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, [isDirty]);

// Next.js 라우팅 이탈 방지 (커스텀 확인 다이얼로그)
const handleBack = () => {
  if (isDirty) {
    const confirmed = window.confirm(
      "저장하지 않은 변경사항이 있습니다. 페이지를 나가시겠습니까?",
    );
    if (!confirmed) return;
  }
  router.back();
};
```

```typescript
// ✅ 저장 성공 후 isDirty 초기화
const handleSave = async (data: ProfileFormData) => {
  await updateProfile(data);
  reset(data); // ✅ React Hook Form reset으로 isDirty = false
  toast.success("프로필이 저장되었습니다.");
};
```

#### 📌 예방 가이드라인

1. **React Hook Form `isDirty`**: 폼 변경 감지에 `useFormState({ control }).isDirty` 활용
2. **`beforeunload`**: 브라우저 탭 닫기/새로고침 방지
3. **커스텀 다이얼로그**: `window.confirm()` 대신 `shadcn/ui AlertDialog` 사용 권장
4. **저장 후 `reset()`**: 저장 완료 시 `reset(data)` 호출로 `isDirty` 초기화 필수

---

---

        [WEB] 작성 2026.03.05. 14:55:00

---

### WEB-043: SettlementsArrayShapeMismatch — `settlements.reduce is not a function`

| 항목            | 내용                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/(admin)/settlements/page.tsx`                                                                                                                     |
| **오류 메시지** | `TypeError: settlements.reduce is not a function`                                                                                                          |
| **원인**        | `api.get('/admin/settlements')` 응답(`{ success, data: { data, pagination } }`)을 배열로 가정하고 `setSettlements(res.data)`를 실행해 객체가 상태에 저장됨 |
| **영향**        | 정산 목록 진입 즉시 런타임 에러 발생, 화면 렌더링 중단                                                                                                     |
| **심각도**      | 🟡 Medium                                                                                                                                                  |
| **해결일**      | 2026-03-05                                                                                                                                                 |

#### 🔴 잘못된 코드

```typescript
const res = await api.get<Settlement[]>("/admin/settlements");
setSettlements(res.data ?? []); // ❌ 객체({ data, pagination })가 들어올 수 있음
const totalNetAmount = settlements.reduce((sum, s) => sum + s.netAmount, 0);
```

#### 🟢 올바른 코드

```typescript
const res = await api.get<unknown>("/admin/settlements");
if (!res.success) {
  setSettlements([]);
  return;
}

const items = extractSettlementItems(res.data); // 배열/중첩 data/items 방어 처리
setSettlements(items.map(mapApiSettlement));

const settlementList = Array.isArray(settlements) ? settlements : [];
const totalNetAmount = settlementList.reduce((sum, s) => sum + s.netAmount, 0);
```

#### 📌 예방 가이드라인

1. **ApiResponse 레이어 확인**: `api.get` 결과는 `success/data/error` 래퍼임을 전제로 처리
2. **배열 연산 전 가드**: `reduce/map/filter` 전에 `Array.isArray(...)` 검증 필수
3. **응답 정규화 함수 분리**: 화면 컴포넌트에서 `extract*Items` + `mapApi*` 패턴으로 형태 불일치 흡수

---

---

        [WEB] 작성 2026.04.07. 11:30:00

---

### WEB-044: Next.js App Router 라우트 그룹 병렬 페이지 충돌로 빌드 실패

| 항목            | 내용                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/(director)/overseas-trips/`, `src/app/(parent)/overseas-trips/`, `src/app/(class)/calendar/`, `src/app/(student)/calendar/`, `src/app/(live)/review/`, `src/app/(parent)/review/`                                                              |
| **문제**        | Next.js App Router에서 라우트 그룹 `(group)`은 URL 경로에 영향을 주지 않기 때문에, 같은 폴더명을 다른 그룹에 두면 동일 URL로 해석되어 "parallel pages" 충돌이 발생함                                                                                    |
| **오류 메시지** | `You cannot have two parallel pages that resolve to the same path. Please check /(director)/overseas-trips/page and /(parent)/overseas-trips/page.`                                                                                                     |
| **원인 분석**   | PR #48 머지 시 `(parent)/overseas-trips`가 추가되어 기존 `(director)/overseas-trips`와 URL `/overseas-trips`가 충돌. 이후 PIN 디자인 커밋에서 `(class)/calendar`, `(live)/review`가 추가되면서 `(student)/calendar`, `(parent)/review`와 추가 충돌 발생 |
| **상태**        | ✅ 수정 완료                                                                                                                                                                                                                                            |

**잘못된 구조 (충돌 발생)**:

```
src/app/
├── (director)/overseas-trips/page.tsx   → /overseas-trips
├── (parent)/overseas-trips/page.tsx     → /overseas-trips  (❌ 충돌)
├── (class)/calendar/page.tsx            → /calendar
├── (student)/calendar/page.tsx          → /calendar        (❌ 충돌)
├── (live)/review/page.tsx               → /review
└── (parent)/review/page.tsx             → /review          (❌ 충돌)
```

**올바른 구조 (URL 분리)**:

```
src/app/
├── (director)/director-overseas-trips/page.tsx   → /director-overseas-trips
├── (parent)/overseas-trips/page.tsx              → /overseas-trips
├── (class)/class-calendar/page.tsx               → /class-calendar
├── (student)/calendar/page.tsx                   → /calendar
├── (live)/live-review/page.tsx                   → /live-review
└── (parent)/review/page.tsx                      → /review
```

**예방 가이드라인**:

1. **라우트 그룹은 URL에 영향 없음**: `(group)` 폴더는 레이아웃 공유 목적일 뿐, URL 세그먼트가 아님을 기억할 것
2. **새 페이지 추가 시 기존 URL 확인**: `find src/app -name "page.tsx"` 로 동일 경로가 있는지 사전 검증
3. **역할별 페이지는 prefix 사용**: `(director)/overseas-trips` 대신 `(director)/director-overseas-trips` 처럼 role 접두사를 붙이면 충돌 회피 + 의미 명확
4. **`npm run build` 정기 실행**: PR 머지 전 반드시 빌드 검증 (이 버그는 aed94d7 시점부터 존재했으나 아무도 빌드를 실행하지 않아 장기간 발견되지 못함)

---

### WEB-045: GradeBadge 컴포넌트가 참조하는 `MESSAGES.grade` 정의 누락으로 TypeScript 빌드 실패

| 항목            | 내용                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/lib/messages.ts`, `src/components/common/GradeBadge.tsx`                                                                                                                                                                                                                                                                                                                |
| **문제**        | `GradeBadge.tsx`가 `MESSAGES.grade[grade]`, `MESSAGES.grade.score(...)`, `MESSAGES.grade.evaluationCount(...)` 를 호출하지만, `messages.ts`에 `grade` 객체가 정의되어 있지 않아 TypeScript 컴파일 실패                                                                                                                                                                       |
| **오류 메시지** | `Type error: Property 'grade' does not exist on type '{ readonly save: {...}; readonly delete: {...}; ... readonly overseasTrip: {...}; }'.`                                                                                                                                                                                                                                 |
| **원인 분석**   | PIN번호 디자인 커밋(be565bf)에서 `GradeBadge.tsx`, `GradeInfo`가 새로 추가되었으나, 해당 컴포넌트가 의존하는 `MESSAGES.grade`는 `messages.ts`에 포함되지 않은 채 머지됨. origin/main, origin/develop, origin/dsh, origin/kms 어느 브랜치의 `messages.ts`에도 `grade` 키가 정의되어 있지 않았음 (즉, 해당 시점부터 `npm run build`가 실패하는 broken state로 운영되고 있었음) |
| **상태**        | ✅ 수정 완료                                                                                                                                                                                                                                                                                                                                                                 |

**잘못된 상태 (messages.ts 일부)**:

```ts
export const MESSAGES = {
  save: { ... },
  delete: { ... },
  loading: '...',
  // ... 기타 키 ...
  overseasTrip: { ... },
  // ❌ grade 키 없음
} as const;
```

**올바른 코드 (messages.ts에 grade 추가)**:

```ts
export const MESSAGES = {
  // ... 기존 키 ...
  grade: {
    1: "1등급",
    2: "2등급",
    3: "3등급",
    score: (totalScore: number, percentile: number) =>
      `총점 ${totalScore}점 · 상위 ${percentile}%`,
    evaluationCount: (count: number) => `평가 ${count}회`,
  },
} as const;
```

**예방 가이드라인**:

1. **새 컴포넌트 추가 시 의존성 검증**: `MESSAGES`, 서비스 등 외부 상수를 참조하는 경우 해당 정의가 함께 추가되는지 확인
2. **TypeScript strict mode 유지**: `noImplicitAny`, `strictNullChecks` 가 켜져 있으므로 누락된 필드는 빌드 시 즉시 에러로 잡힘 — 무시하지 말 것
3. **CI 빌드 검증 필수**: `npm run build` 가 통과하지 않는 상태에서 머지 금지. 이 버그는 `GradeBadge`가 **다른 어느 파일에서도 import되지 않은 미사용 컴포넌트**였기 때문에 런타임에서 드러나지 않았고, 오직 `tsc --noEmit` 수준의 전역 타입 체크에서만 발견됨
4. **하드코딩 금지 규칙 준수**: TEAMPLUS 컨벤션(CLAUDE.md)은 모든 UI 메시지를 `messages.ts`에 정의하도록 요구 — 인라인 하드코딩으로 우회하지 말 것

---

### WEB-046: HybridAuth 토큰 갱신 실패 — accessToken 만료 시 refreshToken까지 폐기

---

        [Web] 작성 2026.04.07. 15:30:00

---

**오류 메시지**:

```
[WebTokenStorage] Access token이 만료되었습니다.
[HybridAuth] accessToken 만료됨, null 반환
GET http://211.236.174.115:5003/api/v1/app/settings net::ERR_CONNECTION_REFUSED
```

**원인 분석**:
`hybrid-auth.ts`의 `getToken()`에서 accessToken 만료 시 refreshToken 포함 전체 토큰 데이터를 null로 반환. `web-token-storage.ts`가 갱신용으로 `{ accessToken, refreshToken }`을 정상 반환하지만, `hybrid-auth` 래퍼가 만료 체크 후 덮어씀. 결과적으로 `refreshAccessToken()`이 refreshToken을 얻지 못해 갱신 불가.

**잘못된 코드** (`hybrid-auth.ts:194-200`):

```typescript
// accessToken 만료 → refreshToken까지 함께 폐기
if (token?.accessToken && isTokenExpired(token.accessToken)) {
  return null; // ❌ refreshToken도 버려짐
}
```

**올바른 코드** (`hybrid-auth.ts:194-207`):

```typescript
if (token?.accessToken && isTokenExpired(token.accessToken)) {
  // refreshToken이 있으면 갱신 시도를 위해 토큰 데이터 유지
  if (token.refreshToken) {
    return token; // ✅ refreshToken 보존
  }
  return null; // refreshToken 없을 때만 null
}
```

**추가 수정** (`api-client.ts` request 인터셉터):
만료된 accessToken을 Authorization 헤더에 전송하지 않고, refreshToken이 있으면 즉시 갱신 시도 후 새 토큰으로 요청.

**예방 가이드라인**:

1. 토큰 저장소 계층에서 만료 체크를 중복으로 수행하지 말 것 — 하나의 계층에서만 판단
2. `getToken()`은 저장된 데이터를 있는 그대로 반환하고, 갱신 판단은 호출자(api-client)에게 위임
3. 토큰 갱신 흐름 테스트: 만료된 accessToken + 유효한 refreshToken 조합으로 갱신 성공 확인

---

---

        [Web] 작성 2026.04.16. 02:15:00

---

## 🟠 High

### WEB-049: Material Symbols `visibility: hidden` + `icons-loaded` 클래스 전환 패턴이 SPOF로 작동해 아이콘 영구 숨김 → 공지/대시보드 페이지가 비어 보임

| 항목       | 내용                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **파일**   | `src/styles/globals.css`, `src/app/layout.tsx`                                                                                                                    |
| **증상**   | 공지사항 목록에서 핀 아이콘·chevron·카테고리 아이콘이 모두 보이지 않아 "공지가 안 보인다"는 체감. 관리자 대시보드의 아이콘도 동일 현상. 하드 리프레시 후에도 재현 |
| **심각도** | 🟠 High — 전역 CSS로 모든 페이지에 영향                                                                                                                           |

**오류 메시지**: 콘솔 에러 없음 (silent UI 깨짐)

**원인 분석**:

아이콘 폰트 FOUT(Flash of Unstyled Text — 아이콘 이름 텍스트가 잠시 노출됨)을 방지하려는 의도로 다음 3단 방어를 추가했으나, 3번째 단계가 **단일 실패점(SPOF)** 이 되어 역효과 발생:

1. `font-display: block` (웹 표준, 이것만으로 FOUT 차단 충분)
2. `<link rel="preload">` 폰트 우선 로드 (로드 속도 향상 — OK)
3. ❌ `.material-symbols-outlined { visibility: hidden }` + `html.icons-loaded .material-symbols-outlined { visibility: visible }` + inline script로 `document.fonts.load().then(() => html.classList.add('icons-loaded'))`

3번째 단계가 실패하는 경로:

- `document.fonts.load()` Promise가 특정 브라우저/WebView에서 pending 유지 → fallback `setTimeout(..., 3000)` 전까지 모든 아이콘 숨김
- Next.js hydration 타이밍에 따라 inline script가 `document.fonts` 미지원 경로로 빠질 수 있음
- preload 없이 캐시 워밍이 안 된 상태에서는 3초 동안 화면 전체가 깨져 보임
- **핵심**: `font-display: block`이 이미 폰트 로드 전 텍스트를 invisible로 렌더링하므로 JS 기반 visibility 토글은 불필요한 이중 방어

**잘못된 코드** (`globals.css`):

```css
.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  /* ❌ SPOF — icons-loaded 클래스가 안 붙으면 영구 숨김 */
  visibility: hidden;
}
html.icons-loaded .material-symbols-outlined {
  visibility: visible;
}
```

`layout.tsx`:

```tsx
{
  /* ❌ 불필요한 SPOF 스크립트 */
}
<script
  dangerouslySetInnerHTML={{
    __html: `...document.fonts.load('24px "Material Symbols Outlined"').then(mark)...`,
  }}
/>;
```

**올바른 코드** (`globals.css`):

```css
@font-face {
  font-family: "Material Symbols Outlined";
  font-display: block; /* ✅ 웹 표준 — 로드 전 invisible, 로드 후 swap */
  src: url("/fonts/MaterialSymbolsOutlined.woff2") format("woff2");
}

.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  /* visibility/opacity 강제 설정 금지 — font-display가 알아서 처리 */
}
```

`layout.tsx`:

```tsx
{
  /* ✅ preload만 유지 — 로드 속도 향상, SPOF 없음 */
}
<link
  rel="preload"
  href="/fonts/MaterialSymbolsOutlined.woff2"
  as="font"
  type="font/woff2"
  crossOrigin="anonymous"
/>;
```

**예방 가이드라인 (MUST)**:

1. **웹 폰트 FOUT 방지는 CSS `font-display` 속성으로만 해결** — `block`(3초 invisible) 또는 `optional`(빠른 네트워크 전용). JS 기반 `visibility` 토글은 절대 사용 금지.
2. **아이콘 폰트에는 `font-display: block` + `<link rel="preload">` 조합이 표준**. WebView/모바일 환경에서 안전.
3. **`document.fonts.load()`에 의존하는 JS 스크립트 작성 금지** — Promise 미해결, hydration 타이밍, 브라우저 호환성 3중 실패 가능.
4. **CSS `visibility: hidden` + JS 클래스 전환 패턴 전역 적용 금지** — 클래스가 붙지 않는 경로 단 하나라도 있으면 콘텐츠 영구 숨김. 이런 로직이 꼭 필요하면 로컬 스코프(특정 컴포넌트 내부)에서만 사용하고 React state로 제어.
5. **"아이콘 이름 텍스트 노출" 수정 시 먼저 `font-display` 설정 확인** — 이미 `block`/`optional`이면 문제는 다른 곳에 있음.
6. **공지·대시보드 등 여러 아이콘 동시 사용 페이지를 테스트 지표로 활용** — 글로벌 CSS 변경 후 반드시 확인.

**검증 방법**:

```bash
# 글로벌 CSS에 의심스러운 visibility 패턴 있는지 탐색
grep -rn "visibility: hidden" teamplus-web/src/styles/
grep -rn "icons-loaded\|fonts-loaded" teamplus-web/src/
# 있으면 즉시 font-display 기반으로 대체 검토
```

---

## WEB-050: Pull-to-Refresh 인디케이터 `<main>` 내부 absolute overlay → bounce 스크롤 시 숨음

**web 작성** 2026.04.22. 00:00:00

**증상**:

- 6개 역할(admin/director/coach/parent/child/teen) 메인화면에서 당겨 새로고침 시도 시
- Pull-to-Refresh 원형 스피너가 **날짜 위(AppBar ↔ body 사이)** 에 노출되어야 하는데 보이지 않음
- 당겨도 영역이 거의 내려가지 않음

**원인**:

- 1차 구현(v2)에서 `<PullToRefreshIndicator>` 를 `<main>` 내부 `absolute top-0 left-0 right-0 z-10` overlay 로 배치
- iOS Safari / Flutter WebView 는 `-webkit-overflow-scrolling: touch` 스크롤 컨테이너에서 **bounce 스크롤 발동 시 `<main>` 전체가 translateY 로 밀림** → 인디케이터가 AppBar 뒤로 숨어 시각적으로 사라짐
- `onTouchMove` 에서 `preventDefault()` 가 `e.cancelable === false` 케이스에 무시되어 bounce 차단 실패

**잘못된 코드**:

```tsx
<main ref={mainRef} className="relative flex-1 overflow-y-auto overscroll-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}>
  <PullToRefreshIndicator ... className="absolute top-0 ..." />
  <section>날짜 / Hero</section>
</main>
```

**올바른 코드 (v3)**:

```tsx
{/* 인디케이터를 <main> 외부(flex item) 로 이동 — bounce 에 독립 */}
<PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing}
                         threshold={PULL_THRESHOLD} />
<main ref={mainRef} className="flex-1 overflow-y-auto overscroll-y-none"
      style={{ WebkitOverflowScrolling: 'touch' }}>
  <section>날짜 / Hero</section>
</main>
```

**핵심**:

- 인디케이터는 AppBar ↔ main 사이의 **독립 flex item** 으로 배치 (height 0 ↔ pullDistance 전환)
- `<main>` 은 `flex-1` 이므로 인디케이터 높이 변화에 자동 수축
- `overscroll-contain` → `overscroll-y-none` 으로 main 자체 bounce 도 차단
- 공통 컴포넌트 `PullToRefreshIndicator.tsx` + 6개 역할 대시보드 일관 적용

**검증 방법**:

```bash
# 6개 메인화면이 공통 컴포넌트를 <main> 외부에 배치하는지 확인
for f in \
  'teamplus-web/src/app/(admin)/admin/page.tsx' \
  'teamplus-web/src/app/(coach)/coach/page.tsx' \
  'teamplus-web/src/app/(director)/director/page.tsx' \
  'teamplus-web/src/app/(parent)/parent/page.tsx' \
  'teamplus-web/src/app/(student)/child/page.tsx' \
  'teamplus-web/src/app/(student)/teen/page.tsx'; do
  awk '/PullToRefreshIndicator/{i=NR} /ref={mainRef}/{m=NR} END{print (i<m?"OK":"FAIL")}' "$f"
done
# 모두 OK 여야 함
```

---

## WEB-051: AuthContext `?? 'parent'` 폴백으로 sessionStorage 오염 · 관리자 로그인 후 `/parent` 리다이렉트

**web 작성** 2026.04.22. 00:00:00

**증상**:

- 웹관리자(admin@teamplus.com) 로그인 시 `/admin` 이 아닌 **`/parent` (학부모 대시보드)** 로 리다이렉트
- 여러 번 수정해도 반복 재현

**원인 (3단 실패 체인)**:

1. 프론트 `src/types/api.ts` 의 `UserType` 이 7개 (`parent|coach|admin|child|director|teen|academy_director`) 만 정의
2. 백엔드 `UserType` enum 은 9개 (`SYSTEM|OPER|ADMIN|DIRECTOR|ACADEMY_DIRECTOR|COACH|PARENT|TEEN|CHILD`) — **프론트에 SYSTEM/OPER 누락**
3. `AuthContext.tsx:42` 의 `normalizeAuthUser` 가 `normalizeUserType(user.userType) ?? 'parent'` — **정규화 실패 시 무조건 'parent' 로 덮어씀**
4. 한 번이라도 이 폴백이 발동하면 sessionStorage `teamplus_auth_profile` 에 `userType="parent"` 가 영구 저장 → 이후 admin 재로그인해도 `useRequireRole` 경합에서 parent 판단

**잘못된 코드**:

```ts
// src/types/api.ts
export type UserType =
  | "parent"
  | "coach"
  | "admin"
  | "child"
  | "director"
  | "teen"
  | "academy_director";

// src/contexts/AuthContext.tsx:42
const normalizedUserType = normalizeUserType(user.userType) ?? "parent"; // ⚠️

// src/lib/auth-routing.ts
const DASHBOARD_PATHS: Record<UserType, string> = {
  admin: "/admin",
  parent: "/parent" /* ... */,
}; // ⚠️ system/oper 누락
```

**올바른 코드 (4개 파일 수정)**:

```ts
// 1) src/types/api.ts — 백엔드 enum 과 1:1 매핑
export type UserType =
  | "system"
  | "oper"
  | "admin"
  | "director"
  | "academy_director"
  | "coach"
  | "parent"
  | "teen"
  | "child";

// 2) src/lib/auth-routing.ts — system/oper 매핑 + PROTECTED_PATHS_BY_ROLE 추가
const DASHBOARD_PATHS: Record<UserType, string> = {
  system: "/admin",
  oper: "/admin",
  admin: "/admin",
  director: "/director",
  academy_director: "/coach",
  coach: "/coach",
  parent: "/parent",
  teen: "/teen",
  child: "/child",
};

// 3) src/contexts/AuthContext.tsx — 폴백 제거
function normalizeAuthUser(user: AuthUser): AuthUser {
  const normalizedUserType =
    normalizeUserType(user.userType) ??
    (user.userType?.toString().toLowerCase() as UserType);
  return { ...user, userType: normalizedUserType };
}

// 4) src/app/(auth)/login/page.tsx — handleSubmit 직전 이전 오염 캐시 강제 초기화
sessionStorage.removeItem("teamplus_auth_profile");
const response = await login({ email: email.trim(), password });
```

**핵심**:

- 타입 누락 → 런타임 오염 → 캐시 영구화 의 3단 실패 체인
- **폴백 값은 절대 특정 역할로 하드코딩 금지** (null 유지가 안전)
- 로그인 시도 직전 `sessionStorage.removeItem('teamplus_auth_profile')` 가드로 이전 세션 오염 차단
- 백엔드 `UserType` enum 변경(v8.6 SYSTEM/OPER 추가) 시 프론트 동기화 **필수**

**검증 방법**:

```bash
# UserType 9개 동기화 확인
grep -E "^export type UserType" teamplus-web/src/types/api.ts
# AuthContext 폴백 'parent' 하드코딩 제거 확인 (0건이어야 함)
grep -cn "?? 'parent'" teamplus-web/src/contexts/AuthContext.tsx
# 브라우저 검증: 하드 리프레시 후 admin 로그인 → /admin 도달 +
# DevTools Application > sessionStorage > teamplus_auth_profile > userType === "admin"
```

---

## WEB-053 앱 로딩 시 `UI 설정 중 오류가 발생했습니다` toast 발사

**web 작성 2026.04.22. 18:15:00**

### 오류 메시지

```
UI 설정 중 오류가 발생했습니다.
```

(앱 로딩/페이지 전환 시 warning toast 팝업)

### 원인

`src/services/bridge-error-handler.ts` 의 `ERROR_CODE_MESSAGES` 매핑에 **4개 UI 에러 코드가 미정의**된 상태에서 `native-bridge.ts` 가 해당 코드로 `handleBridgeError('ui', ...)` 를 호출 → `parseError` 가 mapping 조회 실패 → fallback 인 `MODULE_ERROR_MESSAGES.ui` (`"UI 설정 중 오류가 발생했습니다."`) + **severity `'warning'`** 으로 떨어져 toast 발사.

**누락 코드 목록** (`native-bridge.ts:1629-1751`):

- `UI_LOADING_ERROR` — `startLoading` / `stopLoading`
- `UI_SHARE_ERROR` — `ui.share`
- `UI_GET_APP_VERSION_ERROR` — `ui.getAppVersion`
- `UI_NOTIFICATION_PERMISSION_ERROR` — `ui.requestNotificationPermission`

브릿지 준비 타이밍 이슈 / WebView 미탑재 환경에서 이 함수들이 초기 실패하면 사용자에게 불필요한 경고 toast 가 노출.

### 잘못된 코드 (bridge-error-handler.ts:69~109)

```ts
const ERROR_CODE_MESSAGES: Record<string, { message: string; severity: ErrorSeverity }> = {
  UI_CONFIG_ERROR: { ... },
  UI_STATUSBAR_ERROR: { ... },
  // UI_LOADING_ERROR · UI_SHARE_ERROR · UI_GET_APP_VERSION_ERROR ·
  // UI_NOTIFICATION_PERMISSION_ERROR 누락 → fallback warning toast 발사
};

// parseError — fallback severity 가 'warning' 이라 toast 노출됨
const mapping = ERROR_CODE_MESSAGES[code] || {
  message: MODULE_ERROR_MESSAGES[module],     // "UI 설정 중 오류가 발생했습니다."
  severity: 'warning' as ErrorSeverity,       // ← 사용자에게 toast 노출
};
```

### 올바른 코드

```ts
// 1) 누락 4개 코드 추가 (모두 'info' severity — 사용자 비노출)
UI_LOADING_ERROR: { message: '로딩 표시 제어에 실패했습니다.', severity: 'info' },
UI_SHARE_ERROR: { message: '공유 기능을 사용할 수 없습니다.', severity: 'info' },
UI_GET_APP_VERSION_ERROR: { message: '앱 버전 조회에 실패했습니다.', severity: 'info' },
UI_NOTIFICATION_PERMISSION_ERROR: { message: '알림 권한 요청에 실패했습니다.', severity: 'info' },

// 2) UI 모듈 fallback severity 자체를 'info' 로 강등 (신규 코드 등록 전에도 안전)
const fallbackSeverity: ErrorSeverity = module === 'ui' ? 'info' : 'warning';
const mapping = ERROR_CODE_MESSAGES[code] || {
  message: MODULE_ERROR_MESSAGES[module],
  severity: fallbackSeverity,
};
```

### 예방 가이드

- **Bridge 에러 코드 추가 시 체크리스트**: `native-bridge.ts` 에서 새 코드를 `handleBridgeError(...)` 에 전달할 때 반드시 `bridge-error-handler.ts` 의 `ERROR_CODE_MESSAGES` 에 동시 등록
- **네이티브 UI 제어 실패는 기본 `'info'`** — 상태바/AppBar/BottomNav/공유/앱버전 같은 네이티브 제어 실패는 사용자 행동에 크리티컬하지 않으므로 toast 미노출이 원칙. 실질 화면 구성 실패인 `UI_CONFIG_ERROR` 만 `'warning'` 유지
- **`handleBridgeError('ui', ...)` 시 severity 무관 개발자 로그는 항상 기록됨** — 디버깅 시 `console.group('[BridgeError:ui] ...')` 에서 추적 가능

### 검증 방법

```bash
# 1) native-bridge.ts 가 사용하는 UI 코드 전수 확인
grep -oE "code: 'UI_[A-Z_]+_ERROR'" teamplus-web/src/services/native-bridge.ts | sort -u

# 2) 모든 코드가 ERROR_CODE_MESSAGES 에 등록되어 있는지 확인
for code in $(grep -oE "code: 'UI_[A-Z_]+_ERROR'" teamplus-web/src/services/native-bridge.ts | grep -oE "UI_[A-Z_]+_ERROR" | sort -u); do
  grep -q "^\s*${code}:" teamplus-web/src/services/bridge-error-handler.ts && echo "✅ $code" || echo "❌ $code (미등록)"
done

# 3) 브라우저 검증: 하드 리프레시 → Console 에서 `[BridgeError:ui]` 로그는 있어도
#    화면에 toast 팝업은 뜨지 않아야 함
```

---

## 📝 변경 이력 (추가)

| 날짜       | 버전  | 변경 내용                                                                                                                                                                                                       |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-05 | 2.0.0 | WEB-033~034 추가 (회원가입 endpoint, undefined iterable)                                                                                                                                                        |
| 2026-03-05 | 2.1.0 | WEB-035~042 추가 (검색 2건, 채팅 3건, 리뷰 2건, 코치 프로필 1건)                                                                                                                                                |
| 2026-03-05 | 2.2.0 | WEB-043 추가 (정산 목록 응답 shape mismatch로 reduce 런타임 오류)                                                                                                                                               |
| 2026-04-07 | 2.3.0 | WEB-044 라우트 그룹 병렬 페이지 충돌, WEB-045 MESSAGES.grade 정의 누락 추가 (kty 브랜치 정리 작업 중 발견 및 수정)                                                                                              |
| 2026-04-07 | 2.4.0 | WEB-046 추가 (HybridAuth 토큰 갱신 실패 — refreshToken 폐기 버그)                                                                                                                                               |
| 2026-04-16 | 2.5.0 | WEB-049 추가 (Material Symbols visibility SPOF — 아이콘 영구 숨김)                                                                                                                                              |
| 2026-04-22 | 2.6.0 | WEB-050 추가 (Pull-to-Refresh 인디케이터 `<main>` 내부 absolute overlay → bounce 스크롤 시 숨음), WEB-051 추가 (AuthContext `?? 'parent'` 폴백으로 sessionStorage 오염 · 관리자 로그인 후 `/parent` 리다이렉트) |
| 2026-04-22 | 2.7.0 | WEB-053 추가 (앱 로딩 시 `UI 설정 중 오류가 발생했습니다` toast — bridge-error-handler 의 4개 UI 코드 누락 + UI 모듈 fallback severity 'warning' → 'info' 강등)                                                 |

---

## WEB-054: GlobalMenu Rules of Hooks 위반 — early return 이후 useCallback 호출

**발생일**: 2026-04-29
**심각도**: 🔴 High (Drawer 메뉴를 사용하는 모든 페이지에서 ErrorBoundary 폴백 화면 표시)
**환경**: development (production 영향 가능)

### 증상

브라우저 콘솔에 React Rules of Hooks 위반 경고와 에러:

```
React has detected a change in the order of Hooks called by GlobalMenu.

   Previous render            Next render
   ------------------------------------------------------
   ...
51. useEffect                 useEffect
52. undefined                 useCallback
   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Error: Rendered more hooks than during the previous render.
    at GlobalMenu (GlobalMenu.tsx:606:41)
```

`<GlobalMenu>` 컴포넌트가 `<ErrorBoundaryHandler>` 로 잡혀 라우트 전체가 폴백 처리됨.

### 근본 원인

`teamplus-web/src/components/layout/GlobalMenu.tsx` 의 `GlobalMenu()` 함수 본체에서 `if (!mounted) return null;` (line 576) **이후**에 4개의 `useCallback` (line 606/615/625/634) 이 호출되고 있었음.

**렌더링 시퀀스**:

1. **첫 렌더** — `mounted=false` → line 576 에서 early return → hook 51개만 호출
2. **두 번째 렌더** — `setMounted(true)` 실행 → `mounted=true` → early return 통과 → hook 55개 호출

React 는 hook 의 호출 순서/개수가 렌더마다 일관되어야 한다는 Rules of Hooks 를 강제한다. 51 → 55 로 hook 개수가 늘어나면 React 내부 fiber tree 의 hook linked list 가 어긋나 `updateWorkInProgressHook` 에서 `Rendered more hooks than during the previous render` 에러 throw.

### 해결 방법

4개의 `useCallback` 을 `if (!mounted) return null;` **이전**으로 이동. mounted 와 무관한 함수 정의이므로 위치 이동에 의한 부작용 없음.

```tsx
// ✅ 수정 후
const handleMenuNavigate  = useCallback(...);
const handleQuickNavigate = useCallback(...);
const handleQuickAction   = useCallback(...);
const handleChildSelect   = useCallback(...);

if (!mounted) return null;   // hook 호출 후 early return

const roleLabel = ROLE_LABEL[userRole] ?? ROLE_LABEL.parent;
// ... 일반 변수/JSX
```

### 검증

```bash
# 1) 정적 검증: early return 이후 hook 호출 0건
grep -n "if (!mounted) return null\|use[A-Z][a-zA-Z]*(" \
  teamplus-web/src/components/layout/GlobalMenu.tsx | awk -F: '
$2 ~ /if \(!mounted\) return null/ { ret = $1; next }
ret && $1+0 > ret+0 { print "❌ POST-RETURN HOOK at line", $1 }'

# 2) 빌드: TypeScript 무오류 (teamplus-web)
cd teamplus-web && npx tsc --noEmit 2>&1 | grep GlobalMenu  # 무출력

# 3) 브라우저: ErrorBoundary 폴백 화면 사라지고 Drawer 메뉴 정상 동작
```

### 재발 방지

ESLint 룰 권장: `react-hooks/rules-of-hooks` (`eslint-plugin-react-hooks`). 활성화 시 동일 위반은 lint 단계에서 차단된다.

```jsonc
// .eslintrc
{
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
  },
}
```

### 관련 파일

- `teamplus-web/src/components/layout/GlobalMenu.tsx` — 4개 useCallback 을 early return 이전으로 이동
- 트리거 경로: `(coach)/classes-manage/page.tsx:500` 에서 GlobalMenu 가 dynamic import 로 로드되며 발생 (스택 트레이스 기준)

---

## WEB-055: 학생 대시보드 4개 미존재 엔드포인트 호출 → 콘솔 404 8회 (Strict Mode 이중 마운트)

**일시**: 2026-04-29
**플랫폼**: WEB · `(student)/dashboard/page.tsx`
**심각도**: 🟠 High (화면은 fallback 으로 동작하나 콘솔/네트워크 노이즈 + 라운드트립 4회 낭비)

### 증상

```
GET /api/v1/dashboard/student/today-class 404 (Cannot GET ...)
GET /api/v1/dashboard/student/weekly-rate 404
GET /api/v1/dashboard/student/rank 404
GET /api/v1/dashboard/student/recent-badges 404
```

React 19 Strict Mode 의 이중 마운트로 동일 4개 호출이 2회씩 = **404 에러 8개**가 콘솔에 출력. `Promise.allSettled` 로 감싸여 있어 화면 자체는 깨지지 않지만 1초 SLA · 네트워크 라운드트립 측면에서 비용 부담.

### 근본 원인

`teamplus-backend/src/dashboard/dashboard.controller.ts` (`@Controller("api/v1/dashboard")`) 에 정의된 라우트는 `calendar / coach / child-home / parent / admin / summary / activities / analytics/* / director / metrics` 뿐이며, **`student/*` 서브 라우트는 존재하지 않는다**. 프론트가 미구현 엔드포인트를 호출.

### 해결 방법

이미 존재하는 통합 엔드포인트 `GET /dashboard/child-home` 1회 호출로 통합 (라운드트립 4 → 1, 백엔드 `ChildDashboardService.getChildHome()` Redis 60s 캐시 재활용).

매핑:

- `todayClass.title/coach/startTime/endTime` → 화면 `TodayClass { id, title, time, coach, location }` 로 어댑터
- `weekRecords[]` → `weeklyRate = Math.round(present+late / total * 100)` 로 파생
- ~~`rank / badges` 는 child-home 응답에 미포함 → 안전한 기본값 (`0` / `[]`) 유지~~ → **2026-04-29 3차 보강 완료**: `ChildDashboardService.getChildHome()` 응답에 `rank`(클럽 내 30일 출석 카운트 기준 순위, `groupBy memberId` 단일 쿼리)·`recentBadges`([{ emoji, name }] 4개, `Badge.iconUrl`이 짧은 문자열이면 그대로 사용·아니면 `rarity` 별 기본 emoji 폴백) 추가. 호출은 여전히 1회 유지.

```ts
// ✅ 수정 후 (teamplus-web/src/app/(student)/dashboard/page.tsx)
const res = await api.get<{
  todayClass: {
    title: string;
    startTime: string;
    endTime: string;
    coach: string;
  } | null;
  weekRecords: { date: string; status: string }[];
}>("/dashboard/child-home");

if (res.success && res.data) {
  const d = res.data;
  setTodayClass(
    d.todayClass
      ? {
          id: "today",
          title: d.todayClass.title,
          time: `${d.todayClass.startTime}-${d.todayClass.endTime}`,
          coach: d.todayClass.coach,
          location: "",
        }
      : null,
  );
  const total = d.weekRecords?.length ?? 0;
  const present = (d.weekRecords ?? []).filter(
    (r) => r.status === "present" || r.status === "late",
  ).length;
  setWeeklyRate(total > 0 ? Math.round((present / total) * 100) : 0);
  // 2026-04-29 (3차 보강) — 백엔드 직접 매핑
  setCurrentRank(d.rank ?? 0);
  setRecentBadges(d.recentBadges ?? []);
}
```

#### 3차 보강 — 백엔드 응답 추가 필드 (2026-04-29)

```ts
// teamplus-backend/src/dashboard/child-dashboard.service.ts:getChildHome()
// Promise.all 에 2개 쿼리 추가 (단일 라운드)
this.prisma.childBadge.findMany({
  where: { childId: userId },
  orderBy: [{ displayOrder: "asc" }, { earnedAt: "desc" }],
  take: 4,
  select: { badge: { select: { name: true, iconUrl: true, rarity: true } } },
}),
this.prisma.classAttendance.groupBy({
  by: ["memberId"],
  where: {
    attendanceStatus: { in: ["present", "late"] },
    schedule: { scheduledDate: { gte: thirtyDaysAgo, lt: tomorrow } },
    member: {
      userType: { in: ["CHILD", "TEEN"] },
      clubMembers: { some: { clubId, approvalStatus: "approved" } },
    },
  },
  _count: { _all: true },
}),

// rank: 본인보다 출석 많은 학생 수 + 1
const myCount = peerAttendanceGroups.find(g => g.memberId === userId)?._count._all ?? 0;
const rank = peerAttendanceGroups.length > 0
  ? peerAttendanceGroups.filter(g => g._count._all > myCount).length + 1
  : 0;

// recentBadges: iconUrl 길이 ≤4 AND http 시작 아님 → emoji 로 사용, 외에는 rarity 폴백
const RARITY_EMOJI = { legendary: '🏆', epic: '🥇', rare: '🥈', uncommon: '🥉', common: '🎖️' };
```

### 검증

```bash
# 1) 백엔드 라우트 재확인 — student/* 부재, child-home 존재
grep -n "@Get(" teamplus-backend/src/dashboard/dashboard.controller.ts | grep -E "student|child-home"
# → @Get("child-home") 만 출력

# 2) 브라우저 콘솔 — 학생 대시보드 진입 후 404 0건
#    Network 탭: /api/v1/dashboard/child-home 1회 200, /dashboard/student/* 호출 부재
```

### 재발 방지

프론트의 `api.get('/...')` 호출 경로는 백엔드 컨트롤러 데코레이터와 1:1 매핑되어야 함. 신규 화면 작성 시:

1. `grep -rn "@Get(\"" teamplus-backend/src/<domain>/` 로 실존 경로 확인
2. **bridge-sync 스킬** 활용 — DTO/타입/엔드포인트 동기화

### 관련 파일

- `teamplus-web/src/app/(student)/dashboard/page.tsx` — fetchData 4 호출 → 1 호출 통합
- `teamplus-backend/src/dashboard/dashboard.controller.ts:187` — `@Get("child-home")` 응답 스키마 SoT
- `teamplus-backend/src/dashboard/child-dashboard.service.ts` — `getChildHome()` 비즈니스 로직

---

## WEB-057: 디렉터 일정 캘린더 `/pickup-matches` 404 (백엔드 라우트는 `/matches`)

**일시**: 2026-05-07
**플랫폼**: WEB · `src/hooks/useCalendar.ts`
**심각도**: 🟡 Medium (`.catch()` 로 swallow 되어 화면은 정상이지만 콘솔에 404 노이즈)

### 증상

```
GET http://localhost:5003/api/v1/pickup-matches 404 (Not Found)
  at useCalendar.ts:419
```

디렉터 일정(`/director-schedules`) 등 `useCalendar` 사용 페이지 진입 시 픽업 매치 조회 호출이 404. axios 응답은 `.catch(() => ({ success: false, data: undefined }))` 로 흡수되어 토너먼트만 노출되지만 콘솔에 빨간 404 가 매번 출력.

### 근본 원인

프론트는 `api.get('/pickup-matches')` 로 호출 → baseURL 합쳐 `/api/v1/pickup-matches`. 그러나 백엔드 `PickupMatchesController` 의 base URL 데코레이터는 `@Controller('api/v1/matches')` (teamplus-backend/src/pickup-matches/pickup-matches.controller.ts:66). 디렉토리 이름(`pickup-matches`)과 라우트 prefix(`matches`)가 서로 달라서 발생.

### 해결

`useCalendar.ts:419` 호출 경로를 `/matches` 로 수정. 백엔드 응답 형태가 `{ matches: RawMatch[]; total; page; limit }` 이므로 `unwrapData` 후 `Array.isArray(inner) ? inner : inner?.matches ?? []` 로 분기 처리하여 ApiDataWrapper · 페이지네이션 객체 · 순수 배열 모두 호환.

### 검증

```bash
# 1) 백엔드 라우트 prefix 확인
grep -n "@Controller" teamplus-backend/src/pickup-matches/pickup-matches.controller.ts
# → @Controller("api/v1/matches")

# 2) 라우트 살아있음 확인 (인증 가드로 401 — 즉, 라우트는 존재)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5003/api/v1/matches  # → 401
```

### 재발 방지

- 모듈 디렉토리 이름과 `@Controller()` prefix 가 다른 경우 주의.
- 신규 화면 작성 시 `grep -rn "@Controller" teamplus-backend/src/<domain>/` 로 실제 라우트 prefix 확인 후 호출. **bridge-sync** 스킬 권장.

### 관련 파일

- `teamplus-web/src/hooks/useCalendar.ts:419` — `/pickup-matches` → `/matches` 경로 수정 + `{ matches: [] }` 페이지네이션 응답 unwrap
- `teamplus-backend/src/pickup-matches/pickup-matches.controller.ts:66` — `@Controller("api/v1/matches")` prefix SoT
- `teamplus-backend/src/pickup-matches/pickup-matches.service.ts:147` — `[matches, total]` 페이지네이션 응답 형태 SoT

---

## WEB-058: 검색 페이지 `ProductCard` button-in-button DOM nesting hydration 에러

**일시**: 2026-05-07
**플랫폼**: WEB · `src/app/(common)/search/page.tsx`
**심각도**: 🟡 Medium (HTML 표준 위반 + React hydration 경고, 실사용에는 동작하나 접근성·a11y·SSR 일관성 손상)

### 증상

```
In HTML, <button> cannot be a descendant of <button>.
This will cause a hydration error.

  <ProductCard product={...}>
    <button onClick={navigate(detail)}>            ← 외곽 카드 button
      <button aria-label="찜하기">                  ← 중첩된 찜 button
```

검색 페이지(`/search`) 추천 상품 카드(`ProductCard`) 마운트 시마다 React 콘솔에 빨간 에러 + DOM nesting validation 경고 출력.

### 근본 원인

`ProductCard` 외곽이 `<button onClick={navigate(detail)}>` 으로 감싸져 있고, 그 안에 찜하기 토글 `<button aria-label="찜하기" onClick={stopPropagation}>` 이 nesting 됨. HTML 사양상 `<button>` 의 자손으로 또 다른 `<button>` 을 둘 수 없음.

### 해결

외곽 카드 컨테이너를 `<div role="button" tabIndex={0} onClick onKeyDown>` 로 교체. 키보드 접근성을 유지하기 위해 `Enter` / `Space` 키 입력 시 상세 페이지로 이동하도록 `onKeyDown` 처리 추가. 내부 찜하기 `<button>` 은 `stopPropagation` 유지하여 카드 클릭과 분리. `focus-visible:ring-2 focus-visible:ring-ice-500` 으로 키보드 포커스 표시.

### 검증

```bash
# 변경 후 콘솔에 button-in-button 경고 사라졌는지 확인
# DevTools Console → /search 진입 → "<button> cannot be a descendant of <button>" 없음
```

### 재발 방지

- 클릭 가능 카드를 `<button>` 으로 감쌀 때 내부에 또 다른 인터랙션 요소(`<button>`, `<a>`, `<input>`)를 두지 않을 것.
- 두 가지 인터랙션이 필요하면 외곽을 `<div role="button" tabIndex={0}>` + `onKeyDown` 으로, 내부는 정상 `<button>` 유지.
- 또는 외곽을 `<div>` 만 두고 내부에 `<a>` / `<button>` 을 명시적으로 배치.

### 관련 파일

- `teamplus-web/src/app/(common)/search/page.tsx:101-145` — `ProductCard` 외곽 `<button>` → `<div role="button" tabIndex={0} onClick onKeyDown>` 교체

---

---

        [WEB] 작성 2026.05.29. 22:07:37

---

## WEB-066: match-manage `matches.forEach is not a function` — 페이지네이션 응답을 배열로 오인

| 항목            | 내용                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/(admin)/match-manage/page.tsx`                                                                                |
| **오류 메시지** | `TypeError: matches.forEach is not a function` (at `RegisteredMatchList.useMemo`)                                       |
| **원인**        | 백엔드 `GET /api/v1/matches` 는 `{ total, page, limit, items }` 페이지네이션 객체를 반환하는데, `setMatches(res.data)` 로 객체 전체를 상태에 저장 → `matches` 가 배열이 아닌 객체가 되어 `.forEach`/`.filter`/`.length` 실패 |
| **영향**        | 매치 관리(`/match-manage`) 진입 즉시 런타임 에러, ErrorBoundary 폴백 렌더링                                            |
| **심각도**      | 🟡 Medium                                                                                                              |
| **해결일**      | 2026-05-29                                                                                                             |

### 🔴 잘못된 코드

```typescript
const res = await api.get<Match[]>('/matches');
setMatches(res.data ?? []); // ❌ res.data 는 { total, page, limit, items } 객체
// ...
matches.forEach((m) => { ... }); // 💥 forEach is not a function
```

### 🟢 올바른 코드

```typescript
// 응답 형태 방어 헬퍼 — 배열 / { items } / { data } / { matches } 모두 흡수
function extractMatchItems(payload: unknown): Match[] {
  if (Array.isArray(payload)) return payload as Match[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['items', 'data', 'matches'] as const) {
      if (Array.isArray(obj[key])) return obj[key] as Match[];
    }
  }
  return [];
}

const res = await api.get<unknown>('/matches');
setMatches(res.success ? extractMatchItems(res.data) : []);

// useMemo 이중 방어
const safeMatches = Array.isArray(matches) ? matches : [];
safeMatches.forEach((m) => { ... });
```

### 📌 예방 가이드라인

1. **응답 shape 확인**: 백엔드 list 엔드포인트는 대부분 `{ items, total, page, limit }` 페이지네이션 래퍼. 배열로 단정 금지.
2. **배열 연산 전 가드**: `forEach/map/filter/reduce` 전에 `Array.isArray()` 또는 정규화 헬퍼 필수 (WEB-034·WEB-043 동일 계열).
3. **정규화 함수 분리**: `extract*Items` 패턴으로 형태 불일치 흡수.

### 관련 파일

- `teamplus-web/src/app/(admin)/match-manage/page.tsx` — `extractMatchItems` 헬퍼 추가 · `loadMatches` items 추출 · `RegisteredMatchList` useMemo `safeMatches` 가드

---

## WEB-067: match-manage `LevelBadge` — `Cannot read properties of undefined (reading 'bg')`

| 항목            | 내용                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/app/(admin)/match-manage/page.tsx`                                                                                |
| **오류 메시지** | `TypeError: Cannot read properties of undefined (reading 'bg')` (at `LevelBadge`)                                       |
| **원인**        | `LevelBadge` config 키가 영문(`beginner`/`intermediate`/`advanced`/`all`)뿐인데, 백엔드 `PickupMatch.level` 은 한글 String(`초급`/`중급`/`고급`)을 반환 → `config['초급']` = `undefined` → 방어 없이 `.bg` 접근하여 크래시 |
| **영향**        | 매치 목록 카드 렌더링 시 즉시 런타임 에러 (WEB-066 해결 후 노출됨)                                                     |
| **심각도**      | 🟡 Medium                                                                                                              |
| **해결일**      | 2026-05-29                                                                                                             |

### 🔴 잘못된 코드

```typescript
const config = { beginner: {...}, intermediate: {...}, advanced: {...}, all: {...} };
const c = config[level]; // ❌ level='초급' → undefined
return <span className={`... ${c.bg} ${c.text}`}>; // 💥 c.bg
```

### 🟢 올바른 코드

```typescript
// 영문 키(레거시/타입 호환) + 한글 키(백엔드 실제 값) 모두 매핑
const config: Record<string, { bg: string; text: string; label: string }> = {
  beginner: {...}, intermediate: {...}, advanced: {...}, all: {...},
  초급: {...}, 중급: {...}, 고급: {...}, 전체: {...},
};
// 미지의 값에도 폴백 (StatusBadge 와 동일 패턴)
const c = config[level] ?? {
  bg: 'bg-wline-2 dark:bg-rink-700',
  text: 'text-wtext-2 dark:text-rink-100',
  label: level || '전체',
};
```

### 📌 예방 가이드라인

1. **lookup map 접근 시 항상 폴백**: `config[key] ?? FALLBACK` — 같은 파일 `StatusBadge` 가 이미 적용한 패턴을 모든 배지에 일관 적용.
2. **타입 vs 런타임 값 일치 확인**: 프론트 유니온 타입(`'beginner'|...`)이 백엔드 실제 값(한글 String)과 다르면 런타임 크래시. DB schema 주석(`level String // 초급|중급|고급`)으로 실제 값 검증.
3. **백엔드 enum/라벨은 한글 String 가능성 상존**: 영문 키만 가정하지 말 것.

### 관련 파일

- `teamplus-web/src/app/(admin)/match-manage/page.tsx` — `LevelBadge` config 에 한글 키 추가 + `?? 폴백` 방어

---

## WEB-068: signup 본인인증 `@portone/browser-sdk/v2` — `Module not found: Can't resolve`

| 항목            | 내용                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **파일**        | `src/components/identity/IdentityVerifyInput.tsx:153` (동적 import) → import trace `src/app/(auth)/signup/page.tsx`     |
| **오류 메시지** | `Module not found: Can't resolve '@portone/browser-sdk/v2'` (webpack/Fast Refresh) · `TS2307: Cannot find module '@portone/browser-sdk/v2'` (tsc) |
| **원인**        | `@portone/browser-sdk@^0.1.8` 이 `package.json` + `package-lock.json` 에 선언·잠겨 있으나 **`node_modules` 에 미설치** (의존성 추가 후 `npm install` 누락 / node_modules 동기화 깨짐). 본인인증 SDK 를 동적 import 하는 회원가입 라우트가 컴파일될 때만 노출. **코드는 정상** — 순수 설치 누락. |
| **영향**        | 회원가입(본인인증) 라우트 컴파일 실패 → Fast Refresh 경고 + 해당 페이지 500 가능. 다른 라우트는 정상(on-demand 컴파일이라 signup 진입 전엔 미노출). |
| **심각도**      | 🟡 Medium                                                                                                              |
| **해결일**      | 2026-05-30                                                                                                             |

### 🟢 해결

```bash
cd teamplus-web && npm install      # lockfile(0.1.8) 기준 누락분 설치 — 코드 변경 없음
```

기본 npm 캐시(`~/.npm/_cacache`) **EACCES 권한 오류**(root 소유 파일 추정) 발생 시 별도 캐시로 우회:

```bash
npm install --cache /tmp/npm-cache-teamplus --no-audit --no-fund
# 검증: ls node_modules/@portone/browser-sdk/dist/v2 && node -e "require.resolve('@portone/browser-sdk/v2')"
```

> 본 SDK 는 `await import('@portone/browser-sdk/v2')` 동적 import 로 초기 번들 영향을 최소화한다(KG 통합인증창). CSP(`next.config.js`)에는 이미 `cdn.portone.io`/`*.portone.io` 가 등록되어 있다.

### 재발 방지

- 의존성 추가 PR 직후 **`node_modules` 동기화 확인** (CI 에서 `npm ci` 로 lockfile 정합성 강제 권장).
- `npm install` 이 캐시 권한으로 실패하면 코드 문제로 오인하지 말 것 — `--cache <쓰기 가능 경로>` 우회.

### 관련 파일

- `teamplus-web/src/components/identity/IdentityVerifyInput.tsx` — PortOne V2 SDK 동적 import 소비처
- `teamplus-web/package.json` · `package-lock.json` — `@portone/browser-sdk@^0.1.8` 선언/잠금 (정상)

---------------------------------------------------------------
        [Web · teamplus-home] Written 2026.06.18. 14:28:06
---

## WEB-069: [teamplus-home] server-logger 초기화 ENOENT — log/current 끊긴 심볼릭 링크(cross-machine 절대경로)

### Error Message

```
[server-logger] 초기화 실패: Error: ENOENT: no such file or directory, open '.../teamplus-home/log/current/access.log'
    at ensureFile (src/lib/server-log/file-path.util.ts:179:16)
    at updateCurrentSymlink (src/lib/server-log/file-path.util.ts:238:5)
    at updateAllCurrentSymlinks (...) at initServerLogger (src/lib/server-log/server-logger.ts:82)
```

### Cause Analysis

- `log/current/*.log` 가 **다른 머신 절대경로**(`/Users/doseunghyeon/.../log/2026/06/13/access.log`)를 가리키는 **끊긴 심볼릭 링크**였다(절대경로 심링크가 git 추적되어 머신 이동 시 깨짐).
- `updateCurrentSymlink` 의 `if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath)` — **`existsSync` 는 끊긴 심볼릭 링크를 `false` 로 평가**해 unlink 가 누락됨.
- 이어진 `symlinkSync(target, linkPath)` 가 기존(끊긴) 링크로 EEXIST → catch 폴백 `ensureFile(linkPath)` → `openSync(linkPath, "a")` 가 끊긴 링크에서 **ENOENT** 로 실패.

### Incorrect Code

```typescript
// updateCurrentSymlink
try { if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath); } catch {}
// ensureFile
if (!fs.existsSync(filePath)) { const fd = fs.openSync(filePath, "a", FILE_MODE); fs.closeSync(fd); }
```

### Correct Code

```typescript
// updateCurrentSymlink — lstatSync 로 끊긴 심링크도 감지 후 제거
try { fs.lstatSync(linkPath); fs.unlinkSync(linkPath); } catch {}
// ensureFile — openSync 전에 끊긴 심링크 제거
try {
  if (fs.lstatSync(filePath).isSymbolicLink() && !fs.existsSync(filePath)) fs.unlinkSync(filePath);
} catch {}
if (!fs.existsSync(filePath)) { const fd = fs.openSync(filePath, "a", FILE_MODE); fs.closeSync(fd); }
```

즉시 조치: 끊긴 `log/current` 제거 → 코드가 올바른 로컬 경로로 재생성. 검증: `POST /api/log` → 200, `log/current` 심링크가 현재 머신 경로로 재생성, 끊긴 링크 0, ENOENT 재발 없음.

### Prevention Guide

- `log/` 은 `.gitignore`(`/log/`) 대상이나 **과거 추적분(절대경로 심링크) 잔재**가 cross-machine 재발 유발. 추적분 정리 검토(`git rm -r --cached teamplus-home/log`).
- 파일 존재 확인 시 **끊긴 심볼릭 링크 가능성**이 있으면 `existsSync` 대신 `lstatSync` 사용.

### 관련 파일

- `teamplus-home/src/lib/server-log/file-path.util.ts` — `ensureFile`(끊긴 심링크 제거) · `updateCurrentSymlink`(lstatSync unlink)
- `teamplus-home/src/lib/server-log/server-logger.ts:82` — `initServerLogger` → `updateAllCurrentSymlinks`

---

## 🟠 WEB-070: [Android 앱] 라우트 전환 후 거대 하단 여백 — WebView 스크롤 범위(scrollHeight) 잔존 버그

### 발생 환경

- Android 앱(flutter_inappwebview 6) 내 WebView 전용 — 웹 브라우저·iOS 미발생
- 재현: 세로로 긴 페이지 → 짧은 페이지(예: `/team/[id]`)로 SPA 라우트 전환

### 증상

- 스크롤을 끝까지 내리면 **콘텐츠가 전부 화면 밖으로 나갈 만큼** 하단에 빈 스크롤 영역 발생 (화면 높이 이상)
- chrome://inspect(DevTools) 부착 시 증상이 사라지는 경우가 있어 관측 자체가 어려움

### 원인 분석

- 실기기 계측(2026-07-02): DOM 최심부 bottom **1,687px** vs `main.scrollHeight` **3,061px** — DOM/CSS/padding 은 전부 정상인데 스크롤 범위만 이전 페이지 값 수준으로 잔존
- Android WebView 렌더러가 SPA 전환으로 새로 생긴 스크롤 컨테이너(`[data-mobile-shell] > main`)의 스크롤 지오메트리를 재계산하지 않는 버그. 강제 reflow(overflow 토글) 1회로 즉시 정상화(3,061 → 1,817px)됨을 확인
- ⚠️ 오진 주의: `MobileContainer` 의 `[&>main]:pb-30`(120px 잉여 여백, `claudedocs/mobilecontainer-pb30-global-reduction-plan.md`)과 증상이 비슷해 보이지만 **무관** — pb-30 은 최대 ~230px, 본 버그는 화면 높이 이상

### 해결 (워크어라운드)

- `AndroidScrollGeometryFix` 전역 컴포넌트: pathname 변경 시 스크롤 컨테이너 출현 대기 → double RAF 후 `overflow: hidden` 토글 → 동기 reflow → 복원 (+700ms 후 1회 추가). Android 네이티브 환경에서만 동작

### 진단 방법 (재발/유사 증상 시)

- WebView 디버깅은 **debug 빌드에서만** 가능 (`webview_screen.dart` `isInspectable: kDebugMode`)
- Console에서 `main.scrollHeight` vs 자식 요소 bottom 최대값 비교 → scrollHeight 만 크면 본 버그

### 관련 파일

- `teamplus-web/src/components/providers/AndroidScrollGeometryFix.tsx` — 워크어라운드 본체
- `teamplus-web/src/components/providers/ClientProviders.tsx` — `BridgeErrorHandlerSetup` 에 마운트

---

## 🔗 관련 링크

---

**Last Updated**: 2026-05-14 (실측 SOT 동기화)

- [Error 인덱스](../)
- [Backend 에러](../backend/backend-errors.md)
- [App 에러](../app/app-errors.md)
- [Admin 에러](../admin/admin-errors.md)


---

**SOT v9.4 동기화 확인 (2026-05-23)** — 본 문서는 현재 실측 환경에서 유효: Backend **72 module·152 model·81 controller·773 routes** / Web **245 pages·71 hooks·352 컴포넌트·MESSAGES 200** / Admin **86 pages·38 컴포넌트** / App **211 dart·29 features·16 Bridge** / **Home 13 pages 신규 인지**. 디자인 위반 0 유지(헤더 blur 예외 1건).
