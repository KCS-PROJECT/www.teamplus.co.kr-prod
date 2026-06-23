'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';
import { PATHS } from '@/lib/paths';

import { usePageReady } from '@/hooks/usePageReady';
/** 한국어 종목명 → 영문 매핑 */
const SPECIALTY_EN_MAP: Record<string, string> = {
  '피겨 스케이팅': 'Figure Skating',
  '스피드 스케이팅': 'Speed Skating',
  '쇼트트랙': 'Short Track',
  '아이스하키': 'Ice Hockey',
  '아이스 댄스': 'Ice Dance',
  '컬링': 'Curling',
};

interface CoachDetail {
  id: string;
  name: string;
  specialty: string;
  specialtyEn?: string;
  phone?: string;
  career?: string;
  weeklyClasses: number;
  weeklyHours: number;
  avatarUrl?: string | null;
  createdAt?: string;
  /**
   * userType==='COACH' 인 경우만 수정/삭제/수업 배정 가능.
   * 감독 본인(DIRECTOR) 등은 /admin/coaches 전용 API 대상이 아니라 액션을 숨긴다.
   */
  editable: boolean;
}

interface AssignedClass {
  id: string;
  name: string;
  schedule: string;
  students: number;
  status: 'active' | 'completed' | 'cancelled';
}

function getSpecialtyDisplay(coach: CoachDetail): string {
  const en = coach.specialtyEn || SPECIALTY_EN_MAP[coach.specialty] || '';
  return en ? `${coach.specialty} (${en})` : coach.specialty;
}

/** 전화번호 포맷 */
function formatPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** 날짜 포맷 */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  } catch {
    return dateStr;
  }
}

