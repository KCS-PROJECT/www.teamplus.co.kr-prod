import {
  classifyNiceStatusNm,
  type PayoutResultKind,
} from "../constants/payout-request-status.constant";
import type { NicePayoutResultRow } from "../gateway/nice-payout.types";

/** 짝 맞추기에 필요한 우리 쪽 요청 정보. */
export interface MatchableRequest {
  id: string;
  subMallId: string;
  amount: number;
  niceSeq: string | null;
}

export type PayoutMatchDecision =
  | {
      kind: "MATCHED";
      requestId: string;
      row: NicePayoutResultRow;
      result: PayoutResultKind;
    }
  /** 같은 서브몰·금액의 결과가 여러 건이거나 우리 요청이 여러 건 겹쳐 어느 것이 우리 건인지 가릴 수 없다 */
  | { kind: "AMBIGUOUS"; requestId: string; candidateSeqs: string[] }
  /** 결과 목록에 없다 — 접수되지 않았거나(seq 없음) 나이스가 지웠다 */
  | { kind: "NOT_FOUND"; requestId: string };

/**
 * 나이스 결과 목록과 우리 요청을 짝 맞춘다.
 *   1) 접수번호(seq)가 있는 요청은 seq 로만 찾는다.
 *   2) 접수번호가 없는 요청(응답 유실)은 1)에서 쓰이지 않은 행 중 같은 서브몰·같은 금액으로 찾는다.
 *      후보 행이 2건 이상이거나, 같은 서브몰·금액의 접수번호 없는 요청이 2건 이상이면 자동 확정하지 않는다.
 *   3) reserved — 이번 조회 대상이 아닌 우리 기록(이미 닫힌 요청·아직 반영 중인 요청)의 접수번호는 2)의 후보에서 빼고,
 *      접수번호를 모르는 반영 중 요청은 같은 서브몰·금액의 경쟁자로 센다. 다른 요청의 결과를 가져다 붙이면 안 된다.
 */
export interface ReservedPayoutRecords {
  seqs?: Iterable<string>;
  rivals?: readonly Pick<MatchableRequest, "subMallId" | "amount">[];
}

export function matchPayoutResults(
  requests: readonly MatchableRequest[],
  rows: readonly NicePayoutResultRow[],
  reserved: ReservedPayoutRecords = {},
): PayoutMatchDecision[] {
  const decisions: PayoutMatchDecision[] = [];
  const bySeq = new Map<string, NicePayoutResultRow>();
  for (const row of rows) {
    if (row.seq !== null && !bySeq.has(row.seq)) bySeq.set(row.seq, row);
  }

  const claimedSeqs = new Set<string>(reserved.seqs ?? []);
  const unconfirmed: MatchableRequest[] = [];
  for (const req of requests) {
    if (req.niceSeq === null) {
      unconfirmed.push(req);
      continue;
    }
    const row = bySeq.get(req.niceSeq);
    if (!row) {
      decisions.push({ kind: "NOT_FOUND", requestId: req.id });
      continue;
    }
    claimedSeqs.add(req.niceSeq);
    decisions.push({
      kind: "MATCHED",
      requestId: req.id,
      row,
      result: classifyNiceStatusNm(row.statusNm),
    });
  }

  const key = (subId: string, amount: number | null) => `${subId}|${amount}`;
  const competing = new Map<string, number>();
  for (const req of [...unconfirmed, ...(reserved.rivals ?? [])]) {
    const k = key(req.subMallId, req.amount);
    competing.set(k, (competing.get(k) ?? 0) + 1);
  }

  for (const req of unconfirmed) {
    const candidates = rows.filter(
      (row) =>
        row.subId === req.subMallId &&
        row.settlmntAmt === req.amount &&
        (row.seq === null || !claimedSeqs.has(row.seq)),
    );
    if (candidates.length === 0) {
      decisions.push({ kind: "NOT_FOUND", requestId: req.id });
      continue;
    }
    const rivals = competing.get(key(req.subMallId, req.amount)) ?? 1;
    if (candidates.length > 1 || rivals > 1) {
      decisions.push({
        kind: "AMBIGUOUS",
        requestId: req.id,
        candidateSeqs: candidates
          .map((c) => c.seq)
          .filter((s): s is string => s !== null),
      });
      continue;
    }
    const row = candidates[0];
    if (row.seq !== null) claimedSeqs.add(row.seq);
    decisions.push({
      kind: "MATCHED",
      requestId: req.id,
      row,
      result: classifyNiceStatusNm(row.statusNm),
    });
  }

  return decisions;
}
