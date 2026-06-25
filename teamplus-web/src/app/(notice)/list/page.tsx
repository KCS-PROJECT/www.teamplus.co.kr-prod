"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { NavLink, useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/services/api-client";
import { MESSAGES } from "@/lib/messages";
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from "@/hooks/useNativeUI";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useToast } from "@/components/ui/Toast";
import { useNoticeUnreadCount } from "@/hooks/useNoticeUnreadCount";
import {
  NOTICE_CATEGORY_LABEL,
  type NoticeCategoryVariant,
} from "@/lib/notice-category-colors";

type NoticeCategory = NoticeCategoryVariant;
type CategoryType = "all" | NoticeCategory;

interface NoticeItem {
  id: string;
  category: NoticeCategory;
  title: string;
  subtitle?: string;
  date: string;
  isPinned?: boolean;
  isNew?: boolean;
  isExpired?: boolean;
  isRead?: boolean;
}

interface ApiNotice {
  id: string;
  title: string;
  content?: string;
  priority?: number;
  pinned?: boolean;
  targetType?: string;
  isActive?: boolean;
  createdAt?: string;
  expiresAt?: string;
  isRead?: boolean;
}

const PAGE_SIZE = 10;

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function isNewNotice(iso?: string): boolean {
  if (!iso) return false;
  return new Date(iso) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

function stripHtml(html?: string): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function mapApiNotice(n: ApiNotice): NoticeItem {
  const subtitle = stripHtml(n.content).slice(0, 80);
  return {
    id: n.id,
    category: n.targetType === "event" ? "event" : "notice",
    title: n.title,
    subtitle: subtitle || undefined,
    date: formatDate(n.createdAt),
    isPinned: n.pinned ?? (n.priority ?? 0) > 0,
    isNew: isNewNotice(n.createdAt),
    isExpired: n.expiresAt ? new Date(n.expiresAt) < new Date() : false,
    isRead: n.isRead,
  };
}

/* ───────── 섹션 라벨 (좌측 스트라이프 + 14px 800) ───────── */
function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-2.5">
      <div className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="w-[3px] h-3.5 bg-it-blue-500 rounded-sm" />
        <span className="text-[15px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em] inline-flex items-center gap-1.5">
          {children}
        </span>
      </div>
      {action}
    </div>
  );
}

/* ───────── 카테고리별 chip 컬러 (ICETIMES it-* 토큰) ───────── */
const CATEGORY_CHIP_TONE: Record<NoticeCategory, { bg: string; text: string }> = {
  notice: { bg: "bg-it-blue-50 dark:bg-it-blue-500/15", text: "text-it-blue-500" },
  event: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  academy: { bg: "bg-it-blue-50 dark:bg-it-blue-500/15", text: "text-it-blue-500" },
};

/* ───────── 카테고리별 좌측 아이콘 앵커 (리스트 스캔성↑) ───────── */
const CATEGORY_ICON: Record<NoticeCategory, { name: string; bg: string; text: string }> = {
  notice: { name: "campaign", bg: "bg-it-blue-50 dark:bg-it-blue-500/15", text: "text-it-blue-500" },
  event: { name: "celebration", bg: "bg-emerald-500/10 dark:bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400" },
  academy: { name: "school", bg: "bg-it-blue-50 dark:bg-it-blue-500/15", text: "text-it-blue-500" },
};

/* ───────── 탭별 빈 상태 메시지 ───────── */
const EMPTY_STATE_BY_TAB: Record<
  CategoryType,
  { icon: string; title: string; hint: string }
> = {
  all: {
    icon: "campaign",
    title: "아직 새로운 소식이 없어요",
    hint: "공지나 이벤트가 등록되면 이곳에 알려드릴게요",
  },
  notice: {
    icon: "push_pin",
    title: "등록된 공지가 없어요",
    hint: "중요한 공지가 올라오면 가장 먼저 보여드릴게요",
  },
  event: {
    icon: "celebration",
    title: "진행 중인 이벤트가 없어요",
    hint: "곧 흥미로운 이벤트로 다시 찾아올게요",
  },
  academy: {
    icon: "school",
    title: "오픈클래스 안내가 없어요",
    hint: "새로운 클래스가 열리면 바로 안내해 드릴게요",
  },
};

