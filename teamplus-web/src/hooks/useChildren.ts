'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Child } from '@/components/children/ChildCard';
import { api } from '@/services/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { devWarn } from '@/lib/logger';
import { getActiveChildren, getSelectableChildren } from '@/lib/child-status';

/** 백엔드 GET /api/v1/children 응답 아이템 형태 */
export interface ChildApiItem {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  age?: number;
  gender?: string;
  note?: string;
  clubName?: string | null;
  isActive?: boolean;
  imageUrl?: string | null;
  clubMemberships?: Array<{
    id: string;
    /** 백엔드 ChildResponseDto.teamId SoT — 학부모 자녀의 소속 팀 ID */
    teamId: string;
    approvalStatus: string;
    rejectionReason?: string;
    clubName?: string;
    playerLevel?: string;
    joinedAt?: string;
  }>;
  phone?: string;
  email?: string;
  relationship?: string;
  currentLevel?: number;
  levelLabel?: string;
  progressPercent?: number;
  nextTestDate?: string | null;
  lastEvaluatedAt?: string | null;
}

/** 백엔드 응답을 프론트엔드 Child 인터페이스로 변환 */
function toChild(item: ChildApiItem): Child {
  const age = item.age ?? 0;
  const approvedMembership = item.clubMemberships?.find(
    (m) => m.approvalStatus === 'approved',
  );
  // 승인된 소속이 없을 때만 pending/rejected 표시 (동시 표시 방지)
  const pendingMembership = approvedMembership
    ? undefined
    : item.clubMemberships?.find((m) => m.approvalStatus === 'pending');
  const rejectedMembership =
    approvedMembership || pendingMembership
      ? undefined
      : item.clubMemberships?.find((m) => m.approvalStatus === 'rejected');
  const clubIds = (item.clubMemberships ?? [])
    .filter((m) => m.approvalStatus === 'approved')
    .map((m) => m.teamId);

  return {
    id: item.id,
    name: `${item.lastName}${item.firstName}`,
    age,
    // 만나이(국제나이) 계산 원천 — calculateInternationalAge(birthDate) 호출용. age 는 한국나이 SoT.
    birthDate: item.birthDate ?? null,
    // [추가 2026-05-13] 자녀 본인 이메일/ID — 학부모 홈 hero · 메뉴 상단에 노출.
    email: item.email ?? null,
    // approved 멤버십만 club 으로 노출. pending/rejected 는 pendingClubName/rejectedClubName 로 분리.
    //  - 이전 폴백 `clubMemberships?.[0]?.clubName` 은 정렬 보장 없이 첫 멤버십을 채워
    //    pending only 자녀에서도 club 이 채워져 학부모 대시보드 대기 배너의 `!c.club` 조건이
    //    false negative 가 되는 버그(2026-04-29 발견)였음.
    club: item.clubName ?? approvedMembership?.clubName ?? null,
    clubIds,
    isActive: item.isActive ?? true,
    imageUrl: item.imageUrl && item.imageUrl.trim() !== '' ? item.imageUrl : null,
    currentLevel: item.currentLevel,
    levelLabel: item.levelLabel,
    progressPercent: item.progressPercent,
    nextTestDate: item.nextTestDate ?? null,
    memberId: approvedMembership?.id ?? null,
    pendingClubId: pendingMembership?.teamId ?? null,
    pendingClubName: pendingMembership?.clubName ?? null,
    rejectedClubId: rejectedMembership?.teamId ?? null,
    rejectedClubName: rejectedMembership?.clubName ?? null,
    rejectedMemberId: rejectedMembership?.id ?? null,
    rejectionReason: rejectedMembership?.rejectionReason ?? null,
  };
}

export interface CreateChildPayload {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender?: string;
  relationship?: string;
  note?: string;
  phone?: string;
  email?: string;
  password?: string;
  pin?: string;
  /**
   * 자녀가 가입할 팀 ID (선택). 미지정 시 팀 미소속으로 등록되며,
   * 지정 시 해당 팀에 PLAYER로 가입 신청(pending)된다. (백엔드 CreateChildDto.teamId)
   *
   * 수정(updateChild) 시: 문자열이면 해당 팀으로 교체(기존 탈퇴 후 pending 재가입),
   * null 이면 무소속 전환, 키 미전송이면 팀 변경 없음. (백엔드 UpdateChildDto.teamId)
   */
  teamId?: string | null;
  /** [Deprecated] 백엔드에서 무시됨 — teamId 사용. */
  teamCode?: string;
  [key: string]: unknown;
}

