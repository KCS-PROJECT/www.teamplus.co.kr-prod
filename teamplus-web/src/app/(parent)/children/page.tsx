'use client';

import { useMemo, type ReactNode } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { SectionHead } from '@/components/wallet';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useChildren } from '@/hooks/useChildren';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import type { Child } from '@/components/children/ChildCard';
import { MESSAGES } from '@/lib/messages';
import { PATHS } from '@/lib/paths';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useImagesReady } from '@/hooks/useImagesReady';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

const MAX_CHILDREN = 10;

/**
 * ChildrenManagementPage — 학부모 자녀 관리
 *
 * 디자인 (2026-05-15 ref: app/screen-parent-children.jsx · 07d · 자녀 관리 body 100% 일치):
 * - Child switcher tabs (가로 스크롤 칩, 활성 = dark text1 bg)
 * - Hero child card (활동/휴면 배지 · 22pt 이름 · 메타 · 정보 수정 · 100×100 avatar 슬롯)
 * - Stats 3-col (출석률/이번달/진도)
 * - Next lesson preview
 * - Quick actions 4-row 리스트 (관리 헤더)
 * - Recent coach note 카드
 *
 * **사용자 명시**: 기능 구현 금지 — 디자인만 변경. useChildren 데이터 활용,
 * 부재 필드(코치명·출석률·다음수업·최근메모 등)는 placeholder("—") 또는 빈 메시지로 표기.
 *
 * **자녀추가 버튼**: 기존 TEAMPLUS FAB(우측 하단 +) 그대로 유지 (사용자 명시).
 *
 * 절대 불가침: AppBar/BottomNav 자체 수정 금지 — `MobileContainer` body 영역만 변경.
 */

// ─── ref placeholder symbol ──────────────────────────────────
const DASH = '—';

// ─── helpers ─────────────────────────────────────────────────
function initialOf(name: string): string {
  return name?.trim().charAt(0) || '?';
}

function approvedTeam(child: Child): { teamName: string | null } {
  // Child 타입은 club: string|null SoT (ChildCard 타입 정의 §13)
  return { teamName: child.club ?? null };
}


