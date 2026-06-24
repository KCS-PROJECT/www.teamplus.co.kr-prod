# ICETIMES (하우머치 스타일) 디자인 롤아웃

> **상태**: 진행 중 부분 롤아웃 (2026-06-24 기준 17화면 + 공유 컴포넌트 적용)
> **성격**: 기존 디자인(DESIGN.md · ice-500)과 **공존**. `it-*` 토큰 신설 + `iceTheme` variant로 점진 교체.
> **SoT 관계**: 전체 롤아웃 완료 시 본 문서를 `DESIGN.md`로 승격/통합. 그 전까지 미적용 화면은 기존 DESIGN.md SoT를 따른다.
> **참고자료**: `backdata/teamplus_하우머치스타일/` (ICETIMES Design System 패키지 — tokens·ui_kits JSX·components)

---

## 1. 개요 — 점진 롤아웃 전략

- **목표**: TEAMPLUS 웹을 ICETIMES(하우머치) 스타일로 단계적 교체 — 2색(blue+red) + ink, flat & sectioned("카드 박스 제거").
- **토큰**: 기존 `ice/rink/w*`를 건드리지 않고 `it-*` 네임스페이스를 **신설**(tailwind.config.cjs). 전역 오염 0.
- **공유 컴포넌트**: `iceTheme?: boolean` variant 추가. **기본 false = 기존 스타일 1:1 보존**(회귀 0), `true`일 때만 ICETIMES. ICETIMES 화면(호출처)만 `iceTheme` 전달.
- **이유**: 250여 페이지 중 일부만 적용된 상태라, 기존 토큰/컴포넌트를 직접 덮으면 미적용 화면이 깨진다. variant로 격리.

---

## 2. 토큰 (`tailwind.config.cjs` · `it-*`)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `it-blue-500` | `#0E5DB0` | primary 버튼·링크·활성 |
| `it-blue-700/800/900` | `#163F86`·`#1A2E6A`·`#14224F` | navy 히어로·스플래시 |
| `it-blue-50` | `#EEF4FB` | 선택/소프트 배경 |
| `it-red-500` | `#C8202E` | 화면당 1개 강조·경고·"오늘" pill·필수표시 |
| `it-ink-800/500/400/300` | `#1E3135`·`#6B7A80`·`#93A0A6`·`#C0C8CC` | 본문 위계 |
| `it-canvas` / `it-surface` / `it-fill` | `#F4F6F8` / `#FFFFFF` / `#F7F9FB` | 회색 캔버스 / 흰 섹션 / 인셋 |
| `it-line` / `it-line-strong` | `#ECEFF1` / `#DDE3E6` | hairline / 인풋·강조 경계 |

- radius 12px = 기존 `rounded-w-md` 재사용 · 폰트/숫자 = `font-sans`/`font-num`(Pretendard, tabular).

---

## 3. flat 패턴 규칙 (iceTheme=true)

- **레이아웃**: main `bg-it-canvas`(회색). 콘텐츠 블록은 각각 **full-bleed 흰 섹션** `<section className="mt-2 bg-it-surface dark:bg-it-blue-950">`로, 섹션 간 `mt-2`(8px) 회색 갭. **카드 박스(rounded-w-*·shadow-*·외곽 border) 금지** → hairline 행(`border-b border-it-line` / `divide-it-line`).
  - ⚠️ "박스 제거"만 하고 흰 배경(`bg-it-surface`)을 빠뜨리면 콘텐츠가 회색 위에 떠 보인다 — **흰 섹션 배경 필수**.
- **히어로**: 잔액/요약은 navy 밴드 `bg-it-blue-800 dark:bg-it-blue-950` full-bleed (금액 38px/800 tabular).
- **하단 여백**: 대시보드 홈 main에 `!pb-8`(공통 `pb-30`은 BottomNav용 outer div와 중복 → override).
- **SectionHead**: 제목 17px/800. action 13px/600 + `chevron_right`(18px). `accent`(red bar)는 회원 승인 등 일부만(기본 off). `count`(blue 15/800) 옵션.
- **탭**: SegmentedTabs(밑줄형 — 결제권/결제 내역) · 컴팩트 inline 토글(일정 이번주/이번달, bg-it-fill).
- **칩(Chip/ChildChip)**: h36 · px16 · 14px/700 · `rounded-w-pill` · border 1.5px. active=`bg-it-blue-500` 흰글자 / idle=`bg-it-surface`+`border-it-line-strong`+`it-ink-600`.
- **Input(iceTheme)**: 컨테이너형, h52(login)/50, border 1.5px, `rounded-w-md`, `bg-it-fill`, 15.5px/600.
- **Button(iceTheme)**: lg h54/16px · md h48/15 · secondary=outline(it-blue-600 + it-line-strong border).
- **ClassListCard(iceTheme)**: flat(무라운드 + hairline). title 15.5px/700. 타입 배지/아이콘 색 = 달력 SoT(§4).
- **금지(기존 규칙 동일)**: gradient · backdrop-blur(헤더 예외) · 컬러 그림자 · pipe 세로 구분선.

