/**
 * Enrollment.status 값 사전 — 단일 SoT.
 *
 * DB 는 `status String`(제약 없음)이고 DTO enum(enrollment-response.dto.ts)만으로는
 * 불완전했다 — `refunded` 는 환불 서비스가 문자열 리터럴로 직접 기록해 enum 밖에
 * 존재해 왔다. 이 파일이 실제 런타임에 존재하는 9종 전체의 SoT 다.
 *
 * 아래 명명 집합은 "전역 랭크"가 아니라 소비처 질문별 집합이다. 소비처마다 실제
 * 집합이 다르므로 겸용하지 않는다 — 예: 만료 cron(2종)과 중복 신청 차단(3종)은
 * approved 포함 여부가 다르다.
 */
export const ENROLLMENT_STATUS = {
  /** 학부모 직접 신청 — 결제 대기 (72h) */
  PENDING: "pending",
  /** 자녀 신청 → 학부모 승인 대기 */
  PENDING_APPROVAL: "pending_approval",
  /** 선불=승인·미결제 / 후불=수강 중 (billingMode·billingTiming 결합 판정 필요) */
  APPROVED: "approved",
  /** 학부모 거절 */
  REJECTED: "rejected",
  /** 결제 완료 */
  PAID: "paid",
  /** 취소 */
  CANCELLED: "cancelled",
  /** 72h 만료 (자정 cron) */
  EXPIRED: "expired",
  /** 크레딧 만료 후 종료 (credit-expiry.service 가 paid→completed 전환) */
  COMPLETED: "completed",
  /** 전액 환불·회차 회수 (payment-refund.service) */
  REFUNDED: "refunded",
} as const;

export type EnrollmentStatusValue =
  (typeof ENROLLMENT_STATUS)[keyof typeof ENROLLMENT_STATUS];

/** 만료 cron 대상 — expiresAt 경과 시 expired 전환 (reminder.scheduler).
 *  approved 는 후불 수강 상태라 절대 포함 금지. */
export const AWAITING_EXPIRY: string[] = [
  ENROLLMENT_STATUS.PENDING,
  ENROLLMENT_STATUS.PENDING_APPROVAL,
];

/** 중복 신청 차단 — 같은 자녀·수업 재신청을 막는 상태 (enrollments.service 생성 검사).
 *  AWAITING_EXPIRY 와 다른 집합이다 — approved(후불 수강 중) 포함 3종. */
export const BLOCKING_APPLICATION: string[] = [
  ENROLLMENT_STATUS.PENDING,
  ENROLLMENT_STATUS.PENDING_APPROVAL,
  ENROLLMENT_STATUS.APPROVED,
];

/** 현재 수강 기록 selector 의 "후보" 상태 (classes.service getClassPayments).
 *  후보일 뿐 — 실제 판정은 상태 + 유효 결제방식(POSTPAID) + 배치/수업권 유효
 *  (hasValidPass) 를 결합한다. 이 배열 단독으로 수강 중을 판정하지 말 것. */
export const CONTRACT_CANDIDATE: string[] = [
  ENROLLMENT_STATUS.APPROVED,
  ENROLLMENT_STATUS.PAID,
];

/** 돈 없이 종결 — 정산 5-state 의 CANCELLED 판정용 (attribution.util·classes.service).
 *  refunded 는 여기 넣지 않는다 — 환불은 Payment 상태(refunded)가 먼저 판정하며
 *  REFUNDED 로 표기되어야 한다(넣으면 CANCELLED 로 오분류). */
export const TERMINAL_NO_MONEY: string[] = [
  ENROLLMENT_STATUS.CANCELLED,
  ENROLLMENT_STATUS.REJECTED,
  ENROLLMENT_STATUS.EXPIRED,
];

/** 완료 결제가 존재했던 상태 — 회계적 보존 필수 축. */
export const HAS_MONEY: string[] = [
  ENROLLMENT_STATUS.PAID,
  ENROLLMENT_STATUS.COMPLETED,
  ENROLLMENT_STATUS.REFUNDED,
];
