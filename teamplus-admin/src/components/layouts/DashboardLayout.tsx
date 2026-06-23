"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
// [정리 2026-04-30] 사용 중인 아이콘만 import (CheckCircle/Trophy/Mail/Cog/MessageSquare/GraduationCap 미사용 제거)
import {
  LogOut,
  Users,
  CalendarDays,
  CreditCard,
  Bell,
  LayoutDashboard,
  Menu,
  X,
  Building2,
  ClipboardCheck,
  BarChart3,
  Package,
  Megaphone,
  ShoppingCart,
  FolderTree,
  Truck,
  Settings,
  Image,
  Sun,
  Moon,
  LayoutList,
  User,
  KeyRound,
  BellRing,
  ChevronDown,
  ChevronRight,
  Shield,
  Trophy,
  MapPin,
  Folder,
  Briefcase,
  Store,
  AppWindow,
  LucideIcon,
  Ticket,
  Star,
  UserCheck,
  GraduationCap,
  Activity,
  ScrollText,
  FileBarChart,
  UserCog,
  HelpCircle,
  FileText,
  Tag,
  Wallet,
  GripVertical,
  Database,
  ReceiptText,
  Headset,
} from "lucide-react";
import { authService } from "@/services/auth.service";
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "@/services/api-client";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { SessionTimeoutModal } from "@/components/SessionTimeoutModal";
import { isNativeApp } from "@/lib/environment";
import { SYSTEM_ADMIN_EMAIL } from "@/lib/admin-constants";
import type { User as UserType } from "@/types";

/**
 * 사용자 타입에 따른 역할명 반환
 */
function getUserRoleLabel(userType?: string): string {
  switch (userType) {
    case "admin":
      return "관리자";
    case "coach":
      return "코치";
    case "parent":
      return "학부모";
    case "child":
      return "선수";
    default:
      return "사용자";
  }
}

/**
 * 사용자 표시명 반환 (이메일 기반 관리자명 > username > name > role > '사용자')
 */
function getUserDisplayName(user: UserType | null): string {
  if (!user) return "사용자";

  // 관리자 표시명 — userType 우선, 이메일은 하위호환 폴백 (2026-05-22)
  const adminUserType = String(user.userType ?? "").toUpperCase();
  if (adminUserType === "OPER" || user.email === "oper@teamplus.com") return "업무관리자";
  if (adminUserType === "SYSTEM" || user.email === SYSTEM_ADMIN_EMAIL) return "시스템관리자";

  // username이나 name이 있으면 해당 값 사용
  if (user.username && user.username.trim()) return user.username;
  if (user.name && user.name.trim()) return user.name;

  // 없으면 userType 기반 역할명 표시
  return getUserRoleLabel(user.userType);
}

/**
 * 쿠키와 localStorage 토큰 동기화
 * - localStorage에 토큰이 있는데 쿠키에 없으면 쿠키에 재설정
 * - 미들웨어 인증 실패 방지
 */
function syncTokenCookies(): boolean {
  if (typeof window === "undefined") return false;

  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();

  if (!accessToken) return false;

  // 쿠키에서 토큰 확인
  const hasCookie = document.cookie.includes("teamplus_access_token");

  if (!hasCookie && accessToken && refreshToken) {
    // localStorage에는 있는데 쿠키에 없으면 쿠키 재설정
    if (process.env.NODE_ENV === "development") {
      console.log("[Auth Sync] 쿠키 재설정 - localStorage 토큰으로 쿠키 복구");
    }
    setTokens(accessToken, refreshToken);
    return true;
  }

  return hasCookie;
}

// 단일 컬러 시스템 - Human-like Professional Design
// 브랜드 블루(#1E40AF)만 악센트 컬러로 사용, 나머지는 회색 계열
const sidebarStyles = {
  // 활성 상태
  active: {
    bg: "bg-slate-100 dark:bg-slate-700/50",
    text: "text-slate-900 dark:text-white",
    icon: "text-primary dark:text-primary-light",
  },
  // 기본 상태
  default: {
    text: "text-slate-600 dark:text-slate-400",
    icon: "text-slate-400 dark:text-slate-500",
    hover:
      "hover:bg-slate-50 dark:hover:bg-slate-700/30 hover:text-slate-900 dark:hover:text-white",
  },
};

// 대시보드 (독립 메뉴 - 그룹 밖)
const dashboardItem = {
  href: "/dashboard",
  label: "대시보드",
  icon: LayoutDashboard,
};

