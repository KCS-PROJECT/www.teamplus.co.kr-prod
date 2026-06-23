'use client';

/**
 * useDirectorApprovals — 감독·코치 회원 승인 관리 훅.
 * 데이터 로딩, 필터링, 선택, 일괄 처리, 승인/거절 mutation 을 담당.
 * 이력 조회 모드(기간/상태 필터) 포함.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { useAuth } from '@/contexts/AuthContext';
import type { ApplicantData } from '@/components/shared/ApplicantCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type StatusFilter = 'pending' | 'approved' | 'rejected';
export type ViewMode = 'manage' | 'history';
export type HistoryStatusFilter = 'all' | 'approved' | 'rejected';

interface ManagedClub {
  id: string;
  clubName?: string;
  pendingCount?: number;
}

interface ApiTeamMember {
  id: string;
  userId?: string;
  playerName?: string | null;
  playerAge?: number | null;
  /** 출생연도(20XX) — 백엔드 getTeamMembers 가 user.birthDate 기반으로 산출. 없으면 null → playerAge 폴백. */
  birthYear?: number | null;
  /** 생년월일(ISO) — 백엔드 getTeamMembers 가 user.birthDate 를 그대로 노출. 없으면 null. */
  birthDate?: string | null;
  playerLevel?: string | null;
  approvalStatus?: ApprovalStatus | string;
  joinedAt?: string | null;
  // B2 fix (2026-05-14): TeamMember 모델에는 processedAt 컬럼이 없고, 상태 변경 시
  // 자동 갱신되는 updatedAt 을 처리 일시(approved/rejected 시각)로 사용한다.
  // 백엔드 호환을 위해 두 필드 모두 허용.
  processedAt?: string | null;
  updatedAt?: string | null;
  rejectionReason?: string | null;
  /** 구버전 호환 (사용 안 함) */
  rejectReason?: string | null;
  user?: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    userType?: string | null;
  } | null;
}

