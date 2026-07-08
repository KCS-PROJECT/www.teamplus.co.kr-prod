import { Prisma } from "@prisma/client";
import { dateOnlyToUtc } from "@/common/utils/kst-date.util";

/**
 * 회원 비식별화 공용 유틸 — 배치 탈퇴 / 학부모의 자녀 삭제 등 모든 익명화 경로의 단일 SoT.
 *
 * 순수 함수 모듈(NestJS provider 아님)이라 AuthModule ↔ ChildrenModule 어느 쪽과도 결합되지
 * 않는다. 파일 실삭제·Redis 삭제·Apple revoke·AuditLog 기록은 경로별 값/부수효과가 달라
 * caller 책임으로 남긴다(여기서는 삭제할 파일 URL 만 반환).
 */

/**
 * 비식별화된 User.update data 객체.
 *
 * email = `withdrawn_<userId>` — 이메일 형식일 필요 없음(String @unique 제약뿐, cuid 라 유일).
 * phone = `withdrawn_<userId 앞 8자>` — String? @unique 충돌 방지(기존 배치 규칙 유지).
 * withdrawRequestedAt 은 경로별 의미가 달라(배치=요청 시각 보존 / 신규 익명화=now) 여기서 세팅하지 않는다.
 */
export function buildAnonymizedUserData(
  userId: string,
  opts: { reason: string; now: Date },
): Prisma.UserUpdateInput {
  return {
    firstName: "탈퇴회원",
    lastName: "",
    email: `withdrawn_${userId}`,
    phone: `withdrawn_${userId.substring(0, 8)}`,
    passwordHash: "WITHDRAWN",
    status: "WITHDRAWN",
    withdrawProcessedAt: opts.now,
    withdrawReason: opts.reason,
    ci: null,
    di: null,
    ciHash: null,
    isVerified: false,
    verifiedAt: null,
    birthDate: null,
    koreanAge: null,
    gender: null,
    note: null,
    zipCode: null,
    address: null,
    addressDetail: null,
    avatarUrl: null,
  };
}

/**
 * ChildProfile 비식별화 data 객체.
 * birthDate 는 @db.Date NOT NULL 이라 null 대입 불가 → 센티넬(1970-01-01, UTC 자정 규약).
 */
export function buildAnonymizedChildProfileData(): Prisma.ChildProfileUpdateInput {
  return {
    imageUrl: null,
    birthDate: dateOnlyToUtc("1970-01-01"),
    currentLevel: 1,
    levelLabel: "입문",
    progressPercent: 0,
    nextTestDate: null,
    lastEvaluatedAt: null,
  };
}

/**
 * 탈퇴 확정 시 잔여 크레딧(수업권) 전액 소멸.
 *
 * 유의사항·약관 고지("탈퇴 확정 시 전액 소멸")와 일치시키는 경로로, 일반 만료
 * (CreditDomainService.expireRemaining)와 달리 **이월(carry-over)을 적용하지 않는다** —
 * 소멸 후 사용할 계정이 없으므로 이월 크레딧 생성은 무의미하고 고지와도 어긋난다.
 * CreditTransaction(expired)은 법정 보존 대상 기록이라 남긴다.
 */
export async function expireRemainingCreditsWithinTx(
  tx: Prisma.TransactionClient,
  userId: string,
  reason: string,
): Promise<{ expiredCredits: number; expiredSessions: number }> {
  const credits = await tx.memberCredit.findMany({
    where: { userId },
    select: { id: true, totalSessions: true, usedSessions: true },
  });

  let expiredCredits = 0;
  let expiredSessions = 0;
  for (const credit of credits) {
    const remaining = credit.totalSessions - credit.usedSessions;
    if (remaining <= 0) continue;

    // DB CHECK 제약 정합 (usedSessions <= totalSessions) — 소진 처리
    await tx.memberCredit.update({
      where: { id: credit.id },
      data: { usedSessions: credit.totalSessions },
    });
    await tx.creditTransaction.create({
      data: {
        memberCreditId: credit.id,
        type: "expired",
        amount: remaining,
        balanceAfter: 0,
        reason,
      },
    });
    expiredCredits += 1;
    expiredSessions += remaining;
  }

  return { expiredCredits, expiredSessions };
}

/**
 * 트랜잭션 내부에서 한 User(및 존재 시 ChildProfile)를 비식별화한다.
 * caller 의 트랜잭션에 참여(자체 tx 를 열지 않음)하며, 커밋 후 실삭제할 파일 URL 목록을 반환한다.
 *
 * @returns fileUrls — User.avatarUrl + ChildProfile.imageUrl 중 존재하는 것만(tx 밖에서 실삭제)
 */
export async function anonymizeUserWithinTx(
  tx: Prisma.TransactionClient,
  userId: string,
  opts: { reason: string; now: Date; withdrawRequestedAt?: Date },
): Promise<{ fileUrls: string[] }> {
  const fileUrls: string[] = [];

  // 실삭제 대상 파일 URL 을 갱신 전에 수집(update 이후엔 null 로 사라짐)
  const userRow = await tx.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (userRow?.avatarUrl) fileUrls.push(userRow.avatarUrl);

  const childRow = await tx.childProfile.findUnique({
    where: { userId },
    select: { imageUrl: true },
  });
  if (childRow?.imageUrl) fileUrls.push(childRow.imageUrl);

  await tx.user.update({
    where: { id: userId },
    data: {
      ...buildAnonymizedUserData(userId, { reason: opts.reason, now: opts.now }),
      withdrawRequestedAt: opts.withdrawRequestedAt,
    },
  });

  await tx.socialAccount.deleteMany({ where: { userId } });
  await tx.userNotificationPreference.deleteMany({ where: { userId } });
  await tx.userDevice.deleteMany({ where: { userId } });

  // 본인인증 기록의 실명·전화·생년월일·CI/DI 파기. onDelete: SetNull 이라 User update
  // 만으로는 정리되지 않아 userId 링크로 완전 재식별이 가능했다.
  await tx.identityVerification.updateMany({
    where: { userId },
    data: {
      ci: null,
      ciHash: null,
      di: null,
      verifiedName: null,
      verifiedPhone: null,
      verifiedBirth: null,
      verifiedGender: null,
      clientIp: null,
      userAgent: null,
    },
  });

  // 유령 팀 멤버 방지 — 활성 멤버십 종료
  await tx.teamMember.updateMany({
    where: { userId, leftAt: null },
    data: { leftAt: opts.now },
  });

  if (childRow) {
    // ChildProfile 은 삭제가 아닌 update 로 익명화하므로 Cascade 가 발동하지 않는다.
    // pinHash·lastSetBy(부모 링크)가 남지 않도록 PIN 을 직접 제거.
    await tx.childPin.deleteMany({ where: { childProfile: { userId } } });
    await tx.childProfile.updateMany({
      where: { userId },
      data: buildAnonymizedChildProfileData(),
    });
  }

  return { fileUrls };
}
