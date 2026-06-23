import type { UserType } from '@/types';

const DASHBOARD_PATHS: Record<UserType, string> = {
  // SYSTEM/OPER — 원칙적으로 ADM 전용(/auth/admin/login) 이지만 만에 하나 web
  // 에서 로그인 성공 시에도 안전하게 /admin 으로 안내하여 "학부모 화면" 폴백을 차단.
  system: '/admin',
  oper: '/admin',
  admin: '/admin',
  director: '/director',
  // [수정 2026-05-13 P1] ACADEMY_DIRECTOR 전용 대시보드 URL 분리.
  //  이전: '/director' (분기 처리) → 별개 직무인데 URL 공유로 의미 불명확.
  //  현재: '/academy-director' — COACH/DIRECTOR 와 동일한 라우트 분리 패턴.
  //  본문: (director)/academy-director/page.tsx (DirectorDashboardPage 의 academy 분기 추출).
  academy_director: '/academy-director',
  coach: '/coach',
  parent: '/parent',
  teen: '/teen',
  child: '/child',
};

const ADMIN_PROTECTED_PATHS = [
  '/admin',
  '/parent',
  '/coach',
  '/director',
  '/child',
  '/teen',
  '/academy',
  '/payment',
  '/settlements',
  '/member-approvals',
  '/skill-report',
  '/skill-evaluations',
  '/consultations-overview',
  '/consultations',
  '/notices',
  '/team-notices',
  '/galleries',
  '/messages',
  '/chat',
  '/classes-manage',
  '/classes-organize',
  '/attendance-manage',
  '/coach-schedules',
  '/coach-members',
  '/coach-calendar',
  '/coach-rsvp',
  '/training-manage',
  '/promotions',
  '/qr-generate',
  '/work-schedule',
  '/profile-edit',
  '/tournaments',
  '/matches',
  // [추가 2026-05-12] admin 이 director/parent/coach 도메인 풀세트를 볼 수 있어야 하는데
  //  여기 누락된 경로(`/director-schedules`, `/parent-calendar` 등) 접근 시 미들웨어가
  //  unauthorized 로 판단해 /admin 으로 리다이렉트시키는 불일치가 있었음.
  //  layout 의 useRequireRole 은 admin 을 허용했으므로 layout↔middleware 정합화.
  '/director-schedules',
  '/director-approvals',
  '/director-coaches',
  '/director-credits',
  '/director-payments',
  '/director-notices',
  '/director-overseas-trips',
  '/director-members',
  '/academy-director',
  '/academy-classes',
  '/academy-schedules',
  '/parent-calendar',
  '/classes',
  // [추가 2026-05-13] 홈 캘린더 액션 — 출석 확인 /attendance/{scheduleId}.
  //  ADMIN_PROTECTED_PATHS 에 누락되어 admin 시뮬레이션 시 출석확인 → /admin 으로
  //  강제 리다이렉트되던 문제. layout 의 useRequireRole 은 admin 을 허용했지만
  //  미들웨어는 paths 미포함으로 차단했음.
  '/attendance',
  '/credits',
  '/children',
  '/rsvp',
  '/waitlist',
  '/review',
  '/report',
  '/progress',
  '/awards',
  '/overseas-trips',
  '/receipts',
  '/wishlist',
  '/leagues',
  '/statistics',
  '/team-chat',
  '/match-manage',
  '/scoreboard',
  '/approval',
];

