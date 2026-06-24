# TEAMPLUS 디자인 진입점 (DESIGN.md)

> **루트 SoT 진입점** — TEAMPLUS **Web** (`teamplus-web`) 의 모든 시각 표준은 본 문서를 시작으로 확장됩니다. Admin/App 표준은 별도 문서를 따릅니다 ([DESIGN_APP](docs/Design/DESIGN_APP.md)).
> 작성: 2026-04-29 · 갱신: 2026-05-23 (실측 SOT 동기화 — 245 pages · 352 컴포넌트 · 71 훅 · dark 9,269 · MESSAGES 200 keys) | 이전: 2026-05-14
>
> ⚠️ **ICETIMES(하우머치) 디자인 롤아웃 진행 중** (2026-06-24~) — 일부 화면이 `it-*` 토큰 + `iceTheme` variant로 ICETIMES 스타일로 전환되었습니다(기존 ice-500 SoT와 **공존**). 적용 범위·토큰·flat 패턴·검증 기준은 [ICETIMES_ROLLOUT](docs/Design/ICETIMES_ROLLOUT.md) 참조. 미적용 화면은 본 문서 SoT를 따릅니다.

---

## 1. 한 줄 정의

TEAMPLUS 웹 디자인은 **"정제된 핀테크 휴먼"** — 깨끗한 회색 캔버스(`#f6f8fc`) + 흰색 카드 + 단일 인디고(`#2f5fff`) 강조 + 어두운 슬레이트(`#1f2536`) 보조 패널. **그라데이션 0건 · backdrop-blur 0건(헤더 스크롤 예외) · AI 자동화 톤 0건**. 신한플레이를 시각 출처로 삼되, TEAMPLUS 토큰(`tailwind.config.cjs`)과 컴포넌트(`components/wallet/*`, 7종)를 단일 진실로 사용한다.

> **2026-05-23 실측**: 245 page.tsx · 352 컴포넌트 · 71 훅 · `bg-gradient-to-*` 실사용 **0건** (주석 3건은 회피 가이드) · `backdrop-blur-*` 실사용 **1건** (PageAppBar.tsx:302 헤더 스크롤 예외 — 추가 4건은 docstring/회피 주석) · `shadow-*-500/30` **0건** · `messages.ts` 1차 키 **200개** · 다크모드 `dark:` 변형 **9,269 호출**.

### 📊 v9.4 변동 요약 (2026-05-23, vs v9.3 2026-05-14)

| 영역                | v9.3       | v9.4       | 변동 / 해석                                                                  |
| ------------------- | ---------- | ---------- | ---------------------------------------------------------------------------- |
| **페이지**          | 229        | **245**    | +16 (parent +6 · coach +5 · admin +3 · common +2 — 5월 도메인 확장)         |
| **컴포넌트**        | 353        | **352**    | -1 (정리)                                                                    |
| **훅**              | 62         | **71**     | +9 (`useImagesReady`/`useFontsReady`/`useStableLayout`/`useScreenMetrics` 등 정책 훅 신설) |
| **MESSAGES 1차 키** | 181        | **200**    | +19 (5월 신규 도메인 — common-codes/equipment/careers/awards/badges/consultation/외) |
| **dark 변형**       | 11,769     | **9,269**  | -2,500 (불필요한 `dark:` inline 클래스 → 토큰 위임으로 정리) — **품질 개선** |
| **gradient 실사용** | 0          | **0**      | 유지 (주석 3건은 회피 가이드)                                                |
| **blur 실사용**     | 3 (헤더)   | **1**      | -2 (PageAppBar 헤더 스크롤 예외만 — 회피 주석으로 분리됨)                    |
| **shadow-*-500/30** | 0          | **0**      | 유지                                                                         |

> **결론**: v9.4는 **순수 정리 + 도메인 확장** — 디자인 위반 0 유지, 5월 도메인 추가에 따른 MESSAGES/페이지/훅 증가, 다크 변형 품질 개선.

### 🆕 v9.4 신규 인지 — teamplus-home

- **신규 사이트**: `teamplus-home/` (Next.js 14 · React 18 · Tailwind 3.4 — **13 pages** 랜딩·소개)
- **디자인 정합 전략**:
  - **토큰 공유 권장**: `tailwind.config.cjs` 동일 사용 — `ice-500` Primary · `wbg/wsurface/wline` 표면 · `sh-1~4` shadow
  - **8 절대 규칙 강제 동일**: gradient · blur(헤더 외) · shadow-*-500/30 금지
  - **MESSAGES**: 별도 (랜딩 전용 카피) — `common.*` 도메인은 import 공유 가능
  - **접근성**: 일반 사용자 대상이므로 WCAG **AA**로 충분 (단, 가독성·대비 7:1 권장)
  - **단기 SoT**: 본 문서(`DESIGN.md`) §1.5 4축 + 8 절대 규칙 + 토큰 동일 적용. 별도 SoT 문서 준비 예정.

---

## 1.5. 디자인 철학 — 4축

TEAMPLUS 웹은 4개의 **상호 긴장(tension)** 축 위에서 균형을 잡습니다. 디자이너/구현자는 모든 화면이 4축 모두에 답하도록 설계해야 합니다.

