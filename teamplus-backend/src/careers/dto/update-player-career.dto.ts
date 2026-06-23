import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsDateString,
  IsIn,
  Min,
  Max,
  MaxLength,
} from "class-validator";

const POSITIONS = [
  "goalie",
  "center",
  "left_wing",
  "right_wing",
  "defense",
] as const;

export class UpdatePlayerCareerDto {
  @ApiPropertyOptional({ description: "소속 팀명" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  teamName?: string;

  @ApiPropertyOptional({ description: "포지션", enum: POSITIONS })
  @IsOptional()
  @IsString()
  @IsIn(POSITIONS)
  position?: string;

  @ApiPropertyOptional({ description: "등번호" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  jerseyNumber?: number;

  @ApiPropertyOptional({ description: "리그/대회명" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  leagueName?: string;

  @ApiPropertyOptional({ description: "활동 시작일" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "활동 종료일" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "현재 소속 여부" })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ description: "활동 내용·특이사항" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: "표시 순서" })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
