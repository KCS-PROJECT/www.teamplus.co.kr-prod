import { classifyNiceStatusNm } from "../constants/payout-request-status.constant";
import {
  PAYOUT_REVIEW_REASON,
  type PayoutReviewReason,
} from "../constants/payout-review.constant";
import type { NicePayoutResultRow } from "../gateway/nice-payout.types";

/** 대조에 필요한 우리 쪽 요청 — 그 지급일의 요청 전부(닫힌 것 포함). */
export interface ReviewMatchRequest {
  id: string;
  settlementId: string;
  teamId: string | null;
  subMallId: string;
  amount: number;
  niceSeq: string | null;
}

/** 우리 요청에 켜야 할 확인 필요 사유. */
export interface ReviewFlagCandidate {
  requestId: string;
  reason: PayoutReviewReason;
  niceSeq: string;
  niceAmount: number | null;
  niceStatusNm: string;
}

/** 우리 요청 행이 없는 나이스 행 — 기록할 곳이 없어 로그로만 남긴다. */
export interface ExternalPayoutRow {
  seq: string;
  subId: string;
  amount: number | null;
  statusNm: string;
}

export interface DetectPayoutReviewResult {
  flags: ReviewFlagCandidate[];
  external: ExternalPayoutRow[];
  /** 접수번호가 없어 외부 판정을 건너뛴 행 수 */
  skippedNoSeq: number;
}

/**
 * 나이스 결과 행 전체를 우리 요청과 대조한다(순수 함수).
 *   금액 불일치 — 접수번호가 우리 것인데 나이스 금액이 다름(금액이 비어 오면 판정하지 않음)
 *   이중 지급   — 같은 팀(없으면 서브몰 ID)에 "성공" 행이 2건 이상이면 그중 우리 요청에 걸린 행에 사유를 켠다
 *   외부 지급   — 접수번호가 우리 기록에 없고 실패·삭제가 아닌 행(이중 지급 묶음에 든 외부 행도 여기 포함)
 * 접수번호가 없는 행은 건너뛴다.
 */
export function detectPayoutReview(
  rows: readonly NicePayoutResultRow[],
  requests: readonly ReviewMatchRequest[],
): DetectPayoutReviewResult {
  const bySeq = new Map<string, ReviewMatchRequest>();
  const teamBySubMall = new Map<string, string | null>();
  for (const r of requests) {
    if (r.niceSeq && !bySeq.has(r.niceSeq)) bySeq.set(r.niceSeq, r);
    if (!teamBySubMall.has(r.subMallId))
      teamBySubMall.set(r.subMallId, r.teamId);
  }
  const teamKeyOf = (subId: string) => {
    const teamId = teamBySubMall.get(subId);
    return teamId ? `team:${teamId}` : `sub:${subId}`;
  };

  const flags: ReviewFlagCandidate[] = [];
  const external: ExternalPayoutRow[] = [];
  let skippedNoSeq = 0;

  const successByTeam = new Map<string, NicePayoutResultRow[]>();
  for (const row of rows) {
    if (row.seq === null) continue;
    if (classifyNiceStatusNm(row.statusNm) !== "SUCCEEDED") continue;
    const key = teamKeyOf(row.subId);
    const list = successByTeam.get(key) ?? [];
    list.push(row);
    successByTeam.set(key, list);
  }
  // 이중 지급 의심 — 같은 정산에 성공이 2건 이상이거나, 같은 팀 성공 중 우리 기록에 없는 행(외부 지급)이 섞였을 때만.
  //   한 팀의 서로 다른 정산(다른 달)을 같은 지급일에 각각 보낸 것은 정상이다.
  for (const list of successByTeam.values()) {
    if (list.length < 2) continue;
    const hasExternal = list.some((row) => !row.seq || !bySeq.has(row.seq));
    const successPerSettlement = new Map<string, number>();
    for (const row of list) {
      const req = row.seq ? bySeq.get(row.seq) : undefined;
      if (req) {
        successPerSettlement.set(
          req.settlementId,
          (successPerSettlement.get(req.settlementId) ?? 0) + 1,
        );
      }
    }
    for (const row of list) {
      const req = row.seq ? bySeq.get(row.seq) : undefined;
      if (!req || !row.seq) continue;
      if (
        !hasExternal &&
        (successPerSettlement.get(req.settlementId) ?? 0) < 2
      ) {
        continue;
      }
      flags.push({
        requestId: req.id,
        reason: PAYOUT_REVIEW_REASON.DUPLICATE_SUCCESS,
        niceSeq: row.seq,
        niceAmount: row.settlmntAmt,
        niceStatusNm: row.statusNm,
      });
    }
  }

  for (const row of rows) {
    if (row.seq === null) {
      skippedNoSeq += 1;
      continue;
    }
    const req = bySeq.get(row.seq);
    if (req) {
      if (row.settlmntAmt !== null && row.settlmntAmt !== req.amount) {
        flags.push({
          requestId: req.id,
          reason: PAYOUT_REVIEW_REASON.AMOUNT_MISMATCH,
          niceSeq: row.seq,
          niceAmount: row.settlmntAmt,
          niceStatusNm: row.statusNm,
        });
      }
      continue;
    }
    const kind = classifyNiceStatusNm(row.statusNm);
    if (kind === "FAILED" || kind === "CANCELLED") continue;
    external.push({
      seq: row.seq,
      subId: row.subId,
      amount: row.settlmntAmt,
      statusNm: row.statusNm,
    });
  }

  return { flags, external, skippedNoSeq };
}
