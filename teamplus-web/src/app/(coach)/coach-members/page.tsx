'use client';

import { useState, useCallback, useEffect, memo, useId } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
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

// ─── Member Row (ICETIMES flat — hairline 행) ────────
const MemberRow = memo(function MemberRow({ member, isLast }: { member: MemberInfo; isLast: boolean }) {
  return (
    <NavLink
      href={`/member/${member.id}`}
      className={cn(
        'flex w-full items-center gap-3 py-[13px] min-h-[56px] transition-colors motion-reduce:transition-none active:brightness-95',
        !isLast && 'border-b border-it-line dark:border-rink-700',
      )}
    >
      <div className="relative shrink-0">
        <div className="size-11 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center">
          <Icon name="person" className="text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 size-3 rounded-w-pill border-2 border-it-surface dark:border-rink-800',
            member.isActive ? 'bg-it-blue-500' : 'bg-it-ink-300 dark:bg-rink-500',
          )}
          aria-hidden="true"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white truncate">
            {member.name}
          </span>
          <span className="shrink-0 text-card-meta font-medium text-it-ink-500 dark:text-wtext-4">{member.age}세</span>
        </div>
        <div className="flex items-center gap-2 text-card-meta text-it-ink-500 dark:text-wtext-4">
          <span className="font-medium">{member.position}</span>
          <span className="text-card-meta">{member.level}</span>
        </div>
      </div>

      <div className="text-right shrink-0">
        <p
          className={cn(
            'text-card-body font-bold font-num tabular-nums',
            member.attendanceRate >= 90
              ? 'text-it-blue-500'
              : member.attendanceRate >= 70
                ? 'text-it-ink-700 dark:text-wtext-3'
                : 'text-it-red-500',
          )}
        >
          {member.attendanceRate}%
        </p>
        <p className="text-card-meta text-it-ink-400 dark:text-wtext-4">출석률</p>
      </div>

      <Icon name="chevron_right" className="text-[18px] text-it-ink-300 dark:text-rink-500 shrink-0" aria-hidden="true" />
    </NavLink>
  );
});

