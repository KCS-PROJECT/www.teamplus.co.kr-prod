# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

TEAMPLUS Web은 아이스하키 클럽 통합 관리 플랫폼의 PWA 프론트엔드입니다. Flutter 앱 내 WebView(80-85%)로 임베드되거나 독립 웹 브라우저(15-20%)에서 실행되는 하이브리드 아키텍처입니다.

**Tech Stack**: Next.js 15.5 (App Router) · React 19 · TypeScript 5.7 · Tailwind CSS 3.4 · Axios · Socket.IO Client · DOMPurify · Sentry (비활성 상태)

**⚠️ 실측 확인 (2026-04-21)**: **TanStack Query 제거됨** (v8.5 일시 도입 → 2026-04-21 전체 롤백). 모든 데이터 페칭은 `useState + useCallback + useEffect` 커스텀 훅 패턴으로 통일. React Hook Form / Zod / Redux / Zustand 미설치 (외부 상태 관리 라이브러리 없음).

**규모** (2026-04-19 실측): **217 pages** · **28 services** · **47 hooks** (index.ts 제외) · 5 contexts · **296 컴포넌트** · 11 lib 유틸 · 12 E2E spec (63 tests 포함 axe-a11y 11 tests)

**신규 services (v8.5)**: `api-lifecycle.ts` (전처리/후처리 훅 레지스트리 + `PUBLIC_API_PATTERNS` + `AuthRequiredError`) · `api-lifecycle-defaults.ts` (1초 SLA 모니터링 + 401 자동 로그인 유도) · `components/auth/UnauthorizedToastListener.tsx` + `AuthenticatedLink.tsx`

**7개 사용자 역할**: admin, director, **academy_director**, coach, parent, teen, child (ACADEMY_DIRECTOR는 `(coach)` 그룹 공용 사용)

---

## Commands

```bash
npm run dev              # 개발 서버 (포트 5001)
npm run build            # 프로덕션 빌드
npm start                # 프로덕션 서버 (포트 5001)
npm run lint             # ESLint 검사
npm test                 # Jest 테스트
npm test -- src/__tests__/components/ui/Button.test.tsx  # 단일 파일
npm run test:watch       # watch 모드
npm run test:coverage    # 커버리지 (임계값 70%)
```

**Backend (포트 5003)가 필수**: `cd ../teamplus-backend && docker-compose up -d && npm run start:dev`

---

## Architecture

### Hybrid API 통신 (핵심 패턴)

모든 API 호출은 런타임 환경에 따라 자동 분기됩니다:

```
웹 브라우저:    Web → Axios → Backend (localhost:5003)
Flutter WebView: Web → NativeBridge → Flutter HTTP → Backend
```

- `src/services/api-client.ts`: 통합 API 클라이언트. `isNativeApp()` 기반 경로 자동 선택. 토큰 자동 첨부, 만료 5분 전 선제 갱신, 401시 singleton refresh promise로 race condition 방지
- `src/services/native-bridge.ts`: Flutter WebView JS Bridge. 모듈: `auth`, `identity`, `qr`, `navigation`, `payment`, `ui`, `api`
- `src/services/hybrid-auth.ts`: 토큰 저장소 추상화 (Native: FlutterBridge, Web: localStorage → sessionStorage → in-memory 폴백)
- `src/lib/environment.ts`: 환경 감지 (`'native' | 'web' | 'server'`). User-Agent(`teamplusApp`/`Flutter`), `window.FlutterBridge`, `window.flutter_inappwebview` 확인

### Provider 계층 구조 (ClientProviders.tsx)

> **풀스크린 로더 타이밍·7중 안전망 정책**: [`docs/Design/LOADING_TIMING_POLICY.md`](../docs/Design/LOADING_TIMING_POLICY.md) (**v21, 2026-08-08**) — `MIN_SHOW_DURATION 300ms` · `SOFT_READY_FALLBACK 2500ms`(구 SAFETY_HOLD 재설계 복원) · `MAX_WAIT 5000ms` · `fade-out 150ms` · **`usePageReady` 232/232 (100%) 커버리지 의무** · 이중 로더 금지 · §11 사용자 직접 지시 SoT (데이터+셋팅 완료 전 hide 절대 금지).

```
LoadingProvider          ← 페이지 전환 스피너 (v21 (2026-08-08) — usePageReady 100% 커버리지 의무 + SOFT_READY_FALLBACK 2500ms · 데이터+셋팅 완료 전 hide 절대 금지 — LOADING_TIMING_POLICY.md §11 참조)
  ThemeProvider          ← light/dark/system 테마
    AppSettingsProvider  ← /api/v1/app/settings (5분 캐시)
      ModalProvider      ← 전역 모달
        ToastProvider    ← 토스트 알림
          BridgeErrorHandlerSetup  ← 브릿지 에러 → Toast 연동
            OfflineIndicator       ← 웹 전용 오프라인 배너
            Suspense
              AuthProvider         ← 인증 상태 (sessionStorage 캐시)
                NotificationProvider  ← 알림 목록/미읽음 카운트
                  {children}
                  GlobalEventPopup
```

### 인증 시스템 (이중 레이어)

**서버사이드** (`src/middleware.ts`):

- JWT 쿠키(`access_token`) base64 디코딩 → 만료/역할 검증
- `auth-routing.ts`의 RBAC 매핑 사용 (admin은 모든 경로 접근 가능)
- `matchesPath()`: `/admin`이 `/admin-schedules`와 매칭되는 버그 방지
- 보안 헤더: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP (프로덕션)

