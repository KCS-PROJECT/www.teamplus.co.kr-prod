import { PrismaService } from "@/prisma/prisma.service";
import {
  isNoticeSystemRole,
  resolveNoticeManageTeamIds,
} from "@/notices/utils/notice-manage-scope.util";

/**
 * 단위 공지 스트림(수업/대회) **관리(쓰기)** 스코프 SoT.
 *
 * 사용자 기반으로 관할 팀·수업·대회 ID 집합을 해석한다 — 팀 ID 기반이면
 * 팀이 없는 오픈클래스 감독(ACADEMY_DIRECTOR)을 담을 수 없다.
 *
 * 포함 기준 (설계 SoT: claudedocs/unit-notice-stream-design-2026-08-19.md §5):
 *   · 팀 축   = resolveNoticeManageTeamIds (팀 소유 ∪ approved HEAD_COACH/COACH/MANAGER)
 *   · 수업 축 = 관할 팀의 수업 ∪ ClassCoachAssignment(status=ACCEPTED) 담당 수업
 *               ∪ 오픈클래스(Academy.directorId=본인 ∪ AcademyCoach(isActive))의 수업
 *   · 대회 축 = 주최 팀(teamId)이 관할 팀인 대회
 *
 * ⚠️ resolveManagedTeamIds(team-scope.util)는 사용 금지 — 미승인 코치·PLAYER 멤버까지
 *    포함되어 쓰기 권한이 과대해진다 (v1.2 Codex 감사).
 */
export interface ManagedContentScope {
  teamIds: string[];
  classIds: string[];
  tournamentIds: string[];
}

export async function resolveManagedContentScope(
  prisma: PrismaService,
  userId: string,
  userType?: string | null,
): Promise<ManagedContentScope> {
  const manageTeamIds = await resolveNoticeManageTeamIds(
    prisma,
    userId,
    userType,
  );

  const [assignedClasses, ownedAcademies, coachAcademies] = await Promise.all([
    prisma.classCoachAssignment.findMany({
      where: { coachUserId: userId, status: "ACCEPTED" },
      select: { classId: true },
    }),
    prisma.academy.findMany({
      where: { directorId: userId, isActive: true },
      select: { id: true },
    }),
    prisma.academyCoach.findMany({
      where: { userId, isActive: true },
      select: { academyId: true },
    }),
  ]);

  const academyIds = Array.from(
    new Set([
      ...ownedAcademies.map((a) => a.id),
      ...coachAcademies.map((c) => c.academyId),
    ]),
  );

  const classWhereOr: object[] = [];
  if (manageTeamIds.length > 0) {
    classWhereOr.push({ teamId: { in: manageTeamIds } });
  }
  if (academyIds.length > 0) {
    classWhereOr.push({ academyId: { in: academyIds } });
  }
  if (assignedClasses.length > 0) {
    classWhereOr.push({ id: { in: assignedClasses.map((a) => a.classId) } });
  }

  const [classes, tournaments] = await Promise.all([
    classWhereOr.length > 0
      ? prisma.class.findMany({
          where: { OR: classWhereOr },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    manageTeamIds.length > 0
      ? prisma.tournament.findMany({
          where: { teamId: { in: manageTeamIds } },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
  ]);

  return {
    teamIds: manageTeamIds,
    classIds: classes.map((c) => c.id),
    tournamentIds: tournaments.map((t) => t.id),
  };
}

export { isNoticeSystemRole };
