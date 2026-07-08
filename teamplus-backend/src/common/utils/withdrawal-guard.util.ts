import { Prisma } from "@prisma/client";

/**
 * 탈퇴 차단 자산(운영 팀·수업·대회·오픈클래스·자녀 수강신청) 카운트 유틸.
 *
 * requestWithdraw 신청 가드와 배치 탈퇴 확정 직전 재검증(유예 기간 중 재로그인으로 신규
 * 자산이 생겼을 수 있음)의 단일 SoT. NestJS provider 가 아닌 순수 함수라
 * user-anonymize.util 과 동일 계층에서 AuthModule/스케줄러 어느 쪽과도 결합되지 않는다.
 */

/** count 만 필요한 최소 DB 타입 — PrismaService / Prisma.TransactionClient 모두 대입 가능. */
export type OwnershipCountDb = {
  team: { count(args: { where: Prisma.TeamWhereInput }): Promise<number> };
  class: { count(args: { where: Prisma.ClassWhereInput }): Promise<number> };
  tournament: {
    count(args: { where: Prisma.TournamentWhereInput }): Promise<number>;
  };
  academy: {
    count(args: { where: Prisma.AcademyWhereInput }): Promise<number>;
  };
  enrollment: {
    count(args: { where: Prisma.EnrollmentWhereInput }): Promise<number>;
  };
};

const ACTIVE_ENROLLMENT_STATUSES = ["pending", "pending_approval", "approved"];
const ACTIVE_TOURNAMENT_STATUSES = ["scheduled", "ongoing"];

/**
 * 탈퇴를 막는 자산의 사유 라벨 목록을 반환한다(빈 배열 = 차단 없음).
 * 메시지 문안 조립은 caller 책임(역할별 어미가 달라 라벨만 반환).
 *
 * - DIRECTOR/ACADEMY_DIRECTOR: 운영 팀·활성 수업·진행 대회·오픈클래스 (최대 4개 라벨)
 * - PARENT: 자녀 진행 중 수강신청 (있으면 라벨 1개)
 * - 그 외 역할: 항상 빈 배열
 */
export async function findBlockingOwnership(
  db: OwnershipCountDb,
  userId: string,
  userType: string,
): Promise<string[]> {
  if (userType === "DIRECTOR" || userType === "ACADEMY_DIRECTOR") {
    const [teamCount, classCount, tournamentCount, academyCount] =
      await Promise.all([
        db.team.count({ where: { coachId: userId, isActive: true } }),
        db.class.count({
          where: {
            isActive: true,
            OR: [
              { team: { coachId: userId } },
              { academy: { directorId: userId } },
            ],
          },
        }),
        db.tournament.count({
          where: {
            team: { coachId: userId },
            status: { in: ACTIVE_TOURNAMENT_STATUSES },
          },
        }),
        db.academy.count({ where: { directorId: userId, isActive: true } }),
      ]);

    const blockers: string[] = [];
    if (teamCount > 0) blockers.push(`운영 중인 팀 ${teamCount}개`);
    if (classCount > 0) blockers.push(`활성 수업 ${classCount}개`);
    if (tournamentCount > 0)
      blockers.push(`진행 중인 대회 ${tournamentCount}개`);
    if (academyCount > 0)
      blockers.push(`운영 중인 오픈클래스 ${academyCount}개`);
    return blockers;
  }

  if (userType === "PARENT") {
    const activeChildEnroll = await db.enrollment.count({
      where: {
        status: { in: ACTIVE_ENROLLMENT_STATUSES },
        child: { childParents: { some: { parentId: userId } } },
      },
    });
    if (activeChildEnroll > 0) {
      return [`자녀의 진행 중인 수강신청 ${activeChildEnroll}건`];
    }
    return [];
  }

  return [];
}