**클라이언트사이드** (`src/contexts/AuthContext.tsx`):

- `useRequireAuth()`: 인증 필요 페이지 가드
- `useRequireRole(['parent', 'coach'])`: 역할 기반 접근 제어
- `useGuestOnly()`: 비로그인 전용 (로그인 페이지 등)
- `teamplus:token-expired` 커스텀 이벤트로 자동 로그아웃

### RBAC 경로 매핑 (auth-routing.ts — Single Source of Truth)

```typescript
DASHBOARD_PATHS = {
  admin: "/admin",
  parent: "/parent",
  coach: "/coach",
  director: "/director",
  child: "/child",
  teen: "/teen",
};
PROTECTED_PATHS_BY_ROLE = {
  admin: ["/admin", "/parent", "/coach", "/director", "/child", "/teen"], // 전체 접근
  director: ["/director"],
  coach: ["/coach", "/attendance/manage", "/classes/manage"],
  parent: ["/parent", "/payment"],
  child: ["/child"],
  teen: ["/teen"],
};
```

### Layout 패턴

모든 역할별 레이아웃은 동일한 가드 패턴을 따릅니다:

```tsx
// src/app/(admin)/layout.tsx 패턴
export default function AdminLayout({ children }) {
  const { isLoading, isAllowed } = useRequireRole(["admin"]);
  if (isLoading)
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-900" />;
  if (!isAllowed) return null;
  return (
    <>
      {children}
      <AdminBottomNav />
    </>
  );
}
```

| 레이아웃     | 역할 가드                                    | BottomNav                          |
| ------------ | -------------------------------------------- | ---------------------------------- |
| `(admin)`    | `useRequireRole(['admin'])`                  | `AdminBottomNav`                   |
| `(coach)`    | `useRequireRole(['coach', 'admin'])`         | `RoleBottomNav`                    |
| `(director)` | `useRequireRole(['director', 'admin'])`      | `RoleBottomNav`                    |
| `(parent)`   | `useRequireRole(['parent', 'admin'])`        | `ParentBottomNav`                  |
| `(student)`  | `useRequireRole(['child', 'teen', 'admin'])` | `RoleBottomNav`                    |
| `(common)`   | `useRequireAuth()` (아무 역할)               | `RoleBottomNav` (역할 자동 감지)   |
| `(public)`   | 가드 없음                                    | `RoleBottomNav` (비로그인 시 null) |

### 테마 시스템 (FOUC 방지)

1. Root `layout.tsx` (서버): `cookies().get('theme')` → `<html class="dark">` + critical inline CSS
2. `<script>`: localStorage 폴백 → 첫 방문자 쿠키 자동 설정
3. `ThemeProvider` (클라이언트): `localStorage` ↔ `cookie` 동기화, `matchMedia` system 테마 감지

### 상태 관리

외부 라이브러리 없음 (Redux/Zustand/TanStack Query 미사용):

- **React Context**: 전역 상태 (Auth, Theme, Loading, Notification, AppSettings)
- **useState/useCallback/useEffect**: 페이지/컴포넌트 로컬 상태
- **sessionStorage**: 인증 프로필 캐시 (`teamplus_auth_profile`)
- **localStorage**: 토큰(웹), 테마, 로그인 rate limit

### 데이터 페칭 패턴

```typescript
// 표준 커스텀 훅 패턴 (useDashboardData, useCoachDashboardData 등)
const [data, setData] = useState(FALLBACK_DATA); // 오프라인 시에도 렌더링 보장
const [isLoading, setIsLoading] = useState(true);
const [error, setError] = useState(null);
const fetchData = useCallback(async () => {
  const response = await api.get("/endpoint");
  if (response.success) setData(response.data);
}, []);
useEffect(() => {
  fetchData();
}, [fetchData]);
return { data, isLoading, error, refresh: fetchData };
```

### 네비게이션 (NavLink + 로딩 통합)

`NavLink` (Next.js `Link` 래퍼)는 클릭 시 자동으로 전체화면 로딩 스피너를 표시하고, 경로 변경 완료 시 해제합니다. `useNavigation`은 `router.push`에 동일 기능을 적용합니다.

### Flutter 네비게이션 브릿지

`ClientProviders.tsx`에서 전역 함수 등록:

- `window.__NEXT_ROUTER_PUSH__(path)`: Flutter에서 Next.js 라우팅 호출
- `window.teamplusNavigate(path)`: 위 함수의 별칭
- Flutter → Web 네비게이션에 사용 (딥링크, 푸시 알림 탭 등)

### 화면 해상도 기반 Auto Layout (2026-05-09 신규 SoT)

> **상세**: [`docs/Architecture/SCREEN_METRICS.md`](../docs/Architecture/SCREEN_METRICS.md)

Flutter `MediaQuery` (logical pixels) 또는 `window.visualViewport` (web 폴백) 값을 단일 진입점
`ClientProviders.subscribeToDeviceMetrics()` 가 CSS 변수 + `data-screen-bp` 속성으로 주입.
회전·키보드·접힘 등 metrics 변경 시 Flutter `didChangeMetrics` push → Web 1프레임 내 갱신.

**주입 변수**:

