import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsInt, Min, Max, IsString, IsIn } from "class-validator";
import { Type } from "class-transformer";

/**
 * 공통 페이지네이션 쿼리 DTO
 *
 * Controller에서 @Query() 대신 이 DTO를 사용하면
 * - 자동 타입 변환 (string → number)
 * - Swagger 문서 자동 생성
 * - Validation 일관성 보장
 *
 * @example
 * @Get()
 * async findAll(@Query() query: PaginationQueryDto) {
 *   // query.page: number (기본 1)
 *   // query.limit: number (기본 20)
 * }
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: "페이지 번호", default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "페이지 번호는 정수여야 합니다." })
  @Min(1, { message: "페이지 번호는 1 이상이어야 합니다." })
  page: number = 1;

  @ApiPropertyOptional({
    description: "페이지당 항목 수",
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "항목 수는 정수여야 합니다." })
  @Min(1, { message: "항목 수는 1 이상이어야 합니다." })
  @Max(100, { message: "항목 수는 100 이하여야 합니다." })
  limit: number = 20;

  @ApiPropertyOptional({ description: "정렬 기준 필드" })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: "정렬 방향",
    enum: ["asc", "desc"],
    default: "desc",
  })
  @IsOptional()
  @IsIn(["asc", "desc"], { message: "정렬 방향은 asc 또는 desc여야 합니다." })
  sortOrder?: "asc" | "desc" = "desc";

  /** Prisma skip 계산 헬퍼 */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/**
 * 검색 기능이 포함된 페이지네이션 DTO
 */
export class SearchPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "검색어" })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * 커서 기반 페이지네이션 쿼리 DTO
 *
 * 무한 스크롤 / 실시간 피드(공지, 알림, 채팅) 처럼 offset 기반 페이지네이션이
 * 성능·정합성 측면에서 불리한 경우 사용한다. 마지막 항목의 id 를 cursor 로
 * 전달하면 backend 가 `where: { id: { lt: cursor } }` 또는 createdAt 기반으로
 * 다음 페이지를 반환한다.
 *
 * @example
 * @Get('feed')
 * async getFeed(@Query() query: CursorPaginationQueryDto) {
 *   return this.service.findFeed(query.cursor, query.limit);
 * }
 */
export class CursorPaginationQueryDto {
  @ApiPropertyOptional({
    description: "커서 (마지막 항목 id 또는 timestamp)",
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: "페이지당 항목 수",
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "항목 수는 정수여야 합니다." })
  @Min(1, { message: "항목 수는 1 이상이어야 합니다." })
  @Max(100, { message: "항목 수는 100 이하여야 합니다." })
  limit: number = 20;

  @ApiPropertyOptional({
    description: "정렬 방향",
    enum: ["asc", "desc"],
    default: "desc",
  })
  @IsOptional()
  @IsIn(["asc", "desc"], { message: "정렬 방향은 asc 또는 desc여야 합니다." })
  sortOrder?: "asc" | "desc" = "desc";
}

/**
 * 페이지네이션 응답 메타 정보
 */
export class PaginationMeta {
  @ApiProperty({ description: "현재 페이지" })
  page: number;

  @ApiProperty({ description: "페이지당 항목 수" })
  limit: number;

  @ApiProperty({ description: "전체 항목 수" })
  total: number;

  @ApiProperty({ description: "전체 페이지 수" })
  totalPages: number;

  @ApiProperty({ description: "다음 페이지 존재 여부" })
  hasNext: boolean;

  @ApiProperty({ description: "이전 페이지 존재 여부" })
  hasPrev: boolean;

  constructor(page: number, limit: number, total: number) {
    this.page = page;
    this.limit = limit;
    this.total = total;
    this.totalPages = Math.ceil(total / limit);
    this.hasNext = page < this.totalPages;
    this.hasPrev = page > 1;
  }
}

/**
 * 페이지네이션 응답 생성 헬퍼
 *
 * @example
 * const [items, total] = await Promise.all([
 *   this.prisma.user.findMany({ skip: query.skip, take: query.limit }),
 *   this.prisma.user.count(),
 * ]);
 * return createPaginatedResponse(items, query.page, query.limit, total);
 */
export function createPaginatedResponse<T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
) {
  return {
    items,
    ...new PaginationMeta(page, limit, total),
  };
}
