"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { memo, useCallback, useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/hooks/useNavigation";
import { cn } from "@/lib/utils";

/**
 * BottomNav Component — Shinhan pLay 스타일 (v6.0, 2026-04-29)
 *
 * 디자인 출처: `claude-design/_ _ _offline_.html` (신한플레이 wallet 화면)
 * 핵심 변경:
 *  - FAB(돌출 플로팅 버튼) 제거 → 평면형 5-탭 레이아웃
 *  - 활성: filled 아이콘 + slate-900(#1F2536) 색 + font-bold
 *  - 비활성: outline 아이콘 + slate-400(#A0A8B5) 색 + font-medium
 *  - 상단 드래그 핸들(36×4 pill) 추가 → "시트가 올라온" 인지 강화
 *  - 솔리드 흰 배경 + 1px 상단 보더 (그림자 X, 블러 X — DESIGN.md §2-1 준수)
 */

interface NavItem {
  href: string;
  icon: string;
  label: string;
  matchPaths?: string[];
}

interface BottomNavProps {
  items: NavItem[];
  /** @deprecated v6.0 — FAB 제거됨. backward-compat 만 유지 (무시됨) */
  showHomeFab?: boolean;
  homeHref?: string;
  /** @deprecated v6.0 — variant 'fab' 제거됨 */
  variant?: "default" | "fab";
  /** @deprecated v6.0 — FAB 제거. legacy 호출자 대응용 */
  showFab?: boolean;
  /** @deprecated v6.0 — FAB 제거. 활성 탭 더블탭 시 fallback 으로만 동작 */
  onFabClick?: () => void;
}

function normalizeNavPath(path: string | null | undefined): string {
  if (!path) return "";

  try {
    const parsed = new URL(path, "http://teamplus.local");
    return parsed.pathname.replace(/\/$/, "") || "/";
  } catch {
    return path.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  }
}

