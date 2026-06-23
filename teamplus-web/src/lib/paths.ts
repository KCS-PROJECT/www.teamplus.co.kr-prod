/**
 * TEAMPLUS Web — 라우팅 경로 SoT (Single Source of Truth)
 *
 * 모든 페이지/컴포넌트의 router.push, Link href, navigate() 호출은
 * 이 파일에서 import 한 PATHS 헬퍼만 사용한다.
 *
 * 목적:
 *  - 라우팅 placeholder("/" 또는 잘못된 경로)로 인한 회귀 차단
 *  - 페이지 이동 의도를 코드에서 명시적으로 읽히게 함
 *  - 경로가 바뀌어도 호출부 코드 변경 없이 PATHS 정의만 수정
 *
 * 사용:
 *  import { PATHS } from '@/lib/paths';
 *  router.push(PATHS.children.classes(childId));
 *  <Link href={PATHS.director.tournament} />
 */

export const PATHS = {
  // ─── 자녀 관련 (parent 역할) ─────────────────────────────────────
  children: {
    list: '/children',
    add: '/children/add',
    profile: (id: string) => `/children/${id}`,
    edit: (id: string) => `/children/${id}/edit`,
    team: (id: string) => `/children/${id}/team`,
    coach: (id: string) => `/children/${id}/coach`,
    classes: (id: string) => `/children/${id}/class-history`,
    attendance: (id: string) => `/children/${id}/attendance`,
    medical: (id: string) => `/children/${id}/medical`,
  },

  // ─── 마이페이지/활동 (공통) ──────────────────────────────────────
  mypage: {
    home: '/mypage',
    profile: '/profile',
    profileEdit: '/profile/edit',
    activity: '/mypage/activity',
    activityRecent: '/mypage/activity',
    activityAttendance: '/mypage/activity/attendance',
    activityPayments: '/mypage/activity/payments',
    activityReceipts: '/mypage/activity/receipts',
    calendar: '/mypage/calendar',
    search: '/search',
    searchResults: '/search/results',
    notificationSettings: '/notification-settings',
  },

  // ─── 코치 관리 (director 역할) ───────────────────────────────────
  coaches: {
    list: '/director-coaches',
    register: '/director-coaches/register',
    detail: (id: string) => `/director-coaches/${id}`,
    edit: (id: string) => `/director-coaches/${id}/edit`,
    assignClass: (id: string) => `/director-coaches/${id}/assign-class`,
  },

  // ─── DIRECTOR 전용 ──────────────────────────────────────────────
  director: {
    home: '/director',
    schedules: '/director-schedules',
    approvalsList: '/director-approvals',
    tournament: '/tournaments',
    tournamentList: '/tournaments?tab=tournament',
    matchList: '/tournaments?tab=match',
    members: '/director-members',
    memberRegister: '/director-members/create',
    matches: '/matches/list',
    matchCreate: '/matches/create',
  },

  // ─── PARENT 전용 ────────────────────────────────────────────────
  parent: {
    home: '/parent',
    attendanceHistory: '/attendance-history',
    rsvp: '/rsvp',
    payments: '/credits',
    calendar: '/parent-calendar',
    review: '/review',
  },

  // ─── 공통 (수업/대회 등) ────────────────────────────────────────
  classes: {
    list: '/classes',
    detail: (id: string) => `/classes/${id}`,
    manage: '/classes-manage',
    create: '/classes-manage/create',
    edit: (id: string) => `/classes-manage/edit/${id}`,
  },
  team: {
    list: '/team',
    create: '/team/create',
    detail: (id: string) => `/team/${id}`,
    edit: (id: string) => `/team/${id}/edit`,
  },
  tournaments: {
    list: '/tournaments',
    detail: (id: string) => `/tournaments/${id}`,
    bracket: (id: string) => `/tournaments/${id}/bracket`,
    create: '/tournaments/create',
  },

  // ─── 인증 ──────────────────────────────────────────────────────
  auth: {
    login: '/login',
    signup: '/signup',
  },
} as const;

/**
 * 외부에서 String literal 사용 시 타입 안정성 보조.
 * Path를 문자열로 받는 함수에 PATHS.xxx를 그대로 전달할 수 있도록 한다.
 */
export type StaticPath = string;