async function fetchChildren(): Promise<Child[]> {
  try {
    const response = await api.get<{ data: ChildApiItem[]; total: number }>('/children');
    if (response.success && response.data) {
      const items = Array.isArray(response.data)
        ? response.data
        : (response.data as { data: ChildApiItem[] }).data ?? [];
      return items.map(toChild);
    }
    return [];
  } catch (err) {
    devWarn('Failed to fetch children:', err);
    throw err;
  }
}

export function useChildren() {
  const { user, isLoading: isAuthLoading } = useAuth();
  // 자녀 목록(/children)은 PARENT 전용 엔드포인트. coach/director 등 다른 역할에서도
  // GlobalMenu·SelectedChildProvider 가 마운트되며 무조건 호출하면 403 이 발생하므로 역할 가드.
  // admin 은 학부모 화면 시뮬레이션을 위해 허용.
  const canFetch = user?.userType === 'parent' || user?.userType === 'admin';

  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // 인증 로딩 중에는 판단 보류(로더 유지) — 학부모 화면 "자녀 없음" 깜빡임 방지.
    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    // 권한 없는 역할이면 빈 목록 + 네트워크 호출 스킵.
    if (!canFetch) {
      setChildren([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const result = await fetchChildren();
      setChildren(result);
      setError(null);
    } catch {
      setError('자녀 목록을 불러올 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [canFetch, isAuthLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const addChild = useCallback(
    async (payload: CreateChildPayload) => {
      const response = await api.post<ChildApiItem>('/children', payload);
      if (response.success) {
        await load();
        return { success: true as const };
      }
      return {
        success: false as const,
        error: response.error?.message ?? '자녀 등록 중 오류가 발생했습니다.',
      };
    },
    [load],
  );

  const getChild = useCallback(async (childId: string) => {
    const response = await api.get<ChildApiItem>(`/children/${childId}`);
    if (response.success && response.data) {
      const raw = (response.data as { data?: ChildApiItem }).data ?? (response.data as ChildApiItem);
      return { success: true as const, data: raw };
    }
    return {
      success: false as const,
      error: response.error?.message ?? '자녀 정보를 불러올 수 없습니다.',
    };
  }, []);

  const updateChild = useCallback(
    async (childId: string, payload: Partial<CreateChildPayload>) => {
      const response = await api.put<ChildApiItem>(`/children/${childId}`, payload);
      if (response.success) {
        await load();
        return { success: true as const };
      }
      return {
        success: false as const,
        error: response.error?.message ?? '자녀 정보 수정 중 오류가 발생했습니다.',
      };
    },
    [load],
  );

  const deleteChild = useCallback(
    async (childId: string) => {
      const response = await api.delete<void>(`/children/${childId}`);
      if (response.success) {
        await load();
        return { success: true as const };
      }
      return {
        success: false as const,
        error: response.error?.message ?? '자녀 삭제 중 오류가 발생했습니다.',
      };
    },
    [load],
  );

  /** 활성 자녀 (최소 1개 팀에 approved 멤버) — child-status.ts SoT 기준 */
  const activeChildren = useMemo(() => getActiveChildren(children), [children]);

  /** 선택 스코프 노출 대상 자녀 (무소속 포함, pending/rejected 제외) — 자녀 선택 칩 SoT */
  const selectableChildren = useMemo(
    () => {
      // [2026-06-17] 자녀 선택 목록을 출생연도 오름차순(나이 많은 순: 2017 → 2018 → 2021)으로 정렬.
      //   첫 번째가 가장 나이 많은 자녀(신자녀) → 전역 기본 선택·드로어·칩 모두 동일 순서/기본값.
      //   출생일 미상은 맨 뒤로.
      const yearOf = (c: { birthDate?: string | null }) =>
        c.birthDate
          ? new Date(c.birthDate).getFullYear()
          : Number.POSITIVE_INFINITY;
      return [...getSelectableChildren(children)].sort(
        (a, b) => yearOf(a) - yearOf(b),
      );
    },
    [children],
  );

  return {
    children,
    activeChildren,
    selectableChildren,
    isLoading,
    error,
    addChild,
    getChild,
    updateChild,
    deleteChild,
    refresh,
  };
}