export function BottomNav({
  items,
  homeHref = "/parent",
  onFabClick,
}: BottomNavProps) {
  const pathname = usePathname();
  // 풀스크린 로더 + 인증 가드 + 쿠키 정리 일괄 처리 — `useNavigation` SoT.
  // (구) `useRouter().replace` 직접 호출 + `suppressNextLoad()` 로 로더를 의도적으로 차단했으나,
  // 사용자 요청(2026-05-07)으로 BottomNav 탭 클릭 시에도 풀스크린 로더(LoadingPuck)가 표시되도록 전환.
  const { replace } = useNavigation();
  // router.prefetch 직접 사용 — Next.js 15 App Router 의 RSC payload 사전 로드.
  // BottomNav 의 5개 탭 href 를 마운트 직후 prefetch 하여 dev/prod 모두 첫 클릭에서
  // RSC fetch 대기 없이 즉시 transition commit 되도록 한다.
  const router = useRouter();

  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);

  const clearPendingNavigation = useCallback(() => {
    pendingHrefRef.current = null;
    setPendingHref(null);
    setIsTransitioning(false);
  }, []);

  useEffect(() => {
    pendingHrefRef.current = pendingHref;
  }, [pendingHref]);

  useEffect(() => {
    if (!pendingHref) return;
    if (normalizeNavPath(pathname) === normalizeNavPath(pendingHref)) {
      clearPendingNavigation();
    }
  }, [pathname, pendingHref, clearPendingNavigation]);

  // ─── 시각 상태 leak 방어 (v6, 2026-05-09) ─────────────────────────────────
  // pendingHref/isTransitioning 가 어떤 이유로 pathname 변경 없이 leak 되는 상황
  // (가드 차단, 동일 경로 클릭 후 navigate skip 등) 에서 8초 후 자동 정리.
  // 이전 v5(2026-05-09) 의 FORCE_NAV_TIMEOUT(2500ms) + window.location.replace
  // hard navigation 은 dev mode 의 정상 RSC transition (1.5~3초) 도중에 발동되어
  // navigation 을 hard nav 로 강제 종료시키며 ① NEXT_REDIRECT 콘솔 throw,
  // ② LoadingContext 가 조기 OFF 한 풀스크린 로더 사이로 이전 화면 노출,
  // ③ 2.5s 후 hard nav 로 인한 페이지 리로드 — 3가지 증상 동시 유발.
  // SPA navigation transition 흐름은 useNavigation/LoadingContext 가 SoT 로
  // 책임지며, 진짜 stuck 케이스는 LoadingContext 의 startLoadingFailsafeRef(5초)
  // 가 로더만 정리하므로 BottomNav 는 시각 상태 leak 정리만 담당한다.
  useEffect(() => {
    if (!isTransitioning || !pendingHref) return;
    const id = setTimeout(clearPendingNavigation, 8000);
    return () => clearTimeout(id);
  }, [isTransitioning, pendingHref, clearPendingNavigation]);

  // 마운트 직후 / 탭 항목 변경 시 5개 href 를 백그라운드 prefetch.
  // dev mode 첫 진입 시 chunk compile + RSC fetch 가 1~3초 걸려 router.replace 가
  // commit 지연되는 문제를 완화. prefetch 는 idempotent 하므로 race 안전.
  useEffect(() => {
    if (typeof window === "undefined") return;
    items.forEach((item) => {
      try {
        router.prefetch(item.href);
      } catch {
        // Next.js 15 router.prefetch 는 일부 환경에서 throw 할 수 있음 — 무시
      }
    });
  }, [items, router]);

  const handleNavigate = useCallback(
    (href: string, isAlreadyActive: boolean) => {
      // [추가 2026-05-12] dev 환경에서 "엉뚱한 경로로 이동" 진단용 1줄 로그.
      //  prod 빌드에서는 NODE_ENV !== 'development' 이므로 출력 안 됨.
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.log(
          "[BottomNav] click →",
          href,
          "(isAlreadyActive:",
          isAlreadyActive,
          ")",
        );
      }

      if (isAlreadyActive && onFabClick) {
        onFabClick();
        return;
      }
      // 동일 경로 가드 — useNavigation.performRoute 도 동일 가드(line 182-185)지만,
      // pendingHref/isTransitioning 시각 효과를 미리 차단하여 즉시 OFF.
      if (isAlreadyActive) return;

      // ─── "2번 눌러야 이동" 핵심 fix (2026-05-09) ──────────────────────────
      // navigation 을 *먼저* dispatch 하고 visual state 는 그 다음. React 19 batch
      // 내에서 setState 발생이 진행 중인 router.replace transition 을 cancel 하지
      // 않도록 transition 시작이 setState batch 보다 앞서 commit 되게 한다.
      void replace(href).catch(() => {
        if (pendingHrefRef.current === href) {
          clearPendingNavigation();
        }
      });
      pendingHrefRef.current = href;
      setPendingHref(href);
      setIsTransitioning(true);
    },
    [onFabClick, replace, clearPendingNavigation],
  );

  const normalizedPath = normalizeNavPath(pathname);

  const isActiveItem = useCallback(
    (item: NavItem): boolean => {
      const effectivePath = pendingHref
        ? normalizeNavPath(pendingHref)
        : normalizedPath;
      if (!effectivePath) return false;
      const normalizedHref = normalizeNavPath(item.href);
      if (item.icon === "home" || item.href === homeHref)
        return effectivePath === normalizedHref;
      // [수정 2026-05-15] matchPaths 매칭을 경로 경계 기준으로 엄격화.
      //   기존 startsWith(p) 는 `/academy` 가 `/academy-classes` 까지 잡아서
      //   "수업"·"오픈클래스" 탭이 동시에 active 되던 버그. 정확히 같거나 `/` 하위만 매칭.
      if (item.matchPaths) {
        return item.matchPaths.some((p) => {
          const np = normalizeNavPath(p);
          return effectivePath === np || effectivePath.startsWith(np + "/");
        });
      }
      return (
        effectivePath === normalizedHref ||
        effectivePath.startsWith(normalizedHref + "/")
      );
    },
    [normalizedPath, homeHref, pendingHref],
  );

  return (
    <nav
      data-bottom-nav
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        paddingLeft:
          "var(--safe-area-inset-left, env(safe-area-inset-left, 0px))",
        paddingRight:
          "var(--safe-area-inset-right, env(safe-area-inset-right, 0px))",
      }}
      role="navigation"
      aria-label="메인 네비게이션"
    >
      <div
        className="mx-auto"
        style={{ width: "min(100%, var(--mobile-shell-width, 448px))" }}
      >
        {/* ── 바 컨테이너 ─────────────────────────────────────
            · 솔리드 흰 배경 + 1px 상단 보더 (라운드 없음 — 평면 디자인)
            · gradient/backdrop-blur/colored shadow 금지 준수 (DESIGN.md §2-1) */}
        <div className="bg-white dark:bg-rink-800 border-t border-wline-2 dark:border-rink-700">
          {/* 탭 그리드 — 5-탭 균등 배치, 컴팩트 높이 */}
          <div className="flex items-stretch px-2 pt-1.5 pb-1">
            {items.map((item, index) => (
              <TabButton
                key={`nav-${index}-${item.icon}`}
                item={item}
                isActive={isActiveItem(item)}
                onNavigate={handleNavigate}
              />
            ))}
          </div>

          {/* Safe area — iOS 홈 인디케이터 + Android navigation/gesture bar
              · 우선순위: --safe-area-inset-bottom (Native Bridge 주입) > env() (브라우저 폴백)
              · Android WebView 에서 env() 가 0px 로 평가되는 문제 해결 (2026-05-08 v2) */}
          <div
            className="bg-white dark:bg-rink-800"
            style={{
              height:
                "var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))",
            }}
          />
        </div>
      </div>
    </nav>
  );
}

