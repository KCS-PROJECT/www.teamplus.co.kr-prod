import {
  IsString,
  IsOptional,
  IsIn,
  IsEmail,
  IsDateString,
  MaxLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateTmsPostDto {
  @ApiPropertyOptional({ description: "제목" })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: "상세 내용" })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({
    description: "플랫폼",
    enum: ["web", "app", "admin", "backend", "other"],
  })
  @IsIn(["web", "app", "admin", "backend", "other"])
  @IsOptional()
  platform?: string;

  @ApiPropertyOptional({
    description: "카테고리",
    enum: ["bug", "feature", "improvement", "design", "other"],
  })
  @IsIn(["bug", "feature", "improvement", "design", "other"])
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: "우선순위",
    enum: ["low", "medium", "high", "critical"],
  })
  @IsIn(["low", "medium", "high", "critical"])
  @IsOptional()
  priority?: string;

  @ApiPropertyOptional({
    description: "상태",
    enum: ["todo", "in_progress", "review", "done", "rejected"],
  })
  @IsIn(["todo", "in_progress", "review", "done", "rejected"])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: "작성자 이름" })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  authorName?: string;

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
}
