'use client';

/**
 * /classes-manage/[id]/roster — 명단관리 (배치 / 미배치 분리)
 *
 * [신규 2026-05-13]
 *  - 상단: 해당 수업에 배치된(등록·결제 완료) 학생 명단
 *  - 하단: 미배치 학생 — 수업의 ageMin/ageMax 범위 내 팀 PLAYER (TEEN/CHILD) 중 미등록
 *  - 대상연령 미지정(전체) 시 팀 전체 PLAYER 노출
 *
 * 데이터 source:
 *  - GET /classes/:classId  (수업 + enrollments + ageMin/ageMax + teamId)
 *  - GET /teams/:teamId/members?status=approved  (팀 멤버 — PLAYER 필터)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { getDashboardPathByUserType } from '@/lib/auth-routing';
// [2026-05-18 BUG FIX] refresh-bus import 누락 회귀 — emitRefresh/REFRESH_KEYS/useRefreshSubscription
// 함수는 본 파일에서 14곳 호출되지만 import가 빠져 있어 TS2304 발생.
import { emitRefresh, REFRESH_KEYS, useRefreshSubscription } from '@/lib/refresh-bus';
// [2026-05-19 Step 6] 감독/코치 회차 조정 모달 — 배치 학생 행에서 직접 조정.
import { CreditAdjustModal } from '@/components/credit/CreditAdjustModal';

interface ClassDetail {
  id: string;
  className?: string;
  teamId?: string;
  capacity?: number;
  currentEnrollment?: number;
  ageMin?: number;
  ageMax?: number;
  enrollments?: Array<{
    id: string;
    status?: string;
    userName?: string;
    childName?: string;
    memberName?: string;
    userId?: string;
    childId?: string;
  }>;
}

interface TeamMember {
  id: string;
  playerName?: string;
  playerAge?: number;
  roleInTeam?: string;
  approvalStatus?: string;
  // [추가 2026-05-15 T06-F] 결제 미완료 학생 배치 차단을 위한 옵션 필드.
  //   백엔드(/teams/:teamId/members)가 응답에 추가하면 즉시 동작.
  //   미응답 fallback: 항상 배치 가능 (graceful degradation).
  hasUnpaidBalance?: boolean;
  hasOutstandingPayment?: boolean;
  paymentStatus?: 'paid' | 'unpaid' | 'pending' | string;
  user?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    userType?: string | null;
    koreanAge?: number | null;
  } | null;
}

/**
 * [hotfix 2026-05-15 T06-F] 미배치 학생의 결제 완료 여부 판단.
 * 백엔드 응답이 다양한 필드명으로 올 수 있어 여러 키를 OR 검사한다.
 * 모든 필드가 undefined 면 "정보 없음"으로 보고 배치 허용 (현재 동작 유지).
 */
function isUnpaid(m: TeamMember): boolean {
  if (m.hasUnpaidBalance === true) return true;
  if (m.hasOutstandingPayment === true) return true;
  if (typeof m.paymentStatus === 'string') {
    const s = m.paymentStatus.toLowerCase();
    if (s === 'unpaid' || s === 'pending') return true;
  }
  return false;
}

interface MembersResponse {
  total?: number;
  members?: TeamMember[];
}

function getInitial(name: string): string {
  return (name?.trim().charAt(0) ?? '?').toUpperCase();
}

