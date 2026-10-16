import { NicePayoutFakeGateway } from "./nice-payout-fake.gateway";
import { NiceSubMallRequest } from "./nice-payout.types";

const base: NiceSubMallRequest = {
  subId: "TEAM-1",
  subNm: "테스트팀",
  subCoNo: "1234567890",
  bankCd: "004",
  accntNo: "00000000000000",
  accntNm: "홍길동",
  reqType: 0,
};

describe("NicePayoutFakeGateway", () => {
  let gw: NicePayoutFakeGateway;
  beforeEach(() => {
    gw = new NicePayoutFakeGateway(10);
  });

  it("kind=fake, isConfigured=true, 잔액 1천만원", async () => {
    expect(gw.kind).toBe("fake");
    expect(gw.isConfigured()).toBe(true);
    const r = await gw.getBalance();
    expect(r.outcome).toBe("SUCCESS");
    expect(r.remainAmt).toBe(10_000_000);
    expect(r.meta.sid).toBe("0101001");
    expect(r.meta.resCode).toBe("0000");
  });

  it("신규 등록 성공 후 같은 subId 신규 → 1106", async () => {
    const ok = await gw.upsertSubMall(base);
    expect(ok.outcome).toBe("SUCCESS");
    expect(ok.meta.resCode).toBe("0000");
    const dup = await gw.upsertSubMall(base);
    expect(dup.outcome).toBe("TERMINAL");
    expect(dup.meta.resCode).toBe("1106");
  });

  it("미등록 subId 수정 → 1105, 등록 후 수정 → 성공", async () => {
    const miss = await gw.upsertSubMall({ ...base, reqType: 1 });
    expect(miss.outcome).toBe("TERMINAL");
    expect(miss.meta.resCode).toBe("1105");
    await gw.upsertSubMall(base);
    const upd = await gw.upsertSubMall({ ...base, reqType: 1 });
    expect(upd.outcome).toBe("SUCCESS");
  });

  it("예금주명 '실패테스트' → 1003, 등록되지 않음", async () => {
    const r = await gw.upsertSubMall({ ...base, accntNm: "실패테스트" });
    expect(r.outcome).toBe("TERMINAL");
    expect(r.meta.resCode).toBe("1003");
    const again = await gw.upsertSubMall(base);
    expect(again.meta.resCode).toBe("0000");
  });

  it("예금주명 '지연테스트' → 지연 후 timeout(AMBIGUOUS)", async () => {
    const r = await gw.upsertSubMall({ ...base, accntNm: "지연테스트" });
    expect(r.outcome).toBe("AMBIGUOUS");
    expect(r.meta.resCode).toBeNull();
    expect(r.meta.error).toBe("timeout");
    expect(r.meta.durationMs).toBeGreaterThanOrEqual(5);
  });

  describe("지급 요청·결과 조회", () => {
    const payout = (settlmntAmt: number, subId = "TEAM-1") => ({
      subId,
      settlmntDt: "20200102",
      settlmntAmt,
      dupChkYn: "N" as const,
      accntDesc: "팀플러스 7월 정산",
    });

    it("접수 성공 → seq 발급, 지난 지급일 결과 조회에서 '성공'", async () => {
      const r = await gw.requestPayout(payout(500000));
      expect(r.outcome).toBe("SUCCESS");
      expect(r.meta.sid).toBe("0102001");
      expect(r.seq).toMatch(/^FAKE\d{6}$/);

      const q = await gw.queryPayoutResults({ settlmntDt: "20200102" });
      expect(q.outcome).toBe("SUCCESS");
      expect(q.meta.sid).toBe("0101002");
      expect(q.totCnt).toBe(1);
      expect(q.succCnt).toBe(1);
      expect(q.rows).toEqual([
        {
          seq: r.seq,
          subId: "TEAM-1",
          statusNm: "성공",
          settlmntAmt: 500000,
          errReason: null,
        },
      ]);
    });

    it("아직 오지 않은 지급일은 '요청' 으로 보인다", async () => {
      await gw.requestPayout({ ...payout(1000), settlmntDt: "20991231" });
      const q = await gw.queryPayoutResults({ settlmntDt: "20991231" });
      expect(q.rows[0].statusNm).toBe("요청");
    });

    it("끝 세 자리 999 → 접수는 되지만 결과는 '실패' + 사유", async () => {
      await gw.requestPayout(payout(100999));
      const q = await gw.queryPayoutResults({ settlmntDt: "20200102" });
      expect(q.rows[0].statusNm).toBe("실패");
      expect(q.rows[0].errReason).toContain("잔액부족");
      expect(q.failCnt).toBe(1);
    });

    it("끝 세 자리 998 → 접수된 뒤 응답 유실(AMBIGUOUS), 결과 조회에는 나타난다", async () => {
      const r = await gw.requestPayout(payout(100998));
      expect(r.outcome).toBe("AMBIGUOUS");
      expect(r.seq).toBeNull();
      const q = await gw.queryPayoutResults({ settlmntDt: "20200102" });
      expect(q.rows).toHaveLength(1);
      expect(q.rows[0].settlmntAmt).toBe(100998);
    });

    it("끝 세 자리 997 → 접수되지 않고 응답도 없음(AMBIGUOUS), 결과 조회에 없다", async () => {
      const r = await gw.requestPayout(payout(100997));
      expect(r.outcome).toBe("AMBIGUOUS");
      const q = await gw.queryPayoutResults({ settlmntDt: "20200102" });
      expect(q.rows).toHaveLength(0);
    });

    it("dupChkYn=Y 인 같은 서브몰·지급일·금액 재요청은 1103, N 이면 둘 다 접수", async () => {
      await gw.requestPayout(payout(1000));
      const dup = await gw.requestPayout({ ...payout(1000), dupChkYn: "Y" });
      expect(dup.outcome).toBe("TERMINAL");
      expect(dup.meta.resCode).toBe("1103");
      const again = await gw.requestPayout(payout(1000));
      expect(again.outcome).toBe("SUCCESS");
      const q = await gw.queryPayoutResults({
        settlmntDt: "20200102",
        subId: "TEAM-1",
      });
      expect(q.rows).toHaveLength(2);
    });
  });
});

