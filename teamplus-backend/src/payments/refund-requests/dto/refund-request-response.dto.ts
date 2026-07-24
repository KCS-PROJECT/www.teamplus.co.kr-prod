import { ApiProperty } from "@nestjs/swagger";

/**
 * 환불 요청 상태/실행 결과 응답 (E1·E4·E5·E6 공통).
 */
export class RefundRequestResponseDto {
  @ApiProperty({ example: "clx_refundreq_1" })
  id!: string;

  @ApiProperty({ example: "clx_payment_1" })
  paymentId!: string;

  @ApiProperty({
    description:
      "pending | executing | executed | rejected | canceled | execution_failed",
    example: "executed",
  })
  status!: string;

  @ApiProperty({ description: "CLASS_PREPAID | CLASS_POSTPAID | TOURNAMENT" })
  sourceType!: string;

  @ApiProperty({ description: "요청 시점 결제 금액 스냅샷", example: 240000 })
  requestedAmount!: number;

  @ApiProperty({
    description: "실행 확정 환불액 (executed 시)",
    required: false,
    nullable: true,
    example: 240000,
  })
  approvedAmount?: number | null;

  @ApiProperty({ required: false, nullable: true })
  decidedAt?: Date | null;

  @ApiProperty({ required: false, nullable: true })
  executedAt?: Date | null;

  @ApiProperty({
    description: "실패 단계 — PG | DB_AFTER_PG (execution_failed 시)",
    required: false,
    nullable: true,
  })
  failureStage?: string | null;

  @ApiProperty({ description: "CAS 낙관적 잠금 버전", example: 1 })
  version!: number;
}

/**
 * 관리자 목록 아이템 (E2).
 */
export class RefundRequestListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  sourceType!: string;

  @ApiProperty({ description: "수업명 또는 대회명" })
  subjectLabel!: string;

  @ApiProperty()
  requesterName!: string;

  @ApiProperty({ required: false, nullable: true })
  childName?: string | null;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: "대기 경과(분)" })
  waitingMinutes!: number;

  @ApiProperty({
    description: "판단 위험 표식 — 이용 개시/후불/대회",
    example: { used: false, postpaid: false, tournament: false },
  })
  riskFlags!: { used: boolean; postpaid: boolean; tournament: boolean };
}

/** 이력 전용 pagination (활성은 activeItems 로 전량 노출). */
export class RefundRequestPaginationDto {
  @ApiProperty({ description: "현재 페이지(1-base)", example: 1 })
  page!: number;

  @ApiProperty({ description: "페이지당 항목 수", example: 20 })
  limit!: number;

  @ApiProperty({ description: "이력 총 건수", example: 42 })
  total!: number;

  @ApiProperty({ description: "이력 총 페이지 수", example: 3 })
  totalPages!: number;
}

/**
 * 관리자 목록 응답 (E2) — [Major 4] 활성/이력 명시 분리 계약.
 *   activeItems: 전체 활성(pending·executing·execution_failed, 페이지 무관 전량).
 *   historyItems: 이력(그 외 상태) 페이지. pagination 은 이력 전용 기준.
 *   단일 status 필터 시 activeItems=[], 해당 상태를 historyItems+pagination 으로 반환.
 */
export class RefundRequestListResponseDto {
  @ApiProperty({ type: [RefundRequestListItemDto] })
  activeItems!: RefundRequestListItemDto[];

  @ApiProperty({ type: [RefundRequestListItemDto] })
  historyItems!: RefundRequestListItemDto[];

  @ApiProperty({ type: RefundRequestPaginationDto })
  pagination!: RefundRequestPaginationDto;

  @ApiProperty({ description: "승인 대기(pending) 건수", example: 5 })
  pendingCount!: number;
}