- `--screen-width`, `--screen-height` (px)
- `--screen-width-px`, `--screen-height-px` (unitless · calc 산술용)
- `--viewport-width`, `--viewport-height` (키보드 제외)
- `--safe-area-inset-{top|bottom|left|right}`
- `--device-pixel-ratio`, `--device-orientation`, `--device-platform`
- `--keyboard-inset-bottom`
- `[data-screen-bp="xs|sm|md|lg|xl"]`, `[data-orientation]`, `[data-native-platform]`

**Breakpoint**:

| 코드 | 폭    | 대상                             |
| ---- | ----- | -------------------------------- |
| `xs` | ≤ 359 | 구형 안드로이드 작은 폰          |
| `sm` | ≤ 413 | iPhone Mini / 일반 안드로이드    |
| `md` | ≤ 479 | iPhone Pro Max / Galaxy Plus     |
| `lg` | ≤ 767 | Foldable / large phone landscape |
| `xl` | ≥ 768 | Tablet / Desktop                 |

**사용 (CSS-only 우선 — 0 리렌더)**:

```css
.card {
  padding: var(--mobile-page-x);
}
[data-screen-bp="xs"] .card {
  padding: 8px;
}
.header {
  padding-top: var(--safe-area-inset-top);
}
```

**사용 (React 분기 가드)**:

```tsx
import { useScreenMetrics } from "@/hooks/useScreenMetrics";
const { breakpoint, orientation, isNative } = useScreenMetrics();
if (breakpoint === "xs") return <CompactView />;
```

**금지**:

- ❌ 고정 px 하드코딩 (`width: 360px`)
- ❌ `window.innerWidth` 직접 읽기
- ❌ `window.addEventListener('resize', ...)` 직접 등록 (subscribe 단일 진입점)
- ❌ `safe-area-inset` env() 단독 사용 (Android WebView 0px 평가 → `var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))` 폴백 패턴 필수)

### API Routes

- `src/app/api/auth/google/`: Google OAuth 콜백 처리 (서버사이드)

---

## Route & Screen Catalog (181 pages, 2026-04-11 실측)

> **규모 요약** (find src/app -name 'page.tsx' | wc -l = 181)
> · (admin) 17 · (auth) 12 · (child) 2 · (class) 4 · (coach) 24 · (common) 26 · (director) 16 · (gallery) 3 · (live) 2 · (message) 2 · (notice) 3 · (parent) 15 · (payment) 6 · (public) 6 · (shop) 8 · (student) 12 · (venue) 1 · (attendance) 4 · top-level 18

### (admin) — 관리자 전용 (17 pages)

| 경로                                | 기능                                                            |
| ----------------------------------- | --------------------------------------------------------------- |
| `/admin`                            | 관리자 대시보드 (매출, 회원수, 최근 결제, 오늘 일정, 승인 대기) |
| `/admin-schedules`                  | 일정 관리                                                       |
| `/coach-manage`                     | 코치 목록/등록/관리 (활동 중/휴직 필터)                         |
| `/members`                          | 회원 승인 관리 (대기/승인/거절 탭, 일괄 처리)                   |
| `/members/[id]`                     | 회원 상세 (프로필, 크레딧, 최근 수업, 승인/반려)                |
| `/members/[id]/credits`             | 회원별 크레딧 관리 (충전/차감)                                  |
| `/members-create`                   | 신규 회원 생성                                                  |
| `/payments-manage`                  | 결제 관리                                                       |
| `/settlements`, `/settlements/[id]` | 정산 목록/상세                                                  |
| `/match-manage`                     | 매치 관리                                                       |
| `/tournament-manage`                | 대회 관리                                                       |
| `/venue-manage`                     | 경기장/링크 관리                                                |
| `/inventory`                        | 장비/재고 관리                                                  |
| `/notices-manage`                   | 공지 관리                                                       |
| `/notices/create`                   | 공지 작성 (대상 선택, 리치에디터, 이미지 5장, 푸시/문자 선택)   |
| `/popups`                           | 팝업 배너 관리 (노출 토글, 우선순위, 기간 설정)                 |

### (auth) — 인증 (12 pages)

| 경로                       | 기능                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| `/login`                   | 메인 로그인 (역할 선택 드롭다운, 소셜 로그인)                          |
| `/login/{role}`            | 역할별 직접 로그인 (parent/coach/director/child/teen/system/operation) |
| `/signup`                  | 멀티스텝 회원가입 (역할 선택 → 폰 OTP → 프로필 → 자녀 정보 → 완료)     |
| `/find-id`                 | 아이디 찾기 (이름 + 폰 OTP → ID/가입일 표시)                           |
| `/find-password`           | 비밀번호 재설정 (폰 OTP → 새 비밀번호)                                 |
| `/password-reset-complete` | 비밀번호 재설정 완료                                                   |

### (coach) — 코치/관리자/아카데미원장 (24 pages, 2026-04-11)

