import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const SCHEDULE_HAS_ATTENDANCE_MESSAGE =
  "출석 기록이 있는 일정은 취소할 수 없습니다. 출석을 먼저 해제해주세요.";

/**
 * 출석 기록(출석·결석) 보유 회차의 취소 거부 — 409 SCHEDULE_HAS_ATTENDANCE + 대상 회차 목록.
 * 출석은 후불 정산(출석×단가)·선불 차감의 근거라 당일 회차라도 취소로 지우지 않는다 —
 * 수업 수정 폼 일정 diff 의 불가침 기준과 같다. 출석 해제는 기록을 삭제하므로
 * 해제 후에는 취소할 수 있다.
 * 출석 쓰기 경로는 schedule lock 을 잡지 않으므로 이 검사와 동시에 들어온 출석은 막지 못한다 —
 * 그 경우는 취소 부수효과(출석 cancelled 전환·수업권 복원)가 정합을 맞춘다.
 */
export async function assertSchedulesHaveNoAttendance(
  tx: Prisma.TransactionClient,
  scheduleIds: string[],
): Promise<void> {
  if (scheduleIds.length === 0) return;
  const attended = await tx.classAttendance.groupBy({
    by: ["scheduleId"],
    where: { scheduleId: { in: scheduleIds } },
  });
  if (attended.length > 0) {
    throw new ConflictException({
      errorCode: "SCHEDULE_HAS_ATTENDANCE",
      message: SCHEDULE_HAS_ATTENDANCE_MESSAGE,
      conflicts: attended.map((a) => ({ scheduleId: a.scheduleId })),
    });
  }
}
