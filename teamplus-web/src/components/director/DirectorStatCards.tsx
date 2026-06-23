'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CountUp } from '@/components/ui/CountUp';

import { NavLink } from '@/components/ui/NavLink';

interface DirectorStatCardsProps {
  attendanceRate: number;
  attendanceChange: number;
  totalMembers: number;
  presentMembers: number;
  absentMembers: number;
  isAnimated: boolean;
  dateLabel: string;
  /**
   * 선택적 — 승인 대기 회원 수. 0 초과 시 세 번째 warning 카드로 노출 (DIRECTOR-1).
   * Hot zone 에 배치되어 승인 반응 속도 개선.
   */
  pendingApprovals?: number;
  /**
   * 승인 대기 카드 클릭 시 이동할 href. 기본 '/director-approvals'.
   */
  pendingHref?: string;
}

const PROGRESS_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const LEGEND_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';

export function DirectorStatCards({
  attendanceRate,
  attendanceChange,
  totalMembers,
  presentMembers,
  absentMembers,
  isAnimated,
  dateLabel,
  pendingApprovals = 0,
  pendingHref = '/director-approvals',
}: DirectorStatCardsProps) {
  return (
    <section aria-label="팀 전체 출석 현황">
      <div className="flex items-end justify-between mb-4 px-1">
        <h3 className="text-[19px] font-bold text-wtext-1 dark:text-white">팀 전체 출석 현황</h3>
        <span className="text-[11px] font-bold text-ice-500 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-800/30">
          {dateLabel}
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {/* ── 오늘의 출석률 카드 ── */}
        <div className="bg-white dark:bg-rink-800 rounded-2xl p-6 border border-wline-2 dark:border-rink-700 flex flex-col justify-between min-h-[200px]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-wtext-3 dark:text-rink-300 text-sm font-semibold mb-1.5">오늘의 출석률</p>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold text-wtext-1 dark:text-white tabular-nums">
                  {isAnimated ? <CountUp end={attendanceRate} duration={1500} /> : 0}%
                </span>
                <ChangeBadge value={attendanceChange} />
              </div>
              <p className="text-[12px] text-wtext-3 dark:text-rink-300 mt-2 font-medium">
                전체 {totalMembers}명 중{' '}
                <span className="text-ice-500 font-bold">{presentMembers}명</span>이 출석하셨습니다
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-2xl">
              <Icon name="groups" className="text-ice-500 text-[28px]" aria-hidden="true" />
            </div>
          </div>
          {/* 프로그레스 바 */}
          <AttendanceSplitProgressBar
            attendanceRate={attendanceRate}
            presentMembers={presentMembers}
            absentMembers={absentMembers}
            isAnimated={isAnimated}
          />
        </div>

        {/* [삭제 2026-04-29] 이번 달 훈련 이수율 카드 — 사용자 요청 */}

        {/* DIRECTOR-1: 승인 대기 카드 — pendingApprovals > 0 일 때만 렌더.
            Hot zone 에 warning 카드로 배치 → 스크롤 없이 즉시 액션 유도. */}
        {pendingApprovals > 0 && (
          <NavLink
            href={pendingHref}
            aria-label={`승인 대기 ${pendingApprovals}건, 상세 보기`}
            className="bg-white dark:bg-rink-800 rounded-2xl p-6 border border-orange-200 dark:border-orange-800/50 flex items-center justify-between active:brightness-95 transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-2xl shrink-0">
                <Icon name="how_to_reg" className="text-orange-600 dark:text-orange-400 text-[28px]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-wtext-3 dark:text-rink-300 text-sm font-semibold mb-1">승인 대기</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold text-orange-600 dark:text-orange-400 tabular-nums">
                    {pendingApprovals}
                  </span>
                  <span className="text-base font-bold text-wtext-3 dark:text-rink-300">건</span>
                </div>
              </div>
            </div>
            <Icon name="chevron_right" className="text-2xl text-wtext-3 dark:text-rink-300 shrink-0" aria-hidden="true" />
          </NavLink>
        )}
      </div>
    </section>
  );
}

