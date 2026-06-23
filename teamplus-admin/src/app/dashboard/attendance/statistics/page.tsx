'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  TrendingUp,
  TrendingDown,
  UserCheck,
  UserX,
  Clock,
  Calendar,
  BarChart3,
  Users,
  Medal,
  AlertTriangle,
  ChevronRight,
  Building2,
  CalendarDays,
} from 'lucide-react';
import { api } from '@/services/api-client';
import Link from 'next/link';

/**
 * TEAMPLUS 출석 통계 페이지
 *
 * Design 7 Principles:
 * 1. 화면 분석 - 기간 필터, 차트, 순위, 위험 회원 알림
 * 2. 휴먼 디자인 - 명확한 숫자 지표, 시각적 차트, 색상 코딩
 * 3. AI 스타일 금지 - solid primary, no gradient/blur
 * 4. 페르소나 - frontend + architect + analyzer
 * 5. 명령어 - frontend-design 스킬
 * 6. 결과 보고 - 7원칙 적용
 * 7. Tone & Manner - 존댓말, 44px 터치, tabular-nums
 */

type PeriodType = 'week' | 'month' | 'quarter';

interface ApiAdminStatistics {
  period: {
    startDate: string | null;
    endDate: string | null;
  };
  // 2026-05-12: 회의록 결정으로 3-state 단순화. late/excused 제거.
  summary: {
    totalSessions: number;
    totalAttendances: number;
    presentCount: number;
    absentCount: number;
    presentRate: string;
  };
  byClub: Array<{
    clubId: string;
    clubName: string;
    sessions: number;
    totalAttendances: number;
    presentRate: string;
  }>;
  dailyTrend: Array<{
    date: string;
    present: number;
    absent: number;
    total: number;
  }>;
}

interface ApiAttendanceRecord {
  id: string;
  memberId: string;
  memberEmail?: string;
  className?: string;
  scheduledDate: string;
  attendanceStatus: 'present' | 'absent' | 'unchecked';
  checkedInAt?: string;
}

interface ApiAttendancePage {
  data?: ApiAttendanceRecord[];
  pagination?: { total: number; page: number; limit: number; totalPages: number };
}

const getPeriodDates = (period: PeriodType): { startDate: string; endDate: string } => {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start: Date;

  if (period === 'week') {
    start = new Date(now);
    start.setDate(now.getDate() - 6);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), qMonth, 1);
  }

  return { startDate: start.toISOString().split('T')[0], endDate: end };
};

interface MemberAttendanceStats {
  id: string;
  playerName: string;
  clubName: string;
  totalClasses: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
  trend: 'up' | 'down' | 'stable';
}

interface ClassAttendanceStats {
  id: string;
  className: string;
  clubName: string;
  totalSchedules: number;
  averageAttendance: number;
  averageRate: number;
}

interface DailyTrend {
  date: string;
  dayLabel: string;
  rate: number;
  present: number;
  absent: number;
}

