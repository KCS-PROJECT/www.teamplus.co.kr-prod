"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef, type MouseEvent } from "react";
import { NavLink, useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/scroll-lock";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import { PATHS } from "@/lib/paths";
import { usePageReady } from '@/hooks/usePageReady';
import { resolveImageSrc } from "@/lib/image-url";
import {
  DrawerStatsBento,
  DrawerPromoCard,
  DrawerMenuSection,
  type DrawerStatItem,
  type DrawerSubMenuItem,
} from "@/components/drawer";

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────
interface MainMenuItem {
  id: string;
  icon: string;
  label: string;
  subItems: DrawerSubMenuItem[];
}

type UserRole = "parent" | "coach" | "admin" | "director" | "teen" | "child";

interface RolePromo {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  href: string;
  icon: string;
}

// ─────────────────────────────────────────────
// 역할별 레이블 · 통계 · 프로모션
// ─────────────────────────────────────────────
const ROLE_LABEL: Record<UserRole, string> = {
  admin: "관리자",
  director: "감독",
  coach: "코치",
  parent: "학부모",
  teen: "청소년",
  child: "어린이",
};

const ROLE_STATS: Record<UserRole, DrawerStatItem[]> = {
  admin: [
    { icon: "payments", label: "오늘 매출", value: "0원", tone: "primary" },
    { icon: "person_add", label: "승인 대기", value: "0 건", tone: "warning" },
  ],
  director: [
    { icon: "groups", label: "활동 팀", value: "0 팀", tone: "primary" },
    { icon: "sports", label: "소속 코치", value: "0 명", tone: "info" },
  ],
  coach: [
    {
      icon: "calendar_today",
      label: "이번 달 수업",
      value: "0 회",
      tone: "primary",
    },
    { icon: "group", label: "담당 학생", value: "0 명", tone: "success" },
  ],
  parent: [
    { icon: "child_care", label: "자녀", value: "0 명", tone: "primary" },
    { icon: "credit_card", label: "결제권", value: "0 회", tone: "success" },
  ],
  teen: [
    {
      icon: "event_available",
      label: "이번 달 출석",
      value: "0 회",
      tone: "primary",
    },
    { icon: "military_tech", label: "뱃지", value: "0 개", tone: "warning" },
  ],
  child: [
    { icon: "stars", label: "스티커", value: "0 개", tone: "warning" },
    { icon: "military_tech", label: "뱃지", value: "0 개", tone: "primary" },
  ],
};

const ROLE_PROMO: Record<UserRole, RolePromo> = {
  admin: {
    eyebrow: "ADMIN TOOLS",
    title: "공지를 빠르게\n등록해 보세요",
    description: "회원에게 즉시 푸시 발송이 가능합니다.",
    ctaLabel: "공지 등록하기",
    href: "/notices/create",
    icon: "campaign",
  },
  director: {
    eyebrow: "DIRECTOR",
    title: "팀 운영 현황을\n한눈에 확인하세요",
    description: "월별 통계와 성과 리포트를 제공합니다.",
    ctaLabel: "대시보드 이동",
    href: "/director",
    icon: "insights",
  },
  coach: {
    eyebrow: "COACH TOOLS",
    title: "수업을 빠르게\n등록하고 관리하세요",
    description: "이번 주 수업을 한 번에 추가할 수 있어요.",
    ctaLabel: "수업 등록하기",
    href: "/classes-manage/create",
    icon: "add_circle",
  },
  parent: {
    eyebrow: "PREMIUM",
    title: "프리미엄 혜택으로\n전문 코칭을 받아보세요",
    description: "자녀 맞춤 리포트를 받아볼 수 있어요.",
    ctaLabel: "자세히 보기",
    href: "/credits",
    icon: "workspace_premium",
  },
  teen: {
    eyebrow: "LEVEL UP",
    title: "매일 출석하고\n뱃지를 모아보세요",
    description: "연속 출석 7일 달성 시 특별 뱃지를 받아요.",
    ctaLabel: "출석 확인하기",
    href: "/attendance-history",
    icon: "military_tech",
  },
  child: {
    eyebrow: "보물 찾기",
    title: "출석하고 스티커를\n모아볼까요?",
    description: "매일 출석 체크하면 선물을 받을 수 있어요!",
    ctaLabel: "출석하러 가기",
    href: "/attendance",
    icon: "card_giftcard",
  },
};

// ─────────────────────────────────────────────
// 고객지원 — 약관/정책/접근성 공통 항목 (전 역할 노출, 앱 심사 v8 기준)
//   이용약관·개인정보·환불·커뮤니티 규칙은 /terms 통합 페이지의 deep-link(?section=type)로,
//   접근성은 설정 페이지로 연결. 약관 본문은 어드민(AppTerms)에서 수정 시 즉시 반영.
// ─────────────────────────────────────────────
const SUPPORT_POLICY_ITEMS: DrawerSubMenuItem[] = [
  { href: "/terms?section=terms_of_service", icon: "description", label: "이용약관" },
  { href: "/terms?section=privacy_policy", icon: "privacy_tip", label: "개인정보 처리방침" },
  { href: "/terms?section=refund", icon: "currency_exchange", label: "환불 규정" },
  { href: "/terms?section=community_guideline", icon: "forum", label: "커뮤니티 운영 규칙" },
  { href: "/settings/accessibility", icon: "accessibility_new", label: "접근성" },
];

// ─────────────────────────────────────────────
// 역할별 메인/서브 메뉴 정의
// ─────────────────────────────────────────────
const ROLE_MENUS: Record<UserRole, MainMenuItem[]> = {
  admin: [
    {
      id: "member",
      icon: "group",
      label: "회원 관리",
      subItems: [
        { href: "/members", icon: "person_search", label: "전체 회원" },
        { href: "/members-create", icon: "person_add", label: "회원 등록" },
        { href: "/members", icon: "credit_card", label: "결제권 관리" },
      ],
    },
    {
      id: "class",
      icon: "sports_hockey",
      label: "수업 운영",
      subItems: [
        {
          href: "/admin-schedules",
          icon: "calendar_today",
          label: "스케줄 관리",
        },
        { href: "/coach-manage", icon: "sports", label: "코치 관리" },
        { href: "/venue-manage", icon: "location_on", label: "구장 관리" },
        { href: "/inventory", icon: "inventory", label: "재고 관리" },
      ],
    },
    {
      id: "payment",
      icon: "payments",
      label: "결제 / 정산",
      subItems: [
        { href: "/payments-manage", icon: "receipt_long", label: "결제 내역" },
        { href: "/settlements", icon: "account_balance", label: "정산 관리" },
      ],
    },
    {
      id: "tournament",
      icon: "emoji_events",
      label: "대회 / 매치",
      subItems: [
        { href: "/tournament-manage", icon: "trophy", label: "대회 관리" },
        { href: "/match-manage", icon: "sports_hockey", label: "매치 관리" },
      ],
    },
    {
      id: "content",
      icon: "campaign",
      label: "콘텐츠",
      subItems: [
        {
          href: "/notices-manage",
          icon: "notifications",
          label: "공지사항 관리",
          badge: true,
        },
        { href: "/popups", icon: "web", label: "팝업 관리" },
      ],
    },
    {
      id: "support",
      icon: "help_outline",
      label: "고객지원",
      subItems: [...SUPPORT_POLICY_ITEMS],
    },
  ],

  director: [
    {
      id: "team",
      icon: "groups",
      label: "팀 관리",
      subItems: [
        { href: "/director-members", icon: "person_search", label: "선수관리" },
        { href: "/director-coaches", icon: "sports", label: "코치관리" },
        { href: "/team", icon: "group", label: "그룹관리" },
      ],
    },
    {
      id: "competition",
      icon: "emoji_events",
      label: "경기 운영",
      subItems: [
        { href: "/tournaments", icon: "trophy", label: "대회관리" },
        { href: "/matches/list", icon: "sports_hockey", label: "매치관리" },
        { href: "/leagues", icon: "stadium", label: "리그" },
        { href: "/director-overseas-trips", icon: "flight_takeoff", label: "해외원정 관리" },
      ],
    },
    {
      id: "payment",
      icon: "payments",
      label: "결제 / 수업권",
      subItems: [
        { href: "/director-payments", icon: "receipt_long", label: "결제관리" },
        { href: "/director-credits", icon: "account_balance_wallet", label: "결제권 관리" },
      ],
    },
    {
      id: "operate",
      icon: "campaign",
      label: "운영",
      subItems: [
        { href: "/statistics", icon: "bar_chart", label: "통계" },
        { href: "/director-notices", icon: "notifications_active", label: "공지관리", badge: true },
      ],
    },
    {
      id: "support",
      icon: "help_outline",
      label: "고객지원",
      subItems: [...SUPPORT_POLICY_ITEMS],
    },
  ],

  coach: [
    {
      id: "class",
      icon: "sports_hockey",
      label: "수업 관리",
      subItems: [
        { href: "/classes-manage", icon: "view_list", label: "수업 목록" },
        {
          href: "/classes-manage/create",
          icon: "add_circle",
          label: "수업 등록",
        },
        {
          href: "/classes-organize",
          icon: "edit_calendar",
          label: "수업 구성",
        },
        {
          href: "/coach-schedules",
          icon: "calendar_today",
          label: "수업 일정",
        },
      ],
    },
    {
      id: "member",
      icon: "group",
      label: "회원 관리",
      subItems: [
        { href: "/coach-members", icon: "person_search", label: "수강생 목록" },
        { href: "/director-approvals", icon: "how_to_reg", label: "수강 신청 승인" },
      ],
    },
    {
      id: "attendance",
      icon: "fact_check",
      label: "출석 관리",
      subItems: [
        // 2026-05-12: /attendance-manage 는 ?classId 가 필수이므로 수업 목록 경유.
        { href: "/classes-manage", icon: "checklist", label: "출석 현황" },
      ],
    },
    {
      id: "myinfo",
      icon: "person",
      label: "내 정보",
      subItems: [
        {
          href: "/profile/edit",
          icon: "manage_accounts",
          label: "프로필 수정",
        },
        { href: "/coaches", icon: "badge", label: "코치 소개 페이지" },
      ],
    },
    {
      id: "support",
      icon: "help_outline",
      label: "고객지원",
      subItems: [
        { href: "/director-notices", icon: "notifications_active", label: "공지사항 관리", badge: true },
        { href: "/messages", icon: "headset_mic", label: "상담하기" },
        { href: "/list", icon: "campaign", label: "공지사항", badge: true },
        ...SUPPORT_POLICY_ITEMS,
      ],
    },
  ],

  parent: [
    {
      id: "child",
      icon: "child_care",
      label: "선수 관리",
      // 2026-05-16: 자녀 등록 기능 제거 — 자녀 목록만 유지
      subItems: [
        { href: "/children", icon: "face", label: "선수 목록" },
      ],
    },
    {
      id: "team",
      icon: "groups",
      label: "팀",
      subItems: [{ href: "/team", icon: "groups", label: "팀 목록" }],
    },
    {
      id: "class",
      icon: "sports_hockey",
      label: "수업",
      // [W3.B 2026-05-18 / Task #5] 출석 내역 항목 추가 — 이전: parent.class 그룹에서 누락되어
      //   사용자가 출석 내역으로 진입할 수 없었음. PATHS.parent.attendanceHistory (`/attendance-history`)
      //   사용 → (attendance)/attendance-history/page.tsx 매핑. app-menu-spec.ts (SoT) §260 의
      //   "출석 내역" 항목과 정합 ([수정 2026-05-18] /attendance 단순 경로 회귀 차단).
      subItems: [
        { href: "/classes", icon: "view_list", label: "수업 목록" },
        { href: "/calendar", icon: "calendar_today", label: "수업 달력" },
        { href: PATHS.parent.attendanceHistory, icon: "event_available", label: "출석 내역" },
        { href: PATHS.parent.rsvp, icon: "fact_check", label: "RSVP 응답" },
      ],
    },
    {
      id: "payment",
      icon: "payments",
      label: "결제 / 결제권",
      subItems: [
        { href: PATHS.parent.payments, icon: "credit_card", label: "결제권 현황" },
        { href: "/payment/history", icon: "receipt_long", label: "결제 내역" },
      ],
    },
    {
      id: "report",
      icon: "assessment",
      label: "리포트",
      subItems: [
        { href: "/report", icon: "bar_chart", label: "성장 리포트" },
        { href: "/skill-report", icon: "radar", label: "기술 리포트" },
        { href: "/review", icon: "star_rate", label: "코치 리뷰" },
      ],
    },
    {
      id: "support",
      icon: "help_outline",
      label: "고객지원",
      subItems: [
        { href: "/messages", icon: "headset_mic", label: "상담하기" },
        { href: "/list", icon: "campaign", label: "공지사항", badge: true },
        { href: "/faq", icon: "quiz", label: "자주 묻는 질문" },
        ...SUPPORT_POLICY_ITEMS,
      ],
    },
  ],

  teen: [
    {
      id: "class",
      icon: "sports_hockey",
      label: "내 수업",
      subItems: [
        { href: "/schedule", icon: "calendar_today", label: "수업 일정" },
        {
          href: "/attendance-history",
          icon: "event_available",
          label: "출석 현황",
        },
      ],
    },
    {
      id: "reward",
      icon: "emoji_events",
      label: "게임 / 보상",
      subItems: [
        { href: "/badges", icon: "military_tech", label: "뱃지 컬렉션" },
        { href: "/stickers", icon: "stars", label: "스티커" },
        { href: "/ranking", icon: "leaderboard", label: "랭킹" },
        { href: "/gift", icon: "card_giftcard", label: "선물함" },
      ],
    },
    {
      id: "community",
      icon: "people",
      label: "커뮤니티",
      subItems: [
        { href: "/photos", icon: "photo_library", label: "포토 갤러리" },
        { href: "/matches/list", icon: "sports_hockey", label: "매치 신청" },
        { href: "/list", icon: "campaign", label: "공지사항", badge: true },
      ],
    },
    {
      id: "support",
      icon: "help_outline",
      label: "고객지원",
      subItems: [
        { href: "/messages", icon: "headset_mic", label: "상담하기" },
        { href: "/faq", icon: "quiz", label: "자주 묻는 질문" },
        ...SUPPORT_POLICY_ITEMS,
      ],
    },
  ],

  child: [
    {
      id: "class",
      icon: "sports_hockey",
      label: "내 수업",
      subItems: [
        { href: "/schedule", icon: "calendar_today", label: "수업 일정" },
        { href: "/checklist", icon: "checklist", label: "준비물 체크" },
      ],
    },
    {
      id: "treasure",
      icon: "auto_awesome",
      label: "나의 보물",
      subItems: [
        { href: "/badges", icon: "military_tech", label: "뱃지" },
        { href: "/stickers", icon: "stars", label: "스티커" },
        { href: "/gift", icon: "card_giftcard", label: "선물함" },
      ],
    },
    {
      id: "support",
      icon: "help_outline",
      label: "도움말",
      subItems: [
        { href: "/faq", icon: "quiz", label: "자주 묻는 질문" },
        ...SUPPORT_POLICY_ITEMS,
      ],
    },
  ],
};

// ─────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────
export default function DrawerMenuPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  // drawer 라우트 진입 = 전체메뉴 열림
  // StatusBar + AppBar 표시 (이전: 풀스크린이었으나 사용자 요청으로 변경)
  // BottomNav 는 메뉴 화면 특성상 숨김 유지
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '메뉴',
    showBottomNav: false,
    showBackButton: false,
    showMenuButton: false,
  });

  const { back: goBack, replace } = useNavigation();
  const { logout, user: authUser } = useSessionAuth();
  // v17 anti-flicker (SPEC §2.3): 초기 isVisible=false 후 useEffect 토글 패턴 → 초기 true.
  //   enter 애니메이션은 CSS animate-fade-in (백드롭) + animate-slide-up 변형 자동 발화.
  //   exit 시점에만 false 로 전환 (setTimeout 은 unmount 전 transition 완료 대기 — 정당한 케이스).
  const [isVisible, setIsVisible] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const role = (authUser?.userType ?? "parent") as UserRole;

  const menuItems = ROLE_MENUS[role] ?? ROLE_MENUS.parent;
  const stats = ROLE_STATS[role] ?? ROLE_STATS.parent;
  const promo = ROLE_PROMO[role] ?? ROLE_PROMO.parent;
  const roleLabel = ROLE_LABEL[role] ?? ROLE_LABEL.parent;

  const filteredMenus =
    selectedCategory === "all"
      ? menuItems
      : menuItems.filter((m) => m.id === selectedCategory);

  // 최초 진입 시 모든 섹션 펼침
  useEffect(() => {
    setExpandedIds(new Set(menuItems.map((m) => m.id)));
  }, [menuItems]);

  // v17 anti-flicker: setIsVisible(true) 토글 제거 — 초기 state 가 이미 true (CSS 자동 발화).
  //   body 스크롤 잠금만 mount 시 1회 적용.
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => goBack({ showSpinner: false }), 300);
  }, [goBack]);

  // 메뉴/프로모 클릭은 닫기(handleClose)와 달리 goBack 을 하면 안 된다.
  // NavLink 의 자체 push 를 preventDefault 로 차단하고 replace 로 /drawer 를 목적지로 치환 —
  // push + 300ms goBack 경쟁(느린 네비 시 진입 전 페이지로 튕김)을 제거한다.
  const handleMenuNavigate = useCallback(
    (href: string, e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      setIsVisible(false);
      replace(href, { showSpinner: true });
    },
    [replace],
  );

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleClose]);

  // [추가 2026-05-16] Swipe-to-close — 좌측 drawer 를 좌→우 swipe 100px 이상으로 닫는다.
  //   touchstart 좌표 기록 → touchmove 좌표 갱신 → touchend 시 deltaX >= 100 이면 close.
  //   deltaY > deltaX*1.5 (세로 스크롤) 인 경우 무시 — 메뉴 스크롤과 충돌 방지.
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const SWIPE_CLOSE_THRESHOLD = 100; // px

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = Math.abs(t.clientY - touchStartRef.current.y);
    // 세로 우세 제스처 → 무시
    if (dy > Math.abs(dx) * 1.5) return;
    // 좌→우 방향만 추적 (drawer 가 우측으로 끌리는 효과는 부자연 — 좌→우 닫기 시 패널이 함께 이동하는 UX 대신
    //  단순 임계 감지로 끝낸다. 시각 피드백은 backdrop opacity 로 자연스럽게 표현)
    if (dx > 0) {
      setDragOffset(Math.min(dx, 200));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartRef.current) return;
    const shouldClose = dragOffset >= SWIPE_CLOSE_THRESHOLD;
    touchStartRef.current = null;
    setDragOffset(0);
    if (shouldClose) handleClose();
  }, [dragOffset, handleClose]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await new Promise((r) => setTimeout(r, 500));
    handleClose();
    setTimeout(async () => {
      await logout();
    }, 300);
  };

  const toggleGroup = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const displayName = authUser?.name ?? "사용자";
  const displayEmail = authUser?.email ?? "";

  return (
    // 풀스크린 컨테이너 — Status Bar / Bottom Safe Area 영역까지 backdrop 으로 채워야 하므로
    // body 의 환경 인셋(env(safe-area-inset-*))과 무관하게 z-[9999] 로 viewport 전체를 덮는다.
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop — drawer 가 좁은 사이드 패널이라 우측 빈 영역까지 어둡게 칠해 화면 전체를 덮는다.
          touch-manipulation: 안드로이드 WebView 의 300ms 탭 지연 제거
          v17 anti-flicker: enter = animate-fade-in (CSS-only mount 자동), exit = state-driven opacity */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 touch-manipulation transition-opacity duration-300 motion-reduce:transition-none",
          "animate-fade-in motion-reduce:animate-none",
          isVisible ? "opacity-100" : "opacity-0",
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer panel — swipe-to-close (좌→우, 100px+) */}
      <div
        className={cn(
          "absolute top-0 left-0 h-full w-[92%] max-w-[400px]",
          "bg-wbg dark:bg-rink-900 flex flex-col",
          "shadow-xl",
          "transform transition-transform duration-300 ease-out motion-reduce:transition-none",
          isVisible ? "translate-x-0" : "-translate-x-full",
          // 드래그 진행률에 비례한 미세 시각 피드백 (transition 우회 시 abrupt 방지)
          dragOffset > 0 && "transition-none",
        )}
        style={dragOffset > 0 ? { transform: `translateX(${dragOffset * 0.3}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label="전체 메뉴"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* ───────────── Top nav ───────────── */}
        <header className="sticky top-0 z-10 bg-white dark:bg-rink-900 border-b border-wline-2 dark:border-rink-800 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center w-10 h-10 rounded-w-pill text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none"
              aria-label="메뉴 닫기"
            >
              <Icon name="close" className="text-[22px]" aria-hidden="true" />
            </button>
            <h1 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
              전체 메뉴
            </h1>
            <NavLink
              href="/settings"
              onClick={handleClose}
              className="inline-flex items-center justify-center w-10 h-10 rounded-w-pill text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none"
              aria-label="설정 열기"
            >
              <Icon
                name="settings"
                className="text-[22px]"
                aria-hidden="true"
              />
            </NavLink>
          </div>
        </header>

        {/* ───────────── Scrollable content ───────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Profile */}
          <section className="bg-white dark:bg-rink-900 px-5 py-5 flex items-center justify-between gap-3 border-b border-wline-2 dark:border-rink-800">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative w-14 h-14 rounded-w-pill bg-wline-2 dark:bg-rink-700 overflow-hidden flex items-center justify-center shrink-0">
                {resolveImageSrc(authUser?.avatarUrl) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveImageSrc(authUser?.avatarUrl)}
                    alt={`${displayName} 프로필 이미지`}
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Icon
                    name="person"
                    className="text-[30px] text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-card-title font-bold text-wtext-1 dark:text-white truncate">
                    {displayName}님
                  </h2>
                  <span className="inline-flex items-center text-card-meta font-bold bg-ice-500 text-white px-1.5 py-0.5 rounded tracking-[0.1em]">
                    {roleLabel}
                  </span>
                </div>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 mt-0.5 truncate">
                  {displayEmail || "아이디 미등록"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={cn(
                "shrink-0 text-card-meta font-semibold px-3 py-1.5 border rounded-lg transition-colors motion-reduce:transition-none",
                isLoggingOut
                  ? "text-wtext-3 dark:text-rink-300 border-wline dark:border-rink-700 cursor-not-allowed"
                  : "text-wtext-2 dark:text-rink-100 border-wline dark:border-rink-700 hover:text-rose-600 hover:border-rose-300 dark:hover:text-rose-400 dark:hover:border-rose-700",
              )}
            >
              {isLoggingOut
                ? "로그아웃 중"
                : MESSAGES.common.logoutConfirmButton}
            </button>
          </section>

          {/* Category chips */}
          <nav
            className="bg-white dark:bg-rink-900 px-5 py-3 border-b border-wline-2 dark:border-rink-800 overflow-x-auto hide-scrollbar"
            aria-label="카테고리 필터"
            style={{ scrollbarWidth: "none" }}
          >
            <ul className="flex gap-2 flex-nowrap min-w-max whitespace-nowrap">
              <li>
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={cn(
                    "px-4 py-2 rounded-w-pill text-card-meta font-semibold transition-colors motion-reduce:transition-none",
                    selectedCategory === "all"
                      ? "bg-ice-500 text-white"
                      : "bg-wline-2 dark:bg-rink-800 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-700",
                  )}
                  aria-pressed={selectedCategory === "all"}
                >
                  전체
                </button>
              </li>
              {menuItems.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(m.id)}
                    className={cn(
                      "px-4 py-2 rounded-w-pill text-card-meta font-semibold transition-colors motion-reduce:transition-none",
                      selectedCategory === m.id
                        ? "bg-ice-500 text-white"
                        : "bg-wline-2 dark:bg-rink-800 text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-700",
                    )}
                    aria-pressed={selectedCategory === m.id}
                  >
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Content */}
          <div className="px-4 py-4 space-y-4">
            {/* Stats bento — 전체 탭에서만 표시 */}
            {selectedCategory === "all" && <DrawerStatsBento items={stats} />}

            {/* Menu sections */}
            {filteredMenus.map((item) => (
              <DrawerMenuSection
                key={item.id}
                id={item.id}
                icon={item.icon}
                title={item.label}
                subItems={item.subItems}
                isOpen={expandedIds.has(item.id)}
                onToggle={toggleGroup}
                onNavigate={handleMenuNavigate}
              />
            ))}

            {/* Promo — 전체 탭에서만 표시 */}
            {selectedCategory === "all" && (
              <DrawerPromoCard
                eyebrow={promo.eyebrow}
                title={promo.title}
                description={promo.description}
                ctaLabel={promo.ctaLabel}
                href={promo.href}
                icon={promo.icon}
                onNavigate={handleMenuNavigate}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-white dark:bg-rink-900 border-t border-wline-2 dark:border-rink-800 px-5 py-3 text-center">
          <p className="text-card-meta font-medium text-wtext-3 dark:text-rink-300 tracking-wider">
            TEAMPLUS · v1.2.0
          </p>
        </footer>
      </div>
    </div>
  );
}
