'use client';

/**
 * 앱 통계 페이지 - TEAMPLUS
 *
 * UserActivityLog 집계 기반 실제 사용 통계.
 *   - GET /app/statistics?days=&platform=  (admin 운영자 트래픽은 백엔드에서 항상 제외)
 *   - DAU/MAU: sessionId distinct 기반 · 세션시간/앱버전 분포는 원천 데이터 미수집으로 미제공
 *
 * === Design 7 Principles 적용 ===
 * AI 스타일 금지: gradient, blur 미사용 · 존댓말 · 액션 동사
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api-client';
import { StatusFilter } from '@/components/ui/admin-tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Users, Activity, UserPlus, MousePointer, BarChart3,
  Smartphone, Globe, TrendingUp, TrendingDown, Zap
} from 'lucide-react';

interface DailyStat { date: string; dau: number; events: number }
interface PlatformStat { platform: string; sessions: number; events: number; percentage: number }
interface PageStat { path: string; views: number }
interface ActionStat { action: string; count: number }
interface StatisticsResponse {
  range: { days: number; platform: string };
  summary: { dau: number; dauChange: number | null; mau: number; newSignupsThisMonth: number };
  dailyStats: DailyStat[];
  platformStats: PlatformStat[];
  topPages: PageStat[];
  actionStats: ActionStat[];
}

// 액션 코드 → 한글 라벨
const ACTION_LABEL: Record<string, string> = {
  PAGE_VIEW: '페이지 조회',
  EVENT: '이벤트',
  CLICK: '클릭',
  API_CALL: 'API 호출',
  LOGIN: '로그인',
  LOGOUT: '로그아웃',
  ERROR: '오류',
  PAYMENT: '결제',
};
const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;
const platformLabel = (p: string) => (p === 'web' ? '웹' : p === 'app' ? '앱' : p);

export default function AppStatisticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<StatisticsResponse | null>(null);
  const [dateRange, setDateRange] = useState('7d');
  const [platform, setPlatform] = useState<'all' | 'web' | 'app'>('all');

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const days = dateRange.replace('d', '');
      const res = await api.get<StatisticsResponse>(
        `/app/statistics?days=${days}&platform=${platform}`,
      );
      setData(res ?? null);
    } catch (error) {
      console.error('[AppStatistics] 통계 로드 실패:', error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, platform]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (isLoading) {
    return <LoadingSpinner message="앱 통계를 불러오는 중..." />;
  }

  const summary = data?.summary;
  const dailyStats = data?.dailyStats ?? [];
  const platformStats = data?.platformStats ?? [];
  const topPages = data?.topPages ?? [];
  const actionStats = data?.actionStats ?? [];
  const maxDau = dailyStats.length > 0 ? Math.max(1, ...dailyStats.map(s => s.dau)) : 1;
  const totalEvents = dailyStats.reduce((sum, s) => sum + s.events, 0);
  const maxPlatformEvents = platformStats.length > 0 ? Math.max(1, ...platformStats.map(p => p.events)) : 1;

  const metrics = [
    {
      label: 'DAU (일간 활성 사용자)',
      value: summary ? summary.dau.toLocaleString() : '-',
      change: summary?.dauChange ?? null,
      changeLabel: '전일 대비',
      icon: <Users className="w-5 h-5 text-primary" />,
      bgColor: 'bg-primary/10',
    },
    {
      label: 'MAU (월간 활성 사용자)',
      value: summary ? summary.mau.toLocaleString() : '-',
      change: null,
      changeLabel: '최근 30일 · 세션 기준',
      icon: <Activity className="w-5 h-5 text-emerald-600" />,
      bgColor: 'bg-emerald-100',
    },
    {
      label: '기간 내 총 이벤트',
      value: totalEvents.toLocaleString(),
      change: null,
      changeLabel: `최근 ${dateRange.replace('d', '')}일`,
      icon: <Zap className="w-5 h-5 text-amber-600" />,
      bgColor: 'bg-amber-100',
    },
    {
      label: '이번 달 신규 가입',
      value: summary ? summary.newSignupsThisMonth.toLocaleString() : '-',
      change: null,
      changeLabel: '회원 가입 기준',
      icon: <UserPlus className="w-5 h-5 text-purple-600" />,
      bgColor: 'bg-purple-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">앱 통계</h1>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
            실제 앱·웹 사용 현황을 분석합니다 <span className="text-slate-400">(관리자 페이지 접속은 집계에서 제외)</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusFilter
            options={[
              { value: 'all', label: '전체' },
              { value: 'web', label: '웹' },
              { value: 'app', label: '앱' },
            ]}
            selected={platform}
            onChange={(value) => setPlatform(value as 'all' | 'web' | 'app')}
          />
          <StatusFilter
            options={[
              { value: '7d', label: '7일' },
              { value: '30d', label: '30일' },
              { value: '90d', label: '90일' },
            ]}
            selected={dateRange}
            onChange={(value) => setDateRange(value)}
          />
        </div>
      </div>

      {/* 주요 지표 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, idx) => (
          <div key={idx} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div className={`w-10 h-10 ${metric.bgColor} dark:opacity-90 rounded-lg flex items-center justify-center`}>
                {metric.icon}
              </div>
              {metric.change !== null && (
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  metric.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {metric.change >= 0 ? (
                    <TrendingUp className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="w-4 h-4" aria-hidden="true" />
                  )}
                  {Math.abs(metric.change)}%
                </div>
              )}
            </div>
            <div className="mt-4">
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{metric.value}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{metric.label}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{metric.changeLabel}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DAU 추이 그래프 */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">일간 활성 사용자 (DAU)</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">선택 기간 일별 활성 세션 추이</p>
          </div>

          {dailyStats.length === 0 ? (
            <div className="py-12 text-center">
              <BarChart3 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
              <p className="text-slate-500 dark:text-slate-400">집계된 활동 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {dailyStats.map((stat, idx) => {
                const label = stat.date.slice(5, 10).replace('-', '/');
                return (
                  <div key={idx} className="flex items-center gap-4">
                    <span className="w-12 text-sm text-slate-500 dark:text-slate-400 tabular-nums">{label}</span>
                    <div className="flex-1 h-7 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden" role="progressbar" aria-valuenow={stat.dau} aria-valuemin={0} aria-valuemax={maxDau} aria-label={`${label} DAU`}>
                      <div
                        className="h-full bg-primary rounded-lg flex items-center justify-end pr-2 transition-all duration-500 motion-reduce:transition-none min-w-[24px]"
                        style={{ width: `${(stat.dau / maxDau) * 100}%` }}
                      >
                        <span className="text-xs font-medium text-white tabular-nums">{stat.dau}</span>
                      </div>
                    </div>
                    <span className="w-16 text-right text-xs text-slate-400 dark:text-slate-500 tabular-nums">{stat.events.toLocaleString()} 이벤트</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 플랫폼 분포 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">플랫폼 분포</h3>
          {platformStats.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">데이터 없음</p>
            </div>
          ) : (
            <div className="space-y-4">
              {platformStats.map((d, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      {d.platform === 'app' ? <Smartphone className="w-4 h-4" aria-hidden="true" /> : <Globe className="w-4 h-4" aria-hidden="true" />}
                      {platformLabel(d.platform)}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">{d.events.toLocaleString()} 이벤트</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${d.platform === 'app' ? 'bg-emerald-500' : 'bg-primary'}`}
                      style={{ width: `${(d.events / maxPlatformEvents) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 tabular-nums">활성 세션 {d.sessions.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 인기 페이지 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">인기 페이지</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">조회수 기준 상위 페이지</p>
          </div>
          {topPages.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 dark:text-slate-400">페이지 조회 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {topPages.map((page, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' :
                      idx === 1 ? 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300' :
                      idx === 2 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white truncate">{page.path}</span>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium text-slate-900 dark:text-white tabular-nums">{page.views.toLocaleString()}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">조회수</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 주요 사용자 행동 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">주요 사용자 행동</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">선택 기간 액션별 발생 횟수</p>
          </div>
          {actionStats.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-500 dark:text-slate-400">액션 데이터가 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {actionStats.map((action, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                      <MousePointer className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                    </div>
                    <span className="font-medium text-slate-900 dark:text-white">{actionLabel(action.action)}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white tabular-nums">{action.count.toLocaleString()}회</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