export default function AttendanceStatisticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('month');
  const [memberStats, setMemberStats] = useState<MemberAttendanceStats[]>([]);
  const [classStats, setClassStats] = useState<ClassAttendanceStats[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [overallStats, setOverallStats] = useState({
    totalAttendances: 0,
    presentCount: 0,
    absentCount: 0,
    averageRate: 0,
    previousRate: 0,
    atRiskMembers: 0,
  });

  const loadStats = useCallback(async () => {
    setIsLoading(true);

    const { startDate, endDate } = getPeriodDates(selectedPeriod);

    try {
      const statsRes = await api.get<ApiAdminStatistics>(
        `/attendance/admin/statistics?startDate=${startDate}&endDate=${endDate}`
      );

      const { summary, byClub, dailyTrend } = statsRes;

      setOverallStats((prev) => ({
        ...prev,
        totalAttendances: summary.totalAttendances,
        presentCount: summary.presentCount,
        absentCount: summary.absentCount,
        averageRate: Math.round(parseFloat(summary.presentRate)),
        previousRate: 0,
      }));

      const trends: DailyTrend[] = dailyTrend
        .slice(-14)
        .map((d) => {
          const dateObj = new Date(d.date);
          const total = d.total;
          return {
            date: d.date,
            dayLabel: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`,
            rate: total > 0 ? Math.round((d.present / total) * 100) : 0,
            present: d.present,
            absent: d.absent,
          };
        });
      setDailyTrends(trends);

      const clubStats: ClassAttendanceStats[] = byClub.map((c, i) => ({
        id: String(i),
        className: c.clubName,
        clubName: c.clubName,
        totalSchedules: c.sessions,
        averageAttendance: c.totalAttendances,
        averageRate: Math.round(parseFloat(c.presentRate)),
      }));
      setClassStats(clubStats);

      const historyRes = await api.get<ApiAttendancePage>(
        `/attendance/history?startDate=${startDate}&endDate=${endDate}&limit=200&page=1`
      );

      const records: ApiAttendanceRecord[] = historyRes.data ?? [];

      const memberMap = new Map<string, {
        playerName: string;
        clubName: string;
        present: number;
        absent: number;
        total: number;
      }>();

      records.forEach((r) => {
        const key = r.memberId;
        const displayName = r.memberEmail
          ? r.memberEmail.split('@')[0]
          : `(${r.memberId.slice(0, 6)}...)`;
        const cur = memberMap.get(key) ?? {
          playerName: displayName,
          clubName: r.className ?? '—',
          present: 0,
          absent: 0,
          total: 0,
        };
        cur.total += 1;
        if (r.attendanceStatus === 'present') cur.present += 1;
        else cur.absent += 1;
        memberMap.set(key, cur);
      });

      const memberArr: MemberAttendanceStats[] = Array.from(memberMap.entries())
        .map(([id, v]) => ({
          id,
          playerName: v.playerName,
          clubName: v.clubName,
          totalClasses: v.total,
          presentCount: v.present,
          absentCount: v.absent,
          attendanceRate: v.total > 0 ? Math.round((v.present / v.total) * 100) : 0,
          trend: 'stable' as const,
        }))
        .sort((a, b) => b.attendanceRate - a.attendanceRate)
        .slice(0, 8);

      setMemberStats(memberArr);

      const atRisk = memberArr.filter((m) => m.attendanceRate < 85).length;
      setOverallStats((prev) => ({ ...prev, atRiskMembers: atRisk }));
    } catch (error) {
      console.error('[AttendanceStatistics] 출석 통계 로드 실패:', error);
      setOverallStats({
        totalAttendances: 0,
        presentCount: 0,
        absentCount: 0,
        averageRate: 0,
        previousRate: 0,
        atRiskMembers: 0,
      });
      setMemberStats([]);
      setClassStats([]);
      setDailyTrends([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const rateDiff = overallStats.averageRate - overallStats.previousRate;
  const isRateUp = rateDiff > 0;

  const getPeriodLabel = (period: PeriodType) => {
    switch (period) {
      case 'week':
        return '이번 주';
      case 'month':
        return '이번 달';
      case 'quarter':
        return '이번 분기';
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" aria-label="상승" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" aria-label="하락" />;
      default:
        return <span className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-label="변동 없음">—</span>;
    }
  };

  const getAttendanceRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600 dark:text-green-400';
    if (rate >= 85) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getAttendanceRateBg = (rate: number) => {
    if (rate >= 95) return 'bg-green-500';
    if (rate >= 85) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const maxTrendRate = Math.max(...dailyTrends.map((t) => t.rate), 100);

  if (isLoading) {
    return <LoadingSpinner message="출석 통계를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl bg-primary text-white shadow-md">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-16 translate-x-16" aria-hidden="true" />
        <div className="absolute bottom-0 right-40 w-40 h-40 rounded-full bg-white/5 translate-y-10" aria-hidden="true" />
        <div className="relative z-10 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              출석 통계
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">출석 현황 분석</h1>
            <p className="text-sm sm:text-base text-white/80">
              {getPeriodLabel(selectedPeriod)} 평균 출석률 <span className="font-bold tabular-nums">{overallStats.averageRate}%</span>
            </p>
          </div>
          <Link
            href="/dashboard/attendance"
            className="h-11 inline-flex items-center gap-2 px-4 rounded-lg bg-white hover:bg-slate-100 text-primary text-sm font-semibold shadow-sm motion-reduce:transition-none transition-colors"
          >
            출석 관리로 이동
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Period Selector */}
      <section className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 -mx-2 px-2 py-2">
        <div
          role="tablist"
          aria-label="기간 필터"
          className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm"
        >
          {(['week', 'month', 'quarter'] as const).map((period) => (
            <button
              key={period}
              type="button"
              role="tab"
              aria-selected={selectedPeriod === period}
              onClick={() => setSelectedPeriod(period)}
              className={`h-10 px-5 rounded-md text-sm font-medium motion-reduce:transition-none transition-colors ${
                selectedPeriod === period
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {getPeriodLabel(period)}
            </button>
          ))}
        </div>
      </section>

      {/* Overall Stats */}
      <section aria-label="전체 출석 통계" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary dark:text-blue-300" aria-hidden="true" />
            </div>
            {rateDiff !== 0 && (
              <div
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                  isRateUp
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}
              >
                {isRateUp ? <TrendingUp className="w-3 h-3" aria-hidden="true" /> : <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                {Math.abs(rateDiff).toFixed(1)}%
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">평균 출석률</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
            {overallStats.averageRate}
            <span className="text-base text-slate-500 dark:text-slate-400">%</span>
          </p>
        </Card>

        <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">출석</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums mt-0.5">
            {overallStats.presentCount.toLocaleString('ko-KR')}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
            전체 {overallStats.totalAttendances.toLocaleString('ko-KR')}건 중
          </p>
        </Card>

        <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
              <UserX className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">결석</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-0.5">
            {overallStats.absentCount.toLocaleString('ko-KR')}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
            {overallStats.totalAttendances > 0
              ? ((overallStats.absentCount / overallStats.totalAttendances) * 100).toFixed(1)
              : '0.0'}
            %
          </p>
        </Card>
      </section>

      {/* Daily Trend Chart */}
      <Card className="p-5 sm:p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary dark:text-blue-300" aria-hidden="true" />
            일별 출석률 추이
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">최근 {dailyTrends.length}일</span>
        </div>

        {dailyTrends.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
              <CalendarDays className="w-7 h-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              해당 기간의 일별 출석 데이터가 없습니다.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-end justify-between gap-1 sm:gap-2 h-40">
              {dailyTrends.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center">
                  <span className="text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 tabular-nums">
                    {day.rate}%
                  </span>
                  <div
                    className="w-full bg-slate-100 dark:bg-slate-700 rounded-t relative"
                    style={{ height: '120px' }}
                    role="img"
                    aria-label={`${day.dayLabel} 출석률 ${day.rate}퍼센트`}
                  >
                    <div
                      className={`absolute bottom-0 w-full ${getAttendanceRateBg(day.rate)} rounded-t motion-reduce:transition-none transition-all`}
                      style={{ height: `${(day.rate / maxTrendRate) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-3 mt-3">
              {dailyTrends.map((day) => (
                <div key={day.date} className="flex-1 text-center">
                  <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {day.dayLabel}
                  </span>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500" aria-hidden="true" />
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">95% 이상</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-amber-500" aria-hidden="true" />
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">85 ~ 95%</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-red-500" aria-hidden="true" />
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">85% 미만</span>
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Member Ranking */}
        <Card className="p-5 sm:p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Medal className="w-5 h-5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
              회원별 출석률 순위
            </h3>
            <Badge variant="outline" className="text-xs border-slate-300 dark:border-slate-600">
              상위 <span className="tabular-nums mx-0.5">8</span>명
            </Badge>
          </div>

          {memberStats.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <Users className="w-7 h-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                해당 기간의 회원 출석 데이터가 없습니다.
              </p>
            </div>
          ) : (
            <ol className="space-y-2.5">
              {memberStats.map((member, index) => (
                <li
                  key={member.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg motion-reduce:transition-none transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold tabular-nums shrink-0 ${
                      index === 0
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
                        : index === 1
                        ? 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200'
                        : index === 2
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                    aria-label={`${index + 1}위`}
                  >
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {member.playerName}
                      </span>
                      {getTrendIcon(member.trend)}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">
                      {member.clubName} · <span className="tabular-nums">{member.totalClasses}회</span> 수업
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-lg font-bold tabular-nums ${getAttendanceRateColor(member.attendanceRate)}`}>
                      {member.attendanceRate}%
                    </span>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums mt-0.5">
                      출{member.presentCount} · 결{member.absentCount}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Club Statistics */}
        <Card className="p-5 sm:p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary dark:text-blue-300" aria-hidden="true" />
              클럽별 출석 현황
            </h3>
          </div>

          {classStats.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-7 h-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                해당 기간의 클럽 출석 데이터가 없습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {classStats.map((cls) => (
                <div key={cls.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900 dark:text-white truncate block">
                        {cls.className}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {cls.totalSchedules}회 세션 · 총 {cls.averageAttendance}건
                      </span>
                    </div>
                    <span className={`font-bold tabular-nums shrink-0 ${getAttendanceRateColor(cls.averageRate)}`}>
                      {cls.averageRate}%
                    </span>
                  </div>
                  <div
                    className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={cls.averageRate}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${cls.className} 출석률 ${cls.averageRate}퍼센트`}
                  >
                    <div
                      className={`h-full ${getAttendanceRateBg(cls.averageRate)} rounded-full motion-reduce:transition-none transition-all`}
                      style={{ width: `${cls.averageRate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* At-Risk Members Alert */}
      {overallStats.atRiskMembers > 0 && (
        <Card className="p-5 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-amber-900 dark:text-amber-200">
                출석률 주의 회원
              </h4>
              <p className="text-sm text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                출석률 85% 미만 회원이 <span className="font-bold tabular-nums">{overallStats.atRiskMembers}</span>명 있습니다.
                지속적인 결석은 수업 진도와 실력 향상에 영향을 줄 수 있습니다.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {memberStats
                  .filter((m) => m.attendanceRate < 85)
                  .map((member) => (
                    <Badge
                      key={member.id}
                      variant="outline"
                      className="bg-white dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                    >
                      {member.playerName} <span className="tabular-nums ml-1">({member.attendanceRate}%)</span>
                    </Badge>
                  ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
