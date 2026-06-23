"use client";

/**
 * /attendance-manage?classId=X — 수업별 일정 출석 이력 (2026-05-12 전면 재작성)
 *
 * 회의록(`backdata/20260423_teamplus.txt`) 결정 반영:
 *   - 24:54 "내 수업에 얘 안 왔네 이게 더 쉬워" — 수업 단위 출석 관리
 *   - 28:31 "다음 달 8 43 32만 원인데 8만 원 빼고" — 누적 결석 정산 단위
 *   - 25:03 "왔다 안 왔다 왔다 왔다 안 왔다" — 출석/결석 2-state
 *
 * 구조:
 *   - 3단 섹션: 진행 중(있을 때만) / 완료(역순 페이징 20개씩) / 예정(접힘, lazy)
 *   - 각 일정 카드 클릭 → /attendance/{scheduleId} (시점별 모드 자동 분기)
 *   - classId 없으면 → /classes-manage 리다이렉트
 *
 * DESIGN.md Pattern B (wallet-content) + wallet v2 토큰 100%.
 * AI 스타일 0건 (gradient/backdrop-blur/colored-shadow 금지).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { MobileContainer } from "@/components/layout/MobileContainer";
import { PostpaidSettlementSection } from "@/components/attendance/PostpaidSettlementSection";
import { MonthlyAttendanceCountSection } from "@/components/attendance/MonthlyAttendanceCountSection";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useNativeUI } from "@/hooks/useNativeUI";
import { usePageReady } from "@/hooks/usePageReady";
import {
  useClassAttendanceHistory,
  type ClassScheduleHistoryItem,
  type ClassScheduleUpcomingItem,
} from "@/hooks/useCoachAttendanceManage";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────

const DAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}.${dd}(${DAY_KR[d.getDay()]})`;
}

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function AttendanceManagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classId = searchParams.get("classId");
  const { toast } = useToast();

  // [2026-05-12] 인증 훅 단일 호출 — (coach)/layout.tsx 가 이미 useRequireRole 호출 중.
  // 페이지 레벨 중복 호출 제거. classId 가드는 effect 로 처리.

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  // classId 없으면 수업 목록으로 리다이렉트
  useEffect(() => {
    if (!classId) {
      toast.error(MESSAGES.attendance.classRequired);
      router.replace("/classes-manage");
    }
  }, [classId, router, toast]);

  const {
    data,
    isLoading,
    isLoadingMore,
    error,
    loadMoreCompleted,
    loadUpcoming,
  } = useClassAttendanceHistory(classId);

  usePageReady(!isLoading);

  // 예정 섹션 lazy load 상태
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [upcomingItems, setUpcomingItems] = useState<
    ClassScheduleUpcomingItem[]
  >([]);
  const [upcomingCursor, setUpcomingCursor] = useState<string | null>(null);
  const [upcomingHasMore, setUpcomingHasMore] = useState(false);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  const handleToggleUpcoming = useCallback(async () => {
    if (upcomingExpanded) {
      setUpcomingExpanded(false);
      return;
    }
    setUpcomingExpanded(true);
    if (upcomingItems.length === 0) {
      setUpcomingLoading(true);
      const res = await loadUpcoming();
      setUpcomingLoading(false);
      if (res) {
        setUpcomingItems(res.items);
        setUpcomingCursor(res.nextCursor);
        setUpcomingHasMore(res.hasMore);
      }
    }
  }, [upcomingExpanded, upcomingItems.length, loadUpcoming]);

  const handleLoadMoreUpcoming = useCallback(async () => {
    if (!upcomingHasMore || upcomingLoading) return;
    setUpcomingLoading(true);
    const res = await loadUpcoming(upcomingCursor ?? undefined);
    setUpcomingLoading(false);
    if (res) {
      setUpcomingItems((prev) => [...prev, ...res.items]);
      setUpcomingCursor(res.nextCursor);
      setUpcomingHasMore(res.hasMore);
    }
  }, [upcomingHasMore, upcomingLoading, upcomingCursor, loadUpcoming]);

  // 완료 섹션 무한 스크롤 — IntersectionObserver
  const completedSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sentinel = completedSentinelRef.current;
    if (!sentinel || !data?.completed.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          void loadMoreCompleted();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [data?.completed.hasMore, isLoadingMore, loadMoreCompleted]);

  const navigateToSchedule = useCallback(
    (scheduleId: string) => {
      router.push(`/attendance/${scheduleId}`);
    },
    [router],
  );

  // [v16 2026-05-16] 이중 로더 제거 — 리다이렉트 중에도 LoadingProvider 풀스크린 로더가 노출.
  if (!classId) return null;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="수업 출석 이력" forceNative />
      <main
        className="flex-1 min-h-0 overflow-y-auto bg-wbg dark:bg-puck"
        role="main"
        aria-label="수업 출석 이력"
      >
        {/* Hero — 수업 메타 (rink-800 + shadow-sh-rink) */}
        <section className="px-4 pt-4">
          <div className="rounded-w-xl bg-rink-800 dark:bg-rink-900 shadow-sh-rink p-5 text-white">
            <div className="text-card-meta font-extrabold tracking-[0.08em] text-ice-100/90">
              ATTENDANCE HISTORY
            </div>
            {data ? (
              <>
                <h1 className="mt-2 text-card-section font-extrabold tracking-tight break-keep text-white">
                  {data.classInfo.className}
                </h1>
                <p className="mt-1 text-card-body font-num text-rink-100 tabular-nums">
                  코치 {data.classInfo.coachName} · 학생{" "}
                  {data.classInfo.studentCount}명
                </p>
                <p className="mt-1 text-card-meta font-num text-ice-100/80 tabular-nums">
                  {data.classInfo.completedCount}/
                  {data.classInfo.totalScheduleCount}회차 진행
                </p>
              </>
            ) : isLoading ? (
              <div className="mt-2 h-6 w-2/3 rounded-w-sm bg-rink-700/60 animate-pulse motion-reduce:animate-none" />
            ) : null}
          </div>
        </section>

        {/* 통계 카드 (wsurface + shadow-sh-1, 3-grid) */}
        {data && (
          <section className="px-4 pt-3">
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-4">
              <div className="grid grid-cols-3 gap-2">
                <StatBlock
                  label="평균 출석률"
                  value={`${data.stats.avgAttendanceRate}%`}
                  dotClass="bg-mint-500"
                />
                <StatBlock
                  label="누적 결석"
                  value={`${data.stats.totalAbsent}회`}
                  dotClass="bg-flame-500"
                />
                <StatBlock
                  label="누적 출석"
                  value={`${data.stats.totalPresent}회`}
                  dotClass="bg-ice-500"
                />
              </div>
            </div>
          </section>
        )}

        {/* [B-5-3 / Phase C] 결제방식별 섹션 택일 — 후불=정산, 선불=회원별 출석 횟수 */}
        {data &&
          (data.classInfo.billingMode === "POSTPAID" ? (
            <PostpaidSettlementSection classId={classId} />
          ) : (
            <MonthlyAttendanceCountSection classId={classId} />
          ))}

        {/* 에러 */}
        {error && (
          <section className="px-4 pt-4">
            <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-6 text-center">
              <Icon
                name="error_outline"
                className="text-3xl text-flame-500"
                aria-hidden="true"
              />
              <p className="mt-2 text-card-title font-semibold text-wtext-1 dark:text-white">
                {error}
              </p>
            </div>
          </section>
        )}

        {/* 진행 중 섹션 — 있을 때만 노출 */}
        {data && data.inProgress.length > 0 && (
          <section className="px-4 pt-4">
            <SectionLabel>진행 중</SectionLabel>
            <ScheduleList
              items={data.inProgress}
              variant="inProgress"
              onClick={navigateToSchedule}
            />
          </section>
        )}

        {/* 완료 섹션 — 메인 영역 */}
        {data && (
          <section className="px-4 pt-4 pb-2">
            <SectionLabel>완료된 일정</SectionLabel>
            {data.completed.items.length === 0 ? (
              <EmptyHint message={MESSAGES.attendance.completedEmpty} />
            ) : (
              <>
                <ScheduleList
                  items={data.completed.items}
                  variant="completed"
                  onClick={navigateToSchedule}
                />
                {data.completed.hasMore && (
                  <div
                    ref={completedSentinelRef}
                    className="py-4 flex items-center justify-center text-card-meta text-wtext-3 dark:text-rink-300"
                    aria-live="polite"
                  >
                    {isLoadingMore ? "불러오는 중…" : "더 보기"}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* 예정 섹션 — 접힘/펼침 */}
        {data && data.upcomingCount > 0 && (
          <section className="px-4 pt-2 pb-8">
            <button
              type="button"
              onClick={() => void handleToggleUpcoming()}
              className="w-full flex items-center justify-between px-4 py-3 rounded-w-md bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
              aria-expanded={upcomingExpanded}
              aria-controls="upcoming-list"
            >
              <span className="text-card-body font-bold text-wtext-1 dark:text-white">
                예정된 일정 {data.upcomingCount}건
              </span>
              <Icon
                name={upcomingExpanded ? "expand_less" : "expand_more"}
                className="text-xl text-wtext-3 dark:text-rink-300"
                aria-hidden="true"
              />
            </button>

            {upcomingExpanded && (
              <div id="upcoming-list" className="mt-3">
                {upcomingLoading && upcomingItems.length === 0 ? (
                  <div className="py-6 text-center text-card-meta text-wtext-3 dark:text-rink-300">
                    불러오는 중…
                  </div>
                ) : upcomingItems.length === 0 ? (
                  <EmptyHint message={MESSAGES.attendance.upcomingEmpty} />
                ) : (
                  <>
                    <UpcomingList
                      items={upcomingItems}
                      onClick={navigateToSchedule}
                    />
                    {upcomingHasMore && (
                      <button
                        type="button"
                        onClick={() => void handleLoadMoreUpcoming()}
                        disabled={upcomingLoading}
                        className="mt-2 w-full py-3 text-card-meta font-semibold text-ice-500 hover:text-ice-600 disabled:opacity-60"
                      >
                        {upcomingLoading ? "불러오는 중…" : "더 보기"}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </MobileContainer>
  );
}

// ────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: string;
  dotClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <span
          className={cn("h-1.5 w-1.5 rounded-w-pill", dotClass)}
          aria-hidden="true"
        />
        <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300">
          {label}
        </span>
      </div>
      <span className="text-card-title font-extrabold font-num text-wtext-1 dark:text-white tabular-nums">
        {value}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-2">
      <span className="text-card-meta font-extrabold tracking-[0.08em] text-wtext-3 dark:text-rink-300">
        {children}
      </span>
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 p-6 text-center">
      <p className="text-card-title font-semibold text-wtext-2 dark:text-rink-100">
        {message}
      </p>
    </div>
  );
}

function ScheduleList({
  items,
  variant,
  onClick,
}: {
  items: ClassScheduleHistoryItem[];
  variant: "inProgress" | "completed";
  onClick: (scheduleId: string) => void;
}) {
  return (
    <ul
      className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 overflow-hidden divide-y divide-wline-2 dark:divide-rink-700"
      role="list"
      aria-label={
        variant === "inProgress" ? "진행 중인 일정 목록" : "완료된 일정 목록"
      }
    >
      {items.map((item) => (
        <li key={item.scheduleId} role="listitem">
          <button
            type="button"
            onClick={() => onClick(item.scheduleId)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none"
            aria-label={`${formatDateLabel(item.scheduledDate)} ${item.startTime ?? formatTimeLabel(item.scheduledDate)} 일정, 출석 ${item.present}/${item.total}명${item.unchecked > 0 ? `, 미확인 ${item.unchecked}명` : ""}${item.absent > 0 ? `, 결석 ${item.absent}명` : ""}, 출석 확인하기`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-card-title font-bold text-wtext-1 dark:text-white">
                {formatDateLabel(item.scheduledDate)}{" "}
                <span className="font-num tabular-nums font-semibold text-wtext-3 dark:text-rink-300">
                  {item.startTime ?? formatTimeLabel(item.scheduledDate)}
                </span>
              </p>
              <p className="mt-0.5 text-card-meta font-num text-wtext-3 dark:text-rink-300 tabular-nums">
                출석 {item.present}/{item.total}명
                {item.unchecked > 0 && ` · 미확인 ${item.unchecked}`}
              </p>
            </div>
            <RateBadge
              rate={item.rate}
              variant={variant}
              unchecked={item.unchecked}
              absent={item.absent}
            />
            <Icon
              name="chevron_right"
              className="text-xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

function RateBadge({
  rate,
  variant,
  unchecked,
  absent,
}: {
  rate: number;
  variant: "inProgress" | "completed";
  unchecked: number;
  absent: number;
}) {
  if (variant === "inProgress") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-w-pill bg-mint-100 px-2 py-1 text-card-meta font-extrabold text-rink-800 dark:bg-mint-500/20 dark:text-mint-100"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="진행 중인 수업"
      >
        <span
          className="h-1.5 w-1.5 rounded-w-pill bg-mint-500 animate-pulse motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span aria-hidden="true">진행 중</span>
      </span>
    );
  }
  // completed
  if (unchecked > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-w-pill bg-wline-2 px-2 py-1 text-card-meta font-extrabold text-wtext-2 dark:bg-rink-700 dark:text-rink-100 font-num tabular-nums">
        미확인 {unchecked}
      </span>
    );
  }
  if (absent > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-w-pill bg-flame-100 px-2 py-1 text-card-meta font-extrabold text-flame-500 dark:bg-flame-500/20 dark:text-flame-100 font-num tabular-nums">
        결석 {absent}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-w-pill bg-mint-100 px-2 py-1 text-card-meta font-extrabold text-rink-800 dark:bg-mint-500/20 dark:text-mint-100 font-num tabular-nums">
      {rate}%
    </span>
  );
}

function UpcomingList({
  items,
  onClick,
}: {
  items: ClassScheduleUpcomingItem[];
  onClick: (scheduleId: string) => void;
}) {
  return (
    <ul
      className="rounded-w-xl bg-wsurface dark:bg-rink-800 shadow-sh-1 border border-wline dark:border-rink-700 overflow-hidden divide-y divide-wline-2 dark:divide-rink-700"
      role="list"
      aria-label="예정된 일정 목록"
    >
      {items.map((item) => (
        <li key={item.scheduleId} role="listitem">
          <button
            type="button"
            onClick={() => onClick(item.scheduleId)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none"
            aria-label={`${formatDateLabel(item.scheduledDate)} ${item.startTime ?? formatTimeLabel(item.scheduledDate)} 예정 일정, 학생 ${item.total}명, 명단 확인하기`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-card-title font-bold text-wtext-2 dark:text-rink-100">
                {formatDateLabel(item.scheduledDate)}{" "}
                <span className="font-num tabular-nums font-semibold text-wtext-3 dark:text-rink-300">
                  {item.startTime ?? formatTimeLabel(item.scheduledDate)}
                </span>
              </p>
              <p className="mt-0.5 text-card-meta font-num text-wtext-3 dark:text-rink-300 tabular-nums">
                학생 {item.total}명
              </p>
            </div>
            <Icon
              name="chevron_right"
              className="text-xl text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
