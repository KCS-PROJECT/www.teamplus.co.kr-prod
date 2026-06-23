# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**teamplus-admin** — TEAMPLUS 아이스하키 클럽 관리 플랫폼의 관리자 대시보드.
회원·수업·출석·결제·쇼핑몰·대회·앱 설정 등 전체 관리 기능 제공.

**Tech Stack**: Next.js 14 (App Router), React 18, TypeScript 5.3, Tailwind CSS 3.4, Radix UI, TanStack Query 5, Axios 1.6, React Hook Form 7, lucide-react, styled-components 6, DOMPurify 3

**테스트 계정**: 상위 프로젝트 `CLAUDE.md` 참조 (비밀번호 공통: `Test1234!`)

---

## 개발 명령어

```bash
npm run dev          # localhost:5002 (distDir: .next-dev, 매번 삭제 후 재생성)
npm run build        # 프로덕션 빌드 (distDir: .next)
npm run start        # 프로덕션 서버 (포트 5002)
npm run lint         # ESLint (next/core-web-vitals + next/typescript)
```

Dev/Prod distDir 분리(`next.config.js`)로 빌드 충돌 방지.

---

## 아키텍처

### Data Fetching: 두 가지 패턴 공존

1. **대부분 페이지**: `useState` + `useEffect` + `api.get()` (Axios 직접 호출)
2. **TanStack Query** (6개 파일): `src/hooks/use*.ts` 5개 + `dashboard/app/settings/page.tsx`
   - hooks: `useAcademyPromotions`, `useCommonCodes`, `useRsvp`, `useTournamentRegistrations`, `useWaitlist`

`QueryClientProvider`는 **글로벌이 아닌 페이지별** 설정. 새 페이지 추가 시 해당 섹션의 기존 패턴을 따를 것.

### 이중 토큰 저장 (`src/services/api-client.ts`)

| 저장소           | 용도                                        |
| ---------------- | ------------------------------------------- |
| **localStorage** | Axios 인터셉터 `Authorization: Bearer` 헤더 |
| **Cookie**       | Edge 미들웨어 서버사이드 라우트 보호        |

- `setTokens()` → 양쪽 동시 기록 / `clearTokens()` → 양쪽 동시 삭제
- 쿠키명: `teamplus_access_token`, `teamplus_refresh_token`
- `DashboardLayout`이 라우트 변경 시 `syncTokenCookies()` 호출 (쿠키 만료 방지)

### API Client (`src/services/api-client.ts`)

- `api` 객체 (`api.get`, `api.post` 등) + `apiClient` (raw Axios 인스턴스) 이중 export
- `extractData()`: 백엔드 `{ success: true, data: T }` 래퍼 자동 해제
- 401 시 토큰 갱신 + 동시 요청 큐잉 (갱신 완료까지 대기)
- Auth 엔드포인트(`/auth/login`, `/auth/register`, `/auth/refresh`)는 401 재시도 바이패스

### 미들웨어 (`src/middleware.ts`)

- Edge Runtime: 쿠키 기반 JWT 검증 (localStorage 아님)
- `/dashboard/*` 전체 보호
- Access 만료 + Refresh 존재 → 통과 (클라이언트 갱신 위임)
- 파싱 에러/잘못된 형식 → 즉시 거부 (만료와 구분)
- Public: `/`, `/login`, `/signup`, `/payments`

### 세션 타임아웃

`useIdleTimer` → 4분 유휴 → `SessionTimeoutModal` 경고 → 1분 카운트다운 → 자동 로그아웃.
경고 모달 중에는 사용자 활동 무시.

### 서비스 레이어 (`src/services/`)

14개 서비스 파일 + `api-client.ts`, barrel export via `src/services/index.ts`:

| barrel export (12개)                                                                                                                                                                                                                 | 파일만 존재 (미export)            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `authService`, `clubService`, `classService`, `paymentService`, `attendanceService`, `shopService`, `userService`, `rsvpService`, `waitlistService`, `tournamentRegistrationService`, `academyPromotionService`, `commonCodeService` | `menuService`, `communityService` |

```ts
// 사용법
import { api } from "@/services/api-client"; // 직접 Axios
import { services } from "@/services"; // 통합 객체
```

> **주의**: `menuService`와 `communityService`는 `index.ts`에서 export되지 않음. 사용 시 개별 import 필요.

### 컴포넌트 구조

```
src/components/
├── ui/              # Primitive (shadcn): Button, Card, Input, Badge, Table, Dialog, Select, Modal, Textarea, EmptyState, LoadingSpinner, PageHeader, AdminTabs
│   └── core/        # Base: ButtonBase, InputBase, DialogCore, ModalCore, EmptyStateCore, LoadingCore, SkeletonCore
├── common/          # Composed: DataTable, PageHeader, ConfirmModal, SearchInput, StatusBadge, EmptyState, ErrorState, LoadingState
├── icons/           # 아이콘 맵 + barrel export
├── layouts/         # DashboardLayout (accordion sidebar, theme toggle, idle timer)
└── SessionTimeoutModal.tsx
```

