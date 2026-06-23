'use client';

/**
 * 앱 통계 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: DAU/MAU, 사용자 행동 분석
 * 2. 휴먼 디자인: 직관적인 차트 및 메트릭 표시
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect } from 'react';
import { api } from '@/services/api-client';
import { Button } from '@/components/ui/button';
import { StatusFilter } from '@/components/ui/admin-tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Users, Clock, TrendingUp, TrendingDown,
  Download, MousePointer, UserPlus, Activity
} from 'lucide-react';

interface MetricCard {
  label: string;
  value: string;
  change: number | null;
  changeLabel: string;
  icon: React.ReactNode;
  bgColor: string;
}

interface AdminDashboardUsers {
  total: number;
  newThisMonth: number;
}

interface AdminDashboardResponse {
  users?: AdminDashboardUsers;
}

interface DailyStat { date: string; dau: number; sessions: number; pageViews: number }
interface DeviceStat { platform: string; percentage: number; users: number }
interface VersionStat { version: string; percentage: number }
interface PageStat { path: string; views: number; avgTime: string }
interface UserAction { action: string; count: number; change: number }

export default function AppStatisticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [topPages, setTopPages] = useState<PageStat[]>([]);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [deviceStats, setDeviceStats] = useState<DeviceStat[]>([]);
  const [versionStats, setVersionStats] = useState<VersionStat[]>([]);
  const [dateRange, setDateRange] = useState('7d');
  const [metrics, setMetrics] = useState<MetricCard[]>([
    {
      label: 'DAU (일간 활성 사용자)',
      value: '-',
      change: null,
      changeLabel: '앱 사용 통계 미지원',
      icon: <Users className="w-5 h-5 text-primary" />,
      bgColor: 'bg-primary/10'
    },
    {
      label: 'MAU (월간 활성 사용자)',
      value: '-',
      change: null,
      changeLabel: '앱 사용 통계 미지원',
      icon: <Activity className="w-5 h-5 text-emerald-600" />,
      bgColor: 'bg-emerald-100'
    },
    {
      label: '평균 세션 시간',
      value: '-',
      change: null,
      changeLabel: '앱 사용 통계 미지원',
      icon: <Clock className="w-5 h-5 text-amber-600" />,
      bgColor: 'bg-amber-100'
    },
    {
      label: '이번 달 신규 가입',
      value: '-',
      change: null,
      changeLabel: '전월 대비',
      icon: <UserPlus className="w-5 h-5 text-purple-600" />,
      bgColor: 'bg-purple-100'
    },
  ]);

  useEffect(() => {
    const loadStats = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<AdminDashboardResponse>('/dashboard/admin');
        const newThisMonth = data?.users?.newThisMonth;
        if (newThisMonth !== undefined) {
          setMetrics((prev) =>
            prev.map((m, idx) =>
              idx === 3 ? { ...m, value: newThisMonth.toLocaleString() } : m
            )
          );
        }
      } catch (error) {
        console.error('[AppStatistics] 통계 로드 실패:', error);
      } finally {
        setDailyStats([]);
        setTopPages([]);
        setUserActions([]);
        setDeviceStats([]);
        setVersionStats([]);
        setIsLoading(false);
      }
    };

    loadStats();
  }, [dateRange]);

  const maxDau = dailyStats.length > 0 ? Math.max(...dailyStats.map(s => s.dau)) : 0;

  if (isLoading) {
    return <LoadingSpinner message="앱 통계를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">앱 통계</h1>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-2">앱 사용 현황 및 사용자 행동을 분석합니다</p>
        </div>
        <div className="flex gap-2">
          <StatusFilter
            options={[
              { value: '7d', label: '7일' },
              { value: '30d', label: '30일' },
              { value: '90d', label: '90일' },
            ]}
            selected={dateRange}
            onChange={(value) => setDateRange(value)}
          />
          <Button type="button" variant="outline" className="gap-2 h-12 px-5 text-base font-bold dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <Download className="w-4 h-4" aria-hidden="true" />
            내보내기
          </Button>
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">일간 활성 사용자 (DAU)</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">최근 7일간 일일 활성 사용자 추이</p>
            </div>
          </div>

          {/* 간단한 바 차트 */}
          <div className="space-y-3">
            {dailyStats.map((stat, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <span className="w-12 text-sm text-slate-500 dark:text-slate-400">{stat.date}</span>
                <div className="flex-1 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden" role="progressbar" aria-valuenow={stat.dau} aria-valuemin={0} aria-valuemax={maxDau} aria-label={`${stat.date} DAU`}>
                  <div
                    className="h-full bg-primary rounded-lg flex items-center justify-end pr-3 transition-all duration-500 motion-reduce:transition-none"
                    style={{ width: `${(stat.dau / maxDau) * 100}%` }}
                  >
                    <span className="text-xs font-medium text-white tabular-nums">{stat.dau.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 요약 */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {dailyStats.reduce((sum, s) => sum + s.dau, 0).toLocaleString()}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">총 방문</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {dailyStats.reduce((sum, s) => sum + s.sessions, 0).toLocaleString()}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">총 세션</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {dailyStats.reduce((sum, s) => sum + s.pageViews, 0).toLocaleString()}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">페이지 뷰</p>
            </div>
          </div>
        </div>

        {/* 디바이스/버전 통계 */}
        <div className="space-y-6">
          {/* 플랫폼 분포 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">플랫폼 분포</h3>
            <div className="space-y-4">
              {deviceStats.map((device, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{device.platform}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{device.percentage}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${idx === 0 ? 'bg-slate-800 dark:bg-slate-400' : 'bg-emerald-500'}`}
                      style={{ width: `${device.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 tabular-nums">{device.users.toLocaleString()}명</p>
                </div>
              ))}
            </div>
          </div>

          {/* 앱 버전 분포 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">앱 버전 분포</h3>
            <div className="space-y-3">
              {versionStats.map((version, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      idx === 0 ? 'bg-emerald-500' : idx === 1 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-500'
                    }`} />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{version.version}</span>
                  </div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{version.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 인기 페이지 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">인기 페이지</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">조회수 기준 상위 5개 페이지</p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {topPages.map((page, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400' :
                    idx === 1 ? 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300' :
                    idx === 2 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-white">{page.path}</span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900 dark:text-white tabular-nums">{page.views.toLocaleString()}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">조회수</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900 dark:text-white tabular-nums">{page.avgTime}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">평균 체류</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 사용자 행동 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">주요 사용자 행동</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">최근 7일간 주요 액션</p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {userActions.map((action, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                    <MousePointer className="w-4 h-4 text-slate-600 dark:text-slate-400" aria-hidden="true" />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">{action.action}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-slate-900 dark:text-white tabular-nums">{action.count.toLocaleString()}회</span>
                  <span className={`flex items-center gap-1 text-sm font-medium ${
                    action.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {action.change >= 0 ? (
                      <TrendingUp className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="w-3 h-3" aria-hidden="true" />
                    )}
                    {Math.abs(action.change)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
