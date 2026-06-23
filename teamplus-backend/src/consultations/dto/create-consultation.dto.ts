import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ConsultationCategory } from "@prisma/client";

export class CreateConsultationDto {
  @ApiProperty({ description: "상담 대상 코치 ID" })
  @IsString()
  @IsNotEmpty({ message: "코치 ID는 필수입니다." })
  coachId!: string;

  @ApiPropertyOptional({ description: "상담 대상 자녀 ID (선택)" })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({
    description: "상담 카테고리",
    enum: ConsultationCategory,
    default: ConsultationCategory.GENERAL,
  })
  @IsOptional()
  @IsEnum(ConsultationCategory, {
    message: "유효하지 않은 상담 카테고리입니다.",
  })
  category?: ConsultationCategory;

  @ApiPropertyOptional({
    description: "첫 메시지 (선택, 상담 생성 시 함께 전송)",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "첫 메시지는 500자 이내로 입력해주세요." })
  firstMessage?: string;
}
