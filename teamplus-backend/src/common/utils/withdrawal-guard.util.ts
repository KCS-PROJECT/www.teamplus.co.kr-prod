import { Prisma } from "@prisma/client";
import { REFUND_REQUEST_ACTIVE_STATUSES } from "@/payments/refund-requests/refund-request.constants";
import { eligibleEnrollmentWhereAnyOf } from "@/common/billing/enrollment-eligibility.util";
import { utcMonthStart } from "@/common/utils/class-lifecycle.util";
import { addUtcMonths, kstTodayUtcMidnight } from "@/common/utils/kst-date.util";

/**
 * 탈퇴 차단 사유 카운트 유틸 — 운영 자산(팀·수업·대회·오픈클래스·자녀 수강 자격)과
 * 미종결 채권·채무(후불 미납·후불 대회 미정산·처리 중 환불 요청)를 집계한다.
 *
 * requestWithdraw 신청 가드 · 배치 탈퇴 확정 직전 재검증 · GET /auth/withdraw/eligibility
 * 사전 조회의 단일 SoT. NestJS provider 가 아닌 순수 함수라 user-anonymize.util 과 동일
 * 계층에서 AuthModule/스케줄러 어느 쪽과도 결합되지 않는다.
 */

/** count(+스코프 id 조회) 만 필요한 최소 DB 타입 — PrismaService / Prisma.TransactionClient 모두 대입 가능. */
export type OwnershipCountDb = {
  team: {
    count(args: { where: Prisma.TeamWhereInput }): Promise<number>;
    findMany(args: {
      where: Prisma.TeamWhereInput;
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
  };
  class: { count(args: { where: Prisma.ClassWhereInput }): Promise<number> };
  tournament: {
    count(args: { where: Prisma.TournamentWhereInput }): Promise<number>;
  };
  academy: {
    count(args: { where: Prisma.AcademyWhereInput }): Promise<number>;
    findMany(args: {
      where: Prisma.AcademyWhereInput;
      select: { id: true };
    }): Promise<Array<{ id: string }>>;
  };
  enrollment: {
    count(args: { where: Prisma.EnrollmentWhereInput }): Promise<number>;
    findMany(args: {
      where: Prisma.EnrollmentWhereInput;
      select: { childId: true; classId: true };
    }): Promise<Array<{ childId: string; classId: string }>>;
  };
  classAttendance: {
    findMany(args: {
      where: Prisma.ClassAttendanceWhereInput;
      select: {
        memberId: true;
        schedule: { select: { classId: true; scheduledDate: true } };
      };
    }): Promise<
      Array<{
        memberId: string;
        schedule: { classId: string; scheduledDate: Date };
      }>
    >;
  };
  monthlyPostpaidBilling: {
    findMany(args: {
      where: Prisma.MonthlyPostpaidBillingWhereInput;
      select: { classId: true; yearMonth: true };
    }): Promise<Array<{ classId: string; yearMonth: string }>>;
  };
  monthlyPostpaidBillingLine: {
    count(args: {
      where: Prisma.MonthlyPostpaidBillingLineWhereInput;
    }): Promise<number>;
  };
  tournamentRegistration: {
    count(args: {
      where: Prisma.TournamentRegistrationWhereInput;
    }): Promise<number>;
  };
  refundRequest: {
    count(args: { where: Prisma.RefundRequestWhereInput }): Promise<number>;
  };
};

const ACTIVE_TOURNAMENT_STATUSES = ["scheduled", "ongoing"];
/**
 * 후불 대회의 미정산 등록 상태 — UNPAID(종료 후 청구 전) · PENDING(청구 후 미납).
 * 선불 대회의 PENDING 은 "결제 이탈"이라 미수금이 아니므로(미수금=확정청구만 계약)
 * 반드시 tournament.billingMode = POSTPAID 필터와 함께 사용한다.
 */
const UNSETTLED_TOURNAMENT_REG_STATUSES = ["UNPAID", "PENDING"];

/** 자녀 수강 가드가 쓰는 최소 DB 타입 — 학부모 탈퇴·자녀 삭제(children.service)가 공유. */
export type ChildEnrollmentGuardDb = Pick<
  OwnershipCountDb,
  "enrollment" | "classAttendance" | "monthlyPostpaidBilling"
>;

/**
 * 자녀 "수강 중" where — 자녀 스코프(childId / child 관계)는 호출처가 합성한다.
 *   · 정기 수업: 이번 달 ∪ 다음 달 자격(enrollment-eligibility.util 단일 SoT) — 명단 유지
 *     판정(roster-retention.util)과 같은 판매 창. 다음 달분 선결제가 탈퇴로 증발하지 않게 막는다.
 *   · 스팟: 판매 상한이 없어 두 달 밖 회차도 결제되므로, 결제 완료·아직 안 지난 것은 월 무관.
 *   선불 pending/approved(미결제)·지난 달 후불 approved 는 수강 중이 아니다 — 미납·정산 전
 *   출석은 별도 채권 축(countUnbilledPostpaidAttendance·미납 라인)이 본다.
 */
export function activeChildEnrollmentWhere(
  todayMonth: Date,
): Prisma.EnrollmentWhereInput {
  return {
    OR: [
      eligibleEnrollmentWhereAnyOf([todayMonth, addUtcMonths(todayMonth, 1)]),
      {
        billingTiming: "PREPAID",
        status: "paid",
        billingMonth: { gte: todayMonth },
        class: { trainingType: "spot" },
      },
    ],
  };
}

export const UNPAID_POSTPAID_LINE_MESSAGE =
  "미납된 후불 정산이 있어 처리할 수 없습니다. 결제를 완료한 후 다시 시도해주세요.";

/**
 * 자녀에게 확정 청구된 미납(pending) 후불 라인 수.
 * 청구 라인은 자녀 User.id 에 달리고 부모 탈퇴 가드는 부모–자녀 링크를 타고 찾으므로,
 * 링크를 끊는 경로(자녀 삭제·연결 해제)가 이 검사를 생략하면 미납을 남긴 채 탈퇴가 통과한다.
 */
export async function countUnpaidPostpaidLines(
  db: Pick<OwnershipCountDb, "monthlyPostpaidBillingLine">,
  childId: string,
): Promise<number> {
  return db.monthlyPostpaidBillingLine.count({
    where: { paymentStatus: "pending", userId: childId },
  });
}

/**
 * 정산 확정 전 후불 출석 — (자녀, 수업, 월) 건수.
 * 후불 청구 라인은 감독이 정산을 확정해야 생기므로(postpaid-settlement confirm), 확정 전
 * 출석은 미납 라인 축에 잡히지 않는다. 그 사이 계정이 익명화되면 회수 불능 채권이 된다.
 * 판정 축은 postpaid-attendance.util(비취소 일정·present·confirmed)과 같다. 후불 대상 필터만
 * 다르다 — 저쪽은 상품(product.billingTiming), 여기는 신청 스냅샷(enrollment.billingTiming).
 * 자녀 스코프는 enrollment where 조각으로 받는다 — { childId } 또는 { child: {...} }.
 */
export async function countUnbilledPostpaidAttendance(
  db: ChildEnrollmentGuardDb,
  childScope: Prisma.EnrollmentWhereInput,
): Promise<number> {
  const rows = await db.enrollment.findMany({
    where: {
      ...childScope,
      billingTiming: "POSTPAID",
      status: { in: ["approved", "paid"] },
    },
    select: { childId: true, classId: true },
  });
  if (rows.length === 0) return 0;
  const pairs = new Set(rows.map((r) => `${r.childId}|${r.classId}`));
  const childIds = [...new Set(rows.map((r) => r.childId))];
  const classIds = [...new Set(rows.map((r) => r.classId))];

  const attendances = await db.classAttendance.findMany({
    where: {
      memberId: { in: childIds },
      attendanceStatus: "present",
      schedule: { classId: { in: classIds }, isCancelled: false },
    },
    select: {
      memberId: true,
      schedule: { select: { classId: true, scheduledDate: true } },
    },
  });
  // scheduledDate 는 @db.Date(UTC 자정)라 ISO 앞 7자가 월 키 — 정산 yearMonth 와 같은 축.
  const tuples = new Set<string>();
  for (const a of attendances) {
    const { classId, scheduledDate } = a.schedule;
    if (!pairs.has(`${a.memberId}|${classId}`)) continue;
    tuples.add(
      `${a.memberId}|${classId}|${scheduledDate.toISOString().slice(0, 7)}`,
    );
  }
  if (tuples.size === 0) return 0;

  const yearMonths = [...new Set([...tuples].map((t) => t.split("|")[2]))];
  const confirmed = await db.monthlyPostpaidBilling.findMany({
    where: {
      classId: { in: classIds },
      yearMonth: { in: yearMonths },
      status: "confirmed",
    },
    select: { classId: true, yearMonth: true },
  });
  const confirmedSet = new Set(
    confirmed.map((b) => `${b.classId}|${b.yearMonth}`),
  );
  let count = 0;
  for (const t of tuples) {
    const [, classId, ym] = t.split("|");
    if (!confirmedSet.has(`${classId}|${ym}`)) count++;
  }
  return count;
}

export type WithdrawBlockerKey =
  | "team"
  | "class"
  | "tournamentActive"
  | "academy"
  | "postpaidUnpaid"
  | "tournamentUnsettled"
  | "refundInProgress"
  | "enrollmentActive"
  | "postpaidUnbilled"
  | "tournamentPostpaid";

export type WithdrawBlocker = {
  key: WithdrawBlockerKey;
  label: string;
  count: number;
};

/**
 * 탈퇴를 막는 사유를 구조화해 반환한다(빈 배열 = 차단 없음).
 *
 * - DIRECTOR/ACADEMY_DIRECTOR: 운영 팀·활성 수업·진행 대회·오픈클래스
 *   + 후불 수업 미납 라인·후불 대회 미정산·귀속 스코프의 처리 중 환불 요청
 * - PARENT: 자녀 수강 중(activeChildEnrollmentWhere) + 정산 전 후불 출석 + 후불 미납 라인
 *   ·본인 요청 처리 중 환불·후불 대회 참가
 * - 그 외 역할: 항상 빈 배열
 *
 * `today` 는 자녀 수강 자격의 기준일(KST 달력일의 UTC 자정) — 기본 실제 오늘. 테스트에서
 * 달 경계를 고정하기 위한 옵션이며 호출처는 생략한다.
 */
export async function findBlockingOwnershipDetailed(
  db: OwnershipCountDb,
  userId: string,
  userType: string,
  today: Date = kstTodayUtcMidnight(),
): Promise<WithdrawBlocker[]> {
  if (userType === "DIRECTOR" || userType === "ACADEMY_DIRECTOR") {
    const ownedClassScope: Prisma.ClassWhereInput[] = [
      { team: { coachId: userId } },
      { academy: { directorId: userId } },
    ];

    const [
      teamCount,
      classCount,
      tournamentCount,
      academyCount,
      unpaidLineCount,
      unsettledTournamentCount,
      ownedTeams,
      ownedAcademies,
    ] = await Promise.all([
      db.team.count({ where: { coachId: userId, isActive: true } }),
      db.class.count({
        where: { isActive: true, OR: ownedClassScope },
      }),
      db.tournament.count({
        where: {
          team: { coachId: userId },
          status: { in: ACTIVE_TOURNAMENT_STATUSES },
        },
      }),
      db.academy.count({ where: { directorId: userId, isActive: true } }),
      // 후불 수업 미납 — 수업 종료(isActive) 여부와 무관하게 pending 라인이 남아 있으면 차단
      db.monthlyPostpaidBillingLine.count({
        where: {
          paymentStatus: "pending",
          billing: { class: { OR: ownedClassScope } },
        },
      }),
      // 후불 대회 미정산 — 대회 status 와 무관(종료 후 청구가 정상 플로우)
      db.tournament.count({
        where: {
          team: { coachId: userId },
          billingMode: "POSTPAID",
          registrations: {
            some: {
              cancelledAt: null,
              paymentStatus: { in: UNSETTLED_TOURNAMENT_REG_STATUSES },
            },
          },
        },
      }),
      // 환불 요청 스코프 키(teamId/academyId 스냅샷) 대조용 — isActive 무관(종료 자산의 잔여 환불 포함)
      db.team.findMany({ where: { coachId: userId }, select: { id: true } }),
      db.academy.findMany({
        where: { directorId: userId },
        select: { id: true },
      }),
    ]);

    const refundScope: Prisma.RefundRequestWhereInput[] = [];
    if (ownedTeams.length > 0) {
      refundScope.push({ teamId: { in: ownedTeams.map((t) => t.id) } });
    }
    if (ownedAcademies.length > 0) {
      refundScope.push({ academyId: { in: ownedAcademies.map((a) => a.id) } });
    }
    const refundCount =
      refundScope.length > 0
        ? await db.refundRequest.count({
            where: {
              status: { in: REFUND_REQUEST_ACTIVE_STATUSES },
              OR: refundScope,
            },
          })
        : 0;

    const blockers: WithdrawBlocker[] = [];
    if (teamCount > 0) {
      blockers.push({
        key: "team",
        count: teamCount,
        label: `운영 중인 팀 ${teamCount}개`,
      });
    }
    if (classCount > 0) {
      blockers.push({
        key: "class",
        count: classCount,
        label: `활성 수업 ${classCount}개`,
      });
    }
    if (tournamentCount > 0) {
      blockers.push({
        key: "tournamentActive",
        count: tournamentCount,
        label: `진행 중인 대회 ${tournamentCount}개`,
      });
    }
    if (academyCount > 0) {
      blockers.push({
        key: "academy",
        count: academyCount,
        label: `운영 중인 오픈클래스 ${academyCount}개`,
      });
    }
    if (unpaidLineCount > 0) {
      blockers.push({
        key: "postpaidUnpaid",
        count: unpaidLineCount,
        label: `미납된 후불 정산 ${unpaidLineCount}건`,
      });
    }
    if (unsettledTournamentCount > 0) {
      blockers.push({
        key: "tournamentUnsettled",
        count: unsettledTournamentCount,
        label: `정산되지 않은 후불 대회 ${unsettledTournamentCount}개`,
      });
    }
    if (refundCount > 0) {
      blockers.push({
        key: "refundInProgress",
        count: refundCount,
        label: `처리 중인 환불 요청 ${refundCount}건`,
      });
    }
    return blockers;
  }

  if (userType === "PARENT") {
    const todayMonth = utcMonthStart(today);
    const childScope: Prisma.EnrollmentWhereInput = {
      child: { childParents: { some: { parentId: userId } } },
    };
    const [
      enrollmentCount,
      unbilledCount,
      unpaidLineCount,
      refundCount,
      postpaidTournamentCount,
    ] = await Promise.all([
      // 자녀 수강 중 — 상태 목록이 아니라 귀속월·결제방식 스냅샷에서 파생(activeChildEnrollmentWhere).
      db.enrollment.count({
        where: { ...childScope, ...activeChildEnrollmentWhere(todayMonth) },
      }),
      // 정산 확정 전 후불 출석 — 청구 라인이 아직 없어 아래 미납 축이 못 잡는 채권.
      countUnbilledPostpaidAttendance(db, childScope),
      // 후불 미납 — 청구 대상은 자녀 User.id 라 자녀 관계 경유(본인 직접 청구도 방어적으로 포함)
      db.monthlyPostpaidBillingLine.count({
        where: {
          paymentStatus: "pending",
          OR: [
            { userId },
            { user: { childParents: { some: { parentId: userId } } } },
          ],
        },
      }),
      db.refundRequest.count({
        where: {
          requesterId: userId,
          status: { in: REFUND_REQUEST_ACTIVE_STATUSES },
        },
      }),
      // 후불 대회 참가 — 종료 후 청구 예정(UNPAID)·청구 후 미납(PENDING) 모두 미래/현재 채무
      db.tournamentRegistration.count({
        where: {
          userId,
          cancelledAt: null,
          paymentStatus: { in: UNSETTLED_TOURNAMENT_REG_STATUSES },
          tournament: { billingMode: "POSTPAID" },
        },
      }),
    ]);

    const blockers: WithdrawBlocker[] = [];
    if (enrollmentCount > 0) {
      blockers.push({
        key: "enrollmentActive",
        count: enrollmentCount,
        label: `자녀의 이번 달·다음 달 수강 ${enrollmentCount}건`,
      });
    }
    if (unbilledCount > 0) {
      blockers.push({
        key: "postpaidUnbilled",
        count: unbilledCount,
        label: `정산 전 후불 출석 ${unbilledCount}건`,
      });
    }
    if (unpaidLineCount > 0) {
      blockers.push({
        key: "postpaidUnpaid",
        count: unpaidLineCount,
        label: `미납된 후불 정산 ${unpaidLineCount}건`,
      });
    }
    if (refundCount > 0) {
      blockers.push({
        key: "refundInProgress",
        count: refundCount,
        label: `처리 중인 환불 요청 ${refundCount}건`,
      });
    }
    if (postpaidTournamentCount > 0) {
      blockers.push({
        key: "tournamentPostpaid",
        count: postpaidTournamentCount,
        label: `정산 예정인 후불 대회 참가 ${postpaidTournamentCount}건`,
      });
    }
    return blockers;
  }

  return [];
}

/**
 * 탈퇴를 막는 사유 라벨 목록을 반환한다(빈 배열 = 차단 없음).
 * 메시지 문안 조립은 caller 책임(역할별 어미가 달라 라벨만 반환).
 */
export async function findBlockingOwnership(
  db: OwnershipCountDb,
  userId: string,
  userType: string,
  today: Date = kstTodayUtcMidnight(),
): Promise<string[]> {
  const blockers = await findBlockingOwnershipDetailed(
    db,
    userId,
    userType,
    today,
  );
  return blockers.map((b) => b.label);
}
