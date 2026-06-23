'use client';

/**
 * @deprecated 2026-05-18 — `AcademyStudentsTab` 으로 대체됨.
 *
 * SPEC_ACADEMY_STUDENTS_REDESIGN v1.0 에 따라 학원 멤버십(AcademyMember) 기반
 * 노출을 폐기하고 수업(Class.enrollments) 단위의 Master-Detail Drill-down 으로
 * 전환. 본 컴포넌트는 backward-compat 을 위해 코드만 유지되며 신규 사용 금지.
 *
 * 대체 경로:
 *   - 수업 카드 리스트 → `@/components/academy/AcademyStudentsTab`
 *   - 수업별 수강생   → `@/components/academy/AcademyClassStudentList`
 */
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type { AcademyMember } from '@/hooks/useAcademy';

type StatusFilter = 'all' | 'pending' | 'active' | 'inactive';

interface AcademyMemberListProps {
  members: AcademyMember[];
  onApprove?: (memberId: string) => void;
  onReject?: (memberId: string) => void;
  isLoading?: boolean;
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'active', label: '활성' },
  { key: 'inactive', label: '비활성' },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: '대기',
    className: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  },
  ACTIVE: {
    label: '활성',
    className: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
  },
  INACTIVE: {
    label: '비활성',
    className: 'bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-300',
  },
};

/**
 * AcademyMemberList - 오픈클래스 수강생 목록 + 승인/거절
 */
export function AcademyMemberList({ members, onApprove, onReject, isLoading = false }: AcademyMemberListProps) {
  const [activeTab, setActiveTab] = useState<StatusFilter>('all');

  const filteredMembers = useMemo(() => {
    if (activeTab === 'all') return members;
    return members.filter((m) => m.status.toLowerCase() === activeTab);
  }, [members, activeTab]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-7 h-7 border-2 border-ice-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* 상태 탭 */}
      <div className="flex gap-2 mb-4 overflow-x-auto hide-scrollbar">
        {STATUS_TABS.map((tab) => {
          const count = tab.key === 'all'
            ? members.length
            : members.filter((m) => m.status.toLowerCase() === tab.key).length;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ice-500',
                activeTab === tab.key
                  ? 'bg-ice-500 text-white'
                  : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-500'
              )}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* 멤버 목록 */}
      {filteredMembers.length === 0 ? (
        <div className="text-center py-10">
          <Icon name="group_off" className="text-4xl text-wtext-4 dark:text-rink-500 mb-2" />
          <p className="text-sm text-wtext-3 dark:text-rink-300">
            {MESSAGES.empty('수강생')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMembers.map((member) => {
            const badge = STATUS_BADGE[member.status.toUpperCase()] ?? STATUS_BADGE.INACTIVE;
            const isPending = member.status.toUpperCase() === 'PENDING';
            const displayName = member.child
              ? `${member.child.lastName}${member.child.firstName}`
              : `${member.user.lastName}${member.user.firstName}`;

            return (
              <div
                key={member.id}
                className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-wtext-1 dark:text-white truncate">
                        {displayName}
                      </span>
                      <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', badge.className)}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-wtext-3 dark:text-rink-300 truncate">
                      {member.user.email}
                    </p>
                    <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
                      {new Date(member.joinedAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onApprove?.(member.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium',
                          'bg-ice-500 text-white hover:bg-ice-700',
                          'transition-colors focus:outline-none focus:ring-2 focus:ring-ice-500'
                        )}
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject?.(member.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium',
                          'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100',
                          'hover:bg-wline dark:hover:bg-rink-500',
                          'transition-colors focus:outline-none focus:ring-2 focus:ring-ice-500/30'
                        )}
                      >
                        거절
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AcademyMemberList;
