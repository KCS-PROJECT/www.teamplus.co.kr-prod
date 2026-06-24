'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { openShareSheet } from '@/lib/share';
import { api } from '@/services/api-client';
import { STATUS_BADGE_CLASS, type StatusVariant } from '@/lib/status-colors';

import dynamic from 'next/dynamic';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });
import type { SkillData } from '@/components/report/RadarChart';

// Report Components - RadarChart lazy loaded (SVG chart component)
const RadarChart = dynamic(() => import('@/components/report/RadarChart').then(mod => ({ default: mod.RadarChart })), {
  ssr: false,
  loading: () => <div className="w-full aspect-square max-w-[280px] mx-auto bg-it-fill dark:bg-rink-800 rounded-lg animate-pulse motion-reduce:animate-none" />,
});
import { SkillStatCard } from '@/components/report/SkillStatCard';
import { CoachCommentCard } from '@/components/report/CoachCommentCard';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { GrowthTrendChart } from '@/components/parent/GrowthTrendChart';

// ─── Types ───────────────────────────────────────────

interface ReportChild {
  id: string;
  name: string;
  profileEmoji: string;
  grade: string;
}

interface MonthlyAttendance {
  month: string;
  rate: number;
  attended: number;
  total: number;
}

interface ClassHistoryItem {
  id: string;
  className: string;
  period: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  coach: string;
}

interface TournamentRecord {
  id: string;
  name: string;
  date: string;
  result: string;
  placement?: string;
}

interface BadgeItem {
  id: string;
  name: string;
  icon: string;
  earnedDate: string;
  category: string;
}

interface ChildReportData {
  attendance: MonthlyAttendance[];
  classHistory: ClassHistoryItem[];
  tournaments: TournamentRecord[];
  badges: BadgeItem[];
  skillData: SkillData | null;
  coachComment: { content: string; date: string } | null;
  coachInfo: { name: string; role: string; evaluationDate: string } | null;
}

// ─── API Types ───────────────────────────────────────

interface ChildApiItem {
  id: string;
  firstName: string;
  lastName: string;
  clubName?: string;
  className?: string;
}

const PROFILE_EMOJIS = ['⛷️', '⛸️', '🏒', '🎿', '🥅'];

// ─── Report Tab Type ─────────────────────────────────

type ReportTab = 'overview' | 'skill' | 'history' | 'achievements';

// ─── Helper Components ───────────────────────────────

