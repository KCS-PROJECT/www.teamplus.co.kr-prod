import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { TournamentsService } from "./tournaments.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * 작업 A BE-1 — getTournamentRegistrations 파생 필드(5-state·billingTiming·금액) 회귀 스펙.
 *
 * 증명 대상:
 *  1) 팀 허브(computeTournamentSummaries)와 동일한 resolveTournamentAttribution 로
 *     각 행이 PAID/PENDING(BILLED)/UNPAID(UNSETTLED)/CANCELLED/REFUNDED 파생을 갖는지.
 *  2) 레거시 키(paymentStatus·orderNumber·calculatedFee·payment) Dual Emit 보존.
 *  3) CANCELLED/REFUNDED 명단 보존(where 필터 제거) — 조회 전체 로드.
 *  4) IDOR 가드(assertManageableTournamentRecord) 유지.
 */
describe("TournamentsService.getTournamentRegistrations — 파생 필드/명단 보존", () => {
  const requester: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };

  const makePrismaMock = () => ({
    tournament: { findUnique: jest.fn() },
    tournamentRegistration: { findMany: jest.fn() },
  });

  const makeAccessMock = (reject: boolean) => ({
    assertManageableTournamentRecord: reject
      ? jest.fn().mockRejectedValue(new ForbiddenException("no"))
      : jest.fn().mockResolvedValue(undefined),
  });

  const makeService = (prisma: any, access: any) =>
    new TournamentsService(prisma, {} as any, access, {} as any);

  // KST 2026-03-10 15:00 → UTC 06:00. 귀속월 2026-03.
  const march = new Date("2026-03-10T06:00:00.000Z");

  const buildReg = (over: Record<string, any>) => ({
    id: "reg-x",
    userId: "u-x",
    childId: null,
    gamesCount: 2,
    calculatedFee: new Decimal(30000),
    paymentStatus: "PAID",
    registeredAt: march,
    user: { id: "u-x", firstName: "길동", lastName: "홍" },
    child: null,
    payment: {
      id: "pay-x",
      orderNumber: "ORD-1",
      paymentStatus: "completed",
      amount: new Decimal(30000),
      completedAt: march,
      createdAt: march,
      refundLogs: [],
    },
    ...over,
  });

  it("POSTPAID 대회 — 5-state 전 케이스 파생 + 레거시 키 보존", async () => {
    const prisma = makePrismaMock();
    prisma.tournament.findUnique.mockResolvedValue({
      id: "trn-1",
      teamId: "team-1",
      billingMode: "POSTPAID",
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });

    prisma.tournamentRegistration.findMany.mockResolvedValue([
      buildReg({
        id: "r-paid",
        paymentStatus: "PAID",
        payment: {
          id: "p1",
          orderNumber: "ORD-P",
          paymentStatus: "completed",
          amount: new Decimal(30000),
          completedAt: march,
          createdAt: march,
          refundLogs: [],
        },
      }),
      buildReg({
        id: "r-pending",
        paymentStatus: "PENDING",
        payment: {
          id: "p2",
          orderNumber: "ORD-B",
          paymentStatus: "pending",
          amount: new Decimal(30000),
          completedAt: null,
          createdAt: march,
          refundLogs: [],
        },
      }),
      buildReg({
        id: "r-unpaid",
        paymentStatus: "UNPAID",
        // UNPAID 은 실제로 payment 없이도 오지만(명단 보존), endDate 폴백 귀속.
        payment: null,
      }),
      buildReg({
        id: "r-cancelled",
        paymentStatus: "CANCELLED",
        payment: {
          id: "p4",
          orderNumber: "ORD-C",
          paymentStatus: "cancelled",
          amount: new Decimal(30000),
          completedAt: null,
          createdAt: march,
          refundLogs: [],
        },
      }),
      buildReg({
        id: "r-refunded",
        paymentStatus: "REFUNDED",
        payment: {
          id: "p5",
          orderNumber: "ORD-R",
          paymentStatus: "refunded",
          amount: new Decimal(30000),
          completedAt: march,
          createdAt: march,
          refundLogs: [{ refundAmount: 30000 }],
        },
      }),
    ]);

    const res = await prismaCall(prisma);

    // where 필터 없이 전 상태 로드(명단 보존).
    expect(prisma.tournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tournamentId: "trn-1" } }),
    );

    expect(res.billingMode).toBe("POSTPAID");
    expect(res.total).toBe(5);

    const byId = Object.fromEntries(res.registrations.map((r: any) => [r.id, r]));

    // PAID
    expect(byId["r-paid"].billingStatus).toBe("PAID");
    expect(byId["r-paid"].billingTiming).toBe("POSTPAID");
    expect(byId["r-paid"].billedAmount).toBe(30000);
    expect(byId["r-paid"].paidAmount).toBe(30000);
    expect(byId["r-paid"].refundedAmount).toBe(0);
    expect(byId["r-paid"].estimatedAmount).toBeNull();
    expect(byId["r-paid"].paidAt).toEqual(march);
    // Dual Emit — 레거시 키 보존.
    expect(byId["r-paid"].paymentStatus).toBe("PAID");
    expect(byId["r-paid"].payment.orderNumber).toBe("ORD-P");
    expect(byId["r-paid"].calculatedFee).toBeInstanceOf(Decimal);

    // PENDING → BILLED
    expect(byId["r-pending"].billingStatus).toBe("BILLED");
    expect(byId["r-pending"].billedAmount).toBe(30000);
    expect(byId["r-pending"].paidAmount).toBe(0);
    expect(byId["r-pending"].paidAt).toBeNull();

    // UNPAID → UNSETTLED (estimated = amount, billed null)
    expect(byId["r-unpaid"].billingStatus).toBe("UNSETTLED");
    expect(byId["r-unpaid"].billedAmount).toBeNull();
    expect(byId["r-unpaid"].paidAmount).toBe(0);
    expect(byId["r-unpaid"].estimatedAmount).toBe(30000);

    // CANCELLED (명단 보존)
    expect(byId["r-cancelled"].billingStatus).toBe("CANCELLED");
    expect(byId["r-cancelled"].billedAmount).toBeNull();
    expect(byId["r-cancelled"].paidAmount).toBe(0);

    // REFUNDED (전액 환불 → net 0)
    expect(byId["r-refunded"].billingStatus).toBe("REFUNDED");
    expect(byId["r-refunded"].refundedAmount).toBe(30000);
    expect(byId["r-refunded"].paidAmount).toBe(0);
    expect(byId["r-refunded"].paidAt).toBeNull();
  });

  it("레거시 취소 형태(registration=CANCELLED·payment=refunded·refundLogs=[]) → paidAmount 0 · refundedAmount=amount", async () => {
    // PG 미연동 시절 cancelRegistration 이 만든 레거시 행(RefundLog 없음)은 로그 부재를
    //  전액 환불로 해석해야 이름은 명단에 남되(REFUNDED) 순수납은 0 이 된다.
    const prisma = makePrismaMock();
    prisma.tournament.findUnique.mockResolvedValue({
      id: "trn-3",
      teamId: "team-1",
      billingMode: "POSTPAID",
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });
    prisma.tournamentRegistration.findMany.mockResolvedValue([
      buildReg({
        id: "r-real-cancel",
        paymentStatus: "CANCELLED",
        payment: {
          id: "p-rc",
          orderNumber: "ORD-RC",
          paymentStatus: "refunded",
          amount: new Decimal(30000),
          completedAt: march,
          createdAt: march,
          refundLogs: [], // 실제 취소 = 로그 없음
        },
      }),
    ]);

    const res = await prismaCall(prisma);
    const row = res.registrations[0];

    // 명단 보존(REFUNDED 로 표시)되나 순수납 0.
    expect(row.billingStatus).toBe("REFUNDED");
    expect(row.refundedAmount).toBe(30000); // 로그 부재 → 전액 환불
    expect(row.billedAmount).toBeNull();
    expect(row.paidAmount).toBe(0);
    expect(row.paidAt).toBeNull();
  });

  it("PREPAID 대회 — billingTiming 상속(PREPAID)", async () => {
    const prisma = makePrismaMock();
    prisma.tournament.findUnique.mockResolvedValue({
      id: "trn-2",
      teamId: "team-1",
      billingMode: "PREPAID",
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });
    prisma.tournamentRegistration.findMany.mockResolvedValue([
      buildReg({ id: "r-p", paymentStatus: "PAID" }),
    ]);

    const res = await new TournamentsService(
      prisma as any,
      {} as any,
      makeAccessMock(false) as any,
      {} as any,
    ).getTournamentRegistrations("trn-2", requester);

    expect(res.billingMode).toBe("PREPAID");
    expect(res.registrations[0].billingTiming).toBe("PREPAID");
    expect(res.registrations[0].billingStatus).toBe("PAID");
  });

  it("IDOR — 관리 권한 단언 거부 시 참가자 조회 미수행", async () => {
    const prisma = makePrismaMock();
    prisma.tournament.findUnique.mockResolvedValue({
      id: "trn-1",
      teamId: "team-1",
      billingMode: "POSTPAID",
      endDate: null,
    });
    const service = makeService(prisma, makeAccessMock(true));
    await expect(
      service.getTournamentRegistrations("trn-1", requester),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.tournamentRegistration.findMany).not.toHaveBeenCalled();
  });

  // 헬퍼 — 접근 허용 서비스로 호출.
  async function prismaCall(prisma: any) {
    const service = makeService(prisma, makeAccessMock(false));
    return service.getTournamentRegistrations("trn-1", requester);
  }
});

