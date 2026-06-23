import { IsOptional, IsEnum } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { ConsultationCategory, ConsultationStatus } from "@prisma/client";

export class UpdateConsultationDto {
  @ApiPropertyOptional({
    description: "상담 카테고리 변경",
    enum: ConsultationCategory,
  })
  @IsOptional()
  @IsEnum(ConsultationCategory, {
    message: "유효하지 않은 상담 카테고리입니다.",
  })
  category?: ConsultationCategory;

  @ApiPropertyOptional({
    description: "상담 상태 변경",
    enum: ConsultationStatus,
  })
  @IsOptional()
  @IsEnum(ConsultationStatus, { message: "유효하지 않은 상담 상태입니다." })
  status?: ConsultationStatus;
}
