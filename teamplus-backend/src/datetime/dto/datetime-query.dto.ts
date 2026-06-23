import { IsOptional, Matches } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class GetDateTimeQueryDto {
  @ApiPropertyOptional({
    description:
      "기준 날짜 (YYYYMMDD). 미지정 시 호출 시점의 오늘 날짜로 계산합니다.",
    example: "20260419",
    pattern: "^\\d{8}$",
  })
  @IsOptional()
  @Matches(/^\d{8}$/, {
    message: "baseDate 는 YYYYMMDD 형식의 8자리 숫자여야 합니다.",
  })
  baseDate?: string;
}

export interface DateTimeResponse {
  year: string;
  month: string;
  date: string;
  dateTime: string;
  dateTimeSecond: string;
  dateTimeMillisecond: string;
  weeklyDates: string[];
  monthlyDates: string[];
  baseDate: string;
  isCustomBase: boolean;
  timezone: string;
}
