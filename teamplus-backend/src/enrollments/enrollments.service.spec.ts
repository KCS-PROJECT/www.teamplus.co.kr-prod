import { BadRequestException, ConflictException } from "@nestjs/common";
import { EnrollmentsService } from "./enrollments.service";

/**
 * 취소 원자화 · 상태 전이 재확인 · 상품 검증 단위 계약.
 *   - cancelEnrollment: 취소 가능 상태(pending/pending_approval/approved)만 전이하고, 명단은
 *     active 행만 해지하며, 좌석이 실제로 비었을 때만 대기자 승격을 호출한다.
 *   - approve/reject: 전이 직전 상태 재확인(그 사이 취소되면 409).
 *   - resolveSelectedProductTiming: 소속 · 공용 판매 가드 · 판매 월분 · 결제방식 일치 · BOTH 상품 필수.
 */
describe("EnrollmentsService — 취소 원자화 · 전이 재확인 · 상품 검증", () => {
  const userId = "parent-1";
  const enrollmentId = "enr-1";
  const detail = (status: string, paymentId: string | null = null) => ({
    id: enrollmentId,
    status,
    classId: "class-1",
    childId: "child-1",
    requestedBy: userId,
    paymentId,
    expiresAt: new Date(Date.now() + 3_600_000),
    note: null,
  });

  type ProductRow = {
    classId: string;
    billingTiming: string;
    isActive: boolean;
    feeType?: string;
    durationDays?: number | null;
    billingMonth?: Date | null;
  };

  function build(opts: {
    status: string;
    transitionedCount?: number;
    releasedCount?: number;
    currentStatus?: string;
    product?: ProductRow | null;
    /** 취소 대상 등록에 연결된 결제 id (없으면 결제 무효화 미실행). */
    paymentId?: string | null;
    /** 명단 유지 판정에 쓰이는 "같은 자녀의 다른 등록" 행. */
    otherEnrollments?: unknown[];
    /** 트랜잭션 안에서 다시 읽은 결제 연결 — 결제 개시가 갈아끼운 경우를 재현한다. */
    relinkedPaymentId?: string | null;
    /** 연결 결제의 금액 — 0이면 무료 건(본인 취소 허용). */
    linkedPaymentAmount?: number;
    /** 신청 이후 지난 수업 회차 존재 — 있으면 본인 취소를 막는다(유료와 동일 기준). */
    hasElapsedSchedule?: boolean;
    /** 수업 유형 — spot 이면 월 귀속 판정을 건너뛴다. */
    trainingType?: string | null;
    salesOpenMonth?: Date | null;
  }) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      enrollment: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.transitionedCount ?? 1 }),
        findMany: jest.fn().mockResolvedValue(opts.otherEnrollments ?? []),
        findUnique: jest.fn().mockResolvedValue({
          paymentId:
            opts.relinkedPaymentId !== undefined
              ? opts.relinkedPaymentId
              : (opts.paymentId ?? null),
        }),
      },
      classRegistration: {
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.releasedCount ?? 0 }),
      },
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      class: {
        findUnique: jest.fn().mockResolvedValue({
          billingMode: "PREPAID",
          trainingType: opts.trainingType ?? "regular",
          salesOpenMonth: opts.salesOpenMonth ?? null,
        }),
      },
    };
    const prisma = {
      enrollment: {
        findUnique: jest.fn(
          async (args: { select?: Record<string, boolean> }) =>
            args?.select &&
            Object.keys(args.select).length === 1 &&
            args.select.status
              ? { status: opts.currentStatus ?? opts.status }
              : detail(opts.status, opts.paymentId ?? null),
        ),
        update: jest.fn(async () => ({
          ...detail("approved"),
          class: { className: "수업" },
        })),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: userId, userType: "PARENT" }),
      },
      parentChild: {
        findUnique: jest.fn().mockResolvedValue({
          parentId: userId,
          childId: "child-1",
          isPrimary: true,
        }),
      },
      payment: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.linkedPaymentAmount === undefined
              ? null
              : {
                  amount: opts.linkedPaymentAmount,
                  paymentStatus: "completed",
                },
          ),
      },
      classSchedule: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.hasElapsedSchedule ? { id: "sch-1" } : null),
      },
      classProduct: {
        findUnique: jest.fn().mockResolvedValue(
          opts.product
            ? {
                feeType: "PER_SESSION",
                durationDays: null,
                billingMonth: null,
                ...opts.product,
              }
            : null,
        ),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const waitlist = {
      promoteNextWaitlist: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      createNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EnrollmentsService(
      prisma as never,
      notifications as never,
      waitlist as never,
      {} as never,
    );
    return { service, prisma, tx, waitlist };
  }

  describe("cancelEnrollment", () => {
    it("결제 완료(paid) 건은 400 — 트랜잭션 진입 없음", async () => {
      const { service, prisma } = build({ status: "paid" });
      await expect(
        service.cancelEnrollment(userId, enrollmentId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each(["cancelled", "rejected", "expired"])(
      "종결(%s) 건은 400 '이미 취소/거절/만료' — 트랜잭션 진입 없음",
      async (status) => {
        const { service, prisma } = build({ status });
        await expect(
          service.cancelEnrollment(userId, enrollmentId),
        ).rejects.toThrow("이미 취소/거절/만료된 수강신청입니다.");
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it.each(["completed", "refunded"])(
      "돈이 오간 상태(%s)는 400 '취소할 수 없는 상태' — 취소로 덮지 않음",
      async (status) => {
        const { service, prisma } = build({ status });
        await expect(
          service.cancelEnrollment(userId, enrollmentId),
        ).rejects.toThrow("취소할 수 없는 수강신청 상태입니다.");
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it("approved 취소 — 취소 가능 상태 집합을 조건으로 전이, 명단은 active 행만 해지", async () => {
      const { service, tx } = build({ status: "approved", releasedCount: 1 });
      await service.cancelEnrollment(userId, enrollmentId);
      expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
        where: {
          id: enrollmentId,
          status: { in: ["pending", "pending_approval", "approved"] },
        },
        data: { status: "cancelled" },
      });
      expect(tx.classRegistration.updateMany).toHaveBeenCalledWith({
        where: { classId: "class-1", userId: "child-1", status: "active" },
        data: { status: "inactive" },
      });
    });

    it("좌석이 실제로 비었을 때(명단 해지 1건)만 대기자 승격", async () => {
      const seat = build({ status: "approved", releasedCount: 1 });
      await seat.service.cancelEnrollment(userId, enrollmentId);
      expect(seat.waitlist.promoteNextWaitlist).toHaveBeenCalledWith("class-1");

      const noSeat = build({ status: "pending", releasedCount: 0 });
      await noSeat.service.cancelEnrollment(userId, enrollmentId);
      expect(noSeat.waitlist.promoteNextWaitlist).not.toHaveBeenCalled();
    });

    it("전이 0건(동시 취소 패배) → 409, 명단·승격 미실행", async () => {
      const { service, tx, waitlist } = build({
        status: "approved",
        transitionedCount: 0,
      });
      await expect(
        service.cancelEnrollment(userId, enrollmentId),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.classRegistration.updateMany).not.toHaveBeenCalled();
      expect(waitlist.promoteNextWaitlist).not.toHaveBeenCalled();
    });

    it("좌석 잠금을 트랜잭션 선두에서 획득 — 늦은 승인과 직렬화", async () => {
      const { service, tx } = build({ status: "approved" });
      await service.cancelEnrollment(userId, enrollmentId);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("연결된 pending 결제를 취소 — 취소 뒤 결제창 완료 차단", async () => {
      const { service, tx } = build({
        status: "pending",
        paymentId: "pay-1",
      });
      await service.cancelEnrollment(userId, enrollmentId);
      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { id: "pay-1", paymentStatus: { in: ["pending"] } },
        data: { paymentStatus: "cancelled" },
      });
    });

    it("연결 결제가 없으면 결제 무효화를 시도하지 않는다", async () => {
      const { service, tx } = build({ status: "pending", paymentId: null });
      await service.cancelEnrollment(userId, enrollmentId);
      expect(tx.payment.updateMany).not.toHaveBeenCalled();
    });

    it("결제 완료(유료)는 400 — 환불 절차 안내", async () => {
      const { service, prisma } = build({
        status: "paid",
        paymentId: "pay-1",
        linkedPaymentAmount: 50000,
      });
      await expect(
        service.cancelEnrollment(userId, enrollmentId),
      ).rejects.toThrow("환불 절차를 통해 취소해주세요.");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("무료(0원) 결제 완료 건은 본인이 바로 취소 — 결제 이력도 취소로", async () => {
      const { service, tx } = build({
        status: "paid",
        paymentId: "pay-free",
        linkedPaymentAmount: 0,
        releasedCount: 1,
      });
      await service.cancelEnrollment(userId, enrollmentId);
      expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
        where: { id: enrollmentId, status: { in: ["paid"] } },
        data: { status: "cancelled" },
      });
      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { id: "pay-free", paymentStatus: { in: ["completed"] } },
        data: { paymentStatus: "cancelled" },
      });
    });

    it("무료라도 수업이 진행됐으면 본인 취소 불가 — 유료와 같은 이용 개시 기준", async () => {
      const { service, prisma } = build({
        status: "paid",
        paymentId: "pay-free",
        linkedPaymentAmount: 0,
        hasElapsedSchedule: true,
      });
      await expect(
        service.cancelEnrollment(userId, enrollmentId),
      ).rejects.toThrow("이미 수업이 진행되어 취소할 수 없습니다.");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("결제 개시가 새 결제로 재연결했으면 그 결제를 무효화한다(옛 결제 아님)", async () => {
      const { service, tx } = build({
        status: "pending",
        paymentId: "pay-old",
        relinkedPaymentId: "pay-new",
      });
      await service.cancelEnrollment(userId, enrollmentId);
      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { id: "pay-new", paymentStatus: { in: ["pending"] } },
        data: { paymentStatus: "cancelled" },
      });
    });

    it("같은 자녀에게 유효한 다른 등록이 있으면 명단을 유지한다(갱신 신청 취소)", async () => {
      const { service, tx, waitlist } = build({
        status: "pending",
        otherEnrollments: [
          {
            id: "enr-old",
            status: "paid",
            paidAt: new Date("2026-09-01T00:00:00Z"),
            billingMonth: new Date(Date.UTC(2026, 8, 1)),
            billingTiming: "PREPAID",
            product: {
              billingTiming: "PREPAID",
              feeType: "MONTHLY_FIXED",
              billingMonth: new Date(Date.UTC(2026, 8, 1)),
              price: 100000,
            },
            payment: {
              amount: 100000,
              paymentStatus: "completed",
              completedAt: new Date("2026-09-01T00:00:00Z"),
              createdAt: new Date("2026-09-01T00:00:00Z"),
              refundLogs: [],
            },
          },
        ],
        salesOpenMonth: new Date(Date.UTC(2026, 8, 1)),
      });
      await service.cancelEnrollment(userId, enrollmentId);
      expect(tx.classRegistration.updateMany).not.toHaveBeenCalled();
      expect(waitlist.promoteNextWaitlist).not.toHaveBeenCalled();
    });

    it("다른 등록이 만료 이력(지난 달 귀속)뿐이면 명단을 해지한다", async () => {
      const { service, tx } = build({
        status: "approved",
        releasedCount: 1,
        otherEnrollments: [
          {
            id: "enr-old",
            status: "paid",
            paidAt: new Date("2026-06-01T00:00:00Z"),
            billingMonth: new Date(Date.UTC(2026, 5, 1)),
            billingTiming: "PREPAID",
            product: {
              billingTiming: "PREPAID",
              feeType: "MONTHLY_FIXED",
              billingMonth: new Date(Date.UTC(2026, 5, 1)),
              price: 100000,
            },
            payment: {
              amount: 100000,
              paymentStatus: "completed",
              completedAt: new Date("2026-06-01T00:00:00Z"),
              createdAt: new Date("2026-06-01T00:00:00Z"),
              refundLogs: [],
            },
          },
        ],
        salesOpenMonth: new Date(Date.UTC(2026, 8, 1)),
      });
      await service.cancelEnrollment(userId, enrollmentId);
      expect(tx.classRegistration.updateMany).toHaveBeenCalledWith({
        where: { classId: "class-1", userId: "child-1", status: "active" },
        data: { status: "inactive" },
      });
    });
  });

  describe("approve / reject — 조건부 전이", () => {
    it("승인: 상태 유지 시 pending_approval 조건으로 update", async () => {
      const { service, prisma } = build({ status: "pending_approval" });
      await service.approveEnrollment(userId, enrollmentId, {} as never);
      expect(prisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: enrollmentId, status: "pending_approval" },
        }),
      );
    });

    it("승인: 재확인 뒤 update 가 0행(P2025) → 404 가 아니라 409", async () => {
      const { service, prisma } = build({ status: "pending_approval" });
      const { Prisma } = jest.requireActual("@prisma/client");
      prisma.enrollment.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("no row", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
      await expect(
        service.approveEnrollment(userId, enrollmentId, {} as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("거절: 조건부 update 가 0행(P2025) → 409", async () => {
      const { service, prisma } = build({ status: "pending_approval" });
      const { Prisma } = jest.requireActual("@prisma/client");
      prisma.enrollment.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("no row", {
          code: "P2025",
          clientVersion: "test",
        }),
      );
      await expect(
        service.rejectEnrollment(userId, enrollmentId, {} as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("resolveSelectedProductTiming", () => {
    const month = new Date(Date.UTC(2026, 8, 1));
    const call = (opts: {
      billingMode?: string;
      salesOpenMonth?: Date | null;
      classProductId?: string;
      product?: ProductRow | null;
    }) => {
      const { service, prisma } = build({
        status: "approved",
        product: opts.product,
      });
      const run = (service as any).resolveSelectedProductTiming(
        "class-1",
        opts.billingMode ?? "POSTPAID",
        opts.salesOpenMonth === undefined
          ? [month]
          : opts.salesOpenMonth
            ? [opts.salesOpenMonth]
            : [],
        opts.classProductId,
      ) as Promise<{ billingTiming: string } | null>;
      return { run, prisma };
    };

    it("상품 미선택 → null, 조회 0회", async () => {
      const { run, prisma } = call({});
      await expect(run).resolves.toBeNull();
      expect(prisma.classProduct.findUnique).not.toHaveBeenCalled();
    });

    it("BOTH 수업에서 상품 미선택 → 400 '선불/후불을 선택'", async () => {
      const { run } = call({ billingMode: "BOTH" });
      await expect(run).rejects.toThrow("선불/후불을 선택해주세요.");
    });

    it("다른 수업 상품 → 400", async () => {
      const { run } = call({
        classProductId: "prod-1",
        product: {
          classId: "other",
          billingTiming: "POSTPAID",
          isActive: true,
        },
      });
      await expect(run).rejects.toThrow("유효하지 않은 상품입니다.");
    });

    it("판매 중지 상품 → 공용 가드 문구(결제 경로와 동일)", async () => {
      const { run } = call({
        classProductId: "prod-1",
        product: {
          classId: "class-1",
          billingTiming: "POSTPAID",
          isActive: false,
        },
      });
      await expect(run).rejects.toThrow(
        "현재 결제할 수 없는 수강권입니다. 다른 수강권을 선택해주세요.",
      );
    });

    it("월별 상품인데 승인월 없음/불일치 → 400 '판매 기간이 지난 상품'", async () => {
      const stale = call({
        billingMode: "PREPAID",
        classProductId: "prod-1",
        product: {
          classId: "class-1",
          billingTiming: "PREPAID",
          isActive: true,
          feeType: "MONTHLY_FIXED",
          billingMonth: new Date(Date.UTC(2026, 7, 1)),
        },
      });
      await expect(stale.run).rejects.toThrow("판매 기간이 지난 상품입니다.");
      const noOpen = call({
        billingMode: "PREPAID",
        salesOpenMonth: null,
        classProductId: "prod-1",
        product: {
          classId: "class-1",
          billingTiming: "PREPAID",
          isActive: true,
          feeType: "MONTHLY_FIXED",
          billingMonth: month,
        },
      });
      await expect(noOpen.run).rejects.toThrow("판매 기간이 지난 상품입니다.");
    });

    it("월분 일치 → 통과, 무월 레거시 → 통과", async () => {
      const ok = call({
        billingMode: "PREPAID",
        classProductId: "prod-1",
        product: {
          classId: "class-1",
          billingTiming: "PREPAID",
          isActive: true,
          feeType: "MONTHLY_FIXED",
          billingMonth: new Date(month.getTime()),
        },
      });
      await expect(ok.run).resolves.toMatchObject({
        billingTiming: "PREPAID",
      });
      const legacy = call({
        billingMode: "PREPAID",
        classProductId: "prod-1",
        product: {
          classId: "class-1",
          billingTiming: "PREPAID",
          isActive: true,
          feeType: "MONTHLY_FIXED",
          billingMonth: null,
        },
      });
      await expect(legacy.run).resolves.toMatchObject({
        billingTiming: "PREPAID",
      });
    });

    it("수업 결제방식과 timing 불일치 → 400", async () => {
      const { run } = call({
        billingMode: "PREPAID",
        classProductId: "prod-1",
        product: {
          classId: "class-1",
          billingTiming: "POSTPAID",
          isActive: true,
        },
      });
      await expect(run).rejects.toThrow(
        "수업 결제 방식과 맞지 않는 상품입니다.",
      );
    });

    it("일치 → 결제방식·가격·회차를 함께 반환(무료 판정·수업권 발급 조건에 쓰임)", async () => {
      const { run } = call({
        classProductId: "prod-1",
        product: {
          classId: "class-1",
          billingTiming: "POSTPAID",
          isActive: true,
        },
      });
      await expect(run).resolves.toMatchObject({
        billingTiming: "POSTPAID",
      });
    });
  });
});

describe("EnrollmentsService — 등록 생성 재활용 분기 CAS · 잠금 트랜잭션 오류 변환", () => {
  const userId = "parent-1";
  const dto = {
    childId: "child-1",
    classId: "class-1",
    classProductId: "prod-post",
  };
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 10);
  future.setUTCHours(0, 0, 0, 0);
  const salesOpenMonth = new Date(
    Date.UTC(future.getUTCFullYear(), future.getUTCMonth(), 1),
  );

  /** 재활용 분기까지 도달하는 최소 배선 — BOTH 수업 · 본인 pending(선불 결제 대기) 등록 보유 */
  function buildReuse(opts: {
    voidedCount: number;
    transitionedCount: number;
  }) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      class: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ billingMode: "BOTH", capacity: 0 }),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([]), // paid 이력 없음
        // hasActivePaidEnrollment(status: "paid") 호출과 existingEnrollment(BLOCKING_APPLICATION)
        //   호출이 같은 findFirst 를 공유하므로 where.status 로 분기한다.
        findFirst: jest.fn(
          async (args: { where?: { status?: unknown } }) => {
            if (args?.where?.status === "paid") return null;
            return {
              id: "enr-pending",
              status: "pending",
              requestedBy: userId,
              paymentId: "pay-old",
            };
          },
        ),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.transitionedCount }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "enr-pending",
          status: "approved",
          classId: "class-1",
          childId: "child-1",
          expiresAt: future,
          createdAt: new Date(),
        }),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue({ paymentStatus: "pending" }),
        updateMany: jest.fn().mockResolvedValue({ count: opts.voidedCount }),
      },
      classRegistration: {
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: userId, userType: "PARENT" }),
      },
      parentChild: { findUnique: jest.fn().mockResolvedValue({ id: "pc" }) },
      class: {
        findUnique: jest.fn(
          async (args: { select?: Record<string, unknown> }) =>
            args.select && "schedules" in args.select
              ? {
                  endedAt: null,
                  salesOpenMonth,
                  trainingType: "regular",
                  schedules: [{ scheduledDate: future }],
                }
              : {
                  teamId: null,
                  targetBirthYears: [],
                  ageMin: null,
                  ageMax: null,
                  billingMode: "BOTH",
                  salesOpenMonth,
                },
        ),
      },
      classProduct: {
        findUnique: jest.fn().mockResolvedValue({
          classId: "class-1",
          billingTiming: "POSTPAID",
          isActive: true,
          feeType: "PER_SESSION",
          durationDays: null,
          billingMonth: null,
        }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new EnrollmentsService(
      prisma as never,
      {} as never,
      { promoteNextWaitlist: jest.fn() } as never,
      {} as never,
    );
    return { service, tx };
  }

  it("이전 결제 취소 갱신이 0건(그 사이 결제 완료) → 409, 등록 미전환", async () => {
    const { service, tx } = buildReuse({
      voidedCount: 0,
      transitionedCount: 1,
    });
    await expect(
      service.createEnrollment(userId, dto as never),
    ).rejects.toThrow("결제가 완료된 신청입니다.");
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
    expect(tx.classRegistration.upsert).not.toHaveBeenCalled();
  });

  it("등록 CAS(status pending · paymentId 읽은 값)가 0건 → 409, 명단 미활성", async () => {
    const { service, tx } = buildReuse({
      voidedCount: 1,
      transitionedCount: 0,
    });
    await expect(
      service.createEnrollment(userId, dto as never),
    ).rejects.toThrow("이미 처리된 수강신청입니다.");
    expect(tx.enrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "enr-pending", status: "pending", paymentId: "pay-old" },
      }),
    );
    expect(tx.classRegistration.upsert).not.toHaveBeenCalled();
  });

  it("정상 재활용 — 결제 취소 1건 · 등록 CAS 1건 · 명단 active", async () => {
    const { service, tx } = buildReuse({
      voidedCount: 1,
      transitionedCount: 1,
    });
    await service.createEnrollment(userId, dto as never);
    expect(tx.classRegistration.upsert).toHaveBeenCalledTimes(1);
  });

  it("중복 차단 조회(hasActivePaidEnrollment·existingEnrollment) 는 billingMonth NULL 행도 함께 본다", async () => {
    const { service, tx } = buildReuse({
      voidedCount: 1,
      transitionedCount: 1,
    });
    await service.createEnrollment(userId, dto as never);
    const calls = (tx.enrollment.findFirst as jest.Mock).mock.calls as Array<
      [{ where?: { status?: unknown; OR?: unknown } }]
    >;
    // hasActivePaidEnrollment(status: "paid") 호출.
    const paidCall = calls.find(([args]) => args?.where?.status === "paid");
    expect(paidCall?.[0].where?.OR).toEqual(
      expect.arrayContaining([{ billingMonth: null }]),
    );
    // existingEnrollment(BLOCKING_APPLICATION) 호출.
    const blockingCall = calls.find(([args]) => args?.where?.status !== "paid");
    expect(blockingCall?.[0].where?.OR).toEqual(
      expect.arrayContaining([{ billingMonth: null }]),
    );
  });

  it("좌석 잠금 트랜잭션의 P2028/P2024 는 409 로, 그 외 예외는 그대로", async () => {
    const { Prisma } = jest.requireActual("@prisma/client");
    const mk = (code: string) =>
      new Prisma.PrismaClientKnownRequestError("tx", {
        code,
        clientVersion: "test",
      });
    const prisma = {
      $transaction: jest.fn(async (fn: () => unknown) => fn()),
    };
    const service = new EnrollmentsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const run = (thrown: unknown) =>
      (service as any).runEnrollmentTransaction(async () => {
        throw thrown;
      });
    await expect(run(mk("P2028"))).rejects.toBeInstanceOf(ConflictException);
    await expect(run(mk("P2024"))).rejects.toBeInstanceOf(ConflictException);
    await expect(run(new Error("other"))).rejects.toThrow("other");
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 15_000,
    });
  });
});
