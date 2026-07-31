import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 감독/원장 승인 부분환불 요청 본문 (`POST /payments/:paymentId/refund-by-manager`).
 *
 * 환불 승인 도메인의 DTO 라 refund-requests 아래 둔다 — 엔드포인트만 결제 컨트롤러에
 * 있고(경로가 결제 자원이라), 산정·권한 규칙은 환불 승인제와 동일한 SoT 를 쓴다.
 */
export class RefundByManagerDto {
  @ApiProperty({ example: "학부모 중도 해지 요청", description: "환불 사유" })
  @IsNotEmpty({ message: "환불 사유는 필수입니다." })
  @IsString({ message: "환불 사유는 문자열이어야 합니다." })
  refundReason!: string;

  @ApiPropertyOptional({
    example: 120000,
    description:
      "환불 금액(원). 미입력 시 서버 산정액(결제액 − 이용분 공제 − 기환불) 전액. 산정액 초과 불가.",
  })
  @IsOptional()
  @IsNumber({}, { message: "환불 금액은 숫자여야 합니다." })
  @Min(1, { message: "환불 금액은 1원 이상이어야 합니다." })
  refundAmount?: number;

  @ApiPropertyOptional({
    description: "환불 계좌 은행 코드 (가상계좌 환불 시)",
  })
  @IsOptional()
  @IsString()
  refundBankCode?: string;

  @ApiPropertyOptional({ description: "환불 계좌번호 (가상계좌 환불 시)" })
  @IsOptional()
  @IsString()
  refundAccount?: string;

  @ApiPropertyOptional({ description: "환불 계좌 예금주 (가상계좌 환불 시)" })
  @IsOptional()
  @IsString()
  refundAccountHolder?: string;
}
