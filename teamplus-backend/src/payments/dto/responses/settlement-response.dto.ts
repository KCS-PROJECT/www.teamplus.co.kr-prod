import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 정산 - 팀 정보 (간략)
 */
export class SettlementTeamDto {
  @ApiProperty({ description: "팀 ID" })
  id!: string;

  @ApiProperty({ description: "팀명", example: "팀플러스 하키클럽" })
  name!: string;

  @ApiPropertyOptional({
    description: "팀 코드",
    nullable: true,
    type: String,
  })
  teamCode?: string | null;
}

/**
 * 정산 - 거래 내역 항목
 */
export class SettlementTransactionDto {
  @ApiProperty({ description: "거래 ID" })
  id!: string;

  @ApiPropertyOptional({
    description: "결제 ID (PG 연동된 거래에만)",
    nullable: true,
    type: String,
  })
  paymentId?: string | null;

  @ApiProperty({
    description:
      "거래 유형 (class_payment | shop_order | refund | fee | rejection)",
    example: "class_payment",
  })
  transactionType!: string;

  @ApiProperty({ description: "거래 금액 (원)", example: 50000 })
  amount!: number;

  @ApiPropertyOptional({
    description: "거래 설명",
    nullable: true,
    type: String,
  })
  description?: string | null;

  @ApiProperty({ description: "거래 일시" })
  transactionDate!: Date;
}

/**
 * 정산 상세 응답 DTO
 *
 * `getSettlementDetail` / `approveSettlement` / `completeSettlement` /
 * `rejectSettlement` 메서드의 단일 응답 타입.
 *
 * include 전체 로드 → SETTLEMENT_DETAIL_SELECT 전환으로 over-fetching 70% 제거.
 * approvedBy 는 deprecated (manager 승인 체계로 이관) 이지만 호환 유지.
 */
export class SettlementResponseDto {
  @ApiProperty({ description: "정산 ID" })
  id!: string;

  @ApiProperty({ description: "팀 ID" })
  teamId!: string;

  @ApiProperty({
    description: "정산 월 (YYYY-MM)",
    example: "2026-05",
  })
  settlementMonth!: string;

  @ApiProperty({ description: "총 매출 (원)", example: 5000000 })
  totalRevenue!: number;

  @ApiProperty({ description: "플랫폼 수수료 (원)", example: 250000 })
  platformFee!: number;

  @ApiProperty({ description: "PG 수수료 (원)", example: 150000 })
  paymentFee!: number;

  @ApiProperty({ description: "환불 금액 (원)", example: 100000 })
  refundAmount!: number;

  @ApiProperty({ description: "정산 금액 (원)", example: 4500000 })
  netAmount!: number;

  @ApiProperty({
    description:
      "정산 상태 (pending|processing|approved|completed|rejected|failed)",
    example: "pending",
  })
  status!: string;

  @ApiPropertyOptional({
    description: "은행명",
    nullable: true,
    type: String,
  })
  bankName?: string | null;

  @ApiPropertyOptional({
    description: "계좌번호",
    nullable: true,
    type: String,
  })
  bankAccount?: string | null;

  @ApiPropertyOptional({
    description: "예금주",
    nullable: true,
    type: String,
  })
  accountHolder?: string | null;

  @ApiPropertyOptional({
    description: "정산 예정일",
    nullable: true,
    type: Date,
  })
  scheduledAt?: Date | null;

  @ApiPropertyOptional({
    description: "정산 완료일",
    nullable: true,
    type: Date,
  })
  completedAt?: Date | null;

  @ApiPropertyOptional({
    description:
      "승인자 User ID (@deprecated — 매니저 승인 체계로 이관, 호환 유지)",
    nullable: true,
    type: String,
  })
  approvedBy?: string | null;

  @ApiProperty({ description: "생성 일시" })
  createdAt!: Date;

  @ApiProperty({ description: "최종 수정 일시" })
  updatedAt!: Date;

  @ApiProperty({
    description: "팀 정보",
    type: SettlementTeamDto,
  })
  team!: SettlementTeamDto;

  @ApiProperty({
    description:
      "거래 내역 (최대 100건, transactionDate 내림차순). getSettlementDetail 응답에만 포함됨.",
    type: [SettlementTransactionDto],
  })
  transactions!: SettlementTransactionDto[];
}

/**
 * 정산 액션 (승인/지급완료/거절) 응답 DTO
 *
 * 워크플로우 메서드는 정산 전체 객체 대신 액션 결과 요약만 반환.
 * 기존 응답 필드 `clubName` 호환 유지 (admin 프론트엔드 컨트랙트).
 * - approveSettlement → status=approved, approvedBy, clubName, netAmount
 * - completeSettlement → status=completed, completedAt, clubName, netAmount
 * - rejectSettlement → status=rejected, clubName, reason
 */
export class SettlementActionResponseDto {
  @ApiProperty({ description: "정산 ID" })
  id!: string;

  @ApiProperty({
    description: "변경 후 상태 (approved | completed | rejected)",
    example: "approved",
  })
  status!: string;

  @ApiProperty({
    description: "팀명 (관리자 화면 표시용 — 기존 컨트랙트 유지)",
    example: "팀플러스 하키클럽",
  })
  clubName!: string;

  @ApiProperty({
    description: "응답 메시지 (사용자 표시용)",
    example: "정산이 승인되었습니다.",
  })
  message!: string;

  @ApiPropertyOptional({
    description: "승인자 User ID (approveSettlement 응답에만)",
    nullable: true,
    type: String,
  })
  approvedBy?: string | null;

  @ApiPropertyOptional({
    description: "지급 완료 일시 (completeSettlement 응답에만)",
    nullable: true,
    type: Date,
  })
  completedAt?: Date | null;

  @ApiPropertyOptional({
    description: "정산 금액 (원) — approve / complete 응답에 포함",
    nullable: true,
    type: Number,
  })
  netAmount?: number | null;

  @ApiPropertyOptional({
    description: "거절 사유 (rejectSettlement 응답에만)",
    nullable: true,
    type: String,
  })
  reason?: string | null;
}