// ── 탭 버튼 ──────────────────────────────────────────────
// 색상 농도 — AppBar 와 동기 (PageAppBar `text-wtext-1 dark:text-white`)
// · 활성: 아웃라인 + 굵은 stroke(weight 700) + TEAMPLUS 브랜드 블루 (#1E3FAE) + font-bold
// · 비활성: 아웃라인 + 가는 stroke(weight 400) + slate-900 (#0F172A) + font-medium
//   → AppBar 의 back/menu 아이콘과 정확히 동일한 톤으로 시각적 일관성 확보
// · ※ filled 사용 안 함 — 양쪽 모두 아웃라인 유지

interface TabButtonProps {
  item: NavItem;
  isActive: boolean;
  onNavigate: (href: string, isAlreadyActive: boolean) => void;
}

// 색상 토큰 (참고용 주석 — 실제 적용은 TabButton 내 colorClass 변수)
//   ACTIVE   = #1E3FAE  (TEAMPLUS Primary, DESIGN.md §3)
//   INACTIVE = slate-900 (#0F172A) / dark:white  ← AppBar 와 정확히 동일

const TabButton = memo(function TabButton({
  item,
  isActive,
  onNavigate,
}: TabButtonProps) {
  // 활성: 브랜드 블루(라이트/다크 동일) · 비활성: AppBar 톤(slate-900 / white) 동기
  const colorClass = isActive ? "text-ice-500" : "text-wtext-1 dark:text-white";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onNavigate(item.href, isActive);
      }}
      className={cn(
        "group relative flex flex-1 flex-col items-center justify-center gap-1",
        "min-h-[48px] py-1 px-1",
        "transition-transform duration-150 ease-out",
        "motion-reduce:transition-none",
        "active:scale-[0.94]",
      )}
      aria-current={isActive ? "page" : undefined}
      aria-label={`${item.label} ${isActive ? "(현재 페이지)" : ""}`}
    >
      {/* 아이콘 — 아웃라인 유지(filled=false), weight 만 400→700 전환
          활성 변경 시 scale settle (animate-fab-land) */}
      <span
        key={`icon-${item.icon}-${isActive ? "on" : "off"}`}
        className={cn(
          "flex items-center justify-center transform-gpu",
          "transition-[color,transform] duration-[280ms] ease-ios-spring",
          "motion-reduce:transition-none motion-reduce:animate-none",
          colorClass,
          isActive && "animate-fab-land",
        )}
      >
        <Icon
          name={item.icon}
          filled={false}
          weight={isActive ? 700 : 400}
          size={26}
          className="text-[26px]"
        />
      </span>

      {/* 라벨 — 활성/비활성 색·굵기 동기 전환 */}
      <span
        className={cn(
          "text-[12px] tracking-tight leading-none",
          "transition-[color,font-weight] duration-[280ms] ease-ios-spring",
          "motion-reduce:transition-none",
          colorClass,
          isActive ? "font-bold" : "font-medium",
        )}
      >
        {item.label}
      </span>
    </button>
  );
});

/**
 * Pre-configured navigation items per user role
 * Shinhan pLay 5-탭 레이아웃: [item1] [item2] [홈] [item3] [item4]
 */

export const parentNavItems: NavItem[] = [
  { href: "/classes", icon: "sports_hockey", label: "훈련" },
  { href: "/parent-calendar", icon: "calendar_today", label: "일정" },
  { href: "/parent", icon: "home", label: "홈" },
  { href: "/children", icon: "face", label: "자녀", matchPaths: ["/children"] },
  { href: "/mypage", icon: "person", label: "마이" },
];

export const coachNavItems: NavItem[] = [
  // [수정 2026-04-30] 사용자 요청 — directorNavItems 와 동일 구성 (수업/일정/홈/팀/마이).
  // 권한/메뉴 차등화는 추후 적용. 홈만 /coach 로 분기.
  {
    href: "/classes-manage",
    icon: "sports_hockey",
    label: "훈련",
    matchPaths: ["/classes-manage", "/classes-organize"],
  },
  { href: "/director-schedules", icon: "calendar_today", label: "일정" },
  { href: "/coach", icon: "home", label: "홈" },
  {
    href: "/team",
    icon: "groups",
    label: "팀",
    matchPaths: ["/team", "/coaches"],
  },
  { href: "/mypage", icon: "person", label: "마이" },
];

