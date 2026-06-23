'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import dynamic from 'next/dynamic';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

// ─── 회원 승인 관리 페이지 ──────────────────────────────
// 조회: GET /teams/managed/list → teamId
//       GET /teams/:teamId/members?status=pending|approved|rejected
// 승인/거절: member-approvals 모듈 (rejectionReason 보존 + MemberApprovalLog 감사 로그)
//   POST /member-approvals/:id/approve
//   POST /member-approvals/:id/reject       { reason }
//   POST /member-approvals/bulk-approve     { ids }
//   POST /member-approvals/bulk-reject      { ids, reason }

interface PendingMemberResponse {
  id: string;
  playerName: string;
  playerAge: number;
  createdAt: string;
  user: { email: string };
}

interface ClubMemberResponse {
  id: string;
  playerName: string;
  playerAge: number;
  approvalStatus: string;
  joinedAt: string;
  user: { id: string; email: string; phone?: string };
}

interface DisplayMember {
  id: string;
  name: string;
  age: number;
  email: string;
  appliedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

type TabType = 'pending' | 'approved' | 'rejected';

const tabs: { key: TabType; label: string }[] = [
  { key: 'pending', label: '대기 중' },
  { key: 'approved', label: '승인됨' },
  { key: 'rejected', label: '거절됨' },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`;
}

function ApplicantCard({
  member,
  isSelected,
  onToggle,
  onApprove,
  onReject,
  isPending,
  isActing,
}: {
  member: DisplayMember;
  isSelected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
  isActing: boolean;
}) {
  const statusBadge =
    member.status === 'approved'
      ? { label: '승인됨', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' }
      : { label: '거절됨', className: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' };

  return (
    <article
      aria-labelledby={`applicant-name-${member.id}`}
      className={`group relative bg-white dark:bg-rink-800 p-5 rounded-xl transition-all motion-reduce:transition-none active:brightness-95 ${
        isSelected
          ? 'ring-2 ring-ice-500 shadow-md'
          : 'border border-wline-2 dark:border-rink-700 hover:border-ice-500/40 hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-3">
        {isPending && (
          <div className="pt-1.5">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              aria-label={`${member.name} 선택`}
              className="h-5 w-5 rounded border-2 border-wline dark:border-rink-700 text-ice-500 focus:ring-2 focus:ring-ice-500/30 cursor-pointer"
            />
          </div>
        )}

        {/* 아바타 */}
        <div className="shrink-0">
          <div className="h-12 w-12 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
            <Icon name="person" className="text-xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
          </div>
        </div>

        {/* 회원 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <NavLink href={`/member/${member.id}`} aria-label={`${member.name} 회원 상세 보기`}>
                <h3
                  id={`applicant-name-${member.id}`}
                  className="text-card-emphasis font-bold text-wtext-1 dark:text-white hover:text-ice-500 transition-colors motion-reduce:transition-none truncate"
                >
                  {member.name}
                </h3>
              </NavLink>
              <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                {member.age}세
              </span>
            </div>
            <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 shrink-0 tabular-nums">
              {member.appliedAt}
            </span>
          </div>

          <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate mb-3.5">{member.email}</p>

          {isPending ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onReject}
                disabled={isActing}
                aria-label={`${member.name} 거절하기`}
                className="min-h-[36px] px-4 rounded-lg border border-red-200 dark:border-red-900/40 text-card-body font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors motion-reduce:transition-none disabled:opacity-50"
              >
                거절하기
              </button>
              <button
                type="button"
                onClick={onApprove}
                disabled={isActing}
                aria-label={`${member.name} 승인하기`}
                className="min-h-[36px] px-4 rounded-lg bg-ice-500 hover:bg-ice-700 text-card-body font-bold text-white transition-colors motion-reduce:transition-none flex items-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="check" className="text-[16px]" aria-hidden="true" />
                승인하기
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end">
              <span
                className={`inline-flex px-2.5 py-0.5 rounded-w-pill text-card-meta font-bold ${statusBadge.className}`}
                role="status"
                aria-label={`현재 상태: ${statusBadge.label}`}
              >
                {statusBadge.label}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function MemberApprovalPage() {
  const { back } = useNavigation();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // [수정 2026-05-26 B11] 상단바 액션(타임라인/알림/메뉴)·승인 상태 필터·뒤로가기 복구.
  //   기존: showAppBar:true 로 Flutter 네이티브 AppBar 가 그려지면서 web DOM <PageAppBar>
  //         (forceNative 미지정)가 native 환경에서 null 반환 → 우측 4 액션 미표시 +
  //         네이티브 AppBar 가 상단을 덮어 `sticky top-14` 탭(승인 상태 필터)이 가려지고,
  //         네이티브 back 이 web 라우터 히스토리를 따르지 않아 뒤로가기 미작동.
  //   변경: 네이티브 AppBar 숨김 + web DOM AppBar forceNative — 다른 서브페이지(team/[id],
  //         assign-class)와 동일 패턴. 우측 액션·필터 탭·뒤로가기 모두 web DOM 으로 복구.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false, // 웹 DOM <PageAppBar forceNative /> 사용
    showBottomNav: true,
  });

  const [clubId, setClubId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('pending');

  // ─── 탭 슬라이딩 인디케이터 ───────────────────────
  const navRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Record<TabType, HTMLButtonElement | null>>({
    pending: null,
    approved: null,
    rejected: null,
  });
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const btn = tabRefs.current[activeTab];
    const nav = navRef.current;
    if (!btn || !nav) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - navRect.left,
      width: btnRect.width,
    });
  }, [activeTab]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<DisplayMember[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isActing, setIsActing] = useState(false);

  // 코치의 팀 ID 로드
  useEffect(() => {
    api.get<Array<{ id: string }>>('/teams/managed/list').then((res) => {
      if (res.success && res.data?.[0]) {
        setClubId(res.data[0].id);
      } else {
        setIsLoading(false);
      }
    });
  }, []);

  const loadTab = useCallback(
    async (tab: TabType, cId: string) => {
      setIsLoading(true);
      setMembers([]);
      try {
        if (tab === 'pending') {
          const res = await api.get<PendingMemberResponse[]>(
            `/teams/${cId}/pending-members`,
          );
          if (res.success && res.data) {
            const normalized: DisplayMember[] = res.data.map((m) => ({
              id: m.id,
              name: m.playerName,
              age: m.playerAge,
              email: m.user.email,
              appliedAt: formatDate(m.createdAt),
              status: 'pending',
            }));
            setMembers(normalized);
            setPendingCount(normalized.length);
          }
        } else {
          const res = await api.get<{ total: number; members: ClubMemberResponse[] }>(
            `/teams/${cId}/members?status=${tab}`,
          );
          if (res.success && res.data) {
            const normalized: DisplayMember[] = res.data.members.map((m) => ({
              id: m.id,
              name: m.playerName,
              age: m.playerAge,
              email: m.user.email,
              appliedAt: formatDate(m.joinedAt),
              status: tab,
            }));
            setMembers(normalized);
          }
        }
      } catch {
        toast.error(MESSAGES.approvalExt.loadFailed);
      } finally {
        setIsLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (clubId) {
      loadTab(activeTab, clubId);
    }
  }, [clubId, activeTab, loadTab]);

  // 화면 폭 변경(회전·키보드·접힘 포함) 시 인디케이터 재측정 — SoT 단일 구독자
  // (2026-05-11) window.addEventListener('resize') 제거 — useScreenMetrics 사용
  const { width: screenWidth } = useScreenMetrics();

  // 인디케이터 위치 측정: activeTab / pendingCount / 화면 폭 변경 시
  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, pendingCount, screenWidth]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === members.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(members.map((m) => m.id)));
    }
  };

  // member-approvals 모듈 사용. 거절 시 TeamMember 레코드는 보존되며
  // rejectionReason + MemberApprovalLog 가 $transaction 으로 기록된다.
  const REJECT_FALLBACK_REASON = '관리자 거절';

  const handleApprove = async (memberId: string) => {
    if (!clubId || isActing) return;
    setIsActing(true);
    try {
      const res = await api.post(`/member-approvals/${memberId}/approve`);
      if (res.success) {
        toast.success(MESSAGES.approvalExt.approveSuccess);
        await loadTab('pending', clubId);
      } else {
        toast.error(res.error?.message ?? '승인 처리 중 오류가 발생했습니다.');
      }
    } finally {
      setIsActing(false);
    }
  };

  const handleReject = async (memberId: string) => {
    if (!clubId || isActing) return;
    setIsActing(true);
    try {
      const res = await api.post(`/member-approvals/${memberId}/reject`, {
        reason: REJECT_FALLBACK_REASON,
      });
      if (res.success) {
        toast.success(MESSAGES.approvalExt.rejectSuccess);
        await loadTab('pending', clubId);
      } else {
        toast.error(res.error?.message ?? '거절 처리 중 오류가 발생했습니다.');
      }
    } finally {
      setIsActing(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!clubId || isActing || selectedIds.size === 0) return;
    setIsActing(true);
    try {
      const res = await api.post(`/member-approvals/bulk-approve`, {
        ids: Array.from(selectedIds),
      });
      if (res.success) {
        toast.success(`${selectedIds.size}명을 승인했습니다.`);
        setSelectedIds(new Set());
        await loadTab('pending', clubId);
      } else {
        toast.error(res.error?.message ?? '일괄 승인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsActing(false);
    }
  };

  const handleBulkReject = async () => {
    if (!clubId || isActing || selectedIds.size === 0) return;
    setIsActing(true);
    try {
      const res = await api.post(`/member-approvals/bulk-reject`, {
        ids: Array.from(selectedIds),
        reason: REJECT_FALLBACK_REASON,
      });
      if (res.success) {
        toast.success(`${selectedIds.size}명을 거절했습니다.`);
        setSelectedIds(new Set());
        await loadTab('pending', clubId);
      } else {
        toast.error(res.error?.message ?? MESSAGES.approvalExt.bulkRejectFailed);
      }
    } finally {
      setIsActing(false);
    }
  };

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="회원 승인 관리" onBack={back} forceNative />

      {/* Tabs */}
      <div className="sticky top-14 z-30 bg-wbg dark:bg-rink-900 border-b border-wline dark:border-rink-800">
        <nav
          ref={navRef}
          role="tablist"
          aria-label="승인 상태 필터"
          className="relative flex px-2 w-full"
        >
          {/* 하단 가이드 라인 */}
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 h-px bg-wline dark:bg-rink-800"
          />

          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                ref={(el) => {
                  tabRefs.current[tab.key] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSelectedIds(new Set());
                }}
                className="relative flex-1 pb-3 pt-2 text-center group"
              >
                <span
                  className={`text-card-body transition-colors duration-200 motion-reduce:transition-none ${
                    isActive
                      ? 'font-bold text-ice-500 dark:text-blue-400'
                      : 'font-medium text-wtext-3 dark:text-rink-300 group-hover:text-wtext-2 dark:group-hover:text-rink-100'
                  }`}
                >
                  {tab.label}
                  {tab.key === 'pending' && pendingCount > 0 && (
                    <span
                      className={`ml-1 px-1.5 py-0.5 rounded-w-pill text-card-meta transition-colors motion-reduce:transition-none ${
                        isActive
                          ? 'bg-ice-500/15 text-ice-500 dark:text-blue-400'
                          : 'bg-wline/70 dark:bg-rink-700 text-wtext-2 dark:text-rink-100'
                      }`}
                    >
                      {pendingCount}
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {/* 슬라이딩 인디케이터 */}
          <span
            aria-hidden="true"
            className="absolute bottom-0 h-[3px] rounded-t-full bg-ice-500 transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
            style={{
              left: `${indicator.left}px`,
              width: `${indicator.width}px`,
              opacity: indicator.width > 0 ? 1 : 0,
            }}
          />
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-30">
        {/* 전체 선택 컨트롤 (pending 탭만) */}
        {activeTab === 'pending' && !isLoading && members.length > 0 && (
          <div className="sticky top-0 z-20 bg-wbg dark:bg-rink-900 px-5 py-3 flex items-center justify-between border-b border-wline-2 dark:border-rink-800">
            <label className="flex items-center gap-3 cursor-pointer group min-h-[44px]">
              <input
                type="checkbox"
                checked={selectedIds.size === members.length && members.length > 0}
                onChange={toggleSelectAll}
                aria-label="전체 선택"
                className="h-5 w-5 rounded border-2 border-wline dark:border-rink-700 text-ice-500 focus:ring-2 focus:ring-ice-500/30 cursor-pointer"
              />
              <span className="text-card-body font-semibold text-wtext-2 dark:text-rink-100 group-hover:text-wtext-1 dark:group-hover:text-white transition-colors motion-reduce:transition-none">
                전체 선택
              </span>
            </label>
            <span className="text-card-meta font-bold text-wtext-2 dark:text-rink-100 bg-wline dark:bg-rink-800 px-2.5 py-1 rounded-w-pill tabular-nums">
              총 {members.length}명
            </span>
          </div>
        )}

        {isLoading ? (
          <div
            className="flex justify-center items-center py-20"
            role="status"
            aria-live="polite"
            aria-label="회원 목록 불러오는 중"
          >
            <div className="w-8 h-8 border-2 border-wline dark:border-rink-700 border-t-primary rounded-w-pill animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <span className="sr-only">회원 목록을 불러오는 중입니다.</span>
          </div>
        ) : (
          <div className="px-4 pt-3">
            {members.length > 0 ? (
              <ul
                className="flex flex-col gap-3 list-none"
                role="list"
                aria-label={`${tabs.find(t => t.key === activeTab)?.label ?? ''} 회원 목록 ${members.length}명`}
              >
                {members.map((member) => (
                  <li key={member.id} role="listitem">
                    <ApplicantCard
                      member={member}
                      isSelected={selectedIds.has(member.id)}
                      onToggle={() => toggleSelect(member.id)}
                      onApprove={() => handleApprove(member.id)}
                      onReject={() => handleReject(member.id)}
                      isPending={activeTab === 'pending'}
                      isActing={isActing}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center" role="status">
                <div className="w-14 h-14 rounded-2xl bg-wline-2 dark:bg-rink-800 flex items-center justify-center mb-3">
                  <Icon name="person_off" className="text-3xl text-wtext-4 dark:text-rink-500" aria-hidden="true" />
                </div>
                <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                  {activeTab === 'pending' && '대기 중인 회원이 없습니다.'}
                  {activeTab === 'approved' && '승인된 회원이 없습니다.'}
                  {activeTab === 'rejected' && '거절된 회원이 없습니다.'}
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 일괄 처리 바 */}
      {selectedIds.size > 0 && activeTab === 'pending' && (
        <div className="fixed bottom-0 fixed-center-x z-40 p-4 bg-wbg/95 dark:bg-rink-900/95 pointer-events-none">
          <div className="flex gap-2.5 pointer-events-auto">
            <button
              type="button"
              onClick={handleBulkReject}
              disabled={isActing}
              aria-label={`선택한 ${selectedIds.size}명 일괄 거절하기`}
              className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] bg-white dark:bg-rink-800 border border-red-200 dark:border-red-900/40 shadow-md rounded-xl text-red-600 dark:text-red-400 font-bold text-card-body hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50"
            >
              <Icon name="block" className="text-[20px]" aria-hidden="true" />
              일괄 거절
            </button>
            <button
              type="button"
              onClick={handleBulkApprove}
              disabled={isActing}
              aria-label={`선택한 ${selectedIds.size}명 일괄 승인하기`}
              className="flex-[2] flex items-center justify-center gap-1.5 min-h-[48px] bg-ice-500 hover:bg-ice-700 shadow-md rounded-xl text-white font-bold text-card-title transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50"
            >
              {isActing ? (
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-w-pill animate-spin motion-reduce:animate-none" />
              ) : (
                <>
                  <Icon name="check_circle" className="text-[20px]" aria-hidden="true" />
                  일괄 승인 ({selectedIds.size})
                </>
              )}
            </button>
          </div>
        </div>
      )}
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
    </MobileContainer>
  );
}
