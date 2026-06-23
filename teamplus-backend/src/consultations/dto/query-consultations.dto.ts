import { IsOptional, IsEnum, IsInt, Min, Max } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ConsultationCategory, ConsultationStatus } from "@prisma/client";

export class QueryConsultationsDto {
  @ApiPropertyOptional({
    description: "상담 상태 필터",
    enum: ConsultationStatus,
  })
  @IsOptional()
  @IsEnum(ConsultationStatus, { message: "유효하지 않은 상담 상태입니다." })
  status?: ConsultationStatus;

  @ApiPropertyOptional({
    description: "상담 카테고리 필터",
    enum: ConsultationCategory,
  })
  @IsOptional()
  @IsEnum(ConsultationCategory, {
    message: "유효하지 않은 상담 카테고리입니다.",
  })
  category?: ConsultationCategory;

  @ApiPropertyOptional({
    description: "페이지 번호 (1부터 시작)",
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "페이지당 항목 수",
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
