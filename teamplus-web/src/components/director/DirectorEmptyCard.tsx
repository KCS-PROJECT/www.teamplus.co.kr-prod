'use client';

/**
 * DirectorEmptyCard — 감독 홈 전용 Empty State 카드 (2026-05-09)
 *
 * 시각 명세 (참고자료 "05 · 감독 홈"):
 *   - 카드 : radius 18, border 1px wline, shadow 0 4px 14px rgba(20,24,38,.04),
 *           padding 32 20, flex column items-center gap 10
 *   - 아이콘 컨테이너 : 44×44 circle, bg=wbg
 *   - 텍스트 : 13 / 600 / wtext-3
 *
 * variant (2026-05-16 확장):
 *   - "today-class"   : 캘린더 아이콘 — "오늘 예정된 수업이 없습니다."
 *   - "notice"        : 메가폰 아이콘 — "등록된 공지가 없습니다"
 *   - "approval"      : person-check 아이콘 — "승인 대기 회원이 없습니다"  ※ 2026-05-16 신규
 *   - "coach"         : whistle 아이콘 — "등록된 코치가 없습니다"           ※ 2026-05-16 신규
 *   - "new-student"   : person-add 아이콘 — "신규 학생이 없습니다"          ※ 2026-05-16 신규
 */

import { ReactNode } from 'react';

import { MESSAGES } from '@/lib/messages';

interface Props {
  variant: 'today-class' | 'notice' | 'approval' | 'coach' | 'new-student';
  /** 외부에서 메시지 override (옵션) */
  message?: string;
}

// 기존 RecentNoticesSection.tsx 의 표준 문구 — `MESSAGES` 키가 없어 코드 전반에 동일
// 리터럴이 사용되므로 SoT 단일화를 위해 본 컴포넌트도 동일 리터럴 사용.
const NOTICE_EMPTY_TEXT = '등록된 공지가 없습니다';

function CalendarIcon(): ReactNode {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="14" height="12" rx="2" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} />
      <path
        d="M4 9h14M7 4v3M15 4v3M9 13h4M9 16h4"
        stroke="currentColor"
        className="text-wtext-3 dark:text-rink-300"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MegaphoneIcon(): ReactNode {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M3 9v4l3 1v3h2l-1-4 9-2 1 1V6l-1 1-9-2-3 1z"
        stroke="currentColor"
        className="text-wtext-3 dark:text-rink-300"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PersonCheckIcon(): ReactNode {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="9" cy="7" r="3" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} />
      <path d="M3 18c1.4-3.2 3.6-4.4 6-4.4" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M13 16l2 2 4-4" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonAddIcon(): ReactNode {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="9" cy="7" r="3" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} />
      <path d="M3 18c1.4-3.2 3.6-4.4 6-4.4" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M16 12v6M13 15h6" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

function WhistleIcon(): ReactNode {
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="8" cy="13" r="5" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} />
      <path d="M13 11l6-3M13 13l6 1" stroke="currentColor" className="text-wtext-3 dark:text-rink-300" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx="8" cy="13" r="1.5" fill="currentColor" className="text-wtext-3 dark:text-rink-300" />
    </svg>
  );
}

const TEXT_MAP: Record<Props['variant'], string> = {
  'today-class': MESSAGES.dashboard.noSchedule,
  'notice': NOTICE_EMPTY_TEXT,
  'approval': '승인 대기 회원이 없습니다',
  'coach': MESSAGES.empty('코치'),
  'new-student': '신규 학생이 없습니다',
};

const ICON_MAP: Record<Props['variant'], ReactNode> = {
  'today-class': <CalendarIcon />,
  'notice': <MegaphoneIcon />,
  'approval': <PersonCheckIcon />,
  'coach': <WhistleIcon />,
  'new-student': <PersonAddIcon />,
};

export function DirectorEmptyCard({ variant, message }: Props) {
  const text = message ?? TEXT_MAP[variant];
  const icon = ICON_MAP[variant];

  return (
    <div
      className="bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 flex flex-col items-center"
      style={{
        borderRadius: 18,
        boxShadow: '0 4px 14px rgba(20,24,38,0.04)',
        padding: '32px 20px',
        gap: 10,
      }}
      role="status"
    >
      <div
        className="bg-wbg dark:bg-rink-900 flex items-center justify-center"
        style={{ width: 44, height: 44, borderRadius: '50%' }}
      >
        {icon}
      </div>
      <p
        className="text-wtext-3 dark:text-rink-300"
        style={{ fontSize: 13, fontWeight: 600 }}
      >
        {text}
      </p>
    </div>
  );
}

export default DirectorEmptyCard;
