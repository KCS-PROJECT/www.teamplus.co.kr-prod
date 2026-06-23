'use client';

import { useState } from 'react';
import { Users, CalendarDays, ClipboardCheck, CreditCard, BarChart3 } from 'lucide-react';
import { MiniStatsCard, type MiniStatsCardVariant } from '@/components/ui/mini-stats-card';

type Period = 'today' | 'week' | 'month' | 'all';

const periods: { key: Period; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번주' },
  { key: 'month', label: '이번달' },
  { key: 'all', label: '전체' },
];

const statCards: Array<{
  label: string;
  value: string;
  icon: typeof Users;
  variant: MiniStatsCardVariant;
}> = [
  { label: '총 회원수', value: '-', icon: Users, variant: 'primary' },
  { label: '등록 수업', value: '-', icon: CalendarDays, variant: 'success' },
  { label: '출석률', value: '-', icon: ClipboardCheck, variant: 'warning' },
  { label: '총 매출', value: '-', icon: CreditCard, variant: 'info' },
];

export default function ReportsPage() {
  const [activePeriod, setActivePeriod] = useState<Period>('month');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">리포트</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">전체 운영 현황을 한눈에 확인합니다</p>
        </div>

        {/* 기간 필터 */}
        <div
          className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit"
          role="tablist"
          aria-label="조회 기간 선택"
        >
          {periods.map(period => {
            const isActive = activePeriod === period.key;
            return (
              <button
                key={period.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActivePeriod(period.key)}
                className={`min-h-[40px] px-4 py-2 text-sm font-semibold rounded-md transition-colors motion-reduce:transition-none ${
                  isActive
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {period.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => {
          const Icon = card.icon;
          return (
            <MiniStatsCard
              key={card.label}
              title={card.label}
              value={card.value}
              icon={<Icon className="w-5 h-5" />}
              variant={card.variant}
            />
          );
        })}
      </div>

      {/* 차트 영역 — Backend 통계 API 연동 전까지 "API 연동 후 차트가 표시됩니다" 안내 UX 유지 (TODO_REGISTRY P2-GAP-* 별도 항목 등록 예정) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          aria-labelledby="report-class-title"
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm"
        >
          <h2 id="report-class-title" className="text-xl font-bold text-slate-900 dark:text-white mb-4">수업 현황</h2>
          <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="text-center">
              <BarChart3 className="w-10 h-10 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm">API 연동 후 차트가 표시됩니다</p>
            </div>
          </div>
        </section>
        <section
          aria-labelledby="report-revenue-title"
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm"
        >
          <h2 id="report-revenue-title" className="text-xl font-bold text-slate-900 dark:text-white mb-4">매출 추이</h2>
          <div className="flex items-center justify-center h-48 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="text-center">
              <BarChart3 className="w-10 h-10 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm">API 연동 후 차트가 표시됩니다</p>
            </div>
          </div>
        </section>
      </div>

      {/* 최근 활동 */}
      <section
        aria-labelledby="report-activity-title"
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm"
      >
        <h2 id="report-activity-title" className="text-xl font-bold text-slate-900 dark:text-white mb-4">최근 승인 활동</h2>
        <div className="flex items-center justify-center h-32 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <p className="text-sm">승인 내역이 없습니다</p>
        </div>
      </section>
    </div>
  );
}
