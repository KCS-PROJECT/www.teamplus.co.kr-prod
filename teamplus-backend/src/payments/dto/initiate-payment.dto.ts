import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  Min,
  IsEmail,
} from "class-validator";
import {
  PAYMENT_METHOD_CODES,
  type PaymentMethodCode,
} from "../constants/payment-method.constant";

/**
 * 결제 시작 요청 DTO
 *
 * POST /api/v1/payments/initiate 엔드포인트 입력 형식.
 * 우리 API 경계의 비즈니스 도메인 DTO이며, 특정 결제 게이트웨이(KG이니시스 등)와는 독립.
 */
export class InitiatePaymentDto {
  @ApiProperty({
    description: "상품 ID",
    example: "prod_123abc",
  })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({
    description: "결제 금액 (원)",
    example: 240000,
  })
  @IsNumber()
  @Min(100)
  amount!: number;

  @ApiPropertyOptional({
    description:
      "수강 신청할 수업 ID (수업 결제 시 전달 → Enrollment 자동 생성/연결, 단독 크레딧 충전 시 생략)",
    example: "class_abc123",
  })
  @IsString()
  @IsOptional()
  classId?: string;

  @ApiPropertyOptional({
    description: "수강할 자녀 User ID (classId와 함께 전달)",
    example: "user_child_123",
  })
  @IsString()
  @IsOptional()
  childId?: string;

  @ApiPropertyOptional({
    description:
      "결제 수단. KG이니시스: card·easy·vbank·trans·phone. 토스페이먼츠: 'toss' (Web SDK 위젯 위임). " +
      "단일 진실: src/payments/constants/payment-method.constant.ts (PAYMENT_METHODS).",
    enum: PAYMENT_METHOD_CODES,
    default: "card",
  })
  @IsEnum(PAYMENT_METHOD_CODES)
  @IsOptional()
  paymentMethod?: PaymentMethodCode = "card";

  @ApiPropertyOptional({
    description: "할부 개월 수 (0: 일시불, 2~12: 할부)",
    example: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  quota?: number = 0;

  @ApiPropertyOptional({
    description: "구매자 이름",
    example: "홍길동",
  })
  @IsString()
  @IsOptional()
  buyerName?: string;

  @ApiPropertyOptional({
    description: "구매자 이메일",
    example: "buyer@example.com",
  })
  @IsEmail()
  @IsOptional()
  buyerEmail?: string;

  @ApiPropertyOptional({
    description: "구매자 전화번호",
    example: "010-1234-5678",
  })
  @IsString()
  @IsOptional()
  buyerPhone?: string;
}

/**
 * 결제 결과 응답 DTO
 *
 * POST /api/v1/payments/initiate 응답 및 일부 조회 응답 공용.
 */
export class PaymentResultDto {
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
    description: "결제 금액",
    example: 240000,
  })
  amount!: number;

  @ApiProperty({
    description: "결제 상태",
    enum: ["pending", "completed", "failed", "refunded", "partially_refunded"],
    example: "completed",
  })
  paymentStatus!: string;

  @ApiPropertyOptional({
    description: "KG이니시스 거래 ID",
    example: "INIpayTest20260104001",
  })
  tid?: string;

  @ApiPropertyOptional({
    description: "결제 완료 시각",
    example: "2026-01-04T15:30:45Z",
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    description: "발급된 크레딧 수",
    example: 8,
  })
  creditsIssued?: number;

  @ApiProperty({
    description: "결제 페이지 URL (결제 시작 시)",
    example: "https://stdpay.inicis.com/stdpay/INIpayMobile.php?...",
  })
  paymentPageUrl?: string;
}