const PROTECTED_PATHS_BY_ROLE: Record<UserType, string[]> = {
  // SYSTEM / OPER — 원칙적으로 ADM 전용이지만 만약 web 에서 검사될 경우를 대비해
  // admin 과 동일 경로 집합을 허용. getDashboardPathByUserType 는 /admin 으로 유도.
  system: ADMIN_PROTECTED_PATHS,
  oper: ADMIN_PROTECTED_PATHS,
  admin: ADMIN_PROTECTED_PATHS,
  director: [
    '/director',
    '/academy-director',
    '/academy-classes',
    '/director-coaches',
    '/director-approvals',
    '/director-schedules',
    '/director-credits',
    '/director-payments',
    '/director-notices',
    '/director-overseas-trips',
    // [추가 2026-05-15 T04 web-router] DIRECTOR 사이드 메뉴 "회원 관리" 동선 (/director-members)
    //  PROTECTED_PATHS 누락 → middleware 가 /director 로 redirect 시키던 버그 수정.
    '/director-members',
    '/qr-generate',
    '/classes-manage',
    '/classes-organize',
    '/coach-schedules',
    '/coach-members',
    // [추가 2026-05-15 T04 web-router] /(admin)/coach-manage 도 DIRECTOR 메뉴에서 접근.
    '/coach-manage',
    '/attendance-manage',
    '/settlements',
    '/member-approvals',
    '/skill-report',
    '/skill-evaluations',
    '/consultations',
    '/attendance-stats',
    '/notices',
    '/team-notices',
    '/galleries',
    '/messages',
    '/chat',
    '/leagues',
    '/statistics',
    '/team-chat',
    // [추가 2026-05-15 T04 web-router] DIRECTOR 사이드 메뉴 "그룹 관리" 동선 (/team-groups).
    '/team-groups',
    '/tournaments',
    '/matches',
    // [추가 2026-05-15 T04 web-router] DIRECTOR 메뉴 "매치 관리" · "실시간 스코어보드".
    //  COACH 동등 권한이지만 PROTECTED_PATHS 누락 → /director 로 redirect 되던 버그.
    '/match-manage',
    '/scoreboard',
    // [추가 2026-05-12] 홈 캘린더 액션 버튼 동선 ─ "출석 확인" → /attendance/{scheduleId}
    //  "결제 확인" → /classes/{classId}/payments. 둘 다 director layout 은 통과시키지만
    //  middleware 의 PROTECTED_PATHS_BY_ROLE 에 누락되어 dashboard(/director) 으로 redirect 되던 버그.
    '/classes',
    '/attendance',
  ],
  academy_director: [
    // [수정 2026-05-13 P1] ACADEMY_DIRECTOR 전용 대시보드 URL 분리 (/academy-director).
    //  /director 는 안전망 redirect 용으로 유지. 운영 도구 경로는 P2/P3 에서 점진적으로 academy-* 로 분리 예정.
    // [수정 2026-05-13 P2] /academy-classes 추가 — 오픈클래스 수업 관리 전용 URL.
    '/academy-director',
    '/academy-classes',
    '/academy-schedules',
    '/director',
    '/director-coaches',
    '/director-approvals',
    '/director-schedules',
    '/director-credits',
    '/director-payments',
    '/director-notices',
    '/director-overseas-trips',
    '/director-members',
    '/coach',
    '/academy',
    '/classes-manage',
    '/classes-organize',
    '/attendance-manage',
    '/promotions',
    '/coach-schedules',
    '/coach-members',
    '/coach-calendar',
    '/coach-rsvp',
    '/training-manage',
    '/qr-generate',
    '/work-schedule',
    '/profile-edit',
    '/tournaments',
    '/matches',
    // [추가 2026-05-15 T04 web-router] ACADEMY_DIRECTOR 메뉴에서 "매치 관리" · "실시간 스코어보드" · "코치 관리" · "그룹 관리" 접근.
    '/match-manage',
    '/scoreboard',
    '/coach-manage',
    '/team-groups',
    // [추가 2026-05-12] 홈 캘린더 액션 동선 보강 (출석 확인 / 결제 확인)
    '/attendance',
    '/classes',
  ],
  coach: [
    '/coach',
    '/coach-calendar',
    '/coach-schedules',
    '/coach-members',
    '/coach-rsvp',
    '/classes-manage',
    '/classes-organize',
    '/attendance-manage',
    // [추가 2026-05-12] 홈 캘린더 액션 ─ /attendance/{scheduleId}, /classes/{id}/payments
    //  기존 '/attendance/manage', '/classes/manage' 는 미사용 경로. 상위 prefix 보강.
    '/attendance',
    '/classes',
    '/qr-generate',
    '/settlements',
    '/member-approvals',
    '/skill-report',
    '/skill-evaluations',
    '/consultations',
    '/notices',
    '/team-notices',
    '/galleries',
    '/messages',
    '/chat',
    '/training-manage',
    '/profile-edit',
    '/promotions',
    '/approval',
    '/work-schedule',
    '/tournaments',
    '/matches',
    '/academy',
    // /team 은 (common) 자유 경로로 PROTECTED_PATHS_BY_ROLE 에 두지 않는다.
    //  단 /team-groups 는 director/academy_director 메뉴 동선상 이미 등록되어
    //  ALL_PROTECTED_PATHS 에 포함된다. coach 메뉴("팀 관리 > 그룹관리")도 같은 경로를
    //  쓰므로 coach paths 에 없으면 미들웨어가 /coach 로 차단한다 → 동일하게 등록한다.
    '/team-groups',
    '/director',
    '/academy-director',
    '/academy-classes',
    '/director-coaches',
    '/director-approvals',
    '/director-schedules',
    '/director-credits',
    '/director-payments',
    '/director-notices',
    '/director-overseas-trips',
    '/director-members',
    '/team-chat',
    '/leagues',
    '/statistics',
    '/match-manage',
    '/scoreboard',
  ],
  parent: [
    '/parent',
    '/parent-calendar',
    '/children',
    '/credits',
    '/payment',
    '/rsvp',
    '/waitlist',
    '/review',
    '/report',
    '/skill-report',
    '/progress',
    '/awards',
    '/overseas-trips',
    '/receipts',
    '/notices',
    '/team-notices',
    '/wishlist',
    '/galleries',
    '/messages',
    '/chat',
    // [추가 2026-05-12] 학부모 캘린더 상세 진입 ─ /classes/{id}, /attendance/{scheduleId}
    '/classes',
    '/attendance',
    // [B14 추가 2026-05-26] 마이페이지 > 활동 > 출석 기록의 "자녀별 상세 출석 보기" 진입 경로.
    //  /attendance-history 는 자녀 선택 + 자녀별 출석 상세 페이지(자녀목록·출석·크레딧 조회)인데
    //  parent RBAC 에 누락되어 있었다. matchesPath('/attendance-history','/attendance') 는
    //  segment 경계 매칭상 false 이고, child/teen 만 등록돼 ALL_PROTECTED_PATHS 에는 포함되므로
    //  학부모 클릭 시 dashboard(/parent) 로 redirect 되어 홈으로 튕기던 버그(B14) 발생.
    '/attendance-history',
    // [추가 2026-05-15] 수업목록 '대회' 탭에서 대회 카드 클릭 → /tournaments/{id} 진입.
    //  미들웨어가 미허용 시 dashboard(/parent) 으로 redirect 되어 홈 이동 버그 발생.
    '/tournaments',
  ],
  child: [
    '/child',
    '/qr-checkin',
    '/child-classes',
    '/skill-report',
    '/notices',
    '/team-notices',
    '/wishlist',
    '/galleries',
    // [추가 2026-05-15] BottomNav "수업·일정" 클릭이 dashboard redirect 로 막히던 회귀 수정.
    //   학생도 본인 수업 목록·캘린더 접근 필요 (학부모와 동일 패턴).
    '/classes',
    '/calendar',
    '/schedule',
    '/parent-calendar',
    '/attendance',
    '/attendance-history',
    '/badges',
    '/stickers',
    '/ranking',
    '/checklist',
    '/gift',
    '/dashboard',
    // [추가 2026-05-15] 수업목록 '대회' 탭 대회 카드 진입 — /tournaments/{id}.
    '/tournaments',
  ],
  teen: [
    '/teen',
    '/qr-checkin',
    '/skill-report',
    '/receipts',
    '/notices',
    '/team-notices',
    '/wishlist',
    '/galleries',
    // [추가 2026-05-15] BottomNav "수업·일정" 클릭이 dashboard redirect 로 막히던 회귀 수정.
    '/classes',
    '/calendar',
    '/schedule',
    '/parent-calendar',
    '/attendance',
    '/attendance-history',
    '/badges',
    '/stickers',
    '/ranking',
    '/checklist',
    '/gift',
    '/dashboard',
    // [추가 2026-05-15] 수업목록 '대회' 탭 대회 카드 진입 — /tournaments/{id}.
    '/tournaments',
  ],
};
// NOTE: /team 은 (common) 그룹 내부 페이지로 모든 역할(parent/child/teen/coach/director/admin)이
// 공통으로 접근 가능해야 한다. 따라서 PROTECTED_PATHS_BY_ROLE 에 포함하지 않는다 —
// 미들웨어는 ALL_PROTECTED_PATHS 기반으로 판단하므로, 여기 없으면 자유 경로로 취급되어
// (common)/layout.tsx 의 useRequireAuth 단일 가드로 보호된다.