// ============ 업무관리 ============
// [수정 2026-04-30] 사용자 요청 — 수업/대회/레슨 승인 메뉴 + 메시지관리 삭제. 결제/정산/리포트만 유지.
const businessNavItems = [
  { href: "/dashboard/payments", label: "결제관리", icon: CreditCard },
  { href: "/dashboard/settlements", label: "정산관리", icon: Wallet },
  { href: "/dashboard/reports", label: "리포트", icon: FileBarChart },
];

// ============ 일반관리 ============
// [수정 2026-04-30] '출석관리' → '수업관리'
const generalNavItems = [
  { href: "/dashboard/directors", label: "감독관리", icon: UserCog },
  { href: "/dashboard/coaches", label: "코치관리", icon: Shield },
  { href: "/dashboard/teams", label: "팀관리", icon: Building2 },
  {
    href: "/dashboard/academies",
    label: "오픈클래스관리",
    icon: GraduationCap,
  },
  { href: "/dashboard/parents", label: "학부모관리", icon: Users },
  { href: "/dashboard/members", label: "학생관리", icon: UserCheck },
  { href: "/dashboard/attendance", label: "수업관리", icon: ClipboardCheck },
  { href: "/dashboard/tournaments", label: "대회/경기관리", icon: Trophy },
  { href: "/dashboard/rinks", label: "링크장관리", icon: MapPin },
  { href: "/dashboard/venues", label: "대관관리", icon: CalendarDays },
  // [이동 2026-06-18] 사용자 요청 — '상담 신청'을 업무관리 → 일반관리 그룹 맨 아래로 배치.
  {
    href: "/dashboard/contact-inquiries",
    label: "상담 신청",
    icon: Headset,
  },
];

// ============ 앱관리 ============
// [수정 2026-04-30] 사용자 요청 — 피드백관리 삭제, 앱메뉴관리를 첫번째로 이동
const appNavItems = [
  { href: "/dashboard/app/menus", label: "앱메뉴관리", icon: LayoutList },
  { href: "/dashboard/app/banners", label: "배너관리", icon: Image },
  { href: "/dashboard/app/push", label: "알림관리", icon: Bell },
  { href: "/dashboard/app/notices", label: "공지사항관리", icon: Megaphone },
  { href: "/dashboard/app/faq", label: "FAQ관리", icon: HelpCircle },
  { href: "/dashboard/app/terms", label: "약관관리", icon: FileText },
  { href: "/dashboard/app/versions", label: "버전관리", icon: Tag },
  { href: "/dashboard/app/statistics", label: "앱통계", icon: BarChart3 },
  { href: "/dashboard/app/settings", label: "앱설정", icon: Settings },
];

// ============ 시스템관리 (시스템관리자 전용) ============
// [수정 2026-04-30] 사용자 요청 — 시스템설정(/dashboard/settings) 항목 삭제
const systemNavItems = [
  { href: "/dashboard/system/admins", label: "관리자계정관리", icon: KeyRound },
  { href: "/dashboard/common-codes", label: "공통코드관리", icon: Database },
  { href: "/dashboard/system/monitoring", label: "모니터링", icon: Activity },
  { href: "/dashboard/system/logs", label: "로그", icon: ScrollText },
  {
    href: "/dashboard/system/transaction-logs",
    label: "거래로그",
    icon: ReceiptText,
  },
];

// ============ 쇼핑몰관리 ============
const shopNavItems = [
  {
    href: "/dashboard/shop/categories",
    label: "카테고리 관리",
    icon: FolderTree,
  },
  {
    href: "/dashboard/shop/products",
    label: "쇼핑몰 상품",
    icon: ShoppingCart,
  },
  { href: "/dashboard/shop/orders", label: "주문 관리", icon: Package },
  { href: "/dashboard/shop/coupons", label: "쿠폰 관리", icon: Ticket },
  { href: "/dashboard/shop/reviews", label: "리뷰 관리", icon: Star },
  { href: "/dashboard/shop/stats", label: "통계", icon: BarChart3 },
  { href: "/dashboard/shop/shipping", label: "배송 관리", icon: Truck },
];

// 메뉴 그룹 타입
type MenuGroupId = "business" | "general" | "app" | "system" | "shop";

// 메뉴 그룹 정의
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface MenuGroup {
  id: MenuGroupId;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  systemOnly?: boolean; // 시스템관리자 전용 여부
}

