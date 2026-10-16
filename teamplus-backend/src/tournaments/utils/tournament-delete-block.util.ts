/**
 * 대회 삭제 가능 판정 SoT — 삭제 가드(409)와 상세·목록 응답의 삭제 불가 사유가 공유한다.
 *
 * 판정 순서(앞선 사유가 우선):
 *  · FINISHED — 종료된 대회.
 *  · HAS_PAYMENT — 돈 흔적. 결제가 한 번이라도 연결된 신청(완료·진행 중·청구·환불·취소된 결제
 *    모두. 취소된 결제도 승인이 늦게 들어올 수 있다), 결제요청 취소로 연결이 풀린 후불 청구 결제,
 *    환불 요청, 경기 비용.
 *  · HAS_MATCH_RECORDS — 시작·종료된 경기가 있으면 취소된 대회라도 기록 보존.
 *  · 취소된 대회는 여기서 통과 — 취소 흐름이 이미 신청자를 정리했다.
 *  · STARTED — 진행 중, 또는 이용 개시일(tournament-usage.util) 당일 이후.
 *  · HAS_APPLICANTS — 취소·환불되지 않은 신청이 남아 있으면 알림이 가는 대회 취소로 닫는다.
 *
 * 여러 대회를 한 번에 판정하며 쿼리 수는 대회 수와 무관하게 고정이다. 잠금은 걸지 않는다 —
 * 삭제 경로는 호출 전에 트랜잭션 안에서 잠근 뒤 다시 판정한다.
 */

import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { kstTodayUtcMidnight } from "@/common/utils/kst-date.util";
import {
  TOURNAMENT_INACTIVE_MATCH_STATUSES,
  isTournamentUsageStarted,
  tournamentUsageStartFrom,
} from "@/common/utils/tournament-usage.util";

/** 치렀거나 치르는 중인 경기 상태 — 하나라도 있으면 대회 삭제로 기록을 지우지 않는다. */
export const PLAYED_MATCH_STATUSES = [
  "warmup",
  "in_progress",
  "intermission",
  "completed",
];

/**
 * 사유별 응답.
 *  · conflictMessage — 삭제 요청 409 안내(웹 감독 화면이 토스트로 띄운다. 대회 취소 안내 포함).
 *  · displayMessage — 상세·목록 응답의 사유 문구. 대회 취소가 없는 어드민 화면도 쓰므로 사유만 적는다.
 */
export const TOURNAMENT_DELETE_BLOCKS = {
  FINISHED: {
    errorCode: "TOURNAMENT_DELETE_FINISHED",
    conflictMessage: "종료된 대회는 기록 보존을 위해 삭제할 수 없어요.",
    displayMessage: "종료된 대회는 기록 보존을 위해 삭제할 수 없어요.",
  },
  HAS_PAYMENT: {
    errorCode: "TOURNAMENT_DELETE_HAS_PAYMENT",
    conflictMessage:
      "결제·청구·환불 이력이 있는 대회는 삭제할 수 없어요. 대회 취소를 이용해 주세요.",
    displayMessage: "결제·청구·환불 이력이 있어 삭제할 수 없어요.",
  },
  HAS_MATCH_RECORDS: {
    errorCode: "TOURNAMENT_DELETE_HAS_MATCH_RECORDS",
    conflictMessage:
      "경기 기록이 있는 대회는 기록 보존을 위해 삭제할 수 없어요.",
    displayMessage: "경기 기록이 있어 기록 보존을 위해 삭제할 수 없어요.",
  },
  STARTED: {
    errorCode: "TOURNAMENT_DELETE_STARTED",
    conflictMessage:
      "시작된 대회는 삭제할 수 없어요. 대회 취소를 이용해 주세요.",
    displayMessage: "시작된 대회는 삭제할 수 없어요.",
  },
  HAS_APPLICANTS: {
    errorCode: "TOURNAMENT_DELETE_HAS_APPLICANTS",
    conflictMessage:
      "신청자가 있는 대회는 대회 취소를 이용해 주세요. 신청자에게 취소 알림이 발송돼요.",
    displayMessage: "신청자가 있어 삭제할 수 없어요.",
  },
} as const;

export type TournamentDeleteBlockReason = keyof typeof TOURNAMENT_DELETE_BLOCKS;

export type TournamentDeleteBlockRow = {
  id: string;
  status: string;
  startDate: Date | null;
};

type DeleteBlockDb = Pick<
  Prisma.TransactionClient,
  | "tournamentRegistration"
  | "payment"
  | "refundRequest"
  | "gameExpense"
  | "hockeyMatch"
>;

const POSTPAID_ORDER_PREFIX = "TRN-POSTPAID-";
const RELEASED_REGISTRATION_STATUSES = ["CANCELLED", "REFUNDED"];

