'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { ConfirmSheet } from '@/components/shared/ConfirmSheet';
import { CareerFormSheet, type StaffCareer } from '@/components/coach/CareerFormSheet';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';

interface CoachDetail {
  id: string;
  /** 약력(staff_careers) 조회용 실제 User.id — TeamMember.id 와 구분 */
  userId?: string;
  name: string;
  phone?: string;
  avatarUrl?: string | null;
  createdAt?: string;
  /** 소속 팀 이름 (코치: coachProfile.team / 폴백: 매칭된 관리 팀) */
  teamName?: string;
  /** 원본 userType(대문자 enum) — 역할 배지 라벨 매핑용 */
  userType?: string;
  /**
   * userType==='COACH' 인 경우만 수정/삭제 가능.
   * 감독 본인(DIRECTOR) 등은 /admin/coaches 전용 API 대상이 아니라 액션을 숨긴다.
   */
  editable: boolean;
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

export default function DirectorCoachDetailPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨
  const params = useParams();
  const coachId = params?.id as string;
  const { navigate, back } = useNavigation();
  const { toast } = useToast();
  // 약력 관리 권한 판정용 — 가드는 layout.tsx, 여기선 세션 읽기만
  const { user } = useSessionAuth();

  const [coach, setCoach] = useState<CoachDetail | null>(null);
  const [careers, setCareers] = useState<StaffCareer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState(false);

  // 코치 삭제 확인
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 약력 입력/수정 바텀시트 (코치당 1건 — 자유 텍스트)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create');
  const [editingCareer, setEditingCareer] = useState<StaffCareer | null>(null);
  const [showCareerDeleteConfirm, setShowCareerDeleteConfirm] = useState(false);

  // [BUG FIX 2026-05-19 W3 #9] 감독 수정 후 코치 상세 페이지 오류 회귀 해결.
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

