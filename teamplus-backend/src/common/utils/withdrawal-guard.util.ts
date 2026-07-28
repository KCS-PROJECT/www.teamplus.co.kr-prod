import { Prisma } from "@prisma/client";
import { REFUND_REQUEST_ACTIVE_STATUSES } from "@/payments/refund-requests/refund-request.constants";

/**
 * 탈퇴 차단 사유 카운트 유틸 — 운영 자산(팀·수업·대회·오픈클래스·자녀 수강신청)과
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

const ACTIVE_ENROLLMENT_STATUSES = ["pending", "pending_approval", "approved"];
const ACTIVE_TOURNAMENT_STATUSES = ["scheduled", "ongoing"];
/**
 * 후불 대회의 미정산 등록 상태 — UNPAID(종료 후 청구 전) · PENDING(청구 후 미납).
 * 선불 대회의 PENDING 은 "결제 이탈"이라 미수금이 아니므로(미수금=확정청구만 계약)
 * 반드시 tournament.billingMode = POSTPAID 필터와 함께 사용한다.
 */
const UNSETTLED_TOURNAMENT_REG_STATUSES = ["UNPAID", "PENDING"];

export type WithdrawBlockerKey =
  | "team"
  | "class"
  | "tournamentActive"
  | "academy"
  | "postpaidUnpaid"
  | "tournamentUnsettled"
  | "refundInProgress"
  | "enrollmentActive"
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
 * - PARENT: 자녀 진행 중 수강신청 + 후불 미납 라인·본인 요청 처리 중 환불·후불 대회 참가
 * - 그 외 역할: 항상 빈 배열
 */
export async function findBlockingOwnershipDetailed(
  db: OwnershipCountDb,
  userId: string,
  userType: string,
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
    const [
      enrollmentCount,
      unpaidLineCount,
      refundCount,
      postpaidTournamentCount,
    ] = await Promise.all([
      db.enrollment.count({
        where: {
          status: { in: ACTIVE_ENROLLMENT_STATUSES },
          child: { childParents: { some: { parentId: userId } } },
        },
      }),
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
        label: `자녀의 진행 중인 수강신청 ${enrollmentCount}건`,
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
): Promise<string[]> {
  const blockers = await findBlockingOwnershipDetailed(db, userId, userType);
  return blockers.map((b) => b.label);
}
