# CLAUDE Standards — 디자인 · Tone & Manner · 보안 · 아키텍처 · 비즈니스 · DB · 파일 위치

> CLAUDE.md에서 분리한 **코드 품질·컨벤션 표준 상세**. CLAUDE.md는 한 줄 요약 + 이 문서 링크로 구성.

---

## 🎨 Frontend Design Standards

> **Root SoT**: [`/DESIGN.md`](/DESIGN.md) (12 섹션 진입점) · [`tailwind.config.cjs`](/teamplus-web/tailwind.config.cjs) (토큰 단일 출처)
>
> **🔄 2026-05-23 SoT 동기화 v9.4** — Backend 152 모델·19 enum·81 컨트롤러·773 routes / Web MESSAGES 1차 키 200·245 pages·352 컴포넌트·71 hooks / App 211 dart·29 features·16 Bridge handlers / Home 13 pages 신규. 디자인 위반 0 유지(헤더 blur 예외 1건).
> **🔄 2026-05-07 SoT 동기화** — 컬러 토큰 표를 Wallet v2 (`ice-500 #2f5fff`) 기준으로 갱신. 특수 카테고리 토큰(`brand.*`/`qr.*`/`bubble.*`) 신규 명시. Pretendard 단일 폰트 SoT 정정.

- **Design 7원칙** — ① 화면 분석 먼저 ② 휴먼 디자인(사람처럼) ③ AI 스타일 금지 ④ 페르소나 융합(`--persona-frontend`·`--persona-architect`·`--ultrathink`) ⑤ 명령어 필수 ⑥ 결과 출력 시 7원칙 표기 ⑦ 한글 존댓말·표준 메시지
- **AI 스타일 금지 (필수)** — `bg-gradient-to-*` · `backdrop-blur-*` · `shadow-*-500/30` 사용 금지 (유일 예외: 헤더 스크롤 투명도 `bg-white/80 backdrop-blur-md`)
- **허용** — `bg-ice-500 hover:bg-ice-600` · `shadow-sh-1`/`sh-2` · 솔리드 컬러 + TEAMPLUS shadow 토큰

### 컬러 토큰 (Wallet v2 — `tailwind.config.cjs` SoT)

**브랜드 코어**:

- Primary CTA: `ice-500` (`#2f5fff`) · hover `ice-600` (`#1f47e6`) · active `ice-700` (`#1837b8`)
- 다크 표면: `rink-800` (`#1f2536`) · `rink-900` (`#141826`) · `puck` (`#0a0d14`)
- 라이트 표면: `wbg` (`#f6f8fc`) · `wsurface` (`#ffffff`) · `wline`/`wline-2` (`#e5e9f2`/`#eef1f7`)
- 액센트 (절제 사용): `flame-500` (`#ff5a36` 긴급) · `mint-500` (`#00d4a8` 성공) · `sun-500` (`#ffc940` 주의)
- 텍스트 4단계: `wtext-1`(`#0a0d14`) → `wtext-4`(`#9aa4ba`)

**특수 카테고리 (RULE-8 임의 hex 금지의 합법적 예외)**:

- 소셜/PG: `brand.kakao`(`#FEE500`)/`brand.kakao-pay`(`#FAE100`)/`brand.kakao-text`(`#371D1E`)/`brand.naver`(`#03C75A`)/`brand.samsung`(`#1428A0`)/`brand.line`(`#06C755`)/`brand.facebook`(`#1877F2`)
- QR 카메라: `qr.bg`(`#0a0a0a`) · `qr.scan`(`#3DDC84` Android Green)
- 채팅 버블: `bubble.in`(`#f3f4f6`) · `bubble.in-dark`(`#2d3342`)

**legacy 토큰** (점진 deprecation): Primary `#1E3FAE` · Primary Dark `#152B7A` — `globals.css` 의 `--ice-primary` CSS 변수로 추상화되어 `tailwind.config.cjs` 의 `primary.*` ramp 와 연결. 신규 코드는 Wallet v2 `ice-*` 직접 사용 권장.

### 타이포 (Pretendard 단일 SoT)

- 본문: **Pretendard** (`-apple-system` → `BlinkMacSystemFont` → `system-ui` → `sans-serif` 폴백)
- 숫자: **`font-num` = Pretendard + `tabular-nums`** (이전 Inter CDN 외부 의존 표기 → 정정 완료)
- 스케일: `text-w-display`(44) / `-h1`(34) / `-h2`(28) / `-h3`(22) / `-title`(18) / `-body-lg`(16) / `-body`(15) / `-small`(13) / `-caption`(12)
- Fluid: `text-w-*-fluid` — `clamp()` 기반, iPhone SE(320) ~ iPad mini(768) 한 토큰 대응

