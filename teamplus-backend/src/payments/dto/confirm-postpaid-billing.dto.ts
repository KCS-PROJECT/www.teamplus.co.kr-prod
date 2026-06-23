import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

/**
 * [Phase B-3] 후불(모드 A POSTPAID) 정산 초안 조회 / 확정 요청 DTO.
 *   GET /payments/postpaid/draft (@Query) · POST /payments/postpaid/confirm (@Body) 공용.
 */
export class ConfirmPostpaidBillingDto {
  @ApiProperty({ description: "수업 ID", example: "clxxxxxxxxxxxx" })
  @IsString()
  classId!: string;

  @ApiProperty({ description: "정산 대상 월 (YYYY-MM)", example: "2026-06" })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: "yearMonth 형식은 YYYY-MM 이어야 합니다.",
  })
  yearMonth!: string;
}
