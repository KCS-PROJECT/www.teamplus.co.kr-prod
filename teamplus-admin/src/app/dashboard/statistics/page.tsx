'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api-client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  TrendingUp,
  Users,
  CreditCard,
  CalendarDays,
  ClipboardCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';

/**
 * TEAMPLUS 통계/분석 페이지
 *
 * Design 7 Principles 적용:
 * 1. 화면 분석 필수 - 통계 대시보드 기능 분석 완료
 * 2. 휴먼 디자인 - 깔끔한 차트 레이아웃, 명확한 데이터 표시
 * 3. AI 스타일 절대 금지 - 그라데이션, blur 효과 미사용
 * 4. 페르소나 융합 - frontend, backend, architect, analyzer 협업
 * 5. 명령어 필수 - frontend-design 스킬 활용
 * 6. 결과 출력 필수 - 하단 주석 참조
 * 7. Tone & Manner - 존댓말, 전문적 표현
 */

// ==================== API 응답 타입 ====================

interface RevenueAnalyticsSummary {
  currentMonthRevenue: number;
  lastMonthRevenue: number;
  growthRate: string;
  totalPayments: number;
  averageAmount: number;
}

interface RevenueAnalytics {
  summary: RevenueAnalyticsSummary;
  monthlyTrend: { month: string; revenue: number; count: number; avgAmount: number }[];
  byProduct: { productName: string; revenue: number; count: number }[];
  refunds: { totalAmount: number; count: number; rate: string };
}

interface AttendanceAnalytics {
  summary: { currentMonthRate: string; totalSessions: number; avgPresentRate: string };
  monthlyTrend: { month: string; present: number; absent: number; late: number; rate: string }[];
  weekdayPattern: { day: string; present: number; absent: number; rate: string }[];
}

interface MemberAnalytics {
  summary: { totalActiveMembers: number; newMembersThisMonth: number; growthRate: string; avgAge: number };
  ageDistribution: Record<string, number>;
  credits: { totalRemainingCredits: number; avgCreditsPerMember: number; membersWithCredits: number };
}

interface ClassAnalytics {
  summary: {
    totalClasses: number;
    totalEnrolled: number;
    totalCapacity: number;
    overallCapacityRate: string;
    avgAttendanceRate: string;
    totalRevenue: number;
  };
  classDetails: {
    classId: string;
    className: string;
    enrolledCount: number;
    revenue: number;
    attendanceRate: string;
  }[];
  popularClasses: { classId: string; className: string; enrolledCount: number }[];
}

interface AdminDashboardCharts {
  charts: {
    revenueByMonth: { month: string; revenue: number }[];
    membersByMonth: { month: string; count: number }[];
  };
}

// ==================== 화면 표시 타입 ====================

interface MonthlyData {
  month: string;
  revenue: number;
  members: number;
  classes: number;
  attendance: number;
}

interface TopClass {
  name: string;
  clubName: string;
  enrollments: number;
  revenue: number;
}

interface AgeGroupData {
  group: string;
  count: number;
  percentage: number;
  color: string;
}

interface ClassTypeData {
  type: string;
  count: number;
  revenue: number;
  color: string;
}

interface WeekdayData {
  day: string;
  attendance: number;
  total: number;
}

const AGE_GROUP_COLORS = ['#1E40AF', '#0369A1', '#0284C7', '#0891B2', '#06B6D4'];
const CLASS_TYPE_COLORS = ['#1E40AF', '#0369A1', '#0284C7', '#0891B2', '#06B6D4'];

