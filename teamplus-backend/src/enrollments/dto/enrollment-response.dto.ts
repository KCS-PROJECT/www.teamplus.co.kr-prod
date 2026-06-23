import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 수강신청 상태
 */
export enum EnrollmentStatus {
  PENDING = "pending", // 대기 중 (결제 대기)
  PENDING_APPROVAL = "pending_approval", // 승인 대기 (자녀 요청 시)
  APPROVED = "approved", // 승인됨 (결제 대기)
  REJECTED = "rejected", // 거절됨
  PAID = "paid", // 결제 완료 (수강 중)
  /**
   * completed: 월말 cron 에 의해 MemberCredit.expiresAt 도래 후 자동 전환.
   * paid → completed 전환 시 ClassRegistration.status 도 active → inactive 로 함께 전환.
   * 잔여 회차는 FIFO(만료 임박 우선)로 expiresAt 까지 자유 사용 가능.
   * 중복 검증 status IN ['pending', 'pending_approval', 'approved', 'paid'] 에 포함되지 않으므로
   * 같은 수업의 다음 달 결제(신규 Enrollment 생성)가 허용된다.
   */
  COMPLETED = "completed", // 수강 완료 (월말 자동 전환)
  CANCELLED = "cancelled", // 취소됨
  EXPIRED = "expired", // 만료됨
}

/**
 * 자녀 정보 (간략)
 */
export class ChildInfoDto {
  @ApiProperty({ description: "자녀 ID" })
  id!: string;

  @ApiProperty({ description: "자녀 이름" })
  fullName!: string;

  @ApiProperty({ description: "자녀 나이" })
  age!: number;
}

/**
 * 수업 정보 (간략)
 */
export class ClassInfoDto {
  @ApiProperty({ description: "수업 ID" })
  id!: string;

  @ApiProperty({ description: "수업명" })
  className!: string;

  @ApiProperty({ description: "클럽명" })
  clubName!: string;

  @ApiPropertyOptional({ description: "수업 설명" })
  description?: string;

  @ApiPropertyOptional({
    description: "청구 방식 (PREPAID 선불 / POSTPAID 후불)",
  })
  billingMode?: string;
}

/**
 * 상품 정보 (간략)
 */
export class ProductInfoDto {
  @ApiProperty({ description: "상품 ID" })
  id!: string;

  @ApiProperty({ description: "상품명" })
  productName!: string;

  @ApiProperty({ description: "가격" })
  price!: number;

  @ApiProperty({ description: "월 수업 횟수" })
  sessionsPerMonth!: number;
}

/**
 * 신청자 정보
 */
export class RequesterInfoDto {
  @ApiProperty({ description: "신청자 ID" })
  id!: string;

  @ApiProperty({ description: "신청자 이름" })
  name!: string;

  @ApiProperty({ description: "신청자 타입 (PARENT/CHILD)" })
  userType!: string;
}

/**
 * 수강신청 응답 DTO
 */
export class EnrollmentResponseDto {
  @ApiProperty({ description: "수강신청 ID" })
  id!: string;

  // [2026-06-17] top-level 식별자 — 프론트(수업목록·홈 요약)가 선택 자녀 기준으로 등록완료를
  //   판정할 때 e.childId / e.classId 로 바로 접근하도록 추가(중첩 child.id/class.id 와 동일 값).
  @ApiProperty({ description: "자녀 ID (top-level)" })
  childId!: string;

  @ApiProperty({ description: "수업 ID (top-level)" })
  classId!: string;

  @ApiProperty({ description: "자녀 정보" })
  child!: ChildInfoDto;

  @ApiProperty({ description: "수업 정보" })
  class!: ClassInfoDto;

  @ApiPropertyOptional({ description: "선택 상품 정보" })
  product?: ProductInfoDto;

  @ApiProperty({ description: "신청자 정보" })
  requester!: RequesterInfoDto;

  @ApiProperty({
    description: "신청 유형",
    enum: ["parent_direct", "child_request"],
  })
  requestType!: string;

  @ApiProperty({
    description: "신청 상태",
    enum: EnrollmentStatus,
  })
  status!: string;

  @ApiPropertyOptional({ description: "승인자 ID" })
  approvedBy?: string;

  @ApiPropertyOptional({ description: "승인 일시" })
  approvedAt?: Date;

  @ApiPropertyOptional({ description: "거절 일시" })
  rejectedAt?: Date;

  @ApiPropertyOptional({ description: "거절 사유" })
  rejectionReason?: string;

  @ApiPropertyOptional({ description: "결제 ID" })
  paymentId?: string;

  @ApiPropertyOptional({ description: "결제 일시" })
  paidAt?: Date;

  @ApiProperty({ description: "신청 일시" })
  requestedAt!: Date;

  @ApiProperty({ description: "만료 일시" })
  expiresAt!: Date;

  @ApiPropertyOptional({ description: "메모" })
  note?: string;

  @ApiPropertyOptional({ description: "남은 시간 (초)" })
  remainingSeconds?: number;
}

/**
 * 수강신청 목록 응답 DTO
 */
export class EnrollmentListResponseDto {
  @ApiProperty({ description: "성공 여부" })
  success!: boolean;

  @ApiProperty({ description: "수강신청 목록", type: [EnrollmentResponseDto] })
  data!: EnrollmentResponseDto[];

  @ApiProperty({ description: "총 개수" })
  total!: number;
}

/**
 * 수강신청 단건 응답 DTO
 */
export class EnrollmentSingleResponseDto {
  @ApiProperty({ description: "성공 여부" })
  success!: boolean;

  @ApiProperty({ description: "수강신청 정보", type: EnrollmentResponseDto })
  data!: EnrollmentResponseDto;
}

/**
 * 승인 대기 목록 응답 DTO (학부모용)
 */
export class PendingEnrollmentListResponseDto {
  @ApiProperty({ description: "성공 여부" })
  success!: boolean;

  @ApiProperty({
    description: "승인 대기 수강신청 목록",
    type: [EnrollmentResponseDto],
  })
  data!: EnrollmentResponseDto[];

  @ApiProperty({ description: "승인 대기 수" })
  pendingCount!: number;
}