function AttendanceBarChart({ data, isAnimated }: { data: MonthlyAttendance[]; isAnimated: boolean }) {
  const maxRate = 100;

  return (
    /* [ICETIMES flat 재작업 2026-06-24] 카드 박스(rounded-xl border) 제거 → flat 면.
       차트 막대/수치/애니메이션 로직은 동결. 외곽 표면만 평탄화. */
    <div className="bg-it-surface dark:bg-it-blue-950 p-4">
      {/* [시안] 헤더 — 아이콘박스 32 r9, h3 fs15/800, "최근 6개월" 12/faint */}
      <div className="flex items-center justify-between mb-[14px]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[9px] bg-success-100 dark:bg-success-700/20 flex items-center justify-center">
            <Icon name="how_to_reg" className="text-success text-[18px]" aria-hidden="true" />
          </div>
          <h3 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
            월별 출석률
          </h3>
        </div>
        <span className="text-[12px] text-it-ink-400 dark:text-rink-300">
          최근 6개월
        </span>
      </div>

      <div className="flex items-end gap-2 h-32">
        {data.map((item, index) => {
          const heightPercent = isAnimated ? (item.rate / maxRate) * 100 : 0;
          const isGood = item.rate >= 90;
          const isFair = item.rate >= 70 && item.rate < 90;

          return (
            <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[11.5px] font-extrabold text-it-ink-700 dark:text-rink-100 tabular-nums">
                {isAnimated ? `${item.rate}%` : '0%'}
              </span>
              <div className="w-full bg-it-line dark:bg-rink-700 rounded-t-md overflow-hidden relative" style={{ height: '80px' }}>
                <div
                  className={cn(
                    'absolute bottom-0 w-full rounded-t-md transition-all motion-reduce:transition-none duration-700 ease-out',
                    isGood ? 'bg-success' :
                    isFair ? 'bg-it-blue-500' : 'bg-warning-500'
                  )}
                  style={{
                    height: `${heightPercent}%`,
                    transitionDelay: `${index * 100}ms`,
                  }}
                />
              </div>
              <span className="text-[11.5px] text-it-ink-500 dark:text-rink-300">
                {item.month}
              </span>
            </div>
          );
        })}
      </div>

      {/* Average */}
      {data.length > 0 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-it-line dark:border-rink-700">
          <span className="text-card-meta text-it-ink-400 dark:text-rink-300">
            평균 출석률
          </span>
          <span className="text-card-body font-bold text-it-ink-900 dark:text-white tabular-nums">
            {Math.round(data.reduce((sum, d) => sum + d.rate, 0) / data.length)}%
          </span>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' }) {
  // 색상은 lib/status-colors.ts SoT 가 담당. 여기서는 의미 매핑만 정의.
  const config: Record<'ACTIVE' | 'COMPLETED' | 'CANCELLED', { label: string; variant: StatusVariant }> = {
    ACTIVE:    { label: '수강 중', variant: 'success' },
    COMPLETED: { label: '수료',   variant: 'neutral' },
    CANCELLED: { label: '취소',   variant: 'error'   },
  };

  const { label, variant } = config[status];

  return (
    <span className={cn('px-2 py-0.5 rounded text-card-meta font-bold', STATUS_BADGE_CLASS[variant])}>
      {label}
    </span>
  );
}

// ─── Page Component ──────────────────────────────────

export default function GrowthReportPage() {
  const { back, navigate } = useNavigation();
  const { toast } = useToast();
  // [2차 사이클 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({ showStatusBar: true, showAppBar: false, showBottomNav: false });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [childrenList, setChildrenList] = useState<ReportChild[]>([]);
  const [reportDataMap, setReportDataMap] = useState<Record<string, ChildReportData>>({});
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  // v17 anti-flicker (SPEC §2.3): setIsAnimated setTimeout 토글 제거 → 항상 true.
  //   chart 의 transition 은 CSS 만으로 mount 시 자동 발화. JS 토글 깜박임 차단.
  const isAnimated = true;
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const selectedChild = childrenList[selectedChildIndex];
  const reportData = selectedChild ? reportDataMap[selectedChild.id] ?? null : null;

  // 자녀 목록 로드
  const loadChildren = useCallback(async () => {
    try {
      const res = await api.get<{ data?: ChildApiItem[] }>('/children');
      if (!res.success || !res.data) return;
      const raw = Array.isArray(res.data) ? res.data : (res.data as { data?: ChildApiItem[] }).data ?? [];
      setChildrenList(
        (raw as ChildApiItem[]).map((c, idx) => ({
          id: c.id,
          name: `${c.lastName}${c.firstName}`,
          profileEmoji: PROFILE_EMOJIS[idx % PROFILE_EMOJIS.length],
          grade: c.className ?? c.clubName ?? '',
        }))
      );
    } catch {
      setChildrenList([]);
    }
  }, []);

  // 선택된 자녀의 리포트 데이터 로드
  const loadReport = useCallback(async (childId: string) => {
    setIsLoading(true);
    try {
      const [attendanceRes, skillRes, badgesRes, tournamentsRes, enrollmentRes] = await Promise.all([
        api.get<{ data?: MonthlyAttendance[]; attendance?: MonthlyAttendance[] }>(`/dashboard/analytics/attendance`, { params: { childId } }),
        api.get<{ skillData?: SkillData; data?: SkillData; coachComment?: { content: string; date: string }; coachInfo?: { name: string; role: string; evaluationDate: string } }>(`/reports/skill/${childId}`),
        api.get<{ data?: BadgeItem[]; badges?: BadgeItem[] }>(`/users/${childId}/badges`),
        api.get<{ data?: TournamentRecord[]; tournaments?: TournamentRecord[] }>(`/users/${childId}/tournaments`),
        api.get<{ data?: ClassHistoryItem[]; enrollments?: ClassHistoryItem[] }>(`/enrollments`, { params: { childId } }),
      ]);

      const attendance = attendanceRes.success && attendanceRes.data
        ? (attendanceRes.data as { data?: MonthlyAttendance[]; attendance?: MonthlyAttendance[] }).data
          ?? (attendanceRes.data as { attendance?: MonthlyAttendance[] }).attendance
          ?? (Array.isArray(attendanceRes.data) ? attendanceRes.data : [])
        : [];

      const skill = skillRes.success && skillRes.data ? skillRes.data : null;
      const badges = badgesRes.success && badgesRes.data
        ? (badgesRes.data as { data?: BadgeItem[]; badges?: BadgeItem[] }).data
          ?? (badgesRes.data as { badges?: BadgeItem[] }).badges
          ?? (Array.isArray(badgesRes.data) ? badgesRes.data : [])
        : [];

      const tournaments = tournamentsRes.success && tournamentsRes.data
        ? (tournamentsRes.data as { data?: TournamentRecord[]; tournaments?: TournamentRecord[] }).data
          ?? (tournamentsRes.data as { tournaments?: TournamentRecord[] }).tournaments
          ?? (Array.isArray(tournamentsRes.data) ? tournamentsRes.data : [])
        : [];

      const classHistory = enrollmentRes.success && enrollmentRes.data
        ? (enrollmentRes.data as { data?: ClassHistoryItem[]; enrollments?: ClassHistoryItem[] }).data
          ?? (enrollmentRes.data as { enrollments?: ClassHistoryItem[] }).enrollments
          ?? (Array.isArray(enrollmentRes.data) ? enrollmentRes.data : [])
        : [];

      setReportDataMap((prev) => ({
        ...prev,
        [childId]: {
          attendance: attendance as MonthlyAttendance[],
          classHistory: classHistory as ClassHistoryItem[],
          tournaments: tournaments as TournamentRecord[],
          badges: badges as BadgeItem[],
          skillData: (skill as { skillData?: SkillData; data?: SkillData })?.skillData ?? (skill as { data?: SkillData })?.data ?? null,
          coachComment: (skill as { coachComment?: { content: string; date: string } })?.coachComment ?? null,
          coachInfo: (skill as { coachInfo?: { name: string; role: string; evaluationDate: string } })?.coachInfo ?? null,
        },
      }));
    } catch {
      // API 실패 시 빈 리포트
      setReportDataMap((prev) => ({
        ...prev,
        [childId]: {
          attendance: [],
          classHistory: [],
          tournaments: [],
          badges: [],
          skillData: null,
          coachComment: null,
          coachInfo: null,
        },
      }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    if (selectedChild?.id) {
      loadReport(selectedChild.id);
    }
  }, [selectedChild?.id, loadReport]);

  const averageAttendance = useMemo(() => {
    if (!reportData?.attendance.length) return 0;
    return Math.round(
      reportData.attendance.reduce((sum, d) => sum + d.rate, 0) / reportData.attendance.length
    );
  }, [reportData]);

  const handleShare = () => {
    openShareSheet({
      title: `${selectedChild?.name} 성장 리포트`,
      text: `${selectedChild?.name}의 성장 리포트입니다.`,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });
  };

  const tabs: { key: ReportTab; label: string; icon: string }[] = [
    { key: 'overview', label: '종합', icon: 'dashboard' },
    { key: 'skill', label: '기술 평가', icon: 'bar_chart' },
    { key: 'history', label: '수업 이력', icon: 'history' },
    { key: 'achievements', label: '성과', icon: 'emoji_events' },
  ];

  if (isLoading && !reportData) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      {/* [appbar-harness-v4 · parent-agent · 2026-05-12] rightAction → extraActions 변환 —
          공유 버튼이 시계/종/메뉴를 통째로 대체하던 문제 해결. 메뉴 자동 유지. */}
      <PageAppBar
        title="성장 리포트"
        extraActions={[
          {
            icon: 'ios_share',
            onClick: handleShare,
            label: '성장 리포트 공유하기',
          },
        ]}
      />

      {/* Child Selection Tabs — 회색 캔버스 위 세그먼트 (/director flat 언어 정합) */}
      {childrenList.length > 1 && (
        <div className="bg-it-canvas dark:bg-puck px-4 pt-4" role="tablist" aria-label="자녀 선택">
          <div className="flex gap-2 p-1 bg-it-fill dark:bg-rink-800 rounded-lg">
            {childrenList.map((child, index) => (
              <button
                key={child.id}
                type="button"
                role="tab"
                aria-selected={selectedChildIndex === index}
                aria-label={`${child.name} 성장 리포트 보기`}
                onClick={() => {
                  setSelectedChildIndex(index);
                  setActiveTab('overview');
                }}
                className={cn(
                  /* [시안] 세그먼트 min-h44, fs14.5/700, active 흰 surface + shadow */
                  'flex-1 flex items-center justify-center gap-2 min-h-[44px] px-3 text-[14.5px] font-bold rounded-[9px] transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                  selectedChildIndex === index
                    ? 'bg-it-surface dark:bg-rink-700 shadow-sh-1 text-it-ink-900 dark:text-white'
                    : 'text-it-ink-500 dark:text-rink-300 hover:text-it-ink-700 dark:hover:text-rink-100'
                )}
              >
                <span aria-hidden="true">{child.profileEmoji}</span>
                <span>{child.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Report Tab Navigation — 회색 캔버스 위 탭 */}
      <div className="bg-it-canvas dark:bg-puck px-4 pt-3 pb-1" role="tablist" aria-label="리포트 탭">
        <div className="flex gap-1 overflow-x-auto hide-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                /* [시안] 탭 min-h40, px13, fs13.5/700, gap5, r10. active blue fill / idle transparent */
                'flex items-center gap-[5px] min-h-[40px] px-[13px] text-[13.5px] font-bold rounded-[10px] whitespace-nowrap transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40',
                activeTab === tab.key
                  ? 'bg-it-blue-500 text-white'
                  : 'text-it-ink-500 dark:text-rink-300 hover:bg-it-fill dark:hover:bg-rink-800'
              )}
            >
              <Icon name={tab.icon} className="text-[16px]" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content
          [ICETIMES flat 재작업 2026-06-24] /director 와 동일 flat 언어 — main 은 회색
          캔버스(bg-it-canvas dark:bg-puck), 콘텐츠 블록은 각자 mt-2 흰 섹션으로 쌓인다.
          이전 px-4 space-y-4 + 카드 박스(rounded-xl border) → full-bleed flat 섹션 전환. */}
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-card-body text-it-ink-500 dark:text-rink-300">
              <div className="w-4 h-4 border-2 border-it-line dark:border-rink-700 border-t-it-blue-500 rounded-w-pill animate-spin" />
              <span>{MESSAGES.common.loading}</span>
            </div>
          </div>
        ) : reportData && (
          <>
            {/* ─── Overview Tab ───────────────────────── */}
            {activeTab === 'overview' && (
              <>
                {/* Child Summary Card — flat 섹션 (카드 박스 제거) */}
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-14 h-14 rounded-2xl bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center text-3xl shrink-0"
                      aria-hidden="true"
                    >
                      {selectedChild?.profileEmoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* [시안] 이름 18/800, grade 13/muted */}
                      <h2 className="text-[18px] font-extrabold text-it-ink-900 dark:text-white truncate">
                        {selectedChild?.name}
                      </h2>
                      <p className="text-[13px] text-it-ink-500 dark:text-rink-300 truncate">
                        {selectedChild?.grade || '수업 미배정'}
                      </p>
                    </div>
                  </div>

                  {/* Quick Stats — [시안] 3-col 모두 bg-fill 통일 배경, value 19px/800, icon 18, 라벨 11/muted */}
                  <div className="grid grid-cols-3 gap-2 pt-[14px] border-t border-it-line dark:border-it-blue-900">
                    <div className="flex flex-col items-center gap-1 py-[10px] rounded-xl bg-it-fill dark:bg-rink-800">
                      <Icon name="how_to_reg" className="text-it-blue-500 text-[18px]" aria-hidden="true" />
                      <p className="text-[19px] font-extrabold text-it-blue-500 tabular-nums leading-none">
                        {averageAttendance}%
                      </p>
                      <p className="text-[11px] text-it-ink-500 dark:text-rink-300 font-medium">
                        평균 출석률
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-1 py-[10px] rounded-xl bg-it-fill dark:bg-rink-800">
                      <Icon name="sports_score" className="text-success text-[18px]" aria-hidden="true" />
                      <p className="text-[19px] font-extrabold text-success tabular-nums leading-none">
                        {reportData.tournaments.length}
                      </p>
                      <p className="text-[11px] text-it-ink-500 dark:text-rink-300 font-medium">
                        대회 참가
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-1 py-[10px] rounded-xl bg-it-fill dark:bg-rink-800">
                      <Icon name="emoji_events" className="text-warning-600 text-[18px]" aria-hidden="true" />
                      <p className="text-[19px] font-extrabold text-warning-600 tabular-nums leading-none">
                        {reportData.badges.length}
                      </p>
                      <p className="text-[11px] text-it-ink-500 dark:text-rink-300 font-medium">
                        획득 뱃지
                      </p>
                    </div>
                  </div>
                </section>

                {/* Attendance Chart — flat 섹션 (8px 갭) */}
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
                  <AttendanceBarChart data={reportData.attendance} isAnimated={isAnimated} />
                </section>

                {/* Phase 3.5: 6개월 성장 트렌드 (출석률 기반) — GrowthTrendChart 는 자체 표면
                    소유 공유 컴포넌트. flat 섹션으로 감싸 8px 갭만 부여(차트 로직 동결). */}
                {reportData.attendance.length >= 2 && (
                  <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                    <GrowthTrendChart
                      iceTheme
                      title="6개월 성장 추이"
                      subtitle="월별 출석률 기반"
                      badge="LAST 6M"
                      data={reportData.attendance.map((m) => ({
                        label: m.month,
                        value: m.rate,
                      }))}
                    />
                  </section>
                )}

                {/* Recent Coach Comment — CoachCommentCard 자체 표면 소유 공유 컴포넌트.
                    flat 섹션으로 감싸 8px 갭만 부여(컴포넌트 내부 불변). */}
                {reportData.coachComment && (
                  <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                    <CoachCommentCard
                      iceTheme
                      content={reportData.coachComment.content}
                      date={reportData.coachComment.date}
                      onReply={() => navigate('/messages')}
                    />
                  </section>
                )}

                {/* Recent Badges Preview — flat 섹션 */}
                {reportData.badges.length > 0 && (
                  <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                    {/* [시안] 헤더 h3 15/800 + 전체보기 12.5/700/blue, 뱃지 원형 44, 라벨 11.5 */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
                        획득 뱃지
                      </h3>
                      <button
                        onClick={() => setActiveTab('achievements')}
                        className="text-[12.5px] font-bold text-it-blue-500"
                      >
                        전체보기
                      </button>
                    </div>
                    <div className="flex gap-3">
                      {reportData.badges.slice(0, 4).map((badge) => (
                        <div key={badge.id} className="flex flex-col items-center gap-[5px] flex-1">
                          <div className="w-11 h-11 rounded-w-pill bg-warning-500/10 dark:bg-warning-500/15 flex items-center justify-center">
                            <Icon name={badge.icon} className="text-warning-600 text-[22px]" />
                          </div>
                          <span className="text-[11.5px] text-it-ink-700 dark:text-rink-300 text-center leading-tight">
                            {badge.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {/* ─── Skill Evaluation Tab ────────────────── */}
            {activeTab === 'skill' && (
              <>
                {/* Coach Info — flat 섹션 (카드 박스 제거) */}
                {reportData.coachInfo && (
                  <section className="mt-2 flex items-center gap-4 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                    <div className="relative shrink-0">
                      <div className="h-14 w-14 rounded-w-pill bg-it-fill dark:bg-rink-700 overflow-hidden border-2 border-it-blue-500 flex items-center justify-center">
                        <Icon name="person" className="text-2xl text-it-ink-400" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h2 className="text-card-emphasis font-bold text-it-ink-900 dark:text-white truncate">
                          {reportData.coachInfo.name} 코치
                        </h2>
                        <span className="text-card-meta font-medium px-2 py-1 rounded bg-it-blue-500/10 text-it-blue-600">
                          {reportData.coachInfo.role}
                        </span>
                      </div>
                      <p className="text-card-body text-it-ink-500 dark:text-rink-300 flex items-center gap-1">
                        <Icon name="calendar_today" className="text-[14px]" />
                        {reportData.coachInfo.evaluationDate} 평가 완료
                      </p>
                    </div>
                  </section>
                )}

                {/* Radar Chart — flat 섹션 (차트 SVG 로직 동결, 외곽 박스만 평탄화) */}
                {reportData.skillData && (
                  <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-6">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
                        능력치 분석
                      </h3>
                      <span className="text-[12px] text-it-ink-400 font-medium">5.0 만점</span>
                    </div>
                    <RadarChart data={reportData.skillData} isAnimated={isAnimated} iceTheme />
                  </section>
                )}

                {/* Stats Grid — SkillStatCard 자체 표면 소유. flat 섹션으로 감싸 갭 부여. */}
                {reportData.skillData && (
                  <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4 grid grid-cols-2 gap-3">
                    <SkillStatCard icon="ice_skating" label="스케이팅" score={reportData.skillData.skating} iceTheme />
                    <SkillStatCard icon="sports_hockey" label="슈팅" score={reportData.skillData.shooting} iceTheme />
                    <SkillStatCard icon="multiple_stop" label="패스" score={reportData.skillData.passing} iceTheme />
                    <SkillStatCard icon="sprint" label="민첩성" score={reportData.skillData.agility} iceTheme />
                    <div className="col-span-2">
                      <SkillStatCard
                        iceTheme
                        icon="groups"
                        label="팀워크"
                        score={reportData.skillData.teamwork}
                        highlight={reportData.skillData.teamwork >= 4.5 ? 'Top Tier' : undefined}
                      />
                    </div>
                  </section>
                )}

                {/* Coach Comment — flat 섹션 (공유 컴포넌트 내부 불변) */}
                {reportData.coachComment && (
                  <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                    <CoachCommentCard
                      iceTheme
                      content={reportData.coachComment.content}
                      date={reportData.coachComment.date}
                      onReply={() => navigate('/messages')}
                    />
                  </section>
                )}

                {/* No Skill Data — flat 섹션 (빈 상태) */}
                {!reportData.skillData && (
                  <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-8 flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-w-pill bg-it-fill dark:bg-it-blue-900 flex items-center justify-center">
                      <Icon name="bar_chart" className="text-2xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
                    </div>
                    <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center">
                      {MESSAGES.empty('기술 평가')}
                    </p>
                  </section>
                )}
              </>
            )}

            {/* ─── Class History Tab ──────────────────── */}
            {activeTab === 'history' && (
              <>
                {/* Class Timeline — flat 섹션 (타임라인 연결선은 의미 구조라 유지) */}
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-[9px] bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center">
                      <Icon name="school" className="text-it-blue-500 text-[18px]" aria-hidden="true" />
                    </div>
                    <h3 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
                      수업 이력
                    </h3>
                  </div>

                  {reportData.classHistory.length > 0 ? (
                    <div className="space-y-0">
                      {reportData.classHistory.map((item, index) => (
                        <div key={item.id} className="relative flex gap-3">
                          {/* Timeline Line */}
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                'w-3 h-3 rounded-w-pill shrink-0 mt-1.5',
                                item.status === 'ACTIVE'
                                  ? 'bg-success'
                                  : 'bg-it-line-strong dark:bg-rink-500'
                              )}
                            />
                            {index < reportData.classHistory.length - 1 && (
                              <div className="w-px flex-1 bg-it-line-strong dark:bg-rink-700 my-1" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 pb-4">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="text-[15px] font-bold text-it-ink-900 dark:text-white">
                                {item.className}
                              </h4>
                              <StatusBadge status={item.status} />
                            </div>
                            <p className="text-[12.5px] text-it-ink-500 dark:text-rink-300 tabular-nums">
                              {item.period}
                            </p>
                            <p className="text-[12.5px] text-it-ink-500 dark:text-rink-300 mt-0.5">
                              담당: {item.coach}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center py-4">
                      {MESSAGES.empty('수업 이력')}
                    </p>
                  )}
                </section>

                {/* Attendance Trend — flat 섹션 */}
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
                  <AttendanceBarChart data={reportData.attendance} isAnimated={isAnimated} />
                </section>
              </>
            )}

            {/* ─── Achievements Tab ───────────────────── */}
            {activeTab === 'achievements' && (
              <>
                {/* Tournament Records — flat 섹션 (행은 hairline 구분) */}
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-[9px] bg-it-blue-50 dark:bg-it-blue-500/15 flex items-center justify-center">
                      <Icon name="sports_score" className="text-it-blue-600 text-[18px]" aria-hidden="true" />
                    </div>
                    <h3 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
                      대회 참가 기록
                    </h3>
                  </div>

                  {reportData.tournaments.length > 0 ? (
                    <div className="space-y-3">
                      {reportData.tournaments.map((tournament) => (
                        <div
                          key={tournament.id}
                          className="flex items-center justify-between py-2 border-b border-it-line dark:border-rink-700 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[14.5px] font-bold text-it-ink-900 dark:text-white truncate">
                              {tournament.name}
                            </h4>
                            <p className="text-[12.5px] text-it-ink-500 dark:text-rink-300 mt-0.5 tabular-nums">
                              {tournament.date}
                            </p>
                          </div>
                          {tournament.placement && (
                            <span className="ml-3 px-2.5 py-1 rounded-[9px] bg-warning-500/10 dark:bg-warning-500/15 text-[12.5px] font-extrabold text-warning-600 shrink-0">
                              {tournament.placement}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center py-4">
                      {MESSAGES.empty('대회 기록')}
                    </p>
                  )}
                </section>

                {/* Badges Grid — flat 섹션 */}
                <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 sm:px-5 py-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-[9px] bg-warning-500/10 dark:bg-warning-500/15 flex items-center justify-center">
                      <Icon name="military_tech" className="text-warning-600 text-[18px]" aria-hidden="true" />
                    </div>
                    <h3 className="text-[15px] font-extrabold text-it-ink-900 dark:text-white">
                      뱃지 컬렉션
                    </h3>
                    {reportData.badges.length > 0 && (
                      <span className="ml-auto text-[12.5px] font-medium text-it-ink-500 dark:text-rink-300">
                        {reportData.badges.length}개
                      </span>
                    )}
                  </div>

                  {reportData.badges.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {reportData.badges.map((badge) => (
                        <div
                          key={badge.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-it-fill dark:bg-rink-700/50"
                        >
                          <div className="w-10 h-10 rounded-w-pill bg-warning-500/10 dark:bg-warning-500/15 flex items-center justify-center shrink-0">
                            <Icon
                              name={badge.icon}
                              className="text-warning-600 text-card-title"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-card-body font-semibold text-it-ink-900 dark:text-white truncate">
                              {badge.name}
                            </p>
                            <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                              {badge.earnedDate}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-card-body text-it-ink-500 dark:text-rink-300 text-center py-4">
                      {MESSAGES.empty('뱃지')}
                    </p>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