### Shadow (6종)

`sh-1` 휴식 / `sh-2` Hero / `sh-3` 모달 / `sh-4` 풀스크린 오버레이 / `sh-blue` 브랜드 강조(`rgba(47,95,255,.28)`) / `sh-rink` 다크 hero(`rgba(20,24,38,.32)`).

> **금지**: `shadow-blue-500/30` 같은 컬러 그림자는 RULE-1 위반 — `sh-blue`/`sh-rink` 만 합법.

- **HTML 붙여넣기·디자인 요청 처리 (MUST)** — 반드시 [web-page 스킬](../../.claude/skills/web-page/) 또는 [frontend-design-master 에이전트](../../.claude/agents/frontend-design-master.md) 활용하며, **AppBar(Header)·BottomNav 영역은 절대 건드리지 않고 body(contents) 영역만** 작업 (`MobileContainer` 내부 콘텐츠만, `BackHeader`·`*BottomNav` 컴포넌트는 수정·교체·래핑 금지)
- **상세** — [WEB_DESIGN_SYSTEM](../Design/WEB_DESIGN_SYSTEM.md) · [COMPONENT_PATTERNS](../Design/COMPONENT_PATTERNS.md) · [DESIGN_CONSISTENCY_ANALYSIS](../Design/DESIGN_CONSISTENCY_ANALYSIS.md)

---

## 📝 Tone & Manner

- **버튼 레이블** — "등록하기" "수정하기" "삭제하기" "저장하기" "확인" "취소" (Submit·Add·Edit·Update·Delete·Save·OK·Confirm·Cancel 영문 금지)
- **비즈니스 용어** — 수업(O) · 클래스(X) / 출석(O) · 체크인(X) / 회원(O) · 유저(X)
- **메시지 상수** — 하드코딩 금지, [`/teamplus-web/src/lib/messages.ts`](../../teamplus-web/src/lib/messages.ts) **단일 MESSAGES 객체 (1차 키 200개)** 사용 (`class · enrollment · attendance · grade · verify · dashboard · coach · director · feedback · shop · notification · awards · calendar · notice · approval · rsvp · waitlist · tournament · common · match · ui` 외 · 실측 2026-05-23)

---

## 🔒 보안 핵심 규칙

- **인증** — JWT 15분 만료 + Refresh 7일, bcrypt salt ≥10, RBAC `@Roles()` + `RolesGuard`, 계정 잠금 `account-lockout.service.ts`
- **Rate Limiting** — Throttler 100 req/min (Redis 기반)
- **입력 검증** — `class-validator` DTO, XSS 방어 `DOMPurify`(Web) · `sanitize-html`(Backend)
- **결제** — 카드 데이터 저장 **절대 금지**, KG이니시스 토큰화 사용, Webhook 서명 검증 필수 ([platform-connector 에이전트](../../.claude/agents/platform-connector.md))
- **모바일** — SSL Pinning(Phase 7) · 루팅/탈옥 감지 · 생체인증
- **법적** — PIPA 준수 · WCAG 2.1 AA(일반) / AAA(아동 UI 72x72dp · 7:1 대비율)
- **상세** — [API_ARCHITECTURE](../API/API_ARCHITECTURE.md) · 보안 점검: [backend-analyzer 에이전트](../../.claude/agents/backend-analyzer.md)

---

## 🏗️ 아키텍처 핵심 패턴

