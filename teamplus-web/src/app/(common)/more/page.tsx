"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { NavLink, useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from "@/lib/utils";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useAppSettingsContext } from "@/contexts/AppSettingsContext";
import { resolveImageSrc } from "@/lib/image-url";
import { useModal } from "@/components/ui/Modal";
import { MESSAGES } from "@/lib/messages";
import { usePageReady } from '@/hooks/usePageReady';

// Menu item type definition
interface MenuItem {
  href: string;
  icon: string;
  label: string;
  badge?: boolean;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

// User type for profile section
type UserRole = "parent" | "coach" | "admin" | "player";

interface UserProfile {
  name: string;
  role: UserRole;
  roleLabel: string;
  avatarUrl?: string;
  /** 사진 변경 시 cache-bust 용 */
  updatedAt?: string | null;
}

// Role badge styles — ICETIMES flat: it-blue tint (역할 구분 색은 유지하되 it-* 정합)
const roleBadgeStyles: Record<UserRole, string> = {
  parent: "bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-200",
  coach:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  player: "bg-it-blue-50 text-it-blue-600 dark:bg-it-blue-500/15 dark:text-it-blue-200",
};

// Default menu groups
const defaultMenuGroups: MenuGroup[] = [
  {
    title: "내 활동",
    items: [
      { href: "/classes", icon: "receipt_long", label: "수강 내역" },
      {
        href: "/matches/list",
        icon: "assignment_turned_in",
        label: "매치 신청 내역",
      },
      { href: "/photos", icon: "photo_library", label: "포토 갤러리" },
    ],
  },
  {
    title: "서비스",
    items: [
      { href: "/coaches", icon: "badge", label: "코치진 소개" },
      { href: "/venue-list", icon: "stadium", label: "구장 정보" },
      { href: "/notices", icon: "campaign", label: "공지사항", badge: true },
    ],
  },
  {
    title: "고객지원",
    items: [
      { href: "/help", icon: "support_agent", label: "도움말 센터" },
      { href: "/faq", icon: "quiz", label: "자주 묻는 질문" },
      { href: "/feedback", icon: "feedback", label: "피드백 보내기" },
      { href: "/terms", icon: "gavel", label: "약관 및 정책" },
    ],
  },
];

// Default user for demo
const defaultUser: UserProfile = {
  name: "홍길동",
  role: "parent",
  roleLabel: "학부모",
  avatarUrl: undefined,
};

export default function MoreMenuPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { navigate } = useNavigation();
  const { logout, user: authUser } = useSessionAuth();
  const { settings: appSettings } = useAppSettingsContext();
  const { modal } = useModal();
  const [menuGroups] = useState<MenuGroup[]>(defaultMenuGroups);
  const appVersionLabel = appSettings?.appVersion
    ? `${appSettings.appName ?? "팀플러스"} 앱 버전 v${appSettings.appVersion}`
    : "팀플러스 앱";

  // AuthContext에서 사용자 정보 가져오기 (미인증 시 기본값 사용)
  const user: UserProfile = authUser
    ? {
        name: authUser.name,
        role: authUser.userType as UserRole,
        roleLabel:
          authUser.userType === "parent"
            ? "학부모"
            : authUser.userType === "coach"
              ? "코치"
              : authUser.userType === "admin"
                ? "관리자"
                : "선수",
        avatarUrl: authUser.avatarUrl ?? undefined,
        updatedAt: authUser.updatedAt ?? null,
      }
    : defaultUser;

