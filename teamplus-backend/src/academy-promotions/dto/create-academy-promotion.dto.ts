import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  IsDateString,
  IsEnum,
  Min,
  Max,
  MinLength,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum LessonType {
  PRIVATE = "PRIVATE",
  GROUP = "GROUP",
  GAME_LESSON = "GAME_LESSON",
  FUN = "FUN",
}

export class CreateAcademyPromotionDto {
  @ApiProperty({
    description: "홍보 제목",
    example: "[개인/그룹] 아이스하키 레슨 모집",
    minLength: 2,
    maxLength: 200,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: "홍보 내용",
    example: "현직 KHL 트레이너 출신 코치가 진행하는 실전 레슨입니다.",
  })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  content!: string;

  @ApiProperty({
    description: "레슨 유형",
    enum: LessonType,
    example: LessonType.PRIVATE,
  })
  @IsEnum(LessonType)
  lessonType!: LessonType;

  @ApiPropertyOptional({
    description: "소속 클럽 ID",
    example: "club-cuid-abc123",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({
    description: "홍보 이미지 URL",
    example: "https://storage.teamplus.com/promotions/lesson-banner.jpg",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({
    description: "일정 정보",
    example: "매주 월/수 19:30~21:00",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  scheduleInfo?: string;

  @ApiPropertyOptional({
    description: "가격 정보",
    example: "3회 20만원 / 4회 26만원",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  priceInfo?: string;

  @ApiPropertyOptional({
    description: "정원 (명)",
    example: 6,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  capacity?: number;

  @ApiPropertyOptional({
    description: "장소 정보",
    example: "IN CHEON 블랙아이스A",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  venueInfo?: string;

  @ApiPropertyOptional({
    description: "문의 연락처",
    example: "010-1234-5678",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({
    description: "모집 시작일 (ISO 8601)",
    example: "2026-03-20T00:00:00.000Z",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "모집 종료일 (ISO 8601)",
    example: "2026-04-30T23:59:59.000Z",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: "공개 여부",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
