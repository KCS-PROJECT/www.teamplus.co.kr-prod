# TEAMPLUS DESIGN.md — 팀플러스 올드 버전 디자인 가이드

TEAMPLUS(팀플러스)는 아이스하키 클럽 통합 관리 플랫폼입니다. 이 문서는 **팀플러스 올드 버전**(Wallet v2, 신한pLay-스타일 핀테크: Ice Blue + Rink Navy) 디자인 언어의 공식 가이드입니다.

- 모바일 퍼스트 PWA — Flutter WebView 임베드 80–85%, 브라우저 15–20%
- 모바일 셸 max-width **448px**, 중앙 정렬
- 7개 사용자 역할: admin, 감독, academy_director, 코치, 학부모, teen, 선수(child)

---

## 1. 7대 디자인 원칙

1. **그라디언트 금지** — 단색(solid)만 사용. UI 내 예외 없음 (QR/네이티브 카메라 제외).
2. **backdrop-blur 금지.**
3. **컬러 섀도우 금지** — 브랜드 토큰 `--sh-blue` / `--sh-rink`만 예외.
4. **피드백은 밝기로, 스케일 금지** — 버튼/카드 `active: brightness(0.95)`. (예외: BottomNav 탭만 `active: scale(0.94)`)
5. **WCAG 2.1 — 터치 타겟 44px 이상** — 버튼 높이 44/48/56; 아동 화면은 AAA 18px+ 텍스트.
6. **임의 hex 금지 — 토큰만 사용** (예외: 외부 브랜드 Kakao/Naver, Toast P5–P8 지정 hex).
7. **사람이 만든 느낌** — 플랫, 클린, 1px 보더, 절제된 섀도우.

---

## 2. 컬러

### Primary — Ice Blue
| 토큰 | 값 | 용도 |
|---|---|---|
| `--c-ice-500` | `#2f5fff` | Primary. CTA, 링크, 활성 상태 |
| `--c-ice-700` | `#1837b8` | hover/pressed |

### Secondary — Rink Navy
`#141826` → `#eef0f5` 스케일. 다크 카드, 히어로 밴드, 본문 텍스트.

### Puck (딥 블랙)
`#0a0d14` — 최심도 배경/텍스트.

### 에너지 액센트 (절제 사용 — 통계/뱃지)
- Flame `#ff5a36` · Mint `#00d4a8` · Sun `#ffc940`

### 시맨틱
- success `#16a34a` · warning `#f59e0b` · danger `#ef4444`

### ICETIMES 서브 네임스페이스
`--c-it-blue-800` `#1a2e6a` 등 — 아이덴티티 히어로 스트립, 인증(auth) 화면 전용.

### 서피스
- 페이지 배경 `#f6f8fc` (쿨 블루-그레이)
- 카드 순백 `#ffffff`
- 헤어라인 `#e5e9f2` / `#eef1f7`
- 다크 모드 매핑: bg→puck, surface→rink-800, line→white 8%/4%

### 딤/오버레이 (항상 전체 뷰포트)
- 모달 `rgba(20,24,38,.55)` · 시트 `.45` · 크리티컬 `.70`

---

## 3. 타이포그래피

**Pretendard** 단일 서체 (400/500/600/700/800/900). 전역 자간 -0.01~-0.02em, `word-break: keep-all`.

### Wallet 스케일
| 스타일 | 크기/행간 |
|---|---|
| display | 44/52 |
| h1 | 34/42 |
| h2 | 28/36 |
| h3 | 22/30 |
| title | 18/26 |
| body | 16/24 |
| small | 14/20 |
| caption | 12/17 |

### 카드 내부 5단계 위계
section 18/700 · title 16/600 · emphasis 15/500 · body 14/400 · meta 12/400

- AppBar 타이틀 고정 22px/700.

---

## 4. 스페이싱 · 레이아웃

- 스케일: **4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 72**
- 페이지 좌우 패딩: `clamp(21px, 5.8vw, 25px)`
- 밀도: 리스트 행 py-12px · 카드 패딩 16px · 섹션 간격 24px
- 섹션 헤더 = 18/700 + 우측 "전체보기" 텍스트 링크

### 라디우스
xs 4 · sm 8 · md 12 (버튼/인풋) · lg 16 (표준 카드) · xl 20 (대형 카드) · 2xl 28 (시트/다이얼로그 상단) · pill 999 · Confirm 다이얼로그는 정확히 14px

### 보더 · 섀도우
- 카드 = 흰 배경 + 1px `--c-line-2` 보더 + `--sh-card`(0 1px 3px 8%)
- hover: `--sh-card-hover` + ice 틴트 보더 `rgba(47,95,255,.2)`
- 시트/다이얼로그: 딥 뉴트럴 `--sh-3` / `--sh-dialog`
- 컬러 섀도우 금지 (히어로 CTA용 `--sh-blue`/`--sh-rink`만 예외)

