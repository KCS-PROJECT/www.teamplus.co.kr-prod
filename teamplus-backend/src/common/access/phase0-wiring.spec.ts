import { AttendanceController } from "@/attendance/attendance.controller";
import { PaymentsController } from "@/payments/payments.controller";
import { ClassesController } from "@/classes/classes.controller";
import { ClassesListController } from "@/classes/classes-list.controller";
import { AcademyController } from "@/academy/academy.controller";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";

/**
 * Phase 0 배선(wiring) 회귀 스펙 — 출석·정산·수업 결제 경로.
 *
 * 가드 로직 자체는 resource-access.service.spec 이 검증한다. 이 스펙은
 * "컨트롤러가 req.user(와 URL 스코프)를 서비스까지 실제로 전달하는지"만 고정한다 —
 * 전달이 끊기면 서비스 가드가 있어도 무력화되는 회귀를 차단.
 */
describe("Phase 0 controller wiring — attendance/payments/classes", () => {
  const requester: JwtUserPayload = {
    id: "coach-1",
    email: "coach-1@t.dev",
    userType: "COACH",
  };
  const req = { user: requester } as any;

  it("attendance monthly-counts: req.user 가 서비스로 전달된다", async () => {
    const attendanceService = {
      getClassMonthlyAttendanceCounts: jest.fn(),
    };
    const controller = new AttendanceController(attendanceService as any);
    await controller.getClassMonthlyAttendanceCounts("class-1", req, "2026-06");
    expect(
      attendanceService.getClassMonthlyAttendanceCounts,
    ).toHaveBeenCalledWith("class-1", "2026-06", requester);
  });

  it("postpaid draft/confirm: req.user 가 서비스로 전달된다", async () => {
    const postpaid = {
      getDraft: jest.fn(),
      confirmSettlement: jest.fn(),
    };
    const controller = new PaymentsController(
      {} as any, // paymentsService
      {} as any, // webhookRetryService
      {} as any, // kgInicisGateway
      {} as any, // tossGateway
      {} as any, // calculationService
      postpaid as any,
      {} as any, // settlementSummaryService (Phase 2b)
      {} as any, // redisService
    );

    await controller.getPostpaidDraft(
      { classId: "class-1", yearMonth: "2026-06" } as any,
      req,
    );
    expect(postpaid.getDraft).toHaveBeenCalledWith(
      "class-1",
      "2026-06",
      requester,
    );

    await controller.confirmPostpaidSettlement(req, {
      classId: "class-1",
      yearMonth: "2026-06",
    } as any);
    expect(postpaid.confirmSettlement).toHaveBeenCalledWith(
      "class-1",
      "2026-06",
      requester,
    );
  });

  it("수업 결제 조회 3경로: req.user + URL 스코프(expectedScope)가 전달된다", async () => {
    const classesService = { getClassPayments: jest.fn() };

    // classId 단독 경로 — 스코프 없음
    const listController = new ClassesListController(classesService as any);
    await listController.getClassPaymentsById("class-1", req);
    expect(classesService.getClassPayments).toHaveBeenCalledWith(
      "class-1",
      requester,
      undefined,
      undefined,
    );

    // 팀 스코프 경로 — expectedScope.teamId + 선택월(yearMonth) 전달
    const teamController = new ClassesController(classesService as any);
    await teamController.getClassPayments("team-1", "class-1", req, "2026-06");
    expect(classesService.getClassPayments).toHaveBeenCalledWith(
      "class-1",
      requester,
      { teamId: "team-1" },
      "2026-06",
    );

    // 아카데미 미러 경로 — expectedScope.academyId
    const academyController = new AcademyController(
      {} as any, // academyService
      classesService as any,
      {} as any, // settlementSummaryService (Phase 2b)
    );
    await academyController.getAcademyClassPayments("aca-1", "class-1", req);
    expect(classesService.getClassPayments).toHaveBeenCalledWith(
      "class-1",
      requester,
      { academyId: "aca-1" },
      undefined,
    );
  });
});
