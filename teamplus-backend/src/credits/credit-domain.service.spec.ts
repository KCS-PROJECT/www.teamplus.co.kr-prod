import { CreditDomainService } from "./credit-domain.service";

/**
 * [Major 5] refundSessions 원자 증감 검증 — read-modify-write 경쟁 유실 방지.
 *  부분 환불은 updateMany(decrement + gte 가드), 경쟁 시 현재값 기준 안전 감소로 폴백.
 *  전액 환불은 usedSessions=0 블라인드 원자 write.
 */
describe("CreditDomainService.refundSessions — 원자 증감", () => {
  const service = new CreditDomainService();

  function makeTx(credit: { totalSessions: number; usedSessions: number }) {
    let current = { ...credit };
    return {
      memberCredit: {
        findUnique: jest.fn().mockResolvedValue(credit),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      creditTransaction: { create: jest.fn() },
      _setCurrent: (c: { totalSessions: number; usedSessions: number }) => {
        current = c;
      },
    } as any;
  }

  it("부분 환불 → updateMany decrement + gte 가드(원자 감소)", async () => {
    const tx = makeTx({ totalSessions: 8, usedSessions: 5 });
    tx.memberCredit.findUniqueOrThrow.mockResolvedValue({
      totalSessions: 8,
      usedSessions: 3,
    });

    const res = await service.refundSessions(tx, {
      memberCreditId: "c1",
      sessionsToRestore: 2,
      isFullRefund: false,
      reason: "부분",
    });

    // 절대값 update 아님 — decrement 원자 감소.
    expect(tx.memberCredit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", usedSessions: { gte: 2 } },
        data: { usedSessions: { decrement: 2 } },
      }),
    );
    expect(res.sessionsRestored).toBe(2);
  });

  it("부분 환불 경쟁(첫 guarded decrement count 0) → 재조회 후 guarded 재시도(안전 감소)", async () => {
    const tx = makeTx({ totalSessions: 8, usedSessions: 5 });
    // 첫 시도(safe=3) 경쟁 실패, 두번째 시도(재조회 usedSessions=1, safe=1) 성공.
    tx.memberCredit.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    tx.memberCredit.findUniqueOrThrow
      .mockResolvedValueOnce({ usedSessions: 1 }) // 재시도 재조회
      .mockResolvedValue({ totalSessions: 8, usedSessions: 0 }); // 최종 조회

    const res = await service.refundSessions(tx, {
      memberCreditId: "c1",
      sessionsToRestore: 3,
      isFullRefund: false,
      reason: "부분",
    });

    // 폴백도 guarded updateMany(decrement + gte) — unguarded update 없음.
    expect(tx.memberCredit.update).not.toHaveBeenCalled();
    expect(tx.memberCredit.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "c1", usedSessions: { gte: 1 } },
        data: { usedSessions: { decrement: 1 } },
      }),
    );
    expect(res.sessionsRestored).toBe(1);
  });

  it("부분 환불 경쟁 3회 실패 → typed error(무한루프 금지)", async () => {
    const tx = makeTx({ totalSessions: 8, usedSessions: 5 });
    tx.memberCredit.updateMany.mockResolvedValue({ count: 0 });
    tx.memberCredit.findUniqueOrThrow.mockResolvedValue({ usedSessions: 5 });

    await expect(
      service.refundSessions(tx, {
        memberCreditId: "c1",
        sessionsToRestore: 3,
        isFullRefund: false,
        reason: "부분",
      }),
    ).rejects.toThrow(/CREDIT_REFUND_CONTENTION/);
  });

  it("전액 환불 → 관찰값 CAS(where usedSessions:X → 0), delta=X 기록", async () => {
    const tx = makeTx({ totalSessions: 8, usedSessions: 5 });
    tx.memberCredit.updateMany.mockResolvedValue({ count: 1 });
    tx.memberCredit.findUniqueOrThrow.mockResolvedValue({
      totalSessions: 8,
      usedSessions: 0,
    });

    const res = await service.refundSessions(tx, {
      memberCreditId: "c1",
      sessionsToRestore: 8,
      isFullRefund: true,
      reason: "전액",
    });

    // 관찰값(5) CAS.
    expect(tx.memberCredit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", usedSessions: 5 },
        data: { usedSessions: 0 },
      }),
    );
    // delta = 실제 회수량(5).
    expect(res.sessionsRestored).toBe(5);
    expect(tx.creditTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 5 }) }),
    );
    expect(tx.memberCredit.update).not.toHaveBeenCalled();
  });

  it("전액 환불 경쟁(CAS count 0) → 재조회 재시도 후 성공(delta=재조회값)", async () => {
    const tx = makeTx({ totalSessions: 8, usedSessions: 5 });
    tx.memberCredit.updateMany
      .mockResolvedValueOnce({ count: 0 }) // 관찰 5 CAS 실패(동시 변경)
      .mockResolvedValueOnce({ count: 1 }); // 재조회 6 CAS 성공
    tx.memberCredit.findUniqueOrThrow
      .mockResolvedValueOnce({ usedSessions: 6 }) // 재시도 재조회
      .mockResolvedValue({ totalSessions: 8, usedSessions: 0 });

    const res = await service.refundSessions(tx, {
      memberCreditId: "c1",
      sessionsToRestore: 8,
      isFullRefund: true,
      reason: "전액",
    });

    expect(tx.memberCredit.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "c1", usedSessions: 6 } }),
    );
    expect(res.sessionsRestored).toBe(6);
  });
});

