"use client";

import { useState, useEffect } from "react";
import { NavLink } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/services/api-client";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { devWarn } from "@/lib/logger";

/* ─── Types ───────────────────────────────── */

interface NoticeItem {
  id: string;
  title: string;
  date: string;
  isNew: boolean;
  type?: string;
}

/** W4: 대시보드 응답에서 주입되는 서버 공지 아이템 (자체 fetch 우회) */
export interface DashboardNoticeItem {
  id: string;
  title: string;
  targetType?: string | null;
  createdAt: string | Date;
  pinned?: boolean;
}

interface NoticeSectionProps {
  /** "전체보기" 링크 경로 (관리자: /notices-manage, 기타: /notices) */
  manageHref?: string;
  /** 최대 표시 개수 */
  limit?: number;
  /** W4: 대시보드 응답에서 주입된 공지 (제공 시 자체 fetch 스킵 → RTT -1) */
  notices?: DashboardNoticeItem[] | null;
  /**
   * 아동 전용 variant — 큰 글자, 이모지 prefix, 제목 20자 트림.
   * WCAG AAA 아동 UI 표준 준수.
   */
  variant?: "default" | "child";
  /**
   * 학부모 대시보드 전용 — "일반 / 스팟" 탭 노출 (설계서 §4.1 ⑤).
   * 스팟 공지는 targetType === 'spot' 기준. 미지정/false → 기존 단일 리스트.
   */
  showSpotTab?: boolean;
}

/**
 * 아동 variant 에서 공지 타입별 이모지 prefix 매핑.
 * 타입 미지정 또는 매핑 없음 → 📢 기본 이모지.
 */
const CHILD_NOTICE_EMOJI: Record<string, string> = {
  class: "🏒",
  attendance: "⛸️",
  event: "🎉",
  payment: "💳",
  notice: "📢",
};

/** 아동 variant 에서 제목을 20자 이내로 트림 (긴 제목 대응) */
function trimChildTitle(title: string): string {
  if (title.length <= 20) return title;
  return `${title.slice(0, 20)}…`;
}

/* ─── Cache ───────────────────────────────── */

const NOTICE_CACHE_KEY = "teamplus_notice_cache";
const NOTICE_CACHE_TTL = 60_000; // 60초

interface NoticeCacheEntry {
  data: NoticeItem[];
  timestamp: number;
}

