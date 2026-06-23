'use client';

import { useState, useCallback, useEffect, memo, useId } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';

// ─── Types ──────────────────────────────────────────
interface MemberInfo {
  id: string;
  name: string;
  age: number;
  position: string;
  level: string;
  attendanceRate: number;
  isActive: boolean;
  joinedAt: string;
}

interface PendingMember {
  id: string;
  name: string;
  className: string;
  requestedAt: string;
}

type TabKey = 'all' | 'active' | 'inactive';

// ─── Member Card ──────────────────────────────────
const MemberCard = memo(function MemberCard({ member }: { member: MemberInfo }) {
  return (
    <NavLink
      href={`/member/${member.id}`}
      className="flex items-center gap-3 p-4 bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 hover:border-ice-500/30 transition-colors active:brightness-95"
    >
      <div className="relative">
        <div className="h-11 w-11 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
          <Icon name="person" className="text-wtext-3 dark:text-rink-300" aria-hidden="true" />
        </div>
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-w-pill border-2 border-white dark:border-rink-800',
          member.isActive ? 'bg-green-500' : 'bg-wtext-4'
        )} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-card-body font-bold text-wtext-1 dark:text-white truncate">{member.name}</span>
          <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">{member.age}세</span>
        </div>
        <div className="flex items-center gap-2 text-card-meta text-wtext-3 dark:text-rink-300">
          <span className="font-medium">{member.position}</span>
          <span className="text-wtext-4 dark:text-rink-500">|</span>
          <span>{member.level}</span>
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className={cn(
          'text-card-body font-bold tabular-nums',
          member.attendanceRate >= 90 ? 'text-emerald-600 dark:text-emerald-400'
            : member.attendanceRate >= 70 ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
        )}>
          {member.attendanceRate}%
        </p>
        <p className="text-card-meta text-wtext-3 dark:text-rink-300">출석률</p>
      </div>

      <Icon name="chevron_right" className="text-wtext-4 dark:text-rink-500 shrink-0" aria-hidden="true" />
    </NavLink>
  );
});

// ─── Pending Approval Card ────────────────────────
const PendingCard = memo(function PendingCard({
  member,
  onApprove,
  onReject,
}: {
  member: PendingMember;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200/50 dark:border-amber-800/30">
      <div className="w-9 h-9 rounded-w-pill bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
        <Icon name="person_add" className="text-amber-600 dark:text-amber-400 text-[16px]" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">{member.name}</p>
        <p className="text-card-meta text-wtext-3 dark:text-rink-300">{member.className} · {member.requestedAt}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => onReject(member.id)}
          className="w-8 h-8 rounded-lg bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 flex items-center justify-center hover:bg-wbg dark:hover:bg-rink-700 transition-colors"
          aria-label={`${member.name} 거절`}
        >
          <Icon name="close" className="text-[16px] text-wtext-3 dark:text-rink-300" />
        </button>
        <button
          onClick={() => onApprove(member.id)}
          className="w-8 h-8 rounded-lg bg-ice-500 text-white flex items-center justify-center hover:bg-ice-700 transition-colors"
          aria-label={`${member.name} 승인`}
        >
          <Icon name="check" className="text-[16px]" />
        </button>
      </div>
    </div>
  );
});