### 배경
플랫 단색만. 그라디언트·패턴 금지 (마케팅용 `ice-pattern.svg` 제외). 아이덴티티 히어로 스트립은 네이비 `--c-it-blue-800` + 흰 텍스트.

---

## 5. 모션 (다이나믹·인터랙티브)

iOS 네이티브 커브 기준. `prefers-reduced-motion` 존중.

| 대상 | 스펙 |
|---|---|
| 시트 슬라이드업 | 350ms `cubic-bezier(.33,1,.68,1)` |
| 모달 | fade + scale .94→1, 280ms |
| 탭 인디케이터 | 탭 간 **슬라이드** 300ms |
| BottomNav 아이콘 | 댐핑 스프링 `--ease-ios-spring` (`tp-fab-land`) |
| 로더 | 사인 이징 `cubic-bezier(.45,0,.55,1)` 루프 (하키 퍽 바운스 + 그림자) |
| 대시보드 숫자 | 카운트업 |

- **Hover:** 배경 틴트(line-2) 또는 보더+섀도우 상승; 텍스트 링크는 어둡게.
- **Press:** `brightness(.95)` — 스케일 금지 (BottomNav `scale(.94)`만 예외).
- **투명도:** 컬러 위 화이트는 알파 사용 (white/16 아이콘 박스, white/65 서브라인). backdrop-blur 금지.

---

## 6. 아이코노그래피

- **시스템 아이콘: Material Symbols Outlined** (variable woff2). 리거처 렌더링: `<span class="material-symbols-outlined">home</span>`
- 기본 weight 400; **활성 상태는 weight 700** (내비게이션에 filled 금지). `FILL 1`은 토스트/컬러 칩 내부만. 크기 16–26px.
- Lucide → Material 매핑 준수 (`users`→`groups`, `calendar`→`calendar_today`).
- 상용 글리프: home, sports_hockey, calendar_today, groups, person, face, notifications, campaign, search, chevron_right, location_on, qr_code_2, emoji_events, account_balance_wallet, check_circle, error, warning, info, close, expand_more, visibility
- 브랜드/스포츠 SVG: hockey-puck, hockey-stick, ice-skate, helmet, club-emblem, credit-coin, qr-checkin
- **로고:** `splash-logo.png`(하키스틱 일러스트) + `splash-wordmark3.png`(밝은 배경용 "팀플러스+" 블랙 워드마크). 네이비/블루 배경엔 화이트 변형(`splash-wordmark.png`/`2`). 재작도 금지.
- 아바타: 원형, ring-2 `--c-line`. 뱃지: gold/silver/bronze SVG.
- 이모지를 아이콘으로 쓰지 않음 (아동 대시보드 🏒⛸️ 예외).

---

## 7. 콘텐츠 · 카피

- **언어:** 한국어 UI, **존댓말**. "~합니다 / ~해주세요 / ~있어요". 친근-프로페셔널, 애교체 금지.
- **톤:** 기능 화면은 간결한 명사구("수업 관리", "출석 내역", "정산"); 피드백은 따뜻하게("김민준님, 환영합니다", "내 수업 페이지에서 확인할 수 있어요.").
- **호칭:** 이름 + 님. "너/당신" 금지.
- **레이블:** 2–4음절 한국어 명사: 훈련·일정·홈·자녀·마이. 버튼은 동사구: "상세 정보", "준비물 확인", "바로가기", "적용하기", "초기화".
- **Toast 카테고리:** 경로/확인/정상/주의/오류 — 컬러 레이블 + 타이틀 14/700 + 설명 12/500.
- **숫자/금액:** 큰 볼드 값 + 작은 단위 ("12 / 20회", "D-3"). 날짜 "5월 12일 (월), 16:00". D-day 뱃지 "D-7".
- **이모지:** 프로덕션 UI에서 사실상 금지.
- **영어:** 상태 칩("Active"/"Inactive")과 브랜드명 TEAMPLUS(항상 대문자)만.
- **빈 상태:** 안심시키는 2줄 — "알림이 없습니다" + "새로운 알림이 도착하면 여기에 표시됩니다."
- **로딩:** "로딩 중..."

---

## 8. 이미지

쿨 톤의 아이스링크/하키 장비 아동 사진. 사각-라운드(r-12) 썸네일. 이미지 없으면 그레이 `--c-line` 플레이스홀더 블록.

---

## 9. 참조 문서

- `SPEC_POPUP_FULLSCREEN_DIM.md` — 풀스크린 딤 팝업 스펙
- `SPEC_TYPOGRAPHY_UNIFICATION.md` — 타이포그래피 통일 스펙
- `LOADING_TIMING_POLICY.md` — 로딩 타이밍 정책
- 디자인 시스템 파일: `tokens/` (토큰) · `components/` (29개 컴포넌트) · `ui_kits/app/` (인터랙티브 UI 킷) · `guidelines/` (스펙 카드)