| 축                                              | 한 줄                                                                      | 시각 표현                                                                                                          | 안티패턴                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **A. Trustworthy Calm** (신뢰의 정적감)         | 결제·크레딧·자녀 정보를 다루므로 **금융 앱 수준의 안정감**이 최우선        | 단색 인디고 CTA · 흰 카드 + `shadow-sh-1~2` · 12-16px 라디우스 · 큰 여백                                           | 형광 채도 · 5+ 컬러 동시 사용 · 화려한 일러스트        |
| **B. Hockey Energy** (아이스하키의 동적 에너지) | 정적이기만 하면 클럽 정체성이 사라짐. **차가운 인디고**가 빙판의 결을 표현 | `ice-500` 인디고 강조 · `rink-800` 다크 슬레이트 hero · 🏒퍽 모션(`animate-puck-travel`) · `flame-500` 긴급 액센트 | 핫핑크 · 네온 글로우 · 빅풋 폰트                       |
| **C. Hyper-Mobile** (모바일 절대 우선)          | 80-85%가 Flutter WebView. 320px iPhone SE ~ 768px iPad mini                | `MobileContainer` 448px max · `clamp()` fluid 타입 · 72px BottomNav · safe-area 보정                               | 데스크탑 그리드 · 마우스 hover-only 인터랙션           |
| **D. Inclusive Layered** (계층적 포용성)        | 6 페르소나 × 다크모드 × WCAG AAA(아동) 동시 충족                           | role-별 BottomNav 자동 선택 · `dark:` prefix 11,769 · 아동 72×72dp 7:1 대비                                        | 단일 페르소나 가정 · 다크모드 누락 · 텍스트 4.5:1 미만 |

이 4축은 **타협 관계가 아니라 동시 충족 대상**입니다. 한 축만 강조하면 디자인이 무너집니다 (예: B만 강조 = 형광 클럽 / A만 강조 = 회색 무미건조).

---

---

## 2. 절대 규칙 (CLAUDE.md MUST FOLLOW 와 동일)

| #   | 규칙                                                                                             | 위반 시         |
| --- | ------------------------------------------------------------------------------------------------ | --------------- |
| 1   | `bg-gradient-to-*` / `backdrop-blur-*` / `shadow-*-500/30` 사용 금지 (헤더 스크롤 투명도만 예외) | **즉시 불합격** |
| 2   | `AppBar`/`BottomNav` 영역 수정·교체·래핑 금지 — `MobileContainer` 내부 body만 수정               | **즉시 불합격** |
| 3   | `messages.ts` 단일 객체 `MESSAGES`(1차 키 181개) 사용 — 한글 라벨 하드코딩 금지                  | **즉시 불합격** |
| 4   | 버튼 라벨 한글 강제 — "등록하기/수정하기/삭제하기/저장하기/확인/취소" (영문 금지)                | **즉시 불합격** |
| 5   | `(child)` 그룹은 WCAG AAA — 72×72 터치 타겟 / 7:1 대비 / 18px+ 폰트                              | **즉시 불합격** |
| 6   | 인증 훅(`useRequireRole`/`useAuth`) layout.tsx 단일 호출, page 중복 금지                         | **즉시 불합격** |
| 7   | 목록·카드에 pipe-like 세로 구분선 절대 금지 (RULE-D04)                                           | **즉시 불합격** |
| 8   | 디자인 토큰 외 임의 hex 사용 금지 — `tailwind.config.cjs` 토큰만                                 | **즉시 불합격** |

---

## 3. 핵심 토큰 (단일 출처: `tailwind.config.cjs`)

### 색상 (브랜드 코어 — wallet v2 토큰)

| 토큰                                 | 값                                 | 용도                                       |
| ------------------------------------ | ---------------------------------- | ------------------------------------------ |
| `ice-500`                            | `#2f5fff`                          | **Primary CTA** · 활성 탭 underline        |
| `ice-600` / `ice-700`                | `#1f47e6` / `#1837b8`              | hover · 스플래시                           |
| `ice-50` / `ice-100`                 | `#eef4ff` / `#dbe6ff`              | 강조 배경 (선택 행, 토스트)                |
| `rink-800` / `rink-900` / `puck`     | `#1f2536` / `#141826` / `#0a0d14`  | 슬레이트 보조 패널 · 다크모드 표면         |
| `rink-50~700`                        | 6단계 (50/100/300/500/700/800/900) | 다크모드 위계 (50 = 가장 밝음, 900 = 깊음) |
| `flame-500` / `mint-500` / `sun-500` | `#ff5a36` / `#00d4a8` / `#ffc940`  | 액센트 (긴급/성공/주의) — **사용 최소화**  |
| `flame-100` / `mint-100` / `sun-100` | `#ffe2da` / `#cdf6eb` / `#fff3cf`  | 액센트 배경 (배지·칩)                      |
| `wbg`                                | `#f6f8fc`                          | **페이지 배경** (라이트)                   |
| `wsurface`                           | `#ffffff`                          | 카드 표면                                  |
| `wline` / `wline-2`                  | `#e5e9f2` / `#eef1f7`              | 경계선 · 스켈레톤                          |
| `wtext-1~4`                          | `#0a0d14` → `#9aa4ba` 4단계        | 본문 위계 (1=가장 진함, 4=disabled)        |

### 색상 (특수 카테고리 — 임의 hex 금지의 합법적 예외)

> 외부 서비스 브랜드 색·QR 카메라 UI·채팅 버블은 TEAMPLUS 코어 팔레트로 대체할 수 없는 정체성을 갖습니다. 토큰화하여 RULE-8 (임의 hex 금지) 합법적 예외로 운용합니다.