export default function StatisticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');

  const [stats, setStats] = useState({
    totalRevenue: 0,
    revenueChange: 0,
    totalMembers: 0,
    memberChange: 0,
    totalClasses: 0,
    classChange: 0,
    attendanceRate: 0,
    attendanceChange: 0,
  });

  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [topClasses, setTopClasses] = useState<TopClass[]>([]);
  const [ageGroupData, setAgeGroupData] = useState<AgeGroupData[]>([]);
  const [classTypeData, setClassTypeData] = useState<ClassTypeData[]>([]);
  const [weekdayData, setWeekdayData] = useState<WeekdayData[]>([]);

  useEffect(() => {
    const loadStats = async () => {
      setIsLoading(true);
      const periodMap: Record<string, number> = { week: 1, month: 6, year: 12 };
      const period = periodMap[selectedPeriod];

      try {
        const [revenueResult, attendanceResult, memberResult, classResult, adminResult] =
          await Promise.allSettled([
            api.get<RevenueAnalytics>('/dashboard/analytics/revenue', { params: { period } }),
            api.get<AttendanceAnalytics>('/dashboard/analytics/attendance', { params: { period } }),
            api.get<MemberAnalytics>('/dashboard/analytics/members', { params: { period } }),
            api.get<ClassAnalytics>('/dashboard/analytics/classes'),
            api.get<AdminDashboardCharts>('/dashboard/admin'),
          ]);

        const revenueData = revenueResult.status === 'fulfilled' ? revenueResult.value : null;
        const attendanceData = attendanceResult.status === 'fulfilled' ? attendanceResult.value : null;
        const memberData = memberResult.status === 'fulfilled' ? memberResult.value : null;
        const classData = classResult.status === 'fulfilled' ? classResult.value : null;
        const adminData = adminResult.status === 'fulfilled' ? adminResult.value : null;

        // Key metrics 설정
        setStats({
          totalRevenue: revenueData?.summary?.currentMonthRevenue ?? 0,
          revenueChange: parseFloat(revenueData?.summary?.growthRate ?? '0'),
          totalMembers: memberData?.summary?.totalActiveMembers ?? 0,
          memberChange: parseFloat(memberData?.summary?.growthRate ?? '0'),
          totalClasses: classData?.summary?.totalClasses ?? 0,
          classChange: 0,
          attendanceRate: parseFloat(attendanceData?.summary?.currentMonthRate ?? '0'),
          attendanceChange: 0,
        });

        // monthlyData: revenue + attendance + admin membersByMonth 조합
        if (revenueData?.monthlyTrend?.length) {
          const merged = revenueData.monthlyTrend.map((item) => {
            const attnMonth = attendanceData?.monthlyTrend?.find((a) => a.month === item.month);
            const memberMonth = adminData?.charts?.membersByMonth?.find((m) => m.month === item.month);
            return {
              month: item.month,
              revenue: item.revenue,
              members: memberMonth?.count ?? 0,
              classes: 0,
              attendance: parseFloat(attnMonth?.rate ?? '0'),
            };
          });
          setMonthlyData(merged);
        }

        // 인기 수업 TOP 5
        if (classData?.popularClasses?.length) {
          const topList = classData.popularClasses.map((cls) => {
            const detail = classData.classDetails?.find((d) => d.classId === cls.classId);
            return {
              name: cls.className,
              clubName: '-',
              enrollments: cls.enrolledCount,
              revenue: detail?.revenue ?? 0,
            };
          });
          setTopClasses(topList);
        }

        // 연령대별 분포
        if (memberData?.ageDistribution) {
          const totalCount = Object.values(memberData.ageDistribution).reduce((s, v) => s + v, 0);
          const ageGroups = Object.entries(memberData.ageDistribution).map(([group, count], idx) => ({
            group,
            count,
            percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
            color: AGE_GROUP_COLORS[idx % AGE_GROUP_COLORS.length],
          }));
          setAgeGroupData(ageGroups);
        }

        // 수업 유형별 분포 (byProduct 기반)
        if (revenueData?.byProduct?.length) {
          const classTypes = revenueData.byProduct.slice(0, 5).map((item, idx) => ({
            type: item.productName,
            count: item.count,
            revenue: item.revenue,
            color: CLASS_TYPE_COLORS[idx % CLASS_TYPE_COLORS.length],
          }));
          setClassTypeData(classTypes);
        }

        // 요일별 출석 분포
        if (attendanceData?.weekdayPattern?.length) {
          const DAYS_ORDER = ['일', '월', '화', '수', '목', '금', '토'];
          const days = DAYS_ORDER.map((d) => {
            const item = attendanceData.weekdayPattern?.find((w) => w.day === d);
            return {
              day: d,
              attendance: item?.present ?? 0,
              total: (item?.present ?? 0) + (item?.absent ?? 0),
            };
          }).filter((d) => d.total > 0);
          setWeekdayData(days);
        }
      } catch (error) {
        console.error('[StatisticsPage] 통계 로드 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, [selectedPeriod]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) {
      return `${(value / 10000000).toFixed(1)}천만원`;
    } else if (value >= 10000) {
      return `${(value / 10000).toFixed(0)}만원`;
    }
    return `${value.toLocaleString()}원`;
  };

  const maxRevenue = monthlyData.length > 0 ? Math.max(...monthlyData.map((d) => d.revenue)) : 1;

  if (isLoading) {
    return <LoadingSpinner message="통계를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="통계/분석" subtitle="클럽 운영 현황을 분석합니다" />

      {/* Period Selector */}
      <div className="mb-6 flex items-center justify-end">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
          {(['week', 'month', 'year'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                selectedPeriod === period
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {period === 'week' ? '주간' : period === 'month' ? '월간' : '연간'}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MiniStatsCard
          title="이번 달 매출"
          value={formatCurrency(stats.totalRevenue)}
          icon={<CreditCard className="w-5 h-5" />}
          variant="primary"
          trend={{ value: stats.revenueChange, label: '전월 대비' }}
        />
        <MiniStatsCard
          title="활성 회원"
          value={`${stats.totalMembers}명`}
          icon={<Users className="w-5 h-5" />}
          variant="info"
          trend={{ value: stats.memberChange, label: '전월 대비' }}
        />
        <MiniStatsCard
          title="수업 수"
          value={`${stats.totalClasses}개`}
          icon={<CalendarDays className="w-5 h-5" />}
          variant="warning"
          description="전체 운영 수업"
        />
        <MiniStatsCard
          title="출석률"
          value={`${stats.attendanceRate}%`}
          icon={<ClipboardCheck className="w-5 h-5" />}
          variant="success"
          description="이번 달 평균"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2 p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">월별 매출 추이</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                최근 {selectedPeriod === 'week' ? '1개월' : selectedPeriod === 'month' ? '6개월' : '12개월'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                {stats.revenueChange >= 0 ? `+${stats.revenueChange}%` : `${stats.revenueChange}%`}
              </span>
            </div>
          </div>

          {monthlyData.length > 0 ? (
            <div className="flex items-end gap-2 h-48">
              {monthlyData.map((data, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-primary rounded-t-lg transition-colors hover:bg-primary-dark motion-reduce:transition-none"
                    style={{
                      height: `${Math.max((data.revenue / maxRevenue) * 100, 4)}%`,
                      minHeight: '4px',
                    }}
                    role="img"
                    aria-label={`${data.month.slice(5)}월 매출`}
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400 mt-2 truncate w-full text-center">
                    {data.month.slice(5)}월
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
              매출 데이터가 없습니다.
            </div>
          )}

          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-primary rounded-sm" />
              <span className="text-sm text-slate-600 dark:text-slate-400">매출</span>
            </div>
          </div>
        </Card>

        {/* Attendance Trend */}
        <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">출석률 추이</h2>
          </div>

          {monthlyData.length > 0 ? (
            <div className="space-y-4">
              {monthlyData.map((data, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{data.month.slice(5)}월</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{data.attendance}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-600 dark:bg-green-500 rounded-full transition-all"
                      style={{ width: `${data.attendance}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400 dark:text-slate-500">
              출석 데이터가 없습니다.
            </div>
          )}
        </Card>
      </div>

      {/* Age Group Distribution & Class Type Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Age Group Distribution */}
        <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">연령대별 회원 분포</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">전체 {stats.totalMembers}명</p>
            </div>
          </div>

          {ageGroupData.length > 0 ? (
            <>
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-48 h-48">
                  <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    {(() => {
                      let currentOffset = 0;
                      return ageGroupData.map((item, index) => {
                        const circumference = 2 * Math.PI * 35;
                        const strokeDasharray = (item.percentage / 100) * circumference;
                        const strokeDashoffset = -currentOffset * circumference / 100;
                        currentOffset += item.percentage;
                        return (
                          <circle
                            key={index}
                            cx="50"
                            cy="50"
                            r="35"
                            fill="transparent"
                            stroke={item.color}
                            strokeWidth="20"
                            strokeDasharray={`${strokeDasharray} ${circumference}`}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-all duration-500"
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black tabular-nums text-slate-900 dark:text-white">{stats.totalMembers}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">전체 회원</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {ageGroupData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{item.group}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white ml-auto">{item.count}명</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400 dark:text-slate-500">
              연령대 데이터가 없습니다.
            </div>
          )}
        </Card>

        {/* Class Type Distribution */}
        <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">수업별 매출 분포</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">수업 {stats.totalClasses}개</p>
            </div>
          </div>

          {classTypeData.length > 0 ? (
            <div className="space-y-4">
              {classTypeData.map((item, index) => {
                const maxCount = Math.max(...classTypeData.map((d) => d.count));
                const widthPercentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                return (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{item.type}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.count}건</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${widthPercentage}%`, backgroundColor: item.color }}
                      />
                    </div>
                    <div className="text-right mt-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{formatCurrency(item.revenue)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400 dark:text-slate-500">
              수업 데이터가 없습니다.
            </div>
          )}
        </Card>
      </div>

      {/* Weekday Attendance */}
      <div className="grid grid-cols-1 mb-8">
        <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">요일별 출석 분포</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">기간 내 요일별 출석 현황</p>
            </div>
          </div>

          {weekdayData.length > 0 ? (
            <>
              <div className="flex items-end justify-between gap-2 h-44">
                {weekdayData.map((item, index) => {
                  const percentage = item.total > 0 ? (item.attendance / item.total) * 100 : 0;
                  const isWeekend = item.day === '토' || item.day === '일';
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">{percentage.toFixed(0)}%</span>
                      <div className="w-full flex flex-col items-center justify-end h-32">
                        <div
                          className={`w-8 rounded-t-md transition-all duration-500 ${
                            isWeekend ? 'bg-cyan-500' : 'bg-primary'
                          }`}
                          style={{ height: `${Math.max(percentage, 4)}%`, minHeight: '4px' }}
                        />
                      </div>
                      <span className={`text-sm mt-2 font-medium ${
                        isWeekend ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-600 dark:text-slate-400'
                      }`}>{item.day}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{item.attendance}/{item.total}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-primary rounded-sm" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">평일</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-cyan-500 rounded-sm" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">주말</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-44 text-sm text-slate-400 dark:text-slate-500">
              출석 데이터가 없습니다.
            </div>
          )}
        </Card>
      </div>

      {/* Top Classes */}
      <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden rounded-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">인기 수업 TOP 5</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">등록 인원 기준</p>
          </div>
          <Badge variant="outline" className="border-blue-200 dark:border-blue-800 text-primary bg-primary/5 dark:bg-primary/10">
            기간 내
          </Badge>
        </div>

        {topClasses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">순위</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">수업명</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">등록 인원</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">매출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {topClasses.map((classItem, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                    <td className="px-4 py-4 text-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mx-auto ${
                        index === 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                        index === 1 ? 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300' :
                        index === 2 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                        'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}>
                        {index + 1}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-left">
                      <span className="font-medium text-slate-900 dark:text-white">{classItem.name}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-semibold text-primary tabular-nums">{classItem.enrollments}명</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">{formatCurrency(classItem.revenue)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
            수업 데이터가 없습니다.
          </div>
        )}
      </Card>
    </div>
  );
}
