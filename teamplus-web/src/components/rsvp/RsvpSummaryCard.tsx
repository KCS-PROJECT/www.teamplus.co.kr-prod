'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { getTrainingColor } from '@/lib/calendar-colors';
import type { RsvpScheduleInfo, RsvpSummary, RsvpMemberInfo } from '@/types/rsvp';

/**
 * RsvpSummaryCard - 감독/코치용 참석 현황 요약 카드
 * TEAMPLUS Design System
 *
 * Design 7 Principles:
 * - 솔리드 컬러만 사용 (gradient 금지)
 * - Primary: bg-ice-500
 * - messages.ts 상수 사용
 */

interface RsvpSummaryCardProps {
  schedule: RsvpScheduleInfo;
  summary: RsvpSummary;
  onRemindNoResponse?: (memberIds: string[]) => void;
  loading?: boolean;
  className?: string;
}

export function RsvpSummaryCard({
  schedule,
  summary,
  onRemindNoResponse,
  loading = false,
  className,
}: RsvpSummaryCardProps) {
  const [expandedTab, setExpandedTab] = useState<'attending' | 'declined' | 'noResponse'>('attending');
  const trainingColor = getTrainingColor(schedule.trainingType);

  const tabs: { key: 'attending' | 'declined' | 'noResponse'; label: string; count: number; icon: string; colorClass: string }[] = [
    { key: 'attending', label: '참석', count: summary.attending, icon: 'check_circle', colorClass: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'declined', label: '불참', count: summary.declined, icon: 'cancel', colorClass: 'text-red-500 dark:text-red-400' },
    { key: 'noResponse', label: '미응답', count: summary.noResponse, icon: 'help', colorClass: 'text-amber-500 dark:text-amber-400' },
  ];

  const memberListMap: Record<string, RsvpMemberInfo[]> = {
    attending: summary.attendingMembers,
    declined: summary.declinedMembers,
    noResponse: summary.noResponseMembers,
  };

  const currentMembers = memberListMap[expandedTab];

  const handleRemind = () => {
    if (!onRemindNoResponse) return;
    const ids = summary.noResponseMembers.map((m) => m.memberId);
    onRemindNoResponse(ids);
  };

  return (
    <Card variant="default" padding="none" className={className}>
      {/* 헤더 */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-white',
              trainingColor.bg,
              trainingColor.darkBg
            )}
          >
            {trainingColor.label}
          </span>
          <span className="text-sm text-wtext-3 dark:text-rink-300">
            {schedule.date}({schedule.dayOfWeek})
          </span>
        </div>
        <h3 className="text-base font-bold text-wtext-1 dark:text-white">
          {schedule.title} 참석 현황
        </h3>
      </div>

      {/* 탭 바 */}
      <div className="flex border-y border-wline-2 dark:border-rink-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setExpandedTab(tab.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors',
              expandedTab === tab.key
                ? 'bg-wbg dark:bg-rink-800 border-b-2 border-ice-500 text-wtext-1 dark:text-white'
                : 'text-wtext-3 dark:text-rink-300 hover:bg-wbg dark:hover:bg-rink-800'
            )}
          >
            <Icon name={tab.icon} className={cn('text-[16px]', tab.colorClass)} />
            <span>{tab.label}</span>
            <span className={cn(
              'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-xs font-bold',
              expandedTab === tab.key
                ? 'bg-ice-500 text-white'
                : 'bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-300'
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 회원 목록 */}
      <div className="p-4">
        {currentMembers.length > 0 ? (
          <ul className="space-y-2">
            {currentMembers.map((member) => (
              <MemberRow key={member.memberId} member={member} tab={expandedTab} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-wtext-3 dark:text-rink-300 text-center py-4">
            {MESSAGES.empty(
              expandedTab === 'attending' ? '참석자' :
              expandedTab === 'declined' ? '불참자' : '미응답자'
            )}
          </p>
        )}
      </div>

      {/* 미응답자 알림 버튼 */}
      {expandedTab === 'noResponse' && summary.noResponse > 0 && onRemindNoResponse && (
        <div className="px-4 pb-4">
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={handleRemind}
            loading={loading}
          >
            미응답자 알림 보내기
          </Button>
        </div>
      )}
    </Card>
  );
}

/** 회원 행 */
function MemberRow({
  member,
  tab,
}: {
  member: RsvpMemberInfo;
  tab: 'attending' | 'declined' | 'noResponse';
}) {
  return (
    <li className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
          <Icon name="person" className="text-wtext-3 dark:text-rink-300 text-[16px]" />
        </div>
        <span className="text-sm font-medium text-wtext-1 dark:text-white">
          {member.memberName}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {tab === 'declined' && member.declineReason && (
          <span className="text-xs text-wtext-3 dark:text-rink-300 max-w-[120px] truncate">
            {member.declineReason}
          </span>
        )}
        {member.respondedAt && (
          <span className="text-xs text-wtext-3 dark:text-rink-300">
            {member.respondedAt}
          </span>
        )}
      </div>
    </li>
  );
}