export interface ApprovalRecord extends ApplicantData {
  status: ApprovalStatus;
  parentName: string;
  /**
   * 신청 일시 (raw ISO) — formatDateKR/formatTimeKR 에 전달하기 위한 원본 값.
   * (createdAt 은 ApplicantCard 호환을 위해 사전 포맷된 KR 표시 문자열로 유지하지만,
   *  `new Date('2026. 5. 12.')` 는 안전하게 파싱되지 않아 시간 표시·정렬에 적합하지 않음.)
   */
  appliedAt?: string;
  /** 처리 일시 (승인/거절 시점, raw ISO) */
  processedAt?: string;
  /** 거절 사유 */
  rejectReason?: string;
  /** 전체 생년월일(ISO) — "YYYY.MM.DD" 표기용 */
  birthDate?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateKR(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatTimeKR(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function mapMember(m: ApiTeamMember): ApprovalRecord {
  const firstName = m.user?.firstName ?? '';
  const lastName = m.user?.lastName ?? '';
  const fullName = `${lastName}${firstName}`.trim();
  const name = m.playerName || fullName || m.user?.email || '회원';
  const parentName = fullName || m.user?.email || '-';

  const raw = (m.approvalStatus ?? 'pending') as string;
  const status: ApprovalStatus =
    raw === 'approved' ? 'approved' : raw === 'rejected' ? 'rejected' : 'pending';

  const levelLabel =
    m.playerLevel
      ? `LV.${m.playerLevel}`
      : undefined;

  // B2 fix (2026-05-14): 처리 일시는 우선 처리 전용 필드(processedAt) → updatedAt(status 변경 시 자동 갱신) → joinedAt 폴백.
  // 백엔드 TeamMember 모델에는 processedAt 컬럼이 없으므로 updatedAt 으로 대체된다.
  // pending 상태에서는 updatedAt 도 등록 직후 시각이라 신뢰할 수 없어 undefined 처리.
  const processedAt =
    status === 'pending'
      ? undefined
      : (m.processedAt ?? m.updatedAt ?? undefined);

  // [추가 2026-05-21] 코치 가입 신청은 playerAge 가 0/null 이라 "0세" 로 잘못 표시되던 문제.
  //  자녀(CHILD/TEEN) 인 경우만 나이 노출, 코치 가입 신청 카드에서는 미표시.
  //  (학부모는 옵션 A 즉시 승인되어 가입 신청 목록에 나타나지 않으므로 분기 불필요.)
  const userType = (m.user?.userType ?? '').toUpperCase();
  const isChild = userType === 'CHILD' || userType === 'TEEN';

  return {
    id: m.id,
    name,
    parentName: parentName !== name ? parentName : '-',
    status,
    level: levelLabel,
    age: isChild ? (m.playerAge ?? undefined) : undefined,
    // 자녀(CHILD/TEEN)만 출생 정보 노출 — birthDate(생년월일) 우선, 없으면 birthYear, 그래도 없으면 age 폴백.
    birthDate: isChild ? (m.birthDate ?? undefined) : undefined,
    birthYear: isChild ? (m.birthYear ?? undefined) : undefined,
    // ApplicantCard 호환 — KR 사전 포맷 (날짜만, 시간 손실)
    createdAt: m.joinedAt
      ? new Date(m.joinedAt).toLocaleDateString('ko-KR')
      : undefined,
    // HistoryRecordCard 용 raw ISO — 날짜·시간 모두 포맷 가능
    appliedAt: m.joinedAt ?? undefined,
    processedAt,
    rejectReason: m.rejectionReason ?? m.rejectReason ?? undefined,
  };
}

/** 날짜 문자열을 YYYY-MM-DD 형태로 변환 */
function toDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDirectorApprovals() {
  const { user } = useAuth();
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [clubId, setClubId] = useState<string | null>(null);

  // -- 이력 모드 상태 --
  const [viewMode, setViewMode] = useState<ViewMode>('manage');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // -- Data loading --
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // 같은 팀에 다른 감독/코치 회원이 섞여 응답되므로 본인 관리 팀의 roster 로 화이트리스트 구성.
      // TeamMember.userId === 본인 항목은 자기 카드 노출 방지를 위해 제외.
      const [clubsRes, managedTeamsRes] = await Promise.all([
        api.get<ManagedClub[]>('/teams/managed/list'),
        api.get<Array<{ id: string }>>('/teams/my/managed'),
      ]);
      if (!clubsRes.success) {
        throw new Error(clubsRes.error?.message ?? MESSAGES.error.general);
      }
      const clubs = Array.isArray(clubsRes.data) ? clubsRes.data : [];
      const managedTeamIds = managedTeamsRes.success && Array.isArray(managedTeamsRes.data)
        ? managedTeamsRes.data.map((t) => t.id)
        : [];

      if (clubs.length === 0) {
        setRecords([]);
        return;
      }

      setClubId(clubs[0]?.id ?? null);

      // 본인 관리 팀들의 roster 에서 memberId 화이트리스트 수집
      type RosterRow = { id?: string; memberId?: string; member?: { id?: string; userId?: string } };
      type RosterPayload = RosterRow[] | { roster?: RosterRow[]; data?: RosterRow[] };
      const memberIdAllowList = new Set<string>();
      if (managedTeamIds.length > 0) {
        const rosterResults = await Promise.allSettled(
          managedTeamIds.map((teamId) =>
            api.get<RosterPayload>(`/teams/${teamId}/roster`),
          ),
        );
        for (const r of rosterResults) {
          if (r.status !== 'fulfilled' || !r.value.success) continue;
          const payload = r.value.data;
          const list: RosterRow[] = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.roster)
              ? payload.roster ?? []
              : Array.isArray(payload?.data)
                ? payload.data ?? []
                : [];
          for (const row of list) {
            const mid = row.memberId ?? row.member?.id;
            if (mid) memberIdAllowList.add(mid);
          }
        }
      }

      const memberResults = await Promise.allSettled(
        clubs.map((club) =>
          api.get<{ total: number; members: ApiTeamMember[] } | ApiTeamMember[]>(
            `/teams/${club.id}/members?status=all`,
          ),
        ),
      );

      const allMembers: ApiTeamMember[] = [];
      for (const result of memberResults) {
        if (result.status !== 'fulfilled' || !result.value.success) continue;
        const payload = result.value.data;
        const list: ApiTeamMember[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.members)
            ? payload.members
            : [];
        allMembers.push(...list);
      }

      // 감독/관리자(DIRECTOR/ACADEMY_DIRECTOR/ADMIN) 본인은 승인 대상 아님 — 그 외 역할만 통과.
      // userType 미상이면 안전하게 제외.
      const myUserId = user?.id;
      const APPROVABLE_USER_TYPES = new Set(['PARENT', 'COACH', 'TEEN', 'CHILD']);
      const filteredMembers = allMembers.filter((m) => {
        if (myUserId && m.userId === myUserId) return false;
        // pending·rejected 는 roster(승인 선수 명단)에 없는 게 정상 → 화이트리스트 우회.
        //   approved 만 화이트리스트로 타 팀/타 코치 카드 혼입을 차단한다.
        //   (rejected 를 거르면 거절한 자녀가 거절 내역에서 사라지는 회귀 발생)
        const normalized = (m.approvalStatus ?? 'pending').toString().toLowerCase();
        const isApproved = normalized === 'approved';
        if (isApproved && memberIdAllowList.size > 0 && !memberIdAllowList.has(m.id)) return false;
        const userType = (m.user?.userType ?? '').toUpperCase();
        return APPROVABLE_USER_TYPES.has(userType);
      });

      const allRecords = filteredMembers.map(mapMember);

      // 정렬은 raw ISO 인 appliedAt 기준 (createdAt 은 KR 포맷 문자열이라 Date 파싱 불안정)
      const sortedRecords = [...allRecords].sort(
        (a, b) =>
          new Date(b.appliedAt ?? 0).getTime() -
          new Date(a.appliedAt ?? 0).getTime(),
      );

      setRecords(sortedRecords);
      setSelectedIds(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.error.general;
      setLoadError(message);
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // -- 관리 모드 필터링 --
  const filteredRecords = useMemo(
    () => records.filter((r) => r.status === statusFilter),
    [records, statusFilter],
  );

  // -- 이력 모드 필터링 --
  const historyRecords = useMemo(() => {
    let filtered = records.filter(
      (r) => r.status === 'approved' || r.status === 'rejected',
    );

    // 상태 필터
    if (historyStatusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === historyStatusFilter);
    }

    // 기간 필터 — raw ISO (appliedAt/processedAt) 기준으로 비교
    if (dateFrom) {
      filtered = filtered.filter((r) => {
        const recordDate = toDateOnly(r.processedAt) ?? toDateOnly(r.appliedAt);
        return recordDate ? recordDate >= dateFrom : false;
      });
    }
    if (dateTo) {
      filtered = filtered.filter((r) => {
        const recordDate = toDateOnly(r.processedAt) ?? toDateOnly(r.appliedAt);
        return recordDate ? recordDate <= dateTo : false;
      });
    }

    // 최신순 정렬 — raw ISO (processedAt → appliedAt fallback)
    return [...filtered].sort((a, b) => {
      const dateA = new Date(a.processedAt ?? a.appliedAt ?? 0).getTime();
      const dateB = new Date(b.processedAt ?? b.appliedAt ?? 0).getTime();
      return dateB - dateA;
    });
  }, [records, historyStatusFilter, dateFrom, dateTo]);

  // -- Counts --
  const counts = useMemo(
    () => ({
      pending: records.filter((r) => r.status === 'pending').length,
      approved: records.filter((r) => r.status === 'approved').length,
      rejected: records.filter((r) => r.status === 'rejected').length,
    }),
    [records],
  );

  // -- Selection --
  const toggleSelect = useCallback((id: string | number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  }, [selectedIds.size, filteredRecords]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected =
    filteredRecords.length > 0 && selectedIds.size === filteredRecords.length;

  // -- 이력 필터 초기화 --
  const resetHistoryFilters = useCallback(() => {
    setHistoryStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  // -- Approval / Rejection API --
  // member-approvals 모듈 사용. 거절 시 TeamMember 레코드를 보존(soft update)하고
  // rejectionReason + MemberApprovalLog 를 $transaction 으로 기록한다.
  const approveById = useCallback(
    async (id: string | number) => {
      if (!clubId) return;
      try {
        await api.post(`/member-approvals/${id}/approve`);
        setRecords((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: 'approved' as const } : r)),
        );
      } catch {
        // toast will be shown from page level
        throw new Error(MESSAGES.error.general);
      }
    },
    [clubId],
  );

  const rejectById = useCallback(
    async (id: string | number, reason?: string) => {
      if (!clubId) return;
      // 백엔드 RejectMemberDto: reason 필수 + 최소 2자. 호출부가 사유를 넘기지 않은
      // 폴백 케이스를 안전하게 통과시키기 위해 기본 문구 사용.
      const safeReason = reason && reason.trim().length >= 2 ? reason : '관리자 거절';
      try {
        await api.post(`/member-approvals/${id}/reject`, { reason: safeReason });
        setRecords((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status: 'rejected' as const, rejectReason: safeReason }
              : r,
          ),
        );
      } catch {
        throw new Error(MESSAGES.error.general);
      }
    },
    [clubId],
  );

  const bulkApprove = useCallback(async (): Promise<{ success: number; failed: number }> => {
    const ids = Array.from(selectedIds) as string[];
    if (!clubId || ids.length === 0) return { success: 0, failed: 0 };
    try {
      const res = await api.post<{ approvedCount: number; approvedMembers: { id: string }[] }>(
        `/member-approvals/bulk-approve`,
        { ids },
      );
      if (res.success && res.data) {
        const approvedIds = new Set(res.data.approvedMembers.map((m) => m.id));
        setRecords((prev) =>
          prev.map((r) => (approvedIds.has(r.id as string) ? { ...r, status: 'approved' as const } : r)),
        );
        setSelectedIds(new Set());
        return { success: res.data.approvedCount, failed: ids.length - res.data.approvedCount };
      }
      setSelectedIds(new Set());
      return { success: 0, failed: ids.length };
    } catch {
      setSelectedIds(new Set());
      return { success: 0, failed: ids.length };
    }
  }, [selectedIds, clubId]);

  const bulkReject = useCallback(
    async (reason?: string): Promise<{ success: number; failed: number }> => {
      const ids = Array.from(selectedIds) as string[];
      if (!clubId || ids.length === 0) return { success: 0, failed: 0 };
      const safeReason = reason && reason.trim().length >= 2 ? reason : '관리자 거절';
      try {
        const res = await api.post<{
          rejectedCount: number;
          rejectedMembers: { id: string }[];
        }>(`/member-approvals/bulk-reject`, { ids, reason: safeReason });
        if (res.success && res.data) {
          const rejectedIds = new Set(res.data.rejectedMembers.map((m) => m.id));
          setRecords((prev) =>
            prev.map((r) =>
              rejectedIds.has(r.id as string)
                ? { ...r, status: 'rejected' as const, rejectReason: safeReason }
                : r,
            ),
          );
          setSelectedIds(new Set());
          return {
            success: res.data.rejectedCount,
            failed: ids.length - res.data.rejectedCount,
          };
        }
        setSelectedIds(new Set());
        return { success: 0, failed: ids.length };
      } catch {
        setSelectedIds(new Set());
        return { success: 0, failed: ids.length };
      }
    },
    [selectedIds, clubId],
  );

  return {
    // 관리 모드
    records: filteredRecords,
    allRecords: records,
    isLoading,
    loadError,
    statusFilter,
    setStatusFilter,
    counts,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    isAllSelected,
    approveById,
    rejectById,
    bulkApprove,
    bulkReject,
    refresh: loadData,
    // 이력 모드
    viewMode,
    setViewMode,
    historyRecords,
    historyStatusFilter,
    setHistoryStatusFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    resetHistoryFilters,
    // 유틸
    formatDateKR,
    formatTimeKR,
  };
}
