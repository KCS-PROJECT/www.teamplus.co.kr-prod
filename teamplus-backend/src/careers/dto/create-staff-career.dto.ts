import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsIn,
  IsArray,
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

export class CreateStaffCareerDto {
  @ApiProperty({ description: "사용자 ID (User.id)" })
  @IsString()
  userId!: string;

  @ApiProperty({
    description: "역할",
    enum: STAFF_ROLES,
    example: "head_coach",
  })
  @IsString()
  @IsIn(STAFF_ROLES)
  role!: string;

  @ApiProperty({
    description: "소속 기관/클럽명",
    example: "서울 아이스하키 클럽",
  })
  @IsString()
  @MaxLength(200)
  organizationName!: string;

  @ApiPropertyOptional({
    description: "리그명",
    example: "대한아이스하키협회",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  leagueName?: string;

  @ApiProperty({ description: "경력 시작일", example: "2020-03-01" })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ description: "경력 종료일 (현재 재직이면 생략)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "현재 재직 여부", default: false })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ description: "주요 업무·성과" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: "보유 자격증 목록",
    type: [String],
    example: ["대한아이스하키협회 코치 2급", "스포츠지도사 2급"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];
}