| 토큰 카테고리              | 토큰                | 값        | 용도                                         |
| -------------------------- | ------------------- | --------- | -------------------------------------------- |
| **소셜/PG (`brand.*`)**    | `brand-kakao`       | `#FEE500` | 카카오 로고 배경                             |
|                            | `brand-kakao-hover` | `#FDD800` | 카카오 hover dim                             |
|                            | `brand-kakao-pay`   | `#FAE100` | 카카오페이 (살짝 톤 다름)                    |
|                            | `brand-kakao-text`  | `#371D1E` | 카카오 라벨 텍스트                           |
|                            | `brand-naver`       | `#03C75A` | 네이버 (소셜 로그인)                         |
|                            | `brand-naver-hover` | `#02B350` | 네이버 hover                                 |
|                            | `brand-samsung`     | `#1428A0` | 삼성페이                                     |
|                            | `brand-line`        | `#06C755` | LINE                                         |
|                            | `brand-facebook`    | `#1877F2` | Facebook                                     |
| **QR 카메라 (`qr.*`)**     | `qr-bg`             | `#0a0a0a` | 카메라 풀스크린 배경                         |
|                            | `qr-scan`           | `#3DDC84` | 스캐너 코너 마커 / 스캔 라인 (Android Green) |
| **채팅 버블 (`bubble.*`)** | `bubble-in`         | `#f3f4f6` | 상대방 메시지 (라이트)                       |
|                            | `bubble-in-dark`    | `#2d3342` | 상대방 메시지 (다크)                         |

### 타이포 (Pretendard 단일 SoT)

- **본문 폰트**: **`Pretendard`** (`tailwind.config.cjs:148` 기준 SoT) — `-apple-system` → `BlinkMacSystemFont` → `system-ui` → `sans-serif` 폴백
- **숫자 폰트**: **`font-num` = Pretendard + `tabular-nums`** (이전 Inter CDN 외부 의존 → 2026-04-30 Pretendard 통합으로 정정)
- 헤딩: `text-w-h1`(34) / `text-w-h2`(28) / `text-w-h3`(22)
- 금액 디스플레이: `text-w-display`(44) / `text-w-display-lg`(64) — 반드시 `font-num` 병행
- 본문: `text-w-body-lg`(16) / `text-w-body`(15) / `text-w-small`(13) / `text-w-caption`(12)
- 타이틀: `text-w-title`(18)
- **Fluid 토큰 (해상도 적응)**: `text-w-*-fluid` — `clamp(min, vw, max)` 기반. iPhone SE(320) ~ iPad mini(768) 한 토큰으로 대응. 신규 화면 권장.

### Radius

- 카드: `rounded-w-lg`(16) / `rounded-w-xl`(20) / `rounded-w-2xl`(28, 시트·다이얼로그)
- 작은 표면: `rounded-w-xs`(4) / `rounded-w-sm`(8) / `rounded-w-md`(12)
- Pill/Chip: `rounded-w-pill`(999)

### Shadow (2단계 + 강조 2종)

| 토큰             | 값                                                              | 용도                         |
| ---------------- | --------------------------------------------------------------- | ---------------------------- |
| `shadow-sh-1`    | `0 1px 2px rgba(20,24,38,.04), 0 1px 3px rgba(20,24,38,.06)`    | 카드 표준 (휴식 상태)        |
| `shadow-sh-2`    | `0 2px 6px rgba(20,24,38,.06), 0 4px 12px rgba(20,24,38,.05)`   | Hero 카드 / 결제 카드        |
| `shadow-sh-3`    | `0 8px 24px rgba(20,24,38,.08), 0 2px 6px rgba(20,24,38,.05)`   | 모달 / BottomSheet           |
| `shadow-sh-4`    | `0 16px 40px rgba(20,24,38,.12), 0 4px 12px rgba(20,24,38,.06)` | 풀스크린 오버레이            |
| `shadow-sh-blue` | `0 8px 24px rgba(47,95,255,.28)`                                | 브랜드 강조 카드 (절제 사용) |
| `shadow-sh-rink` | `0 8px 24px rgba(20,24,38,.32)`                                 | 다크 hero 카드               |

> **금지**: 컬러 그림자(`shadow-blue-500/30` 등) — RULE-1 위반. `sh-blue` / `sh-rink` 만 합법.

### 토큰 사용 빈도 (2026-04-30 실측 — 의도된 비율)

| 카테고리                      | 사용 횟수 | 의도                                                                   |
| ----------------------------- | --------- | ---------------------------------------------------------------------- |
| `rink-*` (다크 슬레이트)      | 522회     | 다크모드 표면 + hero 카드 사이드 strip — **A축 신뢰감**                |
| `ice-*` (인디고)              | 187회     | CTA · 활성 탭 underline · 강조 — **B축 에너지** (희소성으로 가치 보존) |
| `text-w-*` (모바일 타입)      | 1,710회   | 모든 텍스트 — **C축 모바일 우선**                                      |
| `rounded-w-*` (라디우스)      | 1,039회   | 카드·시트·pill — A·B축 균형                                            |
| `shadow-sh-*` / `shadow-card` | 99회      | 절제된 그림자 — **A축 정적감** (남용 금지)                             |