/**
 * 일정 미정(기간 null) 대회 — C-1 재설계 회귀 스펙.
 *
 * 증명 대상:
 *  1) 경기 0건 + endDate null 대회는 신청 접수 가능(assertTournamentRegistrationOpen 통과).
 *  2) 기간 null 은 날짜 기반 종료/진행 판정을 건너뛴다(mapStudentTournamentStatus).
 *  3) startDate null 이면 "대회 당일 취소 불가" 가드가 적용되지 않아 취소 가능.
 */
describe("TournamentsService — 일정 미정(기간 null) 대회", () => {
  const makeService = (prisma: any, refund?: any) =>
    new TournamentsService(prisma, {} as any, {} as any, refund ?? ({} as any));

  it("경기 0건 + endDate null — 참가 신청 가드 통과", async () => {
    const prisma = {
      hockeyMatch: {
        aggregate: jest.fn().mockResolvedValue({ _min: { scheduledAt: null } }),
      },
    };
    const service = makeService(prisma);
    await expect(
      (service as any).assertTournamentRegistrationOpen("trn-tbd", null),
    ).resolves.toBeUndefined();
  });

  it("기간 null — 날짜 판정 없이 status·마감 기준만 적용", () => {
    const service = makeService({});
    const now = new Date("2026-03-10T06:00:00.000Z");
    const call = (status: string, deadline: Date | null) =>
      (service as any).mapStudentTournamentStatus(
        status,
        null,
        null,
        deadline,
        0,
        null,
        now,
      );
    expect(call("scheduled", null)).toBe("UPCOMING");
    expect(call("scheduled", new Date("2026-04-01T00:00:00.000Z"))).toBe("OPEN");
    expect(call("finished", null)).toBe("COMPLETED");
    expect(call("ongoing", null)).toBe("IN_PROGRESS");
  });

  it("startDate null + 경기 0건 — 날짜 가드 미적용, 취소 성공", async () => {
    const tx = {
      payment: { update: jest.fn() },
      tournamentRegistration: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      tournamentRegistration: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reg-1",
          tournamentId: "trn-tbd",
          userId: "u-1",
          paymentStatus: "PENDING",
          paymentId: null,
          tournament: { startDate: null, status: "scheduled" },
        }),
      },
      hockeyMatch: {
        aggregate: jest.fn().mockResolvedValue({ _min: { scheduledAt: null } }),
      },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = makeService(prisma);
    const res = await service.cancelRegistration("trn-tbd", "reg-1", "u-1");
    expect(res.refunded).toBe(false);
    expect(tx.tournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paymentStatus: "CANCELLED" }),
      }),
    );
  });

  it("PAID 취소 — 환불 엔진(cancelPayment)에 위임, 등록 상태는 엔진 트랜잭션이 동기화", async () => {
    const refund = {
      cancelPayment: jest.fn().mockResolvedValue({
        id: "rl-1",
        paymentId: "pay-1",
        refundAmount: 30000,
        paymentStatus: "refunded",
      }),
    };
    const prisma = {
      tournamentRegistration: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reg-1",
          tournamentId: "trn-tbd",
          userId: "u-1",
          paymentStatus: "PAID",
          paymentId: "pay-1",
          tournament: { startDate: null, status: "scheduled" },
        }),
      },
      hockeyMatch: {
        aggregate: jest.fn().mockResolvedValue({ _min: { scheduledAt: null } }),
      },
      $transaction: jest.fn(),
    };
    const service = makeService(prisma, refund);
    const res = await service.cancelRegistration("trn-tbd", "reg-1", "u-1");

    expect(res.refunded).toBe(true);
    expect(refund.cancelPayment).toHaveBeenCalledWith(
      "pay-1",
      expect.any(String),
      undefined,
      undefined,
      undefined,
      undefined,
      { id: "u-1" },
      { actorId: "u-1" },
    );
    // 등록 REFUNDED 전환은 엔진 트랜잭션 내부 담당 — 서비스가 직접 갱신하지 않는다.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("PAID 취소 — PG 환불 실패 시 예외 전파, 등록 상태 미변경", async () => {
    const refund = {
      cancelPayment: jest
        .fn()
        .mockRejectedValue(new BadRequestException("토스 결제 취소에 실패했습니다.")),
    };
    const prisma = {
      tournamentRegistration: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reg-1",
          tournamentId: "trn-tbd",
          userId: "u-1",
          paymentStatus: "PAID",
          paymentId: "pay-1",
          tournament: { startDate: null, status: "scheduled" },
        }),
      },
      hockeyMatch: {
        aggregate: jest.fn().mockResolvedValue({ _min: { scheduledAt: null } }),
      },
      $transaction: jest.fn(),
    };
    const service = makeService(prisma, refund);
    await expect(
      service.cancelRegistration("trn-tbd", "reg-1", "u-1"),
    ).rejects.toThrow("토스 결제 취소에 실패했습니다.");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("REFUNDED 등록 — 승인제 환불 기완료 건 중복 취소 차단", async () => {
    const prisma = {
      tournamentRegistration: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reg-1",
          tournamentId: "trn-tbd",
          userId: "u-1",
          paymentStatus: "REFUNDED",
          paymentId: "pay-1",
          tournament: { startDate: null, status: "scheduled" },
        }),
      },
      hockeyMatch: { aggregate: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = makeService(prisma);
    await expect(
      service.cancelRegistration("trn-tbd", "reg-1", "u-1"),
    ).rejects.toThrow("이미 취소된 등록입니다.");
  });

  it("startDate null 이라도 첫 경기가 시작됐으면 사후 취소 차단(경기 폴백)", async () => {
    const prisma = {
      tournamentRegistration: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reg-1",
          tournamentId: "trn-tbd",
          userId: "u-1",
          paymentStatus: "PAID",
          paymentId: "pay-1",
          tournament: { startDate: null, status: "scheduled" },
        }),
      },
      hockeyMatch: {
        aggregate: jest.fn().mockResolvedValue({
          _min: { scheduledAt: new Date(Date.now() - 60 * 60 * 1000) },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = makeService(prisma);
    await expect(
      service.cancelRegistration("trn-tbd", "reg-1", "u-1"),
    ).rejects.toThrow("대회가 시작된 후에는");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("startDate null + status finished — 취소 차단", async () => {
    const prisma = {
      tournamentRegistration: {
        findUnique: jest.fn().mockResolvedValue({
          id: "reg-1",
          tournamentId: "trn-tbd",
          userId: "u-1",
          paymentStatus: "PAID",
          paymentId: "pay-1",
          tournament: { startDate: null, status: "finished" },
        }),
      },
      hockeyMatch: { aggregate: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = makeService(prisma);
    await expect(
      service.cancelRegistration("trn-tbd", "reg-1", "u-1"),
    ).rejects.toThrow("대회가 시작된 후에는");
    expect(prisma.hockeyMatch.aggregate).not.toHaveBeenCalled();
  });
});

/**
 * 기간(startDate/endDate) 쌍 계약 — C-1 재설계 핵심 회귀 스펙.
 *  · create: 한쪽만 전송 → 400.
 *  · update: null 명시 → 기간 해제(DB write 에 null 이 정확히 도달 — whitelist/ValidateIf
 *    조합이 null 을 undefined 로 뭉개는 회귀 차단).
 *  · update: 한쪽만 null → 400.
 */
describe("TournamentsService — 기간 쌍(both-or-neither) 계약", () => {
  const requester: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };

  const baseTournament = {
    id: "trn-1",
    name: "기존 대회",
    description: null,
    teamId: "team-1",
    rinkId: null,
    venueId: null,
    startDate: new Date("2099-01-01T00:00:00.000Z"),
    endDate: new Date("2099-01-02T00:00:00.000Z"),
    status: "scheduled",
    eligibleBirthYearFrom: null,
    eligibleBirthYearTo: null,
    eligibleBirthYears: [] as number[],
    feePerGame: null,
    totalGames: null,
    feeType: null,
    maxParticipants: null,
    registrationDeadline: null,
    ageGroup: null,
    selectedParticipantIds: [] as string[],
    eligibleGroupIds: [] as string[],
    rules: null,
    location: null,
    prizeAmount: null,
    billingMode: "PREPAID",
  };

  const makeAccess = () => ({
    assertManageableTournamentRecord: jest.fn().mockResolvedValue(undefined),
    assertTeamManager: jest.fn().mockResolvedValue(undefined),
  });

  it("create — 한쪽만 전송(startDate만) → 400", async () => {
    const service = new TournamentsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.createTournament(
        { name: "새 대회", startDate: "2026-09-01" } as any,
        requester,
      ),
    ).rejects.toThrow("함께 입력하거나 함께 비워야");
  });

  it("update — null 명시 전송 시 기간 해제(write 에 null 도달)", async () => {
    // [2026-08-20] 기간 변경 요청은 경기 정합 검증(hockeyMatch.findMany)과
    //   단일 트랜잭션($transaction 패스스루)을 거친다 — 경기 0건이라 해제 허용.
    const prisma: any = {
      tournament: {
        findUnique: jest.fn().mockResolvedValue({ ...baseTournament }),
        update: jest.fn().mockResolvedValue({ ...baseTournament }),
      },
      hockeyMatch: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    const service = new TournamentsService(
      prisma as any,
      {} as any,
      makeAccess() as any,
      {} as any,
    );
    await service.updateTournament(
      "trn-1",
      { startDate: null, endDate: null } as any,
      requester,
    );
    expect(prisma.tournament.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ startDate: null, endDate: null }),
      }),
    );
  });

  it("update — 한쪽만 null(기존 반대쪽 유지) → 400", async () => {
    const prisma = {
      tournament: {
        findUnique: jest.fn().mockResolvedValue({ ...baseTournament }),
        update: jest.fn(),
      },
    };
    const service = new TournamentsService(
      prisma as any,
      {} as any,
      makeAccess() as any,
      {} as any,
    );
    await expect(
      service.updateTournament("trn-1", { startDate: null } as any, requester),
    ).rejects.toThrow("함께 설정하거나 함께 비워야");
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });
});