| 경로                                                                                                 | 기능                                                                  |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/coach`                                                                                             | 코치 대시보드 (오늘 수업, 주간 캘린더, 학생 목록, `팀 관리` 바로가기) |
| `/coach/[id]`                                                                                        | 코치 프로필 상세                                                      |
| `/coaches`                                                                                           | 코치 전체 목록                                                        |
| `/coach-schedules`                                                                                   | 코치 일정 관리                                                        |
| `/coach-calendar`                                                                                    | 코치 캘린더 뷰                                                        |
| `/coach-members`                                                                                     | 담당 학생 목록                                                        |
| `/coach-rsvp`                                                                                        | 코치 RSVP 관리                                                        |
| `/coach-assignments`                                                                                 | 코치 배정 (신규)                                                      |
| `/classes-manage`, `/classes-manage/create`, `/classes-manage/complete`, `/classes-manage/edit/[id]` | 수업 생성/편집/완료                                                   |
| `/classes-organize`                                                                                  | 수업 정렬/구성                                                        |
| `/attendance-manage`                                                                                 | 출석 관리 도구                                                        |
| `/profile-edit`                                                                                      | 코치 프로필 편집                                                      |
| `/promotions`                                                                                        | 프로모션/마케팅                                                       |
| `/approval`, `/member/[id]`                                                                          | 학생 승인·상세 (중첩 `(member)`)                                      |
| `/academy`, `/academy/[id]`, `/academy/create`                                                       | 아카데미 관리 (원장 전용, 신규)                                       |
| `/training-manage`, `/training-manage/create`, `/training-manage/[id]`                               | 훈련 관리 (신규)                                                      |

### (director) — 감독/관리자 (16 pages, 2026-04-11)

| 경로                                                             | 기능                                           |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| `/director`                                                      | 감독 대시보드 (클럽 통계, 코치 진행률, 이벤트) |
| `/director-schedules`                                            | 감독 일정                                      |
| `/director-notices`                                              | 감독 공지 (2026-04-11 FE 연동)                 |
| `/director-payments`                                             | 결제 관리                                      |
| `/director-approvals`                                            | 승인/거절 내역 (신규)                          |
| `/director-coaches`, `/director-coaches/register`                | 감독용 코치 관리/등록 (신규)                   |
| `/director-credits`                                              | 크레딧 관리 (신규)                             |
| `/director-overseas-trips`, `/director-overseas-trips/[id]`      | 해외원정 관리 (신규)                           |
| `/leagues`                                                       | 리그 관리 (신규)                               |
| `/statistics`                                                    | 통계 리포트                                    |
| `/team-chat`                                                     | 팀 채팅                                        |
| `/tournaments`, `/tournaments/[id]`, `/tournaments/[id]/bracket` | 대회 목록/상세/브래킷                          |

### (parent) — 학부모/관리자 (15 pages)

| 경로                                                     | 기능                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| `/parent`                                                | 학부모 대시보드 (`ChildrenSwipeCards` 캐러셀, 배너, 퀵 액션) |
| `/children`, `/children/add`, `/children/[childId]/edit` | 자녀 목록/추가/편집                                          |
| `/credits`                                               | 크레딧 잔액/만료 경고, 결제/사용 이력                        |
| `/parent-calendar`                                       | 자녀 수업 월별 캘린더                                        |
| `/rsvp`                                                  | RSVP 응답 (자녀별 탭, 미응답 배지)                           |
| `/waitlist`                                              | 대기 목록 관리                                               |
| `/review`                                                | 수업 리뷰 작성                                               |
| `/report`                                                | 성장 리포트 (4탭, RadarChart)                                |
| `/skill-report`                                          | 기술 평가 상세                                               |
| `/progress`                                              | 진도 현황                                                    |
| `/awards`                                                | 시상 내역 (신규)                                             |
| `/overseas-trips`, `/overseas-trips/[id]`                | 해외 원정 (신규)                                             |

### (student) — 학생/관리자 (12 pages)

| 경로                  | 기능                                                        |
| --------------------- | ----------------------------------------------------------- |
| `/child`              | 어린이 홈 (WCAG AAA 72x72dp 터치, pop-in/wiggle 애니메이션) |
| `/teen`               | 청소년 홈 (teen 테마)                                       |
| `/dashboard`          | 학생 대시보드 (오늘 수업, 대회)                             |
| `/attendance`         | 출석 이력 (월별 네비, 원형 진행률, 연간 바 차트)            |
| `/attendance-success` | 출석 성공 화면 (체크 애니메이션, 잔여 수업 표시)            |
| `/calendar`           | 학생 캘린더 (42셀, 일별 수업 상세)                          |
| `/schedule`           | 주간 일정 (TTS 버튼, 오늘 하이라이트)                       |
| `/badges`             | 뱃지 컬렉션 (legendary/epic/rare/uncommon/common 등급)      |
| `/stickers`           | 스티커 컬렉션                                               |
| `/ranking`            | 클럽 내 랭킹 (S/A/B/C/D 레벨)                               |
| `/checklist`          | 장비 체크리스트 (100% 완료 시 confetti 애니메이션)          |
| `/gift`               | 선물/보상 (스티커 완성 축하, 쿠폰/뱃지 탭)                  |

### (child) — 어린이 전용 (2 pages)

| 경로          | 기능             |
| ------------- | ---------------- |
| `/classes`    | 어린이 수업 목록 |
| `/qr-checkin` | QR 코드 체크인   |

### (attendance) — 출석 (4 pages)

| 경로                  | 기능                                   |
| --------------------- | -------------------------------------- |
| `/qr-generate`        | QR 생성 (코치/관리자, 10분 카운트다운) |
| `/qr-scan`            | QR 스캔 (카메라)                       |
| `/attendance-history` | 출석 이력                              |
| `/success`            | 출석 성공 확인                         |

### (payment) — 결제 (6 pages)

| 경로               | 기능                                                         |
| ------------------ | ------------------------------------------------------------ |
| `/select`          | Step 1: 수업 선택 (검색, 카테고리 필터)                      |
| `/options`         | Step 2: 옵션/자녀 선택, 금액 요약                            |
| `/checkout`        | Step 3: 결제 수단 선택 (카카오페이/네이버페이/삼성페이/카드) |
| `/complete`        | Step 4: 결제 완료 (영수증 카드, 크레딧 발급)                 |
| `/payment-history` | 결제/사용 이력 (월별 그룹)                                   |
| `/receipt/[id]`    | 영수증 상세 (상태 배지, 이미지 다운로드)                     |

### (common) — 모든 인증 사용자 (26 pages, 2026-04-11)

| 경로                                                     | 기능                                                     |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `/mypage`                                                | 마이페이지 (프로필 요약, 크레딧, 퀵링크)                 |
| `/profile`, `/profile/edit`, `/profile/password`         | 프로필 보기/편집/비밀번호 변경                           |
| `/settings`, `/settings/profile`, `/settings/theme`      | 앱 설정 (다크모드, 푸시, 언어, 로그아웃)                 |
| `/notifications`                                         | 알림 목록 (읽지 않음/전체 필터, 전체 읽음)               |
| `/notification-settings`                                 | 알림 카테고리별 설정                                     |
| `/search`, `/search/results`                             | 글로벌 검색                                              |
| `/drawer`                                                | 사이드 메뉴                                              |
| `/feedback`, `/feedback/history`                         | 피드백 제출/이력                                         |
| `/more`                                                  | 더보기 메뉴                                              |
| `/security`                                              | 보안 설정                                                |
| `/teams`                                                 | 팀 목록 (2024년 버전, deprecated 후보)                   |
| `/team`, `/team/create`, `/team/[id]`, `/team/[id]/edit` | **팀 관리 신규** (2026-04-11, CRUD + 로스터 + 경기 일정) |
| `/matches/pickup`                                        | 픽업 게임 매치                                           |
| `/help`                                                  | 도움말 (신규)                                            |
| `/my-qr`                                                 | 내 QR 코드 (신규)                                        |
| `/withdrawal`                                            | 회원 탈퇴 (신규)                                         |
| `/moderation/blocks`                                     | 차단 관리 (신규)                                         |

> **RBAC 주의**: `/team`은 `(common)` 그룹에 위치하므로 모든 인증 사용자가 접근 가능. 학부모는 자녀 소속 팀 뷰, 관리자(ADMIN/DIRECTOR/COACH)는 `listManagedTeams()` 우선 + 비었을 때 `listTeams()` 폴백 조회. `auth-routing.ts`의 `PROTECTED_PATHS_BY_ROLE`에는 의도적으로 `/team` 경로가 포함되지 않음 ((common) 공용 경로 설계).

### (public) — 비인증 (6 pages)

| 경로                            | 기능                                                |
| ------------------------------- | --------------------------------------------------- |
| `/splash`                       | 스플래시 (로고 + 프로그레스바, 2.5초 후 onboarding) |
| `/onboarding`                   | 3슬라이드 인트로 (QR가입/수업관리/결제)             |
| `/faq`                          | FAQ (아코디언, 카테고리 칩, 검색)                   |
| `/terms`                        | 이용약관 (확장형, 필수/선택 배지)                   |
| `/academies`, `/academies/[id]` | 아카데미 공개 목록/상세 (신규)                      |

### (shop) — 쇼핑몰 (8 pages)

| 경로                          | 기능                                              |
| ----------------------------- | ------------------------------------------------- |
| `/home`                       | 쇼핑몰 홈 (배너 캐러셀, 카테고리, 타임딜)         |
| `/products`, `/products/[id]` | 상품 목록/상세                                    |
| `/cart`                       | 장바구니 (수량 조절, localStorage)                |
| `/wishlist`                   | 위시리스트                                        |
| `/orders`                     | 주문 이력 (상태 필터)                             |
| `/shop-checkout`              | 쇼핑몰 결제                                       |
| `/shop-profile`               | 쇼핑몰 프로필 (배송 현황, 위시리스트/쿠폰/포인트) |

### (notice) — 공지 (3 pages)

`/list` (공지 목록, 전체/공지/이벤트 탭), `/events` (이벤트 목록), `/notice-detail/[id]` (상세, DOMPurify 산화)

### (gallery) — 갤러리 (3 pages)

`/photos` (앨범 그리드), `/photos/[albumId]` (사진 그리드), `/photos/[albumId]/[photoId]` (풀스크린 뷰어, 스와이프, 좋아요/댓글)

### (class) ��� 수업 관련

| 경로               | 기능                             |
| ------------------ | -------------------------------- |
| `/classes`         | 수업 목록/상세 (서브라우트 포함) |
| `/class-calendar`  | 수�� 캘린더 뷰                   |
| `/class-favorites` | 즐겨찾기 수업                    |
| `/detail`          | 수업 상세                        |

### (settings) — 설정

| 경로        | 기능                         |
| ----------- | ---------------------------- |
| 중첩 라우트 | (common) 내 설정 페이지 그룹 |

### (member) — 회원 상세

| 경로        | 기능                                  |
| ----------- | ------------------------------------- |
| 중첩 라우트 | (coach) 내 학생 승인/상세 페이지 그룹 |

### (notification) — 알림

| 경로        | 기능                              |
| ----------- | --------------------------------- |
| 중첩 라우트 | (common) 내 알림 관련 페이지 그룹 |

### (live) — 라이브

| 경로           | 기능                                            |
| -------------- | ----------------------------------------------- |
| `/scoreboard`  | 실시간 스코어보드 (live/upcoming/finished 필터) |
| `/live-review` | 라이브 리뷰                                     |

### (message) — 메시징 (2 pages)

`/messages` (대화 목록), `/chat/[id]` (1:1 채팅)

### (venue) — 경기장 (1 page)

`/venue-list` (링크 목록, 시설 칩, 길찾기/전화)

### Top-level 라우트 (18 pages)

| 그룹       | 경로                                        | 기능                                                    |
| ---------- | ------------------------------------------- | ------------------------------------------------------- |
| `/`        | 루트                                        | 인증 상태 감지 → 역할 대시보드 또는 `/login` 리다이렉트 |
| `matches/` | `/matches`, `/matches/list`                 | 매치 목록 (검색, 레벨/장소 필터)                        |
|            | `/matches/create`                           | 매치 생성 (기본정보, 모집조건, 규칙)                    |
|            | `/matches/[id]`                             | 매치 상세 (VS 로고, 정보, 규칙, 참가 신청)              |
|            | `/matches/[id]/applicants`                  | 신청자 관리 (승인/거절, 일괄 처리)                      |
|            | `/matches/[id]/payment`                     | 매치 참가 신청 (포지션/레벨 선택)                       |
|            | `/matches/[id]/roster`                      | 확정 참가자 명단 (대기 목록 포함)                       |
| `message/` | `/message/list`                             | 대화 목록 (검색, 읽지 않음/고정 필터)                   |
|            | `/message/new`                              | 새 메시지 작성                                          |
| `notice/`  | `/notice`, `/notice/[id]`, `/notice/create` | 공지 목록/상세/작성                                     |
| `notices/` | `/notices`                                  | 공지 목록 (re-export)                                   |
| `club/`    | `/club/news`                                | 클럽 뉴스 피드                                          |
| `event/`   | `/event/premium`                            | 프리미엄 이벤트                                         |
| `stats/`   | `/stats`                                    | 청소년 선수 통계                                        |

---

## Key Services (18 files in `src/services/`, 2026-04-11 실측)

| 서비스                    | 역할                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `api-client.ts`           | 통합 API (Axios/Bridge 자동 선택, 토큰 갱신, 401 재시도)                                                                        |
| `native-bridge.ts`        | Flutter WebView JS Bridge (auth/identity/qr/navigation/api/payment/ui **7 모듈**)                                               |
| `hybrid-auth.ts`          | 환경별 토큰 저장소 추상화                                                                                                       |
| `web-token-storage.ts`    | localStorage 토큰 저장 (sessionStorage/in-memory 폴백)                                                                          |
| `auth.ts`                 | 인증 API (login, signup, logout, findId, resetPassword)                                                                         |
| `dashboard.ts`            | 대시보드 API (parent/coach/director별)                                                                                          |
| `payment.ts`              | 결제 API (이력, 크레딧, 영수증, 검증)                                                                                           |
| `team.service.ts`         | **팀 관리 서비스** — 팀 CRUD, 로스터 CRUD, 경기 일정, `listManagedTeams`/`listTeams`/`listParentVisibleTeams` (2026-04-11 신규) |
| `management.ts`           | 관리 API (출석, 수업, 자녀 CRUD)                                                                                                |
| `app-settings.ts`         | 앱 설정 (유지보수 모드, 피처 플래그, 5분 캐시)                                                                                  |
| `websocket-bridge.ts`     | Socket.io 싱글턴 (Web: 직접연결, Native: Bridge 경유)                                                                           |
| `cache.ts`                | 클라이언트 캐시 (memory/sessionStorage/localStorage + TTL)                                                                      |
| `retry.ts`                | Exponential backoff 재시도 (jitter, AbortSignal 지원)                                                                           |
| `bridge-security.ts`      | 브릿지 보안 (origin allowlist, 5분 timestamp, nonce 리플레이 방지)                                                              |
| `bridge-error-handler.ts` | 브릿지 에러 감지 → Toast 연동                                                                                                   |
| `social-auth.ts`          | 소셜 로그인 (Google 등) OAuth 처리                                                                                              |
| `sms.ts`                  | SMS 발송 서비스 (OTP 인증 등)                                                                                                   |
| `index.ts`                | Barrel export                                                                                                                   |

---

## Key Hooks (37 files in `src/hooks/`, index.ts 제외 · 2026-04-11 실측)

> **최근 추가**: `useDeeplinkRouter` (딥링크 라우팅), `useNoticeUnreadCount` (공지 미읽음 카운트), `useNotifications` / `useNotificationSettings` Context 훅 분리.

| 훅                                                                        | 역할                                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `useNativeUI`                                                             | Flutter 네이티브 UI 제어 (statusBar, AppBar, BottomNav). 프리셋: `useFullscreen`, `useHideBottomNav`, `useDetailUI`, `useAuthUI` 등 |
| `useIsNative`                                                             | Flutter WebView 환경 감지 (boolean)                                                                                                 |
| `useAuth`                                                                 | 인증 상태 + login/logout/signup/refreshUser                                                                                         |
| `useLoginRateLimit`                                                       | 로그인 시도 제한 (5회 실패 → 30초부터 최대 15분까지 점진적 잠금)                                                                    |
| `useNetworkStatus`                                                        | 온/오프라인 감지, 오프라인 큐 지원                                                                                                  |
| `useWebSocket`                                                            | Socket.io 연결 관리 (autoConnect, 이벤트 구독, room join/leave)                                                                     |
| `useDashboardData` / `useCoachDashboardData` / `useDirectorDashboardData` | 역할별 대시보드 데이터 (FALLBACK_DATA 포함)                                                                                         |
| `useChildren`                                                             | 학부모 자녀 목록                                                                                                                    |
| `useNotificationCount`                                                    | 미읽음 알림 카운트 (배지)                                                                                                           |
| `useDebounce`                                                             | 값 디바운스                                                                                                                         |
| `useLocalStorage`                                                         | SSR 안전 localStorage 접근                                                                                                          |
| `useBridgeErrorHandler`                                                   | 브릿지 에러 → Toast 자동 표시                                                                                                       |
| `useAttendance`                                                           | 출석 데이터 페칭/관리                                                                                                               |
| `useCalendar` / `useUnifiedCalendar`                                      | 캘린더 로직 (월 네비게이션, 일정 표시)                                                                                              |
| `useClasses` / `useClassList` / `useClassForm`                            | 수업 목록/폼 관리                                                                                                                   |
| `useChildHome` / `useParentHome`                                          | 역할별 홈 데이터                                                                                                                    |
| `useAppSettings`                                                          | 앱 설정 컨텍스트 (유지보수 모드, 피처 플래그)                                                                                       |
| `useCountUp`                                                              | 숫자 카운트업 애니메이션                                                                                                            |
| `useLongPress`                                                            | 롱프레스 제스처 감지                                                                                                                |
| `usePullToRefresh`                                                        | 당겨서 새로고침 제스처                                                                                                              |
| `useNotifications` / `useNotificationSettings` (Context)                  | 알림 목록/설정 관리                                                                                                                 |
| `useQrGenerate`                                                           | QR 코드 생성 (코치/관리자)                                                                                                          |
| `useSkillReport`                                                          | 기술 평가 데이터                                                                                                                    |
| `useStatistics`                                                           | 통계 데이터                                                                                                                         |
| `useTeam`                                                                 | 팀 관리                                                                                                                             |
| `useTraining`                                                             | 수업/훈련 데이터                                                                                                                    |
| `useAcademy`                                                              | 아카데미/학원 데이터                                                                                                                |
| `useCoachInvitations`                                                     | 코치 초대 관리                                                                                                                      |

---

## Key Patterns

### API 호출

```typescript
import { api } from "@/services/api-client";

