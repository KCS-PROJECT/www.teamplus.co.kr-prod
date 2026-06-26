"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNativeUI } from "@/hooks/useNativeUI";
import { api } from "@/services/api-client";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { BackHeader } from "@/components/layout/Header";
import { Icon } from "@/components/ui/Icon";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { WEEKDAY_HEADERS, weekColumnOf, colIsSaturday, colIsSunday } from "@/lib/calendar-week";

// ─── Types ───────────────────────────────────────────
interface ScheduleEvent {
  id: string;
  title: string;
  time: string;
  endTime: string;
  location: string;
  students: number;
  type: "class" | "meeting" | "training";
}

interface DaySchedule {
  [dateKey: string]: ScheduleEvent[];
}

interface WeeklyStats {
  totalHours: number;
  totalSessions: number;
}

interface WorkScheduleData {
  schedule: DaySchedule;
  stats: WeeklyStats;
  upcomingShifts: ScheduleEvent[];
}

// ─── Mock Data ───────────────────────────────────────
function generateMockData(year: number, month: number): WorkScheduleData {
  const schedule: DaySchedule = {};
  const baseEvents: Omit<ScheduleEvent, "id">[] = [
    {
      title: "초급반 수업",
      time: "09:00",
      endTime: "10:30",
      location: "A 링크",
      students: 12,
      type: "class",
    },
    {
      title: "중급반 수업",
      time: "11:00",
      endTime: "12:30",
      location: "A 링크",
      students: 8,
      type: "class",
    },
    {
      title: "상급반 수업",
      time: "14:00",
      endTime: "15:30",
      location: "B 링크",
      students: 6,
      type: "class",
    },
    {
      title: "코치 미팅",
      time: "16:00",
      endTime: "17:00",
      location: "회의실",
      students: 0,
      type: "meeting",
    },
    {
      title: "개인 훈련 지도",
      time: "17:30",
      endTime: "19:00",
      location: "A 링크",
      students: 3,
      type: "training",
    },
  ];

  // Scatter events across the month
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 0) continue; // skip Sunday
    const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    const count = dow === 6 ? 1 : Math.min(2 + (d % 3), 3);
    schedule[key] = baseEvents.slice(0, count).map((e, i) => ({
      ...e,
      id: `${key}-${i}`,
    }));
  }

  const upcomingShifts = baseEvents
    .slice(0, 3)
    .map((e, i) => ({ ...e, id: `upcoming-${i}` }));

  return {
    schedule,
    stats: { totalHours: 32, totalSessions: 18 },
    upcomingShifts,
  };
}

// ─── Calendar Helpers ────────────────────────────────
const DAY_LABELS = WEEKDAY_HEADERS;
const DAY_LABELS_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const;

