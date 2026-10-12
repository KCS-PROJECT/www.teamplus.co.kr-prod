import { Prisma } from "@prisma/client";
import { kstTodayUtcMidnight } from "./kst-date.util";

/**
 * 환불 정책 "이용 개시" 판정 SoT(선불 수강) — 결제일(KST 달력일) 이후 해당 수업에서
 * ① present 출석이 1회라도 있거나 ② 취소되지 않은 첫 일정의 날짜가 오늘(KST)이거나
 * 지났으면 그 결제는 이용이 개시된 것으로 본다.
 *
 * ②는 출석 입력이 구조적으로 일정보다 늦게 생기는 지연 창(코치 미입력·결석)에서
 * 전액 셀프 취소가 통과되는 구멍을 막는다. 개시 시점은 첫 이용일 당일 0시(KST) —
 * 대회(시작일 당일)와 같은 기준이며, 결제 당일에 일정이 있으면 결제 즉시 개시다.
 *
 * PaymentRefundService(셀프 취소 차단)·AuthService(탈퇴 전 환불 가능 결제 안내)·
 * EnrollmentsService(무료 등록 본인 취소)가 공유한다. 순수 함수 모듈이라 어느 모듈과도
 * 결합되지 않는다.
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

/** 결제 후 첫 일정 조회용 최소 DB 타입. */
export type FirstScheduleLookupDb = {
  classSchedule: {
    findFirst(args: {
      where: Prisma.ClassScheduleWhereInput;
      orderBy: { scheduledDate: "asc" };
      select: { scheduledDate: true };
    }): Promise<{ scheduledDate: Date } | null>;
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
 * 결제일(KST 달력일) 이후 ~ 오늘까지, 취소되지 않은 일정이 1건이라도 있는가(당일 포함).
 * 출석 기록 유무와 무관한 시간 기준 개시 판정 — 결석·미입력 회차도 포함한다.
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
      scheduledDate: { gte: paidDayUtc, lte: kstTodayUtcMidnight() },
    },
    select: { id: true },
  });
  return elapsed !== null;
}

/**
 * 결제일(KST 달력일) 이후 취소되지 않은 첫 일정의 날짜(UTC 자정값). 없으면 null.
 * 이 날짜가 오늘(KST) 이하이면 이용 개시로 본다 — `hasElapsedScheduleSincePayment` 와
 * 같은 기준이되, 개시 시점(첫 이용일)을 응답에 실을 수 있게 날짜를 돌려준다.
 */
export async function findFirstScheduleDaySincePayment(
  db: FirstScheduleLookupDb,
  enrollment: { classId: string },
  paidDayUtc: Date,
): Promise<Date | null> {
  const first = await db.classSchedule.findFirst({
    where: {
      classId: enrollment.classId,
      isCancelled: false,
      scheduledDate: { gte: paidDayUtc },
    },
    orderBy: { scheduledDate: "asc" },
    select: { scheduledDate: true },
  });
  return first?.scheduledDate ?? null;
}
