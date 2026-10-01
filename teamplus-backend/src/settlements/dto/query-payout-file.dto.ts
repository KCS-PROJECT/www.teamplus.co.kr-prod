import { IsString, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/** 나이스 지급 엑셀 미리보기 — GET /api/v1/settlements/payout-file/preview. */
export class QueryPayoutFilePreviewDto {
  @ApiProperty({ description: "정산월 (YYYY-MM)", example: "2026-09" })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "정산월은 YYYY-MM 형식이어야 합니다.",
  })
  month!: string;

  @ApiProperty({
    description: "나이스 지급일 (YYYY-MM-DD, KST 달력일)",
    example: "2026-10-15",
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "지급일은 YYYY-MM-DD 형식이어야 합니다.",
  })
  payDate!: string;
}

/** 나이스 지급 엑셀 다운로드 — GET /api/v1/settlements/payout-file. */
export class QueryPayoutFileDto extends QueryPayoutFilePreviewDto {
  @ApiProperty({ description: "미리보기 응답의 fingerprint" })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/, {
    message: "fingerprint 형식이 올바르지 않습니다.",
  })
  fingerprint!: string;
}