export default function ChildrenManagementPage() {
  const { navigate } = useNavigation();
  const { children: rawChildren, isLoading, error, refresh } = useChildren();
  // [2026-06-16] 자녀를 출생연도 오름차순(나이 많은 순: 2017 → 2018 → 2021)으로 정렬.
  //   출생일 미상은 맨 뒤로. 상단 탭·선택·카운트 모두 이 정렬된 목록 사용.
  const children = useMemo(() => {
    const yearOf = (c: Child) =>
      c.birthDate ? new Date(c.birthDate).getFullYear() : Number.POSITIVE_INFINITY;
    return [...rawChildren].sort((a, b) => yearOf(a) - yearOf(b));
  }, [rawChildren]);
  // [appbar-harness-v2 fix 2026-05-12]
  //   `isDataLoaded: !isLoading` 가드 제거 — SubmainAppBar + 자녀 카드 리스트만
  //   렌더링하는 BottomNav 탭 hub 페이지이므로 학부모 수업목록(classes/page.tsx) 과
  //   동일 패턴 적용. fetch 중 ui.hideStatusBar() → fetch 실패/race 시 status bar
  //   영구 숨김 회귀 차단. LoadingPuck 컴포넌트가 자체 풀스크린 로더 제공.
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: true });

  const childCount = children.length;
  const canAdd = !isLoading && childCount < MAX_CHILDREN;

  // 선택 자녀는 전역 SelectedChildContext 단일 기준 — 페이지 탭·사이드메뉴 스위처가
  // 같은 상태를 읽고 쓰므로 어느 쪽에서 바꿔도 즉시 양방향 동기화된다.
  // (과거 페이지 로컬 selectedId 우선 구조는 사이드메뉴 변경이 페이지에 반영되지 않는 원인이라 제거)
  const { selectedChildId, setSelectedChildId } = useSelectedChild();
  const selected: Child | null = useMemo(() => {
    if (children.length === 0) return null;
    return children.find((c) => c.id === selectedChildId) ?? children[0];
  }, [children, selectedChildId]);

  // [v20 2026-07-17] 자녀 아바타 img decode 완료까지 ready 신호에 합산 —
  //   로더 hide 직후 아바타가 뒤늦게 그려지는 "랜딩 시 화면 그려짐" 팝인 차단
  //   (LOADING_TIMING_POLICY v18 useImagesReady 합성 패턴).
  const imagesReady = useImagesReady([children]);
  usePageReady(!isLoading && imagesReady);

  // 데이터 fetch 완료 전까지 LoadingContext (풀스크린) 유지 — usePageReady 가 signaling.
  if (isLoading && childCount === 0) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="자녀 관리" />

      {/* ref Body: padding 0, inner sections each have padding "X 20px Y".
          [2026-05-22] 사용자 직접 지시 — 자녀 0명 빈 상태 한정으로 body 컨테이너를
          flex column + items-center + justify-center 로 전환해 카드를 상하·좌우
          화면 정중앙에 배치. 자녀 ≥1 케이스는 기존 상단 정렬 그대로 유지. */}
      <div
        className={cn(
          'flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-30',
          childCount === 0 && 'flex flex-col items-center justify-center',
        )}
      >
        {/* 에러 상태 — role=alert (디자인 시스템 유지) */}
        {error && (
          <div
            className="mx-5 mt-3 flex items-center gap-3 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 p-3 border border-it-red-500/40"
            role="alert"
            aria-live="assertive"
          >
            <Icon name="error" className="text-it-red-500 text-xl shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-card-body font-medium text-it-ink-700 dark:text-it-red-100">
                {error}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refresh()}
              className="shrink-0 text-card-body font-semibold text-it-red-500 hover:underline min-h-[44px] px-2"
            >
              {MESSAGES.dashboard.errorRetry}
            </button>
          </div>
        )}

        {childCount === 0 ? (
          /*
            자녀 0명 — ref 에 정의되지 않은 상태이므로 기존 TEAMPLUS 빈상태 패턴 유지.
            FAB(+) 으로 진입 유도.

            [2026-05-22] 사용자 직접 지시 — 화면 정중앙 정렬 (상하·좌우 기준 가운데).
            부모 컨테이너가 flex column + center 로 전환되므로 여기서는 wrapper 가
            전체 너비를 차지(`w-full`)하면서 좌우 16px padding(`px-4`)만 부여.
            기존 상단 패딩(`pt-4`) 제거 → 부모의 justify-center 가 수직 중앙 처리.
          */
          <div className="w-full px-4">
            <div className="flex flex-col items-center justify-center py-16 px-6 rounded-w-lg bg-it-surface dark:bg-rink-800 border border-it-line dark:border-rink-700 shadow-sh-1">
              <div className="relative flex items-center justify-center size-20 rounded-w-pill bg-it-blue-500/10 mb-5 ring-8 ring-it-blue-500/5">
                <Icon name="family_restroom" className="text-4xl text-it-blue-500" aria-hidden="true" />
              </div>
              <p className="text-card-emphasis font-bold text-it-ink-900 dark:text-white mb-2">
                첫 아이를 등록해보세요
              </p>
              <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center leading-relaxed max-w-[260px]">
                우측 하단
                <span className="inline-flex items-center justify-center align-middle w-5 h-5 rounded-w-pill bg-it-blue-500 text-white mx-1">
                  <Icon name="add" className="text-[14px]" aria-hidden="true" />
                </span>
                버튼을 눌러
                <br />
                자녀의 하키 여정을 시작해요
              </p>
              <button
                type="button"
                onClick={() => navigate('/children/add')}
                className="mt-6 inline-flex items-center gap-2 min-h-[44px] px-5 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-body font-semibold transition-colors motion-reduce:transition-none active:brightness-95"
              >
                <Icon name="add" className="text-[18px]" aria-hidden="true" />
                자녀 등록하기
              </button>
            </div>
          </div>
        ) : (
          <>
            {/*
              Child switcher tabs — ref: "padding: '12px 20px 0', display: flex, gap: 8, overflowX: auto"
              ref 칩: height 38 / padding "0 14px 0 8px" / borderRadius 999
              활성: background T.text1, color #fff, no border
              비활성: background surface, border 1px T.line, color T.text2
              자녀 1명이면 전환할 대상이 없으므로 탭 스위처 자체를 렌더링하지 않는다.
            */}
            {childCount >= 2 && (
              <ChildSwitcherTabs
                tabs={children.map((c) => ({
                  id: c.id,
                  name: c.name,
                  init: initialOf(c.name),
                  // 자녀 스위처이므로 칩 좌측 슬롯은 자녀 본인 사진 (없으면 이니셜 폴백).
                  // 팀 로고는 Hero 팀명 줄과 중복 + 같은 팀 형제 식별 불가로 교체.
                  imageUrl: c.imageUrl ?? null,
                  active: c.id === (selected?.id ?? children[0].id),
                }))}
                onSelect={setSelectedChildId}
              />
            )}

            {selected && (
              <>
                {/* Hero Child Card — ref: padding "14px 20px 0" */}
                <HeroChildCard
                  child={selected}
                  team={approvedTeam(selected).teamName}
                  onEditInfo={() => navigate(`/children/${selected.id}/edit`)}
                />

                {/* [2026-06-17] '훈련 일정' 카드 삭제 (사용자 직접 지시) */}

                {/* Quick actions — ref: padding "12px 20px 0"
                    [2026-05-18 BUG FIX] 4개 카드가 잘못된 경로로 이동하던 라우팅 버그 수정.
                    PATHS SoT 사용으로 향후 회귀 차단. */}
                <QuickActionsList
                  team={approvedTeam(selected).teamName ?? selected.pendingClubName ?? selected.rejectedClubName ?? null}
                  // 팀 정보 → 실제 팀 상세(/team/[id], 로스터·경기 일정 보유)로 직결.
                  // clubIds = approved 멤버십의 teamId 집합 (useChildren SoT).
                  // 승인 팀이 없으면(무소속/대기/반려) 행 비활성 — 선택 자녀와 무관한
                  // /team 목록으로 보내는 폴백은 맥락이 어긋나 제거.
                  // 기존 /children/[childId]/team 요약 페이지는 진입점만 해제하고 보존.
                  approvedTeamId={selected.clubIds?.[0] ?? null}
                  onNav={(target) => {
                    const approvedTeamId = selected.clubIds?.[0];
                    if (target === 'team' && approvedTeamId) {
                      navigate(PATHS.team.detail(approvedTeamId));
                    }
                    // 출석 현황 → 1차 요약 페이지(attendance)
                    if (target === 'attendance') navigate(PATHS.children.attendance(selected.id));
                  }}
                />

                {/* [제거 2026-05-19] RecentCoachNote 섹션 삭제 — 백엔드 미구현 +
                    공식 PRD/로드맵 등재 없음. 영구 빈 카드 청산. */}

                {/* ref: 마지막 16px 여백 */}
                <div className="h-4" />
              </>
            )}
          </>
        )}
      </div>

      {/* Floating Action Button — 자녀 추가 (사용자 명시: 기존 TEAMPLUS FAB 유지)
          (2026-05-11) iPhone 17 Pro Max 등 홈 인디케이터 디바이스 대응 3중 수정:
          fixed + bottom calc(80px + safe-area) + z-50. */}
      <button
        type="button"
        onClick={() => navigate('/children/add')}
        disabled={!canAdd}
        className="fixed right-5 bottom-[calc(80px+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] z-50 flex h-14 w-14 items-center justify-center rounded-w-pill bg-it-blue-500 text-white shadow-sh-blue hover:bg-it-blue-600 hover:shadow-sh-3 active:brightness-95 transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:bg-it-ink-300 dark:disabled:bg-rink-500 disabled:cursor-not-allowed disabled:active:brightness-100 disabled:hover:bg-it-ink-300 dark:disabled:hover:bg-rink-500 disabled:hover:shadow-sh-blue"
        aria-label={canAdd ? '자녀 등록하기' : `자녀는 최대 ${MAX_CHILDREN}명까지 등록할 수 있습니다`}
      >
        <Icon name="add" className="text-[28px]" aria-hidden="true" />
      </button>
    </MobileContainer>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Subcomponents — ref 1:1 매핑
 * ────────────────────────────────────────────────────────────────────────── */

