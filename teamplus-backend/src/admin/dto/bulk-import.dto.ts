import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  ValidateNested,
  IsNotEmpty,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";

// ==================== 팀 일괄 등록 ====================

export class BulkTeamItemDto {
  @ApiProperty({ description: "클럽 ID" })
  @IsString()
  @IsNotEmpty()
  teamId!: string;

  @ApiProperty({ description: "팀명" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: "팀 약칭", required: false })
  @IsOptional()
  @IsString()
  shortName?: string;

  @ApiProperty({
    description: "디비전 (U8|U9|U10|U11|U12)",
    required: false,
  })
  @IsOptional()
  @IsString()
  division?: string;

  @ApiProperty({ description: "주 색상", required: false })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiProperty({ description: "보조 색상", required: false })
  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @ApiProperty({ description: "활성화 여부", required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BulkImportTeamsDto {
  @ApiProperty({ type: [BulkTeamItemDto], description: "팀 목록" })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkTeamItemDto)
  teams!: BulkTeamItemDto[];
}

// ==================== 선수(로스터) 일괄 등록 ====================

export class BulkPlayerItemDto {
  @ApiProperty({ description: "팀 ID" })
  @IsString()
  @IsNotEmpty()
  teamId!: string;

  @ApiProperty({ description: "클럽 회원 ID (ClubMember ID)" })
  @IsString()
  @IsNotEmpty()
  memberId!: string;

  @ApiProperty({
    description: "포지션 (GK|D|LW|RW|C)",
    required: false,
  })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiProperty({ description: "등번호", required: false, type: Number })
  @IsOptional()
  @IsNumber()
  jerseyNumber?: number;

  @ApiProperty({
    description: "역할 (captain|alternate_captain|player)",
    required: false,
    default: "player",
  })
  @IsOptional()
  @IsString()
  role?: string;
}

export class BulkImportPlayersDto {
  @ApiProperty({ type: [BulkPlayerItemDto], description: "선수 목록" })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkPlayerItemDto)
  players!: BulkPlayerItemDto[];
}

// ==================== 일정 일괄 등록 ====================

export class BulkScheduleItemDto {
  @ApiProperty({ description: "수업 ID" })
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @ApiProperty({
    description: "수업 예정일 (ISO 8601)",
    example: "2026-04-10T09:00:00.000Z",
  })
  @IsDateString()
  scheduledDate!: string;
}

export class BulkImportSchedulesDto {
  @ApiProperty({ type: [BulkScheduleItemDto], description: "일정 목록" })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkScheduleItemDto)
  schedules!: BulkScheduleItemDto[];
}
