'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useClassForm } from '@/hooks/useClassForm';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { getDashboardPathByUserType } from '@/lib/auth-routing';

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

interface ClassDetailApiResponse {
  id: string;
  /** 팀(클럽) ID — regular 수업 */
  teamId?: string;
  /** 아카데미 ID — 오픈클래스 수업 */
  academyId?: string;
  /** @deprecated clubId 대신 teamId 사용 권장 (백엔드 SoT) */
  clubId?: string;
  className?: string;
  name?: string;
  description?: string;
  trainingType?: string;
  instructorName?: string;
  coachName?: string;
  coachId?: string;
  capacity?: number;
  currentEnrollment?: number;
  waitlistCount?: number;
  ageMin?: number;
  ageMax?: number;
  levelRequired?: string;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
  /** 승인 상태 — 일정 관리 CTA 가시성 판정에 사용 */
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  category?: string;
  classDays?: string[];
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  venueLatitude?: number;
  venueLongitude?: number;
  venue?: string;
  venueSub?: string;
  price?: number;
  programCategory?: string;
  products?: Array<{
    id: string;
    productName: string;
    price: number;
    sessionsPerMonth: number;
    feeType?: string;
  }>;
  enrollments?: Array<{
    id: string;
    status: string;
    userName: string;
    userId?: string;
  }>;
  schedules?: Array<{
    id: string;
    scheduledDate: string;
    isCancelled: boolean;
  }>;
  /** 백엔드 Team 객체 맵핑 (id, name) */
  club?: { id: string; name: string };
}

interface EnrollmentStudent {
  id: string;
  childName?: string;
  memberName?: string;
  userName?: string;
  teamName?: string;
  status?: string;
}

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  ACTIVE: {
    label: '활성',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
  CANCELLED: {
    label: '취소',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  },
  COMPLETED: {
    label: '완료',
    className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
  },
};

// [추가 2026-05-11] 요일 표기 한글 통일 + 월요일 시작 정렬.
const DAY_NORMALIZE_MAP: Record<string, string> = {
  '일': '일', '월': '월', '화': '화', '수': '수', '목': '목', '금': '금', '토': '토',
  SUN: '일', SUNDAY: '일', MON: '월', MONDAY: '월',
  TUE: '화', TUES: '화', TUESDAY: '화', WED: '수', WEDNESDAY: '수',
  THU: '목', THUR: '목', THURSDAY: '목', FRI: '금', FRIDAY: '금',
  SAT: '토', SATURDAY: '토',
};
const DAY_ORDER_MON_FIRST: Record<string, number> = {
  '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5, '일': 6,
};
function normalizeClassDays(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const koreans = input
    .map((d) => {
      const t = String(d ?? '').trim();
      return DAY_NORMALIZE_MAP[t] ?? DAY_NORMALIZE_MAP[t.toUpperCase()] ?? '';
    })
    .filter((d): d is string => Boolean(d));
  const uniq = Array.from(new Set(koreans));
  uniq.sort((a, b) => (DAY_ORDER_MON_FIRST[a] ?? 99) - (DAY_ORDER_MON_FIRST[b] ?? 99));
  return uniq;
}

