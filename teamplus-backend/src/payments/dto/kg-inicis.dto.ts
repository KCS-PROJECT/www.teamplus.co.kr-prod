import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  Min,
} from "class-validator";

/**
 * 결제 웹훅 DTO (KG이니시스에서 전송)
 */
export class PaymentWebhookDto {
  @ApiProperty({
    description: "주문번호",
    example: "ORD-1704355200000-abc123",
  })
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @ApiProperty({
    description: "KG이니시스 거래 ID (TID)",
    example: "INIpayTest20260104001",
  })
  @IsString()
  @IsNotEmpty()
  tid!: string;

  @ApiProperty({
    description: "결제 상태 (0000: 성공, 기타: 실패)",
    example: "0000",
  })
  @IsString()
  @IsNotEmpty()
  resultCode!: string;

  @ApiPropertyOptional({
    description: "결과 메시지",
    example: "정상처리",
  })
  @IsString()
  @IsOptional()
  resultMsg?: string;

  @ApiProperty({
    description: "결제 금액",
    example: 240000,
  })
  @IsNumber()
  amount!: number;

  @ApiPropertyOptional({
    description: "결제 수단",
    example: "card",
  })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: "카드사 코드",
    example: "01",
  })
  @IsString()
  @IsOptional()
  cardCode?: string;

  @ApiPropertyOptional({
    description: "카드사 이름",
    example: "비씨카드",
  })
  @IsString()
  @IsOptional()
  cardName?: string;

  @ApiPropertyOptional({
    description: "할부 개월 수",
    example: 0,
  })
  @IsNumber()
  @IsOptional()
  quota?: number;

  @ApiPropertyOptional({
    description: "승인번호",
    example: "12345678",
  })
  @IsString()
  @IsOptional()
  authCode?: string;

  @ApiPropertyOptional({
    description: "승인일시 (YYYYMMDDHHMMSS)",
    example: "20260104153045",
  })
  @IsString()
  @IsOptional()
  authDate?: string;

  @ApiPropertyOptional({
    description: "웹훅 서명 (HMAC-SHA256)",
    example: "abc123def456...",
  })
  @IsString()
  @IsOptional()
  signature?: string;
}

/**
 * 결제 취소 요청 DTO
 */
export class CancelPaymentDto {
  @ApiProperty({
    description: "취소 금액 (부분 취소 가능, 미입력 시 전액 취소)",
    example: 240000,
  })
  @IsNumber()
  @IsOptional()
  @Min(100)
  cancelAmount?: number;

  @ApiProperty({
    description: "취소 사유",
    example: "고객 요청",
  })
  @IsString()
  @IsNotEmpty()
  cancelReason!: string;

  @ApiPropertyOptional({
    description: "환불 계좌 은행 코드 (가상계좌 환불 시)",
    example: "04",
  })
  @IsString()
  @IsOptional()
  refundBankCode?: string;

  @ApiPropertyOptional({
    description: "환불 계좌번호",
    example: "1234567890",
  })
  @IsString()
  @IsOptional()
  refundAccount?: string;

  @ApiPropertyOptional({
    description: "환불 계좌 예금주",
    example: "홍길동",
  })
  @IsString()
  @IsOptional()
  refundAccountHolder?: string;
}

/**
 * 결제 상태 조회 응답 DTO
 */
export class PaymentStatusDto {
  @ApiProperty({
    description: "결제 ID",
    example: "pay_123abc",
  })
  id!: string;

  @ApiProperty({
    description: "주문번호",
    example: "ORD-1704355200000-abc123",
  })
  orderNumber!: string;

  @ApiProperty({
    description: "결제 상태",
    enum: ["pending", "completed", "failed", "refunded", "partially_refunded"],
    example: "completed",
  })
  paymentStatus!: string;

  @ApiProperty({
    description: "결제 금액",
    example: 240000,
  })
  amount!: number;

  @ApiPropertyOptional({
    description: "결제 수단",
    example: "card",
  })
  paymentMethod?: string;

  @ApiPropertyOptional({
    description: "KG이니시스 거래 ID",
    example: "INIpayTest20260104001",
  })
  tid?: string;

  @ApiPropertyOptional({
    description: "승인번호",
    example: "12345678",
  })
  authCode?: string;

  @ApiPropertyOptional({
    description: "카드사 이름",
    example: "비씨카드",
  })
  cardName?: string;

  @ApiProperty({
    description: "결제 생성일시",
    example: "2026-01-04T15:25:00Z",
  })
  createdAt!: Date;

  @ApiPropertyOptional({
    description: "결제 완료일시",
    example: "2026-01-04T15:30:45Z",
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    description: "상품 정보",
  })
  product?: {
    productName: string;
    price: number;
    sessionsPerMonth: number;
  };
}
