import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { SettlementSummaryService } from "./settlement-summary.service";
import { PrismaService } from "@/prisma/prisma.service";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { RedisService } from "@/redis/redis.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * [Phase 2b] 팀/Academy 정산 소계 배치 집계 검증.
 *  Codex 재검증(FAIL 9건) 반영 회귀 커버:
 *   1. 비관리 코치 차단 / 관리 코치·admin 허용 (HIGH-1)
 *   2. admin teamId 생략 시 전체 팀 해석 (MED-5)
 *   3. 선불·후불 대회 둘 다 반환, 선불=NOT_REQUIRED (HIGH-2)
 *   4. Enrollment 없는 BOTH=UNASSIGNED, PREPAID 미구매자 표현 (HIGH-4)
 *   5. 타 선수 부분환불이 다른 선수 outstanding 보존 (HIGH-3)
 *   6. 복수/과거 후불 Enrollment 중 결정적 최신 계약 선택 (MED-6)
 *   7. 확정 BOTH 후불 부분집합=CONFIRMED (MED-7)
 *   8. 다팀 응답 팀 식별 보존 (MED-8)
 *   9. 미종료 대회=TOURNAMENT_NOT_ENDED (MED-9)
 *  + 복수구매/pending/환불원결제월/귀속불명/Academy 대회 제외/N+1.
 *
 *  Cycle 2(FAIL 5건) 선택월 인식 회귀 커버:
 *   C1. 선택월 이후 등록 선수 제외 / 그 달 활동 선수는 탈퇴 후에도 포함 (HIGH-1)
 *   C2. 과거 월 조회 시 그 달 POSTPAID 계약 선택(이후 enrollment 아님) (HIGH-2)
 *   C3. 선택월 확정 Billing 이 BOTH 를 CONFIRMED 로(현/최신 enrollment 무관) (HIGH-2)
 *   C4. 과거 POSTPAID enrollment 가 이후 전-선불 월을 NOT_READY 로 강제 안 함 (HIGH-2)
 *   C5. 당월 혼합 미배정 선수가 BILLING_TIMING_UNASSIGNED 우선 노출 (MED-3)
 *   C6. 한 선수 PAID+BILLED 는 완납 아님 (MED-4)
 *   C7. timing별 인원 distinct·합=total (MED-5)
 */
