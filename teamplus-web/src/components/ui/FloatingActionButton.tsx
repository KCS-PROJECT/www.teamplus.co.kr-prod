'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * FloatingActionButton — 우하단 플로팅 작성/추가 버튼 공통 컴포넌트.
 *
 * 위치는 `bottom-fab-safe`(safe-area + BottomNav 높이 반영) 기준으로 고정되어
 * BottomNav 바로 위에 일관되게 노출된다. (기존 페이지별 인라인 FAB의 bottom 값
 * 불일치 — bottom-24 등 — 를 단일 표준으로 통합)
 *
 * - `href` 지정 시 NavLink(전환 로더 연동), `onClick`만 지정 시 button 으로 렌더.
 */
export interface FloatingActionButtonProps {
  /** 링크 이동 경로 (NavLink) */
  href?: string;
  /** 액션 핸들러 (href 미지정 시 button) */
  onClick?: () => void;
  /** Material Symbols 아이콘 이름 (예: 'add', 'edit') */
  icon: string;
  /** 접근성 라벨 (한글) — 하드코딩 금지: MESSAGES 등에서 전달 */
  label: string;
  /** 위치/크기 등 추가 보정 클래스 (기본 위치 override 시) */
  className?: string;
}

const FAB_CLASS =
  'fixed bottom-fab-safe right-4 z-30 flex items-center justify-center size-14 rounded-w-pill bg-ice-500 text-white shadow-sh-1 hover:bg-ice-600 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible-disabled';

export function FloatingActionButton({
  href,
  onClick,
  icon,
  label,
  className,
}: FloatingActionButtonProps) {
  const iconEl = <Icon name={icon} className="text-2xl" aria-hidden="true" />;

  if (href) {
    return (
      <NavLink href={href} aria-label={label} className={cn(FAB_CLASS, className)}>
        {iconEl}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(FAB_CLASS, className)}
    >
      {iconEl}
    </button>
  );
}

export default FloatingActionButton;
