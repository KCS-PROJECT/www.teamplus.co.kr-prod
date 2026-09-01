"use client";

/**
 * /tournaments/[id]/students — 대회 참가 선수 명단·정산 관리 (감독/코치 전용).
 *
 * 대회 상세(/tournaments/[id])의 참가자·정산 섹션을 분리한 관리 페이지.
 * 수업 축(/classes/[id]/students)과 동형 골격 — 요약 → 필터 칩 → 명단 행 → 정산 액션.
 *  · 선불 대회: 읽기전용 결제 현황(5-state 칩).
 *  · 후불 대회: 정산 전(UNPAID) 체크박스 일괄 결제요청 + PENDING 행 단위 금액 수정.
 *  · 비관리자 진입 시 대회 상세로 replace — 서버 API 도 관리 팀 가드로 이중 방어.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePageReady } from "@/hooks/usePageReady";
import { cn } from "@/lib/utils";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toast";
import { useNativeUI } from "@/hooks/useNativeUI";
import { MESSAGES } from "@/lib/messages";
import { useModal } from "@/components/ui/Modal";
import {
  canManageMatch,
  cancelTournamentSettlement,
  confirmTournamentSettlement,
  getTournament,
  listTournamentRegistrations,
  type TournamentDetail,
  type TournamentRegistrationRow,
} from "@/services/tournament.service";

// 후불 결제요청 활성화 대기 — 경기 시간이 30분~1시간이라 마지막 경기 시작 +1시간부터 종료로 본다.
const SETTLE_OPEN_DELAY_MS = 60 * 60 * 1000;

// 5-state·결제방식 배지 — 수업 축(classes/[id]/students) TIMING_META/ROW_STATUS_META
//   값·토큰·MESSAGES 라벨을 동일 재사용(단일 SoT). 대회는 BOTH/UNASSIGNED 없음.
type TournamentBillingStatus =
  | "UNSETTLED"
  | "BILLED"
  | "PAID"
  | "CANCELLED"
  | "REFUNDED";
type TournamentBillingTiming = "PREPAID" | "POSTPAID";

const ROW_STATUS_META: Record<
  TournamentBillingStatus,
  { label: string; chip: string; dot: string }
> = {
  PAID: {
    label: MESSAGES.settlement.rowStatusPaid,
    chip: "bg-mint-100 text-rink-800 dark:bg-mint-500/20 dark:text-mint-100",
    dot: "bg-mint-500",
  },
  BILLED: {
    label: MESSAGES.settlement.rowStatusBilled,
    chip: "bg-ice-500/10 text-ice-500 dark:bg-ice-500/20 dark:text-ice-100",
    dot: "bg-ice-500",
  },
  UNSETTLED: {
    label: MESSAGES.settlement.rowStatusUnsettled,
    chip: "bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100",
    dot: "bg-wtext-3",
  },
  CANCELLED: {
    label: MESSAGES.settlement.rowStatusCancelled,
    chip: "bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300",
    dot: "bg-wtext-4",
  },
  REFUNDED: {
    label: MESSAGES.settlement.rowStatusRefunded,
    chip: "bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300",
    dot: "bg-wtext-4",
  },
};

const TIMING_META: Record<
  TournamentBillingTiming,
  { label: string; cls: string }
> = {
  PREPAID: {
    label: MESSAGES.settlement.prepaid,
    cls: "bg-ice-500/10 text-ice-500 dark:bg-ice-500/15 dark:text-ice-100",
  },
  POSTPAID: {
    label: MESSAGES.settlement.postpaid,
    cls: "bg-sun-500/15 text-rink-800 dark:bg-sun-500/20 dark:text-sun-100",
  },
};

type PayFilter = "all" | "outstanding" | "paid";

// 행 5-state·결제방식 해석 — BE Dual Emit 우선, 미제공 시 레거시 paymentStatus·대회 모드 폴백.
function rowStatusOf(r: TournamentRegistrationRow): TournamentBillingStatus {
  return (
    r.billingStatus ??
    (r.paymentStatus === "PAID"
      ? "PAID"
      : r.paymentStatus === "PENDING"
        ? "BILLED"
        : r.paymentStatus === "CANCELLED"
          ? "CANCELLED"
          : r.paymentStatus === "REFUNDED"
            ? "REFUNDED"
            : "UNSETTLED")
  );
}

// 표시 금액 — 완납=결제 금액 / 청구=청구 금액. BE 파생 우선, 미제공 시 폴백.
function rowFeeOf(r: TournamentRegistrationRow): number {
  return r.billedAmount != null
    ? Number(r.billedAmount)
    : r.paidAmount != null && r.paidAmount > 0
      ? Number(r.paidAmount)
      : r.calculatedFee != null
        ? Number(r.calculatedFee)
        : r.payment?.amount != null
          ? Number(r.payment.amount)
          : 0;
}

function nameOf(r: TournamentRegistrationRow): string {
  return r.child
    ? `${r.child.lastName ?? ""}${r.child.firstName ?? ""}`.trim() ||
        MESSAGES.tournament.participantNameUnknown
    : `${r.user?.lastName ?? ""}${r.user?.firstName ?? ""}`.trim() ||
        MESSAGES.tournament.participantNameUnknown;
}

export default function TournamentStudentsPage() {
  const { user } = useSessionAuth();
  const params = useParams();
  const { replace } = useNavigation();
  const { toast } = useToast();
  const { modal } = useModal();
  const isManager = canManageMatch(user?.userType);
  const id = (params?.id ?? "") as string;

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [regRows, setRegRows] = useState<TournamentRegistrationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [payFilter, setPayFilter] = useState<PayFilter>("all");

  // 후불 정산 모달 — 1인당 참가비 입력 + 대상 인원 미리보기.
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleFee, setSettleFee] = useState("");
  const [settleTargetCount, setSettleTargetCount] = useState<number | null>(
    null,
  );
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  // 선택 결제요청 — 체크한 등록(registrationId)에게만 청구. 정산 전(UNPAID)만 체크 대상
  //   (PENDING 재청구는 행 단위 "금액 수정"으로 분리 — 반복 결제요청 방지).
  const [selectedRegIds, setSelectedRegIds] = useState<Set<string>>(new Set());
  // 정산 모달의 실제 청구 대상 — 결제요청(선택 목록) / 금액 수정(단건) 공용.
  const [settleTargetIds, setSettleTargetIds] = useState<string[]>([]);

  usePageReady(!isLoading);
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    showBackButton: true,
  });

  // 비관리자 — 공용 조회 화면(대회 상세)으로 회수.
  useEffect(() => {
    if (user && !isManager && id) {
      void replace(`/tournaments/${encodeURIComponent(id)}`);
    }
  }, [user, isManager, id, replace]);

  const load = useCallback(async () => {
    if (!id) return;
    // 예약어 가드 — 상세 페이지와 동일(존재하지 않는 ID API 호출 차단).
    const RESERVED_IDS = ["create", "new", "edit"];
    if (RESERVED_IDS.includes(id)) {
      void replace("/tournaments");
      return;
    }
    setIsLoading(true);
    const [tRes, rRes] = await Promise.all([
      getTournament(id),
      listTournamentRegistrations(id),
    ]);
    if (tRes.success && tRes.data) {
      setTournament(tRes.data);
    } else {
      toast.error(tRes.error?.message ?? MESSAGES.error.general);
    }
    setRegRows(rRes.success && rRes.data ? (rRes.data.registrations ?? []) : []);
    setIsLoading(false);
  }, [id, replace, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // 참가선수목록 로드/갱신 시 정산 전(UNPAID) 대상만 기본 전체 선택.
  //   PENDING(결제 대기)은 기본 제외 — 이미 요청된 건의 반복 발송 방지.
  useEffect(() => {
    const payable = regRows
      .filter((r) => r.paymentStatus === "UNPAID")
      .map((r) => r.id);
    setSelectedRegIds(new Set(payable));
  }, [regRows]);

  const toggleRegSelection = useCallback((regId: string) => {
    setSelectedRegIds((prev) => {
      const next = new Set(prev);
      if (next.has(regId)) next.delete(regId);
      else next.add(regId);
      return next;
    });
  }, []);

  const openSettlement = useCallback(() => {
    // 감독이 대회 생성 시 입력한 참고 예상 금액(feePerGame)을 기본값으로 프리필.
    const prefill =
      tournament?.feePerGame != null ? Number(tournament.feePerGame) : 0;
    setSettleFee(Number.isFinite(prefill) && prefill > 0 ? String(prefill) : "");
    setSettleTargetIds([...selectedRegIds]);
    setSettleTargetCount(selectedRegIds.size);
    setSettleOpen(true);
  }, [selectedRegIds, tournament]);

  // PENDING(결제 대기) 단건 금액 수정 — 현재 청구액 프리필, 해당 등록 1건만 재청구.
  const openAmountEdit = useCallback(
    (row: TournamentRegistrationRow) => {
      const current = row.calculatedFee != null ? Number(row.calculatedFee) : 0;
      const prefill =
        Number.isFinite(current) && current > 0
          ? current
          : tournament?.feePerGame != null
            ? Number(tournament.feePerGame)
            : 0;
      setSettleFee(prefill > 0 ? String(prefill) : "");
      setSettleTargetIds([row.id]);
      setSettleTargetCount(1);
      setSettleOpen(true);
    },
    [tournament],
  );

  const handleConfirmSettlement = useCallback(async () => {
    const fee = Number(settleFee);
    if (!Number.isFinite(fee) || fee < 1) {
      toast.error(MESSAGES.tournament.settleFeeRequired);
      return;
    }
    if (!settleTargetCount || settleTargetCount < 1) {
      toast.error(MESSAGES.tournament.settleNoTarget);
      return;
    }
    setSettleSubmitting(true);
    const res = await confirmTournamentSettlement(id, fee, settleTargetIds);
    setSettleSubmitting(false);
    if (res.success && res.data) {
      toast.success(
        MESSAGES.tournament.settleSuccess(
          res.data.billedCount,
          res.data.totalAmount,
        ),
      );
      setSettleOpen(false);
      void load();
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.general);
    }
  }, [id, settleFee, settleTargetCount, settleTargetIds, toast, load]);

  // 결제요청 취소 — 정산(결제요청)으로 청구한 미결제 건을 UNPAID 로 환원.
  const handleCancelSettlement = useCallback(async () => {
    const ok = await modal.confirm({
      title: "결제요청 취소",
      message:
        "참가자에게 보낸 결제 요청을 취소하시겠습니까?\n결제 완료된 건은 취소되지 않습니다.",
      confirmText: "결제요청 취소",
      cancelText: "닫기",
      variant: "danger",
    });
    if (!ok) return;
    const res = await cancelTournamentSettlement(id);
    if (res.success && res.data) {
      toast.success(`결제 요청이 취소되었습니다. (${res.data.revertedCount}명)`);
      void load();
    } else {
      toast.error(res.error?.message ?? MESSAGES.error.general);
    }
  }, [id, modal, toast, load]);

  const isPostpaid = tournament?.billingMode === "POSTPAID";

  // 종료 판정 — status='finished' 또는 마지막 경기 시작 +1시간 경과(결제요청 활성화).
  //   백엔드 confirmTournamentSettlement 가드와 동일 기준.
  const isEnded = useMemo(() => {
    if (!tournament) return false;
    if (tournament.status === "finished") return true;
    if (tournament.status === "cancelled") return false;
    const matchTimes = (tournament.matches ?? [])
      .map((m) => new Date(m.scheduledAt).getTime())
      .filter((t) => !Number.isNaN(t));
    if (matchTimes.length > 0) {
      return Math.max(...matchTimes) + SETTLE_OPEN_DELAY_MS <= Date.now();
    }
    // 경기 미등록 폴백 — endDate 는 @db.Date(시각 없음)라 다음날 0시부터 종료.
    if (!tournament.endDate) return false;
    const end = new Date(tournament.endDate).getTime();
    if (Number.isNaN(end)) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return end < today.getTime();
  }, [tournament]);

  // 요약 집계 — 수납/미수 총액 + 상태별 인원(활성=취소·환불 제외).
  const summary = useMemo(() => {
    const counts: Record<TournamentBillingStatus, number> = {
      PAID: 0,
      BILLED: 0,
      UNSETTLED: 0,
      CANCELLED: 0,
      REFUNDED: 0,
    };
    let paidTotal = 0;
    let outstandingTotal = 0;
    for (const r of regRows) {
      const s = rowStatusOf(r);
      counts[s] += 1;
      if (s === "PAID") {
        paidTotal +=
          r.paidAmount != null && r.paidAmount > 0
            ? Number(r.paidAmount)
            : rowFeeOf(r);
      }
      if (s === "BILLED") outstandingTotal += rowFeeOf(r);
    }
    const active = regRows.length - counts.CANCELLED - counts.REFUNDED;
    return { counts, paidTotal, outstandingTotal, active };
  }, [regRows]);

  const filteredRows = useMemo(() => {
    if (payFilter === "outstanding") {
      return regRows.filter((r) => {
        const s = rowStatusOf(r);
        return s === "UNSETTLED" || s === "BILLED";
      });
    }
    if (payFilter === "paid") {
      return regRows.filter((r) => rowStatusOf(r) === "PAID");
    }
    return regRows;
  }, [regRows, payFilter]);

  if (isLoading || !tournament) {
    return null;
  }

  const needPay = regRows.filter(
    (r) => r.paymentStatus === "UNPAID" || r.paymentStatus === "PENDING",
  ).length;
  // 결제요청 취소 가능 — 정산됨(PENDING) 미결제 건이 있을 때.
  const pendingCount = regRows.filter(
    (r) => r.paymentStatus === "PENDING",
  ).length;
  // 결제요청취소 — 요청에 따라 임시 숨김. 로직(pendingCount/handleCancelSettlement)은 보존.
  const SHOW_CANCEL_REQUEST = false;
  // 체크박스 선택 대상 = 정산 전(UNPAID)만(후불 정산 액션 전용).
  const payableIds = regRows
    .filter((r) => r.paymentStatus === "UNPAID")
    .map((r) => r.id);
  const allPayableSelected =
    payableIds.length > 0 && payableIds.every((pid) => selectedRegIds.has(pid));
  const toggleAllPayable = () =>
    setSelectedRegIds(allPayableSelected ? new Set() : new Set(payableIds));

  const M = MESSAGES.academy.students;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.tournament.rosterPageTitle} forceNative />

      <main
        data-no-enter
        className="flex-1 min-h-0 overflow-y-auto bg-it-canvas dark:bg-puck"
      >
        {/* 대회 식별 + 참가 요약 헤더 */}
        <section className="bg-it-surface px-4 pt-4 pb-3 dark:bg-it-blue-950">
          <p className="truncate text-card-title font-extrabold text-it-ink-800 dark:text-white">
            {tournament.name}
          </p>
          <p className="mt-0.5 text-w-caption font-bold text-it-ink-400 dark:text-rink-300">
            {isPostpaid
              ? MESSAGES.tournament.rosterPayNeeded(needPay, summary.active)
              : MESSAGES.tournament.rosterParticipantCount(summary.active)}
          </p>
        </section>

        {/* 요약 패널 + 필터 칩 — 수업 축 결제 탭과 동형 */}
        <section className="mt-2 bg-it-surface px-4 py-4 dark:bg-it-blue-950">
          <div className="rounded-w-md bg-it-fill p-4 dark:bg-rink-800">
            <div className="flex items-baseline justify-between">
              <span className="text-card-meta font-semibold text-it-ink-500 dark:text-rink-300">
                {MESSAGES.settlement.totalCollected}
              </span>
              <span className="text-w-h3 font-extrabold font-num tabular-nums text-it-ink-800 dark:text-white">
                {summary.paidTotal.toLocaleString("ko-KR")}
                <span className="ml-0.5 text-w-body">
                  {MESSAGES.settlement.won}
                </span>
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <CountBlock
                label={MESSAGES.settlement.rowStatusPaid}
                value={summary.counts.PAID}
                dotClass="bg-mint-500"
              />
              <CountBlock
                label={MESSAGES.settlement.rowStatusBilled}
                value={summary.counts.BILLED}
                dotClass="bg-ice-500"
              />
              <CountBlock
                label={MESSAGES.settlement.rowStatusUnsettled}
                value={summary.counts.UNSETTLED}
                dotClass="bg-wtext-3"
              />
            </div>
            {summary.outstandingTotal > 0 && (
              <div className="mt-3 border-t border-it-line-strong pt-3 text-card-meta text-it-ink-600 dark:border-rink-700 dark:text-rink-100">
                {MESSAGES.settlement.outstanding}{" "}
                <span className="font-num font-bold tabular-nums text-it-red-500">
                  {summary.outstandingTotal.toLocaleString("ko-KR")}
                  {MESSAGES.settlement.won}
                </span>
              </div>
            )}
          </div>

          <div
            className="mt-3 flex gap-1.5"
            role="group"
            aria-label={MESSAGES.tournament.rosterSectionTitle}
          >
            {(
              [
                {
                  key: "all" as const,
                  label: M.filterAllPay,
                  count: regRows.length,
                },
                {
                  key: "outstanding" as const,
                  label: MESSAGES.settlement.outstanding,
                  count: summary.counts.UNSETTLED + summary.counts.BILLED,
                },
                {
                  key: "paid" as const,
                  label: MESSAGES.settlement.rowStatusPaid,
                  count: summary.counts.PAID,
                },
              ]
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={payFilter === f.key}
                onClick={() => setPayFilter(f.key)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-w-pill px-3 text-card-meta font-bold transition-colors duration-150 motion-reduce:transition-none",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500",
                  payFilter === f.key
                    ? "bg-it-blue-500 text-white"
                    : "border border-it-line-strong bg-it-fill text-it-ink-600 hover:border-it-blue-500/40 dark:border-rink-700 dark:bg-rink-800 dark:text-rink-100",
                )}
              >
                {f.label}
                <span className="font-num tabular-nums opacity-80">
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* 명단 — 이름 · 결제방식 배지 · N경기 · 금액 · 5-state 칩 */}
        <section
          id="participants"
          aria-label={MESSAGES.tournament.rosterSectionTitle}
          className="mt-2 bg-it-surface px-4 py-4 dark:bg-it-blue-950"
        >
          {isPostpaid && payableIds.length > 0 && (
            <label className="mb-1 flex w-fit cursor-pointer items-center gap-2 py-1.5 text-w-small font-bold text-it-ink-600 dark:text-rink-100">
              <input
                type="checkbox"
                checked={allPayableSelected}
                onChange={toggleAllPayable}
                aria-label={MESSAGES.tournament.rosterSelectAllAria}
                className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-it-blue-500"
              />
              <span>
                {MESSAGES.tournament.participantSelectAllCount(
                  selectedRegIds.size,
                  payableIds.length,
                )}
              </span>
            </label>
          )}
          {filteredRows.length === 0 ? (
            <p className="py-8 text-center text-w-small text-it-ink-400 dark:text-rink-300">
              {regRows.length === 0 ? M.emptyRoster : M.emptyPaymentFilter}
            </p>
          ) : (
            <div className="flex flex-col">
              {filteredRows.map((r, idx) => {
                const rowStatus = rowStatusOf(r);
                const rowTiming: TournamentBillingTiming =
                  r.billingTiming ?? (isPostpaid ? "POSTPAID" : "PREPAID");
                const statusMeta =
                  ROW_STATUS_META[rowStatus] ?? ROW_STATUS_META.UNSETTLED;
                const timingMeta = TIMING_META[rowTiming] ?? TIMING_META.PREPAID;
                // 정산 확정 액션(체크박스·금액수정)은 후불 대회만. 선불은 읽기전용.
                const checkable = isPostpaid && r.paymentStatus === "UNPAID";
                const editable = isPostpaid && r.paymentStatus === "PENDING";
                const rowFee = rowFeeOf(r);
                const amountLabel =
                  rowStatus === "PAID" && rowFee > 0
                    ? MESSAGES.tournament.settlePaidAmount(rowFee)
                    : rowStatus === "BILLED" && rowFee > 0
                      ? MESSAGES.tournament.settleBilledAmount(rowFee)
                      : null;
                // 메타 줄 — 출전 경기 수(청구 근거) + 금액.
                const metaLabel = [
                  r.gamesCount != null && r.gamesCount > 0
                    ? MESSAGES.tournament.rosterGamesCount(r.gamesCount)
                    : null,
                  amountLabel,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between gap-3 py-3.5 ${
                      idx !== filteredRows.length - 1
                        ? "border-b border-it-line dark:border-rink-700"
                        : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {isPostpaid &&
                        (checkable ? (
                          <input
                            type="checkbox"
                            checked={selectedRegIds.has(r.id)}
                            onChange={() => toggleRegSelection(r.id)}
                            aria-label={MESSAGES.tournament.rosterRowCheckAria(
                              nameOf(r),
                            )}
                            className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-it-blue-500"
                          />
                        ) : (
                          <span className="w-[18px] shrink-0" aria-hidden="true" />
                        ))}
                      <Icon
                        name="person"
                        className="text-[20px] text-it-ink-400"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-bold text-it-ink-800 dark:text-white">
                            {nameOf(r)}
                          </span>
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center rounded-w-pill px-1.5 py-0.5 text-w-caption font-extrabold",
                              timingMeta.cls,
                            )}
                          >
                            {timingMeta.label}
                          </span>
                        </span>
                        {metaLabel && (
                          <span className="block text-w-caption tabular-nums text-it-ink-400 dark:text-rink-300">
                            {metaLabel}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-w-pill px-2 py-0.5 text-w-caption font-extrabold",
                          statusMeta.chip,
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-w-pill",
                            statusMeta.dot,
                          )}
                          aria-hidden="true"
                        />
                        {statusMeta.label}
                      </span>
                      {editable && (
                        <button
                          type="button"
                          disabled={!isEnded}
                          title={
                            !isEnded
                              ? MESSAGES.tournament.settleAvailableAfterHour
                              : undefined
                          }
                          onClick={() => openAmountEdit(r)}
                          className="rounded-w-pill border border-it-line px-2.5 py-1 text-w-caption font-bold text-it-ink-600 hover:bg-it-fill disabled:opacity-40 dark:border-rink-700 dark:text-rink-100 dark:hover:bg-rink-700"
                        >
                          {MESSAGES.tournament.settleEditAmount}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 정산 확정 액션(결제요청) — 후불 대회만. 선불은 읽기전용 현황. */}
          {isPostpaid && (
            <div id="settlement" className="mt-3 flex flex-col items-end gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={!isEnded || selectedRegIds.size === 0}
                title={
                  !isEnded
                    ? MESSAGES.tournament.settleAvailableAfterHour
                    : undefined
                }
                onClick={() => void openSettlement()}
              >
                {MESSAGES.tournament.settleRequestCta}
              </Button>
              {!isEnded && (
                <p className="text-w-caption text-it-ink-400 dark:text-rink-300">
                  {MESSAGES.tournament.settleAvailableAfterHour}
                </p>
              )}
              {SHOW_CANCEL_REQUEST && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-it-red-500 text-it-red-500 hover:border-it-red-500 hover:bg-it-red-50 dark:border-it-red-500 dark:text-it-red-300 dark:hover:bg-it-red-500/10"
                  disabled={pendingCount === 0}
                  onClick={() => void handleCancelSettlement()}
                >
                  {MESSAGES.tournament.settleRequestCancelCta}
                </Button>
              )}
            </div>
          )}
        </section>

        <div className="h-8" aria-hidden="true" />
      </main>

      {/* 후불 정산 시트 — 공통 BottomSheet 사용(버튼 잘림/safe-area 처리). */}
      <SettlementModal
        isOpen={settleOpen}
        fee={settleFee}
        onFeeChange={setSettleFee}
        targetCount={settleTargetCount}
        submitting={settleSubmitting}
        onClose={() => {
          if (!settleSubmitting) setSettleOpen(false);
        }}
        onConfirm={() => void handleConfirmSettlement()}
      />
    </MobileContainer>
  );
}

function CountBlock({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: number;
  dotClass: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-w-md bg-it-surface px-2.5 py-2 dark:bg-rink-900/40">
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-w-pill", dotClass)}
        aria-hidden="true"
      />
      <span className="truncate text-w-caption font-bold text-it-ink-500 dark:text-rink-300">
        {label}
      </span>
      <span className="ml-auto font-num text-w-small font-extrabold tabular-nums text-it-ink-800 dark:text-white">
        {value}
      </span>
    </div>
  );
}

/**
 * 후불 대회 정산 모달.
 *  · 1인당 참가비(정수 ≥ 1) 입력 → 정산 대상 인원 × 단가 = 총 청구 금액 미리보기.
 *  · 대상 1명 이상 + 단가 ≥ 1원일 때만 정산하기 활성화.
 */
function SettlementModal({
  isOpen,
  fee,
  onFeeChange,
  targetCount,
  submitting,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  fee: string;
  onFeeChange: (v: string) => void;
  targetCount: number | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const feeNum = Number(fee);
  const validFee = Number.isFinite(feeNum) && feeNum >= 1;
  const count = targetCount ?? 0;
  const total = validFee ? feeNum * count : 0;
  const canConfirm = validFee && count >= 1 && !submitting;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={MESSAGES.tournament.settleTitle}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={onClose}
            disabled={submitting}
          >
            {MESSAGES.common.cancel}
          </Button>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {submitting
              ? MESSAGES.common.processing
              : MESSAGES.tournament.settleCta}
          </Button>
        </div>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-w-caption font-bold text-it-ink-600 dark:text-rink-100">
          {MESSAGES.tournament.settleFeeLabel}
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1000}
          value={fee}
          onChange={(e) => onFeeChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={MESSAGES.tournament.settleFeePlaceholder}
          aria-label={MESSAGES.tournament.settleFeeLabel}
          className="h-11 w-full rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-3 text-w-body font-num tabular-nums text-it-ink-800 placeholder:text-it-ink-400 focus:border-it-blue-500 focus:bg-it-surface focus:outline-none dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:focus:bg-rink-800"
        />
      </label>

      <div className="mt-4 rounded-w-md bg-it-blue-50 px-3.5 py-3 dark:bg-it-blue-500/10">
        <div className="flex items-center justify-between">
          <span className="text-w-small font-bold text-it-ink-600 dark:text-rink-100">
            {targetCount === null
              ? MESSAGES.common.loading
              : MESSAGES.tournament.settleTargetCount(count)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-w-small font-bold text-it-ink-600 dark:text-rink-100">
            {MESSAGES.tournament.settleTotalLabel}
          </span>
          <span className="text-w-body font-extrabold tabular-nums text-it-blue-500">
            {new Intl.NumberFormat("ko-KR").format(total)}원
          </span>
        </div>
      </div>

      {targetCount !== null && count < 1 && (
        <p className="mt-3 text-w-caption font-medium text-it-red-500">
          {MESSAGES.tournament.settleNoTarget}
        </p>
      )}
    </BottomSheet>
  );
}
