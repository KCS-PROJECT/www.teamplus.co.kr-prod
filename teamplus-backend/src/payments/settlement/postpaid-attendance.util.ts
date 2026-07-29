/**
 * 후불(POSTPAID) 출석 집계 공통 유틸 — 단일 SoT.
 *
 * 정산 확정(confirmSettlement)·정산 초안(getDraft)·단가 잠금 가드
 * (assertPostpaidUnitPriceMutable)가 **같은 집계·필터 로직**을 쓰기 위해
 * PostpaidSettlementService.aggregateAttendance() 에서 추출했다 —
 * 판정이 갈라지면 "가드는 통과했는데 정산은 다른 인원을 집계"하는 불일치가 생긴다.
 *
 * 집계 규칙:
 *   - 비취소 일정(isCancelled=false)의 present 출석만 센다.
 *   - BOTH(선택형) 수업은 "후불 상품을 선택한 학생"만 대상 — 선불 학생 출석은
 *     크레딧으로 이미 정산되었으므로 제외(이중청구 방지). POSTPAID 전용 수업은
 *     전원 후불이므로 필터 없음.
 *
 * 월 경계 계약:
 *   scheduledDate 는 @db.Date(UTC 자정 date-only) — 월 범위는
 *   [Date.UTC(y,m-1,1), Date.UTC(y,m,1)) 반개구간. KST 변환을 개입시키지 않는다.
 */

import { BadRequestException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { BillingTiming } from "../payment-calculation.service";

/**
 * PrismaService · Prisma.TransactionClient 공용 — 필요한 위임자만 구조 타입으로 요구.
 * (TransactionClient 는 PrismaClient 에서 $transaction 등만 제외한 형태라 호환)
 */
export type PostpaidAttendanceDb = Pick<
  PrismaClient,
  "classSchedule" | "class" | "enrollment" | "monthlyPostpaidBilling"
>;

export const POSTPAID_PRICE_LOCK_MESSAGE = (months: string[]): string =>
  `정산되지 않은 출석이 있어 회당 단가를 변경할 수 없습니다. ${months.join(", ")} 정산 확정 후 수정해주세요.`;

/** "YYYY-MM" → 해당 월 [start, end) — scheduledDate(@db.Date) UTC 자정 경계. */
export function monthRangeUtc(yearMonth: string): { start: Date; end: Date } {
  const [y, m] = yearMonth.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

/**
 * BOTH(선택형) 수업의 후불 대상 회원 필터 — 후불 상품 enrollment 보유자만 남긴다.
 * POSTPAID 전용 수업은 입력 그대로 반환(전원 후불).
 */
async function filterPostpaidMembers(
  db: PostpaidAttendanceDb,
  classId: string,
  memberIds: string[],
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();

  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { billingMode: true },
  });
  if (cls?.billingMode !== "BOTH") return new Set(memberIds);

  const postpaidEnrollments = await db.enrollment.findMany({
    where: {
      classId,
      childId: { in: memberIds },
      status: { in: ["approved", "paid"] },
      product: { billingTiming: BillingTiming.POSTPAID },
    },
    select: { childId: true },
  });
  return new Set(postpaidEnrollments.map((e) => e.childId));
}

/**
 * 수업×월 후불 출석 집계 (present) — 회원별 출석 횟수 Map.
 * PostpaidSettlementService.aggregateAttendance() 의 추출본 — 동작 동일.
 */
export async function aggregatePostpaidAttendance(
  db: PostpaidAttendanceDb,
  classId: string,
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const schedules = await db.classSchedule.findMany({
    where: {
      classId,
      scheduledDate: { gte: start, lt: end },
      isCancelled: false,
    },
    select: {
      attendances: {
        where: { attendanceStatus: "present" },
        select: { memberId: true },
      },
    },
  });

  const counts = new Map<string, number>();
  for (const s of schedules) {
    for (const a of s.attendances) {
      counts.set(a.memberId, (counts.get(a.memberId) ?? 0) + 1);
    }
  }

  if (counts.size > 0) {
    const postpaidSet = await filterPostpaidMembers(db, classId, [
      ...counts.keys(),
    ]);
    for (const memberId of [...counts.keys()]) {
      if (!postpaidSet.has(memberId)) counts.delete(memberId);
    }
  }

  return counts;
}

