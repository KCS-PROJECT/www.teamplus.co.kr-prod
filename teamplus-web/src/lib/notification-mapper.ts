/**
 * 백엔드 알림 응답 → 프론트 Notification 객체 매핑 단일 진입점
 *
 * 백엔드 응답 구조 (notifications.service.ts getUserNotifications):
 *   { id, notificationType, title, message, isRead, createdAt, linkUrl? }
 *
 * 프론트 Notification (types/notification.ts):
 *   { id, type, category, title, message, time, createdAt, isRead, data? }
 *
 * 주의: 백엔드는 순수 배열을 반환하며 `{ notifications: [...] }` 래퍼가 없음.
 *       호출부는 `api.get<BackendNotification[]>` 형태로 받아 이 매퍼를 거쳐야 함.
 */

import type {
  Notification,
  NotificationCategory,
  NotificationType,
} from '@/types/notification';

export interface BackendNotification {
  id: string;
  notificationType?: string;
  type?: string;
  title: string;
  message?: string;
  body?: string;
  isRead?: boolean;
  read?: boolean;
  createdAt?: string | Date;
  linkUrl?: string | null;
  data?: {
    href?: string;
    referenceId?: string;
    referenceType?: string;
    meta?: Record<string, unknown>;
  };
}

/**
 * 표시용 상대 시간 — "방금/N분 전/오전 HH:MM/어제/N일 전/N주 전"
 */
export function formatNotificationTime(createdAt: string | Date): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) {
    const h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const ampm = h < 12 ? '오전' : '오후';
    return `${ampm} ${h % 12 || 12}:${m}`;
  }
  if (diffDay === 1) {
    const h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const ampm = h < 12 ? '오전' : '오후';
    return `어제 ${ampm} ${h % 12 || 12}:${m}`;
  }
  if (diffDay < 7) return `${diffDay}일 전`;
  return `${Math.floor(diffDay / 7)}주 전`;
}

/**
 * 백엔드 `notificationType` → 프론트 `NotificationType` (UI 스타일맵 키)
 *
 * 백엔드 실제 발송 타입 (notifications.service.ts 호출처 기준):
 *   child_attendance, class_coach_assigned, account_dormant, academy_notice,
 *   trip_waitlist_promoted, rsvp_reminder, payment_reminder, payment_success,
 *   membership_approved, class_reminder, attendance_confirmed
 */
export function normalizeNotificationType(raw?: string): NotificationType {
  if (!raw) return 'info';
  const t = raw.toLowerCase();

  // [2026-06-18] 실제 DB notificationType 분포 기준 매핑 보강
  //   (membership/billing/team_notice/tournament 등 — 역할별 탭 가입/수업/결제/공지에 정확 분배).
  // 결제 — payment*, 후불 정산 청구(postpaid_billing, tournament_postpaid_billing).
  if (t.startsWith('payment') || t.endsWith('_billing')) return 'payment';
  // 가입(팀 회원 가입) — membership_requested/approved/rejected → deriveCategory 'join'.
  if (t.startsWith('membership') || t.startsWith('approval')) {
    return 'approval';
  }
  // 수업 — 수업/일정/수강신청/출석/RSVP.
  if (
    t === 'class' ||
    t.startsWith('class_') ||
    t === 'schedule' ||
    t.startsWith('enrollment') ||
    t.includes('attendance') ||
    t.startsWith('rsvp')
  ) {
    return 'class';
  }
  // 매치(픽업)·원정 대기 — notice 폴백.
  if (
    t === 'match' ||
    t.startsWith('match_') ||
    t.startsWith('trip')
  ) {
    return 'match';
  }
  // 공지류 — 팀 공지/아카데미/대회/팀/크레딧/피드백 → deriveCategory 'notice'.
  if (
    t === 'club' ||
    t.startsWith('club_') ||
    t === 'academy_notice' ||
    t.startsWith('team_notice') ||
    t.startsWith('tournament') ||
    t.startsWith('credit') ||
    t.startsWith('waitlist') ||
    t.startsWith('feedback')
  ) {
    return 'club';
  }
  if (
    t === 'system' ||
    t === 'account_dormant' ||
    t === 'dormant_warning'
  ) {
    return 'system';
  }
  const KNOWN_TYPES: readonly NotificationType[] = [
    'schedule',
    'approval',
    'payment',
    'info',
    'system',
    'class',
    'match',
    'club',
  ];
  if (KNOWN_TYPES.includes(t as NotificationType)) {
    return t as NotificationType;
  }
  return 'info';
}