// ─── Pending Approval Row (ICETIMES flat) ────────────
const PendingRow = memo(function PendingRow({
  member,
  isLast,
  onApprove,
  onReject,
}: {
  member: PendingMember;
  isLast: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-[13px] min-h-[56px]',
        !isLast && 'border-b border-it-line dark:border-rink-700',
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-900/30">
        <Icon name="person_add" className="text-[18px] text-it-blue-500" aria-hidden="true" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-it-ink-800 dark:text-white truncate">{member.name}</p>
        <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 truncate">
          {member.className} · {member.requestedAt}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onReject(member.id)}
          className="flex size-9 items-center justify-center rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface text-it-ink-500 transition-colors motion-reduce:transition-none hover:bg-it-fill active:brightness-95 dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700"
          aria-label={`${member.name} 거절`}
        >
          <Icon name="close" className="text-[18px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onApprove(member.id)}
          className="flex size-9 items-center justify-center rounded-w-md bg-it-blue-500 text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95"
          aria-label={`${member.name} 승인`}
        >
          <Icon name="check" className="text-[18px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});

// ─── Filter Chip (ICETIMES — h36 · border 1.5px · pill) ──
function FilterChip({ label, count, isActive, onClick }: { label: string; count: number; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={`${label} 회원 ${count}명${isActive ? ', 선택됨' : ''}`}
      onClick={onClick}
      className={cn(
        'flex-shrink-0 snap-start inline-flex h-9 items-center gap-1.5 rounded-w-pill border-[1.5px] px-4 text-card-body font-bold transition-colors whitespace-nowrap motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 focus:outline-none active:brightness-95',
        isActive
          ? 'border-it-blue-500 bg-it-blue-500 text-white'
          : 'border-it-line-strong bg-it-surface text-it-ink-600 hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700',
      )}
    >
      <span aria-hidden="true" className="truncate max-w-[80px]">{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'min-w-[20px] h-5 px-1.5 rounded-w-pill text-card-meta font-bold flex items-center justify-center font-num tabular-nums',
          isActive ? 'bg-white/20 text-white' : 'bg-it-line dark:bg-rink-700 text-it-ink-500 dark:text-wtext-4',
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────
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

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck" role="main" aria-label="회원 관리">
        {/* 검색 + 푸시 발송 진입 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-4" aria-label="회원 검색">
          <div className="relative">
            <label htmlFor={searchInputId} className="sr-only">회원 이름 검색</label>
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-it-ink-400 dark:text-wtext-4"
              aria-hidden="true"
            />
            <input
              id={searchInputId}
              type="search"
              placeholder={MESSAGES.placeholders.searchMember}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="회원 이름 검색"
              autoComplete="off"
              className="h-12 w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 pl-11 pr-4 text-[15px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
            />
          </div>

          {/* 푸시 알림 발송 진입 — hairline 행 */}
          <NavLink
            href="/coach-members/push"
            className="mt-4 flex items-center gap-3 border-t border-it-line dark:border-rink-700 pt-4 transition-colors motion-reduce:transition-none active:brightness-95"
            aria-label={`${MESSAGES.memberPush.pageTitle} ${MESSAGES.memberPush.entryAction}하기`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-900/30">
              <Icon name="campaign" className="text-[20px] text-it-blue-500" aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-it-ink-800 dark:text-white truncate">
                {MESSAGES.memberPush.pageTitle}
              </p>
              <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 truncate">
                {MESSAGES.memberPush.description}
              </p>
            </div>
            <Icon name="chevron_right" className="text-[18px] text-it-ink-300 dark:text-rink-500 shrink-0" aria-hidden="true" />
          </NavLink>
        </section>

        {/* 승인 대기 — flat 흰 섹션 */}
        {pendingMembers.length > 0 && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5" aria-labelledby="pending-approval-heading">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-baseline gap-2">
                  <h2
                    id="pending-approval-heading"
                    className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white"
                  >
                    승인 대기
                  </h2>
                  <span
                    className="text-[15px] font-extrabold font-num tabular-nums text-it-red-500"
                    aria-label={`${pendingMembers.length}명 대기 중`}
                  >
                    {pendingMembers.length}
                  </span>
                </div>
                <NavLink
                  href="/director-approvals"
                  className="inline-flex items-center gap-0.5 text-card-body font-bold text-it-blue-500 transition-colors motion-reduce:transition-none hover:text-it-blue-600"
                >
                  {MESSAGES.dashboard.viewAll}
                  <Icon name="chevron_right" className="text-[18px]" aria-hidden="true" />
                </NavLink>
              </div>
              <ul className="flex flex-col list-none" role="list" aria-label="승인 대기 회원 목록">
                {pendingMembers.map((pm, idx) => (
                  <li key={pm.id} role="listitem">
                    <PendingRow
                      member={pm}
                      isLast={idx === pendingMembers.length - 1}
                      onApprove={handleApprove}
                      onReject={handleReject}
                    />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 회원 목록 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-7" aria-labelledby="members-list-heading">
          {/* 목록 헤더 — SectionHead 위계 */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-baseline gap-2">
              <h2
                id="members-list-heading"
                className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white"
              >
                회원 목록
              </h2>
              <span
                className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500"
                aria-label={`전체 ${counts.all}명`}
              >
                {counts.all}
              </span>
            </div>
            <NavLink
              href="/members-create"
              className="inline-flex h-9 items-center gap-1 rounded-w-md bg-it-blue-500 px-3 text-card-meta font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95"
              aria-label={`${MESSAGES.dashboard.stats.newMembers} 등록하기`}
            >
              <Icon name="person_add" className="text-[16px]" aria-hidden="true" />
              <span>{MESSAGES.dashboard.stats.newMembers}</span>
            </NavLink>
          </div>

          {/* 필터 칩 */}
          <div
            className="flex gap-2 py-3 overflow-x-auto hide-scrollbar snap-x snap-mandatory"
            role="tablist"
            aria-label="회원 상태 필터"
          >
            <FilterChip label="전체" count={counts.all} isActive={activeTab === 'all'} onClick={() => setActiveTab('all')} />
            <FilterChip label="활성" count={counts.active} isActive={activeTab === 'active'} onClick={() => setActiveTab('active')} />
            <FilterChip label="비활성" count={counts.inactive} isActive={activeTab === 'inactive'} onClick={() => setActiveTab('inactive')} />
          </div>

          {/* 회원 목록 (heading 은 위 헤더에서 id="members-list-heading" 으로 노출됨) */}
          {isLoading ? null : filtered.length > 0 ? (
            <ul className="flex flex-col list-none" role="list" aria-label={`소속 회원 ${filtered.length}명`}>
              {filtered.map((member, idx) => (
                <li key={member.id} role="listitem">
                  <MemberRow member={member} isLast={idx === filtered.length - 1} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center" role="status">
              <p className="text-card-body font-medium text-it-ink-700 dark:text-wtext-4">
                {searchQuery ? '검색 결과가 없습니다.' : MESSAGES.empty('회원')}
              </p>
            </div>
          )}
        </section>

        <div className="h-6 bg-it-canvas dark:bg-puck" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
