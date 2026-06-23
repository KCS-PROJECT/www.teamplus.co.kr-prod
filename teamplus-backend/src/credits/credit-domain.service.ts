import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

/**
 * CreditDomainService — MemberCredit 수정 단일 진입점
 *
 * ATTENDANCE_CREDIT_REFORM.md v0.5 §4 P2-1 구현.
 *
 * 모든 MemberCredit / CreditTransaction 의 INSERT/UPDATE 는 본 서비스를 경유.
 * 이로써 17~23 진입점에 분산되어 있던 동시성 가드 / 거래 이력 / 정합성 보장을
 * 단일 책임으로 통합한다.
 *
 * 공통 규약:
 *   - 모든 public 메서드는 `tx: Prisma.TransactionClient` 를 받아 호출자
 *     트랜잭션에 합류 (자체 트랜잭션 시작 안 함).
 *   - `updateMany + where 가드` 패턴으로 race condition 차단.
 *   - DB CHECK 제약 `chk_used_sessions_range` (M-1) 와 정합.
 *   - `CreditTransaction` 자동 INSERT — 호출자는 거래 이력 신경 안 써도 됨.
 *   - 차감 실패(잔량 0/만료) 시 한국어 메시지 throw — "이번 달 결제가 필요합니다."
 *
 * PR-C 에서 AttendanceAuditLog 도입 시 본 서비스에 audit 호출 추가 예정.
 */
@Injectable()
export class CreditDomainService {
  private readonly logger = new Logger(CreditDomainService.name);

  /**
   * 이월 적용 정책 — `credits.service.ts` 의 기존 상수 유지.
   * 팀 정규 훈련까지 확대 시 사업주 결정 후 true 로 변경.
   */
  private readonly CARRY_OVER_ENABLED_FOR_TEAM_REGULAR = false;

