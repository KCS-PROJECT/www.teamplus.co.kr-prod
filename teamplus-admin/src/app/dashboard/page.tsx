'use client';

/**
 * TEAMPLUS 관리자 대시보드 페이지
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석 필수: 클럽 운영 현황 요약, 통계, 일정, 빠른 작업, 가입 승인, 시스템 알림
 * 2. 휴먼 디자인: 시간 기반 인사말, 직관적 레이아웃, 명확한 시각적 계층
 * 3. AI 스타일 절대 금지: gradient, blur 미사용, 단색 배경
 * 4. 페르소나 융합: frontend + architect + analyzer 협업
 * 5. 명령어 필수: frontend-design 스킬 활용
 * 6. 결과 출력 필수: 7원칙 적용 내용 문서화
 * 7. Tone & Manner: 존댓말, 액션 동사, 일관된 용어
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MESSAGES } from '@/lib/messages';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import {
  Users,
  CreditCard,
  Image,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Building2,
  UserPlus,
  XCircle,
  Clock,
  Mail,
  // [추가 2026-04-30] 팀/오픈클래스/정산 카드 아이콘
  Trophy,
  GraduationCap,
  Wallet,
} from 'lucide-react';
import { authService } from '@/services/auth.service';
import { api } from '@/services/api-client';
import type { User } from '@/types';

interface DashboardActivity {
  type: string;
  message: string;
  createdAt: string;
}

interface CoachDashboardData {
  clubs: { total: number; activeMembers: number; pendingMembers: number };
  classes: { total: number; todaySchedules: number; weekSchedules: number };
  attendance: { todayPresent: number; todayAbsent: number; weekPresentRate: string };
  payments: { monthRevenue: number; monthPayments: number; pendingPayments: number };
  recentActivities: DashboardActivity[];
}

interface AdminDashboardData {
  users: { total: number; newThisMonth: number; byType: Record<string, number> };
  clubs: { total: number; activeClubs: number; totalMembers: number };
  payments: { totalRevenue: number; monthRevenue: number; refundedAmount: number; netRevenue: number };
  attendance: { todayTotal: number; todayPresent: number; presentRate: string };
  charts: {
    revenueByMonth: { month: string; revenue: number }[];
    membersByMonth: { month: string; count: number }[];
  };
  // [추가 2026-07-22] 대시보드 최근 공지 5개 (systemNotice, pinned+최신순)
  latestNotices?: {
    id: string;
    title: string;
    targetType: string | null;
    createdAt: string;
    pinned: boolean;
  }[];
}

interface DashboardNotice {
  id: string;
  title: string;
  createdAt: string;
  pinned: boolean;
}

// 승인 대기 회원
interface PendingMember {
  id: string;
  name: string;
  email: string;
  requestDate: string;
  userType: string;
}


export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState({
    totalMembers: 0,
    memberGrowth: 0,
    activeClubs: 0,
    upcomingClasses: 0,
    pendingPayments: 0,
    pendingAmount: 0,
    unreadNotifications: 0,
    todayAttendance: 0,
    monthlyRevenue: 0,
    revenueGrowth: 0,
    newSignups: 0,
    // [추가 2026-04-30] 사용자 요청 — 등록된 팀 / 오픈클래스 / 정산 관리 현황
    totalTeams: 0,
    activeTeams: 0,
    totalAcademies: 0,
    academyMembers: 0,
    settlementCount: 0,
    settlementAmount: 0,
  });
  const [notices, setNotices] = useState<DashboardNotice[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [_actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 시간 기반 인사말
  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return '좋은 아침이에요';
    if (hour < 18) return '좋은 오후예요';
    return '좋은 저녁이에요';
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const currentUser = authService.getCurrentUser();
      setUser(currentUser);

      // [수정 2026-07-22] admin 웹 로그인 계정은 SYSTEM/OPER/ADMIN(관리자) — 대소문자·표기 무관하게
      //   관리자면 admin 대시보드 통계를 호출한다. (기존 'admin' 정확일치는 SYSTEM/OPER 를 놓쳐 0 표시)
      const roleKey = (currentUser?.userType ?? '').toString().toLowerCase();
      const isAdminRole =
        roleKey === 'admin' || roleKey === 'system' || roleKey === 'oper';

      if (isAdminRole) {
        // [추가 2026-04-30] 팀 / 오픈클래스 / 정산 현황 fetch
        type TeamItem = { id: string; isActive?: boolean };
        type AcademyItem = { id: string; memberCount?: number };
        type SettlementItem = { id: string; status?: string; netAmount?: number; totalAmount?: number };
        // [수정 2026-07-22] 현황 카드 데이터 소스 정정:
        //   · 팀: '/team'(단수) → 404 였음 → 실제 경로 '/teams'
        //   · 오픈클래스: '/admin/clubs?type=academy'(0 반환) → academies 페이지와 동일한 '/academies/public'
        //   · 응답이 배열이 아닌 { data, meta } 페이지네이션 형태여도 배열로 정규화
        const [dashData, pendingData, teamsData, academyData, settlementsData, noticesData] = await Promise.all([
          api.get<AdminDashboardData>('/dashboard/admin').catch(() => null),
          api.get<{ data?: PendingMember[] }>('/admin/members/pending').catch(() => ({ data: [] })),
          api.get<unknown>('/teams', { params: { limit: 200 } }).catch(() => []),
          api.get<unknown>('/academies/public', { params: { limit: 200 } }).catch(() => []),
          api.get<unknown>('/settlements').catch(() => []),
          // [수정 2026-07-22] 대시보드 공지 = 시스템(서비스) 공지만. 팀 공지(scope=team) 제외.
          //   admin 앱 공지사항(/dashboard/app/notices)과 동일한 소스(scope=service).
          api.get<unknown>('/notices/admin/list', { params: { scope: 'service', limit: 5 } }).catch(() => []),
        ]);
        setPendingMembers(Array.isArray(pendingData?.data) ? pendingData.data : Array.isArray(pendingData) ? pendingData as unknown as PendingMember[] : []);
        // 배열 또는 { data: [...] } / { academies: [...] } 응답을 모두 배열로 정규화
        const toArray = <T,>(v: unknown): T[] => {
          if (Array.isArray(v)) return v as T[];
          if (v && typeof v === 'object') {
            const o = v as { data?: unknown; academies?: unknown };
            if (Array.isArray(o.data)) return o.data as T[];
            if (Array.isArray(o.academies)) return o.academies as T[];
          }
          return [];
        };
        const teams = toArray<TeamItem>(teamsData);
        const academies = toArray<AcademyItem>(academyData);
        const settlements = toArray<SettlementItem>(settlementsData);
        // [수정 2026-07-22] 총 회원 = 실제 회원(감독·코치·학부모·선수 = 비관리자 User) 합.
        //   기존 clubs.totalMembers 는 '승인된 팀멤버' 라 학부모가 빠져 부정확했음.
        //   users.byType(userType별 count)로 관리자(ADMIN/SYSTEM/OPER) 제외하고 집계.
        const byType = dashData?.users?.byType ?? {};
        const MEMBER_ROLE_KEYS = [
          'DIRECTOR',
          'ACADEMY_DIRECTOR',
          'COACH',
          'PARENT',
          'TEEN',
          'CHILD',
        ];
        const realMemberTotal = MEMBER_ROLE_KEYS.reduce(
          (sum, key) => sum + (byType[key] ?? 0),
          0,
        );
        // 신규 가입도 관리자 제외한 실제 회원 기준으로만 세고 싶으나, 백엔드 newThisMonth 는
        //   전체 User 기준(관리자 신규는 사실상 0). 그대로 사용해도 실측과 일치.
        setStats({
          totalMembers: realMemberTotal,
          memberGrowth: dashData?.users?.newThisMonth ?? 0,
          activeClubs: dashData?.clubs?.activeClubs ?? 0,
          upcomingClasses: 0,
          pendingPayments: 0,
          pendingAmount: 0,
          unreadNotifications: 0,
          todayAttendance: dashData?.attendance?.todayPresent ?? 0,
          monthlyRevenue: dashData?.payments?.monthRevenue ?? 0,
          revenueGrowth: 0,
          newSignups: dashData?.users?.newThisMonth ?? 0,
          totalTeams: teams.length,
          activeTeams: teams.filter((t) => t.isActive !== false).length,
          totalAcademies: academies.length,
          academyMembers: academies.reduce((sum, a) => sum + (a.memberCount ?? 0), 0),
          settlementCount: settlements.length,
          settlementAmount: settlements.reduce(
            (sum, s) => sum + (s.netAmount ?? s.totalAmount ?? 0),
            0,
          ),
        });
        // [수정 2026-07-22] 최근 시스템 공지 5개 — /notices/admin/list?scope=service
        const noticeRows = toArray<{
          id: string;
          title: string;
          createdAt: string;
          pinned?: boolean;
          isPinned?: boolean;
        }>(noticesData);
        setNotices(
          noticeRows.map((n) => ({
            id: n.id,
            title: n.title,
            createdAt: n.createdAt,
            pinned: Boolean(n.pinned ?? n.isPinned),
          })),
        );
      } else {
        const dashData = await api.get<CoachDashboardData>('/dashboard/coach');
        setStats({
          totalMembers: dashData.clubs?.activeMembers ?? 0,
          memberGrowth: 0,
          activeClubs: 0,
          upcomingClasses: dashData.classes?.todaySchedules ?? 0,
          pendingPayments: dashData.payments?.pendingPayments ?? 0,
          pendingAmount: 0,
          unreadNotifications: 0,
          todayAttendance: dashData?.attendance?.todayPresent ?? 0,
          monthlyRevenue: dashData?.payments?.monthRevenue ?? 0,
          revenueGrowth: 0,
          newSignups: 0,
          totalTeams: 0,
          activeTeams: 0,
          totalAcademies: 0,
          academyMembers: 0,
          settlementCount: 0,
          settlementAmount: 0,
        });
        // 코치 계정은 공지 표시 없음(관리자 대시보드 전용)
        setNotices([]);
      }
    } catch (error) {
      console.error('대시보드 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // [삭제 2026-04-30] 수업 승인 메뉴/페이지 폐기로 인한 독립 로딩 제거.

  const formatCurrency = (value: number) => {
    if (value >= 10000000) {
      return `${(value / 10000000).toFixed(1)}천만`;
    } else if (value >= 10000) {
      return `${(value / 10000).toFixed(0)}만`;
    }
    return value.toLocaleString();
  };

  const handleApproveMember = async (memberId: string) => {
    try {
      await api.patch(`/admin/members/${memberId}/approve`, { status: 'approved' });
      setPendingMembers((prev) => prev.filter((m) => m.id !== memberId));
      setActionMsg({ type: 'success', text: MESSAGES.member.approved });
    } catch (error) {
      console.error('승인 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.member.approveError });
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleRejectMember = async (memberId: string) => {
    try {
      await api.patch(`/admin/members/${memberId}/approve`, { status: 'rejected' });
      setPendingMembers((prev) => prev.filter((m) => m.id !== memberId));
      setActionMsg({ type: 'success', text: MESSAGES.member.rejected });
    } catch (error) {
      console.error('거절 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.member.rejectError });
    }
    setTimeout(() => setActionMsg(null), 3000);
  };

  if (isLoading) {
    return <LoadingSpinner message="대시보드를 불러오는 중..." />;
  }

  return (
    <div className="space-y-8" suppressHydrationWarning>
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {getGreeting()}, {user?.name || '관리자'}님
          </h1>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
            {currentTime.toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            })}
          </p>
        </div>
      </div>

      {/* Main Stats Grid - 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStatsCard
          title="총 회원"
          value={`${stats.totalMembers}명`}
          icon={<Users className="w-5 h-5" />}
          variant="primary"
          trend={{ value: stats.memberGrowth, label: '전월 대비' }}
        />
        <MiniStatsCard
          title="활성 팀"
          value={`${stats.activeTeams}개`}
          icon={<Building2 className="w-5 h-5" />}
          variant="info"
          description="운영 중"
        />
        <MiniStatsCard
          title="이번 달 매출"
          value={formatCurrency(stats.monthlyRevenue)}
          icon={<CreditCard className="w-5 h-5" />}
          variant="success"
          trend={{ value: stats.revenueGrowth, label: '전월 대비' }}
        />
        <MiniStatsCard
          title="신규 가입"
          value={`${stats.newSignups}명`}
          icon={<UserPlus className="w-5 h-5" />}
          variant="neutral"
          description="이번 달"
        />
      </div>

      {/* [추가 2026-04-30] 사용자 요청 — 등록된 팀 / 오픈클래스 / 정산 현황 카드 (실제 DB) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/dashboard/teams"
          className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-violet-600 dark:text-violet-400" aria-hidden="true" />
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary motion-reduce:transition-none transition-colors" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">등록된 팀 현황</h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {stats.totalTeams.toLocaleString('ko-KR')}<span className="text-base font-medium text-slate-500 dark:text-slate-400 ml-1">팀</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">활성 {stats.activeTeams}팀</p>
        </Link>

        <Link
          href="/dashboard/academies"
          className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary motion-reduce:transition-none transition-colors" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">오픈클래스 현황</h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {stats.totalAcademies.toLocaleString('ko-KR')}<span className="text-base font-medium text-slate-500 dark:text-slate-400 ml-1">개</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">총 수강생 {stats.academyMembers.toLocaleString('ko-KR')}명</p>
        </Link>

        <Link
          href="/dashboard/settlements"
          className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary motion-reduce:transition-none transition-colors" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">정산 관리 현황</h3>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {stats.settlementCount.toLocaleString('ko-KR')}<span className="text-base font-medium text-slate-500 dark:text-slate-400 ml-1">건</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{formatCurrency(stats.settlementAmount)}원</p>
        </Link>
      </div>

      {/* Content Grid - 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Pending Approval + Today Schedule */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pending Approval Members */}
          <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">신규 가입 승인 대기</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{pendingMembers.length}명 대기 중</p>
                </div>
              </div>
              <Link
                href="/dashboard/members?status=pending"
                className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              >
                전체 보기
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {pendingMembers.length > 0 ? (
                pendingMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    {/* Avatar Placeholder */}
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </div>
                    {/* Member Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{member.name}</p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400">
                          {member.userType === 'parent' ? '학부모' : member.userType === 'coach' ? '코치' : member.userType}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Mail className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                        <p className="text-xs text-slate-400 dark:text-slate-500">{member.requestDate}</p>
                      </div>
                    </div>
                    {/* Action Buttons */}
                    <div className="flex gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="success"
                        onClick={() => handleApproveMember(member.id)}
                        className="text-xs px-3 h-8"
                        aria-label={`${member.name}님 가입 승인`}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        승인
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectMember(member.id)}
                        className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs px-3 h-8"
                        aria-label={`${member.name}님 가입 거절`}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        거절
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  승인 대기 중인 회원이 없습니다.
                </div>
              )}
            </div>
          </Card>

          {/* [변경 2026-07-22] 사용자 요청 — '최근 활동' → '공지사항'(최근 공지 5개) */}
          <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">공지사항</h2>
              <Link
                href="/dashboard/app/notices"
                className="text-sm text-primary hover:text-primary-dark dark:text-blue-400 dark:hover:text-blue-300"
              >
                모두 보기
              </Link>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {notices.length > 0 ? notices.map((notice) => {
                const dateStr = (() => {
                  const d = new Date(notice.createdAt);
                  if (Number.isNaN(d.getTime())) return '';
                  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
                })();
                return (
                  <Link
                    key={notice.id}
                    href="/dashboard/app/notices"
                    className="p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none"
                  >
                    {notice.pinned ? (
                      <span className="flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        고정
                      </span>
                    ) : (
                      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-primary/60" aria-hidden="true" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{notice.title}</p>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">{dateStr}</span>
                  </Link>
                );
              }) : (
                <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  등록된 공지사항이 없습니다.
                </div>
              )}
            </div>
          </Card>

          {/* [삭제 2026-04-30] 수업 승인대기 카드 — 승인 메뉴 폐기 */}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">빠른 작업</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard/members')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-primary dark:hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors motion-reduce:transition-none group"
              >
                <div className="w-10 h-10 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-center group-hover:bg-primary/20 dark:group-hover:bg-primary/30">
                  <Users className="w-5 h-5 text-primary dark:text-primary-light" aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">학부모/선수 관리</span>
              </button>
              {/* [삭제 2026-04-30] 수업 승인 빠른 작업 버튼 — 승인 메뉴 폐기 */}
              <button
                type="button"
                onClick={() => router.push('/dashboard/payments')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors motion-reduce:transition-none group"
              >
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-900/50">
                  <CreditCard className="w-5 h-5 text-green-700 dark:text-green-400" aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">결제 관리</span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard/app/banners')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-amber-500 dark:hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors motion-reduce:transition-none group"
                aria-label="배너 관리"
              >
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50">
                  <Image className="w-5 h-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">배너 관리</span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/dashboard/app/feedback')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors motion-reduce:transition-none group"
                aria-label="피드백 관리"
              >
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50">
                  <MessageSquare className="w-5 h-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">피드백 관리</span>
              </button>
            </div>
          </Card>

          {/* [이동 2026-04-30] 최근 활동 카드 — 좌측 컬럼(승인대기 아래)으로 이동 */}
        </div>
      </div>

      {/* Pending Alerts */}
      {(stats.pendingPayments > 0 || stats.unreadNotifications > 0) && (
        <Card className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-100">처리가 필요한 항목이 있습니다</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  미수금 <span className="tabular-nums">{stats.pendingPayments}</span>건 (<span className="tabular-nums">{stats.pendingAmount.toLocaleString()}원</span>) · 읽지 않은 알림 <span className="tabular-nums">{stats.unreadNotifications}</span>개
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => router.push('/dashboard/payments')}
              variant="warning"
              className="gap-2 transition-colors motion-reduce:transition-none"
            >
              확인하기
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
