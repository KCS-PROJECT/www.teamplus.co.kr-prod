import { matchPayoutResults } from "./payout-result-match.util";
import type { NicePayoutResultRow } from "../gateway/nice-payout.types";

const row = (
  seq: string | null,
  subId: string,
  settlmntAmt: number,
  statusNm = "성공",
  errReason: string | null = null,
): NicePayoutResultRow => ({ seq, subId, statusNm, settlmntAmt, errReason });

describe("matchPayoutResults", () => {
  it("접수번호가 있는 요청은 접수번호로만 짝을 맞춘다", () => {
    const decisions = matchPayoutResults(
      [{ id: "r1", subMallId: "T1", amount: 1000, niceSeq: "S1" }],
      [row("S1", "T1", 1000, "성공"), row("S2", "T1", 1000, "실패")],
    );
    expect(decisions).toEqual([
      expect.objectContaining({
        kind: "MATCHED",
        requestId: "r1",
        result: "SUCCEEDED",
      }),
    ]);
  });

  it("접수번호가 있는데 목록에 없으면 NOT_FOUND", () => {
    expect(
      matchPayoutResults(
        [{ id: "r1", subMallId: "T1", amount: 1000, niceSeq: "S9" }],
        [row("S1", "T1", 1000)],
      ),
    ).toEqual([{ kind: "NOT_FOUND", requestId: "r1" }]);
  });

  it("접수번호가 없는 요청은 같은 서브몰·같은 금액 1건일 때만 자동으로 맞춘다", () => {
    const decisions = matchPayoutResults(
      [{ id: "r1", subMallId: "T1", amount: 1000, niceSeq: null }],
      [row("S1", "T1", 1000, "실패", "잔액부족"), row("S2", "T2", 1000)],
    );
    expect(decisions[0]).toEqual(
      expect.objectContaining({
        kind: "MATCHED",
        requestId: "r1",
        result: "FAILED",
        row: expect.objectContaining({ seq: "S1", errReason: "잔액부족" }),
      }),
    );
  });

  it("접수번호로 이미 짝지어진 행은 접수번호 없는 요청의 후보에서 빠진다", () => {
    const decisions = matchPayoutResults(
      [
        { id: "r1", subMallId: "T1", amount: 1000, niceSeq: "S1" },
        { id: "r2", subMallId: "T1", amount: 1000, niceSeq: null },
      ],
      [row("S1", "T1", 1000), row("S2", "T1", 1000)],
    );
    expect(decisions).toEqual([
      expect.objectContaining({ kind: "MATCHED", requestId: "r1" }),
      expect.objectContaining({
        kind: "MATCHED",
        requestId: "r2",
        row: expect.objectContaining({ seq: "S2" }),
      }),
    ]);
  });

  it("같은 서브몰·금액 후보가 2건 이상이면 AMBIGUOUS — 자동 확정하지 않는다", () => {
    const decisions = matchPayoutResults(
      [{ id: "r1", subMallId: "T1", amount: 1000, niceSeq: null }],
      [row("S1", "T1", 1000), row("S2", "T1", 1000)],
    );
    expect(decisions).toEqual([
      { kind: "AMBIGUOUS", requestId: "r1", candidateSeqs: ["S1", "S2"] },
    ]);
  });

  it("접수번호 없는 요청끼리 같은 서브몰·금액으로 겹치면 둘 다 AMBIGUOUS", () => {
    const decisions = matchPayoutResults(
      [
        { id: "r1", subMallId: "T1", amount: 1000, niceSeq: null },
        { id: "r2", subMallId: "T1", amount: 1000, niceSeq: null },
      ],
      [row("S1", "T1", 1000)],
    );
    expect(decisions.map((d) => d.kind)).toEqual(["AMBIGUOUS", "AMBIGUOUS"]);
  });

  it("접수번호 없는 요청이 목록에 없으면 NOT_FOUND", () => {
    expect(
      matchPayoutResults(
        [{ id: "r1", subMallId: "T1", amount: 1000, niceSeq: null }],
        [row("S1", "T1", 999)],
      ),
    ).toEqual([{ kind: "NOT_FOUND", requestId: "r1" }]);
  });

  it("상태 원문을 분류한다 — 요청/재요청 진행중은 PENDING, 삭제는 CANCELLED, 모르는 값은 UNKNOWN", () => {
    const requests = ["요청", "재요청 진행중", "삭제", "보류"].map((_, i) => ({
      id: `r${i}`,
      subMallId: `T${i}`,
      amount: 1000,
      niceSeq: `S${i}`,
    }));
    const rows = ["요청", "재요청 진행중", "삭제", "보류"].map((s, i) =>
      row(`S${i}`, `T${i}`, 1000, s),
    );
    const results = matchPayoutResults(requests, rows).map((d) =>
      d.kind === "MATCHED" ? d.result : d.kind,
    );
    expect(results).toEqual(["PENDING", "PENDING", "CANCELLED", "UNKNOWN"]);
  });

  it("reserved.seqs 에 든 접수번호는 응답 유실 요청의 후보에서 뺀다", () => {
    const decisions = matchPayoutResults(
      [{ id: "lost", subMallId: "T1", amount: 1000, niceSeq: null }],
      [row("S1", "T1", 1000, "성공")],
      { seqs: ["S1"] },
    );
    expect(decisions).toEqual([{ kind: "NOT_FOUND", requestId: "lost" }]);
  });

  it("reserved.rivals 에 같은 서브몰·금액이 있으면 후보가 1건이어도 자동 확정하지 않는다", () => {
    const decisions = matchPayoutResults(
      [{ id: "lost", subMallId: "T1", amount: 1000, niceSeq: null }],
      [row("S1", "T1", 1000, "성공")],
      { rivals: [{ subMallId: "T1", amount: 1000 }] },
    );
    expect(decisions).toEqual([
      { kind: "AMBIGUOUS", requestId: "lost", candidateSeqs: ["S1"] },
    ]);
  });
});
