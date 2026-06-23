'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

export interface CoachStatGridProps {
  todayClasses: number;
  nextClassTime: string;
  attendanceRate: number;
  attendanceCount: number;
  attendanceTotal: number;
  pendingApprovals: number;
  newMembers: number;
}

/**
 * CoachStatGrid - 코치 대시보드 2x2 통계 카드
 *
 * 디자인 시안 v3: 오늘 수업(Primary bg), 출석률(SVG 원형), 승인 대기(주황), 신규 회원
 * border 기반 카드 (shadow 없음), dark mode 전면 적용
 */
export const CoachStatGrid = memo(function CoachStatGrid({
  todayClasses,
  nextClassTime,
  attendanceRate,
  attendanceCount,
  attendanceTotal,
  pendingApprovals,
  newMembers,
}: CoachStatGridProps) {
  // SVG 원형 진행바 계산
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (attendanceRate / 100) * circumference;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* 오늘 수업 - Primary 배경 */}
      <div className="flex flex-col justify-between rounded-xl bg-ice-500 p-5 text-white">
        <div className="flex items-start justify-between">
          <span className="text-sm font-bold">{MESSAGES.dashboard.stats.todayClasses}</span>
          <Icon name="calendar_today" className="text-xl text-white/80" aria-hidden="true" />
        </div>
        <div className="mt-4">
          <p className="text-4xl font-black leading-none">{todayClasses}</p>
          <p className="mt-2 text-xs font-bold text-white/80">
            {MESSAGES.dashboard.stats.nextClassPrefix}: {nextClassTime}
          </p>
        </div>
      </div>

      {/* 오늘 출석률 - SVG 원형 진행바 */}
      <div className="flex flex-col justify-between rounded-xl bg-white dark:bg-rink-800 p-5 border border-gray-200 dark:border-rink-700">
        <div className="flex items-start justify-between">
          <span className="text-sm font-bold text-gray-600 dark:text-rink-100">{MESSAGES.dashboard.stats.attendanceToday}</span>
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <Icon name="check" className="text-sm" weight={800} aria-hidden="true" />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
              <circle
                className="text-gray-100 dark:text-wtext-2"
                cx="28"
                cy="28"
                r={radius}
                fill="transparent"
                stroke="currentColor"
                strokeWidth="6"
              />
              <circle
                className="text-ice-500"
                cx="28"
                cy="28"
                r={radius}
                fill="transparent"
                stroke="currentColor"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            </svg>
            <span className="absolute text-[13px] font-black text-wtext-1 dark:text-white">
              {attendanceRate}%
            </span>
          </div>
          <div className="flex flex-col">
            <p className="text-[11px] font-bold text-gray-500 dark:text-rink-300 uppercase">{MESSAGES.dashboard.stats.progress}</p>
            <p className="text-[15px] font-black text-wtext-1 dark:text-white">
              {attendanceCount}/{attendanceTotal}
            </p>
          </div>
        </div>
      </div>

      {/* 승인 대기 */}
      <div className="flex flex-col justify-between rounded-xl bg-white dark:bg-rink-800 p-5 border border-gray-200 dark:border-rink-700">
        <span className="text-sm font-bold text-gray-600 dark:text-rink-100">{MESSAGES.dashboard.stats.pendingApprovals}</span>
        <div className="mt-4 flex items-baseline gap-1">
          <p className="text-[2rem] font-black text-orange-600 dark:text-orange-400 leading-none">
            {pendingApprovals}
          </p>
          <span className="text-sm font-black text-gray-500 dark:text-rink-300">명</span>
        </div>
      </div>

      {/* 신규 회원 */}
      <div className="flex flex-col justify-between rounded-xl bg-white dark:bg-rink-800 p-5 border border-gray-200 dark:border-rink-700">
        <span className="text-sm font-bold text-gray-600 dark:text-rink-100">{MESSAGES.dashboard.stats.newMembers}</span>
        <div className="mt-4 flex items-baseline gap-1">
          <p className="text-[2rem] font-black text-wtext-1 dark:text-white leading-none">
            {newMembers}
          </p>
          <span className="text-sm font-black text-gray-500 dark:text-rink-300">명</span>
        </div>
      </div>
    </div>
  );
});
