import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsIn,
  Min,
  Max,
  MaxLength,
} from "class-validator";

export class UpdateClassHistoryDto {
  @ApiPropertyOptional({ description: "수업 종료일" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "총 수업 횟수" })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalSessions?: number;

  @ApiPropertyOptional({ description: "출석 횟수" })
  @IsOptional()
  @IsInt()
  @Min(0)
  attendedSessions?: number;

  @ApiPropertyOptional({ description: "출석률 (0-100%)" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  attendanceRate?: number;

  @ApiPropertyOptional({
    description: "상태",
    enum: ["active", "completed", "withdrawn", "suspended"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["active", "completed", "withdrawn", "suspended"])
  status?: string;

  @ApiPropertyOptional({ description: "코치 총평" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coachComment?: string;

  @ApiPropertyOptional({ description: "최종 평가 점수 (1-100)" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  finalScore?: number;

  @ApiPropertyOptional({ description: "수료증 URL" })
  @IsOptional()
  @IsString()
  certificateUrl?: string;
}
