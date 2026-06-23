# Frontend Design Master Memory

## Teen 공통 컴포넌트 (components/teen/)
- 11개 컴포넌트 추출 완료: AnimatedSection, EmptyState, ErrorState, SubPageHeader, RankingItem, BadgeCard, ProgressBar, WeeklyStreak, MyRankingSummary, NextClassCard, ChecklistItem
- barrel export: index.ts
- emerald 계열은 child(4-7세) 테마에 더 가까움, teen은 primary(blue) 기반
- schedule/page.tsx와 gift/page.tsx는 child 전용 페이지 (WCAG AAA 대상)
- badges/stickers는 child와 teen 모두 사용하나 child 쪽 터치타겟이 더 큼

## 프로젝트 구조 패턴
- 학생 페이지 경로: `src/app/(student)/`
- teen 대시보드: `/teen`, 하위: `/badges`, `/ranking`, `/schedule`, `/stickers`, `/checklist`, `/gift`
- BottomNav: teenNavItems 사용, variant="fab" + showHomeFab
- 기존 dashboard 컴포넌트: SectionHeader, QuickAction, SwipeStatCards 등은 역할 공유
- Header 컴포넌트: `components/layout/Header.tsx` (ranking에서 사용)

## Admin 공통 컴포넌트 (components/admin/) - 2026-03-05
- 11개 컴포넌트: AdminPageHeader, AdminStatusBadge, AdminFilterChips, AdminEmptyState, AdminLoadingState, AdminListSummary, AdminFloatingAction, AdminSearchBar, AdminStatGrid, AdminActionBar, AdminCardActions
- barrel export: `import { ... } from '@/components/admin'`
- 17개 admin 페이지 분석 기반: 거의 모든 서브페이지가 MobileContainer + hasBottomNav={false}
- 헤더 패턴 2종: default(흰배경 h-14) vs dark(slate-800 h-16)
- 필터 패턴 2종: pill(rounded-full) vs segmented(bg-slate-200 내부 rounded-md)
- 하단 액션: fixed bottom-0 z-40 max-w-md pb-8

## Coach 공통 컴포넌트 (components/coach/) - 2026-03-05
- 10개 컴포넌트: CoachSearchInput, CoachFilterTabs, CoachMemberCard, CoachClassCard, CoachStatCard, CoachAttendanceBar, CoachEmptyState, CoachLoadingSpinner, CoachErrorState, CoachAnimatedSection
- barrel export: `import { ... } from '@/components/coach'`
- Coach 테마 accent: violet (QuickAction에서 bg-violet-50 사용)
- Coach RBAC: useRequireRole(['coach', 'admin'])
- ManagementHeader: attendance-manage, classes-manage에서 사용 (layout 공유)
- isNativeApp() vs useIsNative(): 두 방식 혼용됨 (일관성 개선 필요)

## Parent 공통 컴포넌트 (components/parent/) - 2026-03-05
- 12개 컴포넌트: AnimatedSection, BottomFixedButton, RefreshSpinner, ErrorState, ErrorBanner, EmptySection, StatusBadge, ChildInfoCard, CreditBalanceCard, WeeklyAttendanceGrid, AttendanceProgressBar, SwipeIndicator, ParentSectionTitle, TabSelector
- barrel export: `import { ... } from '@/components/parent'`
- 7개 parent 페이지 분석: parent(dashboard), children, credits, progress, report, review, skill-report
- report/skill-report 거의 동일 구조 (코치 프로필 + RadarChart + SkillStatCard + CoachCommentCard)
- CountUp: `@/components/ui/CountUp` (크레딧, 출석률 애니메이션)

## Director 공통 컴포넌트 (components/director/) - 2026-03-05
- 12개 컴포넌트: AnimatedSection, EmptySection, ErrorState, InfoRow, ActionSheet, TournamentCard, MatchCard, MatchScheduleCard, DirectorPageHeader, TabBar, ScheduleItem, TeamRankingRow
- barrel export: `import { ... } from '@/components/director'`
- TournamentCard에 mapTournamentFromApi 유틸 포함, MatchCard에 TEAM_COLORS 상수 포함
- InfoRow: variant='between'|'grid', TabBar: variant='underline'|'pill'
- Director RBAC: useRequireRole(['director', 'admin'])
- team-chat은 messages 페이지 re-export (별도 컴포넌트 불필요)

## Child 공통 컴포넌트 (components/child/) - 2026-03-05
- 11개 컴포넌트: ChildPageHeader, ChildBigButton, AnimatedSection, ChildErrorState, ChildProgressBar, BadgeDisplay, ChildBottomAction, ChildSectionTitle, ChildCard, ChecklistItem, ChildEmptyState
- barrel export: `import { ... } from '@/components/child'`
- 7개 child 페이지 분석: child(dashboard), badges, stickers, checklist, schedule, attendance-success, gift
- Child 테마: amber/yellow 계열
- WCAG AAA 필수: min 72x72dp 터치 타겟, 7:1 대비율, text-lg+ 폰트
- ChildBigButton: variant로 primary/amber/green/orange/outline 지원, href 시 NavLink 자동 전환
- BadgeDisplay: RARITY_EMOJI export, size sm/md/lg, iconUrl 이미지 지원
- ChildPageHeader: backHref(NavLink) vs back()(router.back) 자동 선택

## 디자인 패턴 관찰
- 카드: bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm
- 페이지 배경: bg-slate-50 dark:bg-slate-900
- 아이콘 배경: 역할별 다른 컬러 (bg-{color}-50 dark:bg-{color}-900/20)
- 뱃지 rarity 이모지 매핑: legendary->trophy, epic->purple, rare->diamond, uncommon->star, common->medal
- 포트: web=5000, admin=5001, backend=5002

## 규칙
- [Parent 화면 디자인 언어 일관성](feedback_parent_consistency.md) — awards(리스트 카드) + children(Summary) 2가지 패턴을 모든 학부모 뷰에 강제 적용, 좌측 stripe/에디토리얼 4단 금지
- [Task Ownership 원칙](feedback_task_ownership.md) — TaskUpdate closing은 본인 owner인 task만, owner 모순 시 team-lead에 명확화 요청 필수

## 카드 5-tier 타이포그래피 (2026-05-16 SoT)
- `.text-card-section` (17-18px Bold): 섹션 헤더 — 기존 text-w-h3 / text-lg font-bold 대체
- `.text-card-title` (15-16px Semibold): 카드 헤더 — 기존 text-w-title / text-w-body / text-base font-semibold 대체
- `.text-card-emphasis` (14-15px Medium): 강조 본문 — 기존 text-w-body-lg 대체
- `.text-card-body` (13-14px): 본문 — 기존 text-w-small / text-sm 대체
- `.text-card-meta` (12px): 메타 — 기존 text-w-caption / text-xs 대체
- 카드 영역 내부에서는 .text-card-* 우선 (globals.css §SoT)
- Hero/Display 영역 (text-w-h2/h1/display)은 변환 대상 아님 — 카드 외 영역
