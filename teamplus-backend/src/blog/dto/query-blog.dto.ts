import { ApiProperty } from "@nestjs/swagger";
import { BlogCategory, BlogStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/**
 * 블로그 목록 조회 쿼리 DTO.
 * - 공개(/blog): page/pageSize/category 만 유효, status 는 service 에서 PUBLISHED 로 강제.
 * - 관리(/blog/admin/list): status/search 포함 전체 필터.
 */
export class QueryBlogDto {
  @ApiProperty({
    description: "페이지 번호 (기본 1)",
    required: false,
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: "페이지당 항목 수 (기본 12, 최대 100)",
    required: false,
    minimum: 1,
    maximum: 100,
    example: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiProperty({ description: "카테고리 필터", required: false, enum: BlogCategory })
  @IsOptional()
  @IsEnum(BlogCategory)
  category?: BlogCategory;

  @ApiProperty({
    description: "상태 필터 (관리자 전용 — 공개 목록에서는 무시)",
    required: false,
    enum: BlogStatus,
  })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @ApiProperty({
    description: "검색어 (제목/요약 부분일치)",
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
