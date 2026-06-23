import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateTeamEventDto {
  @ApiProperty({
    description: "이벤트 제목",
    example: "9월 체험 수업",
    maxLength: 200,
  })
  @IsString({ message: "제목은 문자열이어야 합니다." })
  @MaxLength(200, { message: "제목은 200자 이하여야 합니다." })
  title!: string;

  @ApiPropertyOptional({
    description: "이벤트 설명",
    example: "신규 선수 대상 1회 체험 수업입니다.",
    maxLength: 5000,
  })
  @IsOptional()
  @IsString({ message: "설명은 문자열이어야 합니다." })
  @MaxLength(5000, { message: "설명은 5000자 이하여야 합니다." })
  description?: string;

  @ApiProperty({
    description: "이벤트 유형",
    example: "clinic",
    enum: ["clinic", "trial", "tournament", "friendly", "meeting"],
  })
  @IsString({ message: "이벤트 유형은 문자열이어야 합니다." })
  eventType!: string;

  @ApiPropertyOptional({ description: "대상 레벨/연령", example: "U8" })
  @IsOptional()
  @IsString({ message: "대상 레벨은 문자열이어야 합니다." })
  targetLevel?: string;

  @ApiPropertyOptional({ description: "정원 (null 이면 무제한)", example: 20 })
  @IsOptional()
  @IsInt({ message: "정원은 숫자여야 합니다." })
  @Min(1, { message: "정원은 1명 이상이어야 합니다." })
  capacity?: number;

  @ApiProperty({ description: "시작 일시", example: "2026-01-20T09:00:00Z" })
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  startAt!: string;

  @ApiProperty({ description: "종료 일시", example: "2026-01-20T11:00:00Z" })
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  endAt!: string;

  @ApiPropertyOptional({
    description: "가격 모드 (payment|credit|free)",
    example: "payment",
  })
  @IsOptional()
  @IsString({ message: "priceMode는 문자열이어야 합니다." })
  priceMode?: string;

  @ApiPropertyOptional({
    description: "결제 금액 (priceMode=payment일 때)",
    example: 30000,
  })
  @IsOptional()
  @IsInt({ message: "금액은 숫자여야 합니다." })
  @Min(0, { message: "금액은 0 이상이어야 합니다." })
  priceAmount?: number;

  @ApiPropertyOptional({
    description: "상태 (draft|published|closed|cancelled)",
    example: "published",
  })
  @IsOptional()
  @IsString({ message: "상태는 문자열이어야 합니다." })
  status?: string;
}

export class UpdateTeamEventDto extends PartialType(CreateTeamEventDto) {}
