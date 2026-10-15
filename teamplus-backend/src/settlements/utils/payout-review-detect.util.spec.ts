import { detectPayoutReview } from "./payout-review-detect.util";
import type { NicePayoutResultRow } from "../gateway/nice-payout.types";

describe("payout-review-detect.util", () => {
  const row = (
    seq: string | null,
    statusNm: string,
    subId = "SUB-1",
    amount: number | null = 500000,
  ): NicePayoutResultRow => ({
    seq,
    subId,
    statusNm,
    settlmntAmt: amount,
    errReason: null,
  });

  const request = (
    overrides: Partial<{
      id: string;
      settlementId: string;
      teamId: string | null;
      subMallId: string;
      amount: number;
      niceSeq: string | null;
    }> = {},
  ) => ({
    id: overrides.id ?? "pr-1",
    settlementId: overrides.settlementId ?? "s-1",
    teamId: overrides.teamId === undefined ? "team-1" : overrides.teamId,
    subMallId: overrides.subMallId ?? "SUB-1",
    amount: overrides.amount ?? 500000,
    niceSeq: overrides.niceSeq === undefined ? "SEQ-1" : overrides.niceSeq,
  });

  it("우리 접수번호와 금액이 같으면 아무것도 켜지 않는다", () => {
    const r = detectPayoutReview([row("SEQ-1", "성공")], [request()]);
    expect(r).toEqual({ flags: [], external: [], skippedNoSeq: 0 });
  });

  it("접수번호는 우리 것인데 금액이 다르면 금액 불일치. 금액이 비어 오면 판정하지 않는다", () => {
    const r = detectPayoutReview(
      [row("SEQ-1", "성공", "SUB-1", 400000)],
      [request()],
    );
    expect(r.flags).toEqual([
      {
        requestId: "pr-1",
        reason: "AMOUNT_MISMATCH",
        niceSeq: "SEQ-1",
        niceAmount: 400000,
        niceStatusNm: "성공",
      },
    ]);
    expect(
      detectPayoutReview([row("SEQ-1", "성공", "SUB-1", null)], [request()])
        .flags,
    ).toEqual([]);
  });

  it("우리 기록에 없는 접수번호는 외부 지급으로 돌려준다(실패·삭제는 제외) — 켜는 요청은 없다", () => {
    const r = detectPayoutReview(
      [
        row("SEQ-1", "성공"),
        row("SEQ-X", "요청", "SUB-1"),
        row("SEQ-Y", "성공", "SUB-9", 300000),
        row("SEQ-F", "실패", "SUB-9"),
        row("SEQ-D", "삭제", "SUB-9"),
      ],
      [request()],
    );
    expect(r.flags).toEqual([]);
    expect(r.external).toEqual([
      { seq: "SEQ-X", subId: "SUB-1", amount: 500000, statusNm: "요청" },
      { seq: "SEQ-Y", subId: "SUB-9", amount: 300000, statusNm: "성공" },
    ]);
  });

  it("같은 팀에 성공이 2건 이상이면 우리 요청에 걸린 행에 이중 지급 의심을 켜고, 외부 행은 외부 지급으로 함께 돌려준다", () => {
    const r = detectPayoutReview(
      [row("SEQ-1", "성공"), row("SEQ-X", "성공")],
      [request()],
    );
    expect(r.flags).toEqual([
      expect.objectContaining({
        requestId: "pr-1",
        reason: "DUPLICATE_SUCCESS",
      }),
    ]);
    expect(r.external.map((e) => e.seq)).toEqual(["SEQ-X"]);
  });

  it("같은 정산의 우리 요청 두 건이 같은 날 모두 성공이면 둘 다 켠다", () => {
    const r = detectPayoutReview(
      [row("SEQ-1", "성공"), row("SEQ-2", "성공", "SUB-1", 777)],
      [request(), request({ id: "pr-2", niceSeq: "SEQ-2", amount: 777 })],
    );
    expect(r.flags.map((f) => [f.requestId, f.reason])).toEqual([
      ["pr-1", "DUPLICATE_SUCCESS"],
      ["pr-2", "DUPLICATE_SUCCESS"],
    ]);
  });

  it("한 팀의 서로 다른 정산(다른 달) 두 건을 같은 날 각각 보내 둘 다 성공한 것은 정상이다", () => {
    const r = detectPayoutReview(
      [row("SEQ-1", "성공"), row("SEQ-2", "성공", "SUB-1", 777)],
      [
        request(),
        request({
          id: "pr-2",
          settlementId: "s-2",
          niceSeq: "SEQ-2",
          amount: 777,
        }),
      ],
    );
    expect(r.flags).toEqual([]);
  });

  it("성공이 1건이고 나머지가 진행 중이면 이중 지급이 아니다", () => {
    const r = detectPayoutReview(
      [row("SEQ-1", "성공"), row("SEQ-X", "요청")],
      [request()],
    );
    expect(r.flags).toEqual([]);
  });

  it("접수번호가 없는 행은 건너뛰고 건수만 센다", () => {
    const r = detectPayoutReview(
      [row(null, "성공"), row(null, "요청")],
      [request()],
    );
    expect(r.flags).toEqual([]);
    expect(r.external).toEqual([]);
    expect(r.skippedNoSeq).toBe(2);
  });
});