- **Hybrid WebView Bridge** — Flutter 앱이 Next.js WebView 로드, Web→Native 핸들러 7개(`auth · identity · qr · navigation · payment · ui · api`), Flutter 측 등록 Bridge 10개(`auth · qrScan · payment · biometric · notification · navigation · identityVerification · api · cancelRequest · ui`) — [`native-bridge.ts`](../../teamplus-web/src/services/native-bridge.ts) · [`webview_bridge.dart`](../../teamplus-app/lib/core/webview/webview_bridge.dart)
- **화면 해상도 기반 Auto Layout (2026-05-09 SoT)** — Flutter `MediaQuery` (logical px) → Bridge push (`didChangeMetrics` → `sendDeviceMetricsToWeb`) → Web `subscribeToDeviceMetrics` → CSS 변수 (`--screen-width`, `--screen-height`, `--viewport-{w,h}`, `--safe-area-inset-*`, `--device-orientation`, `--device-platform`, `--device-pixel-ratio`, `--keyboard-inset-bottom`) + `[data-screen-bp="xs|sm|md|lg|xl"]` 속성 1프레임 내 갱신. **단일 진입점**: `ClientProviders.subscribeToDeviceMetrics()` 1회 호출만 허용. **CSS-only (권장)**: `var(--mobile-page-x)` · `[data-screen-bp="xs"] .card { padding: 8px; }`. **React 분기**: `useScreenMetrics()` 훅. **금지**: `width: 360px` 하드코딩 / `window.innerWidth` 직접 읽기 / `window.addEventListener('resize')` 페이지 직접 등록 / `safe-area-inset` env() 단독(Android 0px) — [`SCREEN_METRICS.md`](../Architecture/SCREEN_METRICS.md) SoT
- **API 클라이언트** — [`api-client.ts`](../../teamplus-web/src/services/api-client.ts)에서 `isNativeApp()` 자동 감지, 환경별 Base URL 선택, 토큰 자동 첨부, 만료 5분 전 선제 갱신, 401 singleton refresh promise로 race condition 방지
- **API Lifecycle (v8.5+)** — 4-플랫폼 통합 전처리/후처리 훅 시스템: Backend `ApiLifecycleInterceptor` 전역 등록(X-Request-ID UUID 생성·X-Client-Platform 파싱·X-Response-Time 주입·UserActivityService Redis 5분 throttle로 `User.lastActiveAt` 갱신·1초 초과 시 `[SLA_BREACH]` WARN) · Web/Admin `apiLifecycle.subscribe({ beforeRequest, afterResponse, onError })` pub/sub 레지스트리 + `PUBLIC_API_PATTERNS` 화이트리스트 기반 전처리 로그인 가드(`AuthRequiredError` throw → `/login?redirect=<path>&reason=required|expired` 자동 유도) · Flutter `ApiLifecycleInterceptor`+`AuthGuardInterceptor`+`EtagCacheInterceptor`(LRU 100 엔트리 · 304 자동 복구) · [SPEC_API_LIFECYCLE](../Planning/SPEC_API_LIFECYCLE.md)
- **인증 저장** — JWT Access(15분) + Refresh(7일) — Web: localStorage + httpOnly Cookie · Admin: localStorage(API) + Cookie(미들웨어) `teamplus_access_token`/`teamplus_refresh_token` · App: `flutter_secure_storage`
- **성능 표준 (v8.5+)** — gzip compression(threshold 1KB · 대형 응답 85% 감소 실측) · HTTP keep-alive(65s timeout) · ETag(Weak) · Redis 캐시(AppSettings 5m TTL · Notifications unread 30s TTL · 쓰기 시 자동 무효화) · Prisma `connection_limit=25` · Flutter 타임아웃 5s/10s/15s · Web `preconnect`+`dns-prefetch` · Next.js `compress:true`+`generateEtags:true`+`optimizePackageImports` · **목표 SLA 1초 이내**, 4-플랫폼 `[SLA_BREACH]` 로그 자동 발생
- **API 경로 규칙** — `api/v1/{domain}[/:id][/sub-resource]`
- **상세** — [API_BRIDGE_IMPLEMENTATION](../Architecture/API_BRIDGE_IMPLEMENTATION.md) · [FRONTEND_ARCHITECTURE](../Architecture/FRONTEND_ARCHITECTURE.md) · [ARCHITECTURE_COMMUNICATION](../Architecture/ARCHITECTURE_COMMUNICATION.md) · [API_SPECIFICATION](../API/API_SPECIFICATION.md) · [SPEC_API_LIFECYCLE](../Planning/SPEC_API_LIFECYCLE.md)

---

## 🔁 API 응답 매퍼 — Dual Emit 패턴 (2026-05-20 신규)

> **목적**: Prisma include → select 최적화, 관계 모델 rename, 필드 rename 등으로 **응답 키가 바뀌어야 할 때** 프론트엔드 무수정 호환을 보장하면서 점진 마이그레이션하는 표준 패턴.
>
> **유래**: 2026-05-20 T3 라운드 2(`/kcs-agents-teams` 4-Team 파이프라인) — shop categories(`depth/sortOrder`) + overseas-trips(`clubId/club`) 응답 키가 admin·web과 충돌하여 라운드 1 6.2/10 불합격 → dual emit 도입 후 라운드 2 9.9 → spec 9 cases로 라운드 3 **10.0/10 S** 합격.

### 정의