/**
 * 프론트 `NotificationType` → 카테고리 탭 (`all|class|payment|notice|system`)
 *
 * 미매핑 타입(approval/match/club/info/일반)은 'notice'로 폴백 — CategoryTabs 의
 * "공지" 탭에 노출되어 사용자가 놓치지 않도록 한다.
 */
export function deriveCategory(type: NotificationType | string): NotificationCategory {
  switch (type) {
    case 'payment':
      return 'payment';
    case 'system':
      return 'system';
    case 'schedule':
    case 'class':
      return 'class';
    case 'approval':
      // [2026-06-18] 회원 가입 알림 → '가입' 탭 (감독/코치).
      return 'join';
    case 'match':
    case 'club':
    case 'info':
    default:
      return 'notice';
  }
}

/**
 * 카테고리 → notificationType 카탈로그 (B1 서버 사이드 필터링용)
 *
 * `deriveCategory(normalizeNotificationType(type))` 의 역매핑을 명시적으로 enumerate.
 * 신규 notificationType 추가 시 이 카탈로그도 함께 업데이트 필요.
 * `all` 은 필터 없음 (전체 조회).
 */
export const NOTIFICATION_TYPES_BY_CATEGORY: Record<
  Exclude<NotificationCategory, 'all'>,
  readonly string[]
> = {
  // 가입 — 팀 회원 가입 신청/승인 (감독·코치 탭). 실측: membership_requested(44)·membership_approved(28).
  join: [
    'membership_requested',
    'membership_approved',
    'membership_rejected',
    'approval',
  ],
  // 수업 — 수업/일정/수강신청/출석/RSVP (학부모 탭).
  //   실측: class_created(60)·class_reminder(13)·class_coach_assigned(9)·child_attendance(7)
  //         ·attendance_confirmed(13)·class_schedule_created(5)·rsvp_reminder(7)·attendance_modified(1).
  class: [
    'class',
    'class_reminder',
    'class_created',
    'class_cancelled',
    'class_coach_assigned',
    'class_approved',
    'class_changed',
    'class_schedule_created',
    'schedule',
    'attendance_confirmed',
    'attendance_modified',
    'attendance_reminder',
    'child_attendance',
    'rsvp_reminder',
    'rsvp_auto_declined',
    // 수강신청(수업 등록)
    'enrollment_request',
    'enrollment_approved',
    'enrollment_rejected',
    'enrollment_open',
    'enrollment_deadline',
  ],
  // 결제 — 선불/후불 정산 청구 포함. 실측: payment_reminder(10)·payment_success(8)
  //        ·tournament_postpaid_billing(3)·postpaid_billing(1).
  payment: [
    'payment',
    'payment_success',
    'payment_reminder',
    'payment_failed',
    'payment_completed',
    'postpaid_billing',
    'tournament_postpaid_billing',
  ],
  // 공지 — 팀 공지/아카데미/대회/원정/크레딧/피드백/매치. 실측: team_notice_created(87)
  //        ·tournament_created(27)·academy_notice(14)·trip_waitlist_promoted(13).
  notice: [
    'team_notice_created',
    'notice_comment_added',
    'academy_notice',
    'tournament_created',
    // trip
    'trip_waitlist_promoted',
    // credit
    'credit_expiry',
    'credit_expiry_warning',
    // waitlist
    'waitlist_promoted',
    'waitlist_confirm_reminder',
    // match (픽업 매치 관련 — match 폴백)
    'match',
    'match_updated',
    'match_applied',
    'match_rejected',
    'match_cancelled',
    'match_left',
    'match_approved',
    // feedback
    'feedback_reply',
    // generic fallbacks
    'info',
    'general',
    'club',
  ],
  system: [
    'system',
    'account_dormant',
    'dormant_warning',
  ],
};

/**
 * 카테고리에 해당하는 notificationType 목록 반환.
 * `all` 또는 미정의 카테고리는 `undefined` 반환 (전체 조회).
 */
export function getTypesForCategory(
  category: NotificationCategory | undefined | null,
): string[] | undefined {
  if (!category || category === 'all') return undefined;
  const types = NOTIFICATION_TYPES_BY_CATEGORY[category];
  return types ? [...types] : undefined;
}

/**
 * [2026-06-18 사용자 직접 지시] 현재 화면에 없는(수정으로 사라진) 기능 알림 — 목록·뱃지에서 제외.
 *   해외원정 대기 · 휴면 계정 · RSVP 리마인더 · 대회.
 */
export const HIDDEN_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'trip_waitlist_promoted',
  'account_dormant',
  'rsvp_reminder',
  'tournament_created',
]);