// [수정 2026-04-30] 사용자 요청 — 대메뉴 순서: 일반관리 → 업무관리 → 앱관리 → 시스템관리.
// (대시보드는 그룹 밖 독립 메뉴로 항상 최상단에 노출되므로 그룹 배열엔 포함되지 않음.)
// 쇼핑몰관리는 별개 분류 — 시스템관리 다음에 유지.
const allMenuGroups: MenuGroup[] = [
  { id: "general", label: "일반관리", icon: Folder, items: generalNavItems },
  {
    id: "business",
    label: "업무관리",
    icon: Briefcase,
    items: businessNavItems,
  },
  { id: "app", label: "앱관리", icon: AppWindow, items: appNavItems },
  {
    id: "system",
    label: "시스템관리",
    icon: Settings,
    items: systemNavItems,
    systemOnly: true,
  },
  { id: "shop", label: "쇼핑몰관리", icon: Store, items: shopNavItems },
];

// 역할에 따라 메뉴 그룹 필터링
// [수정 2026-05-22] 이메일(system@teamplus.com) 단독 판별 → userType 기반으로 변경.
//   계정 이메일이 SYSTEM_ADMIN_EMAIL 과 달라도(예: system@icetime.com) userType=SYSTEM 이면
//   시스템관리 메뉴가 노출되도록 함. 백엔드 userType 은 대문자('SYSTEM') 라 toUpperCase 로 정규화.
//   업무관리자(OPER) 는 systemOnly 메뉴 제외. 기존 이메일 비교는 하위호환으로 OR 유지.
function getMenuGroupsForUser(user?: UserType | null): MenuGroup[] {
  const userType = String(user?.userType ?? "").toUpperCase();
  const isSystemAdmin = userType === "SYSTEM" || user?.email === SYSTEM_ADMIN_EMAIL;
  if (isSystemAdmin) {
    return allMenuGroups; // 시스템관리자: 모든 메뉴
  }
  return allMenuGroups.filter((g) => !g.systemOnly); // 업무관리자: 시스템관리 제외
}

// 모든 nav 아이템 목록 (중복 활성화 방지에 사용)
const allNavItems = [dashboardItem, ...allMenuGroups.flatMap((g) => g.items)];

// 정확한 nav 항목 활성 상태 계산 (더 구체적인 경로가 있으면 부모 비활성화)
// 예: /dashboard/members/levels 에 있을 때 /dashboard/members 는 비활성
function isNavItemActive(href: string, currentPath: string | null): boolean {
  if (!currentPath) return false;
  if (currentPath === href) return true;
  if (href === "/dashboard") return false;

  // 2026-05-08: 수업관리/대회·경기관리 메뉴는 별칭 경로 진입 시에도 active 유지.
  //   - /dashboard/classes/* → 수업관리(/dashboard/attendance) active
  //   - /dashboard/matches/* → 대회·경기관리(/dashboard/tournaments) active
  if (
    href === "/dashboard/attendance" &&
    currentPath.startsWith("/dashboard/classes")
  ) {
    return true;
  }
  if (
    href === "/dashboard/tournaments" &&
    currentPath.startsWith("/dashboard/matches")
  ) {
    return true;
  }

  if (!currentPath.startsWith(`${href}/`)) return false;
  // 더 구체적인 경로를 가진 nav 항목이 현재 경로와 일치하면 이 항목은 비활성
  return !allNavItems.some(
    (other) =>
      other.href !== href &&
      other.href.startsWith(`${href}/`) &&
      currentPath.startsWith(other.href),
  );
}

// URL 경로에 따라 해당 그룹 찾기
const getGroupFromPath = (pathname: string | null): MenuGroupId | null => {
  if (!pathname) return null;
  if (pathname === "/dashboard") return null;
  // [수정 2026-04-30] /dashboard/approvals 삭제 — payments/settlements/reports 만 business 그룹
  if (
    pathname.startsWith("/dashboard/payments") ||
    pathname.startsWith("/dashboard/settlements") ||
    pathname.startsWith("/dashboard/reports")
  )
    return "business";
  if (
    pathname.startsWith("/dashboard/members") ||
    pathname.startsWith("/dashboard/directors") ||
    pathname.startsWith("/dashboard/coaches") ||
    pathname.startsWith("/dashboard/parents") ||
    pathname.startsWith("/dashboard/clubs") ||
    pathname.startsWith("/dashboard/teams") ||
    pathname.startsWith("/dashboard/academies") ||
    pathname.startsWith("/dashboard/attendance") ||
    pathname.startsWith("/dashboard/classes") ||
    pathname.startsWith("/dashboard/matches") ||
    pathname.startsWith("/dashboard/tournaments") ||
    pathname.startsWith("/dashboard/rinks") ||
    pathname.startsWith("/dashboard/venues") ||
    pathname.startsWith("/dashboard/contact-inquiries")
  )
    return "general";
  if (pathname.startsWith("/dashboard/app")) return "app";
  if (
    pathname.startsWith("/dashboard/system") ||
    pathname.startsWith("/dashboard/common-codes")
  )
    return "system";
  if (pathname.startsWith("/dashboard/shop")) return "shop";
  return "business";
};

