/**
 * 앱 메뉴 단일 진실의 원천 (Single Source of Truth)
 *
 * - DB seed (`teamplus-backend/prisma/seeds/app-menus.ts`)
 * - web 햄버거 메뉴 폴백 (`teamplus-web/src/components/layout/GlobalMenu.tsx`)
 * - admin 앱메뉴관리 미리보기/초기화 (`teamplus-admin/src/app/dashboard/app/menus/page.tsx`)
 *
 * 위 3 곳이 모두 이 파일을 import 하여 동일한 메뉴 구조를 표시한다.
 *
 * 규칙:
 *  - icon: Lucide 아이콘 이름 (kebab-case). web `Icon` 컴포넌트가 Material Symbol 로 자동 매핑.
 *  - href: `teamplus-web/src/lib/page-titles.ts` 의 키와 일치 → 라벨 오버라이드 동등 보장.
 *  - 공통지원 그룹은 모든 역할 끝에 자동 부착된다 (`COMMON_SUPPORT_GROUP`).
 */

export type AppMenuUserType =
  | "ADMIN"
  | "DIRECTOR"
  | "ACADEMY_DIRECTOR"
  | "COACH"
  | "PARENT"
  | "TEEN"
  | "CHILD";

export interface AppMenuItemSpec {
  /** 메뉴 라벨 (한국어). PAGE_TITLES 와 동일 문자열로 정렬. */
  label: string;
  /** Lucide kebab-case 아이콘 이름 */
  icon: string;
  /** 절대 경로 (trailing slash 없이) */
  href: string;
}

export interface AppMenuGroupSpec {
  label: string;
  icon: string;
  children: AppMenuItemSpec[];
}

/**
 * 모든 역할 메뉴 끝에 자동 부착되는 공통 지원 그룹.
 * - 도움말 / FAQ / 공지사항 / 피드백 / 약관
 * - 라벨은 PAGE_TITLES 와 동일.
 */
export const COMMON_SUPPORT_GROUP: AppMenuGroupSpec = {
  label: "고객지원",
  icon: "help-circle",
  children: [
    { label: "도움말", icon: "help-circle", href: "/help" },
    { label: "자주 묻는 질문", icon: "message-circle", href: "/faq" },
    { label: "공지사항", icon: "megaphone", href: "/notices" },
    { label: "고객센터", icon: "support-agent", href: "/feedback" },
    { label: "약관 및 정책", icon: "file-text", href: "/terms" },
  ],
};

// ─── ADMIN — 시스템 관리자 ───────────────────────────────
const ADMIN_MENU: AppMenuGroupSpec[] = [
  {
    label: "팀 관리",
    icon: "users",
    children: [
      { label: "팀 목록", icon: "users", href: "/team" },
      { label: "그룹 관리", icon: "layers", href: "/team-groups" },
      { label: "코치 관리", icon: "shield", href: "/coach-manage" },
    ],
  },
  {
    label: "회원 관리",
    icon: "users",
    children: [
      { label: "회원 관리", icon: "users", href: "/members" },
      { label: "수강 신청 승인", icon: "user-check", href: "/approval" },
      { label: "회원 등록", icon: "user-plus", href: "/members-create" },
    ],
  },
  {
    label: "수업·클럽 운영",
    icon: "calendar",
    children: [
      { label: "일정 관리", icon: "calendar", href: "/admin-schedules" },
      { label: "수업", icon: "list", href: "/classes" },
      { label: "매치 관리", icon: "swords", href: "/match-manage" },
      { label: "대회 관리", icon: "trophy", href: "/tournament-manage" },
    ],
  },
  {
    label: "결제·정산",
    icon: "credit-card",
    children: [
      { label: "결제 관리", icon: "credit-card", href: "/payments-manage" },
      { label: "정산 관리", icon: "receipt", href: "/settlements" },
    ],
  },
  {
    label: "시설·재고",
    icon: "package",
    children: [
      { label: "경기장 관리", icon: "building-2", href: "/venue-manage" },
      { label: "장비/재고 관리", icon: "package", href: "/inventory" },
    ],
  },
  {
    label: "콘텐츠 관리",
    icon: "megaphone",
    children: [
      { label: "공지 관리", icon: "megaphone", href: "/notices-manage" },
      { label: "공지 작성", icon: "edit-3", href: "/notices/create" },
      { label: "팝업 관리", icon: "layout-template", href: "/popups" },
    ],
  },
  {
    label: "소통",
    icon: "message-square",
    children: [{ label: "상담", icon: "message-square", href: "/messages" }],
  },
  {
    label: "설정",
    icon: "settings",
    children: [
      { label: "마이페이지", icon: "user", href: "/mypage" },
      { label: "환경 설정", icon: "settings", href: "/settings" },
    ],
  },
];