interface SwitcherTab {
  id: string;
  name: string;
  init: string;
  /** 자녀 프로필 사진 — 칩 좌측 슬롯에 우선 표시. 없으면 이니셜 폴백. */
  imageUrl: string | null;
  active: boolean;
}

function ChildSwitcherTabs({
  tabs,
  onSelect,
}: {
  tabs: SwitcherTab[];
  onSelect: (id: string) => void;
}) {
  // [2026-05-18 BUG FIX] 자녀 리스트 잘림 — 가로 스크롤 컨테이너에 좌우 패딩(px-5)이
  // 직접 적용되면 칩 trailing 공간이 잘려 마지막 칩이 화면 가장자리에 붙어 잘려 보임.
  // 패턴: outer wrapper(pt-3) + inner scroll(overflow-x-auto px-5) + trailing spacer(pr-5)
  // 로 우측 마지막 칩 뒤에 20px 의 여백을 확보 → 자녀가 3~5명일 때도 마지막 칩이
  // 완전히 보이도록. shrink-0 은 각 버튼이 컨테이너 폭에 의해 축소되지 않게.
  return (
    <div className="pt-3">
      <div
        className="flex gap-2 overflow-x-auto hide-scrollbar px-5 pb-1"
        role="tablist"
        aria-label="자녀 선택"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.active}
            onClick={() => onSelect(t.id)}
            className={cn(
              /* [시안] 칩 h42, pl8/pr14, fs14.5/800, border 1.5px line-strong */
              'inline-flex items-center gap-2 h-[42px] pl-2 pr-3.5 rounded-w-pill whitespace-nowrap shrink-0 transition-colors motion-reduce:transition-none',
              'text-[14.5px] font-extrabold tracking-[-0.02em]',
              // 활성 칩은 아래 navy Hero(it-blue-800)와 동일 채움 — 선택 칩이 Hero 로 이어지는 연결감.
              // 다크는 배경(puck)과의 구분을 위해 it-blue-500 유지.
              t.active
                ? 'bg-it-blue-800 text-white border-[1.5px] border-it-blue-800 dark:bg-it-blue-500 dark:border-it-blue-500 dark:text-white'
                : 'bg-it-surface text-it-ink-700 border-[1.5px] border-it-line-strong dark:bg-rink-800 dark:text-rink-100 dark:border-rink-700',
            )}
          >
            {/* 칩 좌측 슬롯 — 자녀 프로필 사진 우선, 없으면 이니셜 폴백.
                사진은 활성(navy 칩)에서도 식별되도록 흰 배경 + 얇은 링으로 분리. */}
            {resolveImageSrc(t.imageUrl) ? (
              <span
                className={cn(
                  'w-7 h-7 rounded-full shrink-0 overflow-hidden bg-white',
                  t.active
                    ? 'ring-1 ring-white/50'
                    : 'ring-1 ring-it-line dark:ring-rink-700',
                )}
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveImageSrc(t.imageUrl)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </span>
            ) : (
              <span
                className={cn(
                  'w-7 h-7 rounded-full grid place-items-center text-card-meta font-extrabold',
                  t.active
                    ? 'bg-white/20 text-white'
                    : 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-300',
                )}
              >
                {t.init}
              </span>
            )}
            {t.name}
          </button>
        ))}
        {/* trailing spacer — 마지막 칩 우측에 20px 의 가시 여백 확보 (잘림 방지) */}
        <span className="shrink-0 w-5" aria-hidden="true" />
      </div>
    </div>
  );
}

