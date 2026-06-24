"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/components/ui/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { useChildren } from "@/hooks/useChildren";
import { useAppSettingsContext } from "@/contexts/AppSettingsContext";
import { useNoticeUnreadCount } from "@/hooks/useNoticeUnreadCount";
import { useModal } from "@/components/ui/Modal";
import { MESSAGES } from "@/lib/messages";
import { api } from "@/services/api-client";
import { uploadFile } from "@/services/upload.service";
import { ui, type UIConfig } from "@/services/native-bridge";
import { isNativeApp } from "@/lib/environment";
import { getCurrentUIConfig, syncLastAppliedConfig } from "@/hooks/useNativeUI";
import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/image-url";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { type DrawerStatItem, DrawerChildSwitcher } from "@/components/drawer";
import { useRoleSwitch, type ViewAsRole } from "@/hooks/useRoleSwitch";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useAppMenus, type AppMenuTreeNode } from "@/hooks/useAppMenus";
import { resolvePageTitle } from "@/lib/page-titles";
import { useToast } from "@/components/ui/Toast";
import { addRecentMenu } from "@/lib/recent-menu";
import {
  getAppMenuSpec,
  type AppMenuUserType,
  type AppMenuGroupSpec,
} from "@shared/constants/app-menu-spec";
// 사업자 정보 (placeholder + TODO) — 전자상거래법 §10조 / Apple 1.5 Developer Information
import { COMPANY_INFO } from "@/lib/legal/policy-content";

// ─── 역할별 레이블 · 통계 · 프로모션 ─────────────────
const ROLE_LABEL: Record<UserRole, string> = {
  admin: "관리자",
  director: "감독",
  coach: "코치",
  parent: "학부모",
  teen: "청소년",
  child: "어린이",
  // [수정 2026-05-12] director 그룹 분류 정합 — 사이드 메뉴에서도 "감독"으로 통일.
  academy_director: "감독",
};