// ─── DIRECTOR — 감독 ─────────────────────────────────────
const DIRECTOR_MENU: AppMenuGroupSpec[] = [
  {
    label: "팀 관리",
    icon: "users",
    children: [
      // [수정 2026-04-30] 팀 상세 → 팀 관리 라벨 변경 (사용자 요청)
      { label: "팀 관리", icon: "sports-hockey", href: "/team" },
      { label: "회원 관리", icon: "users", href: "/director-members" },
      { label: "코치 관리", icon: "shield", href: "/director-coaches" },
      { label: "그룹 관리", icon: "layers", href: "/team-groups" },
      // [2026-05-21] 콘텐츠 그룹에서 팀 관리 그룹으로 이동.
      { label: "팀 공지관리", icon: "megaphone", href: "/director-notices" },
    ],
  },
  {
    // [수정 2026-04-30] 사용자 요청 — 코치 일정 삭제. 전체 일정 페이지(/director-schedules)에서
    // 수업/대회/매치 통합 노출되므로 별도 코치 일정 항목 불필요.
    label: "수업 관리",
    icon: "book-open",
    children: [
      { label: "수업 관리", icon: "list", href: "/classes-manage" },
      { label: "전체 일정", icon: "calendar", href: "/director-schedules" },
    ],
  },
  {
    // [수정 2026-04-30] 사용자 요청 — 첫 번째 "대회 관리"(/tournament-manage)만 삭제.
    // home 으로 리다이렉트되던 항목. 두 번째(/tournaments)는 실제 페이지가 있어 유지하고
    // 라벨을 "대회 관리" 로 통일.
    label: "대회 관리",
    icon: "trophy",
    children: [
      { label: "대회 관리", icon: "trophy", href: "/tournaments" },
      { label: "매치 관리", icon: "swords", href: "/match-manage" },
      { label: "리그", icon: "medal", href: "/leagues" },
    ],
  },
  {
    label: "재정",
    icon: "credit-card",
    children: [
      { label: "결제 관리", icon: "credit-card", href: "/director-payments" },
      { label: "크레딧 관리", icon: "wallet", href: "/director-credits" },
    ],
  },
  {
    label: "분석",
    icon: "bar-chart-2",
    children: [{ label: "통계", icon: "bar-chart-2", href: "/statistics" }],
  },
  {
    label: "설정",
    icon: "settings",
    children: [{ label: "마이페이지", icon: "user", href: "/mypage" }],
  },
];

// ─── ACADEMY_DIRECTOR — 아카데미 감독 ─────────────────────
const ACADEMY_DIRECTOR_MENU: AppMenuGroupSpec[] = [
  {
    label: "오픈클래스 관리",
    icon: "building-2",
    children: [
      { label: "오픈클래스", icon: "building-2", href: "/academy" },
      {
        label: "오픈클래스 등록",
        icon: "plus-circle",
        href: "/academy/create",
      },
      { label: "공개 오픈클래스", icon: "globe", href: "/academies" },
    ],
  },
  {
    label: "코치 관리",
    icon: "users",
    children: [
      { label: "코치 목록", icon: "users", href: "/coaches" },
      { label: "프로필 수정", icon: "edit-3", href: "/profile-edit" },
    ],
  },
  {
    label: "콘텐츠",
    icon: "megaphone",
    children: [
      { label: "프로모션", icon: "tag", href: "/promotions" },
      { label: "공지사항", icon: "megaphone", href: "/notices" },
      { label: "포토 갤러리", icon: "image", href: "/photos" },
    ],
  },
  {
    label: "설정",
    icon: "settings",
    children: [{ label: "마이페이지", icon: "user", href: "/mypage" }],
  },
];

// ─── COACH — 코치 ────────────────────────────────────────
// [수정 2026-04-30] 사용자 요청 — 코치 전체 메뉴를 감독(DIRECTOR_MENU) 와 동일하게 노출.
// 권한·메뉴 차등화는 추후 적용 예정.
const COACH_MENU: AppMenuGroupSpec[] = DIRECTOR_MENU;

