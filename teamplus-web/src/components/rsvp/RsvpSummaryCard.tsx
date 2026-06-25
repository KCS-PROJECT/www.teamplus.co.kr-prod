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
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 Card 박스 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 → flat 흰 섹션 + hairline 탭/구분선, it-* 토큰 적용.
   *   (현재 /coach-rsvp 화면만 전달.)
   */
  iceTheme?: boolean;
}

export function RsvpSummaryCard({
  schedule,
  summary,
  onRemindNoResponse,
  loading = false,
  className,
  iceTheme = false,
}: RsvpSummaryCardProps) {
  const [expandedTab, setExpandedTab] = useState<'attending' | 'declined' | 'noResponse'>('attending');
  const trainingColor = getTrainingColor(schedule.trainingType);

  // 응답 상태색 — ROLLOUT §3 정합: 참석=emerald · 불참=it-red · 미응답=amber.
  const tabs: { key: 'attending' | 'declined' | 'noResponse'; label: string; count: number; icon: string; colorClass: string }[] = iceTheme
    ? [
        { key: 'attending', label: '참석', count: summary.attending, icon: 'check_circle', colorClass: 'text-emerald-600 dark:text-emerald-400' },
        { key: 'declined', label: '불참', count: summary.declined, icon: 'cancel', colorClass: 'text-it-red-500 dark:text-it-red-300' },
        { key: 'noResponse', label: '미응답', count: summary.noResponse, icon: 'help', colorClass: 'text-amber-500 dark:text-amber-400' },
      ]
    : [
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

  // ICETIMES flat — 카드 박스 제거. flat 흰 섹션(부모 회색 캔버스 위) + hairline 탭/구분선.
  if (iceTheme) {
    return (
      <div className={cn('bg-it-surface dark:bg-it-blue-950 rounded-w-md overflow-hidden border border-it-line dark:border-it-blue-900', className)}>
        {/* 헤더 */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-w-pill text-[12px] font-bold text-white',
                trainingColor.bg,
                trainingColor.darkBg
              )}
            >
              {trainingColor.label}
            </span>
            <span className="text-[13px] font-medium text-it-ink-500 dark:text-rink-300 tabular-nums">
              {schedule.date}({schedule.dayOfWeek})
            </span>
          </div>
          <h3 className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
            {schedule.title} 참석 현황
          </h3>
        </div>

        {/* 탭 바 — hairline 경계 + 활성 it-blue underline */}
        <div className="flex border-y border-it-line dark:border-it-blue-900">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setExpandedTab(tab.key)}
              aria-pressed={expandedTab === tab.key}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3 text-[13.5px] font-bold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40',
                expandedTab === tab.key
                  ? 'bg-it-fill dark:bg-it-blue-900/40 border-b-2 border-it-blue-500 text-it-ink-800 dark:text-white'
                  : 'text-it-ink-500 dark:text-rink-300 hover:bg-it-fill dark:hover:bg-it-blue-900/30'
              )}
            >
              <Icon name={tab.icon} className={cn('text-[16px]', tab.colorClass)} aria-hidden="true" />
              <span>{tab.label}</span>
              <span className={cn(
                'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-w-pill text-[11px] font-bold font-num tabular-nums',
                expandedTab === tab.key
                  ? 'bg-it-blue-500 text-white'
                  : 'bg-it-fill text-it-ink-600 dark:bg-it-blue-900 dark:text-rink-200'
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* 회원 목록 — hairline 행 */}
        <div className="px-4 py-2">
          {currentMembers.length > 0 ? (
            <ul className="flex flex-col divide-y divide-it-line dark:divide-it-blue-900">
              {currentMembers.map((member) => (
                <MemberRow key={member.memberId} member={member} tab={expandedTab} iceTheme />
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-it-ink-500 dark:text-rink-300 text-center py-5">
              {MESSAGES.empty(
                expandedTab === 'attending' ? '참석자' :
                expandedTab === 'declined' ? '불참자' : '미응답자'
              )}
            </p>
          )}
        </div>

        {/* 미응답자 알림 버튼 */}
        {expandedTab === 'noResponse' && summary.noResponse > 0 && onRemindNoResponse && (
          <div className="px-4 pb-4 pt-1">
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
      </div>
    );
  }

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
  iceTheme = false,
}: {
  member: RsvpMemberInfo;
  tab: 'attending' | 'declined' | 'noResponse';
  iceTheme?: boolean;
}) {
  if (iceTheme) {
    return (
      <li className="flex items-center justify-between py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-w-pill bg-it-fill dark:bg-it-blue-900 flex items-center justify-center">
            <Icon name="person" className="text-it-ink-400 dark:text-rink-300 text-[16px]" aria-hidden="true" />
          </div>
          <span className="text-[14px] font-bold text-it-ink-800 dark:text-white">
            {member.memberName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'declined' && member.declineReason && (
            <span className="text-[12px] text-it-ink-500 dark:text-rink-300 max-w-[120px] truncate">
              {member.declineReason}
            </span>
          )}
          {member.respondedAt && (
            <span className="text-[12px] text-it-ink-400 dark:text-rink-300 tabular-nums">
              {member.respondedAt}
            </span>
          )}
        </div>
      </li>
    );
  }

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
