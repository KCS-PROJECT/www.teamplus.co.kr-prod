/**
 * Notification System Types
 * TEAMPLUS 알림 시스템 타입 정의
 */

/** 알림 유형 */
export type NotificationType =
  | 'schedule'   // 수업 일정
  | 'approval'   // 회원 승인
  | 'payment'    // 결제
  | 'info'       // 일반 정보
  | 'system'     // 시스템
  | 'class'      // 수업 관련
  | 'match'      // 매치
  | 'club';      // 팀

/** 알림 카테고리 (필터용)
 *  [2026-06-18] 'join'(가입) 신설 — 감독/코치 탭(전체/가입/결제/공지)에서 회원 가입 알림 분리. */
export type NotificationCategory = 'all' | 'class' | 'join' | 'payment' | 'notice' | 'system';

/** 알림 우선순위 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/** 알림 인터페이스 */
export interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  /** 표시용 시간 (e.g., "오전 10:00", "어제") */
  time: string;
  /** 실제 생성 시간 */
  createdAt: Date | string;
  isRead: boolean;
  /** 딥링크용 데이터 */
  data?: {
    /** 이동할 경로 */
    href?: string;
    /** 관련 ID (수업, 결제 등) */
    referenceId?: string;
    /** 관련 타입 */
    referenceType?: string;
    /** 추가 메타데이터 */
    meta?: Record<string, unknown>;
  };
  /** 우선순위 */
  priority?: NotificationPriority;
  /** 만료 시간 */
  expiresAt?: Date | string;
}

/** 알림 그룹 (날짜별) */
export interface NotificationGroup {
  /** 그룹 라벨 (e.g., "오늘", "어제", "이번 주") */
  label: string;
  /** 그룹 내 알림 목록 */
  items: Notification[];
  /** 오래된 그룹 여부 */
  isOld?: boolean;
}

/** 알림 설정 */
export interface NotificationSettings {
  /** 푸시 알림 활성화 */
  pushEnabled: boolean;
  /** 카테고리별 설정 */
  categories: {
    class: boolean;
    payment: boolean;
    notice: boolean;
    system: boolean;
    marketing: boolean;
  };
  /** 알림음 */
  soundEnabled: boolean;
  /** 진동 */
  vibrationEnabled: boolean;
  /** 방해금지 모드 */
  quietHours: {
    enabled: boolean;
    startTime: string; // "HH:mm" format
    endTime: string;
  };
}

/** 기본 알림 설정 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  pushEnabled: true,
  categories: {
    class: true,
    payment: true,
    notice: true,
    system: true,
    marketing: true,
  },
  soundEnabled: true,
  vibrationEnabled: true,
  quietHours: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
  },
};

/** 알림 필터 옵션 */
export interface NotificationFilter {
  category?: NotificationCategory;
  isRead?: boolean;
  startDate?: Date;
  endDate?: Date;
  priority?: NotificationPriority;
}

/** 알림 API 응답 */
export interface NotificationResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

/** 알림 스타일 매핑 */
export interface NotificationStyle {
  bgColor: string;
  textColor: string;
  ringColor: string;
  icon: string;
}

/** 알림 타입별 스타일 */
export const NOTIFICATION_STYLES: Record<NotificationType, NotificationStyle> = {
  schedule: {
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    textColor: 'text-blue-600 dark:text-blue-400',
    ringColor: 'ring-blue-100 dark:ring-blue-800/30',
    icon: 'schedule',
  },
  approval: {
    bgColor: 'bg-primary/10 dark:bg-primary/20',
    textColor: 'text-primary',
    ringColor: 'ring-primary/20 dark:ring-primary/10',
    icon: 'how_to_reg',
  },
  payment: {
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    textColor: 'text-green-600 dark:text-green-400',
    ringColor: 'ring-green-100 dark:ring-green-800/30',
    icon: 'check_circle',
  },
  info: {
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    textColor: 'text-indigo-500 dark:text-indigo-400',
    ringColor: 'ring-indigo-100 dark:ring-indigo-800/30',
    icon: 'info',
  },
  system: {
    bgColor: 'bg-slate-100 dark:bg-slate-700',
    textColor: 'text-slate-500 dark:text-slate-400',
    ringColor: '',
    icon: 'settings',
  },
  class: {
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
    textColor: 'text-sky-600 dark:text-sky-400',
    ringColor: 'ring-sky-100 dark:ring-sky-800/30',
    icon: 'sports_hockey',
  },
  match: {
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    textColor: 'text-orange-600 dark:text-orange-400',
    ringColor: 'ring-orange-100 dark:ring-orange-800/30',
    icon: 'sports_motorsports',
  },
  club: {
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    textColor: 'text-purple-600 dark:text-purple-400',
    ringColor: 'ring-purple-100 dark:ring-purple-800/30',
    icon: 'groups',
  },
};

/** 카테고리 라벨 */
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  all: '전체',
  class: '수업',
  join: '가입',
  payment: '결제',
  notice: '공지',
  system: '시스템',
};

/** 카테고리 라벨 (별칭) */
export const CATEGORY_LABELS = NOTIFICATION_CATEGORY_LABELS;
