# TEAMPLUS Web

아이스하키 클럽 관리 플랫폼 - Next.js 웹 프론트엔드

**Tech Stack**: Next.js 15.5 + React 19 + TypeScript 5.x + Tailwind CSS + shadcn/ui

---

## 📊 Current Status (2026-01-25)

| 항목             | 현황                       |
| ---------------- | -------------------------- |
| **Pages**        | 120+ 페이지                |
| **Route Groups** | 9개 그룹                   |
| **Components**   | 45+ 컴포넌트               |
| **Hooks**        | 11개 커스텀 훅             |
| **Services**     | 12개 서비스                |
| **Architecture** | Hybrid (WebView + Browser) |

### Route Groups

| 그룹         | 페이지 수 | 설명                            |
| ------------ | --------- | ------------------------------- |
| `(auth)`     | 10        | 로그인, 회원가입, 비밀번호 찾기 |
| `(coach)`    | 15        | 코치 전용 (출석관리, 수업관리)  |
| `(parent)`   | 20        | 학부모 전용 (자녀관리, 결제)    |
| `(student)`  | 12        | 학생 전용 (대시보드, 배지)      |
| `(director)` | 18        | 감독 전용 (회원승인, 정산)      |
| `(shared)`   | 25        | 공통 (프로필, 알림, 설정)       |
| `(shop)`     | 15        | 쇼핑몰 (상품, 장바구니, 주문)   |
| `(public)`   | 8         | 공개 (FAQ, 이용약관)            |
| `(common)`   | 10        | 공용 컴포넌트 페이지            |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20 LTS or higher
- npm 10+

### Installation

```bash
# Install dependencies
npm install

# Start development server (port 5001)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router (120+ pages)
│   ├── (auth)/            # 인증 관련 페이지
│   ├── (coach)/           # 코치 전용 페이지
│   ├── (parent)/          # 학부모 전용 페이지
│   ├── (student)/         # 학생 전용 페이지
│   ├── (director)/        # 감독 전용 페이지
│   ├── (shared)/          # 공통 페이지
│   ├── (shop)/            # 쇼핑몰 페이지
│   ├── (public)/          # 공개 페이지
│   └── (common)/          # 공용 페이지
├── components/            # 재사용 컴포넌트 (45+)
│   ├── ui/               # UI 기본 컴포넌트
│   ├── layout/           # Header, BottomNav, MobileContainer
│   ├── chat/             # 채팅 컴포넌트
│   └── providers/        # Context providers
├── contexts/             # React Context
├── hooks/                # Custom Hooks (11개)
├── services/             # API 서비스 (12개)
├── types/                # TypeScript 타입 정의
└── lib/                  # 유틸리티
```

---

## 🔧 Available Commands

```bash
# Development
npm run dev              # Start with hot-reload (port 5001)
npm run build            # Production build
npm start                # Production server
npm run lint             # Run ESLint

# Testing
npm test                 # Run unit tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (70% threshold)
npm run test:e2e         # Playwright E2E (headless 기본)
npm run test:e2e:headed  # 브라우저 표시 + slowMo
npm run test:e2e:ui      # Playwright UI mode
npm run test:e2e:ci      # CI용 headless E2E
```

---

## 🤖 Automated Browser Tests

브라우저 자동 테스트는 Playwright 기반으로 `e2e/` 디렉토리에서 관리합니다.

### Prerequisites

- `teamplus-backend`가 `http://localhost:5003`에서 실행 중
- `teamplus-web`이 `http://localhost:5001`에서 실행 중
- DB 시드 계정 존재
  - `director@teamplus.com`
  - `coach@teamplus.com`
  - `parent@teamplus.com`
  - `teen@teamplus.com`
  - 공통 비밀번호: `Test1234!`
  - `child@teamplus.com`은 PIN 인증이 필요한 별도 시나리오로 검증

### Run by test case

```bash
# 전체 E2E
npm run test:e2e

# 단일 테스트 파일
npm run test:e2e -- e2e/auth-smoke.spec.ts
npm run test:e2e -- e2e/team-crud.spec.ts

# 테스트 이름으로 필터
npx playwright test -g "팀 CRUD"
npx playwright test -g "인증 스모크"

# 로컬 디버그
npm run test:e2e:headed
npm run test:e2e:debug
```

### Artifacts on failure

- `playwright-report/`
- `test-results/`
- trace / screenshot / video 자동 저장

CI에서는 `.github/workflows/teamplus-web-e2e.yml`가 백엔드/웹 서버를 기동한 뒤 Playwright를 실행합니다.

---

## 🏗️ Hybrid Architecture

Web ↔ Native 통신을 위한 하이브리드 아키텍처:

```
경로 A (웹 브라우저): Web → Axios → Backend API
경로 B (Flutter WebView): Web → Native Bridge → Flutter → Backend API
```

### Key Services

| Service            | Description                          |
| ------------------ | ------------------------------------ |
| `api-client.ts`    | 통합 API 클라이언트 (자동 경로 선택) |
| `native-bridge.ts` | Flutter WebView 브릿지               |
| `hybrid-auth.ts`   | 환경별 인증 토큰 관리                |

---

## 🔐 Authentication

- **JWT Token**: 15min access, 7day refresh
- **Middleware**: `src/middleware.ts` (서버사이드 라우트 보호)
- **Context**: `src/contexts/AuthContext.tsx`
- **Hooks**: `useAuth()`, `useRequireAuth()`, `useRequireRole()`

### User Roles (6)

| Role       | Description    |
| ---------- | -------------- |
| `ADMIN`    | 시스템 관리자  |
| `DIRECTOR` | 클럽 감독      |
| `COACH`    | 코치           |
| `PARENT`   | 학부모         |
| `TEEN`     | 10세+ 학생     |
| `CHILD`    | 10세 미만 학생 |

---

## 🎨 Design System

- **UI Library**: Tailwind CSS + shadcn/ui
- **Color System**: Primary Blue (#1E3FAE), slate backgrounds
- **Dark Mode**: 지원 (dark: prefix)
- **Accessibility**: WCAG 2.1 AA (아이 UI: AAA)

> 상세: `/docs/Design/WEB_DESIGN_SYSTEM.md`

---

## 📞 Environment Variables

| Variable              | Description     | Default                 |
| --------------------- | --------------- | ----------------------- |
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:5003` |

---

**Version**: 2.0.0
**Last Updated**: 2026-01-25
**Status**: MVP 85% Complete