const response = await api.get<UserData>("/auth/profile");
if (response.success) {
  /* response.data 사용 */
} else {
  /* response.error: { code, message, statusCode } */
}
```

### 역할 기반 접근 제어

```typescript
const { user, isLoading, isAllowed } = useRequireRole(['parent', 'coach']);
if (isLoading) return <Spinner />;
if (!isAllowed) return null;
```

### Native UI 제어

```typescript
import { useNativeUI, useDetailUI } from "@/hooks/useNativeUI";

// 프리셋 사용 (권장)
useDetailUI(); // AppBar 숨김 + BottomNav 숨김

// 커스텀 설정
useNativeUI({ hideStatusBar: true, hideAppBar: true, hideBottomNav: true });
```

### 표준 메시지 사용 (하드코딩 금지)

```typescript
import { MESSAGES } from "@/lib/messages";

// ✅ 올바른 사용
toast.success(MESSAGES.save.success); // "저장되었습니다."
toast.error(MESSAGES.error.network); // "네트워크 연결을 확인해주세요."
const empty = MESSAGES.empty("수업"); // "등록된 수업이(가) 없습니다."

// ❌ 금지
toast.success("저장되었습니다."); // 하드코딩 금지
```

---

## Type System (9 files in `src/types/`)

```typescript
// src/types/api.ts 표준 응답
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}
interface ApiError {
  code: string;
  message: string;
  statusCode?: number;
}

