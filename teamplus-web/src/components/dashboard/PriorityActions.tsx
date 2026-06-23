'use client';

import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';

export interface PriorityActionsProps {
  pendingApprovals: number;
  todayNewMembers: number;
}

/**
 * 우선 처리 항목 알림 카드
 * Design 7 Principles 적용 · AI 스타일 금지
 */
export function PriorityActions({ pendingApprovals, todayNewMembers }: PriorityActionsProps) {
  if (pendingApprovals === 0 && todayNewMembers === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 승인 대기 알림 */}
      {pendingApprovals > 0 && (
        <NavLink href="/members" aria-label={`신규 회원 승인 대기 ${pendingApprovals}명`}>
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 active:brightness-95 transition-all duration-200 ease-out">
            <div className="flex-shrink-0 p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <Icon name="warning" className="text-xl text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {MESSAGES.dashboard.pendingApprovalAlert} {pendingApprovals}명
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                {MESSAGES.dashboard.viewDetail}
              </p>
            </div>
            <Icon name="chevron_right" className="text-xl text-amber-400 dark:text-amber-500 flex-shrink-0" aria-hidden="true" />
          </div>
        </NavLink>
      )}

      {/* 오늘 신규 가입 */}
      {todayNewMembers > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
          <div className="flex-shrink-0 p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <Icon name="person_add" className="text-xl text-ice-500 dark:text-blue-400" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-wtext-1 dark:text-white">
              {MESSAGES.dashboard.todayNewMember} {todayNewMembers}명
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