// ─── Filter Tab ───────────────────────────────────
// [C2 fix 2026-05-14] px-4 → px-3, py-2 유지, flex-shrink-0 + truncate + scroll-snap
//  탭 3개(전체/활성/비활성)가 좁은 폰 폭에서도 모두 보이도록 패딩 축소 + 스냅 정렬.
function FilterTab({ label, count, isActive, onClick }: { label: string; count: number; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={`${label} 회원 ${count}명${isActive ? ', 선택됨' : ''}`}
      onClick={onClick}
      className={cn(
        'flex-shrink-0 snap-start flex items-center gap-1.5 px-3 py-2 rounded-w-pill text-card-body font-medium transition-colors whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none',
        isActive
          ? 'bg-ice-500 text-white'
          : 'bg-wline-2 dark:bg-rink-800 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-700'
      )}
    >
      <span aria-hidden="true" className="truncate max-w-[80px]">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'min-w-[20px] h-5 px-1.5 rounded-w-pill text-card-meta font-bold flex items-center justify-center tabular-nums',
          isActive ? 'bg-white/20 text-white' : 'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Main Page ───────────────────────────────────
export default function CoachMembersPage() {
  const { toast } = useToast();
  const searchInputId = useId();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      setMembers([
        { id: '1', name: '김민준', age: 11, position: '센터', level: '초급반', attendanceRate: 95, isActive: true, joinedAt: '2025-09' },
        { id: '2', name: '이서연', age: 12, position: '라이트윙', level: '중급반', attendanceRate: 88, isActive: true, joinedAt: '2025-06' },
        { id: '3', name: '박지호', age: 10, position: '디펜스', level: '초급반', attendanceRate: 72, isActive: true, joinedAt: '2025-11' },
        { id: '4', name: '최예은', age: 13, position: '골키퍼', level: '고급반', attendanceRate: 98, isActive: true, joinedAt: '2025-03' },
        { id: '5', name: '정현우', age: 11, position: '레프트윙', level: '중급반', attendanceRate: 65, isActive: false, joinedAt: '2025-08' },
        { id: '6', name: '강서윤', age: 9, position: '센터', level: '초급반', attendanceRate: 82, isActive: true, joinedAt: '2025-12' },
        { id: '7', name: '조민서', age: 14, position: '디펜스', level: '고급반', attendanceRate: 91, isActive: true, joinedAt: '2025-01' },
        { id: '8', name: '윤하준', age: 10, position: '라이트윙', level: '중급반', attendanceRate: 78, isActive: false, joinedAt: '2025-10' },
      ]);
      setPendingMembers([
        { id: 'p1', name: '한소희', className: '기초 스케이팅', requestedAt: '3일 전' },
        { id: 'p2', name: '김도현', className: '슈팅 클리닉', requestedAt: '1일 전' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = useCallback((id: string) => {
    setPendingMembers(prev => prev.filter(m => m.id !== id));
    toast.success(MESSAGES.approval.approved);
  }, [toast]);

  const handleReject = useCallback((id: string) => {
    setPendingMembers(prev => prev.filter(m => m.id !== id));
    toast.success(MESSAGES.approval.rejected);
  }, [toast]);

  // 필터
  const filtered = members.filter(m => {
    if (activeTab === 'active' && !m.isActive) return false;
    if (activeTab === 'inactive' && m.isActive) return false;
    if (searchQuery && !m.name.includes(searchQuery)) return false;
    return true;
  });

  const counts = {
    all: members.length,
    active: members.filter(m => m.isActive).length,
    inactive: members.filter(m => !m.isActive).length,
  };

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title="회원 관리" />

      {/* C2 fix 2026-05-14 — py-4 → pt-2.5 pb-30. 다른 (coach) 페이지(classes-manage 등)와 top padding 통일.
          앱 환경에서 SubmainAppBar 아래 첫 컨텐츠 위치가 일관되게 보이도록 보정. */}
      <main className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-2.5 pb-30">
        {/* 검색 */}
        <div className="relative mb-4">
          <label htmlFor={searchInputId} className="sr-only">회원 이름 검색</label>
          <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-wtext-3 text-card-title" aria-hidden="true" />
          <input
            id={searchInputId}
            type="search"
            placeholder={MESSAGES.placeholders.searchMember}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="회원 이름 검색"
            autoComplete="off"
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 rounded-xl text-card-body placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-ice-500/20 focus:border-ice-500"
          />
        </div>

        {/* 푸시 알림 발송 진입 — 코치가 담당 팀 회원에게 알림 발송 */}
        <NavLink
          href="/coach-members/push"
          className="mb-4 flex items-center gap-3 p-3.5 bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 hover:border-ice-500/30 transition-colors motion-reduce:transition-none active:brightness-95"
          aria-label={`${MESSAGES.memberPush.pageTitle} ${MESSAGES.memberPush.entryAction}하기`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-w-pill bg-ice-50 dark:bg-ice-500/15">
            <Icon name="campaign" className="text-[20px] text-ice-500" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
              {MESSAGES.memberPush.pageTitle}
            </p>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
              {MESSAGES.memberPush.description}
            </p>
          </div>
          <Icon name="chevron_right" className="text-wtext-4 dark:text-rink-500 shrink-0" aria-hidden="true" />
        </NavLink>

        {/* 승인 대기 */}
        {pendingMembers.length > 0 && (
          <section className="mb-5" aria-labelledby="pending-approval-heading">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2
                  id="pending-approval-heading"
                  className="text-card-body font-bold text-wtext-1 dark:text-white"
                >
                  승인 대기
                </h2>
                <span
                  className="min-w-[20px] h-5 px-1.5 rounded-w-pill bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-card-meta font-bold flex items-center justify-center"
                  aria-label={`${pendingMembers.length}명 대기 중`}
                >
                  {pendingMembers.length}
                </span>
              </div>
              <NavLink href="/director-approvals" className="text-card-meta text-ice-500 font-medium">
                {MESSAGES.dashboard.viewAll}
              </NavLink>
            </div>
            <ul className="flex flex-col gap-2 list-none" role="list" aria-label="승인 대기 회원 목록">
              {pendingMembers.map(pm => (
                <li key={pm.id} role="listitem">
                  <PendingCard member={pm} onApprove={handleApprove} onReject={handleReject} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 회원 목록 헤더 (C2 fix 2026-05-14) — 신규 회원 버튼 박스 내부 우측 상단 배치 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2
              id="members-list-heading"
              className="text-card-body font-bold text-wtext-1 dark:text-white"
            >
              회원 목록
            </h2>
            <span
              className="min-w-[20px] h-5 px-1.5 rounded-w-pill bg-ice-50 dark:bg-ice-500/15 text-ice-500 text-card-meta font-bold flex items-center justify-center tabular-nums"
              aria-label={`전체 ${counts.all}명`}
            >
              {counts.all}
            </span>
          </div>
          <NavLink
            href="/members-create"
            className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-ice-500 hover:bg-ice-700 text-white text-card-meta font-bold transition-colors motion-reduce:transition-none active:brightness-95"
            aria-label={`${MESSAGES.dashboard.stats.newMembers} 등록하기`}
          >
            <Icon name="person_add" className="text-[16px]" aria-hidden="true" />
            <span>{MESSAGES.dashboard.stats.newMembers}</span>
          </NavLink>
        </div>

        {/* 탭 필터 — overflow-x-auto + snap-x mandatory + FilterTab flex-shrink-0 (C2 fix 2026-05-14) */}
        <div
          className="flex gap-2 mb-4 overflow-x-auto hide-scrollbar snap-x snap-mandatory"
          role="tablist"
          aria-label="회원 상태 필터"
        >
          <FilterTab label="전체" count={counts.all} isActive={activeTab === 'all'} onClick={() => setActiveTab('all')} />
          <FilterTab label="활성" count={counts.active} isActive={activeTab === 'active'} onClick={() => setActiveTab('active')} />
          <FilterTab label="비활성" count={counts.inactive} isActive={activeTab === 'inactive'} onClick={() => setActiveTab('inactive')} />
        </div>

        {/* 회원 목록 (heading 은 위 박스 헤더에서 id="members-list-heading" 으로 노출됨) */}
        <section aria-labelledby="members-list-heading">
          {isLoading ? null : filtered.length > 0 ? (
            <ul className="flex flex-col gap-3 list-none" role="list" aria-label={`소속 선수 ${filtered.length}명`}>
              {filtered.map(member => (
                <li key={member.id} role="listitem">
                  <MemberCard member={member} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center" role="status">
              <Icon name="person_search" className="text-4xl text-wtext-4 dark:text-rink-500 mb-3" aria-hidden="true" />
              <p className="text-card-body text-wtext-3 dark:text-rink-300">
                {searchQuery ? '검색 결과가 없습니다.' : MESSAGES.empty('회원')}
              </p>
            </div>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