// 역할 타입
type UserType = "parent" | "coach" | "admin" | "child" | "director" | "teen";
```

| 파일               | 역할                                             |
| ------------------ | ------------------------------------------------ |
| `api.ts`           | ApiResponse, ApiError, 페이지네이션 등 표준 타입 |
| `index.ts`         | 공통 타입 (User, Club, Class 등)                 |
| `identity.ts`      | 본인인증 타입                                    |
| `notification.ts`  | 알림 타입                                        |
| `payment.ts`       | 결제/크레딧 타입                                 |
| `rsvp.ts`          | RSVP 타입                                        |
| `waitlist.ts`      | 대기 목록 타입                                   |
| `user-profile.ts`  | 사용자 프로필 타입                               |
| `overseas-trip.ts` | 해외 원정 타입                                   |

---

## Design Rules

### AI 스타일 금지 (필수)

```tsx
// ❌ 절대 사용 금지
bg-gradient-to-r from-* to-*    // 그라디언트
backdrop-blur-*                  // 블러 (헤더 스크롤 제외)
shadow-*-500/30                  // 컬러 그림자

// ✅ 올바른 사용
bg-blue-600 hover:bg-blue-700   // 솔리드 컬러
shadow-md                        // 일반 그림자

// ⚠️ 유일한 예외: 헤더 스크롤 투명도
<header className="bg-white/80 backdrop-blur-md">
```

### 컬러 시스템

| 토큰         | HEX       | 용도              |
| ------------ | --------- | ----------------- |
| Primary      | `#1E3FAE` | 주요 액션, 브랜드 |
| Primary Dark | `#152B7A` | hover/active      |
| Success      | `#16A34A` | 완료, 승인        |
| Warning      | `#EAB308` | 주의              |
| Error        | `#DC2626` | 오류              |
| Info         | `#0284C7` | 정보              |