---

## 4. 달력 색 SoT · 용어

- **달력 타입 색** (`src/lib/calendar-colors.ts` — SoT): 정규=**emerald `#10B981`(초록)** · 오픈클래스/레슨=**blue `#3B82F6`(파랑)** · 대회/GAME=**red `#EF4444`(빨강)**. 요일은 **일~토**(프로젝트 `calendar-week.ts` 결합, 변경 금지).
- **"오늘" pill**: red 배경 흰글자, 날짜 라벨 우측. (일정화면·대시보드 통일)
- **용어 "수업"→"훈련"**: `classes-manage`·일정(director-schedules)·훈련상세(classes/[id])·`/classes` 화면의 노출 텍스트를 "수업/정규수업"→"훈련/정규훈련"으로 통일. `/classes` 헤더는 `MESSAGES.dashboard.links.trainingList`("훈련 목록").
  - **유지**: 전역 `TRAINING_TYPE_LABEL`(class-categories.ts)·대시보드 "수업 목록" 섹션(`classList`)은 미변경(다른 맥락) → 필요한 화면만 로컬 override.
  - **보류**: 오픈클래스 FAB "수업 등록하기", 메뉴 그룹 제목 "수업 관리" (미결정).

---

## 5. 적용 범위 (2026-06-24)

**적용 완료 (17화면 page-local + 공유 컴포넌트)**
- 인증: `/splash`·`/login`·`/signup`
- 감독: `/director`·`/director-members`·`/director-credits`·`/director-payments`·`/director-schedules`·`/academy-director`
- 학부모: `/parent`·`/children`·`/credits`·`/parent-calendar`·`/report`
- 수업/오픈클래스: `/classes`·`/classes/[id]`·`/classes-manage`
- 공유 컴포넌트(iceTheme variant): SectionHead · ClassListCard · ChildCard · ChildChip · Input · Button · 캘린더(ScheduleRangeList·ScheduleRow·UnifiedCalendarGrid·CalendarDot·EnrolledTrainingSection) · 대시보드(ClassCalendarSection·WeekScheduleList·TeamClassesSummary·RecentNoticesSection) · director(DirectorEmptyCard·DirectorPendingApprovals) · report(SkillStatCard·CoachCommentCard·RadarChart·GrowthTrendChart)

**미적용 (기존 DESIGN.md SoT 유지 · iceTheme=false)**
- 코치·admin·child·teen 화면 및 나머지 ~230 페이지. (추후 단계 확장)

---

## 6. 검증 기준 (재발 방지)

이번 롤아웃에서 두 번 놓쳐 사용자 반려된 항목 — 검증 시 필수 확인:
1. **"색만 스왑" 금지**: it-* 토큰이 기존색과 유사(`it-canvas`≈`wbg`)해 색만 바꾸면 변화가 없다. **카드 박스 제거 등 DOM 구조 변경**이 실제로 됐는지 diff로 확인.
2. **흰 섹션 배경 필수**: 박스만 제거하고 `bg-it-surface`를 빠뜨리면 회색 위 떠있음. main(it-canvas) 직계 콘텐츠가 흰 섹션인지.
3. **시안 전 요소 대조**: 흰섹션·색뿐 아니라 칩·버튼·행·타이포(px/weight)·간격까지 시안 DS 컴포넌트 정의와 1:1.
4. **렌더 확인 게이트**: 코드(클래스/tsc)만으로 합격 판정 금지 — 실제 렌더(사용자 확인/스크린샷)로 검증.
5. **회귀 0**: 공유 컴포넌트 `iceTheme=false` 경로가 원본 1:1 보존인지(미적용 화면 픽셀 동일).

> 교훈 상세: `docs/solutions/2026-06-24-icetimes-flat-vs-colorswap.md` · `...-pilot.md` · `...-phase2.md`