function HeroChildCard({
  child,
  team,
  onEditInfo,
}: {
  child: Child;
  team: string | null;
  onEditInfo: () => void;
}) {
  // 승인 상태 기반 배지 — [2026-06-17 사용자 직접 지시] 반려(rejected)도 학부모에게는
  //   '승인 대기' 로 표시(대기와 동일 amber 배지). 거절 문구·빨강 배지 미노출.
  const isPending = !!child.pendingClubName;
  const isRejected = !!child.rejectedClubName;
  const isApproved = !!team;
  const isWaiting = isPending || isRejected;
  const statusLabel = isWaiting ? '승인 대기' : isApproved ? '활동 중' : '미소속';
  // navy 밴드 위 배지 — 흰 표면용 컬러 톤 대신 반투명 화이트/액센트 계열
  const statusStyle = isWaiting
    ? { badge: 'bg-sun-500/25 text-white', dot: 'bg-sun-500' }
    : isApproved
      ? { badge: 'bg-mint-500/20 text-white', dot: 'bg-mint-500' }
      : { badge: 'bg-white/15 text-white/80', dot: 'bg-white/50' };
  const birthLabel = child.birthDate
    ? new Date(child.birthDate).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '')
    : DASH;
  const genderLabel =
    child.gender === 'M'
      ? MESSAGES.childProfile.genderMale
      : child.gender === 'F'
        ? MESSAGES.childProfile.genderFemale
        : null;
  const teamLabel = team ?? child.pendingClubName ?? child.rejectedClubName ?? null;
  const init = initialOf(child.name);

  return (
    /* orphan 자녀 상세(/children/[childId])의 navy Hero 흡수 — full-bleed navy 밴드 +
       중앙 아바타/이름. 칩 내용은 기존 /children 방식(상태 배지 + 생년월일)에 성별 추가.
       빠른 이동 4타일(수업이력/수상이력/선수카드/전체수정)은 미이식 — 수정 진입은 우상단 버튼. */
    <section className="mt-2 bg-it-blue-800 dark:bg-it-blue-950 relative" aria-label="자녀 프로필">
      <div className="px-5 pt-7 pb-7 flex flex-col items-center">
        {/* 프로필 사진 — 96px 원형 */}
        <div className="size-24 rounded-w-pill overflow-hidden bg-white/15 dark:bg-white/10 mb-4 shrink-0">
          {resolveImageSrc(child.imageUrl) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={resolveImageSrc(child.imageUrl)}
              alt={`${child.name} 프로필`}
              width={96}
              height={96}
              className="object-cover size-full"
            />
          ) : (
            <div className="size-full flex items-center justify-center">
              <span
                className="text-3xl font-extrabold text-white tracking-[-0.02em] select-none"
                aria-hidden="true"
              >
                {init}
              </span>
            </div>
          )}
        </div>

        {/* 이름 */}
        <h2 className="text-[22px] font-extrabold tracking-[-0.01em] text-white">
          {child.name}
        </h2>

        {/* 메타 — 생년월일 · 성별 (텍스트만) */}
        <p className="mt-3 text-card-meta text-white/70 tabular-nums">
          {birthLabel}
          {genderLabel && (
            <>
              <span className="opacity-50"> · </span>
              {genderLabel}
            </>
          )}
        </p>

        {/* 팀 소속 — 상태 배지는 팀 소속 상태이므로 팀명과 같은 줄에 배치.
            무소속은 팀명 없이 배지만 표시. */}
        <div className="mt-2 flex items-center gap-2 max-w-full">
          {teamLabel && (
            <span className="flex items-center gap-1 min-w-0 text-card-meta text-white/70">
              <Icon name="sports_hockey" className="text-[16px] text-white/80 shrink-0" aria-hidden="true" />
              <span className="truncate">{teamLabel}</span>
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1 shrink-0 text-card-meta font-semibold px-2.5 py-1 rounded-w-pill',
              statusStyle.badge,
            )}
          >
            <span
              className={cn('inline-block size-1.5 rounded-w-pill', statusStyle.dot)}
              aria-hidden="true"
            />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* 정보 수정 진입 — 기존 chevron 역할 유지 (navy 위 우상단) */}
      <button
        type="button"
        onClick={onEditInfo}
        aria-label="정보 수정"
        className="absolute top-2 right-2 flex size-12 items-center justify-center rounded-w-pill text-white/80 transition-colors motion-reduce:transition-none hover:bg-white/10 active:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <Icon name="edit" className="text-[18px]" aria-hidden="true" />
      </button>
    </section>
  );
}