### 다크모드

모든 컴포넌트에 `dark:` Tailwind 변형 적용. 기본 배경: `bg-slate-50 dark:bg-slate-900`, 텍스트: `text-slate-900 dark:text-white`.

### Tone & Manner

| 동작 | 표준       | 금지         |
| ---- | ---------- | ------------ |
| 등록 | "등록하기" | Submit, Add  |
| 수정 | "수정하기" | Edit, Update |
| 삭제 | "삭제하기" | Delete       |
| 저장 | "저장하기" | Save         |

| 사용 | 금지   |
| ---- | ------ |
| 수업 | 클래스 |
| 출석 | 체크인 |
| 회원 | 유저   |

### 아동 UI (WCAG AAA)

어린이 대상 화면(`/child`, `/checklist`, `/gift` 등): 72x72dp 버튼, 7:1 대비율, 큰 터치 영역

---

## Lib 유틸리티 (11 files in `src/lib/`)

| 파일                 | 역할                                                           |
| -------------------- | -------------------------------------------------------------- |
| `messages.ts`        | **표준 메시지 상수** (하드코딩 금지, MESSAGES.save.success 등) |
| `auth-routing.ts`    | RBAC 경로 매핑 (DASHBOARD_PATHS, PROTECTED_PATHS_BY_ROLE)      |
| `environment.ts`     | 환경 감지 (`'native' \| 'web' \| 'server'`)                    |
| `env.ts`             | 환경 변수 접근 유틸리티                                        |
| `crypto.ts`          | 로그인 E2E 암호화 (AES)                                        |
| `utils.ts`           | 공통 유틸 (cn, 날짜/포맷 등)                                   |
| `logger.ts`          | 클라이언트 로거                                                |
| `calendar-colors.ts` | 캘린더 타입별 컬러 매핑                                        |
| `scroll-lock.ts`     | 모달/시트 열림 시 스크롤 잠금                                  |
| `terms-content.ts`   | 이용약관 콘텐츠 데이터                                         |