/**
 * 참가 대상 전체(빈 명단) 정책 — 2026-08-07 확장 회귀 스펙.
 *  · 빈 명단 = 전체(팀 선수 전원) 허용. 단 teamId 없는 대회는 노출 폴백(팀 기준)이
 *    동작하지 않아 유령 대회가 되므로 생성/수정 모두 400 차단.
 */
describe("TournamentsService — 참가 대상 전체(빈 명단) 계약", () => {
  const admin: JwtUserPayload = {
    id: "admin-1",
    email: "admin@t.dev",
    userType: "ADMIN",
  };
  const coach: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };

  const makeAccess = () => ({
    assertManageableTournamentRecord: jest.fn().mockResolvedValue(undefined),
    assertTeamManager: jest.fn().mockResolvedValue(undefined),
  });

  it("create — teamId 없음 + 빈 명단 → 400 (유령 대회 차단)", async () => {
    const prisma = {
      team: { findFirst: jest.fn().mockResolvedValue(null) },
      teamMember: { findFirst: jest.fn().mockResolvedValue(null) },
      tournament: { create: jest.fn() },
    };
    const service = new TournamentsService(
      prisma as any,
      {} as any,
      makeAccess() as any,
      {} as any,
    );
    await expect(
      service.createTournament({ name: "전역 대회" } as any, admin),
    ).rejects.toThrow("주최 팀이 없는 대회는");
    expect(prisma.tournament.create).not.toHaveBeenCalled();
  });

  it("create — teamId 있음 + 빈 명단 → 전체 허용 대회 생성(파생 자격 클리어)", async () => {
    // [2026-08-20] 생성은 경기 일정과 단일 트랜잭션 — $transaction 패스스루 필요.
    const prisma: any = {
      team: { findUnique: jest.fn().mockResolvedValue({ id: "team-1" }) },
      tournament: {
        create: jest
          .fn()
          .mockResolvedValue({ id: "trn-all", name: "전체 대회" }),
      },
    };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    const notifications = { notifyTeamParents: jest.fn() };
    const service = new TournamentsService(
      prisma as any,
      notifications as any,
      makeAccess() as any,
      {} as any,
    );
    await service.createTournament(
      { name: "전체 대회", teamId: "team-1" } as any,
      coach,
    );
    expect(prisma.tournament.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          selectedParticipantIds: [],
          eligibleBirthYears: [],
        }),
      }),
    );
  });

  it("update — teamId null 대회에서 명단을 비우면 400", async () => {
    const prisma = {
      tournament: {
        findUnique: jest.fn().mockResolvedValue({
          id: "trn-1",
          name: "전역 대회",
          teamId: null,
          startDate: null,
          endDate: null,
          status: "scheduled",
          ageGroup: null,
          eligibleBirthYearFrom: null,
          eligibleBirthYearTo: null,
          eligibleBirthYears: [],
          selectedParticipantIds: ["u-1"],
          eligibleGroupIds: [],
          billingMode: "PREPAID",
        }),
        update: jest.fn(),
      },
    };
    const service = new TournamentsService(
      prisma as any,
      {} as any,
      makeAccess() as any,
      {} as any,
    );
    await expect(
      service.updateTournament(
        "trn-1",
        { selectedParticipantIds: [] } as any,
        admin,
      ),
    ).rejects.toThrow("주최 팀이 없는 대회는");
    expect(prisma.tournament.update).not.toHaveBeenCalled();
  });
});