  /**
   * 1. 출석 1회 차감 — FIFO(만료 임박 우선) + 이월 신규 수업권 자동 사용
   *
   * 동작:
   *   - 만료 안 된 (userId, classId) 수업권 중 expiresAt 임박 순 1건 선택
   *   - `updateMany + where 가드` 로 동시성 race 차단
   *   - 잔량 0 또는 만료뿐이면 BadRequestException throw
   *   - 성공 시 CreditTransaction(type='deducted') 자동 INSERT
   *
   * @throws BadRequestException — 잔량 없음 / 모두 만료 / race
   */
  async deductOne(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      classId: string;
      scheduleId: string;
      reason: string;
      adjustedBy?: string;
      deductedVia?:
        | "qr_scan"
        | "parent_button"
        | "self_button"
        | "coach_manual";
    },
  ): Promise<{ memberCreditId: string; balanceAfter: number }> {
    const now = new Date();

    // [Phase B-2] 모드 B(무차감 기간제) 우선 — 유효한 MONTHLY_FIXED 수업권이 있으면
    //   기간 게이트로 처리한다: 유효 크레딧 존재 = 통과, 회차를 차감하지 않는다.
    //   레거시 PER_SESSION 회수권(및 관리자 발급)은 아래에서 현행대로 1회 차감(D-3 보존).
    const periodCredit = await tx.memberCredit.findFirst({
      where: {
        userId: params.userId,
        classId: params.classId,
        expiresAt: { gte: now },
        payment: { product: { feeType: "MONTHLY_FIXED" } },
      },
      orderBy: { expiresAt: "desc" },
      select: { id: true, totalSessions: true, usedSessions: true },
    });
    if (periodCredit) {
      return {
        memberCreditId: periodCredit.id,
        balanceAfter: periodCredit.totalSessions - periodCredit.usedSessions,
      };
    }

    const candidate = await tx.memberCredit.findFirst({
      where: {
        userId: params.userId,
        classId: params.classId,
        expiresAt: { gte: now },
      },
      orderBy: { expiresAt: "asc" },
      select: { id: true, totalSessions: true, usedSessions: true },
    });

    if (!candidate || candidate.usedSessions >= candidate.totalSessions) {
      throw new BadRequestException("해당 학생은 이번 달 결제가 필요합니다.");
    }

    const result = await tx.memberCredit.updateMany({
      where: {
        id: candidate.id,
        usedSessions: { lt: candidate.totalSessions },
        expiresAt: { gte: now },
      },
      data: { usedSessions: { increment: 1 } },
    });

    if (result.count === 0) {
      throw new BadRequestException(
        "수업권이 방금 소진되었습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    const updated = await tx.memberCredit.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { totalSessions: true, usedSessions: true },
    });
    const balanceAfter = updated.totalSessions - updated.usedSessions;

    await tx.creditTransaction.create({
      data: {
        memberCreditId: candidate.id,
        type: "deducted",
        amount: 1,
        balanceAfter,
        scheduleId: params.scheduleId,
        reason: params.reason,
        adjustedBy: params.adjustedBy ?? null,
      },
    });

    // PR-C TODO: AttendanceAuditLog INSERT (actorRole/IP/UA 추가 정보 필요)

    return { memberCreditId: candidate.id, balanceAfter };
  }

  /**
   * 1-b. 특정 MemberCredit 에서 N회 차감 — `CreditsService.useCredit` 외부 API 호환용
   *
   * 동작:
   *   - 명시된 memberCreditId 에서 amount 만큼 차감 (FIFO 적용 안 함 — 호출자 지정)
   *   - `updateMany + where 가드` 로 race 차단
   *   - CreditTransaction(type='deducted') 자동 INSERT
   */
  async deductByCreditId(
    tx: Prisma.TransactionClient,
    params: {
      memberCreditId: string;
      amount: number;
      scheduleId?: string;
      reason: string;
    },
  ): Promise<{ balanceAfter: number }> {
    if (params.amount <= 0) {
      throw new BadRequestException("차감 회차는 1 이상이어야 합니다.");
    }

    const current = await tx.memberCredit.findUnique({
      where: { id: params.memberCreditId },
      select: { totalSessions: true, usedSessions: true, expiresAt: true },
    });
    if (!current) {
      throw new NotFoundException("크레딧을 찾을 수 없습니다.");
    }
    if (current.expiresAt < new Date()) {
      throw new BadRequestException("만료된 크레딧입니다.");
    }
    if (current.totalSessions - current.usedSessions < params.amount) {
      throw new BadRequestException("해당 학생은 이번 달 결제가 필요합니다.");
    }

    const result = await tx.memberCredit.updateMany({
      where: {
        id: params.memberCreditId,
        usedSessions: { lte: current.totalSessions - params.amount },
        expiresAt: { gte: new Date() },
      },
      data: { usedSessions: { increment: params.amount } },
    });
    if (result.count === 0) {
      throw new BadRequestException(
        "수업권이 방금 소진되었습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    const updated = await tx.memberCredit.findUniqueOrThrow({
      where: { id: params.memberCreditId },
      select: { totalSessions: true, usedSessions: true },
    });
    const balanceAfter = updated.totalSessions - updated.usedSessions;

    await tx.creditTransaction.create({
      data: {
        memberCreditId: params.memberCreditId,
        type: "deducted",
        amount: params.amount,
        balanceAfter,
        scheduleId: params.scheduleId ?? null,
        reason: params.reason,
      },
    });

    return { balanceAfter };
  }

  /**
   * 2. 출석 취소/수정 1회 복원
   *
   * 동작:
   *   - usedSessions > 0 인 (userId, classId) 수업권 중 만료 임박 순 1건 선택
   *   - `updateMany + usedSessions > 0` 가드
   *   - 복원 대상 없으면 null 반환 (silent — 데이터 불일치는 호출자가 판단)
   *   - 성공 시 CreditTransaction(type='restored') 자동 INSERT
   */
  async restoreOne(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      classId: string;
      scheduleId: string;
      reason: string;
      adjustedBy?: string;
    },
  ): Promise<{ memberCreditId: string; balanceAfter: number } | null> {
    const candidate = await tx.memberCredit.findFirst({
      where: {
        userId: params.userId,
        classId: params.classId,
        usedSessions: { gt: 0 },
      },
      orderBy: { expiresAt: "asc" },
      select: { id: true },
    });

    if (!candidate) {
      return null;
    }

    const result = await tx.memberCredit.updateMany({
      where: { id: candidate.id, usedSessions: { gt: 0 } },
      data: { usedSessions: { decrement: 1 } },
    });

    if (result.count === 0) {
      return null;
    }

    const updated = await tx.memberCredit.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { totalSessions: true, usedSessions: true },
    });
    const balanceAfter = updated.totalSessions - updated.usedSessions;

    await tx.creditTransaction.create({
      data: {
        memberCreditId: candidate.id,
        type: "restored",
        amount: 1,
        balanceAfter,
        scheduleId: params.scheduleId,
        reason: params.reason,
        adjustedBy: params.adjustedBy ?? null,
      },
    });

    return { memberCreditId: candidate.id, balanceAfter };
  }

  /**
   * 3. 일괄 복원 (수업/훈련 일정 취소 — N명 동시)
   *
   * 동작:
   *   - 명시된 creditIds 중 usedSessions > 0 인 건만 decrement
   *   - 성공 건수 반환 + 각 건에 대해 CreditTransaction(type='restored') 일괄 INSERT
   */
  async bulkRestoreOne(
    tx: Prisma.TransactionClient,
    params: {
      creditIds: string[];
      reason: string;
      adjustedBy: string;
      scheduleId?: string;
    },
  ): Promise<{ restoredCount: number }> {
    if (params.creditIds.length === 0) {
      return { restoredCount: 0 };
    }

    const result = await tx.memberCredit.updateMany({
      where: {
        id: { in: params.creditIds },
        usedSessions: { gt: 0 },
      },
      data: { usedSessions: { decrement: 1 } },
    });

    if (result.count > 0) {
      const restoredCredits = await tx.memberCredit.findMany({
        where: { id: { in: params.creditIds } },
        select: { id: true, totalSessions: true, usedSessions: true },
      });

      await tx.creditTransaction.createMany({
        data: restoredCredits.map((c) => ({
          memberCreditId: c.id,
          type: "restored",
          amount: 1,
          balanceAfter: c.totalSessions - c.usedSessions,
          scheduleId: params.scheduleId ?? null,
          reason: params.reason,
          adjustedBy: params.adjustedBy,
        })),
      });
    }

    return { restoredCount: result.count };
  }

  /**
   * 4. 결제 / mockPay / 관리자 발급 — 신규 MemberCredit 생성
   *
   * 동작:
   *   - 트랜잭션 안에서 새 MemberCredit + CreditTransaction(type='earned') INSERT
   *   - sessions <= 0 이면 BadRequestException throw
   */
  async issueFromPayment(
    tx: Prisma.TransactionClient,
    params: {
      paymentId: string | null; // mockPay/관리자 발급은 null 가능
      userId: string;
      classId: string;
      sessions: number;
      expiresAt: Date;
      sourceLabel: string;
    },
  ): Promise<{ memberCreditId: string }> {
    if (params.sessions <= 0) {
      throw new BadRequestException("발급 회차는 1 이상이어야 합니다.");
    }

    const newCredit = await tx.memberCredit.create({
      data: {
        userId: params.userId,
        classId: params.classId,
        totalSessions: params.sessions,
        usedSessions: 0,
        expiresAt: params.expiresAt,
        paymentId: params.paymentId,
      },
    });

    await tx.creditTransaction.create({
      data: {
        memberCreditId: newCredit.id,
        type: "earned",
        amount: params.sessions,
        balanceAfter: params.sessions,
        reason: params.sourceLabel,
      },
    });

    return { memberCreditId: newCredit.id };
  }

  /**
   * 5. 만료 처리 (cron) — 잔여분 자동 이월 시도 후 원본 소진
   *
   * 적용 조건 (CREDIT_PACKAGE_POLICY.md):
   *   - 오픈 클래스 (academyId IS NOT NULL): 자동 이월
   *   - 팀 정규 훈련 (teamId IS NOT NULL): CARRY_OVER_ENABLED_FOR_TEAM_REGULAR 플래그에 따름
   *
   * 동작:
   *   1. remainingSessions = totalSessions - usedSessions 계산
   *   2. 이월 조건 충족 시 새 MemberCredit 생성 (다음달 말일 만료) + CreditTransaction(carried_over)
   *   3. 원본 MemberCredit.usedSessions = totalSessions 로 소진 + CreditTransaction(expired)
   */
  async expireRemaining(
    tx: Prisma.TransactionClient,
    params: {
      memberCreditId: string;
      actorUserId: string;
    },
  ): Promise<{ expiredAmount: number; carriedOverCreditId: string | null }> {
    const credit = await tx.memberCredit.findUnique({
      where: { id: params.memberCreditId },
      select: {
        id: true,
        userId: true,
        classId: true,
        totalSessions: true,
        usedSessions: true,
        class: {
          select: { academyId: true, teamId: true },
        },
      },
    });

    if (!credit) {
      throw new NotFoundException("MemberCredit을 찾을 수 없습니다.");
    }

    const remainingSessions = credit.totalSessions - credit.usedSessions;
    if (remainingSessions <= 0) {
      return { expiredAmount: 0, carriedOverCreditId: null };
    }

    const isOpenClass = credit.class?.academyId != null;
    const isTeamRegular = credit.class?.teamId != null;
    const shouldCarryOver =
      isOpenClass ||
      (isTeamRegular && this.CARRY_OVER_ENABLED_FOR_TEAM_REGULAR);

    let carriedOverCreditId: string | null = null;
    if (shouldCarryOver) {
      const now = new Date();
      const nextMonthEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 2,
        0,
        23,
        59,
        59,
        999,
      );

      const carried = await tx.memberCredit.create({
        data: {
          userId: credit.userId,
          classId: credit.classId,
          totalSessions: remainingSessions,
          usedSessions: 0,
          expiresAt: nextMonthEnd,
          paymentId: null,
        },
      });
      carriedOverCreditId = carried.id;

      await tx.creditTransaction.create({
        data: {
          memberCreditId: carried.id,
          type: "carried_over",
          amount: remainingSessions,
          balanceAfter: remainingSessions,
          reason: `전월 미사용 회차 자동 이월 (원본 수업권 ID: ${credit.id})`,
        },
      });
    }

    // 원본 소진 처리 — DB CHECK 제약 정합 (usedSessions <= totalSessions)
    await tx.memberCredit.update({
      where: { id: credit.id },
      data: { usedSessions: credit.totalSessions },
    });

    await tx.creditTransaction.create({
      data: {
        memberCreditId: credit.id,
        type: "expired",
        amount: remainingSessions,
        balanceAfter: 0,
        reason: shouldCarryOver
          ? `만료 — ${remainingSessions}회 이월 처리됨 (신규 수업권 ID: ${carriedOverCreditId})`
          : `만료 — ${remainingSessions}회 자동 소멸 (이월 미적용)`,
        adjustedBy: params.actorUserId,
      },
    });

    this.logger.log(
      `MemberCredit 만료 처리: id=${credit.id}, remaining=${remainingSessions}, carried=${shouldCarryOver}, newCreditId=${carriedOverCreditId}`,
    );

    return { expiredAmount: remainingSessions, carriedOverCreditId };
  }

  /**
   * 6. 환불 처리 — 전액/부분
   *
   * 전액: usedSessions = 0 (사용된 회차 전부 복원)
   * 부분: usedSessions -= min(sessionsToRestore, usedSessions)
   *
   * @throws NotFoundException — MemberCredit 없음
   */
  async refundSessions(
    tx: Prisma.TransactionClient,
    params: {
      memberCreditId: string;
      sessionsToRestore: number;
      isFullRefund: boolean;
      reason: string;
    },
  ): Promise<{ balanceAfter: number; sessionsRestored: number }> {
    const credit = await tx.memberCredit.findUnique({
      where: { id: params.memberCreditId },
      select: { totalSessions: true, usedSessions: true },
    });
    if (!credit) {
      throw new NotFoundException("MemberCredit을 찾을 수 없습니다.");
    }

    const sessionsRestored = params.isFullRefund
      ? credit.usedSessions
      : Math.min(params.sessionsToRestore, credit.usedSessions);

    if (sessionsRestored > 0) {
      const newUsedSessions = params.isFullRefund
        ? 0
        : credit.usedSessions - sessionsRestored;
      await tx.memberCredit.update({
        where: { id: params.memberCreditId },
        data: { usedSessions: newUsedSessions },
      });
    }

    const updated = await tx.memberCredit.findUniqueOrThrow({
      where: { id: params.memberCreditId },
      select: { totalSessions: true, usedSessions: true },
    });
    const balanceAfter = updated.totalSessions - updated.usedSessions;

    await tx.creditTransaction.create({
      data: {
        memberCreditId: params.memberCreditId,
        type: params.isFullRefund ? "refund" : "refund_partial",
        amount: params.isFullRefund
          ? params.sessionsToRestore
          : sessionsRestored,
        balanceAfter,
        reason: params.reason,
      },
    });

    return { balanceAfter, sessionsRestored };
  }

  /**
   * 7. 관리자 조정 — totalSessions 추가 (delta > 0) 또는 usedSessions 증가 (delta < 0)
   *
   * 양수: 발급 — totalSessions += delta
   * 음수: 차감 — usedSessions += |delta|
   *
   * DB CHECK 제약 (chk_used_sessions_range) 위반 시 트랜잭션 자동 rollback.
   * 호출자는 사전에 잔량 검증 후 호출 권장.
   */
  async adjustSessions(
    tx: Prisma.TransactionClient,
    params: {
      memberCreditId: string;
      delta: number;
      reason: string;
      adjustedBy: string;
      transactionType?: "issued" | "deducted" | "admin_add" | "admin_deduct";
    },
  ): Promise<{ balanceAfter: number; transactionId: string }> {
    if (params.delta === 0) {
      throw new BadRequestException("조정 회차는 0이 될 수 없습니다.");
    }

    const credit = await tx.memberCredit.findUnique({
      where: { id: params.memberCreditId },
      select: { totalSessions: true, usedSessions: true },
    });
    if (!credit) {
      throw new NotFoundException("MemberCredit을 찾을 수 없습니다.");
    }

    const updateData =
      params.delta > 0
        ? { totalSessions: credit.totalSessions + params.delta }
        : { usedSessions: credit.usedSessions + Math.abs(params.delta) };

    const updated = await tx.memberCredit.update({
      where: { id: params.memberCreditId },
      data: updateData,
    });
    const balanceAfter = updated.totalSessions - updated.usedSessions;

    const defaultType = params.delta > 0 ? "issued" : "deducted";
    const transaction = await tx.creditTransaction.create({
      data: {
        memberCreditId: params.memberCreditId,
        type: params.transactionType ?? defaultType,
        amount: Math.abs(params.delta),
        balanceAfter,
        reason: params.reason,
        adjustedBy: params.adjustedBy,
      },
      select: { id: true },
    });

    return { balanceAfter, transactionId: transaction.id };
  }
}