function AttendanceSplitProgressBar({
  attendanceRate,
  presentMembers,
  absentMembers,
  isAnimated,
}: {
  attendanceRate: number;
  presentMembers: number;
  absentMembers: number;
  isAnimated: boolean;
}) {
  const clampedAttendanceRate = Math.min(Math.max(attendanceRate, 0), 100);
  const absentRate = Math.max(0, 100 - clampedAttendanceRate);
  const [isBarVisible, setIsBarVisible] = useState(false);
  const [isLegendVisible, setIsLegendVisible] = useState(!isAnimated);

  useEffect(() => {
    if (!isAnimated) {
      setIsBarVisible(false);
      setIsLegendVisible(true);
      return;
    }

    setIsBarVisible(false);
    setIsLegendVisible(false);

    let firstFrame: number | null = null;
    let secondFrame: number | null = null;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setIsBarVisible(true);
      });
    });

    const legendTimer = window.setTimeout(() => {
      setIsLegendVisible(true);
    }, 220);

    return () => {
      if (firstFrame !== null) cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
      clearTimeout(legendTimer);
    };
  }, [isAnimated, clampedAttendanceRate, presentMembers, absentMembers]);

  return (
    <div className="space-y-4">
      <div
        className="relative h-4 w-full overflow-hidden rounded-full bg-wline-2 dark:bg-rink-700"
        role="progressbar"
        aria-valuenow={Math.round(clampedAttendanceRate)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`출석률 ${Math.round(clampedAttendanceRate)}%`}
      >
        {clampedAttendanceRate > 0 ? (
          <div
            className={`absolute inset-y-0 left-0 bg-ice-500 ${
              absentRate === 0 ? 'rounded-full' : 'rounded-l-full'
            }`}
            style={{
              width: `${clampedAttendanceRate}%`,
              transform: `scaleX(${isBarVisible ? 1 : 0})`,
              transformOrigin: 'left center',
              transition: `transform 900ms ${PROGRESS_EASING}`,
              willChange: 'transform',
            }}
          >
            <div className="absolute inset-y-[2px] right-0 w-6 rounded-full bg-white/20 dark:bg-white/10" />
          </div>
        ) : null}
        {absentRate > 0 ? (
          <div
            className="absolute inset-y-0 right-0 rounded-r-full bg-red-400"
            style={{
              width: `${absentRate}%`,
              transform: `scaleX(${isBarVisible ? 1 : 0})`,
              transformOrigin: 'right center',
              transition: `transform 780ms ${PROGRESS_EASING} 120ms`,
              willChange: 'transform',
            }}
          />
        ) : null}
      </div>
      <div className="flex gap-5 px-1">
        <AttendanceLegendItem
          colorClassName="bg-ice-500"
          isVisible={isLegendVisible}
          delayMs={40}
          label={`출석 (${presentMembers})`}
        />
        <AttendanceLegendItem
          colorClassName="bg-red-400"
          isVisible={isLegendVisible}
          delayMs={120}
          label={`결석/지각 (${absentMembers})`}
        />
      </div>
    </div>
  );
}

function AttendanceLegendItem({
  colorClassName,
  isVisible,
  delayMs,
  label,
}: {
  colorClassName: string;
  isVisible: boolean;
  delayMs: number;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: `translateY(${isVisible ? '0' : '4px'})`,
        transition: `opacity 420ms ${LEGEND_EASING} ${delayMs}ms, transform 420ms ${LEGEND_EASING} ${delayMs}ms`,
      }}
    >
      <div
        className={`size-2.5 rounded-full ${colorClassName}`}
        style={{
          transform: `scale(${isVisible ? 1 : 0.72})`,
          transition: `transform 420ms ${LEGEND_EASING} ${delayMs + 40}ms`,
        }}
      />
      <span className="text-[12px] font-semibold text-wtext-2 dark:text-rink-300">
        {label}
      </span>
    </div>
  );
}

// ─── Change Badge (전일 대비 변화율) ─────────────────────
function ChangeBadge({ value }: { value: number }) {
  if (value === 0) return null;

  const isPositive = value > 0;
  return (
    <span
      className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center ${
        isPositive
          ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400'
          : 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400'
      }`}
    >
      <Icon
        name={isPositive ? 'trending_up' : 'trending_down'}
        className="text-[14px] mr-0.5"
        aria-hidden="true"
      />
      {isPositive ? '+' : ''}
      {value}%
    </span>
  );
}

// [삭제 2026-04-29] TrainingRateCard / TrainingRateChart — 사용자 요청으로 제거
