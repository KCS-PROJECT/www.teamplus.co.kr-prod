import { PrismaService } from "@/prisma/prisma.service";

/**
 * "참여한 대회" 판정 — 학부모/학생 달력(일정) 노출 SoT.
 *
 * 정책: 감독의 참가 선수 명단(selectedParticipantIds) 선택은 훈련 목록·대시보드
 *   수업 목록에 대회를 노출하는 근거일 뿐이며, 일정(달력)에는 실제로 참여한
 *   대회만 표시한다.
 *   · 선불(PREPAID): 결제완료(PAID)만 참여. 무료 대회도 신청 시 즉시 PAID 처리
 *     되므로(tournaments.service registerForTournament) 별도 분기가 필요 없다.
 *   · 후불(POSTPAID): 신청 = 참여 확정 (CANCELLED/REFUNDED 제외). 금액은 대회
 *     종료 후 정산되므로 UNPAID/PENDING 도 참여로 본다.
 *   tournaments.service 의 enrolledChildIds(목록 "등록완료" 배지) 산출과 동일 기준.
 *
 * 사용처: calendar.service(fetchTournaments) · calendar-dashboard.service
 *   (fetchTournamentEvents). 두 달력의 노출 정책이 갈라지지 않도록 반드시
 *   이 함수를 경유한다.
 *
 * @param participantUserIds 자녀(또는 학생 본인) User.id 목록 — 등록 레코드의
 *   childId(학부모 신청) 또는 userId(학생 본인 신청) 와 매칭한다.
 * @param options.tournamentIds 판정 대상 대회 범위 (미지정 시 전체)
 */
export async function resolveParticipatingTournamentIds(
  prisma: PrismaService,
  participantUserIds: string[],
  options: { tournamentIds?: string[] } = {},
): Promise<Set<string>> {
  if (participantUserIds.length === 0) return new Set();
  if (options.tournamentIds && options.tournamentIds.length === 0) {
    return new Set();
  }

  const regs = await prisma.tournamentRegistration.findMany({
    where: {
      paymentStatus: { notIn: ["CANCELLED", "REFUNDED"] },
      OR: [
        { childId: { in: participantUserIds } },
        { userId: { in: participantUserIds } },
      ],
      ...(options.tournamentIds
        ? { tournamentId: { in: options.tournamentIds } }
        : {}),
    },
    select: { tournamentId: true, paymentStatus: true },
  });
  if (regs.length === 0) return new Set();

  const participating = new Set(
    regs.filter((r) => r.paymentStatus === "PAID").map((r) => r.tournamentId),
  );
  // 미결제(UNPAID/PENDING) 등록은 후불 대회만 참여로 인정 — 선불 결제대기는 제외.
  const unpaidIds = Array.from(
    new Set(
      regs
        .filter((r) => r.paymentStatus !== "PAID")
        .map((r) => r.tournamentId),
    ),
  ).filter((id) => !participating.has(id));
  if (unpaidIds.length > 0) {
    const postpaid = await prisma.tournament.findMany({
      where: { id: { in: unpaidIds }, billingMode: "POSTPAID" },
      select: { id: true },
    });
    for (const t of postpaid) participating.add(t.id);
  }
  return participating;
}