백엔드 응답 매퍼에서 **새 키(canonical)와 구 키(alias)를 동시에 emit**하여, 프론트엔드 변경 0건으로 호환성을 유지하는 패턴.

```typescript
// 매퍼 (canonical: level/displayOrder | alias: depth/sortOrder)
return {
  level: category.level, // canonical (신규 키)
  depth: category.level, // alias (admin 기존 키 호환)
  displayOrder: category.displayOrder,
  sortOrder: category.displayOrder, // alias
  // ...
};
```

### 적용 사례 (T3 라운드 2 — 4 매퍼)

| 매퍼                                               | Canonical (신규)           | Alias (구 키 — admin/web 호환) |
| -------------------------------------------------- | -------------------------- | ------------------------------ |
| `ShopService.mapToCategoryResponse()`              | `level`                    | `depth`                        |
| `ShopService.mapToCategoryResponse()`              | `displayOrder`             | `sortOrder`                    |
| `OverseasTripsService.mapToOverseasTripResponse()` | `team.id`                  | `clubId`                       |
| `OverseasTripsService.mapToOverseasTripResponse()` | `team.name`                | `club.clubName`                |
| `OverseasTripsService.findAllTrips()`              | `team.{id,name}` (각 trip) | `clubId`, `club.clubName`      |
| `OverseasTripsService.createTrip()`                | `team.{id,name}` (응답)    | `clubId`, `club.clubName`      |
| `OverseasTripsService.updateTrip()`                | `team.{id,name}` (응답)    | `clubId`, `club.clubName`      |

### 사용 시기 (적용 조건)

- ✅ **Prisma include → select 최적화로 응답 페이로드 형태가 바뀔 때** (오버패치 제거 + 키 정리)
- ✅ **DB 모델 rename** (예: `Club` → `Team`) 후 응답 키 통일 필요 시
- ✅ **필드 rename** (예: `depth` → `level`) 후 프론트엔드 사용처가 5+ 페이지에 흩어져 있을 때
- ❌ 신규 엔드포인트 신설 — 처음부터 canonical 키만 사용 (alias 불필요)
- ❌ 프론트엔드 사용처가 1~2곳 — 직접 마이그레이션이 더 간단

### 구현 패턴 (4단계)

**1. 매퍼 함수에서 양쪽 키 emit** — 1:1 매핑, 동일 값 보장

```typescript
private mapToCategoryResponse(category: CategoryTreeNode): ShopCategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    level: category.level,
    depth: category.level, // dual emit: depth ← level (admin 호환)
    displayOrder: category.displayOrder,
    sortOrder: category.displayOrder, // dual emit: sortOrder ← displayOrder
    // ...
  };
}
```

**2. Response DTO에 alias 필드 명시** — Swagger 문서화 + deprecated 경고

```typescript
export class ShopCategoryResponseDto {
  @ApiProperty({ description: "계층 레벨", example: 1 })
  level!: number;

  @ApiProperty({
    description:
      "계층 깊이 (`level` 별칭 — admin 호환성, 신규 클라이언트는 `level` 권장)",
    example: 1,
    deprecated: false, // 사용 가능하지만 신규 코드는 canonical 사용 권장
  })
  depth!: number;
  // ...
}
```

**3. 매퍼 unit spec로 회귀 안전망 확보** — alias가 canonical과 항상 동일한 값임을 검증

```typescript
it("depth는 level과 동일하게 dual emit", () => {
  const result = service.mapToCategoryResponse({ ...input, level: 2 });
  expect(result.level).toBe(2);
  expect(result.depth).toBe(2);
  expect(result.depth).toBe(result.level); // 1:1 매핑 보장
});
```

**4. 매퍼 주석에 의도 명시** — 향후 제거 시점 판단을 위한 컨텍스트 기록

```typescript
/**
 * 2026-05-20 dual emit (T3 재수정) — 프론트엔드 호환:
 * - `depth` ← `level` (admin 사용처: c.depth, c.depth < maxLevel)
 * - `sortOrder` ← `displayOrder` (admin form 필드)
 * 프론트엔드 변경 없이 양쪽 키 모두 응답 — production UI 깨짐 방지.
 */
```

### 제거 정책 (점진 마이그레이션)

1. **Phase A (현재)** — 백엔드 dual emit + 프론트엔드 기존 키 사용 (호환성 100%)
2. **Phase B** — 프론트엔드 사용처를 canonical 키로 점진 마이그레이션 (별도 PR)
   - `grep -rn "c\.depth\|c\.sortOrder" teamplus-admin/src` 로 잔존 확인
   - 페이지별 PR 분리 권장 (영향 최소화 + 롤백 용이)
