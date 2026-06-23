'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
interface Member {
  id: string;
  name: string;
  age: number;
  gender: '남성' | '여성';
  level: string;
  levelColor: string;
  category: string;
  appliedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  avatar?: string;
}

const LEVEL_COLOR: Record<number, string> = {
  1: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100',
  2: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  3: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  4: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  5: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
};

type TabType = 'pending' | 'approved' | 'rejected';

const TAB_META: { key: TabType; label: string }[] = [
  { key: 'pending', label: '대기 중' },
  { key: 'approved', label: '승인됨' },
  { key: 'rejected', label: '거절됨' },
];

const EMPTY_LABEL: Record<TabType, string> = {
  pending: '대기 중인 회원이 없습니다',
  approved: '승인된 회원이 없습니다',
  rejected: '거절된 회원이 없습니다',
};

function MemberCard({
  member,
  isSelected,
  onToggle,
  onApprove,
  onReject,
}: {
  member: Member;
  isSelected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div
      className={`group relative rounded-2xl border bg-white dark:bg-rink-800 p-5 shadow-sm transition-shadow active:brightness-95 motion-reduce:transition-none ${
        isSelected
          ? 'border-ice-500 ring-2 ring-ice-500/40 dark:ring-ice-500/30'
          : 'border-gray-200 dark:border-rink-700 hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <div className="pt-1">
          <input
            id={`member-check-${member.id}`}
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            aria-labelledby={`member-name-${member.id}`}
            aria-label={`${member.name} 선택`}
            className="h-5 w-5 rounded border-2 border-wline dark:border-rink-700 text-ice-500 focus:ring-0 cursor-pointer accent-primary"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center mb-1.5">
            <div className="flex items-center gap-2">
              <NavLink href={`/members/${member.id}`}>
                <h3
                  id={`member-name-${member.id}`}
                  className="text-card-emphasis font-bold text-wtext-1 dark:text-white hover:text-ice-500 transition-colors motion-reduce:transition-none"
                >
                  {member.name}
                </h3>
              </NavLink>
              <span className="text-card-body font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
                {member.age}세
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-card-meta font-bold ${member.levelColor}`}
              >
                {member.level}
              </span>
            </div>
            <span className="text-card-meta font-semibold text-wtext-3 shrink-0 tabular-nums">
              {member.appliedAt}
            </span>
          </div>

          <div className="flex items-center gap-2 text-card-meta font-medium text-wtext-3 dark:text-rink-300 mb-4">
            <span>{member.gender}</span>
            <span className="w-0.5 h-0.5 rounded-w-pill bg-wline dark:bg-rink-500" aria-hidden="true" />
            <span>{member.category}</span>
          </div>

          {/* Actions */}
          {member.status === 'pending' && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onReject}
                className="min-h-[44px] px-4 rounded-xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 text-card-body font-bold text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                거절하기
              </button>
              <button
                type="button"
                onClick={onApprove}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-ice-500 px-4 text-card-body font-bold text-white hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                <Icon name="check" className="text-[16px]" aria-hidden="true" />
                승인하기
              </button>
            </div>
          )}
        </div>

        {/* Avatar */}
        <div className="shrink-0">
          <div className="h-12 w-12 rounded-w-pill bg-wline dark:bg-rink-700 overflow-hidden ring-2 ring-white dark:ring-rink-800 shadow-sm flex items-center justify-center">
            <Icon name="person" className="text-xl text-wtext-3" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminMembersPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('approved');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: Array<{
        id: string;
        playerName?: string;
        playerAge?: number;
        approvalStatus?: string;
        clubId?: string;
        user?: { name?: string };
        level?: number;
        category?: string;
        createdAt?: string;
      }> }>('/admin/users');
      const raw = res.data?.data ?? [];
      setMembers(raw.map((m) => ({
        id: m.id,
        name: m.playerName ?? m.user?.name ?? '알 수 없음',
        age: m.playerAge ?? 0,
        gender: '남성' as const,
        level: `LV.${m.level ?? 1}`,
        levelColor: LEVEL_COLOR[m.level ?? 1] ?? LEVEL_COLOR[1],
        category: m.category ?? '일반',
        appliedAt: m.createdAt ? new Date(m.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-',
        status: (m.approvalStatus as Member['status']) ?? 'pending',
      })));
    } catch {
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const filteredMembers = useMemo(
    () => members.filter((m) => m.status === activeTab),
    [members, activeTab],
  );

  const summary = useMemo(() => {
    const pending = members.filter((m) => m.status === 'pending').length;
    const approved = members.filter((m) => m.status === 'approved').length;
    const rejected = members.filter((m) => m.status === 'rejected').length;
    return { pending, approved, rejected };
  }, [members]);

  const tabCount: Record<TabType, number> = {
    pending: summary.pending,
    approved: summary.approved,
    rejected: summary.rejected,
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMembers.map((m) => m.id)));
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await api.put(`/admin/users/${id}/approve`, {});
      if ((res as { success?: boolean })?.success !== false) {
        setMembers((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status: 'approved' as const } : m))
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.success(MESSAGES.approval?.approved ?? '승인되었습니다.');
      }
    } catch {
      toast.error(MESSAGES.error.general);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await api.put(`/admin/users/${id}/reject`, {});
      if ((res as { success?: boolean })?.success !== false) {
        setMembers((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status: 'rejected' as const } : m))
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.success(MESSAGES.approval?.rejected ?? '거절되었습니다.');
      }
    } catch {
      toast.error(MESSAGES.error.general);
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map((id) => api.put(`/admin/users/${id}/approve`, {})));
    setMembers((prev) =>
      prev.map((m) => selectedIds.has(m.id) ? { ...m, status: 'approved' as const } : m)
    );
    setSelectedIds(new Set());
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map((id) => api.put(`/admin/users/${id}/reject`, {})));
    setMembers((prev) =>
      prev.map((m) => selectedIds.has(m.id) ? { ...m, status: 'rejected' as const } : m)
    );
    setSelectedIds(new Set());
  };

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="회원 관리" />

      {/* Tabs */}
      <nav
        role="tablist"
        aria-label="회원 승인 상태"
        className="sticky top-14 z-20 relative flex px-2 w-full bg-wbg dark:bg-rink-900 border-b border-wline dark:border-rink-800"
      >
        {TAB_META.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              type="button"
              key={tab.key}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedIds(new Set());
              }}
              className="relative flex-1 pb-3 pt-3 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 rounded-t-lg"
            >
              <span
                className={`inline-flex items-center gap-1 text-card-body transition-colors motion-reduce:transition-none ${
                  active
                    ? 'font-bold text-ice-500 dark:text-blue-400'
                    : 'font-semibold text-wtext-3 dark:text-rink-300'
                }`}
              >
                {tab.label}
                {tabCount[tab.key] > 0 && (
                  <span
                    className={`ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-w-pill px-1.5 text-card-meta font-bold tabular-nums ${
                      active
                        ? 'bg-ice-500 text-white'
                        : 'bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-100'
                    }`}
                  >
                    {tabCount[tab.key]}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {/* 슬라이딩 바 */}
        <span
          className="absolute bottom-0 h-[3px] rounded-t-full bg-ice-500 transition-all duration-300 ease-in-out motion-reduce:transition-none"
          style={{
            width: `${100 / TAB_META.length}%`,
            left: `${(TAB_META.findIndex((t) => t.key === activeTab) * 100) / TAB_META.length}%`,
          }}
          aria-hidden="true"
        />
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-32">
        {/* Hero */}
        <section className="px-5 pt-6 pb-5">
          <p className="text-card-meta font-bold uppercase tracking-[0.18em] text-ice-500 mb-2">
            Members Hub
          </p>
          <h2 className="text-3xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight">
            회원 승인
            <br />
            관리
          </h2>
          <p className="mt-3 text-card-body font-medium text-wtext-3 dark:text-rink-300">
            가입 신청을 검토하고 승인·거절을 관리하세요.
          </p>
        </section>

        {/* 요약 */}
        {!isLoading && (
          <section aria-label="회원 현황 요약" className="px-5 mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
              <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">대기</p>
              <p className="mt-1 text-2xl font-black text-ice-500 tabular-nums">
                {summary.pending}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
              <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">승인</p>
              <p className="mt-1 text-2xl font-black text-wtext-1 dark:text-white tabular-nums">
                {summary.approved}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-4 shadow-sm">
              <p className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">거절</p>
              <p className="mt-1 text-2xl font-black text-wtext-3 dark:text-rink-300 tabular-nums">
                {summary.rejected}
              </p>
            </div>
          </section>
        )}

        {/* 리스트 컨트롤 */}
        <div className="px-5 pb-4 flex items-center justify-between">
          <label
            htmlFor="member-select-all"
            className="flex items-center gap-3 cursor-pointer group"
          >
            <input
              id="member-select-all"
              type="checkbox"
              checked={
                selectedIds.size === filteredMembers.length &&
                filteredMembers.length > 0
              }
              onChange={toggleSelectAll}
              aria-label="회원 전체 선택"
              className="h-5 w-5 rounded border-2 border-wline dark:border-rink-700 text-ice-500 focus:ring-0 cursor-pointer accent-primary"
            />
            <span className="text-card-body font-bold text-wtext-2 dark:text-rink-100 group-hover:text-wtext-1 dark:group-hover:text-white transition-colors motion-reduce:transition-none">
              전체 선택
            </span>
          </label>
          <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100 bg-wline-2 dark:bg-rink-800 px-2.5 py-1 rounded-w-pill tabular-nums">
            총 {filteredMembers.length}명
          </span>
        </div>

        {/* 리스트 */}
        <div className="px-5 flex flex-col gap-3">
          {isLoading ? null : filteredMembers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700">
                <Icon
                  name="person_off"
                  className="text-[28px] text-wtext-3 dark:text-rink-300"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-4 text-card-emphasis font-bold text-wtext-2 dark:text-rink-100">
                {EMPTY_LABEL[activeTab]}
              </p>
              <p className="mt-1 text-card-body font-medium text-wtext-3 dark:text-rink-300">
                새로운 신청이 들어오면 여기에서 확인할 수 있어요.
              </p>
            </div>
          ) : (
            filteredMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                isSelected={selectedIds.has(member.id)}
                onToggle={() => toggleSelect(member.id)}
                onApprove={() => handleApprove(member.id)}
                onReject={() => handleReject(member.id)}
              />
            ))
          )}
        </div>
      </main>

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && activeTab === 'pending' && (
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full z-40 px-5 pt-5 pb-safe-4 pointer-events-none max-w-md"
          role="region"
          aria-label="선택한 회원 일괄 처리"
        >
          <div className="flex gap-3 pointer-events-auto">
            <button
              type="button"
              onClick={handleBulkReject}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 text-red-600 dark:text-red-400 text-card-emphasis font-bold shadow-md hover:bg-wbg dark:hover:bg-rink-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
            >
              <Icon name="block" className="text-[20px]" aria-hidden="true" />
              일괄 거절
            </button>
            <button
              type="button"
              onClick={handleBulkApprove}
              className="flex-[2] inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-ice-500 text-white text-card-emphasis font-bold shadow-md hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
            >
              <Icon name="check_circle" className="text-[20px]" aria-hidden="true" />
              일괄 승인 ({selectedIds.size})
            </button>
          </div>
        </div>
      )}
    </MobileContainer>
  );
}
