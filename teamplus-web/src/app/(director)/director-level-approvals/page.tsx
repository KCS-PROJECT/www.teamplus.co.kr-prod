'use client';

/**
 * Director Level Approvals — 자동 계산 등급 승인 (감독 전용)
 * ──────────────────────────────────────────────────
 * Task #40 C-5 감독 승인 UI (Web)
 *
 * 배경:
 *   level-calculator 서비스가 월 1회 멤버별 등급을 자동 산출하고
 *   `MemberLevelHistory.status = PENDING_APPROVAL` 로 적재한다.
 *   감독(DIRECTOR/ACADEMY_DIRECTOR)은 본 화면에서 승인 또는 오버라이드한다.
 *
 * API:
 *   GET   /member-level/pending?season=
 *   PATCH /member-level/:id/approve
 *   PATCH /member-level/:id/override  { newLevel: 1|2|3 }
 *
 * 권한:
 *   DIRECTOR/ACADEMY_DIRECTOR 롤 가드는 (director)/layout.tsx 에서 단 한 번만 수행.
 *
 * 7원칙 체크:
 *   ① 화면 분석: 다른 director 페이지(credits, approvals) 패턴 일치
 *   ② 휴먼 디자인: 감독이 직관적으로 점수 근거 + 등급 변화 판단
 *   ③ AI 스타일 금지: gradient/backdrop-blur/colored-shadow 미사용
 *   ④ 페르소나: frontend + analyzer (데이터 흐름 + UX)
 *   ⑤ 명령어: MobileContainer / PageAppBar / Icon / EmptyState / Toast
 *   ⑥ 결과 출력: 본 주석
 *   ⑦ Tone & Manner: MESSAGES 상수, 하드코딩 최소화, "승인하기"/"직접 변경"
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';
import {
  memberLevelService,
  parseReason,
  tierLabel,
  recentSeasons,
  currentSeason,
  type PendingLevelApproval,
  type MemberLevelTier,
} from '@/services/member-level.service';

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

// 점수 막대 — 데이터 시각화. 종합=blue / 출석=초록(정규 SoT) / 대회=red(대회 SoT) / 코치=ink.
const SCORE_BARS: Array<{
  key: keyof ReturnType<typeof parseReason>;
  label: string;
  weight: number;
  colorClass: string;
  bgClass: string;
}> = [
  {
    key: 'composite',
    label: '종합',
    weight: 100,
    colorClass: 'bg-it-blue-500',
    bgClass: 'bg-it-blue-50 dark:bg-it-blue-900/30',
  },
  {
    key: 'attendance',
    label: '출석',
    weight: 40,
    colorClass: 'bg-emerald-500',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
  {
    key: 'tournament',
    label: '대회',
    weight: 40,
    colorClass: 'bg-it-red-500',
    bgClass: 'bg-it-red-50 dark:bg-it-red-500/15',
  },
  {
    key: 'coach',
    label: '코치',
    weight: 20,
    colorClass: 'bg-it-ink-500',
    bgClass: 'bg-it-line dark:bg-it-blue-900/40',
  },
];

function formatName(
  user: PendingLevelApproval['user'],
): string {
  if (!user) return '이름 없음';
  const first = user.firstName?.trim() ?? '';
  const last = user.lastName?.trim() ?? '';
  const joined = `${last}${first}`.trim();
  if (joined) return joined;
  if (user.email) return user.email.split('@')[0] ?? '이름 없음';
  return '이름 없음';
}

function formatChangedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function tierChipClass(tier: number): string {
  if (tier === 3)
    return 'bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-900/40 dark:text-it-blue-300';
  if (tier === 2)
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  return 'bg-it-line text-it-ink-600 dark:bg-it-blue-900/40 dark:text-it-ink-200';
}

// ---------------------------------------------------------------------------
// TierDiff — 이전 → 새 등급 시각화
// ---------------------------------------------------------------------------

function TierDiff({ item }: { item: PendingLevelApproval }) {
  const direction: 'up' | 'down' | 'same' =
    item.newLevel > item.previousLevel
      ? 'up'
      : item.newLevel < item.previousLevel
        ? 'down'
        : 'same';

  const arrowIcon =
    direction === 'up'
      ? 'trending_up'
      : direction === 'down'
        ? 'trending_down'
        : 'trending_flat';

  const arrowColor =
    direction === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : direction === 'down'
        ? 'text-it-red-500 dark:text-it-red-400'
        : 'text-it-ink-400 dark:text-it-ink-300';

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-card-meta font-bold ${tierChipClass(
          item.previousLevel,
        )}`}
      >
        {tierLabel(item.previousLevel)}
      </span>
      <div className={`flex size-7 items-center justify-center rounded-w-pill ${
        direction === 'up' ? 'bg-emerald-50 dark:bg-emerald-900/30'
        : direction === 'down' ? 'bg-it-red-50 dark:bg-it-red-500/15'
        : 'bg-it-line dark:bg-it-blue-900/40'
      }`}>
        <Icon
          name={arrowIcon}
          className={`text-card-title ${arrowColor}`}
          aria-hidden="true"
        />
      </div>
      <span
        className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-card-meta font-bold ${tierChipClass(
          item.newLevel,
        )}`}
      >
        {tierLabel(item.newLevel)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScoreBars — 4개 점수 막대
// ---------------------------------------------------------------------------

function ScoreBars({ reason }: { reason: string | null }) {
  const parsed = parseReason(reason);
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {SCORE_BARS.map((bar) => {
        const raw = parsed[bar.key];
        const numeric = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
        const clamped = Math.min(100, Math.max(0, numeric));

        return (
          <div
            key={bar.key}
            className="flex flex-col gap-1.5 rounded-w-md bg-it-fill dark:bg-it-blue-900/30 p-2.5"
          >
            <div className="flex items-center justify-between text-card-meta">
              <span className="font-semibold text-it-ink-700 dark:text-it-ink-200">
                {bar.label}
                {bar.weight < 100 && (
                  <span className="ml-1 text-card-meta font-medium text-it-ink-400 dark:text-it-ink-300">
                    · {bar.weight}%
                  </span>
                )}
              </span>
              <span className="font-bold tabular-nums text-it-ink-800 dark:text-white">
                {numeric.toFixed(1)}
              </span>
            </div>
            <div
              className={`h-1.5 w-full rounded-w-pill overflow-hidden ${bar.bgClass}`}
              role="progressbar"
              aria-label={`${bar.label} 점수`}
              aria-valuenow={Math.round(clamped)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-w-pill transition-all motion-reduce:transition-none ${bar.colorClass}`}
                style={{ width: `${clamped}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApprovalCard — 단일 승인 카드
// ---------------------------------------------------------------------------

function ApprovalCard({
  item,
  onApprove,
  onOverride,
  busyId,
}: {
  item: PendingLevelApproval;
  onApprove: (id: string) => void;
  onOverride: (item: PendingLevelApproval) => void;
  busyId: string | null;
}) {
  const isBusy = busyId === item.id;
  const name = formatName(item.user);

  return (
    // ICETIMES flat — 카드 박스 제거. 부모 섹션 divide-it-line hairline 으로 행 구분.
    <div className="py-5 space-y-4">
      {/* 상단 — 이름 + 메타정보 */}
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="truncate text-card-emphasis font-bold text-it-ink-800 dark:text-white">
              {name}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-card-meta text-it-ink-400 dark:text-it-ink-300">
              {item.season && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="event" className="text-[13px] text-it-blue-500" aria-hidden="true" />
                  {item.season}
                </span>
              )}
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Icon name="schedule" className="text-[13px] text-it-blue-500" aria-hidden="true" />
                {formatChangedAt(item.changedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* 등급 변화 — 전/후 비교 inset */}
        <div className="rounded-w-md bg-it-fill dark:bg-it-blue-900/30 px-4 py-3">
          <p className="mb-2 text-card-meta font-bold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
            등급 변화
          </p>
          <TierDiff item={item} />
        </div>
      </header>

      {/* 점수 막대 */}
      <div>
        <p className="mb-2 text-card-meta font-bold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
          점수 상세
        </p>
        <ScoreBars reason={item.reason} />
      </div>

      {/* 액션 버튼 */}
      <footer className="grid grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={() => onOverride(item)}
          disabled={isBusy}
          className="h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-surface dark:bg-it-blue-950 text-card-body font-bold text-it-blue-600 dark:text-it-ink-200 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-it-blue-900/40 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          직접 변경
        </button>
        <button
          type="button"
          onClick={() => onApprove(item.id)}
          disabled={isBusy}
          className="h-12 rounded-w-md bg-it-blue-500 text-card-body font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? '처리 중...' : '승인하기'}
        </button>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverrideSheet — 감독이 직접 등급 지정
// ---------------------------------------------------------------------------

function OverrideSheet({
  item,
  busy,
  onClose,
  onSubmit,
}: {
  item: PendingLevelApproval | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (id: string, tier: MemberLevelTier) => void;
}) {
  const [selected, setSelected] = useState<MemberLevelTier | null>(null);

  useEffect(() => {
    if (item) {
      const initial = item.newLevel as MemberLevelTier;
      setSelected([1, 2, 3].includes(initial) ? initial : null);
    } else {
      setSelected(null);
    }
  }, [item]);

  if (!item) return null;

  const tiers: Array<{ level: MemberLevelTier; desc: string }> = [
    { level: 3, desc: '종합 점수 70점 이상 권장' },
    { level: 2, desc: '종합 점수 40~69점 권장' },
    { level: 1, desc: '종합 점수 40점 미만 권장' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-it-ink-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-it-surface dark:bg-it-blue-950 p-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto hide-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h2
            id="override-sheet-title"
            className="text-card-title font-bold text-it-ink-800 dark:text-white"
          >
            등급 직접 변경
          </h2>
          <p className="text-card-meta text-it-ink-400 dark:text-it-ink-300">
            <span className="font-semibold text-it-ink-700 dark:text-it-ink-200">
              {formatName(item.user)}
            </span>
            님의 새 등급을 선택하세요.
          </p>
        </div>

        <div className="space-y-2" role="radiogroup" aria-label="새 등급 선택">
          {tiers.map((t) => {
            const active = selected === t.level;
            return (
              <button
                key={t.level}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(t.level)}
                className={`w-full rounded-w-md border-[1.5px] p-3 text-left transition-colors motion-reduce:transition-none ${
                  active
                    ? 'border-it-blue-500 bg-it-blue-50 dark:border-it-blue-500 dark:bg-it-blue-900/30'
                    : 'border-it-line-strong dark:border-it-blue-900 bg-it-surface dark:bg-it-blue-950 hover:bg-it-fill dark:hover:bg-it-blue-900/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-w-pill text-card-meta font-semibold ${tierChipClass(
                      t.level,
                    )}`}
                  >
                    {tierLabel(t.level)} ({t.level})
                  </span>
                  {active && (
                    <Icon
                      name="check_circle"
                      className="text-xl text-it-blue-500"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="mt-1.5 text-card-meta text-it-ink-400 dark:text-it-ink-300">
                  {t.desc}
                </p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-12 rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-surface dark:bg-it-blue-950 text-card-body font-bold text-it-ink-700 dark:text-it-ink-200 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-it-blue-900/40 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {MESSAGES.common.cancel}
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected && !busy) onSubmit(item.id, selected);
            }}
            disabled={busy || !selected}
            className="h-12 rounded-w-md bg-it-blue-500 text-card-body font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '처리 중...' : '변경하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DirectorLevelApprovalsPage() {
  const { toast } = useToast();

  const seasonOptions = useMemo(() => recentSeasons(3), []);
  const [season, setSeason] = useState<string>(currentSeason());

  const [items, setItems] = useState<PendingLevelApproval[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [overrideTarget, setOverrideTarget] =
    useState<PendingLevelApproval | null>(null);

  usePageReady(!isLoading);

  const load = useCallback(
    async (currentSeasonArg: string) => {
      setIsLoading(true);
      const res = await memberLevelService.getPendingApprovals(currentSeasonArg);
      if (res.success) {
        setItems(res.data ?? []);
      } else {
        setItems([]);
        toast.error(res.error?.message ?? MESSAGES.common.loadFailed);
      }
      setIsLoading(false);
    },
    [toast],
  );

  useEffect(() => {
    void load(season);
  }, [load, season]);

  const handleApprove = useCallback(
    async (id: string) => {
      setBusyId(id);
      const res = await memberLevelService.approveLevel(id);
      if (res.success) {
        toast.success(res.data?.message ?? MESSAGES.approval.approved);
        setItems((prev) => prev.filter((x) => x.id !== id));
      } else {
        toast.error(res.error?.message ?? MESSAGES.director.approvalError);
      }
      setBusyId(null);
    },
    [toast],
  );

  const handleOverride = useCallback(
    async (id: string, tier: MemberLevelTier) => {
      setBusyId(id);
      const res = await memberLevelService.overrideLevel(id, tier);
      if (res.success) {
        toast.success(res.data?.message ?? '등급이 변경되었습니다.');
        setItems((prev) => prev.filter((x) => x.id !== id));
        setOverrideTarget(null);
      } else {
        toast.error(res.error?.message ?? '등급 변경에 실패했습니다.');
      }
      setBusyId(null);
    },
    [toast],
  );

  const totalCount = items.length;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="선수 등급 승인" forceNative />

      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label="선수 등급 승인"
      >
        {/* 요약 — navy 히어로 밴드 full-bleed (ICETIMES §3) */}
        <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-6 pb-6 text-white" aria-label="승인 대기 요약">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-w-md bg-white/15">
              <Icon name="military_tech" className="text-[18px] text-white" aria-hidden="true" />
            </div>
            <h2 className="text-card-body font-semibold text-white/90">선수 등급 자동 산정</h2>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[38px] font-extrabold font-num tabular-nums leading-none">{isLoading ? '-' : totalCount}</span>
            <span className="text-card-body font-medium text-white/70">건 대기 중</span>
          </div>
          <p className="mt-2 text-card-meta text-white/70 leading-relaxed">
            종합 점수 = 출석률 × 40% + 대회 × 40% + 코치 평가 × 20%
          </p>
        </section>

        {/* 시즌 필터 — full-bleed 흰 섹션 (8px 회색 갭) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-5" aria-label="시즌 선택">
          <label
            htmlFor="season-select"
            className="mb-2 block text-card-meta font-bold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300"
          >
            시즌 선택
          </label>
          <div className="relative">
            <Icon
              name="event_available"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-card-emphasis text-it-blue-500"
              aria-hidden="true"
            />
            <select
              id="season-select"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="h-12 w-full cursor-pointer appearance-none rounded-w-md border-[1.5px] border-it-line-strong dark:border-it-blue-900 bg-it-fill dark:bg-it-blue-900/40 pl-9 pr-9 text-card-body font-medium text-it-ink-800 dark:text-white outline-none transition-colors motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
              aria-label="시즌 선택"
            >
              {seasonOptions.map((s) => (
                <option key={s} value={s}>
                  {s} 시즌
                </option>
              ))}
            </select>
            <Icon
              name="expand_more"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-card-emphasis text-it-ink-400 dark:text-it-ink-300"
              aria-hidden="true"
            />
          </div>
        </section>

        {/* 리스트 — full-bleed 흰 섹션 + hairline 구분 행 */}
        {isLoading ? null : totalCount === 0 ? (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
            <EmptyState
              variant="generic"
              icon="military_tech"
              title={MESSAGES.approvals.emptyApprovalHistory}
              description="자동 계산된 등급 변경 요청이 이 시즌에는 없습니다."
            />
          </section>
        ) : (
          <section
            className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-7"
            aria-label="승인 대기 목록"
          >
            <div className="flex items-baseline gap-2 pb-1">
              <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                승인 대기
              </h2>
              <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                {totalCount}
              </span>
            </div>
            <div className="flex flex-col divide-y divide-it-line dark:divide-it-blue-900">
              {items.map((item) => (
                <ApprovalCard
                  key={item.id}
                  item={item}
                  onApprove={handleApprove}
                  onOverride={setOverrideTarget}
                  busyId={busyId}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <OverrideSheet
        item={overrideTarget}
        busy={busyId === overrideTarget?.id}
        onClose={() => setOverrideTarget(null)}
        onSubmit={handleOverride}
      />
    </MobileContainer>
  );
}