describe("SettlementSummaryService", () => {
  let service: SettlementSummaryService;

  const YM = "2026-07";
  const JULY = new Date("2026-07-15T05:00:00Z"); // KST 2026-07

  const prismaMock = {
    class: { findMany: jest.fn() },
    classRegistration: { findMany: jest.fn() },
    enrollment: { findMany: jest.fn() },
    monthlyPostpaidBilling: { findMany: jest.fn() },
    classSchedule: { findMany: jest.fn() },
    tournament: { findMany: jest.fn() },
    team: { findMany: jest.fn() },
    teamMember: { findMany: jest.fn() },
    coachProfile: { findMany: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    parentChild: { findMany: jest.fn() },
    payment: { findMany: jest.fn(), count: jest.fn() },
  };

  const resourceAccessMock = {
    assertAcademyManager: jest.fn(),
    resolveManageableTeamIds: jest.fn(),
  };

  const notificationsMock = {
    notifyUsers: jest.fn(),
  };

  const redisMock = {
    setIfNotExists: jest.fn(),
  };

  const coach: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };
  const admin: JwtUserPayload = {
    id: "admin-1",
    email: "admin-1@t.dev",
    userType: "ADMIN",
  };

  const prepaidEnrollment = (
    childId: string,
    amount: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    classId: "c1",
    childId,
    status: "paid",
    paidAt: null,
    product: {
      feeType: "PER_SESSION",
      billingTiming: "PREPAID",
      billingMonth: null,
      feePerSession: null,
      price: amount,
    },
    payment: {
      paymentStatus: "completed",
      completedAt: JULY,
      createdAt: JULY,
      amount,
      refundLogs: [],
    },
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // 기본값 — 개별 테스트에서 override.
    prismaMock.class.findMany.mockResolvedValue([]);
    prismaMock.classRegistration.findMany.mockResolvedValue([]);
    prismaMock.enrollment.findMany.mockResolvedValue([]);
    prismaMock.monthlyPostpaidBilling.findMany.mockResolvedValue([]);
    prismaMock.classSchedule.findMany.mockResolvedValue([]);
    prismaMock.team.findMany.mockResolvedValue([]);
    prismaMock.teamMember.findMany.mockResolvedValue([]);
    prismaMock.coachProfile.findMany.mockResolvedValue([]);
    prismaMock.tournament.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.parentChild.findMany.mockResolvedValue([]);
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.payment.count.mockResolvedValue(0);
    resourceAccessMock.resolveManageableTeamIds.mockResolvedValue([]);
    notificationsMock.notifyUsers.mockResolvedValue(undefined);
    redisMock.setIfNotExists.mockResolvedValue(true);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementSummaryService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ResourceAccessService, useValue: resourceAccessMock },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();
    service = moduleRef.get(SettlementSummaryService);
  });

  // 수업 detail 조회(className 포함)와 id-only(scope) 조회를 구분.
  const mockClassQueries = (detail: any[]) => {
    prismaMock.class.findMany.mockImplementation((args: any) => {
      if (args?.select?.className) return Promise.resolve(detail);
      return Promise.resolve(detail.map((d: any) => ({ id: d.id })));
    });
  };

  const classDetail = (
    id: string,
    billingMode: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    id,
    className: id.toUpperCase(),
    billingMode,
    teamId: null,
    team: null,
    products: [],
    ...overrides,
  });

  describe("복수구매 (R7)", () => {
    it("같은 학생 월 2건 구매 → 금액=합계, 인원=distinct(1)", async () => {
      mockClassQueries([classDetail("c1", "PREPAID")]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000),
        prepaidEnrollment("u1", 20000), // 동일 학생 추가 구매
        prepaidEnrollment("u2", 50000),
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      expect(res.classes).toHaveLength(1);
      const c = res.classes[0];
      expect(c.total).toBe(2); // distinct userId
      expect(c.billedAmount).toBe(100000); // 3건 합계
      expect(c.paidAmount).toBe(100000);
      expect(c.paidCount).toBe(2);
      expect(c.paymentStatus).toBe("PAID_ALL");
    });
  });

  describe("선불 pending 집계 제외 (결제 진행 중/이탈)", () => {
    it("pending 결제는 확정 청구가 아니므로 청구·미수에 반영되지 않는다", async () => {
      mockClassQueries([classDetail("c1", "PREPAID")]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 40000, {
          status: "approved",
          payment: {
            paymentStatus: "pending",
            completedAt: null,
            createdAt: JULY,
            amount: 40000,
            refundLogs: [],
          },
        }),
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.billedAmount).toBe(0); // 이탈 건 — 청구 아님
      expect(c.paidAmount).toBe(0);
      expect(c.outstandingAmount).toBe(0); // 미수금 미집계
    });
  });

  describe("환불 원결제월 유지", () => {
    it("부분 환불 → 원결제 월 소계에 REFUNDED · 순수납 반영", async () => {
      mockClassQueries([classDetail("c1", "PREPAID")]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 100000, {
          payment: {
            paymentStatus: "partially_refunded",
            completedAt: JULY,
            createdAt: JULY,
            amount: 100000,
            refundLogs: [{ refundAmount: 30000 }],
          },
        }),
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.refundedCount).toBe(1); // 결제 건수
      expect(c.refundedAmount).toBe(30000);
      expect(c.billedAmount).toBe(0); // 환불 건 유효 청구 제외
      expect(c.paidAmount).toBe(70000); // 순수납
    });
  });

  describe("귀속불명 제외 (현재월 금지)", () => {
    it("귀속 근거 없는 결제는 소계에서 제외(현재월 임의 귀속 안 함)", async () => {
      mockClassQueries([classDetail("c1", "PREPAID")]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 50000, {
          status: "approved",
          paidAt: null,
          payment: {
            paymentStatus: "completed",
            completedAt: null,
            createdAt: null,
            amount: 50000,
            refundLogs: [],
          },
        }),
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const currentYm = new Date();
      const ym = `${currentYm.getFullYear()}-${String(
        currentYm.getMonth() + 1,
      ).padStart(2, "0")}`;
      const res = await service.getAcademySettlementSummary("a1", coach, ym);
      expect(res.classes).toHaveLength(0); // 귀속불명 → 집계 0 → 순수 선불 수업 제외
    });
  });

  // ── 회귀 1: 팀 scope 정책 (HIGH-1) ──────────────────────────────
  describe("[HIGH-1] 팀 scope 정책 — 관리 팀만", () => {
    it("비관리 코치(resolveManageableTeamIds 빈 집합)는 빈 응답·배치 미실행", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue([]);
      const res = await service.getTeamSettlementSummary(coach, YM);
      expect(res.classes).toEqual([]);
      expect(res.tournaments).toEqual([]);
      expect(prismaMock.class.findMany).not.toHaveBeenCalled();
    });

    it("관리 코치는 resolveManageableTeamIds 기준 관리 팀만 조회", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      mockClassQueries([
        classDetail("c1", "PREPAID", { teamId: "team-1", team: { name: "팀1" } }),
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000),
      ]);
      const res = await service.getTeamSettlementSummary(coach, YM);
      expect(resourceAccessMock.resolveManageableTeamIds).toHaveBeenCalledWith(
        coach,
      );
      expect(res.classes).toHaveLength(1);
    });

    it("관리하지 않는 teamId 지정 시 빈 결과 + 배치 미실행", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      const res = await service.getTeamSettlementSummary(coach, YM, "team-999");
      expect(res.classes).toEqual([]);
      expect(res.tournaments).toEqual([]);
      expect(prismaMock.class.findMany).not.toHaveBeenCalled();
      expect(prismaMock.enrollment.findMany).not.toHaveBeenCalled();
    });
  });

  // ── 회귀 2: admin teamId 생략 (MED-5) ──────────────────────────
  describe("[MED-5] admin teamId 생략 → 전체 팀", () => {
    it("ADMIN 은 teamId 미지정 시 전체 팀으로 해석(빈 응답 금지)", async () => {
      prismaMock.team.findMany.mockResolvedValue([
        { id: "team-1" },
        { id: "team-2" },
      ]);
      mockClassQueries([
        classDetail("c1", "PREPAID", { teamId: "team-1", team: { name: "팀1" } }),
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000),
      ]);
      const res = await service.getTeamSettlementSummary(admin, YM);
      expect(prismaMock.team.findMany).toHaveBeenCalled();
      expect(res.classes).toHaveLength(1);
      // resolveManageableTeamIds(일반 관리자 경로)는 admin 경로에서 호출되지 않는다.
      expect(
        resourceAccessMock.resolveManageableTeamIds,
      ).not.toHaveBeenCalled();
    });
  });

  // ── 회귀 3: 선불·후불 대회 (HIGH-2) ────────────────────────────
  describe("[HIGH-2] 선불·후불 대회 모두 반환", () => {
    it("PREPAID 대회=NOT_REQUIRED, POSTPAID 대회=CONFIRMED 로 함께 반환", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      prismaMock.tournament.findMany.mockImplementation((args: any) => {
        if (args?.select?.registrations) {
          return Promise.resolve([
            {
              id: "tp",
              name: "선불컵",
              billingMode: "PREPAID",
              endDate: new Date("2026-07-01T00:00:00Z"),
              teamId: "team-1",
              team: { name: "팀1" },
              registrations: [
                {
                  userId: "p1",
                  childId: "u1",
                  paymentStatus: "PAID",
                  calculatedFee: 15000,
                  payment: {
                    paymentStatus: "completed",
                    completedAt: JULY,
                    createdAt: JULY,
                    refundLogs: [],
                  },
                },
              ],
            },
            {
              id: "to",
              name: "후불컵",
              billingMode: "POSTPAID",
              endDate: new Date("2026-07-01T00:00:00Z"),
              teamId: "team-1",
              team: { name: "팀1" },
              registrations: [
                {
                  userId: "p2",
                  childId: "u2",
                  paymentStatus: "PAID",
                  calculatedFee: 20000,
                  payment: {
                    paymentStatus: "completed",
                    completedAt: JULY,
                    createdAt: JULY,
                    refundLogs: [],
                  },
                },
              ],
            },
          ]);
        }
        return Promise.resolve([{ id: "tp" }, { id: "to" }]);
      });

      const res = await service.getTeamSettlementSummary(coach, YM, "team-1");
      const byId = Object.fromEntries(
        res.tournaments.map((t) => [t.tournamentId, t]),
      );
      expect(byId["tp"].settlementStatus).toBe("NOT_REQUIRED"); // 선불
      expect(byId["tp"].paidAmount).toBe(15000);
      expect(byId["to"].settlementStatus).toBe("CONFIRMED"); // 후불 전원 확정
      expect(byId["to"].paidAmount).toBe(20000);
    });
  });

  // ── 회귀 4: 로스터 대상자 (HIGH-4) ─────────────────────────────
  describe("[HIGH-4] Enrollment 없는 등록 선수 포함", () => {
    it("BOTH 미배정=UNASSIGNED, PREPAID 미구매자=미수 없는 대상", async () => {
      mockClassQueries([
        classDetail("cA", "BOTH"),
        classDetail("cB", "PREPAID"),
      ]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        { classId: "cA", userId: "u1" }, // BOTH 등록·상품 미배정
        { classId: "cB", userId: "u2" }, // PREPAID 등록·미구매
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const byId = Object.fromEntries(res.classes.map((c) => [c.classId, c]));
      // BOTH + 상품 없음 → 대상 1명, 미배정 사유.
      expect(byId["cA"].total).toBe(1);
      expect(byId["cA"].blockedReasonCode).toBe("BILLING_TIMING_UNASSIGNED");
      // PREPAID 미구매자 → 대상 1명, 유효 청구 없음(NONE).
      expect(byId["cB"].total).toBe(1);
      expect(byId["cB"].paymentStatus).toBe("NONE");
      expect(byId["cB"].billedAmount).toBe(0);
      expect(byId["cB"].settlementStatus).toBe("NOT_REQUIRED");
    });
  });

  // ── 회귀 5: 선불 pending 제외 + 부분환불 순수납 공존 (구 HIGH-3 개정) ──
  describe("[HIGH-3] 선불 pending 은 부분환불 순수납과 교차해도 미수 0", () => {
    it("결제 이탈 50000 + 다른 선수 부분환불 순수납 70000 → outstanding=0", async () => {
      mockClassQueries([classDetail("c1", "PREPAID")]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 50000, {
          status: "approved",
          payment: {
            paymentStatus: "pending",
            completedAt: null,
            createdAt: JULY,
            amount: 50000,
            refundLogs: [],
          },
        }),
        prepaidEnrollment("u2", 100000, {
          payment: {
            paymentStatus: "partially_refunded",
            completedAt: JULY,
            createdAt: JULY,
            amount: 100000,
            refundLogs: [{ refundAmount: 30000 }],
          },
        }),
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.billedAmount).toBe(0); // u1 이탈 건 청구 제외 · u2 환불 청구 제외
      expect(c.paidAmount).toBe(70000); // u2 순수납은 그대로
      expect(c.outstandingAmount).toBe(0); // 이탈 건이 미수금을 만들지 않음
    });
  });

  // ── 회귀 6: 결정적 후불 계약 선택 (MED-6) ──────────────────────
  describe("[MED-6] 복수/과거 후불 Enrollment 결정적 최신 단가", () => {
    it("updatedAt desc 최신 enrollment 단가로 예상액 산출", async () => {
      mockClassQueries([classDetail("c1", "POSTPAID")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        { classId: "c1", userId: "u1" },
      ]);
      // 배치는 orderBy updatedAt desc — mock 은 최신 먼저 반환한다.
      prismaMock.enrollment.findMany.mockResolvedValue([
        {
          classId: "c1",
          childId: "u1",
          status: "approved",
          paidAt: null,
          product: {
            feeType: "PER_SESSION",
            billingTiming: "POSTPAID",
            billingMonth: null,
            feePerSession: 5000, // 최신 단가
            price: null,
          },
          payment: null,
        },
        {
          classId: "c1",
          childId: "u1",
          status: "approved",
          paidAt: null,
          product: {
            feeType: "PER_SESSION",
            billingTiming: "POSTPAID",
            billingMonth: null,
            feePerSession: 9999, // 과거 단가 — 선택되면 안 됨
            price: null,
          },
          payment: null,
        },
      ]);
      prismaMock.classSchedule.findMany.mockResolvedValue([
        { classId: "c1", attendances: [{ memberId: "u1" }] },
        { classId: "c1", attendances: [{ memberId: "u1" }] },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.estimatedAmount).toBe(10000); // 2회 × 최신 단가 5000
    });
  });

  // ── 회귀 7: 확정 BOTH → CONFIRMED (MED-7) ──────────────────────
  describe("[MED-7] 확정 BOTH 후불 부분집합 = CONFIRMED", () => {
    it("혼합 수업 후불 확정 시 CONFIRMED · mixedBilling true", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      mockClassQueries([
        classDetail("c1", "BOTH", { teamId: "team-1", team: { name: "팀1" } }),
      ]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        { classId: "c1", userId: "u1" },
        { classId: "c1", userId: "u2" },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        // u1 후불
        {
          classId: "c1",
          childId: "u1",
          status: "approved",
          paidAt: null,
          product: {
            feeType: "PER_SESSION",
            billingTiming: "POSTPAID",
            billingMonth: null,
            feePerSession: 5000,
            price: null,
          },
          payment: null,
        },
        // u2 선불(완료)
        { ...prepaidEnrollment("u2", 30000) },
      ]);
      prismaMock.monthlyPostpaidBilling.findMany.mockResolvedValue([
        {
          classId: "c1",
          status: "confirmed",
          items: [
            {
              userId: "u1",
              amount: 40000,
              paymentStatus: "paid",
              payment: { paymentStatus: "completed", refundLogs: [] },
            },
          ],
        },
      ]);

      const res = await service.getTeamSettlementSummary(coach, YM, "team-1");
      const c = res.classes[0];
      expect(c.settlementStatus).toBe("CONFIRMED"); // PARTIAL_BILLED 아님
      expect(c.mixedBilling).toBe(true);
    });
  });

  // ── 회귀 8: 다팀 팀 식별 (MED-8) ───────────────────────────────
  describe("[MED-8] 다팀 응답 팀 식별 보존", () => {
    it("각 수업 행에 teamId·teamName 을 담는다", async () => {
      prismaMock.team.findMany.mockResolvedValue([
        { id: "team-1" },
        { id: "team-2" },
      ]);
      mockClassQueries([
        classDetail("c1", "PREPAID", { teamId: "team-1", team: { name: "팀1" } }),
        classDetail("c2", "PREPAID", { teamId: "team-2", team: { name: "팀2" } }),
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000),
        { ...prepaidEnrollment("u2", 40000), classId: "c2" },
      ]);
      const res = await service.getTeamSettlementSummary(admin, YM);
      const byId = Object.fromEntries(res.classes.map((c) => [c.classId, c]));
      expect(byId["c1"].teamId).toBe("team-1");
      expect(byId["c1"].teamName).toBe("팀1");
      expect(byId["c2"].teamId).toBe("team-2");
      expect(byId["c2"].teamName).toBe("팀2");
    });
  });

  // ── 회귀 9: 미종료 대회 (MED-9) ────────────────────────────────
  describe("[MED-9] 미종료 후불 대회 = TOURNAMENT_NOT_ENDED", () => {
    it("종료 전 후불 대회는 TOURNAMENT_NOT_ENDED 사유를 반환", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      const FAR_YM = "2099-12";
      prismaMock.tournament.findMany.mockImplementation((args: any) => {
        if (args?.select?.registrations) {
          return Promise.resolve([
            {
              id: "t9",
              name: "미래컵",
              billingMode: "POSTPAID",
              endDate: new Date("2099-12-31T00:00:00Z"), // 미종료
              teamId: "team-1",
              team: { name: "팀1" },
              registrations: [
                {
                  userId: "p1",
                  childId: "u1",
                  paymentStatus: "UNPAID",
                  calculatedFee: 0,
                  payment: null,
                },
              ],
            },
          ]);
        }
        return Promise.resolve([{ id: "t9" }]);
      });

      const res = await service.getTeamSettlementSummary(coach, FAR_YM, "team-1");
      expect(res.tournaments).toHaveLength(1);
      expect(res.tournaments[0].settlementStatus).toBe("NOT_READY");
      expect(res.tournaments[0].blockedReasonCode).toBe("TOURNAMENT_NOT_ENDED");
    });
  });

  describe("Academy API 대회 제외 (R5)", () => {
    it("Academy 소계는 tournament 조회를 하지 않는다", async () => {
      mockClassQueries([classDetail("c1", "PREPAID")]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000),
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      expect(res).not.toHaveProperty("tournaments");
      expect(prismaMock.tournament.findMany).not.toHaveBeenCalled();
      expect(resourceAccessMock.assertAcademyManager).toHaveBeenCalledWith(
        "a1",
        coach,
      );
    });
  });

  describe("N+1 없음 (배치 쿼리)", () => {
    it("수업 3개여도 enrollment/billing/schedule/roster 조회는 각 1회(배치)", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      mockClassQueries([
        classDetail("c1", "PREPAID"),
        classDetail("c2", "PREPAID"),
        classDetail("c3", "PREPAID"),
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000),
        { ...prepaidEnrollment("u2", 40000), classId: "c2" },
        { ...prepaidEnrollment("u3", 50000), classId: "c3" },
      ]);

      await service.getTeamSettlementSummary(coach, YM);
      expect(prismaMock.enrollment.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.classRegistration.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.monthlyPostpaidBilling.findMany).toHaveBeenCalledTimes(
        1,
      );
      expect(prismaMock.classSchedule.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("후불 확정 라인 + 대회 포함 (팀 API)", () => {
    it("후불 확정 수업 + 후불 대회 소계를 함께 반환", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      mockClassQueries([
        classDetail("c1", "POSTPAID", {
          className: "후불수업",
          teamId: "team-1",
          team: { name: "팀1" },
        }),
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([]);
      prismaMock.monthlyPostpaidBilling.findMany.mockResolvedValue([
        {
          classId: "c1",
          status: "confirmed",
          items: [
            {
              userId: "u1",
              amount: 40000,
              paymentStatus: "paid",
              payment: { paymentStatus: "completed", refundLogs: [] },
            },
            {
              userId: "u2",
              amount: 40000,
              paymentStatus: "pending",
              payment: null,
            },
          ],
        },
      ]);
      prismaMock.tournament.findMany.mockImplementation((args: any) => {
        if (args?.select?.registrations) {
          return Promise.resolve([
            {
              id: "t1",
              name: "여름컵",
              billingMode: "POSTPAID",
              endDate: new Date("2026-07-01T00:00:00Z"),
              teamId: "team-1",
              team: { name: "팀1" },
              registrations: [
                {
                  userId: "p1",
                  childId: "u1",
                  paymentStatus: "PAID",
                  calculatedFee: 20000,
                  payment: {
                    paymentStatus: "completed",
                    completedAt: JULY,
                    createdAt: JULY,
                    refundLogs: [],
                  },
                },
              ],
            },
          ]);
        }
        return Promise.resolve([{ id: "t1" }]);
      });

      const res = await service.getTeamSettlementSummary(coach, YM, "team-1");
      expect(res.classes).toHaveLength(1);
      expect(res.classes[0].settlementStatus).toBe("CONFIRMED");
      expect(res.classes[0].billedAmount).toBe(80000);
      expect(res.classes[0].paidAmount).toBe(40000); // u1 완료만
      expect(res.classes[0].outstandingAmount).toBe(40000);
      expect(res.tournaments).toHaveLength(1);
      expect(res.tournaments[0].tournamentId).toBe("t1");
      expect(res.tournaments[0].paidAmount).toBe(20000);
      expect(res.tournaments[0].detailPath).toBe("/tournaments/t1#settlement");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Cycle 2 — 선택월(selected-month) 인식 회귀
  // ══════════════════════════════════════════════════════════════

  const JUNE_YM = "2026-06";

  // 후불 open enrollment(결제 없음) — 그 달 미확정 계약.
  const postpaidOpenEnrollment = (
    childId: string,
    feePerSession: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    classId: "c1",
    childId,
    status: "approved",
    paidAt: null,
    product: {
      feeType: "PER_SESSION",
      billingTiming: "POSTPAID",
      billingMonth: null,
      feePerSession,
      price: null,
    },
    payment: null,
    ...overrides,
  });

  // ── C1: 선택월 이후 등록 제외 / 그 달 활동 선수는 탈퇴 후에도 포함 (HIGH-1) ──
  describe("[C1/HIGH-1] 선택월 로스터 멤버십 경계", () => {
    it("선택월 이후(8월) 등록 선수는 7월 소계에서 제외", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "uLate",
          registrationDate: new Date("2026-08-10T00:00:00Z"),
          status: "active",
        },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      // 8월 등록자만 있고 7월 활동 없음 → 대상 0 → 수업 제외.
      expect(res.classes).toHaveLength(0);
    });

    it("선택월 활동 선수는 탈퇴(inactive) 후에도 그 달 명단 포함", async () => {
      mockClassQueries([classDetail("c1", "POSTPAID")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-07-05T00:00:00Z"),
          status: "inactive", // 그 달 중 탈퇴
        },
      ]);
      prismaMock.classSchedule.findMany.mockResolvedValue([
        { classId: "c1", attendances: [{ memberId: "u1" }] },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      expect(res.classes).toHaveLength(1);
      expect(res.classes[0].total).toBe(1); // 그 달 출석 → 명단 보존
    });

    it("종료된 수업의 로스터-only 선수는 무관 월에 새지 않음", async () => {
      mockClassQueries([
        classDetail("c1", "BOTH", {
          endedAt: new Date("2026-05-31T00:00:00Z"), // 5월 종료
        }),
      ]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-04-01T00:00:00Z"),
          status: "active",
        },
      ]);
      // 7월 활동(출석·enrollment·billing) 전무
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      expect(res.classes).toHaveLength(0); // 종료 수업 + 무관 월 → 누수 없음
    });
  });

  // ── C2: 과거 월 조회 시 그 달 POSTPAID 계약 선택 (HIGH-2) ──
  describe("[C2/HIGH-2] 과거 월 계약은 그 달 계약으로 해석", () => {
    it("6월 POSTPAID→7월 PREPAID 전환 선수를 6월 조회 시 후불로 평가", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-06-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        // 7월 선불(최신 updatedAt) — 6월 조회 시 제외돼야
        prepaidEnrollment("u1", 30000),
        // 6월 후불(open)
        postpaidOpenEnrollment("u1", 5000),
      ]);
      prismaMock.classSchedule.findMany.mockResolvedValue([
        { classId: "c1", attendances: [{ memberId: "u1" }] },
        { classId: "c1", attendances: [{ memberId: "u1" }] },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary(
        "a1",
        coach,
        JUNE_YM,
      );
      const c = res.classes[0];
      expect(c.postpaidCount).toBe(1); // 6월엔 후불
      expect(c.prepaidCount).toBe(0);
      expect(c.estimatedAmount).toBe(10000); // 2회 × 6월 후불 단가 5000
    });
  });

  // ── C3: 선택월 확정 Billing → CONFIRMED (HIGH-2) ──
  describe("[C3/HIGH-2] 선택월 확정 Billing 이 BOTH 를 CONFIRMED 로", () => {
    it("현/최신 enrollment 가 선불로 바뀌어도 그 달 확정 Billing 이면 CONFIRMED", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-07-01T00:00:00Z"),
          status: "active",
        },
      ]);
      // 최신 enrollment 는 8월 선불(다른 달) — 7월 후불 성분에 영향 없어야
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000, {
          payment: {
            paymentStatus: "completed",
            completedAt: new Date("2026-08-10T05:00:00Z"),
            createdAt: new Date("2026-08-10T05:00:00Z"),
            amount: 30000,
            refundLogs: [],
          },
        }),
      ]);
      prismaMock.monthlyPostpaidBilling.findMany.mockResolvedValue([
        {
          classId: "c1",
          status: "confirmed",
          items: [
            {
              userId: "u1",
              amount: 40000,
              paymentStatus: "paid",
              payment: { paymentStatus: "completed", refundLogs: [] },
            },
          ],
        },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.settlementStatus).toBe("CONFIRMED");
      expect(c.billedAmount).toBe(40000);
    });
  });

  // ── C4: 과거 POSTPAID 가 이후 전-선불 월을 NOT_READY 로 강제 안 함 (HIGH-2) ──
  describe("[C4/HIGH-2] 과거 후불 계약이 이후 전-선불 월에 누수 안 됨", () => {
    it("6월 후불 open + 7월 선불 완료 선수 → 7월은 NOT_REQUIRED", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-07-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000), // 7월 선불 완료(최신)
        postpaidOpenEnrollment("u1", 5000), // 과거 6월 후불 open
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.settlementStatus).toBe("NOT_REQUIRED"); // NOT_READY 아님
      expect(c.mixedBilling).toBe(false);
      expect(c.postpaidCount).toBe(0);
    });
  });

  // ── C5: 미배정 우선 노출 (MED-3) ──
  describe("[C5/MED-3] 당월 혼합 미배정 선수 우선 노출", () => {
    it("BOTH 당월(미종료)에 후불+미배정 → BILLING_TIMING_UNASSIGNED", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-07-01T00:00:00Z"),
          status: "active",
        },
        {
          classId: "c1",
          userId: "u2",
          registrationDate: new Date("2026-07-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        postpaidOpenEnrollment("u1", 5000), // u1 후불
        // u2 enrollment 없음 → 미배정
      ]);
      prismaMock.classSchedule.findMany.mockResolvedValue([
        { classId: "c1", attendances: [{ memberId: "u1" }] },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      // 당월(미종료)이라 원래 MONTH_NOT_ENDED 로 가려졌던 설정 문제를 우선 노출.
      expect(c.blockedReasonCode).toBe("BILLING_TIMING_UNASSIGNED");
    });
  });

  // ── C6: PAID+BILLED 는 완납 아님 (MED-4) ──
  describe("[C6/MED-4 개정] 한 선수 PAID + 선불 pending 은 완납 (이탈 건 무영향)", () => {
    it("동일 선수 완료 1건 + 결제 이탈 1건 → 이탈 건이 완납 판정을 더럽히지 않음", async () => {
      mockClassQueries([classDetail("c1", "PREPAID")]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000), // PAID
        prepaidEnrollment("u1", 20000, {
          status: "approved",
          payment: {
            paymentStatus: "pending",
            completedAt: null,
            createdAt: JULY,
            amount: 20000,
            refundLogs: [],
          },
        }), // 결제 이탈 — 집계 제외
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.total).toBe(1);
      expect(c.paidCount).toBe(1); // 완납 — 이탈 건은 청구가 아니므로 잔존 미수 없음
      expect(c.outstandingAmount).toBe(0);
    });
  });

  // ── C7: timing별 인원 distinct·합=total (MED-5) ──
  describe("[C7/MED-5] timing별 인원 distinct·합=total", () => {
    it("선불·후불·미배정 혼합 → 각 1명, 합=total", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-07-01T00:00:00Z"),
          status: "active",
        },
        {
          classId: "c1",
          userId: "u2",
          registrationDate: new Date("2026-07-01T00:00:00Z"),
          status: "active",
        },
        {
          classId: "c1",
          userId: "u3",
          registrationDate: new Date("2026-07-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000), // 선불
        postpaidOpenEnrollment("u2", 5000), // 후불
        // u3 미배정
      ]);
      prismaMock.classSchedule.findMany.mockResolvedValue([
        { classId: "c1", attendances: [{ memberId: "u2" }] },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.prepaidCount).toBe(1);
      expect(c.postpaidCount).toBe(1);
      expect(c.unassignedCount).toBe(1);
      expect(c.prepaidCount + c.postpaidCount + c.unassignedCount).toBe(c.total);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Cycle 3 — 선택월 계약·로스터 이력 잔여 결함(Codex HIGH 3건)
  // ══════════════════════════════════════════════════════════════

  const AUG_YM = "2026-08";

  // 상품 미배정(product 없음) BOTH enrollment — UNASSIGNED.
  const unassignedEnrollment = (
    childId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    classId: "c1",
    childId,
    status: "approved",
    paidAt: null,
    product: null,
    payment: null,
    ...overrides,
  });

  // ── R1/HIGH-1: 과거 미배정 + 현 선불 → 미배정 차단 없음 ──
  describe("[R1/HIGH-1] 과거 UNASSIGNED enrollment 가 이후 달을 차단하지 않음", () => {
    it("과거 미배정 + 선택월 유효 선불 → unassignedCount=0·미배정 사유 아님", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-07-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000), // 선택월 유효 선불(최신)
        unassignedEnrollment("u1"), // 과거 상품 미배정(BOTH)
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      const c = res.classes[0];
      expect(c.total).toBe(1);
      expect(c.prepaidCount).toBe(1);
      expect(c.unassignedCount).toBe(0);
      expect(c.blockedReasonCode).not.toBe("BILLING_TIMING_UNASSIGNED");
    });
  });

  // ── R2/HIGH-2: 7월 선불 이후 8월이 6월 후불로 폴백 안 함 ──
  describe("[R2/HIGH-2] 이후 달이 과거 open 후불 계약으로 폴백 안 함", () => {
    it("6월 후불 open + 7월 선불 완료 → 8월 조회 시 후불 NOT_READY 미노출", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-06-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        prepaidEnrollment("u1", 30000), // 7월 선불(최신 updatedAt)
        postpaidOpenEnrollment("u1", 5000), // 6월 후불 open
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary(
        "a1",
        coach,
        AUG_YM,
      );
      // 8월엔 유효 계약(7월 선불)이 타월 결제라 대상 아님 → 과거 6월 후불로 되돌아가지 않아 수업 미노출.
      //   (결함 시: 6월 후불 open 이 8월 유효 계약이 되어 POSTPAID/NOT_READY 로 오노출)
      expect(res.classes).toHaveLength(0);
    });
  });

  // ── R3/HIGH-2: 레거시 paidAt 만 있는 선불은 그 달 계약(open 아님) ──
  describe("[R3/HIGH-2] 레거시 paidAt 선불은 그 달 계약으로 귀속(open 아님)", () => {
    it("7월 paidAt 선불 + 6월 후불 → 6월 조회 시 후불로 평가(선불 baseline 아님)", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-06-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        // 7월 선불 — payment 없이 enrollment.paidAt 만(레거시), updatedAt 최신.
        {
          classId: "c1",
          childId: "u1",
          status: "paid",
          paidAt: JULY,
          product: {
            feeType: "PER_SESSION",
            billingTiming: "PREPAID",
            billingMonth: null,
            feePerSession: null,
            price: 30000,
          },
          payment: null,
        },
        postpaidOpenEnrollment("u1", 5000), // 6월 후불 open
      ]);
      prismaMock.classSchedule.findMany.mockResolvedValue([
        { classId: "c1", attendances: [{ memberId: "u1" }] },
        { classId: "c1", attendances: [{ memberId: "u1" }] },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary(
        "a1",
        coach,
        "2026-06",
      );
      const c = res.classes[0];
      // 레거시 선불이 open baseline 으로 오인되면 6월 유효 계약을 선불로 잡아 후불 소멸.
      //   paidAt→7월 귀속이라 6월엔 후불 open 이 유효 계약.
      expect(c.postpaidCount).toBe(1);
      expect(c.prepaidCount).toBe(0);
      expect(c.estimatedAmount).toBe(10000); // 2회 × 후불 단가 5000
    });
  });

  // ── R4/HIGH-3: 이후 종료 수업의 그 달 로스터 보존 ──
  describe("[R4/HIGH-3] 선택월 이후 종료된 수업도 그 달 로스터 포함", () => {
    it("8월 종료 수업을 7월 조회 시 진행 중으로 보고 로스터 포함", async () => {
      mockClassQueries([
        classDetail("c1", "POSTPAID", {
          endedAt: new Date("2026-08-20T00:00:00Z"), // 선택월(7월) 이후 종료
        }),
      ]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-06-01T00:00:00Z"),
          status: "active",
        },
      ]);
      // 7월 출석·청구 전무 — 오직 로스터 멤버십으로만 포함돼야.
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      expect(res.classes).toHaveLength(1);
      expect(res.classes[0].total).toBe(1);
    });
  });

  // ── R5/HIGH-3: 당월 등록·탈퇴 선수 보존 ──
  describe("[R5/HIGH-3] 선택월 등록·탈퇴 선수는 활동 없어도 그 달 명단 보존", () => {
    it("7월 등록 후 inactive·활동 없음 → 7월 명단 포함", async () => {
      mockClassQueries([classDetail("c1", "POSTPAID")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-07-10T00:00:00Z"), // 그 달 등록
          status: "inactive", // 그 달 중 탈퇴
        },
      ]);
      // 출석·청구라인 전무.
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, YM);
      expect(res.classes).toHaveLength(1);
      expect(res.classes[0].total).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Cycle 4 — 인접 month-boundary 잔여 결함(Codex Cycle4 HIGH 2건)
  // ══════════════════════════════════════════════════════════════

  const JULY_CREATED = new Date("2026-07-15T05:00:00Z"); // KST 2026-07
  const JUNE_CREATED = new Date("2026-06-05T05:00:00Z"); // KST 2026-06

  // ── R6/HIGH-1: 미래 open 후불이 과거 달로 역류 안 함 ──
  describe("[R6/HIGH-1] 미래 open 후불 계약이 과거 달의 유효 계약이 되지 않음", () => {
    it("7월 생성 후불 open 을 6월 조회 시 후불 추정 미노출", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-06-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        postpaidOpenEnrollment("u1", 5000, { createdAt: JULY_CREATED }), // 7월 생성 후불 open
      ]);
      prismaMock.classSchedule.findMany.mockResolvedValue([
        { classId: "c1", attendances: [{ memberId: "u1" }] },
        { classId: "c1", attendances: [{ memberId: "u1" }] },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary(
        "a1",
        coach,
        "2026-06",
      );
      const c = res.classes[0];
      // 6월엔 후불 계약이 아직 없음(7월 생성) → POSTPAID/estimate 로 새지 않음.
      expect(c.postpaidCount).toBe(0);
      expect(c.estimatedAmount).toBe(0);
    });
  });

  // ── R7/HIGH-1: 미래 미배정이 과거 유효 계약을 덮지 않음 ──
  describe("[R7/HIGH-1] 미래 미배정 enrollment 가 과거 유효 계약을 덮지 않음", () => {
    it("6월 후불 + 7월 생성 미배정 → 6월 조회 시 후불 유지(미배정 아님)", async () => {
      mockClassQueries([classDetail("c1", "BOTH")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-06-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        // updatedAt desc 최신 = 7월 생성 미배정(product 없음)
        unassignedEnrollment("u1", { createdAt: JULY_CREATED }),
        // 6월 후불 open (6월 생성)
        postpaidOpenEnrollment("u1", 5000, { createdAt: JUNE_CREATED }),
      ]);
      prismaMock.classSchedule.findMany.mockResolvedValue([
        { classId: "c1", attendances: [{ memberId: "u1" }] },
        { classId: "c1", attendances: [{ memberId: "u1" }] },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary(
        "a1",
        coach,
        "2026-06",
      );
      const c = res.classes[0];
      expect(c.postpaidCount).toBe(1); // 6월 후불 유효
      expect(c.unassignedCount).toBe(0); // 미래 미배정이 덮지 않음
      expect(c.blockedReasonCode).not.toBe("BILLING_TIMING_UNASSIGNED");
    });
  });

  // ── R8/HIGH-2: 월정액 타월 구매가 다른 달 미구매를 숨기지 않음 ──
  describe("[R8/HIGH-2] 월정액 타월 구매가 선택월 미구매를 억제하지 않음", () => {
    it("7월 월정액 구매 선수를 8월 조회 시 PREPAID/UNSETTLED 로 노출", async () => {
      mockClassQueries([classDetail("c1", "PREPAID")]);
      prismaMock.classRegistration.findMany.mockResolvedValue([
        {
          classId: "c1",
          userId: "u1",
          registrationDate: new Date("2026-06-01T00:00:00Z"),
          status: "active",
        },
      ]);
      prismaMock.enrollment.findMany.mockResolvedValue([
        {
          classId: "c1",
          childId: "u1",
          status: "paid",
          paidAt: JULY,
          createdAt: JULY,
          product: {
            feeType: "MONTHLY_FIXED",
            billingTiming: "PREPAID",
            billingMonth: new Date("2026-07-01T00:00:00Z"), // 서비스월=7월
            feePerSession: null,
            price: 100000,
          },
          payment: {
            paymentStatus: "completed",
            completedAt: JULY,
            createdAt: JULY,
            amount: 100000,
            refundLogs: [],
          },
        },
      ]);
      resourceAccessMock.assertAcademyManager.mockResolvedValue(undefined);

      const res = await service.getAcademySettlementSummary("a1", coach, AUG_YM);
      const c = res.classes[0];
      expect(c.total).toBe(1); // 8월 로스터 유지(7월 구매가 숨기지 않음)
      expect(c.prepaidCount).toBe(1);
      expect(c.billedAmount).toBe(0); // 8월 미구매 → 유효 청구 없음
      expect(c.paymentStatus).toBe("NONE");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 정산 센터 ② — 인별 미수금(목록/상세/remind) · 인별↔집계 정합(§2-0)
  // ══════════════════════════════════════════════════════════════
  describe("인별 미수금 (unpaid-members)", () => {
    // 선불 pending(집계 제외) + 후불 확정 BILLED + 대회 후불 BILLED + 완납/환불 혼합 fixture.
    //  기대 미수금: c2 u1 후불 40000 + t1 u5 대회 20000 = 60000
    //  (c1 u1 선불 pending 50000 은 결제 이탈 — 확정 청구가 아니므로 제외).
    const setupMixedFixture = () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      prismaMock.class.findMany.mockImplementation((args: any) => {
        if (args?.select?.className) {
          return Promise.resolve([
            classDetail("c1", "PREPAID", {
              teamId: "team-1",
              team: { name: "팀1" },
            }),
            classDetail("c2", "POSTPAID", {
              className: "후불수업",
              teamId: "team-1",
              team: { name: "팀1" },
            }),
          ]);
        }
        return Promise.resolve([{ id: "c1" }, { id: "c2" }]);
      });
      prismaMock.enrollment.findMany.mockResolvedValue([
        // u1 선불 pending → 결제 이탈, 집계 제외 (미납 아님)
        prepaidEnrollment("u1", 50000, {
          status: "approved",
          payment: {
            paymentStatus: "pending",
            completedAt: null,
            createdAt: JULY,
            amount: 50000,
            refundLogs: [],
          },
        }),
        // u2 선불 완납 → 미수 없음
        prepaidEnrollment("u2", 30000),
        // u3 부분환불 → billed null, 미수 없음(교차 상쇄 대상 아님)
        prepaidEnrollment("u3", 100000, {
          payment: {
            paymentStatus: "partially_refunded",
            completedAt: JULY,
            createdAt: JULY,
            amount: 100000,
            refundLogs: [{ refundAmount: 30000 }],
          },
        }),
      ]);
      prismaMock.monthlyPostpaidBilling.findMany.mockResolvedValue([
        {
          classId: "c2",
          status: "confirmed",
          items: [
            {
              userId: "u1",
              amount: 40000,
              paymentStatus: "pending",
              attendanceCount: 3,
              payment: null,
            }, // BILLED 40000(미납)
            {
              userId: "u4",
              amount: 40000,
              paymentStatus: "paid",
              attendanceCount: 4,
              payment: { paymentStatus: "completed", refundLogs: [] },
            }, // 완납
          ],
        },
      ]);
      prismaMock.tournament.findMany.mockImplementation((args: any) => {
        if (args?.select?.registrations) {
          return Promise.resolve([
            {
              id: "t1",
              name: "여름컵",
              billingMode: "POSTPAID",
              endDate: new Date("2026-07-01T00:00:00Z"),
              teamId: "team-1",
              team: { name: "팀1" },
              registrations: [
                {
                  userId: "p5",
                  childId: "u5",
                  paymentStatus: "PENDING",
                  calculatedFee: 20000,
                  payment: null,
                }, // BILLED 20000(미납)
                {
                  userId: "p1",
                  childId: "u1",
                  paymentStatus: "PAID",
                  calculatedFee: 15000,
                  payment: {
                    paymentStatus: "completed",
                    completedAt: JULY,
                    createdAt: JULY,
                    refundLogs: [],
                  },
                }, // 완납 — u1 미수 상쇄 안 됨
              ],
            },
          ]);
        }
        return Promise.resolve([{ id: "t1" }]);
      });
      prismaMock.user.findMany.mockResolvedValue([
        { id: "u1", firstName: "길동", lastName: "홍" },
        { id: "u5", firstName: "영희", lastName: "김" },
      ]);
    };

    it("[정합] totalOutstanding == summary.unpaid.amount == Σ members (선불 이탈 제외·후불+대회+환불 혼합)", async () => {
      setupMixedFixture();
      const summary = await service.getTeamSettlementSummary(
        coach,
        YM,
        "team-1",
      );
      const unpaid = await service.getTeamUnpaidMembers(coach, YM, "team-1");

      expect(unpaid.totalOutstanding).toBe(60000);
      expect(unpaid.totalOutstanding).toBe(summary.unpaid.amount); // 불변식
      expect(
        unpaid.members.reduce((s, m) => s + m.outstandingAmount, 0),
      ).toBe(unpaid.totalOutstanding); // 회원별 합 = 총액
      expect(unpaid.totalCount).toBe(2);
      expect(unpaid.yearMonth).toBe(YM);
    });

    it("[행별 max] 완납 대회가 같은 회원 미수를 상쇄하지 않음 · 대표 팀 보존", async () => {
      setupMixedFixture();
      const unpaid = await service.getTeamUnpaidMembers(coach, YM, "team-1");
      const byId = Object.fromEntries(
        unpaid.members.map((m) => [m.memberId, m]),
      );
      // u1 = 후불 40000 (선불 pending 50000 은 이탈로 제외 · 대회 완납 15000 상쇄 없음)
      expect(byId["u1"].outstandingAmount).toBe(40000);
      expect(byId["u1"].sources).toEqual(["CLASS"]);
      expect(byId["u1"].classCount).toBe(1);
      expect(byId["u1"].tournamentCount).toBe(0);
      expect(byId["u1"].teamName).toBe("팀1");
      expect(byId["u5"].outstandingAmount).toBe(20000);
      expect(byId["u5"].sources).toEqual(["TOURNAMENT"]);
      // outstanding desc 정렬 — u1(40000) 이 먼저.
      expect(unpaid.members[0].memberId).toBe("u1");
    });

    it("[대회 포함] 수업+대회 동시 미납 회원 = 1행, sources 둘 다", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      prismaMock.class.findMany.mockImplementation((args: any) =>
        args?.select?.className
          ? Promise.resolve([
              classDetail("c1", "POSTPAID", {
                teamId: "team-1",
                team: { name: "팀1" },
              }),
            ])
          : Promise.resolve([{ id: "c1" }]),
      );
      // 수업 미납 = 후불 확정 라인(선불 pending 은 집계 제외 계약이라 미납 소스가 될 수 없음).
      prismaMock.enrollment.findMany.mockResolvedValue([]);
      prismaMock.monthlyPostpaidBilling.findMany.mockResolvedValue([
        {
          classId: "c1",
          status: "confirmed",
          items: [
            {
              userId: "u1",
              amount: 50000,
              paymentStatus: "pending",
              attendanceCount: 5,
              payment: null,
            },
          ],
        },
      ]);
      prismaMock.tournament.findMany.mockImplementation((args: any) =>
        args?.select?.registrations
          ? Promise.resolve([
              {
                id: "t1",
                name: "컵",
                billingMode: "POSTPAID",
                endDate: new Date("2026-07-01T00:00:00Z"),
                teamId: "team-1",
                team: { name: "팀1" },
                registrations: [
                  {
                    userId: "p1",
                    childId: "u1",
                    paymentStatus: "PENDING",
                    calculatedFee: 20000,
                    payment: null,
                  },
                ],
              },
            ])
          : Promise.resolve([{ id: "t1" }]),
      );
      prismaMock.user.findMany.mockResolvedValue([
        { id: "u1", firstName: "길동", lastName: "홍" },
      ]);

      const unpaid = await service.getTeamUnpaidMembers(coach, YM, "team-1");
      expect(unpaid.members).toHaveLength(1);
      const m = unpaid.members[0];
      expect(m.outstandingAmount).toBe(70000);
      expect([...m.sources].sort()).toEqual(["CLASS", "TOURNAMENT"]);
      expect(m.classCount).toBe(1);
      expect(m.tournamentCount).toBe(1);
      const summary = await service.getTeamSettlementSummary(
        coach,
        YM,
        "team-1",
      );
      expect(unpaid.totalOutstanding).toBe(summary.unpaid.amount);
    });

    it("[빈 결과] 관리 팀 0 → 빈 목록(403 아님)", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue([]);
      const res = await service.getTeamUnpaidMembers(coach, YM);
      expect(res).toEqual({
        yearMonth: YM,
        members: [],
        totalOutstanding: 0,
        totalCount: 0,
      });
      expect(prismaMock.class.findMany).not.toHaveBeenCalled();
    });

    it("[상세] source별 라인·대회 포함·후불 attendanceCount·보호자 isPrimary", async () => {
      setupMixedFixture();
      prismaMock.user.findUnique.mockResolvedValue({
        id: "u1",
        firstName: "길동",
        lastName: "홍",
      });
      prismaMock.parentChild.findMany.mockResolvedValue([
        { parent: { id: "p1", firstName: "부", lastName: "홍", phone: "010" } },
      ]);

      const detail = await service.getTeamUnpaidMemberDetail(
        coach,
        "u1",
        YM,
        "team-1",
      );
      expect(detail.member).toEqual({
        id: "u1",
        name: "홍길동",
        totalOutstanding: 40000,
      });
      expect(detail.parents).toEqual([
        { id: "p1", name: "홍부", phone: "010" },
      ]);
      expect(prismaMock.parentChild.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { childId: "u1" },
          orderBy: { isPrimary: "desc" },
        }),
      );
      const bySrc = Object.fromEntries(
        detail.details.map((d) => [d.sourceId, d]),
      );
      // c1 선불 pending 은 결제 이탈 — 상세 라인에 나타나지 않음
      expect(bySrc["c1"]).toBeUndefined();
      expect(bySrc["c2"].amount).toBe(40000);
      expect(bySrc["c2"].billingTiming).toBe("POSTPAID");
      expect(bySrc["c2"].attendanceCount).toBe(3); // 후불 확정 라인 출석수
      // u1 대회는 완납 → 상세에 없음
      expect(bySrc["t1"]).toBeUndefined();
    });

    it("[상세] 대회만 미납인 회원", async () => {
      setupMixedFixture();
      prismaMock.user.findUnique.mockResolvedValue({
        id: "u5",
        firstName: "영희",
        lastName: "김",
      });
      const detail = await service.getTeamUnpaidMemberDetail(
        coach,
        "u5",
        YM,
        "team-1",
      );
      expect(detail.details).toHaveLength(1);
      expect(detail.details[0].sourceType).toBe("TOURNAMENT");
      expect(detail.details[0].sourceId).toBe("t1");
      expect(detail.details[0].amount).toBe(20000);
      expect(detail.details[0].billingTiming).toBe("POSTPAID");
      expect(detail.details[0].attendanceCount).toBeUndefined();
    });

    it("[상세 404] scope 내 미납 없는 memberId → NotFound(IDOR)", async () => {
      setupMixedFixture();
      await expect(
        service.getTeamUnpaidMemberDetail(coach, "uZZZ", YM, "team-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("[상세 404] 관리 팀 없는 코치 → NotFound(IDOR)", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue([]);
      await expect(
        service.getTeamUnpaidMemberDetail(coach, "u1", YM),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    describe("remind", () => {
      const withParent = () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: "u1",
          firstName: "길동",
          lastName: "홍",
        });
        prismaMock.parentChild.findMany.mockResolvedValue([
          {
            parent: { id: "p1", firstName: "부", lastName: "홍", phone: "010" },
          },
        ]);
      };

      it("보호자 0명 → sent:false, notifyUsers 미호출", async () => {
        setupMixedFixture();
        prismaMock.user.findUnique.mockResolvedValue({
          id: "u1",
          firstName: "길동",
          lastName: "홍",
        });
        prismaMock.parentChild.findMany.mockResolvedValue([]);
        const r = await service.sendTeamUnpaidReminder(coach, "u1", YM);
        expect(r).toEqual({
          sent: false,
          cooldown: false,
          recipientCount: 0,
        });
        expect(notificationsMock.notifyUsers).not.toHaveBeenCalled();
      });

      it("정상 발송 → notifyUsers 호출·월키 쿨다운(unpaid-remind:{id}:{ym})", async () => {
        setupMixedFixture();
        withParent();
        redisMock.setIfNotExists.mockResolvedValue(true);
        const r = await service.sendTeamUnpaidReminder(coach, "u1", YM);
        expect(r).toEqual({ sent: true, cooldown: false, recipientCount: 1 });
        expect(redisMock.setIfNotExists).toHaveBeenCalledWith(
          `unpaid-remind:u1:${YM}`,
          expect.anything(),
          expect.any(Number),
        );
        expect(notificationsMock.notifyUsers).toHaveBeenCalledWith(
          ["p1"],
          expect.objectContaining({
            notificationType: "payment_unpaid",
            linkUrl: "/payment/history?tab=pending",
          }),
        );
        // 총액(후불 확정 청구만=40000 — 선불 이탈 50000 제외) 문구 포함
        const payload = notificationsMock.notifyUsers.mock.calls[0][1];
        expect(payload.message).toContain("40,000");
      });

      it("쿨다운 2회차 → cooldown:true, 발송 안 함", async () => {
        setupMixedFixture();
        withParent();
        redisMock.setIfNotExists.mockResolvedValue(false);
        const r = await service.sendTeamUnpaidReminder(coach, "u1", YM);
        expect(r).toEqual({ sent: false, cooldown: true, recipientCount: 0 });
        expect(notificationsMock.notifyUsers).not.toHaveBeenCalled();
      });

      it("월별 키 분리 — 서로 다른 월은 독립 쿨다운 키", async () => {
        setupMixedFixture();
        withParent();
        redisMock.setIfNotExists.mockResolvedValue(true);
        await service.sendTeamUnpaidReminder(coach, "u1", "2026-07");
        await service.sendTeamUnpaidReminder(coach, "u1", "2026-06");
        const keys = redisMock.setIfNotExists.mock.calls.map((c) => c[0]);
        expect(keys).toContain("unpaid-remind:u1:2026-07");
        expect(keys).toContain("unpaid-remind:u1:2026-06");
      });

      it("대회만 미납인 회원도 발송 성공", async () => {
        setupMixedFixture();
        prismaMock.user.findUnique.mockResolvedValue({
          id: "u5",
          firstName: "영희",
          lastName: "김",
        });
        prismaMock.parentChild.findMany.mockResolvedValue([
          {
            parent: { id: "p5", firstName: "부", lastName: "김", phone: "011" },
          },
        ]);
        redisMock.setIfNotExists.mockResolvedValue(true);
        const r = await service.sendTeamUnpaidReminder(coach, "u5", YM);
        expect(r.sent).toBe(true);
        expect(r.recipientCount).toBe(1);
      });
    });
  });

  // ══════════════════════════════════════════════════════════════
  // 정산 센터 ③ — 팀 거래 내역(결제 1건=1행 장부)
  // ══════════════════════════════════════════════════════════════
  describe("팀 거래 내역 (getTeamTransactions)", () => {
    it("[빈 결과] 관리 팀 0 → 빈 목록(쿼리 미실행)", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue([]);
      const res = await service.getTeamTransactions(coach, YM);
      expect(res).toEqual({ yearMonth: YM, items: [], totalCount: 0 });
      expect(prismaMock.payment.findMany).not.toHaveBeenCalled();
    });

    it("월 경계(KST)·상태 필터·팀 연결 스코프로 조회하고 파생 필드를 매핑한다", async () => {
      resourceAccessMock.resolveManageableTeamIds.mockResolvedValue(["team-1"]);
      prismaMock.payment.count.mockResolvedValue(3);
      prismaMock.payment.findMany.mockResolvedValue([
        {
          id: "pay-1",
          amount: 50000,
          paymentStatus: "completed",
          completedAt: new Date("2026-07-24T05:32:00Z"),
          user: { firstName: "부모", lastName: "홍" },
          product: { billingTiming: "PREPAID" },
          enrollments: [
            {
              class: { className: "3월 정규수업" },
              child: { firstName: "길동", lastName: "홍" },
            },
          ],
          tournamentRegistrations: [],
          monthlyBillingLines: [],
        },
        {
          id: "pay-2",
          amount: 40000,
          paymentStatus: "refunded",
          completedAt: new Date("2026-07-20T02:00:00Z"),
          user: { firstName: "부모", lastName: "김" },
          product: null,
          enrollments: [],
          tournamentRegistrations: [
            {
              tournament: { name: "여름컵", billingMode: "POSTPAID" },
              child: { firstName: "영희", lastName: "김" },
            },
          ],
          monthlyBillingLines: [],
        },
        {
          id: "pay-3",
          amount: 30000,
          paymentStatus: "completed",
          completedAt: new Date("2026-07-18T02:00:00Z"),
          user: { firstName: "부모", lastName: "박" },
          product: null,
          enrollments: [],
          tournamentRegistrations: [
            {
              tournament: { name: "가을컵", billingMode: "PREPAID" },
              child: null,
            },
          ],
          monthlyBillingLines: [],
        },
      ]);

      const res = await service.getTeamTransactions(coach, YM);

      // where 계약 — KST 월 경계 + 상태 필터 + 팀 연결 3축 OR.
      const arg = prismaMock.payment.findMany.mock.calls[0][0];
      expect(arg.where.completedAt.gte.toISOString()).toBe(
        "2026-06-30T15:00:00.000Z", // 7/1 00:00 KST
      );
      expect(arg.where.completedAt.lt.toISOString()).toBe(
        "2026-07-31T15:00:00.000Z", // 8/1 00:00 KST
      );
      expect(arg.where.paymentStatus.in).toEqual([
        "completed",
        "refunded",
        "partially_refunded",
        "cancelled",
      ]);
      expect(arg.where.OR).toHaveLength(3);
      expect(arg.orderBy).toEqual({ completedAt: "desc" });

      expect(res.totalCount).toBe(3);
      expect(res.items[0]).toMatchObject({
        paymentId: "pay-1",
        payerName: "홍부모",
        childName: "홍길동",
        subjectName: "3월 정규수업",
        sourceType: "CLASS",
        billingTiming: "PREPAID",
      });
      // 대회 건도 신청 자녀(선수)명을 childName 으로 매핑 — 훈련 건과 표기 통일.
      expect(res.items[1]).toMatchObject({
        paymentId: "pay-2",
        paymentStatus: "refunded",
        childName: "김영희",
        subjectName: "여름컵",
        sourceType: "TOURNAMENT",
        billingTiming: "POSTPAID",
      });
      // 자녀 미지정 대회 신청 — childName null 유지(프론트가 대회명 타이틀로 폴백).
      expect(res.items[2]).toMatchObject({
        paymentId: "pay-3",
        childName: null,
        subjectName: "가을컵",
        sourceType: "TOURNAMENT",
      });
    });
  });
});