---

## 컴포넌트 디렉토리 (26개 도메인)

```
src/components/
├── ui/             # 기본 UI (Button, Input, Modal, Toast 등)
├── common/         # 공유 컴포넌트 (MobileContainer, NavLink, PageHeader 등)
├── layout/         # 레이아웃 (BottomNav 변형들)
├── navigation/     # 네비게이션
├── providers/      # ClientProviders, ModalProvider, ToastProvider
├── icons/          # 아이콘 컴포넌트
└── [도메인별]/     # academy, admin, attendance, calendar, chat, child, children,
                    # classes, coach, dashboard, director, notification, parent,
                    # payment, report, rsvp, team, teen, waitlist
```

---

## 주요 의존성

| 카테고리       | 패키지                                                     |
| -------------- | ---------------------------------------------------------- |
| **프레임워크** | `next` 15.5, `react` 19, `typescript` 5.7                  |
| **스타일**     | `tailwindcss` 3.4, `tailwind-merge`, `clsx`                |
| **API**        | `axios`, `socket.io-client` 4                              |
| **UI**         | `@radix-ui/react-slot`, `lucide-react`                     |
| **보안**       | `dompurify` (XSS), `@sentry/nextjs` 10 (비활성 상태)       |
| **QR**         | `qrcode.react` 4                                           |
| **테스트**     | `jest` 30, `@testing-library/react` 16, `@playwright/test` |

---

## Environment

| 변수                  | 설명                                           |
| --------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | 백엔드 API URL (기본: `http://localhost:5003`) |

---

## Path Aliases

`@/` → `src/` (예: `@/components/ui/Button`, `@/services/api-client`, `@/lib/messages`)

`@shared/` → `../shared/` (모노레포 공유 타입)

---

## Testing

- **Unit**: Jest 30 + React Testing Library — `src/__tests__/` + `src/hooks/__tests__/` + `src/lib/__tests__/`
- **E2E**: Playwright — `e2e/` 또는 프로젝트 루트
- **커버리지 임계값**: 70% (branches, functions, lines, statements)
- **단일 테스트**: `npm test -- src/__tests__/components/ui/Button.test.tsx`
- **E2E 실행**: `npx playwright test`

---

**Last Updated**: 2026-04-21 | **Version**: 2.4 (**TanStack Query 전체 제거** — QueryProvider·queryKeys 팩토리·DevTools 삭제, 6 파일 useState/useEffect 롤백, @tanstack 의존성 uninstall · apiLifecycle 훅 레지스트리 유지 · PUBLIC_API_PATTERNS 화이트리스트 기반 전처리 로그인 가드 유지 · AuthRequiredError 자동 `/login?redirect&reason` 유도 · UnauthorizedToastListener · 1초 SLA 모니터링 · preconnect+dns-prefetch · next.config compress+ETag+optimizePackageImports · MobileContainer pb 수정(BottomNav 줄무늬 해소) — 217 pages / 27 services / 47 hooks / 296 컴포넌트 / 12 E2E spec)