3. **Phase C** — 모든 클라이언트 마이그레이션 완료 확인 후 alias 제거
   - DTO에서 `@ApiProperty deprecated: true` → 다음 sprint에서 필드 제거
   - 매퍼 코드 + spec에서 dual emit 라인 제거
   - changelog에 breaking change 명시 + 1~2 sprint 유예 기간 공지

### 금지 사항

- ❌ **DB 자체에 양쪽 컬럼 저장** — alias는 매퍼 레벨에서만 emit, DB는 canonical만 저장 (단일 진실의 출처)
- ❌ **양쪽 키가 서로 다른 값** — 반드시 1:1 매핑, alias = canonical 보장 (spec로 검증)
- ❌ **신규 엔드포인트에 alias 추가** — 신규는 처음부터 canonical만, 기술 부채 누적 방지
- ❌ **`@deprecated` JSDoc 표시 없이 영구 유지** — 6개월 이상 잔존 시 제거 PR 강제 (코드 리뷰 시 체크)

### Cross-reference

- **실구현** — [`shop.service.ts`](../../teamplus-backend/src/shop/shop.service.ts) `mapToCategoryResponse` · [`overseas-trips.service.ts`](../../teamplus-backend/src/overseas-trips/overseas-trips.service.ts) 4 매퍼
- **Response DTO** — [`shop-category-response.dto.ts`](../../teamplus-backend/src/shop/dto/responses/shop-category-response.dto.ts) · [`overseas-trip-response.dto.ts`](../../teamplus-backend/src/overseas-trips/dto/responses/overseas-trip-response.dto.ts)
- **Unit spec** — [`shop.service.spec.ts`](../../teamplus-backend/src/shop/shop.service.spec.ts) · [`overseas-trips.service.spec.ts`](../../teamplus-backend/src/overseas-trips/overseas-trips.service.spec.ts)
- **QA 사례** — [`QA_REPORT.md`](../../QA_REPORT.md) §B (T3 3 라운드) · §J (Phase 6) · §L (Phase C 전체 완주)

### 실제 적용 사례 — Phase A/B/C 전체 완주 (2026-05-20)

shop categories (`depth/sortOrder`) 와 overseas-trips (`clubId/club`) 의 alias 마이그레이션이 **한 sprint 내 A → B → C → D 전 단계 완주** 한 사례:

| 단계                      | 작업                                                                     | 결과                                   |
| ------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| **Phase A** (T3 라운드 2) | 백엔드 매퍼 dual emit 도입 (canonical + alias)                           | admin/web 호환성 100% 회복             |
| **Phase B** (Phase 6)     | 프론트엔드 점진 마이그레이션 (canonical 우선 + alias fallback)           | admin shop categories · web 3개 페이지 |
| **Phase C-A**             | 잔존 alias 사용처 grep 검증                                              | 모든 잔존이 의도된 fallback 확인       |
| **Phase C-B**             | 응답 DTO alias 필드 `@deprecated true` Swagger 어노테이션                | 외부 API 소비자 경고 명시              |
| **Phase C-C**             | 요청 DTO 마이그레이션 (`displayOrder` 추가, `sortOrder` deprecated 유지) | 양쪽 키 수용                           |
| **Phase C-D**             | alias 완전 제거 (매퍼 emit + DTO 필드 + 요청 키 + fallback 코드)         | canonical only — 기술 부채 0           |

> **단축 사이클 적용 조건**: Flutter app 등 외부 소비자가 이미 `(team ?? club)` fallback 적용 → 1 sprint 내 완주 가능. 외부 소비자 영향도가 불확실하면 **반드시 별도 sprint 분리**.

---

## 🔌 포트 & 환경변수 SoT (Single Source of Truth)

TEAMPLUS 의 모든 포트·URL fallback 은 `src/lib/env.ts` 의 `PORTS` 상수를 **단일 출처**로 사용한다. 코드 내 `localhost:5003` 같은 숫자 하드코딩 **금지**.

### 표준 포트

| 서비스           | 포트     | 환경변수           |
| ---------------- | -------- | ------------------ |
| teamplus-backend | **5003** | `BACKEND_PORT`     |
| teamplus-web     | **5001** | Next.js dev server |
| teamplus-admin   | **5002** | Next.js dev server |
| teamplus-home    | 5010     | —                  |
| tbot             | 7788     | —                  |

### 포트·URL 변경 시 수정 지점 (순서대로)