function getCalendarDays(year: number, month: number) {
  const firstDay = weekColumnOf(new Date(year, month - 1, 1));
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();

  const today = new Date();
  const todayKey =
    today.getFullYear() === year && today.getMonth() + 1 === month
      ? today.getDate()
      : -1;

  const days: {
    date: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    key: string;
  }[] = [];

  // prev month fill
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month - 1 < 1 ? 12 : month - 1;
    const y = month - 1 < 1 ? year - 1 : year;
    days.push({
      date: d,
      isCurrentMonth: false,
      isToday: false,
      key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  // current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({
      date: d,
      isCurrentMonth: true,
      isToday: d === todayKey,
      key: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  // next month fill (ensure 6 rows)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    const m = month + 1 > 12 ? 1 : month + 1;
    const y = month + 1 > 12 ? year + 1 : year;
    days.push({
      date: d,
      isCurrentMonth: false,
      isToday: false,
      key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  return days;
}

// ─── Event Type Colors ──────────────────────────────
// 근무 일정 이벤트 타입(class/meeting/training) — 훈련 캘린더 SoT(calendar-colors.ts)와
// 별개의 근무 taxonomy. ICETIMES 팔레트에 맞춰 class 만 it-blue 로 정렬, meeting/training 은
// 구분용 accent(amber/emerald) 유지.
const EVENT_COLORS: Record<string, string> = {
  class: "bg-it-blue-500",
  meeting: "bg-amber-500",
  training: "bg-emerald-500",
};

// ─── Error State ─────────────────────────────────────
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <MobileContainer hasBottomNav>
      <div className="flex-1 flex flex-col items-center justify-center bg-it-canvas dark:bg-rink-900 px-6 gap-4">
        <div className="w-16 h-16 rounded-w-pill bg-it-red-50 dark:bg-it-red-500/15 flex items-center justify-center">
          <Icon
            name="error_outline"
            className="text-3xl text-it-red-500 dark:text-it-red-300"
            aria-hidden="true"
          />
        </div>
        <div className="text-center">
          <h2 className="text-card-title font-bold text-it-ink-800 dark:text-white mb-1">
            {MESSAGES.error.title}
          </h2>
          <p className="text-card-body text-it-ink-500 dark:text-rink-300">
            {MESSAGES.error.network}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="mt-2 px-6 py-3 bg-it-blue-500 hover:bg-it-blue-600 text-white font-semibold rounded-w-md transition-colors active:brightness-95"
        >
          다시 시도
        </button>
      </div>
    </MobileContainer>
  );
}

// ─── Change Request Modal ────────────────────────────
function ChangeRequestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/work-schedule/change-request", { reason });
      onClose();
      setReason("");
    } catch {
      // silent fallback
    } finally {
      setSubmitting(false);
    }
  }, [reason, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-it-surface dark:bg-rink-800 rounded-w-xl w-[90%] max-w-sm p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-request-title"
        aria-describedby="change-request-desc"
      >
        <h3
          id="change-request-title"
          className="text-card-title font-bold text-it-ink-800 dark:text-white mb-1"
        >
          근무 일정 변경 요청
        </h3>
        <p
          id="change-request-desc"
          className="text-card-body text-it-ink-500 dark:text-rink-300 mb-4"
        >
          변경 사유를 작성해주세요
        </p>

        <label htmlFor="change-request-reason" className="sr-only">
          변경 사유
        </label>
        <textarea
          id="change-request-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="변경 사유를 입력해주세요..."
          className={cn(
            "w-full h-28 p-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700",
            "bg-it-fill dark:bg-rink-700 text-it-ink-800 dark:text-white",
            "text-card-body resize-none focus:outline-none focus:ring-2 focus:ring-it-blue-500/30 focus:border-it-blue-500",
            "placeholder:text-it-ink-400 dark:placeholder:text-rink-300",
          )}
          aria-required="true"
          aria-describedby="change-request-desc"
        />

        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 text-card-body font-semibold text-it-ink-600 dark:text-rink-100 hover:bg-it-fill dark:hover:bg-rink-700 transition-colors focus-visible:ring-2 focus-visible:ring-it-blue-500 focus:outline-none"
            aria-label="변경 요청 취소하기"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reason.trim() || submitting}
            aria-label={submitting ? '변경 요청 전송 중' : '변경 요청 보내기'}
            aria-busy={submitting}
            className={cn(
              "flex-1 py-3 rounded-w-md text-card-body font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-it-blue-500 focus:outline-none",
              reason.trim() && !submitting
                ? "bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95"
                : "bg-it-line-strong dark:bg-rink-500 cursor-not-allowed",
            )}
          >
            {submitting ? "요청 중..." : "요청하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function WorkSchedulePage() {
  const { user } = useSessionAuth();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [data, setData] = useState<WorkScheduleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // [AppBar 이중 노출 방지 2026-05-12] BackHeader 는 forceNative=true 기본값으로
  //   web/native 양쪽에서 DOM AppBar 를 강제 렌더. Native AppBar 도 함께 켜면
  //   iPhone 시뮬레이터에서 헤더가 2단으로 겹치는 회귀가 발생하므로 Native AppBar OFF.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBackButton: true,
    showBottomNav: true,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
      const res = await api.get(
        `/work-schedule/me?startDate=${startDate}&endDate=${endDate}`,
      );
      if (res?.data && Array.isArray(res.data)) {
        // 백엔드 배열 응답 → WorkScheduleData로 변환
        const raw = res.data as {
          id: string;
          scheduleDate: string;
          startTime: string;
          endTime: string;
          title?: string;
          location?: string;
          status: string;
        }[];
        const schedule: Record<string, ScheduleEvent[]> = {};
        let totalMin = 0;
        let sessionCount = 0;
        for (const item of raw) {
          const dateKey = item.scheduleDate.slice(0, 10);
          const evt: ScheduleEvent = {
            id: item.id,
            title: item.title ?? "수업",
            time: item.startTime,
            endTime: item.endTime,
            location: item.location ?? "",
            students: 0,
            type: "class",
          };
          if (!schedule[dateKey]) schedule[dateKey] = [];
          schedule[dateKey].push(evt);
          // 시간 계산
          const [sh, sm] = item.startTime.split(":").map(Number);
          const [eh, em] = item.endTime.split(":").map(Number);
          totalMin += eh * 60 + em - (sh * 60 + sm);
          sessionCount++;
        }
        const totalHours = Math.round((totalMin / 60) * 10) / 10;
        const upcoming = raw
          .filter(
            (r) => r.scheduleDate >= new Date().toISOString().slice(0, 10),
          )
          .slice(0, 3)
          .map((r) => ({
            id: r.id,
            title: r.title ?? "수업",
            time: r.startTime,
            endTime: r.endTime,
            location: r.location ?? "",
            students: 0,
            type: "class" as const,
          }));
        setData({
          schedule,
          stats: { totalHours, totalSessions: sessionCount },
          upcomingShifts: upcoming,
        });
      } else if (res?.data && (res.data as WorkScheduleData).schedule) {
        setData(res.data as WorkScheduleData);
      } else {
        setData(generateMockData(year, month));
      }
    } catch {
      setData(generateMockData(year, month));
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const calendarDays = useMemo(
    () => getCalendarDays(year, month),
    [year, month],
  );

  const prevMonth = useCallback(() => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
    setSelectedDate(null);
  }, [month]);

  const nextMonth = useCallback(() => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
    setSelectedDate(null);
  }, [month]);

  const selectedEvents = useMemo(() => {
    if (!selectedDate || !data) return [];
    return data.schedule[selectedDate] || [];
  }, [selectedDate, data]);

  // v17 anti-flicker: return null → visibility:hidden wrapper 로 변경 (unmount→mount 깜박임 제거)
  if (error) return <ErrorState onRetry={fetchData} />;

  const hidden = isLoading || !data;

  return (
    <div style={{ visibility: hidden ? "hidden" : "visible" }} aria-hidden={hidden}>
    {data && (
    <MobileContainer hasBottomNav>
      {/* Header — v4 통일성: rightAction 제거 → 시계/종/메뉴 3 액션 자동 노출.
          기존 "오늘" 액션은 월 네비게이션 행으로 이전하여 사용성 보존 */}
      <BackHeader title="근무 스케줄" />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-rink-900 !pb-8">
        {/* 캘린더 — flat 흰 섹션 (카드 박스 없음, 그리드 라인만). */}
        <section className="bg-it-surface px-3 pt-1 dark:bg-rink-800">
        {/* ── 월 네비게이션 (오늘 바로가기 포함) ── */}
        <div className="flex items-center justify-center gap-2 py-4 px-2">
          <button
            onClick={prevMonth}
            className="flex size-9 items-center justify-center rounded-w-pill hover:bg-it-fill dark:hover:bg-rink-700 transition-colors"
            aria-label="이전 달"
          >
            <Icon
              name="chevron_left"
              className="text-it-ink-600 dark:text-rink-100 text-xl"
            />
          </button>
          <h2 className="text-card-emphasis font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white min-w-[120px] text-center">
            {year}년 {month}월
          </h2>
          <button
            onClick={nextMonth}
            className="flex size-9 items-center justify-center rounded-w-pill hover:bg-it-fill dark:hover:bg-rink-700 transition-colors"
            aria-label="다음 달"
          >
            <Icon
              name="chevron_right"
              className="text-it-ink-600 dark:text-rink-100 text-xl"
            />
          </button>
          <button
            onClick={() => {
              const t = new Date();
              setYear(t.getFullYear());
              setMonth(t.getMonth() + 1);
              setSelectedDate(null);
            }}
            className="ml-2 px-3 py-1.5 rounded-w-pill border-[1.5px] border-it-line-strong dark:border-rink-700 text-card-meta font-semibold text-it-ink-600 dark:text-rink-100 hover:bg-it-fill dark:hover:bg-rink-700 transition-colors focus-visible:ring-2 focus-visible:ring-it-blue-500 focus:outline-none"
            aria-label="오늘 날짜로 이동"
          >
            오늘
          </button>
        </div>

        {/* ── 캘린더 ── */}
        <div>
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-1" role="row">
            {DAY_LABELS.map((d, i) => {
              const fullLabel = DAY_LABELS_FULL[i];
              return (
                <div
                  key={d}
                  role="columnheader"
                  aria-label={fullLabel}
                  className={cn(
                    "text-center text-card-meta font-semibold py-2",
                    colIsSunday(i)
                      ? "text-it-red-500"
                      : colIsSaturday(i)
                        ? "text-it-blue-500"
                        : "text-it-ink-400 dark:text-rink-300",
                  )}
                >
                  <span aria-hidden="true">{d}</span>
                </div>
              );
            })}
          </div>

          {/* 날짜 그리드 — 캘린더 표 그리드 (RULE-7 합법적 예외: 표/캘린더 셀 보더는 pipe-like 구분선이 아닌 그리드 라인) */}
          <div
            className="grid grid-cols-7 border-t border-l border-it-line dark:border-rink-700"
            role="grid"
            aria-label={`${year}년 ${month}월 근무 일정`}
          >
            {calendarDays.map((day, idx) => {
              const events = data.schedule[day.key] || [];
              const hasEvents = events.length > 0;
              const isSelected = selectedDate === day.key;
              const dayOfWeek = idx % 7;
              const dayName = DAY_LABELS_FULL[dayOfWeek];

              return (
                <button
                  type="button"
                  key={day.key}
                  onClick={() => day.isCurrentMonth && setSelectedDate(day.key)}
                  disabled={!day.isCurrentMonth}
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={day.isToday ? 'date' : undefined}
                  aria-disabled={!day.isCurrentMonth}
                  aria-label={day.isCurrentMonth ? `${year}년 ${month}월 ${day.date}일 ${dayName}${day.isToday ? ', 오늘' : ''}${hasEvents ? `, 일정 ${events.length}건` : ''}` : undefined}
                  className={cn(
                    "min-h-[72px] p-1.5 border-r border-b border-it-line dark:border-rink-700 text-left transition-colors focus-visible:ring-2 focus-visible:ring-it-blue-500 focus:outline-none",
                    day.isCurrentMonth
                      ? "bg-it-surface dark:bg-rink-800 hover:bg-it-fill dark:hover:bg-rink-700"
                      : "bg-it-fill dark:bg-rink-900/50",
                    day.isToday && "ring-2 ring-inset ring-it-blue-400",
                    isSelected && "bg-it-blue-50 dark:bg-it-blue-900/30",
                  )}
                >
                  <span
                    className={cn(
                      "text-card-meta font-medium block",
                      !day.isCurrentMonth &&
                        "text-it-ink-300 dark:text-rink-500",
                      day.isCurrentMonth &&
                        "text-it-ink-600 dark:text-rink-100",
                      day.isToday && "text-it-blue-500 font-bold",
                    )}
                  >
                    {day.date}
                  </span>
                  {hasEvents && day.isCurrentMonth && (
                    <div className="mt-0.5 space-y-0.5">
                      {events.slice(0, 2).map((ev) => (
                        <div
                          key={ev.id}
                          className={cn(
                            "text-card-meta leading-tight text-white px-1 py-0.5 rounded truncate",
                            EVENT_COLORS[ev.type] || "bg-it-blue-500",
                          )}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {events.length > 2 && (
                        <span className="text-card-meta text-it-ink-500 dark:text-rink-300">
                          +{events.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        </section>

        {/* ── 선택 날짜 일정 — full-bleed flat 섹션 (카드 박스 제거 → hairline 행) ── */}
        {selectedDate && (
          <section className="mt-2 bg-it-surface px-5 py-4 dark:bg-rink-800" aria-labelledby="selected-day-heading">
            <h3
              id="selected-day-heading"
              className="text-card-body font-bold text-it-ink-800 dark:text-white mb-1"
            >
              {selectedDate.replace(/-/g, ".")} 일정
            </h3>
            <p className="sr-only" aria-live="polite" aria-atomic="true">
              {selectedDate.replace(/-/g, ".")} 일정 {selectedEvents.length > 0 ? `${selectedEvents.length}건` : '없음'}
            </p>
            {selectedEvents.length === 0 ? (
              <div
                className="py-8 text-center"
                role="status"
              >
                <Icon
                  name="event_busy"
                  className="text-3xl text-it-ink-300 dark:text-rink-500 mb-2"
                  aria-hidden="true"
                />
                <p className="text-card-body text-it-ink-500 dark:text-rink-300">
                  등록된 일정이 없습니다
                </p>
              </div>
            ) : (
              <ul
                className="list-none divide-y divide-it-line dark:divide-rink-700"
                role="list"
                aria-label={`${selectedDate.replace(/-/g, ".")} 일정 목록`}
              >
                {selectedEvents.map((ev) => (
                  <li
                    key={ev.id}
                    role="listitem"
                    className="flex items-start gap-3 py-3"
                  >
                    <div
                      className={cn(
                        "w-1 h-full min-h-[40px] rounded-w-pill flex-shrink-0",
                        EVENT_COLORS[ev.type] || "bg-it-blue-500",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-card-body font-semibold text-it-ink-800 dark:text-white">
                        {ev.title}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-rink-300">
                          <Icon
                            name="schedule"
                            className="text-card-body"
                            aria-hidden="true"
                          />
                          {ev.time} - {ev.endTime}
                        </span>
                        <span className="flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-rink-300">
                          <Icon
                            name="location_on"
                            className="text-card-body"
                            aria-hidden="true"
                          />
                          {ev.location}
                        </span>
                      </div>
                      {ev.students > 0 && (
                        <span className="flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-rink-300 mt-1">
                          <Icon
                            name="group"
                            className="text-card-body"
                            aria-hidden="true"
                          />
                          {ev.students}명
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── 변경 요청 버튼 ── */}
        <div className="mt-2 bg-it-surface px-5 py-4 dark:bg-rink-800">
          <button
            onClick={() => setShowModal(true)}
            className="w-full py-3.5 bg-it-blue-500 hover:bg-it-blue-600 text-white font-semibold rounded-w-md transition-colors active:brightness-95 flex items-center justify-center gap-2"
          >
            <Icon name="edit_calendar" className="text-xl" aria-hidden="true" />
            근무 일정 변경 요청
          </button>
        </div>

        {/* ── 다가오는 근무 — full-bleed flat 섹션 (카드 박스 제거 → hairline 행) ── */}
        <section className="mt-2 bg-it-surface px-5 py-4 dark:bg-rink-800" aria-labelledby="upcoming-shifts-heading">
          <h3
            id="upcoming-shifts-heading"
            className="text-card-body font-bold text-it-ink-800 dark:text-white mb-1"
          >
            다가오는 근무
          </h3>
          <ul className="list-none divide-y divide-it-line dark:divide-rink-700" role="list" aria-label="다가오는 근무 목록">
            {data.upcomingShifts.map((ev) => (
              <li
                key={ev.id}
                role="listitem"
                className="py-3"
              >
                <p className="text-card-body font-semibold text-it-ink-800 dark:text-white">
                  {ev.title}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                  <span className="flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-rink-300">
                    <Icon
                      name="schedule"
                      className="text-card-body"
                      aria-hidden="true"
                    />
                    {ev.time} - {ev.endTime}
                  </span>
                  <span className="flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-rink-300">
                    <Icon
                      name="location_on"
                      className="text-card-body"
                      aria-hidden="true"
                    />
                    {ev.location}
                  </span>
                  {ev.students > 0 && (
                    <span className="flex items-center gap-1 text-card-meta text-it-ink-500 dark:text-rink-300">
                      <Icon
                        name="group"
                        className="text-card-body"
                        aria-hidden="true"
                      />
                      {ev.students}명
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 주간 통계 — full-bleed flat 섹션 (요약 stat 셀 it-fill 인셋) ── */}
        <section className="mt-2 bg-it-surface px-5 py-4 dark:bg-rink-800">
          <h3 className="text-card-body font-bold text-it-ink-800 dark:text-white mb-3">
            이번 주 근무 현황
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-it-fill dark:bg-rink-700 rounded-w-md p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon
                  name="timer"
                  className="text-it-blue-500 text-card-title"
                  aria-hidden="true"
                />
                <span className="text-2xl font-bold text-it-ink-800 dark:text-white tabular-nums">
                  {data.stats.totalHours}
                </span>
              </div>
              <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                총 근무 시간
              </p>
            </div>
            <div className="bg-it-fill dark:bg-rink-700 rounded-w-md p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Icon
                  name="event_available"
                  className="text-it-blue-500 text-card-title"
                  aria-hidden="true"
                />
                <span className="text-2xl font-bold text-it-ink-800 dark:text-white tabular-nums">
                  {data.stats.totalSessions}
                </span>
              </div>
              <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
                총 세션 수
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Modal */}
      <ChangeRequestModal
        open={showModal}
        onClose={() => setShowModal(false)}
      />
    </MobileContainer>
    )}
    </div>
  );
}
