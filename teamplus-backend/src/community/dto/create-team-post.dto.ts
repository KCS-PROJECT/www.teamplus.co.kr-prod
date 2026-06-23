import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { ALLOWED_MIME_TYPES } from "@/common/utils/sanitize.util";

export class AttachmentDto {
  @ApiProperty({
    description: "파일 URL",
    example: "https://s3.amazonaws.com/bucket/file.jpg",
  })
  @IsString()
  fileUrl!: string;

  @ApiProperty({ description: "파일명", example: "image.jpg" })
  @IsString()
  fileName!: string;

  @ApiProperty({
    description: "파일 타입 (MIME type)",
    example: "image/jpeg",
    enum: ALLOWED_MIME_TYPES,
  })
  @IsString()
  @IsIn([...ALLOWED_MIME_TYPES], { message: "허용되지 않는 파일 형식입니다." })
  fileType!: string;

  @ApiProperty({ description: "파일 크기 (bytes)", example: 102400 })
  @IsInt()
  @Min(0)
  fileSize!: number;
}

export class CreateTeamPostDto {
  @ApiProperty({
    description: "게시글 제목",
    example: "9월 정규훈련 일정 안내",
  })
  @IsString({ message: "제목은 문자열이어야 합니다." })
  @MaxLength(200, { message: "제목은 200자 이하여야 합니다." })
  title!: string;

  @ApiProperty({
    description: "게시글 내용",
    example: "9월 정규훈련 일정과 레슨비를 안내드립니다.",
    maxLength: 10000,
  })
  @IsString({ message: "내용은 문자열이어야 합니다." })
  @MaxLength(10000, { message: "내용은 10000자 이하여야 합니다." })
  content!: string;

  @ApiPropertyOptional({
    description: "게시글 유형 (announcement|lesson|tournament|friendly|survey)",
    example: "announcement",
  })
  @IsOptional()
  @IsString({ message: "게시글 유형은 문자열이어야 합니다." })
  postType?: string;

  @ApiPropertyOptional({
    description: "대상 레벨/연령 태그 (예: U8, beginner)",
    example: "U10",
  })
  @IsOptional()
  @IsString({ message: "대상 레벨은 문자열이어야 합니다." })
  targetLevel?: string;

  @ApiPropertyOptional({ description: "상단 고정 여부", example: true })
  @IsOptional()
  @IsBoolean({ message: "isPinned는 true/false 값이어야 합니다." })
  isPinned?: boolean;

  @ApiPropertyOptional({ description: "첨부파일 목록", type: [AttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}

export class UpdateTeamPostDto extends PartialType(CreateTeamPostDto) {}