1. `teamplus-web/src/lib/env.ts` — `PORTS` 상수 (SoT)
2. `teamplus-admin/src/lib/env.ts` — `PORTS` 상수 (web 과 **동일 값 유지 필수**)
3. `teamplus-backend/src/main.ts` — `BACKEND_PORT` fallback (2곳: 서버 listen + Swagger addServer)
4. `teamplus-web/next.config.js` — CSP `extraConnectSrc` 포트
5. `teamplus-web/.env.example` · `teamplus-admin/.env.example` — 예시 값
6. `Jenkinsfile` — sed 치환 패턴 + Health Check curl 포트 (운영 파이프라인 · 별도 PR 권장)
7. 루트 `CLAUDE.md` · `docs/Guides/DEV_COMMANDS.md` — 문서 포트 표

### ❌ 금지 패턴

```typescript
// ❌ 하드코딩
const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5003";

// ❌ 숫자 리터럴 직접 사용
const port = 5003;
```

### ✅ 올바른 사용

```typescript
// Frontend (web/admin 공통)
import { env, PORTS } from "@/lib/env";
const url = env.NEXT_PUBLIC_API_URL; // fallback 또는 env 값
const webPort = PORTS.web; // 5001

// Backend (main.ts 만 예외)
const port = process.env.BACKEND_PORT || 5003; // fallback 은 PORTS.backend 와 동일
```

### ⚠️ Next.js 환경변수 인라인 함정 (반드시 읽을 것)

Next.js 는 `NEXT_PUBLIC_*` 환경변수를 **빌드 시점**에 클라이언트 JS 번들로 치환한다. 이 치환은 **정적 접근에만** 적용된다. 아래 패턴은 클라이언트에서 `undefined` 가 되어 **fallback 만 사용 → 장애 유발**:

```typescript
// ❌ 금지 — 동적 인덱스 접근 (클라이언트 번들에서 undefined)
const key = "NEXT_PUBLIC_API_URL";
const value = process.env[key];

// ❌ 금지 — 함수로 감싸서 동적으로 읽기
function readEnv(key: string) {
  return process.env[key];
}
const value = readEnv("NEXT_PUBLIC_API_URL");

// ❌ 금지 — 변수에 담긴 키로 접근
const envKey: string = getApiKey();
const value = process.env[envKey];
```

```typescript
// ✅ 올바른 사용 — 정적 식별자 접근
const value = process.env.NEXT_PUBLIC_API_URL || fallback;

// ✅ 올바른 사용 — env.ts 래퍼 (내부 구현도 정적 접근)
// src/lib/env.ts
export const env = {
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL || `http://localhost:${PORTS.backend}`,
};
```

**원인**: Next.js 의 webpack 치환은 AST 상 `MemberExpression(process.env, <Identifier>)` 만 인식한다. `MemberExpression(process.env, <Computed>)` 는 치환 대상에서 제외. 클라이언트 번들에는 `process.env` 객체 자체가 포함되지 않으므로 동적 접근은 `undefined` 반환.

**검증 방법** (커밋 전):

```bash
# 동적 접근 잔존 확인
grep -rn "process\.env\[" teamplus-web/src teamplus-admin/src

# 빌드 후 번들에 실제 값 박혔는지 확인
NEXT_PUBLIC_API_URL=http://test-host:5003 npm run build
grep -r "test-host:5003" .next/static/chunks/ | head -3
```

### Admin 특수 케이스 — `/api/v1` suffix

`teamplus-admin/.env.local` 은 관례상 `NEXT_PUBLIC_API_URL=http://.../api/v1` 처럼 suffix 를 포함한다. `env.ts` 는 suffix 유무에 관계없이 두 가지 형태를 정규화해서 제공:

| 소비처                                        | 필요 형태               | 사용할 export             |
| --------------------------------------------- | ----------------------- | ------------------------- |
| api-client baseURL                            | `/api/v1` 포함          | `env.NEXT_PUBLIC_API_URL` |
| upload.service · preconnect · 이미지 URL 조립 | `/api/v1` 미포함 origin | `env.API_ORIGIN`          |

### `.env.local` 관리

- **gitignore 처리됨** — 개인 개발 설정 저장용 (`.env*.local`)
- 팀 공용 템플릿은 `.env.example` — 로컬 개발 시 복사해서 사용
- Jenkins 배포는 `teamplus-web/.env.local` 이 없을 때 **자동 생성** (배포 IP 기준)
- `teamplus-admin/.env.local` 은 원격 공용 백엔드를 가리킬 수 있음 (팀 규칙 · 개발자 담당 영역)

### 환경변수 표준