describe("NicePayoutFakeGateway.cancelPayout", () => {
  let gw: NicePayoutFakeGateway;
  const kstNow = (iso: string) =>
    jest.spyOn(Date, "now").mockReturnValue(new Date(`${iso}+09:00`).getTime());

  beforeEach(() => {
    gw = new NicePayoutFakeGateway(10);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const requestOne = async (settlmntAmt = 100000) => {
    const r = await gw.requestPayout({
      subId: "TEAM-1",
      settlmntDt: "20261015",
      settlmntAmt,
      dupChkYn: "N",
    });
    return r.seq as string;
  };

  it("취소하면 결과 조회에 삭제로 보이고, 두 번째 취소는 1104", async () => {
    kstNow("2026-10-15T09:00:00");
    const seq = await requestOne();
    const input = { subId: "TEAM-1", settlmntDt: "20261015", seq };

    const ok = await gw.cancelPayout(input);
    expect(ok.outcome).toBe("SUCCESS");
    expect(ok.meta.sid).toBe("0103001");

    const q = await gw.queryPayoutResults({ settlmntDt: "20261015" });
    expect(q.rows[0]).toMatchObject({ seq, statusNm: "삭제", errReason: null });

    const again = await gw.cancelPayout(input);
    expect(again.outcome).toBe("TERMINAL");
    expect(again.meta.resCode).toBe("1104");
  });

  it("지급일 10:30 이후 취소는 1107", async () => {
    kstNow("2026-10-15T09:00:00");
    const seq = await requestOne();
    kstNow("2026-10-15T10:30:00");

    const r = await gw.cancelPayout({
      subId: "TEAM-1",
      settlmntDt: "20261015",
      seq,
    });
    expect(r.meta.resCode).toBe("1107");
  });

  it("금액 끝 996 은 취소가 반영됐는데 응답이 없다", async () => {
    kstNow("2026-10-15T09:00:00");
    const seq = await requestOne(100996);

    const r = await gw.cancelPayout({
      subId: "TEAM-1",
      settlmntDt: "20261015",
      seq,
    });
    expect(r.outcome).toBe("AMBIGUOUS");
    const q = await gw.queryPayoutResults({ settlmntDt: "20261015" });
    expect(q.rows[0].statusNm).toBe("삭제");
  });
});