export default function NoticeListPage() {
  useNavigation();
  const { user } = useSessionAuth();
  // [2026-05-21] 동일 컴포넌트를 /notices(서비스 공지) · /team-notices(팀 공지) 양쪽에서 재사용.
  //   경로로 scope 분기 — 서비스 공지는 전체 / 팀 공지는 본인 소속 팀.
  const pathname = usePathname();
  const isTeamScope = (pathname ?? "").includes("team-notices");
  const noticeScope: "service" | "team" = isTeamScope ? "team" : "service";
  const pageTitle = isTeamScope ? "팀 공지사항" : "서비스 공지사항";
  // 서비스 공지(`/notices`)는 admin 만 작성. 팀 공지(`/team-notices`)는 감독/코치/원장이 작성 가능.
  const userType = user?.userType;
  const canWrite =
    (isTeamScope && (userType === 'coach' || userType === 'director' || userType === 'academy_director')) ||
    (!isTeamScope && userType === 'admin');
  useNativeUI({ showStatusBar: true, showBottomNav: true, appBarTitle: pageTitle });

  const [activeCategory, setActiveCategory] = useState<CategoryType>("all");
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const fetchNotices = useCallback(
    async (pageNum: number, append: boolean) => {
      if (pageNum === 1) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        // [2026-05-21] scope — service(서비스 공지·전체) / team(팀 공지·소속 팀).
        const url = `/notices?limit=${PAGE_SIZE}&page=${pageNum}&isActive=true&scope=${noticeScope}`;
        const res = await apiRequest<
          | { notices?: ApiNotice[]; data?: ApiNotice[]; total?: number }
          | ApiNotice[]
        >({
          method: "GET",
          url,
          retry: false,
        });

        if (res.success && res.data) {
          const raw = Array.isArray(res.data)
            ? res.data
            : ((res.data as { notices?: ApiNotice[] }).notices ??
              (res.data as { data?: ApiNotice[] }).data ??
              []);
          const total = Array.isArray(res.data)
            ? raw.length
            : ((res.data as { total?: number }).total ?? raw.length);
          const mapped = (raw as ApiNotice[]).map(mapApiNotice);

          if (append) {
            setNotices((prev) => [...prev, ...mapped]);
          } else {
            setNotices(mapped);
            setTotalCount(total);
          }
          setHasMore(mapped.length >= PAGE_SIZE);
        } else {
          if (!append) {
            setNotices([]);
            setTotalCount(0);
          }
          setHasMore(false);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchNotices(1, false);
  }, [fetchNotices]);

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotices(nextPage, true);
  }, [page, fetchNotices]);

  // [2026-06-19 사용자 직접 지시] 서비스 공지 전체/안읽음/전체읽음 배지 (알림 페이지와 동일 패턴).
  //   서비스 공지(/notices)에서만 노출 — 팀 공지(/team-notices)는 제외.
  const { toast } = useToast();
  const { unreadCount: noticeUnread, refresh: refreshNoticeUnread } =
    useNoticeUnreadCount();
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const handleMarkAllNoticesRead = useCallback(async () => {
    if (noticeUnread === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await apiRequest({ method: "POST", url: "/notices/mine/read-all" });
      setPage(1);
      setHasMore(true);
      await fetchNotices(1, false);
      void refreshNoticeUnread();
      toast.success(MESSAGES.notifications.markAllReadSuccess);
    } finally {
      setIsMarkingAll(false);
    }
  }, [noticeUnread, isMarkingAll, fetchNotices, refreshNoticeUnread, toast]);

  // 카테고리 필터
  const filteredNotices = notices.filter((n) => {
    if (activeCategory !== "all" && n.category !== activeCategory) return false;
    return true;
  });

  // 상단 Hero = 고정 공지 전용. 고정 공지가 없으면 Hero 를 생략하고 전체를 리스트에 노출.
  //   (fallback 으로 최신 1건을 Hero 로 승격하면 공지가 1건일 때 리스트가 비어 보이는 회귀 발생)
  // [2026-06-09] 상단 고정 공지 최대 2개까지 Hero 노출.
  const pinnedNotices = filteredNotices.filter((n) => n.isPinned).slice(0, 2);
  const pinnedIds = new Set(pinnedNotices.map((n) => n.id));
  const regularNotices = filteredNotices.filter((n) => !pinnedIds.has(n.id));

  const noticeCount = notices.length;
  const eventCount = notices.filter((n) => n.category === "event").length;
  const allCount = filteredNotices.length || totalCount;
  const tabs: { key: CategoryType; label: string; count: number }[] = [
    { key: "all", label: "전체", count: allCount },
    { key: "notice", label: "공지", count: noticeCount - eventCount > 0 ? noticeCount - eventCount : noticeCount },
    // 이벤트 공지가 있을 때만 탭 노출 (이벤트 공지가 없으면 숨김)
    ...(eventCount > 0
      ? [{ key: "event" as CategoryType, label: "이벤트", count: eventCount }]
      : []),
  ];

  /* ───────── 슬라이딩 인디케이터: 활성 탭 버튼의 위치/너비 측정 ───────── */
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);
  const activeTabIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeCategory),
  );

  useLayoutEffect(() => {
    const container = tabListRef.current;
    const btn = tabBtnRefs.current[activeTabIndex];
    if (!container || !btn) return;

    const measure = () => {
      const c = container.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      setPillStyle({ left: b.left - c.left, width: b.width });
    };

    measure();

    // ResizeObserver 단일 구독 — 화면 크기 변경(회전/접힘 포함) 시 자동 재측정.
    // window.addEventListener('resize') 직접 등록은 autolayout SoT 규칙으로 금지됨
    // (ClientProviders.subscribeToDeviceMetrics 단일 진입점 사용).
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeTabIndex, tabs.length]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={pageTitle} forceNative />

      <div className="flex-1 overflow-y-auto pb-30 bg-it-canvas dark:bg-puck hide-scrollbar">
        {/* Hero — 고정 공지 full-bleed navy 밴드 (ICETIMES flat · 박스 제거). */}
        {!isLoading && pinnedNotices.map((pinned, pIdx) => (
          <NavLink
            key={pinned.id}
            href={`/notice/${pinned.id}`}
            aria-label={`상단 고정 · ${pinned.title}`}
            className={cn(
              "relative block px-5 pt-4 pb-5 text-white bg-it-blue-800 dark:bg-it-blue-950",
              pIdx > 0 && "border-t border-white/10",
              "transition-[filter] duration-200 ease-ios active:brightness-95 motion-reduce:transition-none",
            )}
          >
            {/* 우상단 chip — 상단 고정 */}
            <div className="absolute top-4 right-5 inline-flex items-center gap-1.5 rounded-w-pill border border-white/30 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M6 2v8M3 6l3 3 3-3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform="rotate(180 6 6)"
                />
              </svg>
              상단 고정
            </div>

            <div className="flex items-center gap-3.5">
              {/* 별 아이콘 박스 */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-w-md bg-white/95 text-it-blue-500">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <path
                    d="M9 4l-3 8 4 3-2 9 12-11-4-3 2-9z"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 inline-flex items-center gap-1 rounded-w-xs bg-it-red-500 px-2 py-0.5 text-[10.5px] font-extrabold tracking-[0.02em] text-white">
                  <Icon name="priority_high" className="text-[12px]" aria-hidden="true" />
                  중요
                </div>
                <div className="text-[18px] font-extrabold leading-[1.3] tracking-[-0.025em] line-clamp-2">
                  {pinned.title}
                </div>
                <div className="mt-1 text-[11px] font-bold text-white/90 tabular-nums">
                  {pinned.date || ""}
                </div>
              </div>
            </div>

            {/* 안내 박스 — 본문 미리보기. 이중 클램프로 텍스트 누출 방지. 본문 없으면 숨김. */}
            {pinned.subtitle && (
              <div className="mt-3.5 overflow-hidden rounded-w-md border border-white/20 bg-white/10 px-3 py-2.5">
                <p className="text-[12.5px] font-medium leading-[1.5] text-white/95 line-clamp-2">
                  {pinned.subtitle}
                </p>
              </div>
            )}
          </NavLink>
        ))}

        {/* Tabs — 04e segmented control · 슬라이딩 인디케이터 */}
        {eventCount > 0 && (
        <div
          role="tablist"
          aria-label="공지 카테고리"
          className="px-5 pt-4"
        >
          <div
            ref={tabListRef}
            className={cn(
              "relative grid gap-1 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 p-1",
              tabs.length >= 3 ? "grid-cols-3" : "grid-cols-2",
            )}
          >
            {/* 활성 인디케이터 (Pill) — 슬라이딩 */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute top-1 h-9 rounded-w-sm bg-it-blue-500",
                "transition-[transform,width,opacity] duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none will-change-transform",
                pillStyle ? "opacity-100" : "opacity-0",
              )}
              style={{
                width: pillStyle?.width ?? 0,
                transform: `translate3d(${pillStyle?.left ?? 0}px, 0, 0)`,
                left: 0,
              }}
            />
            {tabs.map((t, idx) => {
              const on = activeCategory === t.key;
              return (
                <button
                  key={t.key}
                  ref={(el) => {
                    tabBtnRefs.current[idx] = el;
                  }}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  onClick={() => setActiveCategory(t.key)}
                  className={cn(
                    "relative z-10 inline-flex h-9 items-center justify-center gap-1.5 rounded-w-sm text-[13px] font-extrabold tracking-[-0.01em] focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40",
                    "transition-colors duration-300 ease-out motion-reduce:transition-none",
                    on ? "text-white" : "text-it-ink-600 dark:text-wtext-4 hover:text-it-blue-500",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-w-pill px-1.5 text-[10px] font-extrabold tabular-nums",
                      "transition-colors duration-300 ease-out motion-reduce:transition-none",
                      on ? "bg-white/25 text-white" : "bg-it-line dark:bg-rink-700 text-it-ink-500 dark:text-wtext-4",
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* [2026-06-19 사용자 직접 지시] 전체/안읽음/전체읽음 배지 — 서비스 공지에서만, 알림 페이지와 동일 크기(h-9). */}
        {!isTeamScope && !isLoading && totalCount > 0 && (
          <div className="px-5 pt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-[13px] font-extrabold text-it-ink-700 dark:text-rink-100">
                <Icon name="campaign" className="text-[14px] text-it-ink-400 dark:text-rink-400" aria-hidden="true" />
                전체
                <span className="tabular-nums text-it-ink-800 dark:text-white">{totalCount}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-[13px] font-extrabold text-it-ink-700 dark:text-rink-100">
                <span className="size-2 rounded-full bg-it-red-500" aria-hidden="true" />
                안읽음
                <span className="tabular-nums text-it-red-500">{noticeUnread}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleMarkAllNoticesRead}
              disabled={noticeUnread === 0 || isMarkingAll}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-w-md border-[1.5px] text-[13px] font-extrabold tracking-tight transition-colors motion-reduce:transition-none active:brightness-95",
                noticeUnread > 0 && !isMarkingAll
                  ? "border-it-blue-500 bg-it-blue-500 text-white hover:bg-it-blue-600"
                  : "border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-it-ink-400 dark:text-rink-400 cursor-not-allowed",
              )}
              aria-label={MESSAGES.notifications.markAllRead}
            >
              <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 8.5l2.5 2.5 4-5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7.5 10.5l1 1 4-5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {MESSAGES.notifications.markAllRead}
            </button>
          </div>
        )}

        {/* 최근 소식 — 일반 공지가 있을 때만 라벨 노출 (고정 공지만 있고 0건이면 숨김) */}
        {/* flat 섹션 사이 8px 회색 갭 (Hero·탭·배지 아래) */}
        {!isLoading && (
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        )}

        {/* 최근 소식 — flat 흰 섹션 (hairline 행, 카드 박스 제거) */}
        <section
          key={activeCategory}
          className="bg-it-surface dark:bg-rink-800 pb-6 animate-fade-in motion-reduce:animate-none"
          aria-label="최근 소식"
        >
          {!isLoading && regularNotices.length > 0 && (
            <SectionLabel action={null}>
              최근 소식
              <span className="ml-1 rounded-w-pill bg-it-line dark:bg-rink-700 px-1.5 py-px text-[11px] font-extrabold text-it-ink-700 dark:text-wtext-4 tabular-nums">
                {regularNotices.length}
              </span>
            </SectionLabel>
          )}

          {/* 공지 목록 — hairline 행 */}
          <div className="flex flex-col px-5">
            {!isLoading &&
              regularNotices.map((r, idx) => {
                const tone = CATEGORY_CHIP_TONE[r.category];
                const catIcon = CATEGORY_ICON[r.category];
                const kindLabel = NOTICE_CATEGORY_LABEL[r.category];
                const unread = r.isRead === false;
                const isLast = idx === regularNotices.length - 1;
                return (
                  <NavLink
                    key={r.id}
                    href={`/notice/${r.id}`}
                    className={cn(
                      "flex items-start gap-3 py-3.5 transition-colors duration-200 ease-ios motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 active:brightness-95",
                      !isLast && "border-b border-it-line dark:border-rink-700",
                      r.isExpired && "opacity-70",
                    )}
                    aria-label={`[${kindLabel}] ${r.title} — ${r.date}${unread ? " · 미확인" : ""}${r.isExpired ? " · 종료됨" : ""}`}
                  >
                    {/* 좌측 카테고리 아이콘 앵커 — 미확인 시 우상단 점 표시 */}
                    <div
                      className={cn(
                        "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-w-md",
                        catIcon.bg,
                      )}
                    >
                      <Icon
                        name={catIcon.name}
                        className={cn("text-[22px]", catIcon.text)}
                        aria-hidden="true"
                      />
                      {unread && (
                        <span
                          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-w-pill bg-it-red-500 ring-2 ring-it-surface dark:ring-rink-800"
                          aria-label="미확인 공지"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-w-xs px-2 py-0.5 text-[11px] font-extrabold tracking-[-0.01em]",
                            tone.bg,
                            tone.text,
                          )}
                        >
                          {kindLabel}
                        </span>
                        <span aria-hidden="true" className="h-0.5 w-0.5 rounded-w-pill bg-it-ink-400" />
                        <span className="text-[11px] font-bold text-it-ink-500 dark:text-wtext-4 tabular-nums">
                          {r.date}
                        </span>
                      </div>

                      <h3
                        className={cn(
                          "mt-2 text-[15px] leading-[1.35] tracking-[-0.025em] text-it-ink-800 dark:text-white line-clamp-2",
                          unread ? "font-extrabold" : "font-bold",
                        )}
                      >
                        {r.title}
                      </h3>

                      {r.subtitle && (
                        <p className="mt-1.5 text-[12.5px] font-medium leading-[1.55] text-it-ink-500 dark:text-wtext-4 line-clamp-2">
                          {r.subtitle}
                        </p>
                      )}
                    </div>

                    <Icon
                      name="chevron_right"
                      className="mt-0.5 shrink-0 text-base text-it-ink-400 dark:text-wtext-4"
                      aria-hidden="true"
                    />
                  </NavLink>
                );
              })}

            {/* Load More Button */}
            {!isLoading && hasMore && regularNotices.length > 0 && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 py-3.5 text-[13px] font-bold text-it-ink-600 dark:text-wtext-4 hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin motion-reduce:animate-none rounded-w-pill border-2 border-it-line-strong dark:border-rink-700 border-t-it-blue-500"
                    />
                    <span>{MESSAGES.common.loading}</span>
                  </>
                ) : (
                  <>
                    <Icon name="expand_more" className="text-base" aria-hidden="true" />
                    <span>{MESSAGES.notice.list.loadMoreShort}</span>
                  </>
                )}
              </button>
            )}

            {/* Empty State — 탭별 멘트 */}
            {!isLoading && regularNotices.length === 0 && pinnedNotices.length === 0 && (() => {
              const empty = EMPTY_STATE_BY_TAB[activeCategory] ?? EMPTY_STATE_BY_TAB.all;
              return (
                <div
                  className="flex flex-col items-center justify-center px-6 py-16 text-center"
                  role="status"
                  aria-live="polite"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-500/15">
                    <Icon
                      name={empty.icon}
                      className="text-3xl text-it-blue-500"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-[15px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                    {empty.title}
                  </p>
                  <p className="mt-1.5 text-[12.5px] font-medium leading-[1.5] text-it-ink-500 dark:text-wtext-4">
                    {empty.hint}
                  </p>
                </div>
              );
            })()}

            {/* 고정 공지만 있고 일반 공지가 0건 — Hero 아래가 텅 비지 않도록 가벼운 안내. */}
            {!isLoading && regularNotices.length === 0 && pinnedNotices.length > 0 && (
              <div
                className="flex flex-col items-center justify-center px-6 py-12 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-w-pill bg-it-line dark:bg-rink-700">
                  <Icon
                    name="inbox"
                    className="text-2xl text-it-ink-400 dark:text-wtext-4"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-[13px] font-bold text-it-ink-600 dark:text-wtext-4">
                  다른 소식은 아직 없어요
                </p>
                <p className="mt-1 text-[12px] font-medium text-it-ink-500 dark:text-wtext-4">
                  새로운 공지가 올라오면 이곳에서 알려드릴게요
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 공지 작성 FAB — admin/director만 노출 */}
      {canWrite && (
        <FloatingActionButton href="/notices-create" icon="edit" label="공지 작성하기" />
      )}
    </MobileContainer>
  );
}
