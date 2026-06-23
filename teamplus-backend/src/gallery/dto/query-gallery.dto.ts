import { IsOptional, IsString, IsInt, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

/**
 * 갤러리 목록 조회 쿼리 DTO.
 */
export class QueryGalleryDto {
  @ApiProperty({
    description: "클럽 ID 필터 (선택)",
    required: false,
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({
    description: "카테고리 필터 (선택)",
    example: "TRAINING",
    required: false,
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({
    description: "공개 범위 필터 (선택)",
    example: "PUBLIC",
    required: false,
  })
  @IsOptional()
  @IsString()
  visibility?: string;

  @ApiProperty({
    description: "페이지 번호 (기본 1)",
    example: 1,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: "페이지당 항목 수 (기본 20)",
    example: 20,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