// 타임아웃 설정 (밀리초)
// [2026-06-04] 사용자 요구 — 유휴 자동 로그아웃 5분 → 30분 상향.
//   29분 동안 활동 없으면 경고 팝업, 이후 1분 카운트다운 (총 30분).
const WARNING_TIME = 29 * 60 * 1000; // 29분 후 경고 시작
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30분 후 자동 로그아웃 (29분 + 1분)

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

// 초기 테마를 쿠키에서 읽어오는 함수 (hydration mismatch 방지)
function getInitialTheme(): "light" | "dark" {
  if (typeof document !== "undefined") {
    // 서버에서 렌더링한 html 클래스 확인
    if (document.documentElement.classList.contains("dark")) {
      return "dark";
    }
    // 쿠키에서 확인
    const match = document.cookie.match(/teamplus_theme=(light|dark)/);
    if (match) {
      return match[1] as "light" | "dark";
    }
  }
  return "light";
}

// [추가 2026-04-30] 사이드바 하위메뉴 드래그 정렬 상태 — localStorage 영속화.
// 키: teamplus_admin_menu_order_v1, 형식: { [groupId]: string[] (href 순서) }
const MENU_ORDER_STORAGE_KEY = "teamplus_admin_menu_order_v1";
type MenuOrderMap = Partial<Record<MenuGroupId, string[]>>;

function loadMenuOrder(): MenuOrderMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MENU_ORDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as MenuOrderMap)
      : {};
  } catch {
    return {};
  }
}

function saveMenuOrder(orderMap: MenuOrderMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MENU_ORDER_STORAGE_KEY,
      JSON.stringify(orderMap),
    );
  } catch {
    // 저장 실패 무시 (사이드바 동작 자체엔 영향 없음)
  }
}

/** 저장된 순서를 적용해 items 를 재배치. 누락된 신규 항목은 기존 순서대로 끝에 추가. */
function applyMenuOrder(
  items: NavItem[],
  hrefOrder: string[] | undefined,
): NavItem[] {
  if (!hrefOrder || hrefOrder.length === 0) return items;
  const byHref = new Map(items.map((it) => [it.href, it]));
  const ordered: NavItem[] = [];
  for (const href of hrefOrder) {
    const it = byHref.get(href);
    if (it) {
      ordered.push(it);
      byHref.delete(href);
    }
  }
  // 새로 추가된 (저장 시점엔 없던) 항목은 원래 순서로 뒤에 부착
  for (const it of items) {
    if (byHref.has(it.href)) ordered.push(it);
  }
  return ordered;
}

