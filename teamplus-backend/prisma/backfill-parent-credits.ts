/**
 * 2026-04-27 임시 보강 스크립트.
 * 모든 PARENT user 의 자녀가 ClassRegistration(active) 한 모든 수업에 대해
 * 누락된 MemberCredit 을 발급하여 mock 데이터의 "수업권 부족" 차단을 회피한다.
 *
 * 멱등: 이미 활성 수업권이 있는 (userId, classId) 조합은 스킵.
 * 후속: 향후 mock-seed.ts 가 모든 클래스에 발급하도록 정정되어, DB reset 후
 *      재시드 시점부터는 본 스크립트 불요.
 * 실행: npx tsx prisma/backfill-parent-credits.ts
 */
import { PrismaClient } from "@prisma/client";

const PER_CLASS_SESSIONS = 8; // 자녀별·수업별 발급 회차 (mock 일관)
const EXPIRES_DAYS = 90;

const prisma = new PrismaClient();

(async () => {
  // 모든 PARENT user 대상
  const parents = await prisma.user.findMany({
    where: { userType: "PARENT" },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`👤 PARENT user ${parents.length}명`);

  if (parents.length === 0) {
    console.log("PARENT 없음 — 종료");
    process.exit(0);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + EXPIRES_DAYS);

  let totalCreated = 0;
  let totalSkipped = 0;
  let parentsProcessed = 0;

  for (const parent of parents) {
    const links = await prisma.parentChild.findMany({
      where: { parentId: parent.id },
      select: { childId: true },
    });
    const childUserIds = links.map((l) => l.childId);
    if (childUserIds.length === 0) continue;

    let parentCreated = 0;
    let parentSkipped = 0;

    for (const childId of childUserIds) {
      const regs = await prisma.classRegistration.findMany({
        where: { userId: childId, status: "active" },
        select: { classId: true, class: { select: { className: true } } },
      });

      for (const r of regs) {
        const existing = await prisma.memberCredit.findFirst({
          where: {
            userId: childId,
            classId: r.classId,
            expiresAt: { gte: new Date() },
          },
          select: { id: true },
        });
        if (existing) {
          parentSkipped++;
          continue;
        }

        const credit = await prisma.memberCredit.create({
          data: {
            userId: childId,
            classId: r.classId,
            totalSessions: PER_CLASS_SESSIONS,
            usedSessions: 0,
            expiresAt,
          },
        });
        await prisma.creditTransaction.create({
          data: {
            memberCreditId: credit.id,
            type: "earned",
            amount: PER_CLASS_SESSIONS,
            balanceAfter: PER_CLASS_SESSIONS,
            reason: "테스트 보강 - 학부모 자녀 누락 수업권 발급",
          },
        });
        parentCreated++;
      }
    }

    if (parentCreated > 0 || parentSkipped > 0) {
      parentsProcessed++;
      console.log(
        `  ${parent.email.padEnd(35)} 자녀 ${childUserIds.length}명 · 발급 ${parentCreated}건 · 스킵 ${parentSkipped}건`,
      );
    }
    totalCreated += parentCreated;
    totalSkipped += parentSkipped;
  }

  console.log(
    `\n✅ 완료: ${parentsProcessed}/${parents.length} PARENT 처리 · 총 발급 ${totalCreated}건 · 스킵 ${totalSkipped}건`,
  );
  await prisma.$disconnect();
})();