**해석**: 다크 슬레이트 사용량이 인디고의 **2.8배**. TEAMPLUS은 "인디고 강조"보다 "**슬레이트 깊이**"가 중심 톤. 이는 신한플레이의 hero strip 패턴을 TEAMPLUS 빙판 정서로 재해석한 결과.

---

## 4. 3가지 페이지 패턴 (Pattern A/B/C)

### Pattern A — `wallet-tabs` (탭형)

```tsx
<MobileContainer hasBottomNav>
  <WalletScreen
    tabs={[{ id, label }, ...]}
    appBar={{ title, onSearch, onTimeline, onMy, onMenu }}
    floating={{ qrLabel, onQrClick }}
  />
</MobileContainer>
```

`useNativeUI({ showAppBar: false })` 필수. 적용 예: `/parent`, `/parent/credits`, `/common/mypage`

### Pattern B — `wallet-content` (단일 스크롤)

```tsx
<MobileContainer hasBottomNav>
  <BackHeader title="..." />
  <main className="bg-wbg dark:bg-puck">
    <SectionHead title="..." action="..." />
    {/* wallet 토큰 섹션들 */}
  </main>
</MobileContainer>
```

적용 예: `/parent/children`, `/coach/classes-manage`, `/student/calendar`, `/shop/home`

### Pattern C — `wallet-form` (폼/단일 카드)

```tsx
<div className="min-h-screen bg-wbg dark:bg-puck flex flex-col">
  <main className="flex-1 px-5 py-6">
    <div className="bg-wsurface dark:bg-rink-800 rounded-w-xl shadow-sh-2 p-6">
      {/* 폼 */}
    </div>
  </main>
</div>
```

적용 예: `/auth/login`, 결제 입력, 본인인증

---

## 5. 표준 wallet 컴포넌트 7종

| 컴포넌트                | 용도                                                | 신한 reference                                     |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------- |
| `WalletAppBar`          | 좌측 큰 헤딩 + 우측 4 액션(검색·타임라인·마이·메뉴) | wallet_01/02                                       |
| `WalletTabs`            | 가로 탭 underline                                   | wallet_01 (결제·뱅킹/멤버십/전자문서/부가서비스)   |
| `HeroPassCard`          | 흰 메인 카드 + 슬레이트 사이드 strip                | wallet_03 (신한은행 The More + 바코드/송금/더보기) |
| `WalletFloatingActions` | 중앙 캡슐 QR + 우측 원형 보조                       | wallet_02 (QR스캔·결제코드입력 + 신한플러스)       |
| `ViewToggleAndChips`    | ▦≡ 카드/리스트 토글 + Pill 필터                     | wallet_01 (이용내역/카드·계좌관리)                 |
| `QuickServicesGrid`     | 4-grid 컬러 아이콘                                  | menu (NEW&HOT/마이금융/마이카/마이샵쿠폰)          |
| `RecordCardPromo`       | 옅은 배경 + 일러스트 promo                          | wallet_01 (스타벅스 promo)                         |

---

## 6. 작업 시 시퀀스

1. **요구 분석** → 어떤 패턴(A/B/C)인가? 어떤 화면군(역할/도메인)인가?
2. **토큰 확인** → 새 hex 만들지 말고 기존 토큰만 → [`WEB_DESIGN_SYSTEM.md`](docs/Design/WEB_DESIGN_SYSTEM.md)
3. **컴포넌트 선택** → wallet 컴포넌트 7종 우선 → [`COMPONENT_PATTERNS.md`](docs/Design/COMPONENT_PATTERNS.md)
4. **시각 reference 확인** → 신한 화면 매칭 → [`SHINHAN_PLAY_REFERENCE.md`](docs/Design/SHINHAN_PLAY_REFERENCE.md) §4
5. **하네스 통과** → 8 카테고리(C1~C8) 합격 기준 → [`NEW_DESIGN_ROLLOUT.md`](docs/Design/NEW_DESIGN_ROLLOUT.md) §7
6. **WCAG AAA**: `(child)` 그룹은 별도 적용

---

## 6.5. 인터랙션 / 모션 시스템

TEAMPLUS 웹은 **iOS 네이티브 감각**을 모션의 기준으로 삼습니다. WebView 안에서도 "웹 같음"이 아니라 "iOS 같음"이 되어야 합니다.

### 표준 ease 커브 (`tailwind.config.cjs` extend.transitionTimingFunction)

| 토큰              | 커브                             | 용도                                          |
| ----------------- | -------------------------------- | --------------------------------------------- |
| `ease-ios`        | `cubic-bezier(0.32, 0.72, 0, 1)` | 페이지 전환 · 시트 present (Apple HIG 표준)   |
| `ease-ios-out`    | `cubic-bezier(0.4, 0, 0.2, 1)`   | 시트 dismiss · drawer 닫힘                    |
| `ease-ios-spring` | `cubic-bezier(0.22, 1, 0.36, 1)` | BottomNav 슬라이딩 · FAB 착륙 (damped spring) |
| `ease-wallet`     | `cubic-bezier(0.2, 0.8, 0.2, 1)` | wallet v2 표준 — 카드 · 칩                    |

### 표준 duration

- 마이크로 인터랙션 (hover · active): **150ms**
- 컴포넌트 전환 (modal · sheet open): **300-400ms** (`transitionDuration: 400` 토큰)
- 페이지 전환: **250ms** (`animate-page-enter`)
- FAB 아이콘 교체: **300ms enter / 200ms exit** (iOS SF Symbols `.replace` 효과 재현)