export default function DashboardLayout({
  children,
  title,
  subtitle,
}: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserType | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [openMenuGroup, setOpenMenuGroup] = useState<MenuGroupId | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // [추가 2026-04-30] 메뉴 순서 (드래그 정렬) 상태
  const [menuOrder, setMenuOrder] = useState<MenuOrderMap>({});
  useEffect(() => {
    setMenuOrder(loadMenuOrder());
  }, []);

  // 사이드바 그룹별 정렬 적용된 items 캐시 (재계산 최소화)
  const orderedItemsByGroup = useMemo<Record<MenuGroupId, NavItem[]>>(() => {
    const result: Record<string, NavItem[]> = {};
    for (const g of allMenuGroups) {
      result[g.id] = applyMenuOrder(g.items, menuOrder[g.id]);
    }
    return result as Record<MenuGroupId, NavItem[]>;
  }, [menuOrder]);

  // 드래그 상태 — { groupId, dragHref }
  const [dragging, setDragging] = useState<{
    groupId: MenuGroupId;
    href: string;
  } | null>(null);

  const handleItemDragStart =
    (groupId: MenuGroupId, href: string) => (e: React.DragEvent) => {
      setDragging({ groupId, href });
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", href);
      } catch {
        /* 일부 브라우저 무시 */
      }
    };
  const handleItemDragOver = (groupId: MenuGroupId) => (e: React.DragEvent) => {
    if (dragging?.groupId !== groupId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const handleItemDrop =
    (groupId: MenuGroupId, targetHref: string) => (e: React.DragEvent) => {
      e.preventDefault();
      if (
        !dragging ||
        dragging.groupId !== groupId ||
        dragging.href === targetHref
      ) {
        setDragging(null);
        return;
      }
      const current = orderedItemsByGroup[groupId];
      const fromIdx = current.findIndex((it) => it.href === dragging.href);
      const toIdx = current.findIndex((it) => it.href === targetHref);
      if (fromIdx < 0 || toIdx < 0) {
        setDragging(null);
        return;
      }
      const next = [...current];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const nextHrefs = next.map((it) => it.href);
      const updated: MenuOrderMap = { ...menuOrder, [groupId]: nextHrefs };
      setMenuOrder(updated);
      saveMenuOrder(updated);
      setDragging(null);
    };
  const handleItemDragEnd = () => setDragging(null);

  // URL 변경 시 해당 그룹 자동 열기
  useEffect(() => {
    const currentGroup = getGroupFromPath(pathname);
    setOpenMenuGroup(currentGroup);

    // 경로 변경 시 쿠키 동기화 (미들웨어 통과 보장용)
    if (typeof window !== "undefined") {
      syncTokenCookies();
    }
  }, [pathname]);

  // 메뉴 그룹 토글 핸들러 (아코디언)
  // 현재 활성 아이템이 있는 그룹은 접히지 않도록 보호
  const handleGroupToggle = (groupId: MenuGroupId) => {
    setOpenMenuGroup((prev) => (prev === groupId ? null : groupId));
  };

  // 클라이언트 사이드 마운트 확인
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 네이티브 환경 감지 (Flutter WebView) - 마운트된 후 직접 체크
  const isNative = isMounted ? isNativeApp() : false;

  // 디버깅: 네이티브 환경 감지 결과 로깅
  useEffect(() => {
    if (isMounted && process.env.NODE_ENV === "development") {
      const userAgent =
        typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
      console.log("[DashboardLayout] 환경 감지:", {
        isNative,
        isMounted,
        userAgent: userAgent.substring(0, 100),
        hasteamplusApp: userAgent.includes("teamplusApp"),
        hasFlutter: userAgent.includes("Flutter"),
      });
    }
  }, [isMounted, isNative]);

  // 인증 체크 - 최초 마운트 시에만 실행 (router 의존성 제거로 네비게이션 시 재실행 방지)
  useEffect(() => {
    if (!isMounted) return;
    // 이미 인증 확인된 경우 재실행 방지
    if (isAuthChecked) return;

    // 먼저 쿠키와 localStorage 동기화 시도
    syncTokenCookies();

    const currentUser = authService.getCurrentUser();
    const isAuth = authService.isAuthenticated();

    if (!isAuth) {
      // 액세스 토큰 만료 시: refresh token이 있으면 인증 유지 (API 인터셉터가 갱신 처리)
      const hasRefreshToken = !!getRefreshToken();
      if (!hasRefreshToken) {
        router.replace("/login");
        return;
      }
    }

    setUser(currentUser);
    setIsAuthChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]); // router 제거 - 네비게이션 시 재실행 방지

  // 사용자 메뉴 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isUserMenuOpen]);

  // 테마 적용 (초기화는 getInitialTheme에서 이미 처리됨)
  useEffect(() => {
    if (!isMounted) return;

    // 현재 document 상태와 theme 상태가 일치하는지 확인
    const isDarkInDocument =
      document.documentElement.classList.contains("dark");
    const shouldBeDark = theme === "dark";

    // 불필요한 DOM 조작 방지
    if (isDarkInDocument !== shouldBeDark) {
      if (shouldBeDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    // localStorage와 쿠키 모두에 저장 (쿠키는 서버사이드 렌더링용)
    localStorage.setItem("teamplus_theme", theme);
    document.cookie = `teamplus_theme=${theme};path=/;max-age=31536000;SameSite=Lax`;
  }, [theme, isMounted]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // 수동 로그아웃 핸들러
  const handleLogout = () => {
    authService.logout("manual");
  };

  // 세션 타임아웃으로 인한 자동 로그아웃
  const handleSessionTimeout = () => {
    authService.logout("session_timeout");
  };

  // 자동 로그아웃 타이머 - 인증 확인 후에만 활성화
  const { isWarning, resetTimer } = useIdleTimer({
    timeout: IDLE_TIMEOUT,
    warningTime: WARNING_TIME,
    onIdle: () => {
      // 세션 타임아웃으로 자동 로그아웃
      if (isAuthChecked) {
        handleSessionTimeout();
      }
    },
    onWarning: () => {
      // 경고 모달 표시 (isWarning state로 처리)
      if (process.env.NODE_ENV === "development") {
        console.log("[Session] 세션 만료 경고 - 1분 후 자동 로그아웃");
      }
    },
    onActive: () => {
      // 활동 재개 시 (세션 연장 버튼 클릭 시)
      if (process.env.NODE_ENV === "development") {
        console.log("[Session] 세션 연장됨 - 타이머 초기화");
      }
    },
  });

  // 세션 연장 핸들러 - 타이머를 처음부터 다시 시작
  const handleExtendSession = () => {
    if (process.env.NODE_ENV === "development") {
      console.log("[Session] 사용자가 세션 연장 요청");
    }
    resetTimer();
  };

  // 클라이언트 사이드 렌더링 전 로딩 표시 (배경만 — 콘텐츠 영역 loading.tsx가 스피너 표시)
  if (!isMounted || !isAuthChecked) {
    return (
      <div
        className="min-h-screen bg-slate-50 dark:bg-slate-900"
        suppressHydrationWarning
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-900 flex"
      suppressHydrationWarning
    >
      {/* Session Timeout Modal */}
      <SessionTimeoutModal
        isOpen={isWarning}
        onExtend={handleExtendSession}
        onLogout={handleLogout}
      />

      {/* Sidebar - Desktop - 배경색: 콘텐츠 영역과 동일 (UI 통일) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 fixed h-full z-40">
        {/* Logo - 헤더와 동일한 높이 (h-16 = 64px) */}
        <div className="h-16 border-b border-slate-200 dark:border-slate-700 flex items-center justify-center">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M21.71 16.29L18.41 13l3.3-3.29a1 1 0 00-1.42-1.42L17 11.59l-3.29-3.3a1 1 0 00-1.42 1.42l3.3 3.29-3.3 3.29a1 1 0 001.42 1.42l3.29-3.3 3.29 3.3a1 1 0 001.42-1.42zM3 21a1 1 0 001 1h5a1 1 0 000-2H5V5h14v5a1 1 0 002 0V4a1 1 0 00-1-1H4a1 1 0 00-1 1v17z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-slate-900 dark:text-white">아이</span>
              <span className="text-success">스</span>
              <span className="text-slate-900 dark:text-white">타임</span>
            </h1>
          </Link>
        </div>

        {/* Navigation - Accordion Menu (Human-like Design) */}
        <nav className="flex-1 p-3 overflow-y-auto">
          <div className="space-y-1">
            {/* 대시보드 - 독립 메뉴 (그룹 밖) */}
            <Link
              href={dashboardItem.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/dashboard"
                  ? `${sidebarStyles.active.bg} ${sidebarStyles.active.text}`
                  : `${sidebarStyles.default.text} ${sidebarStyles.default.hover}`
              }`}
            >
              <dashboardItem.icon
                className={`w-5 h-5 ${
                  pathname === "/dashboard"
                    ? sidebarStyles.active.icon
                    : sidebarStyles.default.icon
                }`}
              />
              <span>{dashboardItem.label}</span>
            </Link>

            {getMenuGroupsForUser(user).map((group) => {
              const isOpen = openMenuGroup === group.id;
              const hasActiveItem = group.items.some((item) =>
                isNavItemActive(item.href, pathname),
              );

              return (
                <div key={group.id}>
                  {/* 그룹 헤더 - 통일된 스타일, 아이콘 배경 제거 */}
                  <button
                    onClick={() => handleGroupToggle(group.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isOpen || hasActiveItem
                        ? "text-slate-900 dark:text-white"
                        : `${sidebarStyles.default.text} ${sidebarStyles.default.hover}`
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <group.icon
                        className={`w-5 h-5 ${
                          isOpen || hasActiveItem
                            ? sidebarStyles.active.icon
                            : sidebarStyles.default.icon
                        }`}
                      />
                      <span>{group.label}</span>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {/* 하위 메뉴 */}
                  <div
                    className={`overflow-hidden transition-all duration-200 ease-in-out ${
                      isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="mt-1 ml-4 space-y-0.5">
                      {/* [수정 2026-04-30] 드래그 정렬 — 그립 핸들로 항목 위치 조정, localStorage 영속화 */}
                      {(orderedItemsByGroup[group.id] ?? group.items).map(
                        (item) => {
                          const isActive = isNavItemActive(item.href, pathname);
                          const isBeingDragged =
                            dragging?.groupId === group.id &&
                            dragging.href === item.href;

                          return (
                            <div
                              key={item.href}
                              draggable
                              onDragStart={handleItemDragStart(
                                group.id,
                                item.href,
                              )}
                              onDragOver={handleItemDragOver(group.id)}
                              onDrop={handleItemDrop(group.id, item.href)}
                              onDragEnd={handleItemDragEnd}
                              className={`relative ${isBeingDragged ? "opacity-40" : ""}`}
                            >
                              <Link
                                href={item.href}
                                className={`relative flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                                  isActive
                                    ? `${sidebarStyles.active.bg} ${sidebarStyles.active.text}`
                                    : `${sidebarStyles.default.text} ${sidebarStyles.default.hover}`
                                }`}
                              >
                                {isActive && (
                                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-full animate-admin-indicator" />
                                )}
                                <GripVertical
                                  className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 cursor-grab active:cursor-grabbing"
                                  aria-label="드래그하여 순서 변경"
                                />
                                <item.icon
                                  className={`w-4 h-4 ${
                                    isActive
                                      ? sidebarStyles.active.icon
                                      : sidebarStyles.default.icon
                                  }`}
                                />
                                <span>{item.label}</span>
                              </Link>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 animate-admin-fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar - 배경색: 콘텐츠 영역과 동일 (UI 통일) */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 z-50 transform transition-transform duration-200 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 flex items-center justify-center border-b border-slate-200 dark:border-slate-700 relative">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M21.71 16.29L18.41 13l3.3-3.29a1 1 0 00-1.42-1.42L17 11.59l-3.29-3.3a1 1 0 00-1.42 1.42l3.3 3.29-3.3 3.29a1 1 0 001.42 1.42l3.29-3.3 3.29 3.3a1 1 0 001.42-1.42zM3 21a1 1 0 001 1h5a1 1 0 000-2H5V5h14v5a1 1 0 002 0V4a1 1 0 00-1-1H4a1 1 0 00-1 1v17z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-slate-900 dark:text-white">아이</span>
              <span className="text-success">스</span>
              <span className="text-slate-900 dark:text-white">타임</span>
            </h1>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="absolute right-4 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>
        {/* Navigation - Accordion Menu (Mobile - Human-like Design) */}
        <nav className="p-3 overflow-y-auto h-[calc(100%-60px)]">
          <div className="space-y-1">
            {/* 대시보드 - 독립 메뉴 (그룹 밖) */}
            <Link
              href={dashboardItem.href}
              onClick={() => setIsSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/dashboard"
                  ? `${sidebarStyles.active.bg} ${sidebarStyles.active.text}`
                  : `${sidebarStyles.default.text} ${sidebarStyles.default.hover}`
              }`}
            >
              <dashboardItem.icon
                className={`w-5 h-5 ${
                  pathname === "/dashboard"
                    ? sidebarStyles.active.icon
                    : sidebarStyles.default.icon
                }`}
              />
              <span>{dashboardItem.label}</span>
            </Link>

            {getMenuGroupsForUser(user).map((group) => {
              const isOpen = openMenuGroup === group.id;
              const hasActiveItem = group.items.some((item) =>
                isNavItemActive(item.href, pathname),
              );

              return (
                <div key={group.id}>
                  {/* 그룹 헤더 - 통일된 스타일, 아이콘 배경 제거 */}
                  <button
                    onClick={() => handleGroupToggle(group.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isOpen || hasActiveItem
                        ? "text-slate-900 dark:text-white"
                        : `${sidebarStyles.default.text} ${sidebarStyles.default.hover}`
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <group.icon
                        className={`w-5 h-5 ${
                          isOpen || hasActiveItem
                            ? sidebarStyles.active.icon
                            : sidebarStyles.default.icon
                        }`}
                      />
                      <span>{group.label}</span>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {/* 하위 메뉴 */}
                  <div
                    className={`overflow-hidden transition-all duration-200 ease-in-out ${
                      isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="mt-1 ml-4 space-y-0.5">
                      {(orderedItemsByGroup[group.id] ?? group.items).map(
                        (item) => {
                          const isActive = isNavItemActive(item.href, pathname);
                          const isBeingDragged =
                            dragging?.groupId === group.id &&
                            dragging.href === item.href;

                          return (
                            <div
                              key={item.href}
                              draggable
                              onDragStart={handleItemDragStart(
                                group.id,
                                item.href,
                              )}
                              onDragOver={handleItemDragOver(group.id)}
                              onDrop={handleItemDrop(group.id, item.href)}
                              onDragEnd={handleItemDragEnd}
                              className={`relative ${isBeingDragged ? "opacity-40" : ""}`}
                            >
                              <Link
                                href={item.href}
                                onClick={() => setIsSidebarOpen(false)}
                                className={`relative flex items-center gap-2 pl-2 pr-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                                  isActive
                                    ? `${sidebarStyles.active.bg} ${sidebarStyles.active.text}`
                                    : `${sidebarStyles.default.text} ${sidebarStyles.default.hover}`
                                }`}
                              >
                                {isActive && (
                                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-full animate-admin-indicator" />
                                )}
                                <GripVertical
                                  className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 cursor-grab active:cursor-grabbing"
                                  aria-label="드래그하여 순서 변경"
                                />
                                <item.icon
                                  className={`w-4 h-4 ${
                                    isActive
                                      ? sidebarStyles.active.icon
                                      : sidebarStyles.default.icon
                                  }`}
                                />
                                <span>{item.label}</span>
                              </Link>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div
        className="flex-1 lg:ml-64 flex flex-col min-h-screen"
        suppressHydrationWarning
      >
        {/* Header - Mobile & Desktop (사이드바 로고와 동일한 높이) - 배경색: 콘텐츠 영역과 동일 (UI 통일) */}
        {/* 네이티브 환경에서는 Flutter AppBar 사용을 위해 숨김 */}
        {!isNative && (
          <header
            className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30 h-16"
            suppressHydrationWarning
          >
            <div
              className="h-full px-4 lg:px-6 flex items-center justify-between"
              suppressHydrationWarning
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                </button>
                <div className="lg:hidden flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M21.71 16.29L18.41 13l3.3-3.29a1 1 0 00-1.42-1.42L17 11.59l-3.29-3.3a1 1 0 00-1.42 1.42l3.3 3.29-3.3 3.29a1 1 0 001.42 1.42l3.29-3.3 3.29 3.3a1 1 0 001.42-1.42zM3 21a1 1 0 001 1h5a1 1 0 000-2H5V5h14v5a1 1 0 002 0V4a1 1 0 00-1-1H4a1 1 0 00-1 1v17z" />
                    </svg>
                  </div>
                  <h1 className="text-lg font-bold tracking-tight">
                    <span className="text-slate-900 dark:text-white">아이</span>
                    <span className="text-success">스</span>
                    <span className="text-slate-900 dark:text-white">타임</span>
                  </h1>
                </div>
              </div>

              {/* Right Side: User Menu */}
              <div className="flex items-center gap-2 sm:gap-4">
                {/* 테마 토글 버튼 */}
                <button
                  onClick={toggleTheme}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title={
                    theme === "light"
                      ? "다크 모드로 전환"
                      : "라이트 모드로 전환"
                  }
                >
                  {theme === "light" ? (
                    <Moon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  ) : (
                    <Sun className="w-5 h-5 text-amber-500" />
                  )}
                </button>

                {/* 사용자 메뉴 드롭다운 */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="w-9 h-9 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center border border-primary/20">
                      <span className="text-sm font-medium text-primary">
                        {getUserDisplayName(user).charAt(0)}
                      </span>
                    </div>
                    {/* 사용자명 - 모든 화면에서 표시 */}
                    <div className="text-left">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {getUserDisplayName(user)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 hidden md:block">
                        {user?.email}
                      </p>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {/* 드롭다운 메뉴 */}
                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-50 animate-admin-scale-in origin-top-right">
                      {/* 사용자 정보 헤더 */}
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center border border-primary/20">
                            <span className="text-base font-medium text-primary">
                              {getUserDisplayName(user).charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {getUserDisplayName(user)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {user?.email}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 메뉴 항목들 */}
                      <div className="py-1">
                        <Link
                          href="/dashboard/profile"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                          <span>내 정보 수정</span>
                        </Link>
                        <Link
                          href="/dashboard/profile/password"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <KeyRound className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                          <span>비밀번호 변경</span>
                        </Link>
                        <Link
                          href="/dashboard/profile/notifications"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <BellRing className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                          <span>알림 설정</span>
                        </Link>
                        <Link
                          href="/dashboard/profile/security"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                          <span>보안 설정</span>
                        </Link>
                      </div>

                      {/* 구분선 */}
                      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />

                      {/* 로그아웃 */}
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            handleLogout();
                          }}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>로그아웃</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Page Content - pathname 기반 fade-in 전환 */}
        <main
          key={pathname}
          className="flex-1 p-6 lg:p-8 animate-admin-fade-in"
          suppressHydrationWarning
        >
          {/* Page Header (Rendered only if title is provided) */}
          {(title || subtitle) && (
            <div className="mb-8" suppressHydrationWarning>
              {title && (
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-slate-500 dark:text-slate-400 mt-1">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
