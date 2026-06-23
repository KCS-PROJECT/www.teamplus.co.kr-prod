/**
 * PackageGuard Utility — SoT.
 *
 * 가드 정책 (2026-06-09 단순화):
 *   수업 종료일(endTime) 기반 차단은 dateSchedules 수업에서 오작동하므로 폐기.
 *   패키지 수동 비활성(isActive=false)만 방어선으로 유지.
 *
 * 학부모·학생 시점 비활성 숨김:
 *   PARENT / CHILD / TEEN → 비활성 패키지를 응답에서 제외 (UX 노이즈 최소화)
 *   COACH / DIRECTOR / ACADEMY_DIRECTOR / ADMIN → 모두 노출 (운영 디버깅)
 */

// ─────────────────────────────────────────────────────────────────────────
// 상수 (Single Source of Truth)
// ─────────────────────────────────────────────────────────────────────────

/** 비활성 패키지를 응답에서 숨겨야 하는 사용자 유형 (학부모·학생 시점). */
export const HIDE_INACTIVE_USER_TYPES = new Set<string>([
  "PARENT",
  "CHILD",
  "TEEN",
]);

// ─────────────────────────────────────────────────────────────────────────
// 사유 메시지 SoT
//   조회용 (getClass / getClassProducts): disabledReason 필드에 노출.
//   결제용 (assertPaymentAllowed): BadRequestException 메시지에 노출.
// ─────────────────────────────────────────────────────────────────────────

export const PACKAGE_DISABLED_REASONS = {
  INACTIVE: "비활성 패키지",
} as const;

export const PACKAGE_PAYMENT_BLOCK_MESSAGES = {
  INACTIVE: "현재 결제할 수 없는 패키지입니다. 다른 패키지를 선택해주세요.",
} as const;

export type PackageBlockReason = keyof typeof PACKAGE_PAYMENT_BLOCK_MESSAGES;

// ─────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────

/** computePackageGuardMeta() 입력 — 패키지 1건의 최소 필드. */
export interface PackageGuardInput {
  feeType: string;
  durationDays: number | null;
  isActive: boolean;
}

/** computePackageGuardMeta() 출력 — 응답에 추가 주입할 메타 4개. */
export interface PackageGuardMeta {
  classEndDate: Date | null;
  expectedExpiresAt: Date | null;
  isPurchasable: boolean;
  disabledReason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// 헬퍼 함수
// ─────────────────────────────────────────────────────────────────────────

/**
 * 수업 자체가 종료되었는지 판정 — 조회 응답 isClassEnded 필드 계산용.
 * (결제 가드에는 미사용 — 수업 종료일 기반 차단 폐기)
 * endTime 이 null 이면 false.
 */
export function isClassEnded(endTime: Date | null, now: Date = new Date()): boolean {
  if (!endTime) return false;
  return now > new Date(endTime);
}

/**
 * 학부모·학생 시점에서 비활성 패키지를 숨겨야 하는지 판정.
 * requester 미전달(테스트·내부 헬퍼)은 false → 모두 노출.
 */
export function shouldHideInactiveFor(userType?: string | null): boolean {
  return !!userType && HIDE_INACTIVE_USER_TYPES.has(userType);
}

/**
 * 패키지 1건의 가드 메타 계산 (getClass / getClassProducts 공통).
 * isActive=false 만 차단. 수업 종료일 기반 차단은 폐기.
 *
 * @param product   - 패키지 단건 (feeType, durationDays, isActive)
 * @param endTime   - Class.endTime (classEndDate 응답 필드용 — 차단에는 미사용)
 * @param now       - 테스트용 시각 주입 (expectedExpiresAt 계산용)
 */
export function computePackageGuardMeta(
  product: PackageGuardInput,
  endTime: Date | null,
  now: Date = new Date(),
): PackageGuardMeta {
  const expectedExpiresAt = product.durationDays
    ? (() => {
        const d = new Date(now);
        d.setDate(d.getDate() + product.durationDays!);
        return d;
      })()
    : null;

  const disabledReason: string | null =
    product.isActive === false ? PACKAGE_DISABLED_REASONS.INACTIVE : null;

  const isPurchasable = product.isActive !== false;

  return {
    classEndDate: endTime ?? null,
    expectedExpiresAt,
    isPurchasable,
    disabledReason,
  };
}

/**
 * 결제 시점 단건 가드 (payment-create 전용).
 * isActive=false 만 차단. 통과 시 null 반환.
 */
export function assertPaymentAllowed(
  product: PackageGuardInput & { class?: { endTime: Date | null } | null },
): PackageBlockReason | null {
  if (product.isActive === false) {
    return "INACTIVE";
  }
  return null;
}