function formatDate(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function countClassDays(startIso?: string, endIso?: string, days?: string[]): number {
  if (!startIso || !endIso || !days || days.length === 0) return 0;
  const dayMap: Record<string, number> = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
  const targetDays = new Set(days.map(d => dayMap[d]).filter(v => v !== undefined));
  const start = new Date(startIso);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endIso);
  end.setHours(0, 0, 0, 0);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    if (targetDays.has(cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatPrice(price?: number): string {
  if (!price && price !== 0) return '-';
  return `${price.toLocaleString('ko-KR')}`;
}

function getInitial(name?: string): string {
  if (!name) return '?';
  return name.charAt(0);
}

function getInitialColor(name?: string): string {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
    'bg-rose-500', 'bg-violet-500', 'bg-cyan-500',
    'bg-orange-500', 'bg-teal-500',
  ];
  if (!name) return colors[0];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

function getCategoryLabel(data: ClassDetailApiResponse): string {
  const type = data.trainingType ?? data.programCategory ?? '';
  const map: Record<string, string> = {
    lesson: '레슨',
    regular_training: '정규훈련',
    regular_class: '정규수업',
    group_class: '그룹수업',
    game: '게임',
    fun: '펀',
    camp: '캠프',
  };
  return map[type] ?? '프로그램 카테고리';
}

/* ────────────────────────────────────────────
   Page Component
   ──────────────────────────────────────────── */

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params?.id as string;
  const { back, navigate } = useNavigation();
  const { deleteClass, isDeleting } = useClassForm({ mode: 'edit', classId });

  const [classData, setClassData] = useState<ClassDetailApiResponse | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentStudent[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const { toast } = useToast();
  const { user } = useSessionAuth();

  usePageReady(!isFetching);

  // [hotfix 2026-05-14 C3] Flutter Native AppBar 는 이 경로에서 "새로고침" 버튼만
  //   노출하여 TEAMPLUS 표준 3액션(타임라인/알림/메뉴) 이 모두 누락됨.
  //   Native AppBar 를 끄고 Web PageAppBar(forceNative) 로 단일화하여 기본 3액션 복원.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    isDataLoaded: !isFetching,
  });

  const fetchClassDetail = useCallback(async () => {
    setIsFetching(true);
    setFetchError(false);
    try {
      // 공용 엔드포인트 `/classes/:classId` 로 직접 조회
      // — `/teams/managed/list` 의존 제거: 해당 API 일시 장애 시에도 상세 화면이 에러로 빠지지 않음
      // — classData.teamId 로 이후 handleToggleStatus 등 mutation 엔드포인트에서 teamId 추출
      const classRes = await api.get<ClassDetailApiResponse>(`/classes/${classId}`);

      if (classRes.success && classRes.data) {
        setClassData(classRes.data);
        if (Array.isArray(classRes.data.enrollments)) {
          setEnrollments(classRes.data.enrollments.map((e) => ({
            id: e.id,
            userName: e.userName ?? '',
            status: e.status ?? '',
          })));
        }
      } else if (classRes.error?.statusCode === 403) {
        // 비소속 매니저의 수업 수정 페이지 직접 접근 — BE 권한 게이트와 짝.
        toast.error(MESSAGES.class.accessDenied);
        const path = getDashboardPathByUserType(user?.userType) ?? '/';
        navigate(path);
        return;
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      setIsFetching(false);
    }
  }, [classId, navigate, toast, user?.userType]);

  useEffect(() => {
    if (classId) fetchClassDetail();
  }, [classId, fetchClassDetail]);

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    await deleteClass();
  };

  const handleToggleStatus = async () => {
    const clubId = classData?.clubId ?? classData?.club?.id;
    if (!clubId) {
      toast.error(MESSAGES.classesEdit.clubNotFound);
      return;
    }
    setIsTogglingStatus(true);
    try {
      const newStatus = !classData!.isActive;
      const res = await api.patch(`/teams/${clubId}/classes/${classId}/status`, { isActive: newStatus });
      if (res.success) {
        setClassData(prev => prev ? { ...prev, isActive: newStatus } : prev);
        toast.success(newStatus ? '수업이 활성화되었습니다.' : '수업이 비활성화되었습니다.');
      } else {
        toast.error(res.error?.message ?? MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  if (isFetching) return null;

  if (fetchError || !classData) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="모집관리" forceNative />
        <main className="flex-1 flex flex-col items-center justify-center px-5 py-16">
          <div className="w-14 h-14 rounded-w-pill bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-3" aria-hidden="true">
            <Icon name="error" className="text-2xl text-red-500 dark:text-red-400" />
          </div>
          <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium mb-4">
            {MESSAGES.error.general}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => back()}
              className="px-4 py-2 text-card-body font-medium text-wtext-2 dark:text-rink-100 bg-wline-2 dark:bg-rink-700 rounded-lg hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none"
            >
              뒤로 가기
            </button>
            <button
              type="button"
              onClick={fetchClassDetail}
              className="px-4 py-2 text-card-body font-medium text-ice-500 bg-ice-500/10 rounded-lg hover:bg-ice-500/20 transition-colors motion-reduce:transition-none"
            >
              {MESSAGES.dashboard.errorRetry}
            </button>
          </div>
        </main>
      </MobileContainer>
    );
  }

  const className = classData.className ?? classData.name ?? '-';
  const statusKey = classData.isActive ? 'ACTIVE' : 'COMPLETED';
  const status = STATUS_MAP[statusKey] ?? STATUS_MAP.ACTIVE;
  const capacity = classData.capacity ?? 0;
  const enrolledCount = classData.currentEnrollment ?? enrollments.length;
  const waitlistCount = classData.waitlistCount ?? Math.max(0, enrolledCount - capacity);
  const categoryLabel = getCategoryLabel(classData);
  const firstProduct = classData.products?.[0];
  const displayPrice = firstProduct?.price ?? classData.price;

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="모집관리" forceNative />

      {/* Main Content
          ──────────────────────────────────────────────────────────────────────
          [hotfix 2026-05-14 C2 v2] 본문 하단이 일정관리 CTA 와 Bottom Action Bar
          (BottomNav 위 fixed) 와 겹치던 이슈.

          MobileContainer 의 `[&>main]:pb-30` (120px) 셀렉터 specificity (0,1,1) 가
          페이지의 `pb-[calc(...)]` 유틸 (0,1,0) 을 덮어써서 실제 pb 가 120px 로 고정되는
          회귀가 있었음. 그 결과 main 끝(120px 위) ↔ Action Bar 상단(약 158px 위) 이
          22-30px 겹쳐 일정관리 버튼 위에 Action Bar 가 올라타는 현상 발생.

          → inline style 로 paddingBottom 을 지정해 specificity 우선순위 확보:
             60px (BottomNav) + safe-area-inset-bottom + 64px (Action Bar 약식) + 32px buffer.
             Web (safe-area=0): 60+0+64+32 = 156px,
             iPhone (safe-area≈34px): 60+34+64+32 = 190px,
             모두 Action Bar 상단(158-194px)을 안전하게 비켜갑니다. */}
      <main
        className="flex-1 overflow-y-auto hide-scrollbar"
        style={{
          WebkitOverflowScrolling: 'touch' as never,
          paddingBottom:
            'calc(60px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 96px)',
        }}
      >
        {/* ────────────────────────────────────────────
             [1] 수업 프로필 카드 (Hero)
             ──────────────────────────────────────────── */}
        <section className="mx-5 mt-5 bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700">
          {/* 카테고리 + 상태 토글 */}
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center text-card-meta font-bold tracking-wider uppercase text-ice-500 bg-ice-500/10 px-2 py-1 rounded-md">
              {categoryLabel}
            </span>
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
              aria-label={classData.isActive ? '수업 비활성화' : '수업 활성화'}
              aria-live="polite"
              className={cn(
                'text-card-meta font-bold px-3 py-1 rounded-w-pill transition-colors motion-reduce:transition-none',
                status.className,
                !isTogglingStatus && 'cursor-pointer hover:opacity-80 active:brightness-95',
              )}
            >
              {isTogglingStatus ? '변경 중...' : status.label}
            </button>
          </div>

          {/* 제목 */}
          <h1 className="text-2xl font-bold text-wtext-1 dark:text-white leading-tight mb-4">
            {className}
          </h1>

          {/* 담당 코치 — 제목 바로 아래 이동 */}
          <div className="flex items-center gap-2.5 pb-4 border-b border-wline-2 dark:border-rink-700">
            <div
              className={cn(
                'w-9 h-9 rounded-w-pill flex items-center justify-center shrink-0',
                getInitialColor(classData.instructorName ?? classData.coachName),
              )}
              aria-hidden="true"
            >
              <span className="text-card-body font-bold text-white">
                {getInitial(classData.instructorName ?? classData.coachName)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-card-body font-semibold text-wtext-1 dark:text-rink-100 truncate">
                {classData.instructorName ?? classData.coachName ?? '담당 코치 미지정'}
              </p>
              <p className="text-card-meta text-wtext-3 dark:text-rink-300">담당 코치</p>
            </div>
          </div>

          {/* 메타 3열 요약 (회차 · 정원 · 대기) */}
          <dl className="grid grid-cols-3 gap-3 pt-5">
            <MetaCell
              label="회차"
              value={(() => {
                const total = countClassDays(classData.startTime, classData.endTime, classData.classDays);
                return total > 0 ? `${total}회` : '-';
              })()}
            />
            <MetaCell
              label="정원"
              value={`${capacity}/${enrolledCount}`}
              emphasis={enrolledCount >= capacity ? 'warn' : undefined}
            />
            <MetaCell
              label="대기"
              value={`${waitlistCount}`}
              emphasis={waitlistCount > 0 ? 'info' : undefined}
            />
          </dl>
        </section>

        {/* ────────────────────────────────────────────
             [2] 일정 · 장소 카드
             ──────────────────────────────────────────── */}
        <section className="mx-5 mt-4 bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700">
          <h2 className="text-card-meta font-bold text-wtext-2 dark:text-rink-300 uppercase tracking-widest mb-4">
            일정 · 장소
          </h2>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* 일정 */}
            <div>
              <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 mb-1.5">날짜</p>
              <p className="text-card-body font-bold text-wtext-1 dark:text-white tabular-nums">
                {formatDate(classData.startTime)}
                {classData.endTime && formatDate(classData.startTime) !== formatDate(classData.endTime)
                  ? ` ~ ${formatDate(classData.endTime)}`
                  : ''}
              </p>
              <p className="text-card-body text-wtext-2 dark:text-rink-300 mt-0.5 tabular-nums">
                {formatTime(classData.startTime)}
                {classData.endTime ? ` ~ ${formatTime(classData.endTime)}` : ''}
              </p>
              {(() => {
                // [수정 2026-05-11] 요일 한글 통일 + 월요일 시작 정렬.
                const days = normalizeClassDays(classData.classDays);
                if (days.length === 0) return null;
                return (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {days.map((d) => (
                      <span
                        key={d}
                        className="text-card-meta font-bold px-2 py-0.5 rounded bg-ice-500/10 text-ice-500"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* 장소 */}
            {(() => {
              const venueLabel = classData.venueName ?? classData.venue ?? null;
              const venueAddress = classData.venueAddress ?? classData.venueSub ?? null;
              const hasVenue = !!venueLabel;
              return (
                <div>
                  <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 mb-2">장소</p>
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        hasVenue
                          ? 'bg-ice-500/10'
                          : 'bg-wline-2 dark:bg-rink-700',
                      )}
                      aria-hidden="true"
                    >
                      <Icon
                        name="location_on"
                        className={cn(
                          'text-card-section',
                          hasVenue ? 'text-ice-500' : 'text-wtext-3 dark:text-rink-300',
                        )}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p
                        className={cn(
                          'text-card-emphasis font-bold truncate leading-tight',
                          hasVenue
                            ? 'text-wtext-1 dark:text-white'
                            : 'text-wtext-3 dark:text-rink-300',
                        )}
                      >
                        {venueLabel ?? '장소 미정'}
                      </p>
                      {venueAddress && (
                        <p className="mt-1 text-card-body text-wtext-3 dark:text-rink-300 break-keep leading-relaxed">
                          {venueAddress}
                        </p>
                      )}
                    </div>
                  </div>
                  {venueAddress && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(venueAddress);
                          toast.success(MESSAGES.classesEdit.addressCopied);
                        } catch {
                          toast.error(MESSAGES.classesEdit.addressCopyFailed);
                        }
                      }}
                      aria-label="장소 주소 복사"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-ice-500/5 hover:bg-ice-500/10 px-2.5 py-1.5 text-card-meta font-semibold text-ice-500 dark:text-blue-300 transition-colors motion-reduce:transition-none active:brightness-95"
                    >
                      <Icon name="content_copy" className="text-[14px]" aria-hidden="true" />
                      주소 복사
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 강의 설명 */}
          <div className="mt-5 pt-5 border-t border-wline-2 dark:border-rink-700">
            <p className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 mb-2">강의 설명</p>
            <p className="text-card-body text-wtext-2 dark:text-rink-100 leading-relaxed whitespace-pre-wrap">
              {classData.description || '등록된 설명이 없습니다.'}
            </p>
          </div>
        </section>

        {/* ────────────────────────────────────────────
             [3] 수강 현황 카드
             ──────────────────────────────────────────── */}
        <section className="mx-5 mt-4 bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">수강 현황</h2>
            <span
              className={cn(
                'text-card-meta font-bold px-3 py-1 rounded-w-pill tabular-nums',
                enrolledCount >= capacity
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                  : 'bg-ice-500/10 text-ice-500',
              )}
            >
              {enrolledCount} / {capacity}명
            </span>
          </div>

          {/* 진행 바 */}
          <div
            className="h-2 rounded-w-pill bg-wline-2 dark:bg-rink-700 overflow-hidden mb-5"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={capacity}
            aria-valuenow={Math.min(enrolledCount, capacity)}
            aria-label="수강 정원 진행률"
          >
            <div
              className={cn(
                'h-full transition-[width] duration-300 motion-reduce:transition-none',
                enrolledCount >= capacity ? 'bg-red-500' : 'bg-ice-500',
              )}
              style={{ width: `${Math.min(100, capacity > 0 ? (enrolledCount / capacity) * 100 : 0)}%` }}
            />
          </div>

          {/* 대기 */}
          {waitlistCount > 0 && (
            <div
              className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-900/10"
              role="status"
            >
              <span
                className="w-2 h-2 rounded-w-pill bg-amber-500"
                aria-hidden="true"
              />
              <p className="text-card-body font-medium text-amber-700 dark:text-amber-400">
                대기 인원 {waitlistCount}명
              </p>
            </div>
          )}

          {/* 학생 리스트 (최대 5명) */}
          {enrollments.length > 0 ? (
            <ul
              className="flex flex-col gap-2 mb-4 list-none"
              role="list"
              aria-label={`등록 학생 미리보기 ${Math.min(enrollments.length, 5)}명`}
            >
              {enrollments.slice(0, 5).map((student) => {
                const name = student.userName ?? student.childName ?? student.memberName ?? '-';
                const statusLabel = student.status === 'paid' ? '등록 완료' : student.status ?? '';
                return (
                  <li
                    key={student.id}
                    role="listitem"
                    aria-label={`${name}${student.teamName ? `, ${student.teamName}` : ''}${statusLabel ? `, ${statusLabel}` : ''}`}
                    className="flex items-center gap-3 p-3 bg-wbg dark:bg-rink-900/50 rounded-lg border border-wline-2 dark:border-rink-700"
                  >
                    <div
                      className={cn(
                        'w-9 h-9 rounded-w-pill flex items-center justify-center shrink-0',
                        getInitialColor(name),
                      )}
                      aria-hidden="true"
                    >
                      <span className="text-card-body font-bold text-white">{getInitial(name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-card-body font-semibold text-wtext-1 dark:text-rink-100 truncate">
                        {name}
                      </p>
                      {student.teamName && (
                        <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                          {student.teamName}
                        </p>
                      )}
                    </div>
                    <span
                      className="text-card-meta font-semibold text-emerald-600 dark:text-emerald-400 shrink-0"
                      aria-hidden="true"
                    >
                      {statusLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p
              className="text-card-body text-wtext-3 dark:text-rink-300 text-center py-6 mb-2"
              role="status"
            >
              {MESSAGES.empty('등록 학생')}
            </p>
          )}

          <button
            type="button"
            onClick={() => navigate(`/classes-manage/${classId}/roster`)}
            aria-label={`${className} 명단관리 — 배치/미배치 학생 보기`}
            className="w-full h-11 rounded-xl border border-wline dark:border-rink-700 text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none active:brightness-95 focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none"
          >
            명단 전체 보기
          </button>
        </section>

        {/* [4] 수강료 카드는 수업 수정 폼(/classes-manage/create?edit=ID, /academy-classes/edit/[id])
             에서 PackageManageSection 으로 관리. 본 모집관리 상세에서는 결제 현황만 노출. */}

        {/* ────────────────────────────────────────────
             [5] 장소 지도 (Maps key 있을 때만 · fallback 개선)
             ──────────────────────────────────────────── */}
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY && (classData.venueName || classData.venue) ? (
          <section className="mx-5 mt-4 rounded-2xl overflow-hidden border border-wline dark:border-rink-700">
            <div className="h-44 bg-wline-2 dark:bg-rink-800">
              <iframe
                title="훈련 장소 지도"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${encodeURIComponent(
                  classData.venueAddress ?? classData.venueName ?? classData.venue ?? '',
                )}`}
                allowFullScreen
              />
            </div>
            <div className="bg-white dark:bg-rink-800 px-4 py-3">
              <p className="text-card-body font-bold text-wtext-1 dark:text-rink-100 truncate">
                {classData.venueName ?? classData.venue}
              </p>
              {(classData.venueAddress ?? classData.venueSub) && (
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate mt-0.5">
                  {classData.venueAddress ?? classData.venueSub}
                </p>
              )}
            </div>
          </section>
        ) : (classData.venueAddress || classData.venueName || classData.venue) ? (
          <section className="mx-5 mt-4 bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700">
            <h2 className="text-card-meta font-bold text-wtext-2 dark:text-rink-300 uppercase tracking-widest mb-3">
              길찾기
            </h2>
            <p className="text-card-body font-bold text-wtext-1 dark:text-rink-100 mb-1">
              {classData.venueName ?? classData.venue}
            </p>
            {(classData.venueAddress ?? classData.venueSub) && (
              <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-3 break-keep">
                {classData.venueAddress ?? classData.venueSub}
              </p>
            )}
            <a
              href={`https://map.kakao.com/link/search/${encodeURIComponent(
                classData.venueAddress ?? classData.venueName ?? classData.venue ?? '',
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${classData.venueName ?? classData.venue} 위치를 카카오맵에서 새 창으로 길찾기`}
              className="inline-flex items-center justify-center w-full h-11 rounded-xl border border-ice-500 text-card-body font-semibold text-ice-500 dark:text-blue-300 dark:border-blue-400 hover:bg-ice-500/5 dark:hover:bg-blue-900/20 transition-colors motion-reduce:transition-none active:brightness-95 focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none"
            >
              카카오맵으로 길찾기
            </a>
          </section>
        ) : null}

        {/* ── 일정 관리 inline CTA — 본문 하단 ──
             Bottom Action Bar 의 [취소·수정·삭제] 와 역할 분리: 일정 관리는 CRUD 가 아닌
             네비게이션성 CTA 이므로 본문에 두어 시각적 우선순위를 낮춤.
             승인(APPROVED) 수업에만 노출 — 승인 대기·반려 수업에서는 스케줄 등록 자체가 불가하므로 숨김. */}
        {classData.approvalStatus === 'APPROVED' && (
          <div className="mx-5 mt-4 mb-4">
            <button
              type="button"
              onClick={() => navigate(`/classes-manage/${classId}/schedules`)}
              aria-label="수업 일정 관리 페이지로 이동"
              className="w-full h-12 rounded-xl border border-ice-500 text-card-body font-semibold text-ice-500 dark:text-blue-300 dark:border-blue-400 hover:bg-ice-500/5 dark:hover:bg-blue-900/20 transition-colors motion-reduce:transition-none active:brightness-95 flex items-center justify-center gap-2"
            >
              <Icon name="event" className="text-[18px]" aria-hidden="true" />
              {MESSAGES.class.scheduleManage}
            </button>
          </div>
        )}

      </main>

      {/* ────────────────────────────────────────────
           Bottom Action Bar — BottomNav 바로 위에 fixed 배치
           [A3 2026-05-26] 웹에서 버튼 박스가 MobileContainer 영역을 벗어나던 문제 보정.
             · 이전: `fixed left-1/2 -translate-x-1/2 + width:min(100%, shell)` — fixed 의
               100% 는 viewport 기준이라, safe-area-inset-left/right 가 있는 환경
               (노치 가로/폴더블) 에서 MobileContainer(좌우 safe-area 만큼 inset) 보다 넓어져
               컨테이너를 벗어남.
             · 수정: BottomNav(BottomNav.tsx:187) 와 100% 동일한 구조로 통일 —
               외부 `fixed left-0 right-0` + 좌우 safe-area padding,
               내부 `mx-auto width:min(100%, shell)` 바. → 모든 환경에서 폭·중심이
               MobileContainer·BottomNav 와 픽셀 단위로 일치.
           · (coach) layout 이 자동 렌더링하는 RoleBottomNav(fixed bottom-0 h-60px) 와 겹치지
             않도록 `bottom: calc(60px + safe-area-inset-bottom)` 로 BottomNav 위에 위치
           · z-30 — 본문 스크롤 콘텐츠 위 레이어 (BottomNav z-40 과는 위치상 겹치지 않음)
           · 3버튼 CTA: 취소(뒤로) · 수정하기 · 삭제(icon-only)
           [hotfix 2026-05-14 C2] 사이즈 축소: px-4 py-2.5 + h-11 → 약 65px (일정관리 CTA 여유 확보).
           ──────────────────────────────────────────── */}
      <div
        className="fixed left-0 right-0 z-30"
        style={{
          bottom: 'calc(60px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
          paddingLeft: 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))',
          paddingRight: 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* 내부 바 — bg/border 를 내부에 두어 폭이 MobileContainer·BottomNav 와 정확히 일치 */}
        <div
          className="mx-auto border-t border-wline dark:border-rink-700 bg-white dark:bg-rink-900"
          style={{ width: 'min(100%, var(--mobile-shell-width, 448px))' }}
        >
          <div className="flex min-w-0 gap-2 px-4 py-2.5">
            <button
              type="button"
              onClick={() => back()}
              aria-label="뒤로 가기"
              className="min-w-0 flex-1 h-11 rounded-xl border border-wline dark:border-rink-700 text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => navigate(`/classes-manage/create?edit=${classId}`)}
              aria-label="수업 수정"
              className="min-w-0 flex-[1.3] h-11 rounded-xl bg-ice-500 hover:bg-ice-700 text-card-body font-semibold text-white transition-colors motion-reduce:transition-none active:brightness-95"
            >
              수정하기
            </button>
            <button
              type="button"
              // [수정 2026-05-11] 삭제 버튼 항상 활성화 — 확인 모달이 안전장치 역할.
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="수업 삭제"
              className="w-11 h-11 shrink-0 rounded-xl border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors motion-reduce:transition-none active:brightness-95 flex items-center justify-center"
            >
              <Icon name="delete_outline" className="text-[20px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          aria-describedby="delete-modal-desc"
        >
          <div className="bg-white dark:bg-rink-800 rounded-2xl w-full max-w-sm p-6 shadow-md">
            <div
              className="w-12 h-12 rounded-w-pill bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4"
              aria-hidden="true"
            >
              <Icon name="warning" className="text-2xl text-red-500 dark:text-red-400" aria-hidden="true" />
            </div>
            <h3
              id="delete-modal-title"
              className="text-card-title font-bold text-wtext-1 dark:text-white text-center mb-2"
            >
              수업 삭제
            </h3>
            <p
              id="delete-modal-desc"
              className="text-card-body text-wtext-3 dark:text-rink-300 text-center mb-6 leading-relaxed"
            >
              {MESSAGES.class.deleteConfirm}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                aria-label="수업 삭제 취소"
                className="flex-1 h-11 rounded-xl border border-wline dark:border-rink-700 text-card-body font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none active:brightness-95 focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                aria-label={isDeleting ? `${className} 수업 삭제 처리 중` : `${className} 수업 삭제하기`}
                aria-busy={isDeleting}
                className={cn(
                  'flex-1 h-11 rounded-xl text-card-body font-semibold text-white transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-red-500 focus:outline-none',
                  isDeleting
                    ? 'bg-red-300 dark:bg-red-900/50 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600 active:brightness-95',
                )}
              >
                {isDeleting ? '삭제 중...' : '삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}

/* ────────────────────────────────────────────
   MetaCell — 프로필 카드의 4열 메타 셀
   ──────────────────────────────────────────── */

function MetaCell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: 'warn' | 'info';
}) {
  const valueClass = cn(
    'text-xl font-extrabold tabular-nums truncate leading-tight',
    emphasis === 'warn' && 'text-red-600 dark:text-red-400',
    emphasis === 'info' && 'text-ice-500',
    !emphasis && 'text-wtext-1 dark:text-white',
  );
  return (
    <div className="min-w-0 text-center">
      <dt className="text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-widest mb-2">
        {label}
      </dt>
      <dd className={valueClass} title={value}>
        {value}
      </dd>
    </div>
  );
}