| 변수                     | fallback 기본값                                                        | 서비스                 |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------- |
| `NEXT_PUBLIC_API_URL`    | `http://localhost:5003` (web) / `http://localhost:5003/api/v1` (admin) | Web/Admin              |
| `NEXT_PUBLIC_WS_URL`     | API URL 과 동일 호스트                                                 | Web                    |
| `NEXT_PUBLIC_WEB_ORIGIN` | `http://localhost:5001`                                                | Web (Bridge 허용 목록) |
| `BACKEND_PORT`           | 5003                                                                   | Backend                |
| `BACKEND_HOST`           | `0.0.0.0`                                                              | Backend                |

### CSP 자동 확장

`teamplus-web/next.config.js` 는 `NEXT_PUBLIC_API_URL` 의 호스트를 파싱해서 `connect-src` 에 자동 추가한다. localhost/127.0.0.1 외 IP 는 호스트+`5001/5003` 포트 조합이 자동 허용되므로 별도 CSP 수정 불요.

---

## 💼 비즈니스 핵심 로직

- **크레딧** — 결제 완료 → `MemberCredit` 즉시 생성 → QR 체크인 시 1크레딧 차감(`CreditTransaction` 기록) → 수업 취소 시 복원 → 만료 90일(`expiresAt`)
- **결제(KG이니시스)** — 상품 선택 → `orderNumber` UUID 생성(unique) → PC iframe / Mobile 리다이렉트 → Webhook 서명 검증 → DB 반영(멱등성: 중복 요청 시 기존 레코드 반환)
- **QR 출석** — 코치 `POST /attendance/qr-generate` (5분 유효) → 학생/부모 스캔 → `POST /attendance/check-in` → 크레딧 차감
- **출석 시간 윈도우** — 학부모/학생 출석 가능 구간 = **수업 시작 −60분 ~ 종료시각(`endTime`)** (endTime 없으면 시작 +120분 폴백). 현재 시각은 **기기 시계가 아닌 서버 시각 기준**(백엔드 `Date.now()` / 프론트는 `X-Server-Time` 헤더 offset — `teamplus-web/src/lib/server-clock.ts`). 노출(프론트)·검증(백엔드) **동일 규칙 SoT**: [`schedule-time.util.ts`](../../teamplus-backend/src/common/utils/schedule-time.util.ts) `computeAttendanceWindow` ↔ [`attendance-window.ts`](../../teamplus-web/src/lib/attendance-window.ts) `getAttendanceWindowState`. **임계값 변경 시 백엔드 `validateTimeWindow` · 프론트 `getAttendanceWindowState` 양쪽을 반드시 동기화**(불일치 시 "버튼은 보이는데 출석 거부" 회귀). 노출은 `ClassCalendarSection`/`SelectedDayClassList` 한 곳에 집중되고, **코치/감독은 윈도우 무관**(`canManage` 수동 출석 — `coach-check-in`). 학생은 운영상 미로그인.
- **알림(Alimtalk)** — Redis 큐 → 3회 재시도 → SMS 폴백 (카카오 템플릿 사전 승인 필수)
- **조회수 카운트** — 모든 viewCount 도메인은 `ViewCounterService.tryIncrement()` 경유 1일 1회 제한 (`DailyViewLog` UNIQUE 기반)

---

## 🗄️ 데이터베이스 원칙

- **"되겠지" 마인드셋 절대 금지** — 쿼리 전 실제 DB 검증, JOIN 조건·컬럼명·FK 관계 확인 필수
- **검증 순서** — API 개발 → curl/Swagger 독립 테스트 완료 → 프론트 연동
- **N+1 방지** — `prisma.findMany({ select: {...} })`로 필요한 필드만 명시 ([db-architect 에이전트](../../.claude/agents/db-architect.md))
- **스키마 규모** — **152 Prisma 모델 · 19 Enum · 12 마이그레이션** (2026-05-23 실측) → [schema.prisma](../../teamplus-backend/prisma/schema.prisma) · [ERD](../Database/ERD.md) · [SCHEMA_MIGRATION_GUIDE](../Database/SCHEMA_MIGRATION_GUIDE.md)
- **UserType enum** — **9개 역할** (2026-04-20 v8.6 · SYSTEM/OPER 추가): `SYSTEM · OPER · ADMIN · DIRECTOR · ACADEMY_DIRECTOR · COACH · PARENT · TEEN · CHILD`
  - **SYSTEM · OPER** — ADM 전용 (어드민 대시보드 `/auth/admin/login`). 일반 APP 화면 로그인 금지
  - **ADMIN** — 레거시 호환 (APP 화면 로그인 + 기존 admin@teamplus.com tbot 계정 호환)
  - **DIRECTOR · ACADEMY_DIRECTOR · COACH · PARENT · TEEN · CHILD** — APP 전용 (`/auth/login`)

