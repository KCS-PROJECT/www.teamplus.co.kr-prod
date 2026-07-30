import { Prisma } from "@prisma/client";

/**
 * 환불 정책 1단계 "이용 개시" 판정 SoT — 결제일(KST 달력일) 이후 해당 수업에서
 * present 출석이 1회라도 있으면 그 결제는 이용이 개시된 것으로 본다.
 *
 * PaymentRefundService(셀프 취소 차단)와 AuthService(탈퇴 전 환불 가능 결제 안내)가
 * 공유한다. 순수 함수 모듈이라 어느 모듈과도 결합되지 않는다.
 */

/** count 만 필요한 최소 DB 타입 — PrismaService / Prisma.TransactionClient 모두 대입 가능. */
export type AttendanceCountDb = {
  classAttendance: {
    count(args: {
      where: Prisma.ClassAttendanceWhereInput;
    }): Promise<number>;
  };
};

/**
 * 결제일(KST 달력일, UTC 자정 규약) 이후 해당 수업의 present 출석 수.
 * 결제일 이전 일정의 출석(과거 재수강분)은 이 결제의 사용분이 아니므로 제외한다.
 */
export function countPresentAttendanceSincePayment(
  db: AttendanceCountDb,
  enrollment: { childId: string; classId: string },
  paidDayUtc: Date,
): Promise<number> {
  return db.classAttendance.count({
    where: {
      memberId: enrollment.childId,
      attendanceStatus: "present",
      schedule: {
        classId: enrollment.classId,
        scheduledDate: { gte: paidDayUtc },
      },
    },
  });
}
