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
});
