import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsDateString,
  IsIn,
  IsArray,
  Min,
  MaxLength,
} from "class-validator";

const STAFF_ROLES = [
  "head_coach",
  "assistant_coach",
  "goalie_coach",
  "director",
  "manager",
  "trainer",
  "referee",
  "analyst",
] as const;

export class UpdateStaffCareerDto {
  @ApiPropertyOptional({ description: "역할", enum: STAFF_ROLES })
  @IsOptional()
  @IsString()
  @IsIn(STAFF_ROLES)
  role?: string;

  @ApiPropertyOptional({ description: "소속 기관/클럽명" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizationName?: string;

  @ApiPropertyOptional({ description: "리그명" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  leagueName?: string;

  @ApiPropertyOptional({ description: "경력 시작일" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "경력 종료일" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "현재 재직 여부" })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ description: "주요 업무·성과" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: "보유 자격증 목록", type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional({ description: "표시 순서" })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
