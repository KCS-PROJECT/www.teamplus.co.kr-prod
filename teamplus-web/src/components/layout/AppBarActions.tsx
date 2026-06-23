'use client';

/**
 * AppBarActions — 모든 화면에서 import 해서 사용할 수 있는 AppBar 우측 액션 컴포넌트.
 *
 * 단일 SoT (Single Source of Truth):
 *   - PageAppBar 의 main/submain/detail variant 우측 영역
 *   - 임의의 커스텀 헤더에서도 동일 디자인으로 import 가능
 *
 * 디자인 (참고자료 "04c · 감독 수업 상세 (개선)" AppBar 패턴):
 *   - 40×40 버튼 (rounded-full · hover bg-wline-2)
 *   - 24px Material Symbol 아이콘
 *   - 6×6 단순 점 배지 (분홍 #ec4899 — 알림/타임라인 신규 표시)
 *
 * 사용 예시:
 * ```tsx
 * import {
 *   AppBarActionButton,
 *   AppBarRight3Actions,
 *   AppBarTimelineButton,
 *   AppBarNotificationButton,
 *   AppBarMenuButton,
 * } from '@/components/layout/AppBarActions';
 *
 * // 1) 통합: 시계 + 종 + 햄버거 (가장 일반적인 패턴)
 * <header>
 *   <h1>제목</h1>
 *   <AppBarRight3Actions
 *     onTimeline={() => router.push('/timeline')}
 *     onNotification={() => router.push('/notifications')}
 *     onMenu={() => setMenuOpen(true)}
 *     notificationBadge={hasUnread}
 *   />
 * </header>
 *
 * // 2) 개별: 일부만 사용
 * <AppBarTimelineButton onClick={...} badge={hasUnread} />
 * <AppBarMenuButton onClick={...} />
 *
 * // 3) 임의 아이콘: 공통 디자인 톤만 차용
 * <AppBarActionButton icon="settings" label="설정" onClick={...} />
 * ```
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// 단일 액션 버튼 (모든 AppBar 아이콘 버튼의 기본 단위)
// ──────────────────────────────────────────────────────────

export interface AppBarActionButtonProps {
  /** Material Symbol 아이콘 이름 (예: 'schedule', 'notifications', 'menu') */
  icon: string;
  /** 접근성 라벨 (필수) */
  label: string;
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 점 배지 표시 여부 — true 면 우상단 6×6 분홍 점 노출 */
  badge?: boolean;
  /** 다크 톤 (헤더 자체가 다크 배경일 때) */
  isDark?: boolean;
  /**
   * 활성 상태 — 현재 페이지가 이 액션의 destination 과 일치할 때 true.
   * [추가 2026-05-19] 사용자 직접 지시 — BottomNav tab 처럼 활성 시 파란색(ice-500)
   *   표시. 타임라인/알림 아이콘이 각각 /timeline · /notifications 진입 후 active.
   *   ARIA: `aria-current="page"` 자동 부여, 아이콘 weight 500→700 강화.
   */
  isActive?: boolean;
  /** 추가 클래스 */
  className?: string;
}