// ─── PARENT — 학부모 ─────────────────────────────────────
const PARENT_MENU: AppMenuGroupSpec[] = [
  {
    label: "선수 관리",
    icon: "user",
    children: [{ label: "선수 목록", icon: "user", href: "/children" }],
  },
  {
    label: "내 활동",
    icon: "calendar-check",
    children: [
      { label: "수업", icon: "list", href: "/classes" },
      { label: "자녀 수업 캘린더", icon: "calendar", href: "/parent-calendar" },
      { label: "출석 내역", icon: "check-circle", href: "/attendance-history" },
      // [2026-05-21] 팀 공지사항 — 서비스 그룹에서 내 활동으로 이동.
      { label: "팀 공지사항", icon: "megaphone", href: "/team-notices" },
    ],
  },
  {
    label: "결제·크레딧",
    icon: "credit-card",
    children: [
      { label: "크레딧", icon: "wallet", href: "/credits" },
      { label: "결제 내역", icon: "receipt", href: "/payment/history" },
    ],
  },
  {
    label: "소통",
    icon: "message-square",
    children: [{ label: "상담", icon: "message-square", href: "/messages" }],
  },
  {
    label: "설정",
    icon: "settings",
    children: [{ label: "마이페이지", icon: "user", href: "/mypage" }],
  },
];

// ─── STUDENT — 학생 (TEEN/CHILD 통합) ───────────────────
// 사용자 요청으로 TEEN/CHILD 메뉴를 통일 (admin "학생" 단일 탭).
const STUDENT_MENU: AppMenuGroupSpec[] = [
  {
    label: "수업",
    icon: "book-open",
    children: [
      { label: "수업", icon: "list", href: "/classes" },
      { label: "수업 캘린더", icon: "calendar", href: "/calendar" },
      { label: "주간 일정", icon: "grid", href: "/schedule" },
    ],
  },
  {
    label: "활동·기록",
    icon: "trophy",
    children: [
      { label: "출석 내역", icon: "check-circle", href: "/attendance" },
      { label: "뱃지 컬렉션", icon: "badge", href: "/badges" },
      { label: "칭찬 스티커", icon: "star", href: "/stickers" },
      { label: "클럽 랭킹", icon: "bar-chart-2", href: "/ranking" },
      { label: "장비 체크리스트", icon: "clipboard-list", href: "/checklist" },
      { label: "선물·리워드", icon: "gift", href: "/gift" },
      { label: "포토 갤러리", icon: "image", href: "/photos" },
    ],
  },
  {
    label: "기타",
    icon: "more-horizontal",
    children: [
      // [2026-05-21] 팀 공지사항(소속 팀 공지 열람) + 서비스 공지사항 분리.
      { label: "팀 공지사항", icon: "megaphone", href: "/team-notices" },
      { label: "공지사항", icon: "megaphone", href: "/notices" },
      { label: "마이페이지", icon: "user", href: "/mypage" },
    ],
  },
];

const TEEN_MENU = STUDENT_MENU;
const CHILD_MENU = STUDENT_MENU;

/**
 * 역할별 메뉴 spec — 공통지원 그룹은 자동 부착됨.
 * 직접 사용 시 `getAppMenuSpec(userType)` 헬퍼 호출 권장.
 */
const APP_MENU_BASE: Record<AppMenuUserType, AppMenuGroupSpec[]> = {
  ADMIN: ADMIN_MENU,
  DIRECTOR: DIRECTOR_MENU,
  ACADEMY_DIRECTOR: ACADEMY_DIRECTOR_MENU,
  COACH: COACH_MENU,
  PARENT: PARENT_MENU,
  TEEN: TEEN_MENU,
  CHILD: CHILD_MENU,
};

/**
 * 역할 메뉴 spec (공통지원 그룹 포함) 반환.
 */
export function getAppMenuSpec(userType: AppMenuUserType): AppMenuGroupSpec[] {
  const base = APP_MENU_BASE[userType] ?? [];
  return [...base, COMMON_SUPPORT_GROUP];
}

export const APP_MENU_USER_TYPES: ReadonlyArray<AppMenuUserType> = [
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
];

/**
 * spec 에서 사용된 모든 Lucide 아이콘 이름 목록 (admin iconOptions 확장용).
 */
export function collectAllIconNames(): string[] {
  const set = new Set<string>();
  for (const userType of APP_MENU_USER_TYPES) {
    for (const group of getAppMenuSpec(userType)) {
      set.add(group.icon);
      for (const child of group.children) set.add(child.icon);
    }
  }
  return Array.from(set).sort();
}
