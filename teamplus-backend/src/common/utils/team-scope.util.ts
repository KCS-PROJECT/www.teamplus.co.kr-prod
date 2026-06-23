import { PrismaService } from "@/prisma/prisma.service";

/**
 * 사용자가 "관리/소속" 하는 팀 ID 집합 — 팀 가시성 판정 SoT.
 *
 * [2026-05-20] classes.service / tournaments.service 의 팀 판정 기준이 서로 달라
 *   (전자: Team.coachId · 후자: TeamMember.roleInTeam) 같은 감독이 한쪽에만
 *   노출되던 불일치를 단일 함수로 통일.
 *
 * 포함 기준 (합집합):
 *   1. TeamMember (approvalStatus='approved', leftAt=null) — roleInTeam 무관
 *      · 감독은 가입 시 HEAD_COACH 로 등록되므로 여기 포함됨
 *   2. CoachProfile.teamId — 코치 프로필에 매핑된 팀
 *   3. Team.coachId = 본인 — 팀 소유(생성)자
 *
 * ⚠️ PARENT 자녀 경유 팀은 포함하지 않음 (호출 측에서 별도 처리).
 */
export async function resolveManagedTeamIds(
  prisma: PrismaService,
  userId: string,
): Promise<string[]> {
  const teamIdSet = new Set<string>();

  const [memberships, profiles, ownedTeams] = await Promise.all([
    prisma.teamMember.findMany({
      where: { userId, approvalStatus: "approved", leftAt: null },
      select: { teamId: true },
    }),
    prisma.coachProfile.findMany({
      where: { userId },
      select: { teamId: true },
    }),
    prisma.team.findMany({
      where: { coachId: userId },
      select: { id: true },
    }),
  ]);

  for (const m of memberships) if (m.teamId) teamIdSet.add(m.teamId);
  for (const p of profiles) if (p.teamId) teamIdSet.add(p.teamId);
  for (const t of ownedTeams) teamIdSet.add(t.id);

  return Array.from(teamIdSet);
}

/**
 * 부모의 자녀 childId 목록을 스코프에 맞게 해석 — IDOR 검증 단일 진입점.
 *
 *  - childId 지정 시: 본인 자녀인지 ParentChild 로 검증 후 [childId] 반환.
 *      검증 실패(타 자녀) 시 빈 배열 — 403 대신 빈 결과로 데이터 유출 차단.
 *  - childId 미지정 시: 모든 자녀 childId 반환 (하위호환 폴백).
 */
async function resolveScopedChildIds(
  prisma: PrismaService,
  parentId: string,
  childId?: string,
): Promise<string[]> {
  if (childId) {
    const owned = await prisma.parentChild.findFirst({
      where: { parentId, childId },
      select: { childId: true },
    });
    return owned ? [childId] : [];
  }
  const all = await prisma.parentChild.findMany({
    where: { parentId },
    select: { childId: true },
  });
  return all.map((c) => c.childId);
}

/**
 * 캘린더/대시보드 enrollment 격리용 — 부모의 자녀 userId 목록.
 *   childId 지정 시 그 자녀만(IDOR 검증), 미지정 시 모든 자녀.
 */
export async function resolveScopedChildUserIds(
  prisma: PrismaService,
  parentId: string,
  childId?: string,
): Promise<string[]> {
  return resolveScopedChildIds(prisma, parentId, childId);
}

/**
 * 사용자가 "볼 수 있는" 팀 ID 집합 — 팀 공지 등 열람 범위 판정용.
 *
 * resolveManagedTeamIds(관리/소속 팀) + PARENT 자녀 경유 팀.
 *   · 감독/코치/학생 — 본인 TeamMember/CoachProfile/소유 팀
 *   · 학부모 — 위 + 자녀(ParentChild)의 TeamMember 팀
 *
 * opts.childId 지정 시(학부모 자녀 선택 스코프):
 *   · 관리 팀(resolveManagedTeamIds)은 합치지 않고 선택 자녀의 팀만 반환.
 *   · childId 미지정(기존 호출) 시 동작 100% 동일.
 */
export async function resolveViewerTeamIds(
  prisma: PrismaService,
  userId: string,
  userType?: string | null,
  opts?: { childId?: string },
): Promise<string[]> {
  // childId 스코프는 PARENT 전용 — 비-PARENT 토큰은 childId 무시(관리 팀 정상 해석).
  const scopedToChild = userType === "PARENT" && !!opts?.childId;
  const teamIdSet = new Set<string>(
    scopedToChild ? [] : await resolveManagedTeamIds(prisma, userId),
  );

  if (userType === "PARENT") {
    const childIds = await resolveScopedChildIds(prisma, userId, opts?.childId);
    if (childIds.length > 0) {
      const childMemberships = await prisma.teamMember.findMany({
        where: {
          userId: { in: childIds },
          approvalStatus: "approved",
          leftAt: null,
        },
        select: { teamId: true },
      });
      for (const m of childMemberships) {
        if (m.teamId) teamIdSet.add(m.teamId);
      }
    }
  }

  return Array.from(teamIdSet);
}