const CLASS_STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: '진행중', className: 'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400' },
  completed: { label: '완료', className: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100' },
  cancelled: { label: '취소됨', className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
};

export default function DirectorCoachDetailPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨
  const params = useParams();
  const coachId = params?.id as string;
  const { navigate, back } = useNavigation();
  const { toast } = useToast();

  const [coach, setCoach] = useState<CoachDetail | null>(null);
  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState(false);

  // 삭제 확인
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // [BUG FIX 2026-05-19 W3 #9] 감독 수정/수업 배정 후 코치 상세 페이지 오류 회귀 해결.
  //   원인: `/admin/coaches/:id` 는 admin 전용 권한 API → director 호출 시 403/401.
  //         또한 list 페이지(/director-coaches)는 `/teams/.../members` 의 TeamMember.id 를
  //         coach.id 로 사용하지만, `/admin/coaches/:id` 는 Coach 모델 ID 기대 → ID 불일치 404.
  //   해결: 다단계 fallback 패턴.
  //     1차: `/admin/coaches/:id` (기존, admin 권한일 때만 성공)
  //     2차: `/teams/my/managed` → 각 팀의 `/teams/:id/members?status=approved` 에서
  //          TeamMember.id 또는 user.id 매칭하여 데이터 구성. director 권한으로 항상 성공.
  const loadCoachDetail = useCallback(async () => {
    if (!coachId) return;
    setIsLoading(true);
    setError(false);
    try {
      // 1차 시도: admin 권한 endpoint (기존 호환성 유지)
      const res = await api.get<Record<string, unknown>>(`/admin/coaches/${coachId}`);
      if (res.success && res.data) {
        const d = res.data;
        const user = (d.user ?? d) as Record<string, unknown>;
        const note = typeof user.note === 'string' ? (() => { try { return JSON.parse(user.note as string); } catch { return {}; } })() : {};

        setCoach({
          id: (d.id ?? user.id ?? '') as string,
          name: (user.name as string) ?? (`${(user.lastName as string) ?? ''}${(user.firstName as string) ?? ''}`.trim() || '코치'),
          specialty: (d.specialty as string) ?? ((note.specialty as string) ?? '아이스하키'),
          specialtyEn: (d.specialtyEn as string) ?? undefined,
          phone: (d.phone as string) ?? (user.phone as string) ?? undefined,
          career: (d.career as string) ?? (note.career as string) ?? undefined,
          weeklyClasses: (d.weeklyClasses as number) ?? 0,
          weeklyHours: (d.weeklyHours as number) ?? 0,
          avatarUrl: (d.avatarUrl as string) ?? (user.avatarUrl as string) ?? null,
          createdAt: (d.createdAt as string) ?? (user.createdAt as string) ?? undefined,
          // getCoach 는 COACH 만 반환하지만 명시적으로 userType 확인
          editable: ((d.userType ?? user.userType) as string) === 'COACH',
        });

        // 배정된 수업 목록
        const rawClasses = (d.classes ?? d.assignedClasses ?? []) as Record<string, unknown>[];
        if (Array.isArray(rawClasses)) {
          setClasses(rawClasses.map((c) => ({
            id: (c.id as string) ?? '',
            name: (c.name as string) ?? (c.title as string) ?? '수업',
            schedule: (c.schedule as string) ?? (c.time as string) ?? '',
            students: (c.studentCount as number) ?? (c.students as number) ?? 0,
            status: ((c.status as string) ?? 'active') as 'active' | 'completed' | 'cancelled',
          })));
        }
        setIsLoading(false);
        return; // 성공 — 종료
      }

      // 2차 폴백: director 권한 사용 가능한 `/teams/my/managed` → members 매칭.
      type FallbackMemberRow = {
        id: string;
        roleInTeam?: string | null;
        playerName?: string;
        joinedAt?: string;
        user?: {
          id?: string;
          email?: string;
          phone?: string;
          firstName?: string;
          lastName?: string;
          name?: string;
          avatarUrl?: string;
          note?: string;
          createdAt?: string;
          userType?: string;
        };
      };
      const teamsRes = await api.get<Array<{ id: string; name?: string }>>('/teams/my/managed');
      if (teamsRes.success && Array.isArray(teamsRes.data)) {
        let matched: FallbackMemberRow | null = null;
        for (const t of teamsRes.data) {
          const mr = await api.get<
            FallbackMemberRow[] | { members?: FallbackMemberRow[]; data?: FallbackMemberRow[] }
          >(`/teams/${t.id}/members`, { params: { status: 'approved' } });
          if (!mr.success || !mr.data) continue;
          const list: FallbackMemberRow[] = Array.isArray(mr.data)
            ? mr.data
            : Array.isArray((mr.data as { members?: FallbackMemberRow[] }).members)
              ? (mr.data as { members: FallbackMemberRow[] }).members
              : Array.isArray((mr.data as { data?: FallbackMemberRow[] }).data)
                ? (mr.data as { data: FallbackMemberRow[] }).data
                : [];
          const hit = list.find((m) => m.id === coachId || m.user?.id === coachId);
          if (hit) {
            matched = hit;
            break;
          }
        }
        if (matched) {
          const u = matched.user ?? {};
          const note = typeof u.note === 'string'
            ? (() => { try { return JSON.parse(u.note as string); } catch { return {}; } })()
            : {};
          setCoach({
            id: matched.id,
            name:
              (u.name ??
                matched.playerName ??
                `${u.lastName ?? ''}${u.firstName ?? ''}`.trim()) ||
              '코치',
            specialty: (note.specialty as string) ?? '아이스하키',
            specialtyEn: undefined,
            phone: u.phone,
            career: (note.career as string) ?? undefined,
            weeklyClasses: 0,
            weeklyHours: 0,
            avatarUrl: u.avatarUrl ?? null,
            createdAt: u.createdAt,
            // 폴백 경로 — 감독 본인(DIRECTOR) 등은 COACH 가 아니므로 수정/삭제 불가
            editable: u.userType === 'COACH',
          });
          setClasses([]); // 폴백 시 수업 정보 별도 endpoint 필요 — 비활성 처리
          setIsLoading(false);
          return;
        }
      }

      setError(true);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [coachId]);

  useEffect(() => {
    void loadCoachDetail();
  }, [loadCoachDetail]);

  /** 코치 삭제 */
  const handleDelete = useCallback(async () => {
    if (!coachId || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/admin/coaches/${coachId}`);
      if (res.success) {
        toast.success(MESSAGES.delete.success);
        navigate('/director-coaches');
      } else {
        toast.error(MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [coachId, isDeleting, navigate, toast]);

  // 로딩 상태
  if (isLoading) return null;

  // 에러 상태
  if (error || !coach) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="코치 상세" onBack={back} forceNative />
        <main className="flex-1 flex flex-col items-center justify-center px-6" role="main" aria-label="코치 상세">
          <div className="w-16 h-16 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
          </div>
          <p className="text-card-body text-wtext-3 dark:text-rink-300 mb-4">{MESSAGES.error.general}</p>
          <button
            type="button"
            onClick={loadCoachDetail}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ice-500 px-5 py-2.5 text-card-body font-bold text-white shadow-sm hover:bg-ice-700 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            <Icon name="refresh" className="text-[18px]" aria-hidden="true" />
            <span>다시 시도하기</span>
          </button>
        </main>
      </MobileContainer>
    );
  }

  const initial = coach.name?.charAt(0) || '?';

  return (
    <MobileContainer hasBottomNav>
      {/* [appbar-harness-v4 · 2026-05-12] rightAction → extraActions 변환:
          시계/종/메뉴 우측 3 액션 SoT 보존하면서 수정/삭제 액션 추가. */}
      <PageAppBar
        title="코치 상세"
        onBack={back}
        forceNative
        extraActions={
          coach.editable
            ? [
                {
                  icon: "edit",
                  onClick: () => navigate(`/director-coaches/${coachId}/edit`),
                  label: "수정",
                },
                {
                  icon: "delete",
                  onClick: () => setShowDeleteConfirm(true),
                  label: "삭제",
                  className: "text-red-500 dark:text-red-400",
                },
              ]
            : []
        }
      />

      <main className="flex-1 overflow-y-auto hide-scrollbar" role="main" aria-label="코치 상세">
        {/* 프로필 헤더 */}
        <div className="flex flex-col items-center px-6 pt-8 pb-6">
          <div className="relative size-24 overflow-hidden rounded-2xl bg-wline-2 dark:bg-rink-700 shadow-sm flex items-center justify-center">
            {resolveImageSrc(coach.avatarUrl) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resolveImageSrc(coach.avatarUrl)}
                alt={`${coach.name} 코치`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-4xl font-bold text-ice-500/40">
                {initial}
              </span>
            )}
          </div>

          <h2 className="mt-4 text-xl font-bold text-wtext-1 dark:text-white">{coach.name}</h2>

          <div className="flex items-center gap-2 mt-2">
            <p className="text-card-body text-wtext-3 dark:text-rink-300">{getSpecialtyDisplay(coach)}</p>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="px-6 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <Icon name="school" className="text-[18px] text-ice-500" aria-hidden="true" />
                </div>
                <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">배정된 수업</span>
              </div>
              <span className="text-2xl font-bold text-wtext-1 dark:text-white tabular-nums">
                {coach.weeklyClasses}
                <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300 ml-1">개</span>
              </span>
            </div>
            <div className="rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-900/20">
                  <Icon name="schedule" className="text-[18px] text-orange-500" aria-hidden="true" />
                </div>
                <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">주간 시간</span>
              </div>
              <span className="text-2xl font-bold text-wtext-1 dark:text-white tabular-nums">
                {coach.weeklyHours}
                <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300 ml-1">시간</span>
              </span>
            </div>
          </div>
        </div>

        {/* 상세 정보 */}
        <div className="px-6 mb-6">
          <h3 className="text-card-body font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-tight mb-3">
            상세 정보
          </h3>
          <div className="rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-card divide-y divide-slate-100 dark:divide-slate-700">
            {/* 연락처 */}
            {coach.phone && (
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-wbg dark:bg-rink-700">
                  <Icon name="phone" className="text-[18px] text-wtext-3 dark:text-rink-300" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-card-meta text-wtext-3 dark:text-rink-300">연락처</span>
                  <p className="text-card-body font-medium text-wtext-1 dark:text-white">{formatPhone(coach.phone)}</p>
                </div>
              </div>
            )}

            {/* 등록일 */}
            {coach.createdAt && (
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-wbg dark:bg-rink-700">
                  <Icon name="event" className="text-[18px] text-wtext-3 dark:text-rink-300" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-card-meta text-wtext-3 dark:text-rink-300">등록일</span>
                  <p className="text-card-body font-medium text-wtext-1 dark:text-white">{formatDate(coach.createdAt)}</p>
                </div>
              </div>
            )}

            {/* 약력 */}
            {coach.career && (
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-wbg dark:bg-rink-700 mt-0.5">
                  <Icon name="workspace_premium" className="text-[18px] text-wtext-3 dark:text-rink-300" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-card-meta text-wtext-3 dark:text-rink-300">약력 및 수상</span>
                  <p className="text-card-body font-medium text-wtext-1 dark:text-white whitespace-pre-line mt-0.5">{coach.career}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 담당 수업 목록 */}
        <div className="px-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-card-body font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-tight">
              담당 수업
              {classes.length > 0 && (
                <span className="ml-2 text-ice-500">{classes.length}</span>
              )}
            </h3>
            {coach.editable && (
              <button
                type="button"
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 py-2 text-card-meta font-bold text-ice-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors motion-reduce:transition-none active:brightness-95"
                aria-label="수업 배정하기"
                // /director-coaches/:id/assign-class 수업 배정 전용 페이지로 이동 (PATHS.coaches.assignClass).
                onClick={() => navigate(PATHS.coaches.assignClass(coachId))}
              >
                <Icon name="add_task" className="text-[16px]" aria-hidden="true" />
                <span>수업 배정</span>
              </button>
            )}
          </div>

          {classes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 rounded-2xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-card">
              <div className="w-12 h-12 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center mb-3">
                <Icon name="school" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
              </div>
              <p className="text-card-body text-wtext-3 dark:text-rink-300">{MESSAGES.empty('수업')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {classes.map((cls) => {
                const statusInfo = CLASS_STATUS_MAP[cls.status] ?? CLASS_STATUS_MAP.active;
                return (
                  <div
                    key={cls.id}
                    className="flex items-center gap-3 rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-4 shadow-card"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      <Icon name="sports_hockey" className="text-[20px] text-ice-500" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-card-body font-bold text-wtext-1 dark:text-white truncate">{cls.name}</h4>
                        <span className={`shrink-0 inline-flex items-center rounded-md px-1.5 py-0.5 text-card-meta font-bold ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {cls.schedule && (
                          <span className="text-card-meta text-wtext-3 dark:text-rink-300">{cls.schedule}</span>
                        )}
                        <span className="text-card-meta text-wtext-3 dark:text-rink-300">
                          {cls.students}명
                        </span>
                      </div>
                    </div>
                    <Icon name="chevron_right" className="text-[20px] text-wtext-4 dark:text-rink-500 shrink-0" aria-hidden="true" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 하단 액션 버튼 — 수정 / 삭제 (코치 계정만, 감독 본인 등 제외) */}
        {coach.editable && (
          <div className="px-6 mb-8 flex gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 py-3.5 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95"
            >
              <Icon name="delete" className="text-[20px]" aria-hidden="true" />
              <span>삭제하기</span>
            </button>
            <NavLink
              href={`/director-coaches/${coachId}/edit`}
              className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-ice-500 py-3.5 text-card-emphasis font-bold text-white shadow-sm hover:bg-ice-700 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              <Icon name="edit" className="text-[20px]" aria-hidden="true" />
              <span>{MESSAGES.common.edit}</span>
            </NavLink>
          </div>
        )}

      </main>

      {/* 삭제 확인 시트 */}
      <ConfirmSheet
        open={showDeleteConfirm}
        title={MESSAGES.delete.confirm}
        description={`${coach.name} 코치를 삭제하면 배정된 수업 정보도 함께 해제됩니다.`}
        confirmLabel="삭제하기"
        cancelLabel="취소"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </MobileContainer>
  );
}