export function AppBarActionButton({
  icon,
  label,
  onClick,
  badge,
  isDark,
  isActive,
  className,
}: AppBarActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}${isActive ? ' (현재 페이지)' : ''}`}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center justify-center border-0 relative p-0 rounded-full size-10',
        'transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.94]',
        'motion-reduce:transition-none',
        isActive
          ? // [수정 2026-05-19] 활성 톤 — BottomNav 와 동일 ice-500 색 + 작은
            //   40×40 영역에서 시각 가독을 보강하는 ice-50 (라이트) / ice-500/15
            //   (다크) 옅은 원형 배경. BottomNav 와 동일한 브랜드 활성 컬러를
            //   유지하면서 AppBar 좁은 영역에서도 명확히 인지되도록 한다.
            'bg-ice-50 text-ice-500 dark:bg-ice-500/15 dark:text-ice-400'
          : isDark
            ? 'bg-transparent text-white hover:bg-white/10'
            : 'bg-transparent text-wtext-1 dark:text-white hover:bg-wline-2 dark:hover:bg-rink-800',
        className,
      )}
    >
      <span className="relative inline-flex items-center justify-center">
        <Icon
          name={icon}
          weight={isActive ? 700 : 500}
          size={24}
          className="text-[24px]"
          aria-hidden="true"
        />
        {badge && (
          <span
            className="absolute rounded-full bg-pink-500"
            style={{ top: 0, right: 0, width: 6, height: 6 }}
            aria-hidden="true"
          />
        )}
      </span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// 편의 컴포넌트 — 자주 쓰이는 3 액션
// ──────────────────────────────────────────────────────────

export interface AppBarTimelineButtonProps {
  onClick?: () => void;
  /** 새 항목 점 배지 표시 (true → 6×6 분홍 점) */
  badge?: boolean;
  isDark?: boolean;
  /** 현재 /timeline 진입 시 true — 아이콘 ice-500 활성 톤 */
  isActive?: boolean;
}

/** ⏰ 타임라인 (공지·이벤트 시간순 피드) */
export function AppBarTimelineButton({
  onClick,
  badge,
  isDark,
  isActive,
}: AppBarTimelineButtonProps) {
  return (
    <AppBarActionButton
      icon="schedule"
      label="타임라인"
      onClick={onClick}
      badge={badge}
      isDark={isDark}
      isActive={isActive}
    />
  );
}

export interface AppBarNotificationButtonProps {
  onClick?: () => void;
  /** 미읽음 알림 점 배지 표시 (true → 6×6 분홍 점) */
  badge?: boolean;
  isDark?: boolean;
  /** 현재 /notifications 진입 시 true — 아이콘 ice-500 활성 톤 */
  isActive?: boolean;
}

/** 🔔 알림 (개인 알림 센터) */
export function AppBarNotificationButton({
  onClick,
  badge,
  isDark,
  isActive,
}: AppBarNotificationButtonProps) {
  return (
    <AppBarActionButton
      icon="notifications"
      label="알림"
      onClick={onClick}
      badge={badge}
      isDark={isDark}
      isActive={isActive}
    />
  );
}

export interface AppBarMenuButtonProps {
  onClick?: () => void;
  isDark?: boolean;
}

/** ☰ 전체 메뉴 (GlobalMenu trigger) */
export function AppBarMenuButton({ onClick, isDark }: AppBarMenuButtonProps) {
  return (
    <AppBarActionButton
      icon="menu"
      label="메뉴"
      onClick={onClick}
      isDark={isDark}
    />
  );
}

// ──────────────────────────────────────────────────────────
// 통합 컴포넌트 — 가장 흔한 우측 3 액션 묶음
// ──────────────────────────────────────────────────────────

export interface AppBarRight3ActionsProps {
  onTimeline?: () => void;
  onNotification?: () => void;
  onMenu?: () => void;
  /** 타임라인 점 배지 */
  timelineBadge?: boolean;
  /** 알림 점 배지 */
  notificationBadge?: boolean;
  /** 개별 액션 숨김 옵션 */
  showTimeline?: boolean;
  showNotification?: boolean;
  showMenu?: boolean;
  /** 현재 /timeline 진입 시 true → 타임라인 아이콘 활성 톤 */
  timelineActive?: boolean;
  /** 현재 /notifications 진입 시 true → 알림 아이콘 활성 톤 */
  notificationActive?: boolean;
  isDark?: boolean;
  className?: string;
}

/**
 * 우측 3 액션 (시계 / 종 / 햄버거) 묶음.
 * PageAppBar 의 main/submain/default(detail 통합) variant 가 사용하는 우측 영역과 동일.
 */
export function AppBarRight3Actions({
  onTimeline,
  onNotification,
  onMenu,
  timelineBadge,
  notificationBadge,
  showTimeline = true,
  showNotification = true,
  showMenu = true,
  timelineActive,
  notificationActive,
  isDark,
  className,
}: AppBarRight3ActionsProps) {
  return (
    <div className={cn('flex items-center', className)}>
      {showTimeline && (
        <AppBarTimelineButton
          onClick={onTimeline}
          badge={timelineBadge}
          isDark={isDark}
          isActive={timelineActive}
        />
      )}
      {showNotification && (
        <AppBarNotificationButton
          onClick={onNotification}
          badge={notificationBadge}
          isDark={isDark}
          isActive={notificationActive}
        />
      )}
      {showMenu && <AppBarMenuButton onClick={onMenu} isDark={isDark} />}
    </div>
  );
}