`DataTable` (`src/components/common/DataTable.tsx`): 정렬·필터·페이지네이션 내장. 목록 페이지의 표준 테이블.

### 대시보드 라우트 (87개 page.tsx, 2026-04-19 실측)

`members/` · `classes/` · `clubs/` · `attendance/` · `payments/` · `shop/` · `app/` · `notices/` · `notifications/` · `messages/` · `profile/` · `settlements/` · `permissions/` · `users/` · `tournaments/` · `tms/` · `statistics/` · `system/` · `common-codes/` · `products/` · `matches/` · `rinks/` · `settings/` · `approvals/` · `academies/` · `coaches/` · `directors/` · `parents/` · `venues/` · `reports/`

**총 87개 page.tsx** (2026-04-19 실측, 대시보드 외 root·login 등 포함)

### Path Aliases

- `@/*` → `./src/*` (primary)
- `@shared/*` → `../shared/*` (tsconfig + webpack 설정됨, shared 디렉토리는 아직 미생성)

---

## 환경 변수

```bash
NEXT_PUBLIC_API_URL=http://localhost:5003/api/v1  # ⚠️ 포트 5003 (3001 아님!)
```

---

## 주요 파일

| 파일                                         | 역할                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/services/api-client.ts`                 | Axios 인스턴스, 토큰 관리, 인터셉터, `api` export                                       |
| `src/middleware.ts`                          | Edge 미들웨어: JWT 쿠키 검증, 라우트 보호                                               |
| `src/components/layouts/DashboardLayout.tsx` | 사이드바, 테마 토글, idle timer, 쿠키 동기화                                            |
| `src/types/index.ts`                         | 핵심 TypeScript 인터페이스/enum (User, Club, ShopProduct, ApiResponse 등)               |
| `src/types/*.ts`                             | 도메인별 타입 (academy-promotion, common-code, rsvp, tournament-registration, waitlist) |
| `src/lib/environment.ts`                     | Flutter WebView vs 브라우저 감지 (`isNativeApp()`)                                      |
| `src/lib/crypto.ts`                          | 로그인 E2E 암호화 (AES-256-GCM)                                                         |
| `src/lib/sanitize.ts`                        | DOMPurify 기반 XSS 방지 유틸리티                                                        |
| `src/lib/utils.ts`                           | 공통 유틸리티 (cn, clsx+tailwind-merge 등)                                              |
| `src/lib/colors.ts`                          | 컬러 상수                                                                               |
| `src/lib/admin-notice-store.ts`              | 클라이언트 공지 상태 관리                                                               |
| `next.config.js`                             | 환경별 distDir, `@shared` webpack alias, transpilePackages                              |

---

## 디자인 규칙

**AI 스타일 패턴 절대 금지:**

```tsx
// ❌ 금지
bg-gradient-to-r from-* to-*    // 그라디언트
backdrop-blur-*                  // 블러 (헤더 스크롤 예외)
shadow-*-500/30                  // 컬러 그림자

// ✅ 사용
bg-blue-800 hover:bg-blue-900   // 솔리드 컬러
shadow-md                        // 일반 그림자
```

Tailwind 커스텀 컬러: CSS 변수 기반 (`tailwind.config.ts`). `primary`, `success`, `warning`, `error`, `neutral-50..900`, `chart-1..5`.
Dark mode: `class` 전략. `teamplus_theme` 쿠키로 서버사이드 읽기 (FOUC 방지).

---

## ESLint

`next/core-web-vitals` + `next/typescript`. 언더스코어 prefix 미사용 변수 허용:

```json
"@typescript-eslint/no-unused-vars": ["error", {
  "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_"
}]
```

---

## 코딩 컨벤션

- 모든 대시보드 페이지는 `'use client'` 클라이언트 컴포넌트
- 한국어 UI 존댓말: "등록하기", "수정하기", "삭제하기" (영문 금지)
- 백엔드 API: **localhost:5003** (흔한 실수: 3001 아님)
- 백엔드 응답 `{ success: true, data: T }` → `api-client.ts`가 자동 해제
- 미구현 API 페이지: 빈 배열 + `setIsLoading(false)` 초기화 (mock/setTimeout 금지)
- 테마: light/dark 토글 (`teamplus_theme` 쿠키, root layout 서버사이드 읽기)

---

**Last Updated**: 2026-04-19 | **Version**: 2.1 (API Lifecycle v8.5 — `services/api-lifecycle.ts` 신규(PUBLIC_API_PATTERNS·AuthRequiredError·registerDefaultAdminLifecycleHooks) · api-client.ts 전처리 가드 통합 · 로그인 페이지 `reason` 쿼리 안내 배너 + resetAdminAuthGuardRedirectFlag · layout에 preconnect+dns-prefetch · next.config compress+ETag+optimizePackageImports · 1초 SLA 모니터링 — 87 pages / 21 services / 9 hooks)