// [2026-06-08] 관리 메뉴에서 '의료 · 보험 정보'(medical) 항목 삭제.
// [2026-06-18] '수업 등록 내역'(classes) + '출석 · 진도 기록'(attendance) 중복 2행을
//   '출석 현황' 1행으로 통합 → attendance 1차 요약 페이지로 진입.
type QuickActionKey = 'team' | 'attendance';

function QuickActionsList({
  team,
  approvedTeamId,
  onNav,
}: {
  team: string | null;
  /** 선택 자녀의 승인 대표 팀 ID — 없으면 팀 정보 행 비활성 (이동 대상 없음) */
  approvedTeamId: string | null;
  onNav: (target: QuickActionKey) => void;
}) {
  const rows: { key: QuickActionKey; label: string; sub: string; icon: ReactNode; warn?: boolean; disabled?: boolean }[] = [
    {
      key: 'team',
      label: MESSAGES.childAttendance.quickActionTeamLabel,
      sub: team ?? MESSAGES.team.childHeaderNoTeamLabel,
      disabled: !approvedTeamId,
      icon: (
        <>
          <circle cx="6" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="13" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M2.5 15c.6-2.4 2.2-3.5 4-3.5s3.4 1.1 4 3.5M10 12c1.4 0 2.8.8 3.5 3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </>
      ),
    },
    {
      key: 'attendance',
      label: MESSAGES.childAttendance.quickActionLabel,
      sub: MESSAGES.childAttendance.quickActionSub,
      icon: (
        <>
          <path d="M3 16V4M3 16h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path
            d="M6 12l3-4 3 2 4-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ),
    },
  ];

  return (
    /* [ICETIMES flat 재작업 2026-06-24] 관리 리스트를 카드 박스(mx-5 rounded-2xl border)
       에서 full-bleed 흰 섹션(bg-it-surface)으로 전환. 행은 hairline(border-it-line)으로
       구분되며 마지막 행 구분선 제거. 시안(ParentChildren.jsx) ListRow + /director 와 동일. */
    <section className="mt-2 bg-it-surface dark:bg-it-blue-950 pb-2">
      {/* 헤더 — SectionHead(iceTheme) 동일 위계 (17px/800) */}
      <SectionHead title={MESSAGES.childAttendance.quickActionSectionTitle} iceTheme />
      <div className="px-4 sm:px-5">
        {rows.map((r, i) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onNav(r.key)}
            disabled={r.disabled}
            className={cn(
              'w-full flex items-center gap-3 py-3.5 text-left',
              i < rows.length - 1 && 'border-b border-it-line dark:border-it-blue-900',
              'transition-colors motion-reduce:transition-none active:bg-it-fill dark:active:bg-rink-900/40',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:bg-transparent dark:disabled:active:bg-transparent',
            )}
          >
            {/* icon box — [시안] 38×38 r10 / bg fill / border 1px line */}
            <span className="w-[38px] h-[38px] shrink-0 grid place-items-center rounded-[10px] bg-it-fill dark:bg-rink-900 border border-it-line dark:border-it-blue-900 text-it-ink-600 dark:text-wtext-4">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                {r.icon}
              </svg>
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                {/* [시안 ListRow] title 15.5/700 */}
                <span className="text-[15.5px] font-bold text-it-ink-900 dark:text-white tracking-[-0.01em]">
                  {r.label}
                </span>
                {/* ref warn dot: T.warning = TEAMPLUS warning 토큰 정확 매핑 */}
                {r.warn && <span className="w-1.5 h-1.5 rounded-full bg-warning-500" />}
              </span>
              {/* [시안 ListRow] subtitle 13/500/muted */}
              <span className="block mt-0.5 text-[13px] font-medium text-it-ink-500 dark:text-wtext-4">
                {r.sub}
              </span>
            </span>
            {/* chevron — ref: 14×14 path M5 3l4 4-4 4 / text3. 비활성 행은 이동이 없으므로 미표시 */}
            {!r.disabled && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-it-ink-300 dark:text-wtext-4"
              >
                <path
                  d="M5 3l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