function getCachedNotices(): NoticeItem[] | null {
  try {
    const raw = sessionStorage.getItem(NOTICE_CACHE_KEY);
    if (!raw) return null;
    const entry: NoticeCacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > NOTICE_CACHE_TTL) {
      sessionStorage.removeItem(NOTICE_CACHE_KEY);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCachedNotices(data: NoticeItem[]): void {
  try {
    const entry: NoticeCacheEntry = { data, timestamp: Date.now() };
    sessionStorage.setItem(NOTICE_CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* sessionStorage 사용 불가 시 무시 */
  }
}

/* ─── Component ────────────────────────────── */

/**
 * NoticeSection — 대시보드 공지사항 공통 컴포넌트
 *
 * 감독/코치/관리자/학부모 대시보드에서 공용으로 사용.
 * GET /notices API를 자체 호출하여 최신 공지를 표시.
 * sessionStorage 캐시 (60초 TTL)로 같은 세션 내 중복 요청 방지.
 */
function mapServerNotice(n: DashboardNoticeItem): NoticeItem {
  let createdAtMs = Date.now();
  if (n.createdAt != null) {
    const parsed =
      typeof n.createdAt === "string"
        ? Date.parse(n.createdAt)
        : n.createdAt instanceof Date
          ? n.createdAt.getTime()
          : NaN;
    if (!Number.isNaN(parsed)) createdAtMs = parsed;
  }
  const d = new Date(createdAtMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return {
    id: n.id,
    title: n.title,
    type: n.targetType ?? "notice",
    date: `${y}.${m}.${dd}`,
    isNew: Date.now() - createdAtMs < 3 * 24 * 60 * 60 * 1000,
  };
}

export function NoticeSection({
  manageHref = "/notices",
  limit = 5,
  notices: propNotices,
  variant = "default",
  showSpotTab = false,
}: NoticeSectionProps) {
  const isChild = variant === "child";
  // 아동 variant: 최대 3건만 노출 (인지 부하 축소)
  const effectiveLimit = isChild ? Math.min(limit, 3) : limit;
  // 학부모 전용 일반/스팟 탭 상태 (설계서 §4.1 ⑤)
  const [activeTab, setActiveTab] = useState<"general" | "spot">("general");
  // W4: props로 notices 주입되면 자체 fetch 완전 스킵 (대시보드 응답에 포함된 경우)
  const hasProvidedNotices = Array.isArray(propNotices);
  const [notices, setNotices] = useState<NoticeItem[]>(
    hasProvidedNotices ? propNotices!.map(mapServerNotice) : [],
  );
  const [isLoading, setIsLoading] = useState(!hasProvidedNotices);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // props 변경 시 상태 동기화
  useEffect(() => {
    if (hasProvidedNotices) {
      setNotices(propNotices!.map(mapServerNotice));
      setIsLoading(false);
      setFetchError(null);
    }
  }, [propNotices, hasProvidedNotices]);

  useEffect(() => {
    // W4: props로 주입된 경우 자체 fetch 스킵 (대시보드 응답에 포함됨)
    if (hasProvidedNotices) return;

    let aborted = false;

    async function fetchNotices() {
      // 1) 캐시 확인 (비어있지 않은 경우만 신뢰 — 빈 배열은 재요청)
      const cached = getCachedNotices();
      if (cached && cached.length > 0) {
        setNotices(cached);
        setIsLoading(false);
        return;
      }

      try {
        // 쿼리 파라미터는 params 옵션으로 전달 (Native Bridge는 queryParams로 안전 처리,
        // Web axios도 동일하게 쿼리스트링으로 인코딩 — 경로 일관성 확보)
        const res = await api.get<
          | Array<{
              id: string;
              title: string;
              targetType?: string;
              createdAt: string;
            }>
          | {
              data: Array<{
                id: string;
                title: string;
                targetType?: string;
                createdAt: string;
              }>;
            }
        >("/notices", { params: { limit } });

        if (aborted) return;

        if (!res.success) {
          // 실패 원인 가시화 (토큰 만료/네트워크/서버 오류 등)
          const msg = res.error?.message ?? "공지사항을 불러오지 못했습니다";
          if (process.env.NODE_ENV !== "production") {
            devWarn("[NoticeSection] fetch failed:", res.error);
          }
          setFetchError(msg);
          setNotices([]);
          return;
        }

        const raw = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);

        const now = Date.now();
        const items: NoticeItem[] = raw.map((n) => ({
          id: n.id,
          title: n.title,
          type: n.targetType ?? "notice",
          date: (() => {
            const d = new Date(n.createdAt);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${y}.${m}.${dd}`;
          })(),
          isNew:
            now - new Date(n.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000,
        }));

        setFetchError(null);
        setNotices(items);
        // 빈 배열은 캐시에 저장하지 않음 (다음 진입 시 재요청 유도)
        if (items.length > 0) {
          setCachedNotices(items);
        }
      } catch (err) {
        if (aborted) return;
        if (process.env.NODE_ENV !== "production") {
          devWarn("[NoticeSection] unexpected error:", err);
        }
        setFetchError("공지사항을 불러오지 못했습니다");
        setNotices([]);
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }
    fetchNotices();

    return () => {
      aborted = true;
    };
  }, [limit, reloadTick, hasProvidedNotices]);

  const handleRetry = () => {
    try {
      sessionStorage.removeItem(NOTICE_CACHE_KEY);
    } catch {
      /* ignore */
    }
    setIsLoading(true);
    setFetchError(null);
    setReloadTick((n) => n + 1);
  };

  /* ── 로딩 상태 ── */
  if (isLoading) {
    return null;
  }

  // 탭 필터링 — showSpotTab 활성 시 일반/스팟 분리 (설계서 §4.1 ⑤)
  const filteredNotices = showSpotTab
    ? notices.filter((n) =>
        activeTab === "spot" ? n.type === "spot" : n.type !== "spot",
      )
    : notices;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-card-section">공지사항</h3>
        <NavLink
          href={manageHref}
          className="text-card-meta hover:text-ice-500 transition-colors font-medium py-1 px-2"
        >
          전체보기
        </NavLink>
      </div>

      {/* 일반/스팟 탭 — showSpotTab 활성 시에만 렌더 (다른 역할 대시보드 영향 0) */}
      {showSpotTab && (
        <div
          role="tablist"
          aria-label="공지 카테고리"
          className="mb-3 inline-flex rounded-lg bg-wline-2 p-1 dark:bg-rink-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "general"}
            onClick={() => setActiveTab("general")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
              activeTab === "general"
                ? "bg-white text-wtext-1 shadow-sm dark:bg-rink-700 dark:text-white"
                : "text-wtext-3 hover:text-wtext-2 dark:text-rink-300 dark:hover:text-rink-100",
            )}
          >
            일반
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "spot"}
            onClick={() => setActiveTab("spot")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
              activeTab === "spot"
                ? "bg-white text-wtext-1 shadow-sm dark:bg-rink-700 dark:text-white"
                : "text-wtext-3 hover:text-wtext-2 dark:text-rink-300 dark:hover:text-rink-100",
            )}
          >
            스팟
          </button>
        </div>
      )}

      {/* 공지 목록 — 학부모 대시보드와 동일한 심플 디자인 (아동 variant 분기) */}
      {filteredNotices.length > 0 ? (
        <div className="rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 overflow-hidden">
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {filteredNotices.slice(0, effectiveLimit).map((notice) => (
              <NavLink key={notice.id} href={`/notice/${notice.id}`}>
                <div
                  className={cn(
                    "flex items-center justify-between hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors active:brightness-95",
                    isChild ? "p-5 gap-3" : "p-4",
                  )}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    {isChild ? (
                      // [개선 2026-05-16] 이모지 앞 배경 박스 — bg-wline w-10 h-10 rounded-xl 로 시각 강조.
                      // WCAG AAA 어린이 UI 인지 부하 축소 + 카드 위계 명확화.
                      <span
                        className="shrink-0 w-10 h-10 rounded-xl bg-wline dark:bg-rink-700 flex items-center justify-center text-2xl"
                        aria-hidden="true"
                      >
                        {CHILD_NOTICE_EMOJI[notice.type ?? "notice"] ?? "📢"}
                      </span>
                    ) : (
                      <span
                        className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-500"
                        aria-hidden="true"
                      />
                    )}
                    <p
                      className={cn(
                        "truncate",
                        isChild
                          ? "text-card-title-child font-black"
                          : cn(
                              "text-card-body",
                              notice.isNew &&
                                "font-semibold !text-wtext-1 dark:!text-white",
                            ),
                      )}
                    >
                      {isChild ? trimChildTitle(notice.title) : notice.title}
                    </p>
                  </div>
                  {!isChild && (
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      <span className="text-card-meta">{notice.date}</span>
                      <Icon
                        name="chevron_right"
                        className="text-[16px] text-wtext-3 dark:text-rink-300"
                        aria-hidden="true"
                      />
                    </div>
                  )}
                  {isChild && (
                    <Icon
                      name="chevron_right"
                      className="text-[22px] text-wtext-3 dark:text-rink-300 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </NavLink>
            ))}
          </div>
        </div>
      ) : fetchError ? (
        /* 에러 상태 — 재시도 가능 */
        <div
          className="rounded-xl bg-white dark:bg-rink-800 border border-red-100 dark:border-red-900/40 py-8 px-5 text-center"
          role="alert"
        >
          <Icon
            name="error_outline"
            className="mb-2 text-2xl text-red-500 dark:text-red-400"
            aria-hidden="true"
          />
          <p className="text-card-body mb-3">{fetchError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 rounded-full border border-wline dark:border-rink-700 bg-white dark:bg-rink-700 px-4 py-1.5 text-card-meta font-bold !text-ice-500 hover:bg-wbg dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40"
            aria-label="공지사항 다시 불러오기"
          >
            <Icon name="refresh" className="text-[14px]" aria-hidden="true" />
            다시 불러오기
          </button>
        </div>
      ) : (
        /* 빈 상태 */
        <div className="rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 py-10 text-center">
          <p className="text-card-body">
            {showSpotTab && activeTab === "spot"
              ? MESSAGES.empty("스팟 공지")
              : MESSAGES.empty("공지사항")}
          </p>
        </div>
      )}
    </div>
  );
}

export default NoticeSection;
