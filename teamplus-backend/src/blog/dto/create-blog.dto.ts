import { ApiProperty } from "@nestjs/swagger";
import { BlogCategory, BlogStatus } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * 블로그 글 생성 DTO (관리자 전용).
 *
 * content 는 리치텍스트(HTML) — service 단에서 sanitizeBlogHtml 로 살균된다.
 * title/summary 는 sanitizeStrict 로 태그 제거된다.
 */
export class CreateBlogDto {
  @ApiProperty({ description: "제목", maxLength: 200, example: "팀플러스 2026 봄 시즌 오픈" })
  @IsString()
  @IsNotEmpty({ message: "제목을 입력해주세요." })
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: "목록 카드 요약", maxLength: 500 })
  @IsString()
  @IsNotEmpty({ message: "요약을 입력해주세요." })
  @MaxLength(500)
  summary!: string;

  @ApiProperty({ description: "본문 (리치텍스트 HTML)", maxLength: 100000 })
  @IsString()
  @IsNotEmpty({ message: "본문을 입력해주세요." })
  @MaxLength(100000)
  content!: string;

  @ApiProperty({
    description: "카테고리",
    enum: BlogCategory,
    required: false,
    default: BlogCategory.NEWS,
  })
  @IsOptional()
  @IsEnum(BlogCategory)
  category?: BlogCategory;

  @ApiProperty({
    description: "커버(썸네일) 이미지 URL — /files/upload 반환값",
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @ApiProperty({
    description: "상태 (DRAFT=임시저장, PUBLISHED=발행)",
    enum: BlogStatus,
    required: false,
    default: BlogStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(BlogStatus)
  status?: BlogStatus;

  @ApiProperty({ description: "상단 고정", required: false, default: false })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
