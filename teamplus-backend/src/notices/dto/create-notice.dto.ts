import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsDateString,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// 화이트리스트 표시 위치 값
export const VALID_DISPLAY_LOCATIONS = [
  "app_home",
  "app_popup",
  "app_mypage",
  "web_home",
  "web_popup",
  "web_dashboard",
] as const;

export enum NoticeType {
  GENERAL = "general",
  IMPORTANT = "important",
  MAINTENANCE = "maintenance",
  EVENT = "event",
}

export class CreateNoticeDto {
  @ApiProperty({
    description: "공지사항 제목",
    example: "서비스 점검 안내",
    minLength: 2,
    maxLength: 200,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: "공지사항 내용",
    example: "2026년 1월 15일 02:00 ~ 06:00 서비스 점검이 예정되어 있습니다.",
    minLength: 10,
    maxLength: 10000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(10000, { message: "공지사항 내용은 10000자 이하여야 합니다." })
  content!: string;

  @ApiPropertyOptional({
    description: "공지사항 유형",
    enum: NoticeType,
    default: NoticeType.GENERAL,
  })
  @IsOptional()
  @IsEnum(NoticeType)
  type?: NoticeType;

  @ApiPropertyOptional({
    description: "점검 사유 (점검 공지 전용 · M4 화면 '점검사유' 행 표시)",
    example: "보안 업데이트",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  maintenanceReason?: string;

  @ApiPropertyOptional({
    description: "상단 고정 여부",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({
    description: "공개 여부",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description:
      "표시 위치 목록 (app_home|app_popup|app_mypage|web_home|web_popup|web_dashboard)",
    example: ["app_home", "web_home"],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  displayLocations?: string[];

  @ApiPropertyOptional({
    description: "공지 시작일 (ISO 8601)",
    example: "2026-03-06T00:00:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "공지 종료일 (ISO 8601)",
    example: "2026-03-31T23:59:59.000Z",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      "타겟 출생연도 시작 (학년별 공지용, 예: 2015 → 초등 1학년 이상 포함)",
    example: 2015,
  })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2030)
  targetBirthYearFrom?: number;

  @ApiPropertyOptional({
    description: "타겟 출생연도 종료 (학년별 공지용, 예: 2020 → 5세 이하 포함)",
    example: 2020,
  })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2030)
  targetBirthYearTo?: number;

  @ApiPropertyOptional({
    description: "특정 팀 대상 공지 (teamId)",
    example: "team-cuid-abc123",
  })
  @IsOptional()
  @IsString()
  targetTeamId?: string;
}
