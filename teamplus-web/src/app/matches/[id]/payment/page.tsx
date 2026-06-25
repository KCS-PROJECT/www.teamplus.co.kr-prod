"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useNavigation } from "@/components/ui/NavLink";
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from "@/hooks/useNativeUI";
import { fetchMatchDetail, applyToMatch } from "@/services/matches-api";
import { MESSAGES } from "@/lib/messages";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import {
  MatchPositionPicker,
  MatchInfoRow,
  MatchErrorState,
} from "@/components/match";
import type { MatchPosition } from "@/components/match";
import type { MatchDetail } from "@/types/match";
import { usePageReady } from '@/hooks/usePageReady';

/**
 * 매치 참가 신청 페이지 (ICETIMES flat)
 * - 상단 장소 히어로 (navy 밴드 full-bleed)
 * - 포지션 선택 (MatchPositionPicker — 공유 컴포넌트)
 * - 폼/안내/금액 요약은 flat 흰 섹션(it-surface) + 8px 회색 갭
 * - 하단 고정: 동의 체크 + primary 버튼 (it-blue)
 */

type LevelType = "" | "입문" | "초급" | "중급" | "고급" | "상급" | "전문가";

export default function MatchPaymentPage() {
  const params = useParams();
  const matchId = (params?.id as string) ?? "";
  const { navigate, back } = useNavigation();
  // RULE-6: matches/layout.tsx 가 useRequireAuth() 단일 호출. 여기서는 isLoading 만 watch 해 데이터 페치 gate.
  const { isLoading: authLoading } = useSessionAuth();

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // v18 (2026-05-20, audit §4 cleanup): authLoading + loadingMatch 둘 다 종료 후 ready.
  // 결제 form 은 match 데이터(가격/제목)가 보여야 하므로 데이터 도착 전 hide 금지.
  usePageReady(!authLoading && !loadingMatch);

  const [position, setPosition] = useState<MatchPosition | "">("FW");
  const [level, setLevel] = useState<LevelType>("");
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // [appbar-team5-#7 · 2026-05-13] showAppBar:false — <PageAppBar forceNative/> 가 Native에서도 강제 렌더되어
  // Flutter Native AppBar 와 이중 노출 회귀. Web PageAppBar 단독 사용으로 통일 (4-action 헤더 의도 유지).
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: MESSAGES.match.payment.headerTitle,
    showBottomNav: false,
    showBackButton: true,
    onBackPress: () => back(),
  });

  const loadMatch = useCallback(async () => {
    setLoadingMatch(true);
    setLoadError(null);
    try {
      const data = await fetchMatchDetail(matchId);
      setMatch(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : MESSAGES.error.general);
    } finally {
      setLoadingMatch(false);
    }
  }, [matchId]);

  useEffect(() => {
    if (!matchId || authLoading) return;
    void loadMatch();
  }, [authLoading, loadMatch, matchId]);

  const scheduleText = useMemo(() => {
    if (!match?.scheduledAt) return "-";
    const d = new Date(match.scheduledAt);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }, [match?.scheduledAt]);

  const handleApply = async () => {
    if (!agreed || !matchId) return;
    setSubmitError(null);
    setProcessing(true);
    try {
      await applyToMatch(matchId, {
        position: position || undefined,
        level: level || undefined,
        note: note.trim() || undefined,
      });
      navigate(`/matches/${matchId}/roster`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : MESSAGES.error.network,
      );
    } finally {
      setProcessing(false);
    }
  };

  if (authLoading || loadingMatch) {
    return null;
  }

  if (loadError || !match) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar
          title={MESSAGES.match.payment.headerTitle}
          onBack={() => back()}
          forceNative
        />
        <MatchErrorState
          message={loadError ?? MESSAGES.error.general}
          onRetry={() => void loadMatch()}
          iceTheme
        />
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar
        title={MESSAGES.match.payment.headerTitle}
        onBack={() => back()}
        forceNative
      />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-52">
        {/* 장소 히어로 — navy 밴드 full-bleed */}
        <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-6 pb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-w-md bg-white/15 flex items-center justify-center shrink-0">
              <Icon
                name="location_on"
                className="text-xl text-white"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-card-emphasis font-bold text-white truncate">
                {match.title}
              </h2>
              <p className="mt-1 text-card-body text-white/85">
                {match.rinkName}
              </p>
              {match.rinkAddress && (
                <p className="mt-0.5 text-card-meta text-white/70">
                  {match.rinkAddress}
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-card-body text-white/85">
            <span className="flex items-center gap-1.5">
              <Icon
                name="calendar_month"
                className="text-card-emphasis text-white/70"
                aria-hidden="true"
              />
              {scheduleText}
            </span>
          </div>
        </section>

        {/* 선호 포지션 선택 — flat 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6">
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-4">
            {MESSAGES.match.payment.preferredPosition}
          </h3>
          <MatchPositionPicker value={position} onChange={setPosition} iceTheme />
        </section>

        {/* 신청 정보 — flat 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6 space-y-4">
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
            {MESSAGES.match.payment.sections.applicationInfo}
          </h3>

          <label className="block">
            <span className="text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
              {MESSAGES.match.payment.level.label}
            </span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as LevelType)}
              className="mt-2 w-full h-12 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-[15px] font-medium text-it-ink-800 dark:text-white outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 transition-colors duration-150 ease-ios motion-reduce:transition-none"
            >
              <option value="">{MESSAGES.match.payment.level.none}</option>
              {MESSAGES.match.payment.level.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-card-body font-semibold text-it-ink-700 dark:text-wtext-4">
              {MESSAGES.match.payment.note.label}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={MESSAGES.match.payment.note.placeholder}
              className="mt-2 w-full min-h-[88px] px-4 py-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 resize-none outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 transition-colors duration-150 ease-ios motion-reduce:transition-none"
            />
          </label>
        </section>

        {/* 안내 메시지 — flat 흰 섹션 (인셋 fill) */}
        <section className="mt-2 bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6">
          <div className="rounded-w-md bg-it-fill dark:bg-rink-900 p-4">
            <h4 className="text-card-body font-bold text-it-ink-800 dark:text-white mb-2">
              {MESSAGES.match.payment.notice.title}
            </h4>
            <ul className="space-y-1.5 text-card-meta text-it-ink-700 dark:text-wtext-4 leading-relaxed">
              {MESSAGES.match.payment.notice.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-w-pill bg-it-ink-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 결제 금액 요약 — flat 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6">
          <MatchInfoRow
            icon="payments"
            label={MESSAGES.match.payment.basePrice}
            value={`${match.price.toLocaleString("ko-KR")}원`}
            last
            iceTheme
          />
          <div className="mt-3 pt-3 border-t border-it-line dark:border-rink-700 flex items-center justify-between">
            <span className="text-card-body font-bold text-it-ink-800 dark:text-white">
              {MESSAGES.match.payment.total}
            </span>
            <span className="text-xl font-bold text-it-blue-500 tabular-nums">
              {match.price.toLocaleString("ko-KR")}원
            </span>
          </div>
        </section>

        {submitError && (
          <div className="mx-5 mt-2 rounded-w-md border-[1.5px] border-it-red-500/30 bg-it-red-500/10 px-4 py-3 text-card-body text-it-red-500">
            {submitError}
          </div>
        )}
      </main>

      {/* 하단 CTA 고정 */}
      <div className="fixed bottom-0 left-0 right-0 bg-it-surface dark:bg-rink-900 border-t border-it-line dark:border-rink-700 z-40">
        <div className="px-5 py-4 pb-8 w-full max-w-md mx-auto space-y-3">
          <label className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAgreed((prev) => !prev)}
              aria-pressed={agreed}
              className={`w-6 h-6 rounded-w-sm border-2 flex items-center justify-center transition-colors motion-reduce:transition-none ${
                agreed
                  ? "bg-it-blue-500 border-it-blue-500"
                  : "border-it-line-strong dark:border-rink-700"
              }`}
            >
              {agreed && <Icon name="check" className="text-white text-card-body" aria-hidden="true" />}
            </button>
            <span className="text-card-body text-it-ink-700 dark:text-wtext-4">
              {MESSAGES.match.payment.agree}
            </span>
          </label>

          <button
            type="button"
            onClick={handleApply}
            disabled={!agreed || processing || !position}
            className="w-full h-14 rounded-w-md bg-it-blue-500 text-white text-card-emphasis font-bold disabled:bg-it-line disabled:dark:bg-rink-700 disabled:text-it-ink-400 hover:bg-it-blue-600 transition-colors motion-reduce:transition-none flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <Icon
                  name="progress_activity"
                  className="animate-spin text-xl motion-reduce:animate-none"
                />
                {MESSAGES.match.payment.processing}
              </>
            ) : (
              <>
                {MESSAGES.match.payment.payBtn(match.price)}
                <Icon name="arrow_forward" className="text-card-title opacity-90" />
              </>
            )}
          </button>
        </div>
      </div>
    </MobileContainer>
  );
}