const ROLE_STATS: Record<UserRole, DrawerStatItem[]> = {
  admin: [
    { icon: "payments", label: "오늘 매출", value: "0원", tone: "primary" },
    { icon: "person_add", label: "승인 대기", value: "0 건", tone: "warning" },
  ],
  director: [
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
  academy_director: [
    { icon: "school", label: "수업", value: "0 회", tone: "primary" },
    { icon: "groups", label: "학생", value: "0 명", tone: "info" },
  ],
};

/**
 * GlobalMenu Component - TEAMPLUS Design System
 *
 * 햄버거 버튼 → 풀스크린 사이드 드로어 (M1 패턴)
 * reference: /claude-design/_ _ _offline_.html § "M1 · 드로어 완전 열림 (풀스크린)"
 * - DB에서 역할별 메뉴 동적 조회 (GET /menus?userType=)
 * - createPortal: MobileContainer overflow-hidden 클리핑 우회
 */

export type UserRole =
  | "parent"
  | "coach"
  | "admin"
  | "director"
  | "child"
  | "teen"
  | "academy_director";

// ─── 내부 렌더링 타입 ─────────────────────────────
interface SubMenuItem {
  href: string;
  icon: string;
  label: string;
  /** 파란 닷 배지 (미확인 여부 등) */
  badge?: boolean;
  /** 수치 배지 (미확인 개수 표시) */
  badgeCount?: number;
}

interface MainMenuItem {
  id: string;
  icon: string;
  label: string;
  subItems: SubMenuItem[];
}

interface GlobalMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

/** 사이드 메뉴 학부모 자녀 항목 — 통계·프로필 표기용 */
interface DrawerChildItem {
  id: string;
  name: string;
  profileEmoji?: string;
  clubName?: string;
  email?: string | null;
  age?: number | null;
}

// ─── 역할별 폴백 메뉴 (API 실패 시 사용) ────────────
// `shared/constants/app-menu-spec.ts` SoT 에서 어댑트한다.
// DB seed 와 spec 이 동기화되어 있으므로 폴백/실서버 응답이 동일한 메뉴 트리를 그린다.
const ROLE_TO_USER_TYPE: Record<UserRole, AppMenuUserType> = {
  admin: "ADMIN",
  director: "DIRECTOR",
  coach: "COACH",
  parent: "PARENT",
  teen: "TEEN",
  child: "CHILD",
  academy_director: "ACADEMY_DIRECTOR",
};

/** [추가 2026-05-13] 전체메뉴에서 숨길 경로 — 결제권(/credits) 단독 페이지는
 *  결제내역(/payment/history)으로 통합되었으므로 노출 제거. */
const HIDDEN_MENU_HREFS = new Set<string>(["/credits"]);

/** [추가 2026-05-16] 전체메뉴에서 숨길 그룹 라벨 — "설정" 그룹은 /mypage 설정 탭으로
 *  진입점이 통합되어 사이드 드로어에서 중복 노출하지 않는다. */
const HIDDEN_MENU_GROUP_LABELS = new Set<string>(["설정"]);

/** [2026-06-17] 메뉴 라벨 표준화 — DB(appMenu)·서버 응답에 남아있는 구 라벨을 최신 문구로 치환.
 *  href 가 '#'(그룹 헤더) 인 항목은 resolvePageTitle 로 못 잡으므로 라벨 기준 override 필요.
 *  (자녀 → 선수 용어 통일 · 사용자 직접 지시) */
const MENU_LABEL_OVERRIDES: Record<string, string> = {
  "자녀 관리": "선수 관리",
  "자녀 목록": "선수 목록",
};
const overrideMenuLabel = (label: string): string =>
  MENU_LABEL_OVERRIDES[label] ?? label;

/** [추가 2026-05-25] 고객지원 그룹에 부착할 약관/정책 항목 (footer 에서 이동 — 사용자 요청).
 *  이용약관·개인정보·환불은 /terms deep-link(?section), 커뮤니티 규칙은 전용 페이지,
 *  접근성은 설정 페이지로 연결. 약관 본문은 어드민(AppTerms)에서 수정 시 즉시 반영. */
const SUPPORT_GROUP_LABEL = "고객지원";
const LEGAL_SUPPORT_ITEMS: SubMenuItem[] = [
  { href: "/terms?section=terms_of_service", icon: "description", label: "이용약관" },
  { href: "/terms?section=privacy_policy", icon: "privacy_tip", label: "개인정보 처리방침" },
  { href: "/terms?section=refund", icon: "payments", label: "환불 규정" },
  { href: "/community-guideline", icon: "forum", label: "커뮤니티 운영 규칙" },
  { href: "/account-deletion", icon: "person_remove", label: "계정·데이터 삭제" },
  { href: "/settings/accessibility", icon: "accessibility_new", label: "접근성" },
];

function specGroupToMenuItem(
  group: AppMenuGroupSpec,
  userType: AppMenuUserType,
  index: number,
): MainMenuItem {
  return {
    id: `spec-${userType}-${index}`,
    icon: group.icon,
    label: overrideMenuLabel(group.label),
    subItems: group.children
      .filter((child) => !HIDDEN_MENU_HREFS.has(child.href))
      .map((child) => ({
        href: child.href,
        icon: child.icon,
        label: resolvePageTitle(child.href) ?? overrideMenuLabel(child.label),
      })),
  };
}

function specToFallbackMenu(role: UserRole): MainMenuItem[] {
  const userType = ROLE_TO_USER_TYPE[role] ?? "PARENT";
  return getAppMenuSpec(userType)
    .filter((group) => !HIDDEN_MENU_GROUP_LABELS.has(group.label))
    .map((group, idx) => specGroupToMenuItem(group, userType, idx));
}

// ─── 서버 응답 → MainMenuItem 변환 ─────────────────
// 메뉴명과 각 페이지 PageAppBar 타이틀을 일치시키기 위해 `resolvePageTitle` 로
// 공식 타이틀 매핑을 우선 적용 (서버 label 은 폴백).
function toMenuItems(apiItems: AppMenuTreeNode[]): MainMenuItem[] {
  return apiItems
    .filter(
      (item) => item.isActive && !HIDDEN_MENU_GROUP_LABELS.has(item.label),
    )
    .map((item) => ({
      id: item.id,
      icon: item.icon,
      label: resolvePageTitle(item.href) ?? overrideMenuLabel(item.label),
      subItems: (item.children ?? [])
        .filter((c) => c.isActive && !HIDDEN_MENU_HREFS.has(c.href))
        .map((c) => ({
          href: c.href,
          icon: c.icon,
          label: resolvePageTitle(c.href) ?? overrideMenuLabel(c.label),
        })),
    }));
}

// ─── M1 Drawer Helpers (claude-design / SeedDesign) ──────────────
// 풀스크린 사이드 드로어 — 신한플레이 패턴 + ice/rink 토큰
// reference: /claude-design/_ _ _offline_.html § "M1 · 드로어 완전 열림 (풀스크린)"

interface DrawerRowM1Props {
  icon: string;
  label: string;
  sub?: string;
  badge?: number | string;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

function DrawerRowM1({
  icon,
  label,
  sub,
  badge,
  danger,
  divider,
  onClick,
}: DrawerRowM1Props) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2 px-6 py-2.5 text-left",
          "transition-colors motion-reduce:transition-none",
          "hover:bg-wbg dark:hover:bg-rink-800/50 active:brightness-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
        )}
      >
        <span
          className={cn(
            "shrink-0 w-5 grid place-items-center",
            danger
              ? "text-rose-600 dark:text-rose-300"
              : "text-wtext-2 dark:text-rink-100",
          )}
        >
          {/* 18×18 아이콘 · 배경 제거 후 빈 정사각형 박스(w-9) 폭을 아이콘 크기(w-5)로 축소 → 라벨과의 시각 간격 축소 */}
          <Icon name={icon} className="text-[18px]" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span
            className={cn(
              "text-card-meta font-semibold tracking-[-0.02em] truncate",
              danger
                ? "text-rose-600 dark:text-rose-400"
                : "text-wtext-1 dark:text-white",
            )}
          >
            {label}
          </span>
          {sub && (
            <span className="text-card-meta text-wtext-4 dark:text-rink-300 tracking-[-0.01em] truncate">
              {sub}
            </span>
          )}
        </span>
        {badge !== undefined && badge !== 0 && (
          <span
            className="shrink-0 px-2 py-[3px] rounded-full text-card-meta font-bold tracking-[-0.01em] text-white"
            style={{ background: "var(--c-ice-500)" }}
          >
            {typeof badge === "number" && badge > 99 ? "99+" : badge}
          </span>
        )}
        {/* ref DrawerRow chevron: 16×16 — text-card-title 로 정확 매칭 (이전 18px → 16px) · 색상 진하게(wtext-4→wtext-2) */}
        <Icon
          name="chevron_right"
          className="shrink-0 text-[16px] text-wtext-2 dark:text-rink-100"
          aria-hidden="true"
        />
      </button>
      {divider && (
        <div className="h-px mx-6 my-1.5 bg-wline-2 dark:bg-rink-700/60" />
      )}
    </>
  );
}

