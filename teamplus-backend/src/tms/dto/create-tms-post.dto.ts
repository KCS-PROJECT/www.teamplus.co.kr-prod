import {
  IsString,
  IsOptional,
  IsIn,
  IsEmail,
  IsDateString,
  MaxLength,
  IsArray,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTmsPostDto {
  @ApiProperty({ description: "제목", example: "홈 화면 레이아웃 수정 요청" })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: "상세 내용",
    example: "홈 화면 상단 배너 크기 조정 필요",
  })
  @IsString()
  content!: string;

  @ApiProperty({
    description: "플랫폼",
    enum: ["web", "app", "admin", "backend", "other"],
    default: "web",
  })
  @IsIn(["web", "app", "admin", "backend", "other"])
  @IsOptional()
  platform?: string;

  @ApiProperty({
    description: "카테고리",
    enum: ["bug", "feature", "improvement", "design", "other"],
    default: "bug",
  })
  @IsIn(["bug", "feature", "improvement", "design", "other"])
  @IsOptional()
  category?: string;

  @ApiProperty({
    description: "우선순위",
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  })
  @IsIn(["low", "medium", "high", "critical"])
  @IsOptional()
  priority?: string;

  @ApiProperty({ description: "작성자 이름", example: "김기획" })
  @IsString()
  @MaxLength(50)
  authorName!: string;

  @ApiPropertyOptional({ description: "작성자 이메일" })
  @IsEmail()
  @IsOptional()
  authorEmail?: string;

  @ApiPropertyOptional({ description: "담당자 이름" })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  assignee?: string;

  @ApiPropertyOptional({ description: "마감일 (YYYY-MM-DD)" })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({
    description: "첨부파일 ID 목록 (업로드 후 받은 ID)",
    type: [String],
  })
  @IsArray()
  @IsOptional()
  attachmentIds?: string[];
}

export class CreateTmsCommentDto {
  @ApiProperty({ description: "댓글 작성자 이름", example: "박개발" })
  @IsString()
  @MaxLength(50)
  authorName!: string;

  @ApiProperty({ description: "댓글 내용" })
  @IsString()
  content!: string;
}

export class UpdateTmsStatusDto {
  @ApiProperty({
    description: "변경할 상태",
    enum: ["todo", "in_progress", "review", "done", "rejected"],
  })
  @IsIn(["todo", "in_progress", "review", "done", "rejected"])
  status!: string;
}