/** 대회별 삭제 불가 사유. 삭제할 수 있으면 null. */
export async function resolveTournamentDeleteBlocks(
  db: DeleteBlockDb,
  tournaments: TournamentDeleteBlockRow[],
  todayUtc: Date = kstTodayUtcMidnight(),
): Promise<Map<string, TournamentDeleteBlockReason | null>> {
  const result = new Map<string, TournamentDeleteBlockReason | null>();
  if (tournaments.length === 0) return result;
  const ids = tournaments.map((t) => t.id);

  const [
    registrationGroups,
    postpaidBillingPayments,
    refundGroups,
    directExpenseGroups,
    expenseMatchTournaments,
    matchGroups,
  ] = await Promise.all([
    db.tournamentRegistration.groupBy({
      by: ["tournamentId", "paymentStatus"],
      where: { tournamentId: { in: ids } },
      _count: { _all: true, paymentId: true },
    }),
    db.payment.findMany({
      where: {
        OR: ids.map((id) => ({
          orderNumber: { startsWith: `${POSTPAID_ORDER_PREFIX}${id}-` },
        })),
      },
      select: { orderNumber: true },
    }),
    db.refundRequest.groupBy({
      by: ["tournamentId"],
      where: { tournamentId: { in: ids } },
      _count: { _all: true },
    }),
    db.gameExpense.groupBy({
      by: ["tournamentId"],
      where: { tournamentId: { in: ids } },
      _count: { _all: true },
    }),
    // 경기에 붙은 비용 — 비용 행 대신 "비용 있는 경기가 있는 대회"만 대회당 1행으로 받는다.
    db.hockeyMatch.findMany({
      where: { tournamentId: { in: ids }, gameExpenses: { some: {} } },
      select: { tournamentId: true },
      distinct: ["tournamentId"],
    }),
    db.hockeyMatch.groupBy({
      by: ["tournamentId", "status"],
      where: { tournamentId: { in: ids } },
      _min: { scheduledAt: true },
    }),
  ]);

  const moneyTraceIds = new Set<string>();
  const activeApplicantIds = new Set<string>();
  for (const g of registrationGroups) {
    if (g._count.paymentId > 0) moneyTraceIds.add(g.tournamentId);
    if (
      g._count._all > 0 &&
      !RELEASED_REGISTRATION_STATUSES.includes(g.paymentStatus)
    ) {
      activeApplicantIds.add(g.tournamentId);
    }
  }
  const idSet = new Set(ids);
  for (const p of postpaidBillingPayments) {
    // 주문번호 = TRN-POSTPAID-{대회 id}-{신청 id}. 신청 id(cuid)에는 하이픈이 없어
    //   마지막 하이픈 앞까지가 대회 id다.
    const body = p.orderNumber.slice(POSTPAID_ORDER_PREFIX.length);
    const tournamentId = body.slice(0, body.lastIndexOf("-"));
    if (idSet.has(tournamentId)) moneyTraceIds.add(tournamentId);
  }
  for (const g of refundGroups) {
    if (g.tournamentId) moneyTraceIds.add(g.tournamentId);
  }
  for (const g of directExpenseGroups) {
    if (g.tournamentId) moneyTraceIds.add(g.tournamentId);
  }
  for (const m of expenseMatchTournaments) {
    if (m.tournamentId) moneyTraceIds.add(m.tournamentId);
  }

  const playedMatchIds = new Set<string>();
  const firstActiveMatchAt = new Map<string, Date>();
  for (const g of matchGroups) {
    if (!g.tournamentId) continue;
    if (PLAYED_MATCH_STATUSES.includes(g.status)) {
      playedMatchIds.add(g.tournamentId);
    }
    const at = g._min.scheduledAt;
    if (at && !TOURNAMENT_INACTIVE_MATCH_STATUSES.includes(g.status)) {
      const prev = firstActiveMatchAt.get(g.tournamentId);
      if (!prev || at.getTime() < prev.getTime()) {
        firstActiveMatchAt.set(g.tournamentId, at);
      }
    }
  }

  for (const t of tournaments) {
    result.set(
      t.id,
      decideBlock(t, {
        hasMoneyTrace: moneyTraceIds.has(t.id),
        hasPlayedMatch: playedMatchIds.has(t.id),
        hasActiveApplicant: activeApplicantIds.has(t.id),
        firstActiveMatchAt: firstActiveMatchAt.get(t.id) ?? null,
        todayUtc,
      }),
    );
  }
  return result;
}

function decideBlock(
  t: TournamentDeleteBlockRow,
  facts: {
    hasMoneyTrace: boolean;
    hasPlayedMatch: boolean;
    hasActiveApplicant: boolean;
    firstActiveMatchAt: Date | null;
    todayUtc: Date;
  },
): TournamentDeleteBlockReason | null {
  if (t.status === "finished") return "FINISHED";
  if (facts.hasMoneyTrace) return "HAS_PAYMENT";
  if (facts.hasPlayedMatch) return "HAS_MATCH_RECORDS";
  if (t.status === "cancelled") return null;
  const started =
    t.status === "ongoing" ||
    isTournamentUsageStarted(
      tournamentUsageStartFrom(t, facts.firstActiveMatchAt),
      facts.todayUtc,
    );
  if (started) return "STARTED";
  if (facts.hasActiveApplicant) return "HAS_APPLICANTS";
  return null;
}

/** 삭제 요청 409 — 기존 계약({ message, errorCode }) 그대로. */
export function tournamentDeleteConflict(
  reason: TournamentDeleteBlockReason,
): ConflictException {
  const block = TOURNAMENT_DELETE_BLOCKS[reason];
  return new ConflictException({
    message: block.conflictMessage,
    errorCode: block.errorCode,
  });
}

/** 상세·목록 응답에 붙이는 사유 필드. */
export function tournamentDeleteBlockFields(
  reason: TournamentDeleteBlockReason | null,
): {
  deleteBlockedReason: TournamentDeleteBlockReason | null;
  deleteBlockedMessage: string | null;
} {
  return {
    deleteBlockedReason: reason,
    deleteBlockedMessage: reason
      ? TOURNAMENT_DELETE_BLOCKS[reason].displayMessage
      : null,
  };
}
