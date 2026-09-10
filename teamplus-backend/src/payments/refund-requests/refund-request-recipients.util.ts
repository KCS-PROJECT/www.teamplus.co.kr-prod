import { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/** 팀 관리 권한 역할 — 환불 요청 알림 수신 대상. */
const TEAM_MANAGER_ROLES = ["HEAD_COACH", "COACH", "MANAGER"];

export type RefundRequestScope = {
  id: string;
  teamId: string | null;
  academyId: string | null;
  sourceType?: string | null;
  paymentId?: string | null;
};

/**
 * 환불 요청 수신자 라우팅 — 팀=owner+관리멤버 / 아카데미=원장 / 픽업=주최자.
 *
 * 학부모 직접 요청 알림(RefundRequestService)과 고아 결제 자동 접수 알림(PaymentsService)이
 * 같은 수신자·같은 상세 링크를 쓰도록 단일 SoT로 둔다. 한쪽만 팀 관리자로 보내면
 * 오픈클래스(아카데미) 승인자가 접수 사실을 보지 못한다.
 */
export async function resolveRefundRequestRecipients(
  db: Db,
  rr: RefundRequestScope,
): Promise<{ userIds: string[]; linkUrl: string }> {
  if (rr.sourceType === "PICKUP_MATCH" && rr.paymentId) {
    const managerId = await resolvePickupMatchManagerId(db, rr.paymentId);
    return {
      userIds: managerId ? [managerId] : [],
      linkUrl: `/director-payments/refunds/${rr.id}`,
    };
  }
  if (rr.academyId) {
    const academy = await db.academy.findUnique({
      where: { id: rr.academyId },
      select: { directorId: true },
    });
    return {
      userIds: academy ? [academy.directorId] : [],
      linkUrl: `/academy/${rr.academyId}/refunds/${rr.id}`,
    };
  }
  if (rr.teamId) {
    const [team, managers] = await Promise.all([
      db.team.findUnique({
        where: { id: rr.teamId },
        select: { coachId: true },
      }),
      db.teamMember.findMany({
        where: {
          teamId: rr.teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: TEAM_MANAGER_ROLES },
        },
        select: { userId: true },
      }),
    ]);
    const ids = new Set<string>();
    if (team?.coachId) ids.add(team.coachId);
    for (const m of managers) ids.add(m.userId);
    return {
      userIds: Array.from(ids),
      linkUrl: `/director-payments/refunds/${rr.id}`,
    };
  }
  return { userIds: [], linkUrl: `/director-payments/refunds/${rr.id}` };
}

/** 픽업 매치 주최자 — 결제에 연결된 신청의 매치 주최자. 권한 재검증도 같은 판정을 쓴다. */
export async function resolvePickupMatchManagerId(
  db: Db,
  paymentId: string,
): Promise<string | null> {
  const applicant = await db.pickupMatchApplicant.findFirst({
    where: { paymentId },
    select: { match: { select: { managerId: true } } },
  });
  return applicant?.match?.managerId ?? null;
}
