import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsNotEmpty } from "class-validator";

/**
 * 결제 완료 확인 요청 DTO
 *
 * POST /api/v1/payments/verify
 *
 * 결제 완료 페이지(/payment/complete)에서 서버에 결제 상태와
 * 영수증·크레딧 발급량을 조회하기 위해 호출.
 */
export class VerifyPaymentDto {
  @ApiProperty({
    description: "주문번호 (initiate 단계에서 발급된 orderNumber)",
    example: "ORD-1776234431193-e0612224267b",
  })
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @ApiPropertyOptional({
    description: "KG이니시스 거래 ID (리턴 URL 파라미터)",
  })
  @IsString()
  @IsOptional()
  tid?: string;

  @ApiPropertyOptional({
    description: "KG이니시스 결과 코드",
  })
  @IsString()
  @IsOptional()
  resultCode?: string;
}

/**
 * 결제 완료 확인 응답 DTO
 */
export class VerifyPaymentResponseDto {
  @ApiProperty({ description: "영수증 정보" })
  receipt!: {
    id: string;
    orderNumber: string;
    status: string;
    storeName: string;
    paymentDate: string;
    paymentMethod: string;
    cardLastFour?: string;
    installment?: string;
    productName: string;
    totalAmount: number;
    creditsIssued: number;
    /**
     * 수업명 (Enrollment → Class.className)
     * 수업 결제인 경우에만 존재. 매치 결제 등 enrollment 없는 경우 undefined.
     * @example "성인 입문반"
     */
    className?: string;
    /**
     * 수강생(자녀) 이름 (Enrollment → Child.name)
     * 수업 결제인 경우에만 존재. enrollment 없는 경우 undefined.
     * @example "김민준"
     */
    childName?: string;
  };

  @ApiProperty({ description: "발급된 크레딧 수", example: 8 })
  creditsIssued!: number;

  @ApiProperty({
    description: "안내 메시지",
    example: "결제가 완료되었습니다.",
  })
  message!: string;
}