function getInitialColor(name: string): string {
  const colors = [
    'bg-ice-500',
    'bg-mint',
    'bg-flame',
    'bg-sun-500',
    'bg-rose-500',
    'bg-indigo-500',
  ];
  const code = (name ?? '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return colors[code % colors.length];
}

export default function RosterPage() {
  const params = useParams();
  const classId = params?.id as string;
  const { back, navigate } = useNavigation();
  const { toast } = useToast();
  const { user } = useSessionAuth();

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // [추가 2026-05-13] 배치/해제 진행 중 user id (중복 클릭 차단)
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);
  // [추가 2026-05-19 Step 6] 회차 조정 모달 대상 — null 이면 모달 닫힘.
  const [adjustTarget, setAdjustTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  usePageReady(!isLoading);
  // [hotfix 2026-05-14 C4] Flutter Native AppBar 가 이 경로에서 "새로고침" 버튼만 노출하여
  //   TEAMPLUS 표준 3액션(타임라인/알림/메뉴) 누락. Native AppBar 끄고 Web PageAppBar(forceNative)
  //   로 일원화하여 기본 3액션 복원. (schedules 페이지와 동일 패턴)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    isDataLoaded: !isLoading,
  });

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const classRes = await api.get<ClassDetail>(`/classes/${classId}`);
      if (!classRes.success || !classRes.data) {
        if (classRes.error?.statusCode === 403) {
          // 비소속 매니저의 명단 관리 페이지 직접 접근 차단.
          toast.error(MESSAGES.class.accessDenied);
          const path = getDashboardPathByUserType(user?.userType) ?? '/';
          navigate(path);
          return;
        }
        setError(MESSAGES.error.general);
        return;
      }
      setClassData(classRes.data);

      const teamId = classRes.data.teamId;
      if (teamId) {
        const memRes = await api.get<MembersResponse | TeamMember[]>(
          `/teams/${teamId}/members`,
          { params: { status: 'approved' } },
        );
        if (memRes.success && memRes.data) {
          const list: TeamMember[] = Array.isArray(memRes.data)
            ? memRes.data
            : Array.isArray((memRes.data as MembersResponse).members)
              ? (memRes.data as MembersResponse).members!
              : [];
          setTeamMembers(list);
        }
      }
    } catch {
      setError(MESSAGES.error.general);
    } finally {
      setIsLoading(false);
    }
  }, [classId, navigate, toast, user?.userType]);

  useEffect(() => {
    if (classId) void load();
  }, [classId, load]);

  // [추가 T07-F 2026-05-15] 다른 페이지/소켓이 roster/classes 변경 신호 발화 시 본 페이지 갱신.
  //   결제 완료(emitRefresh(PAYMENTS) → team-roster 영향) · 학생 승인 등 외부 트리거 대응.
  useRefreshSubscription(REFRESH_KEYS.ROSTER, () => {
    if (classId) void load();
  });

  /**
   * [추가 2026-05-13] 학생을 수업에 배치 — POST /classes/:classId/registrations
   */
  const handleAssign = useCallback(
    async (userId: string, name: string) => {
      if (!classId || mutatingUserId) return;
      setMutatingUserId(userId);
      try {
        const res = await api.post<{ success: boolean }>(
          `/classes/${classId}/registrations`,
          { userId },
        );
        if (res.success) {
          toast.success(`${name} 학생을 배치했습니다.`);
          await load();
          // [추가 T07-F 2026-05-15 ↔ T02] 명단 변경 → 연관 cache invalidate 신호.
          //   - team-roster / team-groups / team-eligible-members: T02 backend 협업 키
          //   - classes / attendance: 수업 상세/출석 명단도 동기화
          if (classData?.teamId) {
            emitRefresh(['team-roster', classData.teamId]);
            emitRefresh(['team-groups', classData.teamId]);
            emitRefresh(['team-eligible-members', classData.teamId]);
          }
          emitRefresh(REFRESH_KEYS.CLASSES);
          emitRefresh(REFRESH_KEYS.ROSTER);
        } else {
          toast.error(res.error?.message ?? MESSAGES.error.general);
        }
      } catch {
        toast.error(MESSAGES.error.general);
      } finally {
        setMutatingUserId(null);
      }
    },
    [classId, classData?.teamId, mutatingUserId, toast, load],
  );

  /**
   * [추가 2026-05-13] 학생 배치 해제 — DELETE /classes/:classId/registrations/:userId
   */
  const handleUnassign = useCallback(
    async (userId: string, name: string) => {
      if (!classId || !userId || mutatingUserId) return;
      setMutatingUserId(userId);
      try {
        const res = await api.delete<{ success: boolean }>(
          `/classes/${classId}/registrations/${userId}`,
        );
        if (res.success) {
          toast.success(`${name} 학생 배치를 해제했습니다.`);
          await load();
          // [추가 T07-F 2026-05-15 ↔ T02] 배치 해제도 동일 invalidation.
          if (classData?.teamId) {
            emitRefresh(['team-roster', classData.teamId]);
            emitRefresh(['team-groups', classData.teamId]);
            emitRefresh(['team-eligible-members', classData.teamId]);
          }
          emitRefresh(REFRESH_KEYS.CLASSES);
          emitRefresh(REFRESH_KEYS.ROSTER);
        } else {
          toast.error(res.error?.message ?? MESSAGES.error.general);
        }
      } catch {
        toast.error(MESSAGES.error.general);
      } finally {
        setMutatingUserId(null);
      }
    },
    [classId, classData?.teamId, mutatingUserId, toast, load],
  );

  // 등록 학생 (배치) — enrollments 의 userId/childId 집합
  const enrolledIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of classData?.enrollments ?? []) {
      if (e.userId) s.add(e.userId);
      if (e.childId) s.add(e.childId);
    }
    return s;
  }, [classData]);

  // 대상연령 범위 (미지정 = 전체) — header summary 표기용으로만 사용.
  //  [수정 2026-05-13] 미배치 필터 ageRange 제거 — inAgeRange 헬퍼 폐기.
  const ageMin = classData?.ageMin ?? null;
  const ageMax = classData?.ageMax ?? null;

  // 팀 학생 (PLAYER) — TEEN/CHILD 또는 roleInTeam PLAYER
  const teamPlayers = useMemo(() => {
    return teamMembers.filter((m) => {
      const role = (m.roleInTeam ?? '').toUpperCase();
      const ut = (m.user?.userType ?? '').toUpperCase();
      return (
        role === 'PLAYER' ||
        role === 'MEMBER' ||
        ut === 'TEEN' ||
        ut === 'CHILD'
      );
    });
  }, [teamMembers]);

  // 배치된 학생 — 등록 정보 우선, 없으면 팀 멤버 매칭
  //  [수정 2026-05-13] userId 보존 — 배치 해제 API 호출 시 필요.
  const placedStudents = useMemo(() => {
    return (classData?.enrollments ?? []).map((e) => ({
      key: e.id,
      userId: e.userId ?? e.childId ?? '',
      name:
        e.userName ??
        e.childName ??
        e.memberName ??
        '-',
      status: e.status ?? 'paid',
    }));
  }, [classData]);

  // 미배치 학생 — 팀 PLAYER 중 이 수업에 등록되지 않은 전원.
  //  [수정 2026-05-13] ageRange 필터 제거 — 사용자 요청: 연령 무관, 배치 안 된 나머지 학생 모두 노출.
  //  자동 배치(연령 매칭)는 backend 수업 수정 시점에 처리되고, 명단관리 화면에서는
  //  코치가 임의로 추가 배치할 수 있도록 미배치 풀을 전부 보여준다.
  const unplacedStudents = useMemo(() => {
    return teamPlayers.filter((m) => {
      const userId = m.user?.id;
      const memberId = m.id;
      if (userId && enrolledIds.has(userId)) return false;
      if (memberId && enrolledIds.has(memberId)) return false;
      return true;
    });
  }, [teamPlayers, enrolledIds]);

  const className = classData?.className ?? '수업';
  const ageRangeLabel =
    ageMin == null && ageMax == null
      ? '전체 연령'
      : ageMin != null && ageMax != null
        ? `${ageMin}~${ageMax}세`
        : ageMin != null
          ? `${ageMin}세 이상`
          : `${ageMax}세 이하`;

  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="명단관리" forceNative />
        <main className="flex-1" />
      </MobileContainer>
    );
  }

  if (error || !classData) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="명단관리" forceNative />
        <main className="flex-1 flex flex-col items-center justify-center px-5 py-16">
          <div
            className="w-14 h-14 rounded-w-pill bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-3"
            aria-hidden="true"
          >
            <Icon name="error" className="text-2xl text-red-500 dark:text-red-400" />
          </div>
          <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium mb-4">
            {error ?? MESSAGES.error.general}
          </p>
          <button
            type="button"
            onClick={() => back()}
            className="px-4 py-2 text-card-body font-medium text-wtext-2 dark:text-rink-100 bg-wline-2 dark:bg-rink-700 rounded-lg hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none"
          >
            뒤로 가기
          </button>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="명단관리" forceNative />

      <main className="flex-1 overflow-y-auto pb-10 bg-wbg dark:bg-puck">
        {/* ─── Header summary ─── */}
        <section className="px-5 pt-5">
          <div className="rounded-w-xl bg-rink-800 dark:bg-rink-900 p-5 shadow-sh-rink">
            <p className="text-card-meta font-bold uppercase tracking-[0.12em] text-wtext-4 mb-1">
              ROSTER
            </p>
            <h1 className="text-card-title font-bold text-white truncate">{className}</h1>
            <p className="mt-1.5 text-card-meta text-wtext-4">
              대상 {ageRangeLabel} · 배치 {placedStudents.length}명 · 미배치{' '}
              {unplacedStudents.length}명
            </p>
          </div>
        </section>

        {/* ─── 배치된 학생 ─── */}
        <section className="mx-5 mt-5 bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
              배치된 학생 ({placedStudents.length})
            </h2>
            {classData.capacity != null && (
              <span className="text-card-meta font-bold px-3 py-1 rounded-w-pill tabular-nums bg-ice-500/10 text-ice-500">
                {placedStudents.length} / {classData.capacity}명
              </span>
            )}
          </div>

          {placedStudents.length === 0 ? (
            <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center py-6">
              아직 배치된 학생이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 list-none" role="list">
              {placedStudents.map((s) => (
                <li
                  key={s.key}
                  className="flex items-center gap-3 p-3 bg-wbg dark:bg-rink-900/50 rounded-lg border border-wline-2 dark:border-rink-700"
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-w-pill flex items-center justify-center shrink-0',
                      getInitialColor(s.name),
                    )}
                    aria-hidden="true"
                  >
                    <span className="text-card-body font-bold text-white">
                      {getInitial(s.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-card-body font-semibold text-wtext-1 dark:text-rink-100 truncate">
                      {s.name}
                    </p>
                  </div>
                  <span className="text-card-meta font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {s.status === 'paid' ? '등록 완료' : s.status}
                  </span>
                  {/* [추가 2026-05-19 Step 6] 회차 조정 버튼 — 코치/감독 (배치 학생 대상).
                      `POST /credits/adjust` 호출 모달 오픈.
                      성공 시 onSuccess → load() 로 명단/잔여 회차 새로고침. */}
                  {s.userId && (
                    <button
                      type="button"
                      onClick={() =>
                        setAdjustTarget({ userId: s.userId, name: s.name })
                      }
                      disabled={mutatingUserId === s.userId}
                      className="shrink-0 inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-ice-500/40 text-card-meta font-bold text-ice-500 hover:bg-ice-500/10 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50"
                      aria-label={`${s.name} 회차 조정`}
                    >
                      회차 조정
                    </button>
                  )}
                  {/* [추가 2026-05-13] 배치 해제 버튼 — 코치/감독 */}
                  {s.userId && (
                    <button
                      type="button"
                      onClick={() => handleUnassign(s.userId, s.name)}
                      disabled={mutatingUserId === s.userId}
                      className="shrink-0 inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-wline-2 dark:border-rink-700 text-card-meta font-bold text-flame hover:bg-flame/10 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50"
                      aria-label={`${s.name} 배치 해제`}
                    >
                      {mutatingUserId === s.userId ? '처리 중' : '해제'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─── 미배치 학생 ─── */}
        <section className="mx-5 mt-4 bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">
              미배치 학생 ({unplacedStudents.length})
            </h2>
            {/* [수정 2026-05-13] ageRangeLabel 제거 — 미배치 영역은 연령 무관 전체 표시. */}
            <span className="text-card-meta text-wtext-3 dark:text-rink-300">
              연령 무관
            </span>
          </div>

          {unplacedStudents.length === 0 ? (
            <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center py-6">
              미배치 학생이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 list-none" role="list">
              {unplacedStudents.map((m) => {
                const name =
                  (m.playerName ??
                    `${m.user?.lastName ?? ''}${m.user?.firstName ?? ''}`.trim()) ||
                  '-';
                const age = m.playerAge ?? m.user?.koreanAge ?? null;
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 p-3 bg-wbg dark:bg-rink-900/50 rounded-lg border border-wline-2 dark:border-rink-700"
                  >
                    <div
                      className={cn(
                        'w-9 h-9 rounded-w-pill flex items-center justify-center shrink-0',
                        getInitialColor(name),
                      )}
                      aria-hidden="true"
                    >
                      <span className="text-card-body font-bold text-white">
                        {getInitial(name)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-card-body font-semibold text-wtext-1 dark:text-rink-100 truncate">
                        {name}
                      </p>
                      {age != null && (
                        <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                          {age}세
                        </p>
                      )}
                    </div>
                    {/* [추가 2026-05-13] 배치하기 버튼 — 코치/감독
                        [hotfix 2026-05-15 T06-F] 결제 미완료 학생은 배치 차단.
                        결제 완료/미완료 정보가 응답에 없으면 기존 동작 유지(배치 가능).
                        결제 미완료 시 disabled + "결제 필요" 안내 표시. */}
                    {m.user?.id ? (
                      isUnpaid(m) ? (
                        <button
                          type="button"
                          disabled
                          className="shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-md bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300 text-card-meta font-extrabold cursor-not-allowed"
                          aria-label={`${name} 결제 필요로 배치 불가`}
                          title="결제 완료 후 배치할 수 있습니다"
                        >
                          결제 필요
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAssign(m.user!.id!, name)}
                          disabled={mutatingUserId === m.user.id}
                          className="shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-md bg-ice-500 hover:bg-ice-600 text-white text-card-meta font-extrabold transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50"
                          aria-label={`${name} 배치하기`}
                        >
                          {mutatingUserId === m.user.id ? '처리 중' : '배치하기'}
                        </button>
                      )
                    ) : (
                      <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300 shrink-0">
                        미배치
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {/* [추가 2026-05-19 Step 6] 회차 조정 모달 — 배치 학생 행 액션에서 호출.
          성공 시 load() 로 명단 새로고침 + ROSTER/CLASSES refresh-bus 발화.
          백엔드 RBAC 그레이스 기간 동안 403 발생 시 모달 내부에서 toast 안전망 동작. */}
      {adjustTarget && (
        <CreditAdjustModal
          isOpen={true}
          onClose={() => setAdjustTarget(null)}
          userId={adjustTarget.userId}
          userName={adjustTarget.name}
          onSuccess={() => {
            void load();
            emitRefresh(REFRESH_KEYS.ROSTER);
          }}
        />
      )}
    </MobileContainer>
  );
}
