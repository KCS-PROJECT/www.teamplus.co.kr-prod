import { BadRequestException } from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import { SETTLED_MONTH_MESSAGE } from "@/payments/settlement/postpaid-attendance.util";

/**
 * P3-H1 전용 계약 spec — 선재 깨진 attendance.service.spec(clubMember 레거시)과 분리한
 * 독립 파일 (Round 13 범위 허용). updateAttendance 경로에서:
 *   1) lock 밖 사전 검사는 통과했지만 lock 안 재조회에서 정산 확정 발견 → mutation 미실행
 *   2) 미확정 → mutation 실행 + `lock → 확정월 재조회 → mutation` 호출 순서 고정
 */
describe("AttendanceService · P3-H1 정산 확정 월 재검증 계약", () => {
  const JUN10 = new Date("2026-06-10T00:00:00.000Z");
  const attendanceId = "att-1";
  const scheduleId = "sched-1";
  const classId = "class-postpaid-1";

  type Tx = {
    $queryRaw: jest.Mock;
    class: { findUnique: jest.Mock };
    classSchedule: { findUnique: jest.Mock };
    monthlyPostpaidBilling: { findUnique: jest.Mock };
    classAttendance: { update: jest.Mock };
    memberCredit: { aggregate: jest.Mock };
  };

  let tx: Tx;
  let prisma: {
    classAttendance: { findUnique: jest.Mock };
    classSchedule: { findUnique: jest.Mock };
    monthlyPostpaidBilling: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    parentChild: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: AttendanceService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      class: {
        // 후불 수업 — postpaid lock 획득 경로 진입.
        findUnique: jest.fn().mockResolvedValue({ billingMode: "POSTPAID" }),
      },
      classSchedule: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ classId, scheduledDate: JUN10 }),
      },
      monthlyPostpaidBilling: { findUnique: jest.fn() },
      classAttendance: {
        update: jest.fn().mockResolvedValue({
          id: attendanceId,
          attendanceStatus: "absent",
          modifiedAt: new Date(),
          modifiedBy: "admin-1",
          modifiedReason: null,
          updatedAt: new Date(),
        }),
      },
      memberCredit: { aggregate: jest.fn() },
    };

    prisma = {
      classAttendance: {
        findUnique: jest.fn().mockResolvedValue({
          id: attendanceId,
          memberId: "kid-1",
          scheduleId,
          attendanceStatus: "absent",
          checkedInAt: null,
          creditDeducted: false,
          // teamId/academyId 없음 → ADMIN 폴백 권한 경로 (팀/학원 조회 배선 최소화)
          schedule: {
            scheduledDate: JUN10,
            class: {
              id: classId,
              className: "후불반",
              teamId: null,
              academyId: null,
            },
          },
        }),
      },
      // lock 밖 사전 검사(assertMonthNotSettled) — 미확정으로 통과시켜
      //   "검사 통과 후 정산 확정" 레이스를 재현한다.
      classSchedule: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ classId, scheduledDate: JUN10 }),
      },
      monthlyPostpaidBilling: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ userType: "ADMIN" }),
      },
      parentChild: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: (t: Tx) => unknown) => cb(tx)),
    };

    service = new AttendanceService(
      prisma as never,
      { del: jest.fn() } as never,
      { restoreOne: jest.fn(), deductOne: jest.fn() } as never,
      { record: jest.fn() } as never,
      {
        invalidateUnreadCountCache: jest.fn(),
        pushOnlyToUsers: jest.fn(),
      } as never,
      {} as never,
    );
  });

  it("lock 안 재조회에서 정산 확정 발견 시 mutation 미실행 (사전 검사 통과 레이스)", async () => {
    tx.monthlyPostpaidBilling.findUnique.mockResolvedValue({
      status: "confirmed",
    });

    await expect(
      service.updateAttendance("admin-1", attendanceId, {
        attendanceStatus: "absent",
      } as never),
    ).rejects.toThrow(new BadRequestException(SETTLED_MONTH_MESSAGE));

    expect(tx.classAttendance.update).not.toHaveBeenCalled();
    // 재검증이 lock 밖(prisma)이 아니라 tx 안에서 수행됐는지 확인.
    expect(tx.monthlyPostpaidBilling.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { classId_yearMonth: { classId, yearMonth: "2026-06" } },
      }),
    );
  });

  it("미확정이면 mutation 실행 — lock → 확정월 재조회 → mutation 호출 순서 고정", async () => {
    tx.monthlyPostpaidBilling.findUnique.mockResolvedValue(null);

    const result = await service.updateAttendance("admin-1", attendanceId, {
      attendanceStatus: "absent",
    } as never);

    expect(result.id).toBe(attendanceId);
    expect(tx.classAttendance.update).toHaveBeenCalledTimes(1);

    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
    const statusReadOrder =
      tx.monthlyPostpaidBilling.findUnique.mock.invocationCallOrder[0];
    const mutationOrder = tx.classAttendance.update.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(statusReadOrder);
    expect(statusReadOrder).toBeLessThan(mutationOrder);
  });
});
