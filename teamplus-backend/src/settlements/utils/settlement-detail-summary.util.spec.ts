import { aggregateDetailsBySource } from "./settlement-detail-summary.util";

const row = (
  overrides: Partial<Parameters<typeof aggregateDetailsBySource>[0][number]>,
) => ({
  entryType: "PAYMENT" as const,
  sourceType: "CLASS" as const,
  sourceId: "cls-1",
  productName: "화요반",
  paymentAmount: 10000,
  feeAmount: 0,
  pgFeeAmount: 0,
  actualAmount: 10000,
  ...overrides,
});

describe("aggregateDetailsBySource", () => {
  it("같은 출처는 이름이 달라도 한 그룹 — 이름은 첫(최신) 행", () => {
    const { data } = aggregateDetailsBySource([
      row({ productName: "화요반 A" }),
      row({ productName: "화요반" }),
    ]);
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual(
      expect.objectContaining({
        sourceId: "cls-1",
        name: "화요반 A",
        paymentCount: 2,
        paymentAmount: 20000,
      }),
    );
  });

  it("이름이 같아도 출처가 다르면 다른 그룹", () => {
    const { data } = aggregateDetailsBySource([
      row({ sourceId: "cls-1" }),
      row({ sourceId: "cls-2" }),
    ]);
    expect(data).toHaveLength(2);
  });

  it("환불은 건수·양수 금액으로 따로 집계하고 수수료·지급액은 상계", () => {
    const { data, meta } = aggregateDetailsBySource([
      row({ paymentAmount: 10000, feeAmount: 300, actualAmount: 9700 }),
      row({
        entryType: "REFUND",
        paymentAmount: -3000,
        feeAmount: -90,
        actualAmount: -2910,
      }),
    ]);
    expect(data[0]).toEqual(
      expect.objectContaining({
        paymentCount: 1,
        paymentAmount: 10000,
        refundCount: 1,
        refundAmount: 3000,
        feeAmount: 210,
        netAmount: 6790,
      }),
    );
    expect(meta.totals.netAmount).toBe(6790);
    expect(meta.groupCount).toBe(1);
  });

  it("결제 수수료는 플랫폼 수수료와 따로 합산하고 환불 환급분을 상계한다", () => {
    const { data, meta } = aggregateDetailsBySource([
      row({ paymentAmount: 30000, pgFeeAmount: 330, actualAmount: 29670 }),
      row({
        entryType: "REFUND",
        paymentAmount: -9000,
        pgFeeAmount: -99,
        actualAmount: -8901,
      }),
    ]);
    expect(data[0]).toEqual(
      expect.objectContaining({
        feeAmount: 0,
        pgFeeAmount: 231,
        netAmount: 20769,
      }),
    );
    expect(meta.totals.pgFeeAmount).toBe(231);
  });

  it("OTHER 는 상품명으로 묶고 sourceId=null", () => {
    const { data } = aggregateDetailsBySource([
      row({ sourceType: "OTHER", sourceId: null, productName: "알 수 없음" }),
      row({ sourceType: "OTHER", sourceId: null, productName: "알 수 없음" }),
      row({ sourceType: "OTHER", sourceId: null, productName: "기타" }),
    ]);
    expect(data).toHaveLength(2);
    expect(
      data.every((g) => g.sourceType === "OTHER" && g.sourceId === null),
    ).toBe(true);
  });

  it("sourceId 가 없는 행은 종류를 유지한 채 상품명으로 묶는다", () => {
    const { data } = aggregateDetailsBySource([
      row({ sourceType: "CLASS", sourceId: null, productName: "화요반" }),
      row({ sourceType: "OTHER", sourceId: null, productName: "화요반" }),
    ]);
    expect(data).toHaveLength(2);
    expect(data.map((g) => [g.sourceType, g.sourceId])).toEqual(
      expect.arrayContaining([
        ["CLASS", null],
        ["OTHER", null],
      ]),
    );
  });

  it("지급액 내림차순, 같으면 이름순", () => {
    const { data } = aggregateDetailsBySource([
      row({ sourceId: "a", productName: "나", actualAmount: 100 }),
      row({ sourceId: "b", productName: "가", actualAmount: 100 }),
      row({ sourceId: "c", productName: "다", actualAmount: 500 }),
    ]);
    expect(data.map((g) => g.name)).toEqual(["다", "가", "나"]);
  });
});
