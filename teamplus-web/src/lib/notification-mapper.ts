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
  // 결제 — payment*, 환불 요청/처리(refund_request_*), 후불 정산 청구(postpaid_billing, tournament_postpaid_billing).
  //   환불은 결제 생애주기의 일부이며, 알림 linkUrl 도 전부 결제 화면이다
  //   (요청자 → /payment/history, 처리 담당자 → /director-payments/refunds).
  if (t.startsWith('payment') || t.startsWith('refund') || t.endsWith('_billing')) {
    return 'payment';
  }
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
  // 공지류 — 팀 공지/아카데미/대회/팀/결제권/피드백 → deriveCategory 'notice'.
  //   notice_class_created/notice_tournament_created = 수업/대회 단위 공지 (unit-notice Phase 1).
  if (
    t === 'club' ||
    t.startsWith('club_') ||
    t === 'academy_notice' ||
    t.startsWith('team_notice') ||
    t.startsWith('team_post') ||
    t.startsWith('notice_') ||
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
 *
 * `notice` 키는 의도적으로 없다 — 공지 탭은 화이트리스트가 아니라 **제외 기반**이다
 * (getExcludedTypesForCategory 참조). 백엔드가 새 notificationType 을 추가할 때마다
 * 이 카탈로그 갱신이 누락돼 배지에는 잡히고 목록에서는 빠지는 불일치가 반복됐다.
 */
export const NOTIFICATION_TYPES_BY_CATEGORY: Record<
  Exclude<NotificationCategory, 'all' | 'notice'>,
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
    'class_price_changed',
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
    // 월 판매 사이클 — 학부모 갱신 안내 / 감독 판매 준비 리마인더
    'class_renewal_required',
    'class_sales_prep_reminder',
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
    'payment_unpaid',
    // 환불 요청 — 담당자(감독·오픈클래스 원장·운영자)와 요청자 알림 모두 결제 화면으로 이동한다.
    'refund_request_created',
    'refund_request_reminder',
    'refund_request_escalated',
    'refund_request_decided',
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
  // 'notice' 는 제외 기반(getExcludedTypesForCategory) — 화이트리스트를 만들지 않는다.
  if (!category || category === 'all' || category === 'notice') return undefined;
  const types = NOTIFICATION_TYPES_BY_CATEGORY[category];
  return types ? [...types] : undefined;
}

/**
 * 공지 탭 서버 필터 — **제외 기반**.
 *
 * 공지 = "가입·수업·결제·시스템 어디에도 속하지 않는 나머지" 로 정의한다.
 * `deriveCategory` 의 `default -> 'notice'` 폴백과 동일한 규칙이라 탭 배지(집계)와
 * 탭 목록(조회)이 항상 같은 답을 낸다. 백엔드가 새 notificationType 을 추가해도
 * 별도 등재 없이 공지 탭에 자동 흡수된다.
 *
 * 화면에서 숨기는 유형(HIDDEN_NOTIFICATION_TYPES)도 함께 제외해 서버가 애초에
 * 내려주지 않게 한다 — 클라이언트 필터로 줄어든 만큼 페이지가 비는 것을 막는다.
 */
export function getExcludedTypesForCategory(
  category: NotificationCategory | undefined | null,
): string[] | undefined {
  if (category !== 'notice') return undefined;
  return Array.from(
    new Set([
      ...Object.values(NOTIFICATION_TYPES_BY_CATEGORY).flat(),
      ...HIDDEN_NOTIFICATION_TYPES,
    ]),
  );
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

  // 피드백 답변 알림은 linkUrl 이 비어도 '내 피드백 내역'으로 연결(과거 알림 소급)
  const fallbackHref = rawType?.startsWith('feedback')
    ? '/feedback?tab=history'
    : undefined;
  const href = b.linkUrl ?? fallbackHref;

  return {
    id: b.id,
    type,
    category: deriveCategory(type),
    title: b.title,
    message: b.message ?? b.body ?? '',
    time: formatNotificationTime(createdAt),
    createdAt,
    isRead: isReadValue,
    data: b.data ?? (href ? { href } : undefined),
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