export function normalizeUserType(userType?: string | null): UserType | null {
  if (!userType) {
    return null;
  }

  const normalized = userType.toLowerCase();
  if (normalized in DASHBOARD_PATHS) {
    return normalized as UserType;
  }

  return null;
}

export function getDashboardPathByUserType(
  userType?: string | null,
  fallback = '/login',
): string {
  const normalized = normalizeUserType(userType);
  if (!normalized) {
    return fallback;
  }

  return DASHBOARD_PATHS[normalized];
}

export function getProtectedPathsByUserType(userType?: string | null): string[] {
  const normalized = normalizeUserType(userType);
  if (!normalized) {
    return [];
  }

  return PROTECTED_PATHS_BY_ROLE[normalized];
}

export const ALL_PROTECTED_PATHS = Array.from(
  new Set(Object.values(PROTECTED_PATHS_BY_ROLE).flat()),
);

/**
 * 오픈 리다이렉트 방지 — `redirect` 쿼리 파라미터가 안전한 동일 출처 내부 경로인지 검증.
 *
 * 반드시 단일 `/`로 시작해야 하며, protocol-relative(`//`)·백슬래시 혼합(`/\`)·
 * 절대 URL(`https://evil.com`)·traversal(`..`)·제어문자를 차단한다.
 * deeplink allowlist(isSafeInternalPath)와 달리 prefix 제한이 없어 모든 인앱 경로를 허용한다.
 *
 * @example
 *   isInternalRedirectPath('/coach')           // true
 *   isInternalRedirectPath('//evil.com')       // false (protocol-relative)
 *   isInternalRedirectPath('https://evil.com') // false (절대 URL)
 *   isInternalRedirectPath('/\\evil.com')      // false (백슬래시 우회)
 */
export function isInternalRedirectPath(target: unknown): target is string {
  if (typeof target !== 'string') return false;
  if (target.length === 0 || target.length > 2048) return false;
  if (!target.startsWith('/')) return false;
  if (target.startsWith('//')) return false; // protocol-relative URL 차단
  if (target.startsWith('/\\')) return false; // 백슬래시 혼합 경로 차단
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return false;
  }
  if (decoded.includes('..')) return false; // path traversal
  if (decoded.includes('\0')) return false;
  if (/[\r\n\t]/.test(decoded)) return false; // 헤더/제어문자 인젝션
  // 디코딩 후에도 protocol-relative / 백슬래시 우회 재차단
  if (decoded.startsWith('//') || decoded.startsWith('/\\')) return false;
  return true;
}

/**
 * `redirect` 파라미터를 안전한 내부 경로로 해석한다. 안전하지 않으면 fallback 반환.
 * 라우터 네비게이션 직전에 호출해 오픈 리다이렉트를 차단하는 단일 진입점.
 */
export function safeRedirectTarget(
  target: string | null | undefined,
  fallback = '/',
): string {
  return isInternalRedirectPath(target) ? target : fallback;
}
