import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString, Matches } from "class-validator";

export enum RevenueScope {
  MONTH = "month",
  YEAR = "year",
}

export class DirectorRevenueQueryDto {
  @ApiProperty({
    description: "집계 스코프 (월간/연간)",
    enum: RevenueScope,
    example: RevenueScope.MONTH,
  })
  @IsEnum(RevenueScope, { message: "scope 는 month 또는 year 여야 합니다." })
  scope!: RevenueScope;

  @ApiProperty({
    description: "기준 기간. month 스코프는 'YYYY-MM', year 스코프는 'YYYY'",
    example: "2026-06",
  })
  @IsString({ message: "anchor 는 문자열이어야 합니다." })
  @Matches(/^\d{4}(-\d{2})?$/, {
    message: "anchor 는 'YYYY' 또는 'YYYY-MM' 형식이어야 합니다.",
  })
  anchor!: string;
}
