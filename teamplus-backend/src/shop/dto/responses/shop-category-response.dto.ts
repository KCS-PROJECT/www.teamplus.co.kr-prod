import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 쇼핑몰 카테고리 응답 DTO — 계층 트리 구조 (최대 4depth)
 *
 * `getCategoryTree()` 에서 사용. include 전체 로드 대신 매퍼/Select 상수로
 * 필요한 필드만 노출하여 over-fetching 을 제거.
 *
 * 동기화 기준: `SHOP_CATEGORY_TREE_SELECT` (shop.service.ts)
 *
 * Dual emit 이력 (완료):
 * - 2026-05-20 T3 라운드 2: admin 호환 위해 `depth`/`sortOrder` dual emit 도입.
 * - 2026-05-20 Phase 6: admin 페이지를 `c.level`/`c.displayOrder` (canonical) 로 마이그레이션.
 * - 2026-05-20 Phase C-D: alias `depth`/`sortOrder` 완전 제거 — canonical only.
 */
export class ShopCategoryResponseDto {
  @ApiProperty({ description: "카테고리 ID (cuid)", example: "clx12abcd" })
  id!: string;

  @ApiProperty({ description: "카테고리명", example: "스케이트" })
  name!: string;

  @ApiProperty({
    description: "계층 레벨 (1: 대분류 ~ 4: 세분류)",
    example: 1,
  })
  level!: number;

  @ApiProperty({
    description: "상위 카테고리 ID (최상위는 null)",
    example: null,
    nullable: true,
    type: String,
  })
  parentId!: string | null;

  @ApiProperty({
    description: "정렬 순서 (오름차순)",
    example: 0,
  })
  displayOrder!: number;

  @ApiPropertyOptional({
    description: "카테고리 설명",
    example: "아이스하키 장비 카테고리",
    type: String,
  })
  description?: string;

  @ApiProperty({
    description: "활성화 여부",
    example: true,
  })
  isActive!: boolean;

  @ApiPropertyOptional({
    description: "하위 카테고리 (재귀 · 최대 4depth)",
    type: () => [ShopCategoryResponseDto],
  })
  children?: ShopCategoryResponseDto[];
}