  const handleSettings = () => {
    navigate("/settings");
  };

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const handleLogout = async () => {
    if (isLoggingOut) return;
    const confirmed = await modal.confirm({
      title: MESSAGES.common.logoutConfirmTitle,
      message: MESSAGES.common.logoutConfirmMessage,
      confirmText: MESSAGES.common.logoutConfirmButton,
      cancelText: MESSAGES.common.cancel,
      variant: "danger",
      icon: "logout",
    });
    if (!confirmed) return;
    setIsLoggingOut(true);
    await new Promise((r) => setTimeout(r, 600));
    await logout();
  };

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar
        title="전체 메뉴"
        // [appbar-harness-v4 분류 C→A] rightActions 단독 사용 시 우측 3 액션(시계/종/메뉴)이 모두 사라짐.
        //   extraActions 로 변환하여 ☰ 메뉴는 항상 노출 (PageAppBar v2.3 SoT 정책).
        extraActions={[
          { icon: "settings", onClick: handleSettings, label: "설정" },
        ]}
      />

      {/* Main Content — ICETIMES flat: 회색 캔버스 + full-bleed 흰 섹션 */}
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {/* Profile Section — full-bleed 흰 섹션 */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-6 pt-8 pb-8">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="w-[72px] h-[72px] rounded-w-pill overflow-hidden bg-it-line-strong dark:bg-rink-700 ring-4 ring-it-blue-500/5 dark:ring-it-blue-500/10 shrink-0">
              {(() => {
                const avatarSrc = resolveImageSrc(
                  user.avatarUrl,
                  user.updatedAt,
                );
                return avatarSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={avatarSrc}
                    src={avatarSrc}
                    alt={`${user.name || "사용자"} 프로필`}
                    width={72}
                    height={72}
                    className="w-full h-full object-cover"
                  />
                ) : null;
              })() || (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon
                    name="person"
                    className="text-4xl text-wtext-3 dark:text-rink-300"
                  />
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-card-title font-bold text-wtext-1 dark:text-white tracking-tight">
                  {user.name || "사용자"}님
                </span>
              </div>
              <div>
                <span
                  className={cn(
                    "inline-flex items-center px-2.5 py-0.5 text-card-meta font-bold rounded-w-pill",
                    roleBadgeStyles[user.role],
                  )}
                >
                  {user.roleLabel}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Menu Groups — 그룹별 full-bleed 흰 섹션 + hairline 행 */}
        {menuGroups.map((group) => (
          <section
            key={group.title}
            className="mt-2 bg-it-surface dark:bg-it-blue-950"
          >
            <h3 className="px-6 pt-4 pb-1 text-card-meta font-bold text-it-ink-500 dark:text-rink-300 tracking-wider uppercase">
              {group.title}
            </h3>
            <ul className="divide-y divide-it-line dark:divide-rink-800">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    className="flex items-center justify-between px-6 py-4 group active:bg-it-fill dark:active:bg-rink-800 transition-colors motion-reduce:transition-none"
                  >
                    <div className="flex items-center gap-4">
                      <Icon
                        name={item.icon}
                        className="text-it-blue-500 text-[24px]"
                      />
                      <span className="text-card-title font-semibold text-it-ink-800 dark:text-rink-100">
                        {item.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className="w-2 h-2 rounded-w-pill bg-it-red-500" />
                      )}
                      <Icon
                        name="chevron_right"
                        className="text-it-ink-300 dark:text-rink-500 group-active:translate-x-0.5 transition-transform motion-reduce:transition-none text-[20px]"
                      />
                    </div>
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* Footer - Logout and Version — full-bleed 흰 섹션 */}
        <div className="mt-2 bg-it-surface dark:bg-it-blue-950 px-6 pt-4 pb-30">
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className={cn(
              "flex items-center gap-3 py-4 transition-all motion-reduce:transition-none",
              isLoggingOut
                ? "text-it-ink-500 dark:text-rink-300 cursor-not-allowed"
                : "text-it-red-500 dark:text-it-red-300 active:opacity-60",
            )}
          >
            {isLoggingOut ? (
              <>
                <div className="w-[22px] h-[22px] border-2 border-it-line dark:border-rink-700 border-t-it-ink-500 dark:border-t-slate-400 rounded-w-pill animate-spin motion-reduce:animate-none" />
                <span className="text-card-title font-bold">로그아웃 중...</span>
              </>
            ) : (
              <>
                <Icon name="logout" weight={600} className="text-[22px]" />
                <span className="text-card-title font-bold">로그아웃</span>
              </>
            )}
          </button>
          <p className="mt-4 text-card-meta text-it-ink-500 dark:text-rink-300 font-medium px-1">
            {appVersionLabel}
          </p>
        </div>
      </main>

      {/* Bottom Navigation (더보기 전용) */}
      <MoreBottomNav />
    </MobileContainer>
  );
}

// Bottom Navigation Component for More page
// [2026-05-16] 높이 92px → 80px (safe-area-inset-bottom 충돌 해소).
//   pb-[20px] → pb-[12px], 아이콘/라벨 spacing gap-1.5 → gap-0.5, FAB bottom-[20px] → bottom-[12px].
function MoreBottomNav() {
  return (
    <nav className="absolute bottom-0 left-0 right-0 bg-white dark:bg-rink-900 border-t border-wline-2 dark:border-rink-800 px-2 z-40 h-[80px] pb-[12px]">
      <div className="flex justify-around items-end h-full">
        <NavLink
          href="/classes"
          className="flex flex-col items-center gap-0.5 flex-1 text-wtext-3 hover:text-wtext-2 dark:hover:text-rink-100 transition-all motion-reduce:transition-none active:brightness-95"
        >
          <div className="flex items-center justify-center">
            <Icon
              name="sports_hockey"
              className="text-[26px]"
              aria-hidden="true"
            />
          </div>
          <span className="text-[10px] font-bold tracking-tight">수업</span>
        </NavLink>

        <NavLink
          href="/matches/list"
          className="flex flex-col items-center gap-0.5 flex-1 text-wtext-3 hover:text-wtext-2 dark:hover:text-rink-100 transition-all motion-reduce:transition-none active:brightness-95"
        >
          <div className="flex items-center justify-center">
            <Icon
              name="sports_motorsports"
              className="text-[26px]"
              aria-hidden="true"
            />
          </div>
          <span className="text-[10px] font-bold tracking-tight">매치</span>
        </NavLink>

        {/* Home FAB */}
        <div className="flex-1 flex flex-col items-center justify-end relative h-full">
          <NavLink
            href="/parent"
            className="flex flex-col items-center group absolute bottom-[12px]"
          >
            <div className="bg-ice-500 w-[52px] h-[52px] rounded-w-pill flex items-center justify-center shadow-md border-[4px] border-white dark:border-rink-900 active:brightness-95 transition-transform motion-reduce:transition-none mb-1">
              <Icon
                name="home"
                filled
                weight={600}
                className="text-white text-[26px]"
                aria-hidden="true"
              />
            </div>
            <span className="text-[10px] font-bold tracking-tight text-ice-500">
              홈
            </span>
          </NavLink>
        </div>

        <NavLink
          href="/notifications"
          className="flex flex-col items-center gap-0.5 flex-1 text-wtext-3 hover:text-wtext-2 dark:hover:text-rink-100 transition-all motion-reduce:transition-none active:brightness-95"
        >
          <div className="flex items-center justify-center relative">
            <Icon
              name="notifications"
              className="text-[26px]"
              aria-hidden="true"
            />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-rose-500 rounded-w-pill border-2 border-white dark:border-rink-900" />
          </div>
          <span className="text-[10px] font-bold tracking-tight">알림</span>
        </NavLink>

        <div className="flex flex-col items-center gap-0.5 flex-1 text-ice-500 transition-all motion-reduce:transition-none active:brightness-95">
          <div className="flex items-center justify-center">
            <Icon
              name="more_horiz"
              filled
              weight={700}
              className="text-[26px]"
              aria-hidden="true"
            />
          </div>
          <span className="text-[10px] font-black tracking-tight">더보기</span>
        </div>
      </div>
    </nav>
  );
}
