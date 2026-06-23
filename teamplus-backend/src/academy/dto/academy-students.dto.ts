import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class GetClassesSummaryQueryDto {
  @ApiPropertyOptional({
    description: "수업 상태 필터",
    enum: ["active", "ended", "all"],
    default: "all",
  })
  @IsOptional()
  @IsString()
  status?: "active" | "ended" | "all";

  @ApiPropertyOptional({
    description: "정렬 기준",
    enum: ["enrollment_count", "recent", "name"],
    default: "recent",
  })
  @IsOptional()
  @IsString()
  sort?: "enrollment_count" | "recent" | "name";

  @ApiPropertyOptional({ description: "페이지 번호", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "페이지당 개수", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class SearchAcademyStudentsQueryDto {
  @ApiPropertyOptional({ description: "검색어 (학생명 또는 학부모명)" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "페이지 번호", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "페이지당 개수", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class GetAcademyStudentsQueryDto {
  @ApiPropertyOptional({
    description: "검색어 (학생명 또는 학부모명). 없으면 전체 학생",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "정렬 방식",
    enum: ["recent", "name"],
    default: "recent",
  })
  @IsOptional()
  @IsString()
  sort?: "recent" | "name";

  @ApiPropertyOptional({ description: "페이지 번호", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: "페이지당 개수", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class GetClassStudentsQueryDto {
  @ApiPropertyOptional({
    description: "수강생 상태 필터",
    enum: ["paid", "pending", "all"],
    default: "all",
  })
  @IsOptional()
  @IsString()
  status?: "paid" | "pending" | "all";

  @ApiPropertyOptional({
    description: "정렬 기준",
    enum: ["recent", "oldest", "name"],
    default: "recent",
  })
  @IsOptional()
  @IsString()
  sort?: "recent" | "oldest" | "name";

  @ApiPropertyOptional({ description: "학생명 검색어" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "페이지 번호", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "페이지당 개수", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
