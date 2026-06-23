'use client';

import { memo } from 'react';
import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * CoachMemberCard - 코치 담당 회원 카드
 *
 * 사용처: coach-members 목록, coach 대시보드 회원 섹션
 * 패턴: 아바타 + 이름/레벨/스케줄 + 출석률 + 화살표
 */
export interface CoachMemberCardProps {
  /** 회원 ID */
  id: string;
  /** 회원 이름 */
  name: string;
  /** 레벨/반 (예: '초급반') */
  level: string;
  /** 수업 스케줄 (예: '월/수/금') */
  schedule: string;
  /** 프로필 이미지 URL */
  avatarUrl?: string;
  /** 출석률 (0-100) */
  attendanceRate: number;
  /** 활동 상태 */
  isActive: boolean;
  /** 상세 링크 (기본: /member/{id}) */
  href?: string;
  /** 추가 className */
  className?: string;
}

/** 출석률 기반 텍스트 색상 */
function getAttendanceRateColor(rate: number): string {
  if (rate >= 90) return 'text-green-600 dark:text-green-400';
  if (rate >= 70) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

export const CoachMemberCard = memo(function CoachMemberCard({
  id,
  name,
  level,
  schedule,
  avatarUrl,
  attendanceRate,
  isActive,
  href,
  className,
}: CoachMemberCardProps) {
  return (
    <NavLink
      href={href ?? `/member/${id}`}
      className={cn(
        'flex items-center gap-4 p-4',
        'bg-white dark:bg-rink-800 rounded-xl',
        'border border-wline-2 dark:border-rink-700',
        'hover:border-ice-500/30 transition-colors',
        'active:brightness-95',
        className
      )}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="h-12 w-12 rounded-full bg-wline dark:bg-rink-700 bg-cover bg-center flex items-center justify-center overflow-hidden"
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
        >
          {!avatarUrl && (
            <Icon name="person" className="text-wtext-3 dark:text-rink-300" aria-hidden="true" />
          )}
        </div>
        <div
          className={cn(
            'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-rink-800',
            isActive ? 'bg-green-500' : 'bg-wtext-4'
          )}
          aria-label={isActive ? '활성' : '비활성'}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-wtext-1 dark:text-white truncate">{name}</p>
        <p className="text-xs text-wtext-3 dark:text-rink-300 mt-0.5">
          {level} &middot; {schedule}
        </p>
      </div>

      {/* Attendance Rate */}
      <div className="text-right flex-shrink-0">
        <p className={cn('text-sm font-bold tabular-nums', getAttendanceRateColor(attendanceRate))}>
          {attendanceRate}%
        </p>
        <p className="text-[10px] text-wtext-3 dark:text-rink-300">출석률</p>
      </div>

      {/* Arrow */}
      <Icon
        name="chevron_right"
        className="text-wtext-4 dark:text-rink-500 flex-shrink-0"
        aria-hidden="true"
      />
    </NavLink>
  );
});