export const childNavItems: NavItem[] = [
  { href: "/classes", icon: "sports_hockey", label: "수업" },
  // [수정 2026-05-15] 일정 href 를 TEEN 과 동일하게 /calendar 로 통일 — 둘 다 통합 캘린더 사용.
  //  기존 /schedule (자체 구현) 페이지는 deeplink 호환을 위해 보존하지만 BottomNav 진입은 차단.
  { href: "/calendar", icon: "calendar_month", label: "일정" },
  { href: "/child", icon: "home", label: "홈", matchPaths: ["/child"] },
  { href: "/badges", icon: "emoji_events", label: "뱃지" },
  { href: "/mypage", icon: "person", label: "내 정보" },
];

export const adminNavItems: NavItem[] = [
  {
    href: "/members",
    icon: "groups",
    label: "회원",
    matchPaths: ["/members", "/member", "/approval", "/director-approvals"],
  },
  {
    href: "/settlements",
    icon: "account_balance_wallet",
    label: "정산",
    matchPaths: ["/settlements", "/payments-manage"],
  },
  { href: "/admin", icon: "home", label: "홈" },
  { href: "/notifications", icon: "notifications", label: "알림" },
  {
    href: "/notices-manage",
    icon: "campaign",
    label: "공지",
    matchPaths: ["/notices-manage", "/notices"],
  },
];

export const directorNavItems: NavItem[] = [
  // 사용자 요청 (2026-04-29): 수업 / 일정 / 홈 / 팀 / 마이페이지
  {
    href: "/classes-manage",
    icon: "sports_hockey",
    label: "훈련",
    matchPaths: ["/classes-manage", "/classes-organize"],
  },
  { href: "/director-schedules", icon: "calendar_today", label: "일정" },
  { href: "/director", icon: "home", label: "홈" },
  {
    href: "/team",
    icon: "groups",
    label: "팀",
    matchPaths: ["/team", "/coaches"],
  },
  { href: "/mypage", icon: "person", label: "마이" },
];

export const shopNavItems: NavItem[] = [
  {
    href: "/products",
    icon: "category",
    label: "카테고리",
    matchPaths: ["/products"],
  },
  { href: "/search", icon: "search", label: "검색" },
  { href: "/home", icon: "home", label: "홈" },
  { href: "/wishlist", icon: "favorite", label: "찜" },
  {
    href: "/shop-profile",
    icon: "person",
    label: "마이",
    matchPaths: ["/shop-profile", "/orders"],
  },
];

export const academyDirectorNavItems: NavItem[] = [
  // [수정 2026-05-13 P2] 수업 = /academy-classes (이전 /classes-manage 공유 → URL 분리).
  {
    href: "/academy-classes",
    icon: "edit_note",
    label: "훈련",
    matchPaths: ["/academy-classes"],
  },
  {
    href: "/academy-schedules",
    icon: "calendar_today",
    label: "일정",
    matchPaths: ["/academy-schedules"],
  },
  // [수정 2026-05-13 P1] 홈 = /academy-director (이전 /director 공유 → 별도 대시보드 URL 분리).
  { href: "/academy-director", icon: "home", label: "홈" },
  {
    href: "/academy",
    icon: "school",
    label: "오픈클래스",
    matchPaths: ["/academy"],
  },
  { href: "/mypage", icon: "person", label: "마이" },
];

export const teenNavItems: NavItem[] = [
  { href: "/classes", icon: "sports_hockey", label: "수업" },
  { href: "/calendar", icon: "calendar_today", label: "일정" },
  { href: "/teen", icon: "home", label: "홈", matchPaths: ["/teen"] },
  { href: "/ranking", icon: "leaderboard", label: "순위" },
  { href: "/mypage", icon: "person", label: "마이" },
];

export const standardNavItems: NavItem[] = [
  { href: "/classes", icon: "sports_hockey", label: "수업" },
  { href: "/matches", icon: "groups", label: "매치" },
  { href: "/home", icon: "home", label: "홈" },
  { href: "/chat", icon: "chat_bubble", label: "채팅" },
  { href: "/more", icon: "menu", label: "전체" },
];

export const matchNavItems: NavItem[] = [
  { href: "/matches", icon: "sports_hockey", label: "매치" },
  {
    href: "/matches/list",
    icon: "list",
    label: "목록",
    matchPaths: ["/matches/list"],
  },
  { href: "/home", icon: "home", label: "홈" },
  { href: "/profile", icon: "person", label: "프로필" },
  { href: "/more", icon: "more_horiz", label: "더보기" },
];