/**
 * [Codex R3-B1] bulkRestoreOne — 원장·반환 id 는 DB RETURNING(실제 갱신 성공 row)
 *  에서만 파생. 사전 조회 목록 기반 파생은 경쟁 writer 개입 시 실패 id 를 성공으로
 *  오인한다.
 */
describe("CreditDomainService.bulkRestoreOne — RETURNING 기반 성공 결합", () => {
  const service = new CreditDomainService();

  function makeTx(returningRows: unknown[]) {
    return {
      $queryRaw: jest.fn().mockResolvedValue(returningRows),
      creditTransaction: {
        createMany: jest.fn().mockResolvedValue({ count: returningRows.length }),
      },
    } as any;
  }

  it("부분 성공 — RETURNING 에 없는 실패 id 는 원장·반환에서 제외된다", async () => {
    // 요청 2건 중 DB 가 실제로 감소시킨 것은 c1 뿐 (c2 는 경쟁으로 used_sessions=0).
    const tx = makeTx([{ id: "c1", total_sessions: 4, used_sessions: 0 }]);

    const res = await service.bulkRestoreOne(tx, {
      creditIds: ["c1", "c2"],
      reason: "취소 복원",
      adjustedBy: "coach-1",
      scheduleId: "sch-1",
    });

    expect(res.restoredCount).toBe(1);
    expect(res.restoredCreditIds).toEqual(["c1"]);
    // CreditTransaction 도 성공 row(c1)만 — 실패 c2 원장 기록 없음.
    expect(tx.creditTransaction.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          memberCreditId: "c1",
          type: "restored",
          balanceAfter: 4,
        }),
      ],
    });
  });

  it("전건 실패(RETURNING 0행) — 원장 기록 없이 빈 결과", async () => {
    const tx = makeTx([]);

    const res = await service.bulkRestoreOne(tx, {
      creditIds: ["c1"],
      reason: "취소 복원",
      adjustedBy: "coach-1",
    });

    expect(res).toEqual({ restoredCount: 0, restoredCreditIds: [] });
    expect(tx.creditTransaction.createMany).not.toHaveBeenCalled();
  });

  it("빈 입력 — 쿼리 자체를 실행하지 않는다", async () => {
    const tx = makeTx([]);
    const res = await service.bulkRestoreOne(tx, {
      creditIds: [],
      reason: "r",
      adjustedBy: "a",
    });
    expect(res).toEqual({ restoredCount: 0, restoredCreditIds: [] });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("raw UPDATE 가 updated_at 을 함께 갱신한다 — @updatedAt 우회 회귀 방지 (R4-RG-01)", async () => {
    const tx = makeTx([{ id: "c1", total_sessions: 4, used_sessions: 0 }]);

    await service.bulkRestoreOne(tx, {
      creditIds: ["c1"],
      reason: "취소 복원",
      adjustedBy: "coach-1",
    });

    // $queryRaw 첫 인자 = SQL 템플릿 조각 — updated_at 명시 갱신이 포함되어야 한다.
    const sqlParts = (tx.$queryRaw.mock.calls[0][0] as string[]).join("?");
    expect(sqlParts).toContain("used_sessions = used_sessions - 1");
    expect(sqlParts).toContain("updated_at = CURRENT_TIMESTAMP");
  });
});
