import {
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class PayoutSettlementDto {
  @ApiPropertyOptional({
    description: "지급 메모 (선택)",
    example: "2026-04 정기 지급 완료",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description:
      "지급 확인 화면에서 본 팀 정산 계좌의 updatedAt(상세 응답 teamSettlementAccount.updatedAt 그대로). 다르면 409",
    example: "2026-09-29T05:00:23.402Z",
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: "expectedAccountUpdatedAt 은 ISO 8601 형식이어야 합니다." },
  )
  // 시간대 없는 문자열은 서버 시간대로 해석돼 절대 시각이 달라진다.
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message:
      "expectedAccountUpdatedAt 에는 시간대(Z 또는 ±hh:mm)가 필요합니다.",
  })
  expectedAccountUpdatedAt?: string;
}