        setCoach({
          id: (d.id ?? user.id ?? '') as string,
          // 약력 조회용 실제 User.id — user.id 우선, 없으면 d.id
          userId: ((user.id as string) ?? (d.id as string)) || undefined,
          name: (user.name as string) ?? (`${(user.lastName as string) ?? ''}${(user.firstName as string) ?? ''}`.trim() || '코치'),
          phone: (d.phone as string) ?? (user.phone as string) ?? undefined,
          avatarUrl: (d.avatarUrl as string) ?? (user.avatarUrl as string) ?? null,
          createdAt: (d.createdAt as string) ?? (user.createdAt as string) ?? undefined,
          // 소속 팀: getCoach 응답은 coachProfile.team 을 top-level `team` 으로 평탄화
          teamName: ((d.team as { name?: string } | null)?.name) ?? undefined,
          userType: ((d.userType ?? user.userType) as string) || undefined,
          // getCoach 는 COACH 만 반환하지만 명시적으로 userType 확인
          editable: ((d.userType ?? user.userType) as string) === 'COACH',
        });
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
        let matchedTeamName: string | undefined;
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
            matchedTeamName = t.name ?? undefined;
            break;
          }
        }
        if (matched) {
          const u = matched.user ?? {};
          setCoach({
            id: matched.id,
            // 약력 조회용 실제 User.id — 폴백 경로는 member.user.id 사용
            userId: u.id || undefined,
            name:
              (u.name ??
                matched.playerName ??
                `${u.lastName ?? ''}${u.firstName ?? ''}`.trim()) ||
              '코치',
            phone: u.phone,
            avatarUrl: u.avatarUrl ?? null,
            createdAt: u.createdAt,
            teamName: matchedTeamName,
            userType: u.userType || undefined,
            // 폴백 경로 — 감독 본인(DIRECTOR) 등은 COACH 가 아니므로 수정/삭제 불가
            editable: u.userType === 'COACH',
          });
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

  /** 경력(staff_careers) 조회 — 코치 로딩 후 userId 확보 시 */
  const loadCareers = useCallback(async (userId: string) => {
    try {
      const res = await api.get<{ careers?: StaffCareer[] }>(`/careers/staff/profile/${userId}`);
      if (res.success && res.data && Array.isArray(res.data.careers)) {
        setCareers(res.data.careers);
      } else {
        setCareers([]);
      }
    } catch {
      setCareers([]);
    }
  }, []);

  useEffect(() => {
    if (coach?.userId) {
      void loadCareers(coach.userId);
    } else {
      setCareers([]);
    }
  }, [coach?.userId, loadCareers]);

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

  /** 약력 추가 시트 열기 */
  const openCreateSheet = useCallback(() => {
    setSheetMode('create');
    setEditingCareer(null);
    setSheetOpen(true);
  }, []);

  /** 약력 수정 시트 열기 (코치당 1건 — careers[0] 대상) */
  const openEditSheet = useCallback(() => {
    setSheetMode('edit');
    setEditingCareer(careers[0] ?? null);
    setSheetOpen(true);
  }, [careers]);

  /** 약력 삭제 실행 (코치당 1건 — careers[0] 대상) */
  const handleCareerDelete = useCallback(async () => {
    const target = careers[0];
    if (!target) return;
    try {
      const res = await api.delete(`/careers/staff/${target.id}`);
      if (res.success) {
        toast.success(MESSAGES.career.deleted);
        if (coach?.userId) void loadCareers(coach.userId);
      } else if (res.error?.statusCode === 403) {
        toast.error(MESSAGES.career.permissionDenied);
      } else {
        toast.error(MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setShowCareerDeleteConfirm(false);
    }
  }, [careers, coach?.userId, loadCareers, toast]);

  // 로딩 상태
  if (isLoading) return null;

  // 에러 상태
  if (error || !coach) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="코치 상세" onBack={back} forceNative />
        <main className="flex-1 flex flex-col items-center justify-center px-6 bg-it-canvas dark:bg-puck" role="main" aria-label="코치 상세">
          <div className="w-16 h-16 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-rink-300 mb-4">{MESSAGES.error.general}</p>
          <button
            type="button"
            onClick={loadCoachDetail}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-w-md bg-it-blue-500 px-5 py-2.5 text-card-body font-bold text-white hover:bg-it-blue-600 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            <Icon name="refresh" className="text-[18px]" aria-hidden="true" />
            <span>다시 시도하기</span>
          </button>
        </main>
      </MobileContainer>
    );
  }

  const initial = coach.name?.charAt(0) || '?';
  // 역할 배지 라벨 — userType(대문자) → 한글. 매핑 없으면 미표시.
  const roleLabel = coach.userType ? MESSAGES.coach.roleBadge[coach.userType] : undefined;
  // 약력(staff_careers) 관리 권한: 대상이 코치(editable)이거나, 감독 본인이 자기 프로필을
  // 보고 있거나, 관리자(ADMIN)인 경우 허용. 백엔드 소유권 가드(본인/관리팀/ADMIN)와 정렬.
  // 코치 계정 수정/삭제 권한(coach.editable)과는 별개 — 약력 권한만 확장한다.
  const canManageCareer =
    !!coach.userId &&
    (coach.editable || user?.id === coach.userId || user?.userType === 'admin');
  // 약력 = 코치/감독당 1건의 자유 텍스트 (careers[0])
  const bio = careers[0] ?? null;

  return (
    <MobileContainer hasBottomNav>
      {/* 수정/삭제는 하단 버튼으로 일원화 — 헤더 액션 중복 제거 */}
      <PageAppBar title="코치 상세" onBack={back} forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck"
        role="main"
        aria-label="코치 상세"
      >
        {/* 프로필 히어로 — navy full-bleed 밴드 */}
        <section className="bg-it-blue-800 dark:bg-it-blue-950 px-6 pt-8 pb-7" aria-label="코치 프로필">
          <div className="flex flex-col items-center">
            <div className="relative size-24 overflow-hidden rounded-w-md bg-it-blue-700/60 dark:bg-rink-700 flex items-center justify-center">
              {resolveImageSrc(coach.avatarUrl) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={resolveImageSrc(coach.avatarUrl)}
                  alt={`${coach.name} 코치`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-white/70">
                  {initial}
                </span>
              )}
            </div>

            <h2 className="mt-4 text-xl font-bold text-white">{coach.name}</h2>

            {roleLabel && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <span className="inline-flex items-center rounded-w-pill bg-white/15 px-2.5 py-0.5 text-card-meta font-bold text-white">
                  {roleLabel}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 상세 정보 — flat 흰 섹션 (hairline 행, 카드 박스 제거) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-2" aria-label="코치 상세 정보">
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-1">
            상세 정보
          </h3>
          <div className="flex flex-col divide-y divide-it-line dark:divide-rink-700">
            {/* 소속 팀 */}
            {coach.teamName && (
              <div className="flex items-center gap-3 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-w-md bg-it-fill dark:bg-rink-700">
                  <Icon name="group" className="text-[18px] text-it-ink-500 dark:text-rink-300" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-card-meta text-it-ink-500 dark:text-rink-300">소속 팀</span>
                  <p className="text-card-body font-medium text-it-ink-800 dark:text-white">{coach.teamName}</p>
                </div>
              </div>
            )}

            {/* 연락처 */}
            {coach.phone && (
              <div className="flex items-center gap-3 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-w-md bg-it-fill dark:bg-rink-700">
                  <Icon name="phone" className="text-[18px] text-it-ink-500 dark:text-rink-300" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-card-meta text-it-ink-500 dark:text-rink-300">연락처</span>
                  <p className="text-card-body font-medium text-it-ink-800 dark:text-white">{formatPhone(coach.phone)}</p>
                </div>
              </div>
            )}

            {/* 등록일 */}
            {coach.createdAt && (
              <div className="flex items-center gap-3 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-w-md bg-it-fill dark:bg-rink-700">
                  <Icon name="event" className="text-[18px] text-it-ink-500 dark:text-rink-300" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-card-meta text-it-ink-500 dark:text-rink-300">등록일</span>
                  <p className="text-card-body font-medium text-it-ink-800 dark:text-white">{formatDate(coach.createdAt)}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 약력 — staff_careers description 한 덩어리 (코치/감독당 1건, flat 흰 섹션) */}
        {coach.userId && (
          <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-label={MESSAGES.career.sectionTitle}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                {MESSAGES.career.sectionTitle}
              </h3>
              {canManageCareer && bio && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={openEditSheet}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-w-md px-3 py-2 text-card-meta font-bold text-it-blue-500 hover:bg-it-blue-50 dark:hover:bg-it-blue-500/15 transition-colors motion-reduce:transition-none active:brightness-95"
                    aria-label={MESSAGES.career.editAction}
                  >
                    <Icon name="edit" className="text-[16px]" aria-hidden="true" />
                    <span>{MESSAGES.career.editAction}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCareerDeleteConfirm(true)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-w-md px-3 py-2 text-card-meta font-bold text-it-red-500 dark:text-it-red-300 hover:bg-it-red-50 dark:hover:bg-it-red-500/15 transition-colors motion-reduce:transition-none active:brightness-95"
                    aria-label={MESSAGES.career.deleteAction}
                  >
                    <Icon name="delete" className="text-[16px]" aria-hidden="true" />
                    <span>{MESSAGES.career.deleteAction}</span>
                  </button>
                </div>
              )}
            </div>

            {bio?.description ? (
              <p className="text-card-body text-it-ink-700 dark:text-rink-100 whitespace-pre-line mt-2">{bio.description}</p>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-12 h-12 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center mb-3">
                  <Icon name="workspace_premium" className="text-2xl text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
                </div>
                <p className="text-card-body text-it-ink-500 dark:text-rink-300 mb-3">{MESSAGES.career.emptyText}</p>
                {canManageCareer && (
                  <button
                    type="button"
                    onClick={openCreateSheet}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-w-md bg-it-blue-50 dark:bg-it-blue-500/15 px-4 py-2 text-card-body font-bold text-it-blue-500 hover:bg-it-blue-100 dark:hover:bg-it-blue-500/25 transition-colors motion-reduce:transition-none active:brightness-95"
                  >
                    <Icon name="add" className="text-[18px]" aria-hidden="true" />
                    <span>{MESSAGES.career.addEmptyCta}</span>
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* 하단 액션 버튼 — 수정 / 삭제 (코치 계정만, 감독 본인 등 제외) */}
        {coach.editable && (
          <div className="px-5 pt-5 pb-8 flex gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 py-3.5 text-card-emphasis font-bold text-it-ink-600 dark:text-rink-100 transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-rink-700 active:brightness-95"
            >
              <Icon name="delete" className="text-[20px]" aria-hidden="true" />
              <span>삭제하기</span>
            </button>
            <NavLink
              href={`/director-coaches/${coachId}/edit`}
              className="flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-w-md bg-it-blue-500 py-3.5 text-card-emphasis font-bold text-white hover:bg-it-blue-600 transition-colors motion-reduce:transition-none active:brightness-95"
            >
              <Icon name="edit" className="text-[20px]" aria-hidden="true" />
              <span>{MESSAGES.common.edit}</span>
            </NavLink>
          </div>
        )}

      </main>

      {/* 코치 삭제 확인 시트 */}
      <ConfirmSheet
        open={showDeleteConfirm}
        title={MESSAGES.delete.confirm}
        description={`${coach.name} 코치를 삭제하면 계정과 등록 정보가 함께 삭제됩니다.`}
        confirmLabel="삭제하기"
        cancelLabel="취소"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* 약력 삭제 확인 시트 */}
      <ConfirmSheet
        open={showCareerDeleteConfirm}
        title={MESSAGES.career.deleteConfirmTitle}
        description={MESSAGES.career.deleteConfirmDescription}
        confirmLabel="삭제하기"
        cancelLabel="취소"
        variant="danger"
        onConfirm={handleCareerDelete}
        onCancel={() => setShowCareerDeleteConfirm(false)}
      />

      {/* 약력 입력/수정 바텀시트 */}
      {coach.userId && (
        <CareerFormSheet
          open={sheetOpen}
          mode={sheetMode}
          userId={coach.userId}
          initial={editingCareer}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            if (coach.userId) void loadCareers(coach.userId);
          }}
        />
      )}
    </MobileContainer>
  );
}