/**
 * 정산 확정(confirmed)되지 않은 후불 출석 존재 월 목록 — "YYYY-MM" 오름차순.
 * 당월은 확정이 불가능(월 마감 후 확정 정책)하므로 당월 출석 ≥1 이면 항상 포함된다.
 */
export async function findUnsettledPostpaidMonths(
  db: PostpaidAttendanceDb,
  classId: string,
): Promise<string[]> {
  const schedules = await db.classSchedule.findMany({
    where: { classId, isCancelled: false },
    select: {
      scheduledDate: true,
      attendances: {
        where: { attendanceStatus: "present" },
        select: { memberId: true },
      },
    },
  });

  // 월별 present 회원 수집 — scheduledDate 는 UTC date-only 라 ISO 앞 7자가 월 키.
  const membersByMonth = new Map<string, Set<string>>();
  const allMemberIds = new Set<string>();
  for (const s of schedules) {
    if (s.attendances.length === 0) continue;
    const month = s.scheduledDate.toISOString().slice(0, 7);
    const set = membersByMonth.get(month) ?? new Set<string>();
    for (const a of s.attendances) {
      set.add(a.memberId);
      allMemberIds.add(a.memberId);
    }
    membersByMonth.set(month, set);
  }
  if (membersByMonth.size === 0) return [];

  // BOTH 필터는 집계와 동일 로직 공유 — 후불 대상 회원의 출석이 있는 월만 남긴다.
  const postpaidSet = await filterPostpaidMembers(db, classId, [
    ...allMemberIds,
  ]);
  const relevantMonths = [...membersByMonth.entries()]
    .filter(([, members]) => [...members].some((m) => postpaidSet.has(m)))
    .map(([month]) => month);
  if (relevantMonths.length === 0) return [];

  const confirmed = await db.monthlyPostpaidBilling.findMany({
    where: {
      classId,
      yearMonth: { in: relevantMonths },
      status: "confirmed",
    },
    select: { yearMonth: true },
  });
  const confirmedSet = new Set(confirmed.map((b) => b.yearMonth));

  return relevantMonths.filter((m) => !confirmedSet.has(m)).sort();
}

/**
 * 후불 단가(유효금액·권리조건) 수정 가드 — 미정산 출석 존재 시 거부.
 * 호출 계약: class postpaid lock(acquireClassPostpaidLock) 획득 트랜잭션 안에서 호출
 * (출석 기록·정산 확정과의 레이스 차단 — 설계 §4-0 B).
 */
export async function assertPostpaidUnitPriceMutable(
  db: PostpaidAttendanceDb,
  classId: string,
): Promise<void> {
  const unsettled = await findUnsettledPostpaidMonths(db, classId);
  if (unsettled.length > 0) {
    throw new BadRequestException(POSTPAID_PRICE_LOCK_MESSAGE(unsettled));
  }
}

export const SETTLED_MONTH_MESSAGE =
  "정산이 확정된 월의 출석은 수정할 수 없습니다. 관리자에게 문의해주세요.";

/**
 * 정산 확정 월의 출석 변경 거부 — 확정 청구(출석×단가)의 근거를 사후에 바꾸는
 * mutation 차단 (P3-H1).
 * 호출 계약: postpaid lock 획득 트랜잭션 안에서, 출석 mutation **전에** 호출한다 —
 * lock 은 실행 순서만 직렬화하므로, "정산 확정 → 출석 변경" 순서는 lock 안의
 * 이 재검증만이 막는다. lock 밖 사전 검사는 빠른 실패용일 뿐 가드가 아니다.
 * POSTPAID 수업만 MonthlyPostpaidBilling 이 존재하므로 PREPAID 수업은 자연 통과.
 */
export async function assertScheduleMonthNotSettled(
  db: PostpaidAttendanceDb,
  scheduleId: string,
): Promise<void> {
  const schedule = await db.classSchedule.findUnique({
    where: { id: scheduleId },
    select: { classId: true, scheduledDate: true },
  });
  if (!schedule) return;
  // scheduledDate 는 @db.Date(UTC 자정) — ISO 앞 7자가 월 키 (정산 yearMonth 와 동일 축).
  const yearMonth = schedule.scheduledDate.toISOString().slice(0, 7);
  const billing = await db.monthlyPostpaidBilling.findUnique({
    where: { classId_yearMonth: { classId: schedule.classId, yearMonth } },
    select: { status: true },
  });
  if (billing?.status === "confirmed") {
    throw new BadRequestException(SETTLED_MONTH_MESSAGE);
  }
}