---

## ⏰ 시간 처리 규약 (2026-07-03 신규 — 타임존 재설계 Step 1~3·5 반영)

> 설계 SoT: [timezone-storage-redesign-2026-07-02.md](../../claudedocs/timezone-storage-redesign-2026-07-02.md) · 전환 체크리스트: [docs/solutions/2026-07-02-timezone-step3-scheduled-date.md](../solutions/2026-07-02-timezone-step3-scheduled-date.md)

**컬럼 의미 3분류 (신규 스키마 설계 시 필수 준수)**:

| 의미 | Prisma 타입 | 규약 |
|---|---|---|
| 절대 시점 (createdAt·approvedAt·expiresAt 등) | `DateTime @db.Timestamptz(3)` | UTC 저장, 표시 변환은 프론트(브라우저 KST)에서만 |
| 달력 날짜 (scheduledDate·birthDate·startDate 류) | `DateTime @db.Date` | **write = UTC 자정** `dateOnlyToUtc()` (+09:00 파싱 금지 — 전일 오저장), 추출 = `toISOString().slice(0,10)` 직접 |
| 하루 중 시각 | `String` "HH:mm" | 텍스트 원문 그대로, 변환 금지 |

**절대 규칙**:

- **유틸 SoT** — [`src/common/utils/kst-date.util.ts`](../../teamplus-backend/src/common/utils/kst-date.util.ts) (`dateOnlyToUtc`·`dateOnlyToString`·`composeKstInstant`·`utcDayRange`·`kstTodayUtcMidnight`·`addUtcDays`·`nowKstParts`) · 시각 해석은 [`schedule-time.util.ts`](../../teamplus-backend/src/common/utils/schedule-time.util.ts). 인라인 시간 계산 신규 작성 금지
- **오프셋 없는 파싱 금지** — `new Date("...T00:00:00")` 은 서버 TZ 의존. 반드시 `Z` 또는 `+09:00` 명시 (**tz-guard가 빌드 실패시킴** — `npm run tz:guard`, prebuild 자동 실행)
- **백엔드 `toLocaleTimeString`/`toLocaleDateString` 금지** — 서버 TZ 재변환 시프트 (tz-guard 검출). 시각 표시는 startTime("HH:mm") SoT 또는 `resolveScheduleTime`
- **scheduledDate 등 @db.Date 값에서 시각(HH:mm) 유도 금지** — 시각 정보가 없음(UTC 자정). 프론트 fallback은 "시간 미정" 표시
- **서버 TZ = Asia/Seoul 고정** — pm2 ecosystem `TZ` env + main.ts 방어선. **UTC로 변경 금지** (미전환 B군 컬럼의 레거시 코드가 KST 전제 — Step 4 완료 전 변경 시 데이터 혼재)
- **+9h 오프셋 트릭은 반드시 `getUTC*` getter와 짝** — 로컬 getter 조합 시 이중 시프트 (files.service 사고 사례)
- **마이그레이션 대형 SQL은 psql 직접 실행** — `prisma db execute` 는 socket_timeout 후 서버 지속 실행 함정 ([Step 2 사고](../solutions/2026-07-02-timezone-step2-timestamptz.md))

---

## 📁 파일 생성 위치 규칙

| 영역    | 경로                     | 키워드                                                                            |
| ------- | ------------------------ | --------------------------------------------------------------------------------- |
| Backend | `/teamplus-backend/src/` | API · endpoint · model · database · auth · service · middleware · prisma · schema |
| Web     | `/teamplus-web/src/`     | page · component · hook · state · style · layout · tailwind                       |
| Admin   | `/teamplus-admin/src/`   | (웹과 동일 + admin 전용)                                                          |
| Mobile  | `/teamplus-app/lib/`     | Flutter · dart · 네이티브 · WebView · bridge                                      |
| Docs    | `/docs/`                 | README.md · CLAUDE.md 제외                                                        |

- **테스트 파일** — 개발 중 `/test/`에 생성, 완료 후 즉시 삭제
- **불확실 시** — `AskUserQuestion`으로 사용자에게 확인

**Last Updated**: 2026-05-23 (실측 SOT v9.4 동기화 — 모델 152·MESSAGES 200·web 245p·home 13p 신규)
