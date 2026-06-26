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

  // 타이머 색상 (ICETIMES flat — 잔여 시간 단계별 강조: 위급=it-red · 주의=amber · 여유=emerald)
  const getTimerColor = () => {
    if (isExpired || timeRemaining <= 0)
      return "text-it-red-500 dark:text-it-red-300";
    if (timeRemaining < 60) return "text-it-red-500 dark:text-it-red-300";
    if (timeRemaining < 120) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
  };

  const getTimerBg = () => {
    if (isExpired || timeRemaining <= 0)
      return "bg-it-red-50 dark:bg-it-red-500/15";
    if (timeRemaining < 60) return "bg-it-red-50 dark:bg-it-red-500/15";
    if (timeRemaining < 120) return "bg-amber-50 dark:bg-amber-900/20";
    return "bg-emerald-50 dark:bg-emerald-900/20";
  };

  return (
    <MobileContainer hasBottomNav={true} className="selectable-text">
      <div className="relative w-full flex flex-col flex-1 min-h-0">
        <PageAppBar title="출석 체크" />

        {/* Main Scrollable Content — ICETIMES flat (회색 캔버스 + full-bleed 흰 섹션) */}
        <main className="flex-1 flex flex-col overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
          {/* Hero — navy 밴드 full-bleed (수업 선택/요약) */}
          <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-5 pb-6 text-white">
            <div className="text-card-meta font-extrabold tracking-[0.08em] text-it-blue-100/90">
              ATTENDANCE
            </div>
            {isLoadingSchedules ? null : schedules.length === 0 &&
              !selectedSchedule &&
              !targetScheduleId ? (
              <div className="mt-3 flex items-center gap-2.5">
                <Icon
                  name="event_busy"
                  className="text-2xl text-it-blue-100/80"
                  aria-hidden="true"
                />
                <p className="text-card-body font-semibold text-it-blue-100">
                  {MESSAGES.attendance.noScheduleToday}
                </p>
              </div>
            ) : selectedSchedule ? (
              // 선택된 수업 요약 (수업명 · 시간 · 진행상태 · 바꾸기)
              <div className="mt-2 flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-card-section font-extrabold tracking-tight break-keep text-white truncate">
                    {selectedSchedule.className}
                  </h1>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {formatStartTime(selectedSchedule.startTime) && (
                      <span className="text-card-body font-num text-it-blue-100 tabular-nums">
                        {formatStartTime(selectedSchedule.startTime)}
                      </span>
                    )}
                    {(() => {
                      const status = getScheduleStatus(
                        selectedSchedule.startTime,
                      );
                      return (
                        <span
                          className={`inline-flex items-center gap-1 text-card-meta font-extrabold px-2 py-0.5 rounded-w-pill ${
                            status === "ongoing"
                              ? "bg-emerald-500/20 text-emerald-100"
                              : "bg-it-blue-900/50 text-it-blue-100"
                          }`}
                        >
                          {status === "ongoing" && (
                            <span
                              className="w-1.5 h-1.5 rounded-w-pill bg-emerald-400 animate-pulse motion-reduce:animate-none"
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
                {!targetScheduleId && schedules.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIsScheduleSheetOpen(true)}
                    className="shrink-0 min-h-[40px] px-4 py-2 rounded-w-md text-card-meta font-bold bg-white/15 hover:bg-white/25 text-white transition-colors motion-reduce:transition-none active:brightness-95"
                    aria-label={MESSAGES.attendance.selectClass}
                  >
                    {MESSAGES.attendance.changeClass}
                  </button>
                )}
              </div>
            ) : targetScheduleId ? null : (
              // 수업이 여러 개인데 아직 선택 안 된 경우 (수업 2개+, 자동 선택 전)
              <button
                type="button"
                onClick={() => setIsScheduleSheetOpen(true)}
                className="mt-3 w-full flex items-center justify-between gap-3 rounded-w-md bg-white/10 hover:bg-white/15 px-4 py-3.5 transition-colors motion-reduce:transition-none active:brightness-95"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    name="event"
                    className="text-2xl text-it-blue-100 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="font-semibold text-white truncate">
                    {MESSAGES.attendance.selectSchedule}
                  </span>
                </div>
                <Icon
                  name="chevron_right"
                  className="text-it-blue-100 text-card-title shrink-0"
                  aria-hidden="true"
                />
              </button>
            )}
          </section>

          {/* 에러 메시지 — 흰 섹션 hairline 행 */}
          {error && (
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
              <div
                className="flex items-start gap-2 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 px-3.5 py-3"
                role="alert"
              >
                <Icon
                  name="error_outline"
                  className="text-it-red-500 dark:text-it-red-300 text-card-title shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-card-body text-it-red-600 dark:text-it-red-300 font-medium">
                  {error}
                </p>
              </div>
            </section>
          )}

          {/* QR 코드 섹션 — 흰 섹션(카드 박스 제거). QR 이미지/코너마커/티켓 절취선은 비주얼 결과물이라 골격 유지. */}
          {selectedSchedule && (
            <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-6 pb-2 flex flex-col items-center">
              {/* QR 코드 영역 — 흰 박스 + 코너 마커(비주얼 동결, 색만 it-blue 정합) */}
              <div className="relative w-64 h-64 bg-white dark:bg-rink-700 p-2 rounded-w-md border border-it-line-strong dark:border-rink-700 shadow-inner flex items-center justify-center">
                {isGenerating ? (
                  <div
                    className="flex flex-col items-center gap-3"
                    role="status"
                    aria-label="QR 코드 생성 중"
                  >
                    <div className="w-8 h-8 border-[3px] border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
                    <span className="text-card-body text-it-ink-500 dark:text-rink-300 font-medium">
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
                      className="text-it-ink-900 dark:text-white"
                      aria-label="출석 체크 QR 코드"
                    />
                    {/* 만료 오버레이 */}
                    {isExpired && (
                      <div
                        className="absolute inset-0 bg-it-blue-950/75 dark:bg-puck/85 rounded-w-md flex flex-col items-center justify-center gap-3"
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
                          className="mt-1 min-h-[40px] px-5 py-2 bg-white text-it-blue-500 rounded-w-md font-bold text-card-body hover:bg-it-fill transition-colors motion-reduce:transition-none active:brightness-95"
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
                      className="text-5xl text-it-ink-300 dark:text-rink-300"
                      aria-hidden="true"
                    />
                    <span className="text-card-body text-it-ink-500 dark:text-rink-300 font-medium">
                      QR 코드 대기 중
                    </span>
                  </div>
                )}

                {/* 코너 악센트 — RULE-7 합법적 예외: L자 코너 마커는 pipe-like 구분선이 아님 */}
                <div
                  className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-it-blue-500 rounded-tl-lg"
                  aria-hidden="true"
                />
                <div
                  className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-it-blue-500 rounded-tr-lg"
                  aria-hidden="true"
                />
                <div
                  className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-it-blue-500 rounded-bl-lg"
                  aria-hidden="true"
                />
                <div
                  className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-it-blue-500 rounded-br-lg"
                  aria-hidden="true"
                />
              </div>

              {/* 타이머 + 새로고침 */}
              <div className="w-full mt-6 flex flex-col gap-3 items-center">
                {qr && (
                  <div
                    className={`flex items-center gap-2 px-5 py-3 rounded-w-md w-full justify-center ${getTimerBg()}`}
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
                  className="group w-full flex items-center justify-center gap-2 min-h-[52px] h-14 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white transition-colors motion-reduce:transition-none active:brightness-95 disabled:opacity-50"
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
            </section>
          )}
        </main>

        {/* 하단 출석 현황 — 흰 섹션 hairline 상단 구분 */}
        {selectedSchedule && qr && (
          <footer className="bg-it-surface dark:bg-it-blue-950 px-5 py-5 border-t border-it-line dark:border-rink-700 shrink-0 z-20">
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-it-ink-500 dark:text-rink-300 text-card-meta font-bold uppercase tracking-wider mb-1">
                    출석 현황
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold font-num text-it-ink-800 dark:text-white tabular-nums">
                      {attendance.current}
                    </span>
                    <span className="text-card-title text-it-ink-500 dark:text-rink-300 font-medium">
                      / {attendance.total}명
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 text-card-meta font-bold text-it-blue-500 dark:text-it-blue-200 bg-it-blue-50 dark:bg-it-blue-500/20 px-2.5 py-1 rounded-w-pill">
                    {Math.round(attendance.percentage)}% 완료
                  </span>
                </div>
              </div>

              {/* 프로그레스 바 */}
              <div
                className="relative w-full h-3 bg-it-line dark:bg-rink-700 rounded-w-pill overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(attendance.percentage)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`출석 완료율 ${Math.round(attendance.percentage)}%`}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-it-blue-500 rounded-w-pill transition-all motion-reduce:transition-none duration-1000 ease-out"
                  style={{ width: `${Math.min(attendance.percentage, 100)}%` }}
                />
              </div>
              <p className="text-center text-card-meta text-it-ink-500 dark:text-rink-300">
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