### 표준 애니메이션 토큰

| 토큰                              | 키프레임              | 용도                                |
| --------------------------------- | --------------------- | ----------------------------------- |
| `animate-fade-in`                 | opacity 0 → 1         | 진입 (가장 안전)                    |
| `animate-slide-up`                | translateY(8px) → 0   | 카드 stagger                        |
| `animate-sheet-up` / `sheet-down` | translateY(100%) ↔ 0  | BottomSheet (꼭 사용)               |
| `animate-fab-icon-enter` / `exit` | scale + opacity       | BottomNav 중앙 FAB                  |
| `animate-fab-land`                | scale 0.96 → 1.03 → 1 | FAB 착륙 overshoot                  |
| `animate-puck-travel`             | 🏒 → ⛸️ 왕복          | 아동 대시보드 시그니처 (B축 에너지) |
| `animate-loading-dot-pulse`       | scale 0.85 ↔ 1        | LoadingPuck 점 인디케이터           |
| `animate-puck-bob`                | 8px bob               | 로딩 퍽 떠오름                      |

### Stagger 표준 (목록 카드 진입)

```tsx
{
  items.map((item, i) => (
    <Card
      key={item.id}
      className="animate-slide-up motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(i * 40, 280)}ms` }}
    />
  ));
}
```

- **interval**: 40ms · **cap**: 280ms (8개 이상은 동시 진입)
- `motion-reduce:animate-none` **필수** — WCAG 2.1 SC 2.3.3
- 무거운 transform (`scale`, `translate3d`) 대신 opacity + translateY 8px 권장

### 금지 모션

- ❌ 무한 회전 spinner를 화면 중앙에 1초 이상 단독 표시 → `LoadingPuck` 사용
- ❌ overshoot이 1.1× 이상 (멀미 유발)
- ❌ opacity·transform 외 속성을 transition 대상으로 (예: `transition-all`)
- ❌ stagger interval 100ms 이상 (8개 카드면 800ms — 사용자 인내 한계)

---

## 7. 절대 금지 사항 (자동 불합격)

```tsx
// ❌ 금지
className="bg-gradient-to-r from-blue-500 to-purple-600"  // 그라데이션
className="backdrop-blur-md bg-white/30"                  // 글래스모피즘
className="shadow-blue-500/30 shadow-2xl"                  // 짙은 컬러 그림자
className="bg-[#abc123]"                                   // 임의 hex
<button>Submit</button>                                    // 영문 라벨
"수업이 등록되었습니다."                                  // 메시지 하드코딩
```

```tsx
// ✅ 권장
className="bg-ice-500 hover:bg-ice-600"                   // 토큰 사용
className="bg-wsurface dark:bg-rink-800 shadow-sh-2"       // 카드 표준
className="text-w-display font-num"                        // 금액 디스플레이
<button>등록하기</button>                                  // 한글 강제
{MESSAGES.classes.registerSuccess}                         // 메시지 키
```

---

## 7.5. AI slop 금지 — 상세 디자인 원칙

이 프로젝트는 "AI가 만든 티" 나는 디자인을 금지합니다. §7의 절대 규칙과 별개로, 아래 원칙은 **구현 판단이 필요한 회색 지대**를 다룹니다.

### 7.5.1 피해야 할 것들 (AI slop 패턴)

- **그라디언트 떡칠** — 다크 그라디언트 히어로 카드, 무지개 배경, 카드마다 다른 그라디언트
- **이모지 장식** — 메타데이터 라벨 옆 📅🕓📍, 빈 상태에 큰 💬, 액션 버튼의 ✓📝👥💰 (브랜드가 이모지를 쓰지 않는 한)
- **칩·뱃지 도배** — 제목 아래 모든 메타데이터를 컬러 칩으로 표시, 카드마다 BEST/NEW/HOT 리본
- **장식용 통계** — "약 17주", "회당 4시간" 같은 산술적으로 자동 생성된 부수 라인 (사용자가 알아야 할 정보가 아니면 빼기)
- **4-아이콘 빠른 액션 그리드** — 파스텔 박스 안에 이모지 + 짧은 라벨 4개 늘어놓기
- **장황한 빈 상태** — 큰 일러스트 + 헤드라인 + 부 카피 + CTA 버튼 4단 구성. 한 줄 텍스트면 충분한 경우가 대부분
- **컬러 다양성 과잉** — 한 화면에서 ice/mint/flame/sun 등을 모두 사용
- **상태바마다 그린 닷·붉은 닷** — 의미 없는 컬러 인디케이터
- **둥근 모서리 일률 적용** — 모든 카드가 16~20px 라운드. 절제된 디자인은 4px 또는 0px도 OK

### 7.5.2 권장하는 것들 (절제된 에디토리얼)

- **타이포 본위** — 정보 위계는 사이즈·웨이트·간격으로 (컬러 칩 X)
- **단일 액센트** — 화면당 강조색 1개. 나머지는 잉크/뮤티드/라인
- **정의형 리스트** — 메타데이터는 좌측 라벨 + 우측 값의 행 구성, 아이콘 없이
- **얇은 라인 디바이더** — `1px solid wline` 분리, 박스보다 라인이 가볍다
- **UPPERCASE 미니 라벨** — 11px / letter-spacing 0.12em / muted 컬러로 섹션 구분
- **CTA 단순화** — 1차 액션 1개 + 2차 라인 버튼. 위험 액션은 텍스트 링크
- **여백** — 24px 좌우 / 32px 섹션 간 / 18~20px 행 간

### 7.5.3 빈 상태(Empty state) 가이드

- 1줄 안내가 기본. ("아직 작성된 리뷰가 없습니다.")
- 일러스트는 의미 있을 때만. 이모지는 금지.
- CTA는 인라인 텍스트 링크로 충분한 경우가 많음.

### 7.5.4 화면 완성 전 자가 체크리스트

- [ ] 이모지가 들어갔는가? → 브랜드 자산이 아니면 제거
- [ ] 그라디언트가 2개 이상인가? → 1개로 통일하거나 모두 제거
- [ ] 컬러 칩이 3개 이상인가? → 가장 중요한 1개만 남기고 텍스트화
- [ ] "약 N주", "회당 N시간" 같은 자동 계산 부 카피가 있는가? → 사용자에게 가치 없으면 삭제
- [ ] 빈 상태에 큰 아이콘 + 헤드라인 + 부 카피 3단 구성인가? → 1줄로 줄이기
- [ ] 한 화면에 액센트 컬러가 3개 이상인가? → 1개로 통일

---

## 8. 문서 진입점 (Source of Truth)

| 목적                                            | 문서                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **WEB 디자인 컨셉 상세** (철학·페르소나·메트릭) | [`docs/Design/DESIGN_CONCEPT_WEB.md`](docs/Design/DESIGN_CONCEPT_WEB.md) **(신규 2026-04-30)**   |
| **시스템 SoT** (토큰·라우트·컴포넌트 현황)      | [`docs/Design/WEB_DESIGN_SYSTEM.md`](docs/Design/WEB_DESIGN_SYSTEM.md)                           |
| **컴포넌트 카탈로그**                           | [`docs/Design/COMPONENT_PATTERNS.md`](docs/Design/COMPONENT_PATTERNS.md)                         |
| **현재 작업 SPEC** (Wallet v2 P0)               | [`docs/Design/NEW_DESIGN_ROLLOUT.md`](docs/Design/NEW_DESIGN_ROLLOUT.md)                         |
| **Phase 2 SPEC 상세**                           | [`docs/Design/NEW_DESIGN_ROLLOUT_PHASE2_SPEC.md`](docs/Design/NEW_DESIGN_ROLLOUT_PHASE2_SPEC.md) |
| **시각 reference** (신한플레이 25 webp)         | [`docs/Design/SHINHAN_PLAY_REFERENCE.md`](docs/Design/SHINHAN_PLAY_REFERENCE.md)                 |
| **App (Flutter Native Shell)**                  | [`docs/Design/DESIGN_APP.md`](docs/Design/DESIGN_APP.md)                                         |
| **모바일 화면 카탈로그**                        | [`docs/Design/SCREENS_MOBILE_APP.md`](docs/Design/SCREENS_MOBILE_APP.md)                         |
| **Web/Admin 화면 카탈로그**                     | [`docs/Design/SCREENS_WEB_ADMIN.md`](docs/Design/SCREENS_WEB_ADMIN.md)                           |
| **Web 화면 색인**                               | [`docs/Design/WEB_SCREEN_CATALOG.md`](docs/Design/WEB_SCREEN_CATALOG.md)                         |
| **채팅 재디자인**                               | [`docs/Design/CHAT_REDESIGN_PLAN.md`](docs/Design/CHAT_REDESIGN_PLAN.md)                         |
| **디자인 일관성 분석**                          | [`docs/Design/DESIGN_CONSISTENCY_ANALYSIS.md`](docs/Design/DESIGN_CONSISTENCY_ANALYSIS.md)       |
| **디자인 통합 가이드**                          | [`docs/Design/DESIGN_INTEGRATION_GUIDE.md`](docs/Design/DESIGN_INTEGRATION_GUIDE.md)             |
| **MUST FOLLOW 7원칙**                           | [`docs/Guides/CLAUDE_STANDARDS.md`](docs/Guides/CLAUDE_STANDARDS.md#-frontend-design-standards)  |

---

## 10. 페르소나별 디자인 변주 (6 역할)

TEAMPLUS은 6 역할 + Admin 1 = 총 7 페르소나가 동일 디자인 시스템을 공유하면서도 **시각적 강조점이 다릅니다**. 같은 카드라도 누가 보는가에 따라 톤이 달라집니다.

| 페르소나                      | 라우트 그룹                     | BottomNav         | 시각 톤                                     | 강조 토큰                                  | 시그니처                                          |
| ----------------------------- | ------------------------------- | ----------------- | ------------------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| **Parent** (학부모)           | `(parent)` 17p                  | `ParentBottomNav` | 안정적·정보 밀도 ↑                          | `ice-500` CTA · `wsurface` 카드            | `ChildrenSwipeCards` 캐러셀 / 크레딧 만료 경고 칩 |
| **Coach** (코치/아카데미원장) | `(coach)` 26p                   | `RoleBottomNav`   | 효율적·기능 우선                            | `rink-800` 다크 hero · 일정 그리드         | 출석 일괄 토글 / QR 생성 카운트다운               |
| **Director** (감독)           | `(director)` 19p                | `RoleBottomNav`   | 통계·권위감                                 | 통계 카드 · `text-w-display` 숫자          | KPI 4-grid · 코치 진행률 막대                     |
| **Child** (아동, ~12세)       | `(child)` 2p + `(student)` 일부 | `RoleBottomNav`   | **WCAG AAA · 큰 손가락 · 큰 폰트 · 즐거움** | 72×72dp 버튼 · `font-num` 18px+ · 7:1 대비 | 🏒 puck-travel 모션 / pop-in / sticker confetti   |
| **Teen** (청소년)             | `(student)` 일부                | `RoleBottomNav`   | 활기·소셜                                   | `flame-500` 액센트 사용 가능               | 뱃지 컬렉션 (legendary~common) / TTS 버튼         |
| **Common** (공용)             | `(common)` 30p                  | 역할 자동 감지    | 중성적                                      | 표준 토큰                                  | 팀 CRUD · 마이페이지 · 검색                       |
| **Admin** (관리자)            | `(admin)` 14p                   | `AdminBottomNav`  | 데이터 우선·기능 풍부                       | 표 · 일괄 처리 액션                        | 회원 승인 일괄 처리 · 정산 표                     |

### 페르소나별 무조건 지켜야 할 시각 규칙

- **Child / Teen**: 폰트 18px 이하 사용 금지. CTA 라벨 영문 절대 금지 ("등록하기" 같은 친근한 한글). 색상 대비 최소 7:1.
- **Parent**: 자녀 정보·결제는 모달이 아닌 **별도 페이지** (실수 방지). 크레딧 잔액은 항상 `font-num`.
- **Coach**: 일정·출석은 **표(grid)**가 기본 — 카드 캐러셀 금지 (양 많아 비효율).
- **Director**: 차트는 RadarChart / Bar Chart 표준만 — 파이 차트 사용 금지 (가독성 낮음).
- **Admin**: 위험 액션(삭제·반려)은 **빨간색 보더** + 확인 다이얼로그 강제.

---

## 11. 휴먼 디자인 vs AI 디자인 (대조표)

TEAMPLUS은 "AI가 그린 것 같은" 디자인을 **즉시 불합격**으로 처리합니다. 아래는 자주 등장하는 안티패턴과 그 대체.

| 영역             | ❌ AI 디자인 (불합격)                                           | ✅ 휴먼 디자인 (합격)                   | 이유                                              |
| ---------------- | --------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| **배경**         | `bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500`    | `bg-wbg dark:bg-puck`                   | 그라데이션은 정보를 가리고 브랜드 일관성을 해친다 |
| **카드**         | `backdrop-blur-2xl bg-white/30 border border-white/20`          | `bg-wsurface shadow-sh-2 rounded-w-xl`  | 글래스모피즘은 가독성 ↓ + 성능 ↓                  |
| **CTA**          | `bg-gradient-to-r from-cyan-400 to-blue-600 shadow-blue-500/50` | `bg-ice-500 hover:bg-ice-600`           | 단색이 더 또렷하고 신뢰감 ↑                       |
| **그림자**       | `shadow-2xl shadow-purple-500/40`                               | `shadow-sh-2`                           | 컬러 그림자 = 자체 발광 효과 = 핀테크 감각과 충돌 |
| **카운터**       | 무지개 그라데이션 텍스트                                        | `text-w-display font-num text-rink-900` | 숫자는 읽기 위한 것                               |
| **아이콘**       | 다채색 sticker 같은 일러스트                                    | 1색 lucide-react 24px                   | 정보 우선 — 일러스트는 promo 카드만               |
| **여백**         | 빽빽한 정보 + 강한 boundary                                     | 충분한 `gap-4`/`gap-6` + `border-wline` | 휴먼은 숨 쉴 공간을 만든다                        |
| **마이크로카피** | "✨ Submit your awesome data!"                                  | "등록하기"                              | 친근하되 과장 금지                                |

### 한 줄 자가 진단

> "**광고 디자이너**가 만든 것 같은가, **은행 앱**이 만든 것 같은가?" → 후자여야 합격.

---

## 12. 디자인 메트릭 (합격 기준치)

화면을 마무리하기 전 아래 메트릭을 **반드시** 확인합니다.

| #   | 메트릭                               | 합격 기준                                                         | 검증 방법                            |
| --- | ------------------------------------ | ----------------------------------------------------------------- | ------------------------------------ | ------ | --------------- | ------------- |
| M1  | 디자인 토큰 사용률                   | `bg-ice-500`/`text-w-*`/`rounded-w-*` 등 토큰 100%                | 임의 hex `#abc` grep 0건             |
| M2  | AI 패턴 0건                          | `bg-gradient-to-*`, `backdrop-blur-*`(헤더 외), `shadow-*-500/30` | grep 0건                             |
| M3  | 다크모드 커버리지                    | 모든 색·배경·테두리에 `dark:` 변형                                | 화면 토글 후 시각 확인               |
| M4  | 메시지 하드코딩 0건                  | 한글 라벨은 `MESSAGES.도메인.키`                                  | grep `"[가-힣]+(되었습니다           | 입니다 | 해주세요)"` 0건 |
| M5  | RULE-D04 (pipe-like 세로 구분선 0건) | `divide-x`, `border-l/r`, literal `\|`                            | grep 0건                             |
| M6  | 한글 버튼 라벨 100%                  | "등록하기/수정하기/삭제하기/저장하기"                             | grep `>(Submit                       | Save   | Edit            | Delete)<` 0건 |
| M7  | 모션 reduce 대응                     | 모든 `animate-*`에 `motion-reduce:animate-none`                   | grep 매치율 100%                     |
| M8  | 1초 SLA                              | 모바일 4G 첫 paint < 1초                                          | `api-lifecycle-defaults.ts` 모니터링 |
| M9  | 아동 화면 WCAG AAA                   | 72×72dp · 7:1 · 18px+                                             | `(child)` 그룹 axe-a11y 통과         |
| M10 | AppBar/BottomNav 불가침              | `MobileContainer` body만 수정                                     | git diff 검토                        |

