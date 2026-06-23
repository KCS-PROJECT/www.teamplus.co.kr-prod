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
 * 매치 참가 신청 페이지
 * - 상단 장소 카드 (bg-wline-2 + 위치 아이콘)
 * - 포지션 선택 (MatchPositionPicker 3열 라디오 카드)
 * - 활성: border-2 border-ice-500 + 체크 아이콘
 * - 안내 메시지 (bg-wbg + 전체 border)
 * - 하단 고정: "선택 완료 및 참가하기" primary 버튼
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

      <main className="flex-1 overflow-y-auto hide-scrollbar px-5 pt-5 pb-52 space-y-5">
        {/* 장소 카드 */}
        <section className="bg-wline-2 dark:bg-rink-800 rounded-2xl overflow-hidden">
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-rink-700 flex items-center justify-center shrink-0">
                <Icon
                  name="location_on"
                  className="text-xl text-ice-500 dark:text-blue-400"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white truncate">
                  {match.title}
                </h2>
                <p className="mt-1 text-card-body text-wtext-2 dark:text-rink-100">
                  {match.rinkName}
                </p>
                {match.rinkAddress && (
                  <p className="mt-0.5 text-card-meta text-wtext-3 dark:text-rink-300">
                    {match.rinkAddress}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-card-body text-wtext-2 dark:text-rink-100">
              <span className="flex items-center gap-1.5">
                <Icon
                  name="calendar_month"
                  className="text-card-emphasis text-wtext-3 dark:text-rink-300"
                />
                {scheduleText}
              </span>
            </div>
          </div>
        </section>

        {/* 선호 포지션 선택 */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-5">
          <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-4">
            {MESSAGES.match.payment.preferredPosition}
          </h3>
          <MatchPositionPicker value={position} onChange={setPosition} />
        </section>

        {/* 신청 정보 */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-5 space-y-4">
          <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
            {MESSAGES.match.payment.sections.applicationInfo}
          </h3>

          <label className="block">
            <span className="text-card-body text-wtext-2 dark:text-rink-100">
              {MESSAGES.match.payment.level.label}
            </span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as LevelType)}
              className="mt-1 w-full h-11 px-3 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-900 text-card-body text-wtext-1 dark:text-white focus:border-ice-500 focus:ring-1 focus:ring-ice-500"
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
            <span className="text-card-body text-wtext-2 dark:text-rink-100">
              {MESSAGES.match.payment.note.label}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={MESSAGES.match.payment.note.placeholder}
              className="mt-1 w-full min-h-[88px] px-3 py-2 rounded-lg border border-wline dark:border-rink-700 bg-white dark:bg-rink-900 text-card-body text-wtext-1 dark:text-white resize-none focus:border-ice-500 focus:ring-1 focus:ring-ice-500"
            />
          </label>
        </section>

        {/* 안내 메시지 */}
        <section className="bg-wbg dark:bg-rink-800/60 rounded-xl border border-wline dark:border-rink-700 p-4">
          <h4 className="text-card-body font-bold text-wtext-1 dark:text-white mb-2">
            {MESSAGES.match.payment.notice.title}
          </h4>
          <ul className="space-y-1.5 text-card-meta text-wtext-2 dark:text-rink-100 leading-relaxed">
            {MESSAGES.match.payment.notice.items.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 w-1 h-1 rounded-w-pill bg-wtext-4 dark:bg-wbg0 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* 결제 금액 요약 */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-5">
          <MatchInfoRow
            icon="payments"
            label={MESSAGES.match.payment.basePrice}
            value={`${match.price.toLocaleString("ko-KR")}원`}
          />
          <div className="mt-3 pt-3 border-t border-wline-2 dark:border-rink-700 flex items-center justify-between">
            <span className="text-card-body font-bold text-wtext-1 dark:text-white">
              {MESSAGES.match.payment.total}
            </span>
            <span className="text-xl font-bold text-ice-500">
              {match.price.toLocaleString("ko-KR")}원
            </span>
          </div>
        </section>

        {submitError && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-900/20 px-4 py-3 text-card-body text-red-600 dark:text-red-400">
            {submitError}
          </div>
        )}
      </main>

      {/* 하단 CTA 고정 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-rink-900 border-t border-wline dark:border-rink-700 z-40">
        <div className="px-5 py-4 pb-8 w-full max-w-md mx-auto space-y-3">
          <label className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAgreed((prev) => !prev)}
              aria-pressed={agreed}
              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors motion-reduce:transition-none ${
                agreed
                  ? "bg-ice-500 border-ice-500"
                  : "border-wline dark:border-rink-700"
              }`}
            >
              {agreed && <Icon name="check" className="text-white text-card-body" />}
            </button>
            <span className="text-card-body text-wtext-2 dark:text-rink-100">
              {MESSAGES.match.payment.agree}
            </span>
          </label>

          <button
            type="button"
            onClick={handleApply}
            disabled={!agreed || processing || !position}
            className="w-full h-14 rounded-xl bg-ice-500 text-white text-card-emphasis font-bold disabled:bg-wline disabled:dark:bg-rink-700 disabled:text-wtext-3 hover:bg-ice-700 transition-colors motion-reduce:transition-none flex items-center justify-center gap-2"
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
