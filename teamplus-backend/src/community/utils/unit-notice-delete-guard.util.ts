import { Prisma, PrismaClient } from "@prisma/client";

/**
 * [Codex R1 H-04] 단위 공지 FK(RESTRICT) 삭제 가드 — classes/tournaments 삭제 공용.
 *
 * TeamPost.targetClassId/targetTournamentId 가 `onDelete: Restrict` 라서 공지 행이
 * 하나라도 남아 있으면 수업/대회 하드 삭제가 비제어 Prisma FK 오류(500)로 실패한다.
 * 기존 삭제 가드처럼 **제어된 판정**으로 바꾼다:
 *   · 게시 중(isActive=true) 공지 존재 → 차단 카운트로 집계 (호출부가 Conflict 안내)
 *   · soft 삭제된(isActive=false) 공지만 남음 → 삭제 트랜잭션에서 정리
 *     (삭제되는 단위의 비활성 공지 잔재는 보존 가치가 없고, 남기면 삭제가 영구 불가)
 */
type UnitRef = { classId: string } | { tournamentId: string };

function toWhere(ref: UnitRef): Prisma.TeamPostWhereInput {
  return "classId" in ref
    ? { targetClassId: ref.classId }
    : { targetTournamentId: ref.tournamentId };
}

/** 게시 중(active) 단위 공지 수 — 1 이상이면 삭제 차단 대상 */
export async function countActiveUnitNotices(
  prisma: Pick<PrismaClient, "teamPost">,
  ref: UnitRef,
): Promise<number> {
  return prisma.teamPost.count({
    where: { ...toWhere(ref), isActive: true },
  });
}

/**
 * 단위 삭제 트랜잭션 내 공지 잔재 정리 — **inactive(soft 삭제)만** 제거.
 *
 * [Codex R2 H-04] active 무관 전량 삭제는 "가드 count → 삭제 tx" 사이에 생성된
 * **새 active 공지를 통째로 파기**하는 경쟁 조건이었다. inactive 한정으로 축소하고,
 * 레이스로 남은 active 공지는 FK RESTRICT 가 대상 delete 를 실패시키게 둔다 —
 * 호출부가 그 Prisma P2003 을 제어된 Conflict 로 변환한다(공지 보존).
 * (Cascade 로 inactive 공지의 comments/reads/likes/attachments 도 함께 정리)
 */
export async function cleanupUnitNoticesForDelete(
  tx: Pick<PrismaClient, "teamPost">,
  ref: UnitRef,
): Promise<void> {
  await tx.teamPost.deleteMany({
    where: { ...toWhere(ref), isActive: false },
  });
}

/**
 * FK RESTRICT 로 인한 삭제 실패(P2003)인지 판정 — 호출부의 제어된 Conflict 변환용.
 * (레이스로 count 이후 생성된 active 공지가 대상 delete 를 막은 경우)
 */
export function isForeignKeyRestrictError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2003"
  );
}