**위 10개 메트릭 중 단 하나라도 실패하면 디자인 불합격** — 9.9/10으로도 재수정 대상.

---

## 9. 변경 이력

| 일자       | 변경                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-23 | **실측 SOT 동기화 v9.4** — §1 실측 갱신: 229→**245** page.tsx · 353→**352** 컴포넌트 · 62→**71** 훅 · dark 11,769→**9,269** (불필요한 dark 변형 정리 결과) · MESSAGES 1차 키 181→**200**. `backdrop-blur-*` 카운트 3→**5건**(실사용은 헤더 스크롤 1건 유지, 나머지는 docstring/회피 주석). Backend 모델 147→152·controller 74→81·service 99→102·route 773 신규 카운트 인지. teamplus-home 13 pages 신규 인지.                                                                                                                                                                                                                                                                                                                  |
| 2026-05-14 | **실측 SOT 동기화** — §1 실측 갱신: 225→**229** page.tsx · 296→**353** 컴포넌트 · 63→**62** 훅 · dark 11,390+→**11,769** · §1.5.D `dark:` prefix 6,000+→11,769 · §2 Rule 3 MESSAGES 키 카운트 "40 도메인 키"→**1차 키 181개** · Pretendard 단일 SoT(Inter CDN 의존 제거) 컨셉 완성 반영.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-05-09 | **`팀플러스 아이스하키 플레이그라운드/DESIGN.md` 병합** — §7.5 AI slop 금지 상세 가이드 신설: 7.5.1 피해야 할 것들(그라디언트 떡칠·이모지 장식·칩 도배·장식용 통계·빈 상태 4단 구성 등 10개 패턴) · 7.5.2 권장 에디토리얼 스타일(타이포 본위·단일 액센트·정의형 리스트·UPPERCASE 미니 라벨 등) · 7.5.3 빈 상태 가이드 · 7.5.4 화면 완성 전 자가 체크리스트 6항목.                                                                                                                                                                                                                                                                                                                                                        |
| 2026-05-07 | **`/impeccable document` 실행 — 토큰 SoT 동기화** — §3 색상 표를 `tailwind.config.cjs` 실측 기반으로 재구성: (a) 코어 팔레트 ramp 추가 (`ice-50/100`, `rink-50~700`, `flame/mint/sun-100`), (b) 특수 카테고리 토큰 신설 — 소셜/PG `brand.*` 9종(카카오/카카오페이/네이버/삼성/LINE/Facebook), QR 카메라 UI `qr.bg/scan`, 채팅 버블 `bubble.in/in-dark`. §3 타이포 SoT 정정 — `font-num` 폰트 패밀리는 Pretendard 단일 (이전 Inter CDN 외부 의존 표기 오류). §3 Shadow 6종 토큰 표 신설(`sh-1~4` + `sh-blue` + `sh-rink`). §1 실측 카운트 갱신: dark 변형 6,000+ → **11,390+** (실측 grep), gradient 0건/blur 3건(헤더 예외)/컬러 그림자 0건 재확인. AGENTS.md · CLAUDE.md · GEMINI.md 의 DESIGN system 섹션 일괄 동기화. |
| 2026-04-30 | **WEB 디자인 컨셉 보강** — §1.5 디자인 철학 4축(Trustworthy Calm · Hockey Energy · Hyper-Mobile · Inclusive Layered) · §3 토큰 사용 빈도 실측(rink 522 · ice 187 · 모바일 타입 1,710 · radius 1,039) · §6.5 인터랙션·모션 시스템(iOS ease 커브 · stagger 40ms/cap 280ms · puck-travel 시그니처) · §10 페르소나별 디자인 변주(6 역할 + Admin) · §11 휴먼 vs AI 대조표 · §12 디자인 메트릭 10개. 신규 상세 문서 [`docs/Design/DESIGN_CONCEPT_WEB.md`](docs/Design/DESIGN_CONCEPT_WEB.md) 추가                                                                                                                                                                                                                              |
| 2026-04-29 | **초기 작성** — 루트 디자인 진입점 신설. `_ _ _offline_.html` SPA bundle + `screen_shrot/` 25 webp 실측 분석을 [`SHINHAN_PLAY_REFERENCE.md`](docs/Design/SHINHAN_PLAY_REFERENCE.md)로 신규 정리하고, `NEW_DESIGN_ROLLOUT.md` / `WEB_DESIGN_SYSTEM.md` / `COMPONENT_PATTERNS.md` / `DESIGN_APP.md` 헤더에 reference 링크 연결                                                                                                                                                                                                                                                                                                                                                                                             |

---

**Last Updated**: 2026-05-23 (실측 SOT 동기화 v9.4)
