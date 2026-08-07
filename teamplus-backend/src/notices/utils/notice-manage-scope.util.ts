import { PrismaService } from "@/prisma/prisma.service";

/**
 * 공지 **관리(쓰기)** 권한 SoT — 생성·수정·삭제·고정·게시·관리 목록이 공유한다.
 *
 * 열람 SoT(`resolveViewerTeamIds`)와 의도적으로 분리한다.
 *   · 열람: 소속만 있으면 됨 (선수·학부모 포함)
 *   · 관리: 팀 소유자이거나 승인된 관리 역할이어야 함
 *
 * `resolveManagedTeamIds`(team-scope.util)를 재사용하지 않는 이유:
 *   1. `CoachProfile.teamId` 를 승인 여부와 무관하게 포함 → 미승인(pending) 코치가 관리자로 취급됨
 *   2. approved TeamMember 의 `roleInTeam` 을 보지 않음 → PLAYER 로 가입한 계정까지 포함됨
 *   3. classes·tournaments 가 **열람 판정**에 쓰고 있어 시맨틱을 바꾸면 광범위 회귀
 */

/** 팀 공지를 관리할 수 있는 팀 내 역할. */
export const NOTICE_MANAGE_ROLES = ["HEAD_COACH", "COACH", "MANAGER"] as const;

/** 전체 공지(targetTeamId=null)를 관리할 수 있는 시스템 역할. */
export const NOTICE_SYSTEM_ROLES = ["ADMIN", "SYSTEM", "OPER"] as const;

export function isNoticeSystemRole(userType?: string | null): boolean {
  return (
    !!userType && (NOTICE_SYSTEM_ROLES as readonly string[]).includes(userType)
  );
}

/** 팀 공지 관리 대상 역할 — ACADEMY_DIRECTOR 는 팀 도메인 권한이 없어 제외한다. */
export function isNoticeTeamScopedRole(userType?: string | null): boolean {
  return userType === "DIRECTOR" || userType === "COACH";
}

/**
 * `targetTeamId` 정규화 — `null` · 빈 문자열 · 공백 문자열을 모두 "전역(null) 요청"으로 통일.
 *
 * 정규화하지 않으면 `""` 가 그대로 저장되어 서비스 공지(`null`)에도 팀 공지(`in [...]`)에도
 * 잡히지 않는 **고아 공지**(작성자·시스템 역할 외 전원 404)가 만들어진다.
 * `targetTeamId` 에는 FK 가 없어 임의 문자열이 그대로 기록된다.
 */
export function normalizeTargetTeamId(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 사용자가 **공지를 관리할 수 있는** 팀 ID 집합.
 *
 * 포함 기준 (합집합, 둘 다 **활성 팀만**):
 *   1. `Team.coachId = 본인` 이고 `Team.isActive` — 팀 소유(생성)자
 *   2. `TeamMember(approved · leftAt=null · roleInTeam ∈ NOTICE_MANAGE_ROLES)` 이고 소속 팀이 활성
 *
 * `CoachProfile` 은 권한 근거에서 제외한다(위 1번 사유).
 */
export async function resolveNoticeManageTeamIds(
  prisma: PrismaService,
  userId: string,
  userType?: string | null,
): Promise<string[]> {
  // 오픈클래스 감독은 Team 을 갖지 않는다(가입 시 Academy 만 생성) — 조회 없이 차단.
  if (userType === "ACADEMY_DIRECTOR") return [];

  const [ownedTeams, memberships] = await Promise.all([
    prisma.team.findMany({
      where: { coachId: userId, isActive: true },
      select: { id: true },
    }),
    prisma.teamMember.findMany({
      where: {
        userId,
        approvalStatus: "approved",
        leftAt: null,
        roleInTeam: { in: [...NOTICE_MANAGE_ROLES] },
        team: { isActive: true },
      },
      select: { teamId: true },
    }),
  ]);

  const teamIdSet = new Set<string>();
  for (const t of ownedTeams) teamIdSet.add(t.id);
  for (const m of memberships) if (m.teamId) teamIdSet.add(m.teamId);

  return Array.from(teamIdSet);
}