/** [2026-06-18] 오래된 알림 숨김 기준 — 21일(3주) 이상 지난 알림은 미표시. */
export const NOTIFICATION_RECENCY_DAYS = 21;

export function isHiddenNotificationType(rawType?: string | null): boolean {
  return !!rawType && HIDDEN_NOTIFICATION_TYPES.has(rawType.toLowerCase());
}

/**
 * 알림 노출 여부 — ① 제외 유형 아님 ② 21일 이내.
 * 목록 fetch 후 매핑 전에 raw 응답에 적용한다.
 */
export function isNotificationVisible(
  b: { notificationType?: string; type?: string; createdAt?: string | Date },
  now: number = Date.now(),
): boolean {
  const rawType = (b.notificationType ?? b.type ?? '').toLowerCase();
  if (isHiddenNotificationType(rawType)) return false;
  const created = b.createdAt ? new Date(b.createdAt).getTime() : now;
  if (Number.isFinite(created) && (now - created) / 86_400_000 >= NOTIFICATION_RECENCY_DAYS) {
    return false;
  }
  return true;
}

/**
 * 카테고리별 통계 — total/unread
 */
export interface CategoryStats {
  total: number;
  unread: number;
}

export type StatsByCategory = Record<NotificationCategory, CategoryStats>;

const EMPTY_STATS: StatsByCategory = {
  all: { total: 0, unread: 0 },
  class: { total: 0, unread: 0 },
  join: { total: 0, unread: 0 },
  payment: { total: 0, unread: 0 },
  notice: { total: 0, unread: 0 },
  system: { total: 0, unread: 0 },
};

export function createEmptyStatsByCategory(): StatsByCategory {
  return {
    all: { total: 0, unread: 0 },
    class: { total: 0, unread: 0 },
    join: { total: 0, unread: 0 },
    payment: { total: 0, unread: 0 },
    notice: { total: 0, unread: 0 },
    system: { total: 0, unread: 0 },
  };
}

/**
 * 백엔드 `/notifications/stats/by-type` 응답을 카테고리별로 집계.
 * `deriveCategory(normalizeNotificationType(type))` 매핑으로 합산하며,
 * 모든 합계는 `all` 에도 누적된다.
 */
export function aggregateStatsByCategory(
  byType: Record<string, { total: number; unread: number }>,
): StatsByCategory {
  const result = createEmptyStatsByCategory();

  for (const [type, stats] of Object.entries(byType ?? {})) {
    // [2026-06-18] 제외 유형(현재 화면에 없는 기능)은 탭 뱃지 카운트에서도 제외.
    if (isHiddenNotificationType(type)) continue;
    const category = deriveCategory(normalizeNotificationType(type));
    result[category].total += stats.total;
    result[category].unread += stats.unread;
    result.all.total += stats.total;
    result.all.unread += stats.unread;
  }

  return result;
}

void EMPTY_STATS; // referenced for completeness, real consumers use createEmptyStatsByCategory()

/**
 * 백엔드 응답을 프론트 Notification 객체로 변환.
 * - 필드명 차이 흡수: notificationType ↔ type, message ↔ body, linkUrl ↔ data.href
 * - 누락 시 안전 디폴트 ('info' / 빈 문자열 / 현재 시각).
 */
export function mapBackendNotification(b: BackendNotification): Notification {
  const rawType = b.notificationType ?? b.type;
  const type = normalizeNotificationType(rawType);
  const createdAt = b.createdAt ?? new Date().toISOString();
  const isReadValue = b.isRead ?? b.read ?? false;

  return {
    id: b.id,
    type,
    category: deriveCategory(type),
    title: b.title,
    message: b.message ?? b.body ?? '',
    time: formatNotificationTime(createdAt),
    createdAt,
    isRead: isReadValue,
    data: b.data ?? (b.linkUrl ? { href: b.linkUrl } : undefined),
  };
}

/**
 * 백엔드 응답 페이로드 정규화 — 다음 3가지 형태를 모두 수용:
 *   1. 배열 그대로: `[ {...}, {...} ]` (현재 백엔드)
 *   2. `{ notifications: [...] }` 래퍼 (구 명세)
 *   3. `{ data: [...] }` 래퍼 (일반 NestJS interceptor)
 */
export function normalizeNotificationPayload(
  payload: unknown,
): BackendNotification[] {
  if (Array.isArray(payload)) return payload as BackendNotification[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.notifications)) return obj.notifications as BackendNotification[];
    if (Array.isArray(obj.data)) return obj.data as BackendNotification[];
  }
  return [];
}
