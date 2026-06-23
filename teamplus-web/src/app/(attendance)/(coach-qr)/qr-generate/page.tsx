"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
// ⚡ qrcode.react(~12KB gzip) 는 dynamic import 로 지연 로드 — 초기 번들 감소
const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG })),
  { ssr: false },
);
import { Icon } from "@/components/ui/Icon";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useQrGenerate } from "@/hooks/useQrGenerate";
import { useNativeUI } from "@/hooks/useNativeUI";
import { usePageReady } from "@/hooks/usePageReady";
import { MESSAGES } from "@/lib/messages";
import { api } from "@/services/api-client";
import {
  ScheduleSelectSheet,
  getScheduleStatus,
  formatStartTime,
} from "@/components/attendance/ScheduleSelectSheet";

const GlobalMenu = dynamic(
  () =>
    import("@/components/layout/GlobalMenu").then((mod) => ({
      default: mod.GlobalMenu,
    })),
  { ssr: false },
);

export default function QRGeneratePage() {
  // [appbar-harness-v2] QR 발급 — Status bar + AppBar 명시.
  //   - 카메라 페이지가 아니라 단순 QR 표시 화면이므로 dark toneVariant 불필요.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '출석 체크',
    showBottomNav: true,
    showBackButton: true,
  });

  const { back } = useNavigation();
  // 출석확인 화면에서 진입 시 ?scheduleId= 로 해당 회차를 자동 선택.
  const searchParams = useSearchParams();
  const targetScheduleId = searchParams.get("scheduleId");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScheduleSheetOpen, setIsScheduleSheetOpen] = useState(false);

  const {
    schedules,
    selectedSchedule,
    selectSchedule,
    qr,
    generateQr,
    refreshQr,
    timeRemaining,
    isExpired,
    attendance,
    isLoadingSchedules,
    isGenerating,
    error,
  } = useQrGenerate();
  usePageReady(!isLoadingSchedules);

  // scheduleId 쿼리(출석확인 화면 진입)가 있으면 해당 회차를 확정 선택.
  //   1) 오늘 목록에 있으면 그걸 사용(추가 요청 없음).
  //   2) 없으면(미래 회차·UTC today 경계로 목록 누락) scheduleId 로 직접 조회해 선택.
  //      → "오늘 목록"에 의존하지 않으므로 어떤 회차로 진입해도 정확히 그 수업 QR 생성.
  useEffect(() => {
    if (!targetScheduleId || selectedSchedule || isLoadingSchedules) return;
    const found = schedules.find((s) => s.scheduleId === targetScheduleId);
    if (found) {
      selectSchedule(found);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await api.get<{
        scheduleId: string;
        classId: string;
        className: string;
        scheduleStartTime?: string | null;
      }>(`/attendance/schedule/${targetScheduleId}/roster`);
      if (cancelled || !res.success || !res.data) return;
      selectSchedule({
        scheduleId: res.data.scheduleId,
        classId: res.data.classId,
        className: res.data.className,
        startTime: res.data.scheduleStartTime ?? "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    targetScheduleId,
    schedules,
    selectedSchedule,
    isLoadingSchedules,
    selectSchedule,
  ]);

  // 수업 선택 시 자동 QR 생성 (error 존재 시 무한 재시도 방지)
  useEffect(() => {
    if (selectedSchedule && !qr && !isGenerating && !error) {
      generateQr();
    }
  }, [selectedSchedule, qr, isGenerating, error, generateQr]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 타이머 색상
  const getTimerColor = () => {
    if (isExpired || timeRemaining <= 0)
      return "text-red-600 dark:text-red-400";
    if (timeRemaining < 60) return "text-red-600 dark:text-red-400";
    if (timeRemaining < 120) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
  };

  const getTimerBg = () => {
    if (isExpired || timeRemaining <= 0) return "bg-red-50 dark:bg-red-900/20";
    if (timeRemaining < 60) return "bg-red-50 dark:bg-red-900/20";
    if (timeRemaining < 120) return "bg-amber-50 dark:bg-amber-900/20";
    return "bg-emerald-50 dark:bg-emerald-900/20";
  };

  return (
    <MobileContainer hasBottomNav={true} className="selectable-text">
      <div className="relative w-full flex flex-col flex-1 min-h-0">
        <PageAppBar title="출석 체크" />

        {/* Main Scrollable Content */}
        <main className="flex-1 flex flex-col px-6 overflow-y-auto pb-6">
          {/* 수업 선택 */}
          <div className="pt-1 pb-3">
            {isLoadingSchedules ? null : schedules.length === 0 &&
              !selectedSchedule &&
              !targetScheduleId ? (
              <div className="flex flex-col items-center justify-center text-center py-10">
                <div className="w-14 h-14 rounded-2xl bg-wline-2 dark:bg-rink-800 flex items-center justify-center mb-3">
                  <Icon
                    name="event_busy"
                    className="text-3xl text-wtext-4 dark:text-rink-500"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                  {MESSAGES.attendance.noScheduleToday}
                </p>
              </div>
            ) : selectedSchedule ? (
              targetScheduleId ? (
                // scheduleId 진입(출석확인→QR 생성) — 수업이 이미 확정이므로 수업명·시간 한 줄만.
                <div className="flex items-baseline gap-2 px-1 pb-1">
                  <h2 className="text-card-title font-extrabold text-wtext-1 dark:text-white truncate">
                    {selectedSchedule.className}
                  </h2>
                  {formatStartTime(selectedSchedule.startTime) && (
                    <span className="text-card-body text-wtext-3 dark:text-rink-300 tabular-nums shrink-0">
                      {formatStartTime(selectedSchedule.startTime)}
                    </span>
                  )}
                </div>
              ) : (
              // 선택된 수업 카드 (수업명 · 시간 · 진행상태 · 바꾸기 버튼)
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-rink-800 shadow-md border border-wline-2 dark:border-rink-700">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ice-500 text-white">
                  <Icon
                    name="sports_hockey"
                    className="text-2xl"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-card-title font-extrabold text-wtext-1 dark:text-white truncate">
                      {selectedSchedule.className}
                    </h2>
                    {formatStartTime(selectedSchedule.startTime) && (
                      <span className="text-card-body text-wtext-3 dark:text-rink-300 tabular-nums shrink-0">
                        {formatStartTime(selectedSchedule.startTime)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    {(() => {
                      const status = getScheduleStatus(
                        selectedSchedule.startTime,
                      );
                      return (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-w-pill ${
                            status === "ongoing"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-wline text-wtext-2 dark:bg-rink-700 dark:text-rink-100"
                          }`}
                        >
                          {status === "ongoing" && (
                            <span
                              className="w-1.5 h-1.5 rounded-w-pill bg-emerald-500 animate-pulse motion-reduce:animate-none"
                              aria-hidden="true"
                            />
                          )}
                          {status === "ongoing"
                            ? MESSAGES.attendance.statusOngoing
                            : MESSAGES.attendance.statusUpcoming}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {schedules.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIsScheduleSheetOpen(true)}
                    className="shrink-0 min-h-[44px] px-4 py-2 rounded-xl text-card-body font-semibold bg-wline-2 hover:bg-wline dark:bg-rink-700 dark:hover:bg-rink-500 text-wtext-2 dark:text-rink-100 transition-colors motion-reduce:transition-none active:brightness-95"
                    aria-label={MESSAGES.attendance.selectClass}
                  >
                    {MESSAGES.attendance.changeClass}
                  </button>
                )}
              </div>
              )
            ) : targetScheduleId ? null : (
              // 수업이 여러 개인데 아직 선택 안 된 경우 (수업 2개+, 자동 선택 전)
              <button
                type="button"
                onClick={() => setIsScheduleSheetOpen(true)}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-rink-800 shadow-md border border-dashed border-wline dark:border-rink-700 hover:border-ice-500 hover:bg-ice-500/5 transition-colors motion-reduce:transition-none"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-wline-2 dark:bg-rink-700">
                    <Icon
                      name="event"
                      className="text-2xl text-wtext-3 dark:text-rink-300"
                      aria-hidden="true"
                    />
                  </div>
                  <span className="font-semibold text-wtext-2 dark:text-rink-100">
                    {MESSAGES.attendance.selectSchedule}
                  </span>
                </div>
                <Icon
                  name="arrow_forward_ios"
                  className="text-wtext-3 text-card-emphasis"
                  aria-hidden="true"
                />
              </button>
            )}
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div
              className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 flex items-start gap-2"
              role="alert"
            >
              <Icon
                name="error_outline"
                className="text-red-600 dark:text-red-400 text-card-title shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-card-body text-red-700 dark:text-red-400 font-medium">
                {error}
              </p>
            </div>
          )}

          {/* QR 카드 */}
          {selectedSchedule && (
            <div className="flex flex-col mb-4">
              <div className="bg-white dark:bg-rink-800 rounded-3xl shadow-md overflow-hidden flex flex-col items-center relative">
                {/* QR 코드 영역 */}
                <div className="w-full p-8 pb-6 flex flex-col items-center justify-center bg-white dark:bg-rink-800 relative z-0">
                  <div className="relative w-64 h-64 bg-white dark:bg-rink-700 p-2 rounded-xl border border-wline-2 dark:border-rink-700 shadow-inner flex items-center justify-center">
                    {isGenerating ? (
                      <div
                        className="flex flex-col items-center gap-3"
                        role="status"
                        aria-label="QR 코드 생성 중"
                      >
                        <div className="w-8 h-8 border-[3px] border-ice-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
                        <span className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                          생성 중...
                        </span>
                      </div>
                    ) : qr ? (
                      <>
                        <QRCodeSVG
                          value={qr.qrData}
                          size={232}
                          level="M"
                          bgColor="transparent"
                          fgColor="currentColor"
                          className="text-wtext-1 dark:text-white"
                          aria-label="출석 체크 QR 코드"
                        />
                        {/* 만료 오버레이 */}
                        {isExpired && (
                          <div
                            className="absolute inset-0 bg-rink-900/70 dark:bg-rink-900/85 rounded-xl flex flex-col items-center justify-center gap-3"
                            role="alert"
                          >
                            <Icon
                              name="timer_off"
                              className="text-4xl text-white"
                              aria-hidden="true"
                            />
                            <span className="text-white font-bold text-card-title">
                              만료됨
                            </span>
                            <button
                              type="button"
                              onClick={refreshQr}
                              className="mt-1 min-h-[40px] px-5 py-2 bg-white text-ice-500 rounded-xl font-bold text-card-body hover:bg-wline-2 transition-colors motion-reduce:transition-none active:brightness-95"
                            >
                              QR 재생성
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-center">
                        <Icon
                          name="qr_code_2"
                          className="text-5xl text-wtext-4 dark:text-rink-300"
                          aria-hidden="true"
                        />
                        <span className="text-card-body text-wtext-3 dark:text-rink-300 font-medium">
                          QR 코드 대기 중
                        </span>
                      </div>
                    )}

                    {/* 코너 악센트 — RULE-7 합법적 예외: L자 코너 마커는 pipe-like 구분선이 아님 */}
                    <div
                      className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-ice-500 rounded-tl-lg"
                      aria-hidden="true"
                    />
                    <div
                      className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-ice-500 rounded-tr-lg"
                      aria-hidden="true"
                    />
                    <div
                      className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-ice-500 rounded-bl-lg"
                      aria-hidden="true"
                    />
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-ice-500 rounded-br-lg"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {/* 티켓 구분선 */}
                <div className="w-full relative flex items-center justify-center bg-white dark:bg-rink-800">
                  <div className="absolute left-0 w-5 h-5 bg-wbg dark:bg-rink-900 rounded-w-pill -translate-x-1/2" />
                  <div className="w-[85%] border-t-2 border-dashed border-wline dark:border-rink-700" />
                  <div className="absolute right-0 w-5 h-5 bg-wbg dark:bg-rink-900 rounded-w-pill translate-x-1/2" />
                </div>

                {/* 타이머 + 새로고침 */}
                <div className="w-full p-6 pt-6 flex flex-col gap-3 items-center bg-white dark:bg-rink-800">
                  {qr && (
                    <div
                      className={`flex items-center gap-2 px-5 py-3 rounded-xl w-full justify-center ${getTimerBg()}`}
                      role="timer"
                      aria-label={`QR 코드 ${isExpired ? "만료됨" : `${formatTime(timeRemaining)} 남음`}`}
                    >
                      <Icon
                        name={isExpired ? "timer_off" : "timer"}
                        className={`text-xl ${getTimerColor()} ${!isExpired && timeRemaining > 0 ? "animate-pulse motion-reduce:animate-none" : ""}`}
                        aria-hidden="true"
                      />
                      <span
                        className={`font-bold text-card-title tabular-nums tracking-wide ${getTimerColor()}`}
                      >
                        {formatTime(timeRemaining)}
                      </span>
                      <span
                        className={`text-card-meta font-medium ml-1 opacity-70 ${getTimerColor()}`}
                      >
                        {isExpired ? "만료됨" : "남음"}
                      </span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={refreshQr}
                    disabled={isGenerating}
                    aria-label="QR 코드 새로 생성"
                    className="group w-full flex items-center justify-center gap-2 min-h-[52px] h-14 rounded-xl bg-ice-500 hover:bg-ice-700 text-white transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50 shadow-md"
                  >
                    {isGenerating ? (
                      <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-w-pill animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Icon
                        name="refresh"
                        className="text-white group-hover:rotate-180 transition-transform motion-reduce:transition-none duration-500"
                        aria-hidden="true"
                      />
                    )}
                    <span className="font-bold text-card-emphasis !text-white">
                      {isGenerating ? "생성 중..." : "QR 새로 생성"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 하단 출석 현황 */}
        {selectedSchedule && qr && (
          <footer className="bg-white dark:bg-rink-800 px-6 py-5 pb-5 rounded-t-3xl shadow-md border-t border-wline-2 dark:border-rink-700 shrink-0 z-20">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-wtext-3 dark:text-rink-300 text-[11px] font-bold uppercase tracking-wider mb-1">
                    출석 현황
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-wtext-1 dark:text-white tabular-nums">
                      {attendance.current}
                    </span>
                    <span className="text-card-title text-wtext-3 dark:text-rink-300 font-medium">
                      / {attendance.total}명
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 text-card-meta font-bold text-ice-500 dark:text-blue-300 bg-ice-500/10 dark:bg-blue-900/30 px-2.5 py-1 rounded-w-pill">
                    {Math.round(attendance.percentage)}% 완료
                  </span>
                </div>
              </div>

              {/* 프로그레스 바 */}
              <div
                className="relative w-full h-3 bg-wline-2 dark:bg-rink-700 rounded-w-pill overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(attendance.percentage)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`출석 완료율 ${Math.round(attendance.percentage)}%`}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-ice-500 rounded-w-pill transition-all motion-reduce:transition-none duration-1000 ease-out"
                  style={{ width: `${Math.min(attendance.percentage, 100)}%` }}
                />
              </div>
              <p className="text-center text-card-meta text-wtext-3 dark:text-rink-300">
                10초마다 자동 업데이트됩니다
              </p>
            </div>
          </footer>
        )}
      </div>
      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      <ScheduleSelectSheet
        isOpen={isScheduleSheetOpen}
        onClose={() => setIsScheduleSheetOpen(false)}
        schedules={schedules}
        selectedScheduleId={selectedSchedule?.scheduleId}
        onSelect={(schedule) => selectSchedule(schedule)}
      />
    </MobileContainer>
  );
}