// ─── Role Switcher Section (Drawer 내부용) ─────────────
function RoleSwitcherSection({ onClose }: { onClose: () => void }) {
  const roles = useUserRoles();
  const { currentViewAs, setViewAs, isReady } = useRoleSwitch(
    roles.primaryRole ?? undefined,
  );
  const { toast } = useToast();

  if (!isReady || !roles.hasMultipleRoles) return null;

  const active: ViewAsRole = currentViewAs ?? roles.primaryRole ?? "parent";

  const handleSelect = (role: ViewAsRole) => {
    if (active === role) {
      onClose();
      return;
    }
    setViewAs(role);
    toast.success(
      MESSAGES.role.switchSuccess(
        role === "parent"
          ? MESSAGES.role.parentLabel
          : MESSAGES.role.coachLabel,
      ),
    );
    onClose();
  };

  const buttons: { role: ViewAsRole; label: string; icon: string }[] = [
    {
      role: "parent",
      label: MESSAGES.role.viewAsParent,
      icon: "family_restroom",
    },
    { role: "coach", label: MESSAGES.role.viewAsCoach, icon: "sports" },
  ];

  return (
    <section className="bg-wsurface dark:bg-rink-800 border-b border-wline dark:border-rink-700/60">
      <div className="max-w-2xl mx-auto px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-wtext-2 dark:text-rink-100 tracking-wide">
            {MESSAGES.role.viewAsLabel}
          </h3>
          <span className="text-card-meta text-wtext-3 dark:text-rink-300">
            {MESSAGES.role.switchHint}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {buttons.map(({ role, label, icon }) => {
            const isActive = role === active;
            return (
              <button
                key={role}
                type="button"
                onClick={() => handleSelect(role)}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl text-sm font-semibold border transition-colors motion-reduce:transition-none",
                  isActive
                    ? "bg-ice-500 text-white border-ice-500 shadow-sm"
                    : "bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-rink-100 border-wline dark:border-rink-700 hover:border-ice-500 hover:text-ice-500",
                )}
              >
                <Icon name={icon} className="text-[18px]" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function GlobalMenu({ isOpen, onClose }: GlobalMenuProps) {
  const { user, logout, isAuthenticated, refreshUser } = useAuth();
  const { settings: appSettings } = useAppSettingsContext();
  const { modal } = useModal();
  const { unreadCount: noticeUnreadCount } = useNoticeUnreadCount();
  const appVersionLabel = appSettings?.appVersion
    ? `${appSettings.appName ?? "TEAMPLUS"} v${appSettings.appVersion}`
    : "TEAMPLUS";
  const [childrenList, setChildrenList] = useState<DrawerChildItem[]>([]);
  // 자녀 선택 칩 — 전역 선택 상태(SelectedChildContext) + 선택 대상 자녀 SoT(useChildren.selectableChildren,
  //   무소속 포함·pending/rejected 제외). 후속: childrenList(통계·프로필 부제) ↔ useChildren 통합 여지.
  const { selectableChildren } = useChildren();
  const { selectedChildId, setSelectedChildId } = useSelectedChild();
  // [추가] 아코디언 — single-open 방식. 현재 펼친 그룹 id 1개만 보관(null = 전체 닫힘 / 기본값).
  //  다른 그룹을 열면 기존 그룹은 자동으로 닫혀(max-height transition), 한 번에 하나만 펼쳐진다.
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  // [추가] 아바타 사진 변경 — 숨겨진 파일 input ref + 업로드 진행 상태
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  // [추가 2026-05-15] 본인 소속 팀명 — drawer 사용자 정보 영역에서 이름 아래 표시.
  //   /teams/my/list 가 모든 역할(감독·코치·학부모·학생)의 본인 관련 팀 반환.
  //   ACADEMY_DIRECTOR 는 팀 소속 없음 → 빈 배열로 안 보임.
  const [myTeams, setMyTeams] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<
          | Array<{ id: string; name: string }>
          | { data?: Array<{ id: string; name: string }> }
        >("/teams/my/list");
        if (cancelled) return;
        const list = Array.isArray(res.data)
          ? res.data
          : ((res.data as { data?: Array<{ id: string; name: string }> })
              ?.data ?? []);
        setMyTeams(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setMyTeams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);
  const { toast } = useToast();
  const { navigate } = useNavigation();

  // [수정 2026-05-19 v3] 사용자 직접 지시 — Status Bar / Home Indicator 영역
  //   dim 처리 완전 제거. 이전 `useNativeScrim(isOpen, "#8C141826", { bottom: true,
  //   bottomColor: "#FFFFFFFF" })` 는 상단 status bar 영역에 ARGB `#8C141826`
  //   (55% 불투명 rink-900) scrim 을 덮어 회색 dim 띠를 남겼다.
  //   → useNativeScrim 호출을 완전히 제거하고, 아래 drawerConfig 의
  //     scaffoldBackgroundColor / statusBarColor / navigationBarColor 를
  //     모두 흰색(#FFFFFF) 으로 통일하여 dim 없이 흰색으로만 노출되도록 변경.
  //   (ThemeProvider 가 라이트 모드 단일 강제이므로 다크 분기 불필요)

  // GlobalMenu 는 모든 사용처에서 `dynamic(..., { ssr: false })` 로 임포트되므로
  // 본 컴포넌트가 실행되는 시점에는 항상 `document` 가 존재한다. mounted state
  // (useState + useEffect) 를 두면 첫 렌더(null) ↔ 후속 렌더(JSX) 사이에서
  // 자식 컴포넌트의 sub-hook 시퀀스가 달라져 "Rendered more hooks than during
  // the previous render" 에러가 유발되므로 제거한다.

  // 사용자 역할
  const userRole: UserRole =
    (user?.userType?.toLowerCase() as UserRole) || "parent";

  // 자녀 선택 칩 노출 — PARENT 이고 선택 대상 자녀 2명 이상일 때만. '전체' 칩 없음(단일 자녀 모델).
  const showChildChips = userRole === "parent" && selectableChildren.length >= 2;

  // ── JWT 세션으로 내 메뉴 조회 (모듈 캐시 1h staleTime/2h gcTime, cacheKey: my:${userId}) ──
  const {
    data: serverMenus,
    isLoading: isLoadingMenu,
    isError: isMenuError,
  } = useAppMenus(user?.id);

  // 서버 메뉴 → 내부 MainMenuItem 형식으로 변환.
  //
  // [수정 2026-05-16] 로딩 중 빈 배열 반환 → 4박스 스켈레톤 노출이 "계속 로딩" 처럼
  // 보이는 UX 문제. spec 폴백을 즉시 표시하여 메뉴를 항상 사용 가능한 상태로 만들고,
  // 서버 응답이 도착하면 자연스럽게 교체. (네트워크 지연 / 응답 지연 / 캐시 미스 모두
  // 사용자가 텅 빈 스피너를 보지 않도록 함.)
  const menuItems = useMemo<MainMenuItem[]>(() => {
    if (
      !isLoadingMenu &&
      !isMenuError &&
      serverMenus &&
      serverMenus.length > 0
    ) {
      return toMenuItems(serverMenus);
    }
    return specToFallbackMenu(userRole);
  }, [serverMenus, isLoadingMenu, isMenuError, userRole]);

  // 공지 미확인 카운트만 배지로 주입 — 공통지원 그룹은 spec/DB 에 포함되어 있다.
  const displayMenuItems = useMemo<MainMenuItem[]>(() => {
    if (noticeUnreadCount <= 0) return menuItems;
    return menuItems.map((group) => ({
      ...group,
      subItems: group.subItems.map((sub) =>
        sub.href === "/notices"
          ? { ...sub, badgeCount: noticeUnreadCount }
          : sub,
      ),
    }));
  }, [menuItems, noticeUnreadCount]);

  // [2026-05-25] 약관/정책을 "고객지원" 그룹 하위로 이동 (사용자 요청 — footer 별도 나열 → 그룹 내 항목).
  //   기존 "약관 및 정책"(/terms) 단일 항목은 세분화된 5개(이용약관·개인정보·환불·커뮤니티·접근성)로 대체.
  //   고객지원 그룹이 없으면 안전망으로 새 그룹을 추가한다 (spec/DB 모두 끝에 부착되므로 통상 존재).
  const finalMenuItems = useMemo<MainMenuItem[]>(() => {
    let injected = false;
    const next = displayMenuItems.map((group) => {
      if (group.label !== SUPPORT_GROUP_LABEL) return group;
      injected = true;
      const base = group.subItems.filter(
        (s) => s.href !== "/terms" && !s.href.startsWith("/terms?"),
      );
      return { ...group, subItems: [...base, ...LEGAL_SUPPORT_ITEMS] };
    });
    if (!injected) {
      next.push({
        id: "support-legal",
        icon: "help-circle",
        label: SUPPORT_GROUP_LABEL,
        subItems: [...LEGAL_SUPPORT_ITEMS],
      });
    }
    return next;
  }, [displayMenuItems]);

  // 학부모: 자녀 목록 조회 (id · 이름 · 프로필 이모지 · 팀명)
  useEffect(() => {
    if (!isAuthenticated || userRole !== "parent") return;
    const fetchChildren = async () => {
      try {
        // [수정 2026-05-11] /children 응답은 { success, data, total } 래핑 + 자녀는 firstName/lastName/fullName 보유.
        //  Array.isArray(res.data) 만으로는 false → wrap 분기 + 이름 폴백 체인 필요.
        type ChildItem = {
          id: string;
          firstName?: string;
          lastName?: string;
          fullName?: string;
          name?: string;
          profileEmoji?: string;
          clubName?: string;
          email?: string | null;
          age?: number | null;
          koreanAge?: number | null;
        };
        const res = await api.get<ChildItem[] | { data?: ChildItem[] }>(
          "/children",
        );
        if (!res.success || !res.data) return;
        const list: ChildItem[] = Array.isArray(res.data)
          ? res.data
          : ((res.data as { data?: ChildItem[] }).data ?? []);
        if (list.length > 0) {
          setChildrenList(
            list.map((c) => ({
              id: c.id,
              name:
                c.fullName ??
                c.name ??
                `${c.lastName ?? ""}${c.firstName ?? ""}`.trim(),
              profileEmoji: c.profileEmoji,
              clubName: c.clubName,
              // [추가 2026-05-13] 자녀 정보 표기 — "신학생(10세) / ID"
              email: c.email ?? null,
              age: c.age ?? c.koreanAge ?? null,
            })),
          );
        }
      } catch {
        // 자녀 조회 실패 시 무시
      }
    };
    void fetchChildren();
  }, [isAuthenticated, userRole]);

  // ESC 키 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // 드로어 메뉴 진입 시 StatusBar + AppBar 표시 (BottomNav 만 숨김)
  // 사용자 요구: 햄버거 메뉴를 열어도 상태바·앱바가 보여야 함.
  // 이전: 풀스크린(모두 숨김) → 변경: StatusBar/AppBar 표시 + BottomNav 만 숨김.
  // 닫힐 때는 진입 직전 캡처한 부모 페이지 옵션으로 정확히 복원.
  //
  // 타이밍 동기화: panel slide-out 320ms 와 맞춰 native UI 복원도 동일 지연을 두어,
  // 닫힘 도중 panel 과 native BottomNav 가 겹쳐 보이는 시간을 제거한다.
  const PANEL_CLOSE_MS = 320;
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 페이지 전환을 통해 drawer 가 닫힌 경우, previousConfig 로 복원하면
  // 새 페이지의 useNativeUI 설정을 덮어씌우므로 복원을 스킵해야 함.
  // handleQuickAction (또는 다른 navigate 호출) 후 setTimeout(onClose) 가 호출되면
  // 이 ref 가 true 로 설정되어 cleanup 의 복원 로직을 우회한다.
  const navigatedAwayRef = useRef(false);
  useEffect(() => {
    if (!isOpen || !isNativeApp()) return;

    // 새 사이클 시작: 이전 사이클의 navigate 플래그 초기화
    navigatedAwayRef.current = false;

    // 직전 사이클의 지연 복원이 아직 실행되지 않았다면 취소 (빠른 재오픈 시 깜박임 방지)
    if (restoreTimerRef.current) {
      clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }

    // drawer 진입 직전의 부모 페이지 ui 설정을 캡처 (복원용)
    const previousConfig: UIConfig = getCurrentUIConfig();
    const drawerConfig: UIConfig = {
      showStatusBar: true,
      showAppBar: false, // 네이티브 AppBar 끄고 PageAppBar 공통 컴포넌트로 대체
      showBottomNav: false,
      // [수정 2026-05-19 v3] 사용자 직접 지시 — 전체메뉴 진입 시 상단 status bar /
      //   하단 home indicator 영역 모두 dim 처리 없이 흰색으로 통일.
      //   · scaffoldBackgroundColor : iOS safe-area 상하단 배경 (Scaffold)
      //   · statusBarColor          : Android status bar 배경 (iOS 무시)
      //   · navigationBarColor      : Android 하단 system nav 배경
      //   · statusBarLight=false    : status bar 아이콘 검정 (흰 배경 위에서 가독)
      //   useNativeScrim 호출은 동일 commit 에서 제거되어 어떤 scrim 도 덮이지 않음.
      scaffoldBackgroundColor: "#FFFFFF",
      statusBarColor: "#FFFFFF",
      navigationBarColor: "#FFFFFF",
      statusBarLight: false,
    };

    void ui.setConfig(drawerConfig).then(() => {
      syncLastAppliedConfig(drawerConfig);
    });

    return () => {
      // 320ms 지연 — panel slide-out 애니메이션 종료 시점에 native UI 복원
      // (즉시 복원 시 panel 과 BottomNav 가 겹쳐 보이는 0.3s 시각 결함 제거)
      restoreTimerRef.current = setTimeout(() => {
        // 페이지 전환을 통해 닫힌 경우 새 페이지의 useNativeUI 가 이미 적용됐으므로
        // previousConfig 복원을 스킵 (그렇지 않으면 새 페이지 UI 가 잘못 덮어쓰임).
        if (!navigatedAwayRef.current) {
          // [수정 2026-05-19 v3] drawerConfig 에서 명시 변경한 4개 필드 모두 복원.
          //   미복원 시 drawer 닫은 후에도 흰 status bar/nav bar 가 잔존하여
          //   다른 페이지(예: 다크 톤 헤더)의 시스템 UI 와 충돌함.
          const restoreConfig: UIConfig = {
            ...previousConfig,
            scaffoldBackgroundColor:
              previousConfig.scaffoldBackgroundColor ?? null,
            statusBarColor: previousConfig.statusBarColor ?? null,
            navigationBarColor: previousConfig.navigationBarColor ?? null,
            statusBarLight: previousConfig.statusBarLight ?? true,
          };
          void ui.setConfig(restoreConfig).then(() => {
            syncLastAppliedConfig(restoreConfig);
          });
        } else {
          // 페이지 전환: drawer 가 손댄 4개 필드만 명시적 null 로 리셋하여
          //   새 페이지의 useNativeUI 가 자체 값을 적용할 수 있도록 base 초기화.
          const resetConfig: UIConfig = {
            scaffoldBackgroundColor: null,
            statusBarColor: null,
            navigationBarColor: null,
            statusBarLight: true,
          };
          void ui.setConfig(resetConfig).then(() => {
            syncLastAppliedConfig(resetConfig);
          });
        }
        restoreTimerRef.current = null;
      }, PANEL_CLOSE_MS);
    };
  }, [isOpen]);

  // 스크롤 방지 — iOS Safari 호환 lock
  //
  // iOS Safari 는 `document.body.style.overflow = 'hidden'` 만으로는 rubber-band 스크롤을
  // 차단하지 못한다 (WebKit 표준 이슈). 정석 패턴은 body 를 `position: fixed` 로 고정하고
  // 열기 시점의 스크롤 위치를 `top: -scrollY` 로 보존했다가, 닫힐 때 `window.scrollTo` 로
  // 복원하는 방식이다. Android Chrome / Flutter InAppWebView 에서도 동일하게 안전하다.
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      // 스크롤 복원 — behavior: 'instant' 로 jump (auto 는 브라우저별 차이)
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // 로그아웃 — 로딩 피드백/스피너 제거 (사용자 요청 2026-05-07)
  const handleLogout = useCallback(async () => {
    const confirmed = await modal.confirm({
      title: MESSAGES.common.logoutConfirmTitle,
      message: MESSAGES.common.logoutConfirmMessage,
      confirmText: MESSAGES.common.logoutConfirmButton,
      cancelText: MESSAGES.common.cancel,
      variant: "danger",
      icon: "logout",
    });
    if (!confirmed) return;
    onClose();
    await logout();
  }, [logout, onClose, modal]);

  // ─── 네비게이션 헬퍼 ────────────────────────────
  // 헤더 검색 / 프로필 / 설정 — 단순 라우팅 + drawer close
  // 페이지 전환 시 useEffect cleanup 의 previousConfig 복원을 스킵하기 위해
  // navigatedAwayRef = true 설정 (새 페이지의 useNativeUI 가 덮어쓰는 문제 방지)
  const handleQuickAction = useCallback(
    (path: string) => {
      navigatedAwayRef.current = true;
      navigate(path);
      setTimeout(() => onClose(), 0);
    },
    [navigate, onClose],
  );

  // [추가] 아코디언 그룹 토글 (single-open) — 같은 그룹이면 닫고(null),
  //  다른 그룹이면 그 그룹으로 교체하여 기존에 열린 그룹은 닫히고 새 그룹만 펼쳐진다.
  //  max-height + opacity transition 이 닫힘/열림에 동시에 적용되어 부드럽게 전환된다.
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroup((prev) => (prev === id ? null : id));
  }, []);

  // [추가] 아바타 탭 → 숨겨진 파일 input 트리거 (웹: 파일 선택창 / 네이티브: WebView 파일 피커)
  const handleAvatarPick = useCallback(() => {
    if (isUploadingAvatar) return;
    avatarInputRef.current?.click();
  }, [isUploadingAvatar]);

  // [추가] 파일 선택 → uploadFile(category=AVATAR, 웹/네이티브 자동 분기) →
  //   PUT /users/me/profile { avatarUrl } → refreshUser() 로 useAuth 사용처 전역 즉시 반영.
  const handleAvatarFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // 동일 파일 재선택 허용
      if (!file) return;
      setIsUploadingAvatar(true);
      try {
        const uploaded = await uploadFile(file, { category: "AVATAR" });
        const res = await api.put("/users/me/profile", {
          avatarUrl: uploaded.url,
        });
        if (res.success) {
          toast.success(MESSAGES.upload.success);
          await refreshUser();
        } else {
          toast.error(res.error?.message ?? MESSAGES.save.fail);
        }
      } catch (err) {
        // uploadFile 의 검증 실패(UploadValidationError 등)는 한글 메시지를 담고 있다.
        toast.error(err instanceof Error ? err.message : MESSAGES.save.fail);
      } finally {
        setIsUploadingAvatar(false);
      }
    },
    [refreshUser, toast],
  );

  // Rules of Hooks: early return 으로 JSX 차단 시 자식 컴포넌트의 sub-hook 시퀀스가
  // 첫 렌더(null) ↔ 후속 렌더(JSX)에서 달라져 "Rendered more hooks than during
  // the previous render" 에러 유발. mounted 분기는 createPortal 호출 시점에서만 적용한다.

  const roleLabel = ROLE_LABEL[userRole] ?? ROLE_LABEL.parent;
  const roleStats: DrawerStatItem[] =
    userRole === "director"
      ? [] // 소속 코치 통계 제거
      : userRole === "parent"
        ? [] // 자녀 수 통계 제거 — 자녀 선택 카드가 자녀를 직접 나열하므로 중복.
        : userRole === "coach"
          ? [] // 이번 달 수업/담당 학생 통계 제거
          : userRole === "academy_director"
            ? [] // [2026-06-18] 오픈클래스 감독 '수업 0회 / 학생 0명' 통계 박스 제거 (사용자 직접 지시)
            : (ROLE_STATS[userRole] ?? ROLE_STATS.parent);
  // [수정 2026-05-13] 학부모도 본인(부모) 이름 우선 표시.
  //  · displayName = 본인 이름(예: "신부모")
  //  · displaySub  = 학부모일 때 "자녀: 신학생(2015년생)" 형태, 그 외 역할은 email/연락처
  //  아바타 이니셜은 항상 본인 이름 첫 글자.
  const displayName = user?.name ?? "사용자";
  // 부제는 본인 식별자(이메일/연락처)만 — 학부모 자녀 나열 제거(자녀는 선택 카드가 담당).
  const displaySub =
    user?.email ||
    (user?.phone ? `${roleLabel} · ${user.phone}` : `${roleLabel} 계정`);
  const avatarInitial = (user?.name ?? "나").charAt(0);

  // SSR 보호 — 호출 사이트는 모두 ssr:false 이지만 안전장치로 한 번 더 확인.
  if (typeof document === "undefined") return null;

  // ─── M1 Drawer Helpers (claude-design / SeedDesign) ──────────────
  // 풀스크린 사이드 드로어 — 신한플레이 패턴 + ice/rink 토큰
  // reference: /claude-design/_ _ _offline_.html § "M1 · 드로어 완전 열림 (풀스크린)"

  const stat0 = roleStats[0];
  const stat1 = roleStats[1];

  return createPortal(
    // [수정 2026-05-16 SPEC_POPUP_FULLSCREEN_DIM] viewport 전체 dim 표준 적용.
    //   wrapper z-9990 (overlay-fullscreen-wrapper class) → AppBar(30)·BottomNav(40)·Toast(60) 위.
    //   isOpen=false 일 때 pointer-events-none 으로 잔여 이벤트 차단.
    <div
      className={cn(
        "overlay-fullscreen-wrapper",
        !isOpen && "pointer-events-none",
      )}
      aria-hidden={!isOpen}
    >
      {/* Backdrop — overlay-fullscreen-dim (rink-900/55) + fade-in 애니메이션 유지 */}
      <div
        className={cn(
          "overlay-fullscreen-dim touch-manipulation transition-opacity",
          "ease-ios motion-reduce:transition-none",
          isOpen
            ? "opacity-100 duration-[380ms]"
            : "opacity-0 duration-[300ms] pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel — M1 풀스크린, 우→좌 슬라이드 + 페이드 */}
      <aside
        className={cn(
          "absolute inset-0 h-full w-full",
          "bg-wsurface dark:bg-rink-900 flex flex-col",
          "transform-gpu will-change-[transform,opacity]",
          "transition-[transform,opacity]",
          "touch-pan-y overscroll-contain",
          "motion-reduce:transition-none",
          isOpen
            ? "translate-x-0 opacity-100 duration-[420ms] ease-ios"
            : "translate-x-full opacity-0 duration-[300ms] ease-ios-out pointer-events-none",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="전체 메뉴"
      >
        {/* ── 공통 컴포넌트 PageAppBar (forceNative) — 좌: 뒤로가기(close) ──
            [2026-05-16] 우측 "설정" pill 제거 + 우측 default 액션(타임라인/알림/메뉴) 전부 비활성화.
            드로어 헤더에는 좌측 뒤로가기 + "전체메뉴" 타이틀만 노출 — /mypage 설정 탭으로
            진입점이 통합되어 어떤 우측 액션도 표시하지 않는다. */}
        <PageAppBar
          title="전체메뉴"
          showBack
          onBack={onClose}
          forceNative
          showSearch={false}
          showTimeline={false}
          showMy={false}
          showMenu={false}
          // [정렬 보정] 공통 shell 은 pt-2.5/pb-1 비대칭 → 뒤로가기·타이틀이 아래로 치우침.
          //   GlobalMenu 한정으로 className(도피 해치)에 pb-2.5 를 주어 pt/pb 대칭(10px) → 세로 가운데 정렬.
          className="pb-2.5"
        />

        {/* ── M1 Profile area (padding: 24px 24px 20px) — 우측 끝 로그아웃 ── */}
        <div className="px-6 pt-6 pb-5 flex items-center gap-3.5">
          {/* 아바타 — 탭하면 프로필 사진 변경(업로드). /profile 이동(정보 영역)과 분리하여 중첩 버튼 방지 */}
          <button
            type="button"
            onClick={handleAvatarPick}
            disabled={isUploadingAvatar}
            className="relative shrink-0 rounded-[18px] transition-transform motion-reduce:transition-none active:scale-95 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
            aria-label="프로필 사진 변경"
            aria-busy={isUploadingAvatar}
          >
            <span
              className="relative w-14 h-14 rounded-[18px] overflow-hidden flex items-center justify-center bg-ice-500 text-white text-card-section font-extrabold"
              style={{
                boxShadow: "0 6px 16px rgba(47,95,255,0.28)",
              }}
            >
              {(() => {
                // 프로필 사진 즉시 갱신용 cache-bust — user.updatedAt 우선, 없으면 url 자체가 key
                const avatarSrc = resolveImageSrc(
                  user?.avatarUrl,
                  user?.updatedAt,
                );
                return avatarSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={avatarSrc}
                    src={avatarSrc}
                    alt={`${displayName} 프로필 이미지`}
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  avatarInitial
                );
              })()}
              {/* 업로드 중 진행 오버레이 (blur 미사용 — 불투명 dim + 스피너) */}
              {isUploadingAvatar && (
                <span
                  className="absolute inset-0 grid place-items-center bg-rink-900/45"
                  aria-hidden="true"
                >
                  <Icon
                    name="progress_activity"
                    className="text-[22px] text-white animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                </span>
              )}
            </span>
            {/* 카메라 뱃지 — 사진 변경 가능 표시 */}
            <span
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 grid place-items-center shadow-sm"
              aria-hidden="true"
            >
              <Icon
                name="photo_camera"
                className="text-[13px] text-wtext-2 dark:text-rink-100"
                aria-hidden="true"
              />
            </span>
          </button>

          {/* 사용자 정보 — 탭하면 프로필 페이지 이동 */}
          <button
            type="button"
            onClick={() => handleQuickAction("/profile")}
            className="flex-1 min-w-0 flex items-center text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 rounded-2xl"
            aria-label={`${MESSAGES.drawer.profile} 열기 — ${displayName}`}
          >
            <span className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 text-card-title font-extrabold tracking-[-0.03em] text-wtext-1 dark:text-white truncate max-w-[55%]">
                  {displayName}
                </span>
                {userRole === "parent" ? (
                  // 학부모: 역할 배지 대신 본인 id(이메일/연락처)를 이름 옆에 노출
                  (user?.email || user?.phone) && (
                    <span className="min-w-0 text-card-meta text-wtext-4 dark:text-rink-300 tracking-[-0.01em] truncate">
                      {user?.email ?? user?.phone}
                    </span>
                  )
                ) : (
                  <span
                    className="shrink-0 inline-flex items-center text-card-meta font-bold px-[7px] py-[2px] rounded-md"
                    style={{
                      background: "var(--c-ice-100)",
                      color: "var(--c-ice-700)",
                    }}
                  >
                    {roleLabel}
                  </span>
                )}
              </span>
              {userRole === "parent" ? (
                // 학부모: 부제 자리에 선수명 나열(정적 회색). 자녀 선택 카드는 별도 유지.
                childrenList.length > 0 && (
                  <span className="text-card-meta text-wtext-4 dark:text-rink-300 tracking-[-0.01em] truncate">
                    {childrenList.map((c) => c.name).join(" · ")}
                  </span>
                )
              ) : (
                <span className="text-card-meta text-wtext-4 dark:text-rink-300 tracking-[-0.01em] truncate">
                  {displaySub}
                </span>
              )}
              {/* 본인 소속 팀명 — 감독/코치/학생만. 학부모는 자녀별 팀이라 본인 소속 표시 안 함. */}
              {userRole !== "parent" && myTeams.length > 0 && (
                <span className="text-card-meta text-ice-600 dark:text-ice-400 tracking-[-0.01em] truncate font-semibold">
                  소속: {myTeams.map((t) => t.name).join(" · ")}
                </span>
              )}
            </span>
          </button>

          {/* 로그아웃 영역 — Profile 카드 우측 끝 (가로 pill, 표준 터치 타겟 ≥48px) */}
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              "shrink-0 inline-flex items-center justify-center gap-1 h-10 px-2.5 rounded-xl border transition-colors motion-reduce:transition-none active:brightness-95",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
              "text-wtext-1 border-wline hover:bg-wline hover:border-wline dark:text-white dark:border-rink-700 dark:hover:bg-rink-700/80",
            )}
            aria-label={MESSAGES.common.logoutConfirmButton}
          >
            <Icon name="logout" className="text-[20px]" aria-hidden="true" />
            <span className="text-card-body font-bold tracking-[-0.01em] whitespace-nowrap">
              로그아웃
            </span>
          </button>

          {/* 프로필 사진 선택 input (숨김) — 웹: 파일 선택창, 네이티브: WebView 파일 피커.
              선택 파일은 uploadFile 이 category=AVATAR 로 웹/네이티브 업로드를 자동 분기한다. */}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarFileChange}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>

        {/* 자녀 선택 카드 — PARENT · 선택 대상 자녀 2명+ 일 때만. '전체' 카드 없음(단일 자녀 모델).
            선택 시 메뉴를 닫지 않고 전역 선택만 변경(onClose 미호출). */}
        {showChildChips ? (
          <DrawerChildSwitcher
            items={selectableChildren.map((child) => ({
              id: child.id,
              name: child.name,
              clubName: child.club,
              // 이모지는 통계용 childrenList(/children 응답 profileEmoji)에서 보강 — 카드 아이콘 표시.
              profileEmoji: childrenList.find((c) => c.id === child.id)
                ?.profileEmoji,
            }))}
            activeChildId={selectedChildId}
            onSelect={setSelectedChildId}
          />
        ) : (
          // 자녀 선택 카드가 없을 때(감독·코치·자녀 1명) 프로필-메뉴 구분선 — 학부모 자녀카드와 동일 위치.
          <div
            className="border-b border-wline-2 dark:border-rink-800"
            aria-hidden="true"
          />
        )}

        {/* ── M1 빠른 통계 카드 (2칸) — ice-50 surface, ice-100 border ── */}
        {(stat0 || stat1) && (
          <div
            className="mx-6 mb-4 px-4 py-3.5 rounded-[14px] flex items-center bg-ice-50 dark:bg-rink-800"
            style={{
              border: "1px solid var(--c-ice-100)",
            }}
          >
            {stat0 && (
              <div className="flex-1 flex flex-col gap-0.5">
                <div
                  className="text-card-meta font-bold tracking-[0.04em]"
                  style={{ color: "var(--c-ice-700)" }}
                >
                  {stat0.label}
                </div>
                {/* ref stat 값: 15px 800 text1 -0.02em — letterSpacing 정확 매칭 */}
                <div className="text-card-title font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em]">
                  {stat0.value}
                </div>
              </div>
            )}
            {stat0 && stat1 && (
              /* ref separator: width 1, height 28, bg ice100 (no border-radius) */
              <div className="mx-3.5 h-7 w-px shrink-0 bg-ice-100 dark:bg-rink-700" />
            )}
            {stat1 && (
              <div className="flex-1 flex flex-col gap-0.5">
                <div
                  className="text-card-meta font-bold tracking-[0.04em]"
                  style={{ color: "var(--c-ice-700)" }}
                >
                  {stat1.label}
                </div>
                <div className="text-card-title font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em]">
                  {stat1.value}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Scrollable nav (M1 패턴: 섹션 + DrawerRow) ── */}
        <div className="flex-1 touch-pan-y overflow-y-auto overscroll-contain">
          {/* 멀티 롤 사용자 — Role Switcher */}
          <RoleSwitcherSection onClose={onClose} />

          {/* [수정 2026-05-16] 로딩 스켈레톤 제거 — menuItems 가 spec 폴백을 즉시 반환하므로
              4박스 스켈레톤이 "계속 로딩" 처럼 보이는 UX 문제 해소. 서버 응답 도착 시 자연 교체. */}

          {/* 빈 상태 — spec 폴백도 비어있을 때만 (이론상 발생 안 하지만 안전망 유지) */}
          {finalMenuItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Icon
                name="menu_open"
                className="text-[40px] text-wtext-4 dark:text-rink-500"
                aria-hidden="true"
              />
              <p className="text-sm text-wtext-4 dark:text-rink-300">
                등록된 메뉴가 없습니다
              </p>
            </div>
          )}

          {/* 메뉴 섹션 — 아코디언 (그룹 헤더 클릭으로 펼침/접힘, max-height+opacity transition) */}
          {finalMenuItems.map((group) => {
            const isExpanded = expandedGroup === group.id;
            return (
              <div
                key={group.id}
                className="border-b border-wline-2 dark:border-rink-700/60 last:border-b-0"
              >
                {/* 아코디언 헤더 — 클릭 토글 (uppercase 라벨 + chevron) */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-6 py-3.5 text-left",
                    "transition-colors motion-reduce:transition-none",
                    "hover:bg-wbg dark:hover:bg-rink-800/40 active:brightness-95",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
                  )}
                  aria-expanded={isExpanded}
                  aria-controls={`gm-group-${group.id}`}
                >
                  <span className="flex-1 text-card-title font-extrabold tracking-[-0.01em] text-wtext-1 dark:text-white">
                    {group.label}
                  </span>
                  <Icon
                    name="expand_more"
                    className={cn(
                      "shrink-0 text-[20px] text-wtext-1 dark:text-white",
                      "transition-transform duration-300 ease-ios motion-reduce:transition-none",
                      isExpanded ? "rotate-180" : "rotate-0",
                    )}
                    aria-hidden="true"
                  />
                </button>

                {/* 서브메뉴 — collapsible (max-height + opacity 로 자연스러운 열림/닫힘) */}
                <div
                  id={`gm-group-${group.id}`}
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-ios motion-reduce:transition-none",
                    isExpanded
                      ? "max-h-[800px] opacity-100"
                      : "max-h-0 opacity-0",
                  )}
                >
                  <div className="pb-1.5">
                    {group.subItems.map((sub) => (
                      <DrawerRowM1
                        key={`${group.id}-${sub.href}`}
                        icon={sub.icon}
                        label={sub.label}
                        badge={
                          typeof sub.badgeCount === "number" &&
                          sub.badgeCount > 0
                            ? sub.badgeCount
                            : undefined
                        }
                        onClick={() => {
                          addRecentMenu({
                            href: sub.href,
                            label: sub.label,
                            icon: sub.icon,
                          });
                          navigatedAwayRef.current = true;
                          navigate(sub.href);
                          setTimeout(() => onClose(), 0);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* 2026-05-09: "지원" 섹션 제거 — 항목들이 "고객지원" 그룹과 중복되어 통합.
              "고객센터(/feedback)" 는 COMMON_SUPPORT_GROUP 의 항목으로 흡수됨. */}
          <div className="h-6" />
        </div>

        {/* ── M1 Footer — 사업자 정보 + 약관 + 버전 ── */}
        {/*
          전자상거래법 §10조: 통신판매업자 정보 표시 의무
          Apple App Review 1.5: Developer Information (Support URL)
          관련 정책 항목: O-01~O-08 (사업자정보·고객센터)
          TODO: COMPANY_INFO 의 placeholder 를 실제 정보로 교체 (lib/legal/policy-content.ts)
        */}
        <footer className="px-6 pt-3.5 pb-7 border-t border-wline-2 dark:border-rink-700/60 space-y-3">
          {/* [2026-05-25] 약관 링크 nav 제거 — 이용약관·개인정보·환불·커뮤니티 규칙·접근성은
              "고객지원" 그룹 하위 항목(LEGAL_SUPPORT_ITEMS)으로 이동 (사용자 요청).
              footer 에는 전자상거래법 §10조 사업자 정보 + 앱 버전만 유지. */}

          {/* 사업자 정보 — 전자상거래법 §10조 (쇼핑몰 운영 시 통신판매업 신고번호 추가 필요) */}
          <div className="text-card-meta text-wtext-4 dark:text-rink-300 leading-relaxed space-y-0.5">
            <p>
              <span className="font-semibold">{COMPANY_INFO.name}</span>
              <span className="mx-1.5" aria-hidden="true">
                |
              </span>
              대표 {COMPANY_INFO.ceo}
            </p>
            <p>사업자등록번호 {COMPANY_INFO.businessNumber}</p>
            <p>{COMPANY_INFO.address}</p>
            <p>
              고객센터 {COMPANY_INFO.csPhone}
              <span className="mx-1.5" aria-hidden="true">
                |
              </span>
              {COMPANY_INFO.csEmail}
            </p>
            <p className="text-card-meta opacity-80">
              운영시간 {COMPANY_INFO.csHours}
            </p>
            <p className="text-card-meta opacity-80">
              개인정보 보호책임자 {COMPANY_INFO.privacyOfficer}
            </p>
          </div>

          {/* 앱 버전 (기존) */}
          <p className="text-card-meta text-wtext-4 dark:text-rink-300 tracking-[-0.01em]">
            {appVersionLabel}
          </p>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

export default GlobalMenu;
