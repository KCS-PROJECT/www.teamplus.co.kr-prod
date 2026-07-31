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
  // [추가 2026-07-30 법무 · 민법 §5 미성년자 취소권 / Apple Kids · Google Families]
  //  '/shop-checkout' 은 어느 역할 목록에도 없어 ALL_PROTECTED_PATHS 에서 누락 → 미들웨어가
  //  자유 경로로 취급했고, CHILD/TEEN 이 URL 직접 입력으로 'N원 결제하기' 화면에 진입할 수
  //  있었다. 결제 개시 자체는 백엔드가 PARENT 전용으로 차단하지만 미성년자에게 결제 화면을
  //  노출하는 것 자체가 스토어 정책 리스크다. 결제 가능한 성인 역할(admin·director·
  //  academy_director·coach·parent)에만 등록해 보호 경로로 승격하고 child/teen 은 제외한다.
  //  (참고: '/payment' 는 이미 admin·parent 목록에만 있어 child/teen 이 차단된다.)
  '/shop-checkout',
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
    // 가입 승인 요청 알림(membership_requested, linkUrl="/approval") 동선.
    //  (coach) layout 가드는 director 를 허용하나 middleware paths 누락으로 /director 로 튕기던 버그.
    '/approval',
    // [추가 2026-07-30 법무] 쇼핑몰 결제 화면 — (shop) layout 이 director 를 허용하므로 등록.
    //  CHILD/TEEN 차단 목적의 보호 경로 승격이며 성인 역할 동선은 그대로 유지한다.
    '/shop-checkout',
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
    // [Phase 0 · 정산 센터 v4.0 §5-3] ACADEMY_DIRECTOR 의 팀·대회 도메인 차단 —
    //  '/director-payments'(팀 전용 정산), '/tournaments', '/matches', '/match-manage',
    //  '/scoreboard' 제거. 서버측 @Roles 차단이 본체이고 이 목록은 미들웨어 보조 차단.
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
    '/coach-manage',
    '/team-groups',
    // [추가 2026-05-12] 홈 캘린더 액션 동선 보강 (출석 확인 / 결제 확인)
    '/attendance',
    '/classes',
    // 가입 승인 요청 알림(membership_requested, linkUrl="/approval") 동선 — (coach) layout 가드 정합화.
    '/approval',
    // [추가 2026-07-30 법무] 쇼핑몰 결제 화면 — (shop) layout 이 academy_director 를 허용하므로 등록.
    '/shop-checkout',
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
    // [추가 2026-07-30 법무] 쇼핑몰 결제 화면 — (shop) layout 이 coach 를 허용하므로 등록.
    '/shop-checkout',
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
    //  /attendance-history 는 자녀 선택 + 자녀별 출석 상세 페이지(자녀목록·출석·결제권 조회)인데
    //  parent RBAC 에 누락되어 있었다. matchesPath('/attendance-history','/attendance') 는
    //  segment 경계 매칭상 false 이고, child/teen 만 등록돼 ALL_PROTECTED_PATHS 에는 포함되므로
    //  학부모 클릭 시 dashboard(/parent) 로 redirect 되어 홈으로 튕기던 버그(B14) 발생.
    '/attendance-history',
    // [추가 2026-05-15] 수업목록 '대회' 탭에서 대회 카드 클릭 → /tournaments/{id} 진입.
    //  미들웨어가 미허용 시 dashboard(/parent) 으로 redirect 되어 홈 이동 버그 발생.
    '/tournaments',
    // [추가 2026-07-30 법무] 쇼핑몰 결제 화면 — 기본 구매자(성인 보호자) 동선 유지.
    //  child/teen 목록에는 의도적으로 넣지 않는다 (민법 §5 · 스토어 아동 정책).
    '/shop-checkout',
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
// NOTE [법무 2026-07-30 · 미성년자 결제 화면 차단]: 결제가 개시되는 경로
//  ('/payment/*' · '/shop-checkout') 는 child/teen 목록에 의도적으로 포함하지 않는다.
//  ALL_PROTECTED_PATHS 는 전 역할 목록의 합집합이므로, 성인 역할에만 등록하면 해당 경로가
//  '보호 경로'로 승격되면서 child/teen 은 미들웨어가 각자의 대시보드로 리다이렉트한다.
//  ⚠️ 향후 결제 화면 경로를 추가할 때 child/teen 목록에 넣으면 이 차단이 무력화된다.
//  (역으로, 어느 역할 목록에도 없으면 자유 경로가 되어 아무도 차단되지 않는다 — 반드시
//   성인 역할 중 최소 한 곳에는 등록해야 보호 경로가 된다.)

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
