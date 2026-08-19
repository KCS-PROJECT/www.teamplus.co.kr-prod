import { Prisma } from "@prisma/client";
import { kstTodayUtcMidnight } from "./kst-date.util";

/**
 * 환불 정책 1단계 "이용 개시" 판정 SoT — 결제일(KST 달력일) 이후 해당 수업에서
 * ① present 출석이 1회라도 있거나 ② 취소되지 않은 일정이 이미 지났으면(어제 이전)
 * 그 결제는 이용이 개시된 것으로 본다.
 *
 * ②는 출석 입력이 구조적으로 일정보다 늦게 생기는 지연 창(코치 미입력·결석)에서
 * 전액 셀프 취소가 통과되는 구멍을 막는다. 당일 일정은 아직 진행 전일 수 있어
 * 경과로 보지 않는다(day-level, 소비자 우호) — 당일 이용분은 ①이 잡는다.
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

/** 일정 경과 판정용 최소 DB 타입. */
export type ScheduleLookupDb = {
  classSchedule: {
    findFirst(args: {
      where: Prisma.ClassScheduleWhereInput;
      select: { id: true };
    }): Promise<{ id: string } | null>;
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

/**
 * 결제일(KST 달력일) 이후 ~ 어제까지, 취소되지 않은 일정이 1건이라도 지났는가.
 * 출석 기록 유무와 무관한 시간 기준 개시 판정(A안 ②) — 결석·미입력 회차도 포함한다.
 */
export async function hasElapsedScheduleSincePayment(
  db: ScheduleLookupDb,
  enrollment: { classId: string },
  paidDayUtc: Date,
): Promise<boolean> {
  const elapsed = await db.classSchedule.findFirst({
    where: {
      classId: enrollment.classId,
      isCancelled: false,
      scheduledDate: { gte: paidDayUtc, lt: kstTodayUtcMidnight() },
    },
    select: { id: true },
  });
  return elapsed !== null;
}
