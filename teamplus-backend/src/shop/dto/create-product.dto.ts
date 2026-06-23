import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  IsUrl,
} from "class-validator";
import { Type } from "class-transformer";

export class ProductImageDto {
  @ApiProperty({ description: "이미지 URL (로컬 업로드 경로 또는 외부 URL)" })
  @IsString()
  imageUrl!: string;

  @ApiPropertyOptional({ description: "이미지 대체 텍스트" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;

  @ApiProperty({ description: "대표 이미지 여부", default: false })
  @IsBoolean()
  isMain!: boolean;

  @ApiProperty({ description: "표시 순서", default: 0 })
  @IsNumber()
  @Min(0)
  displayOrder!: number;
}

export class ProductOptionDto {
  @ApiProperty({ description: "옵션명 (예: 사이즈, 색상)" })
  @IsString()
  @MaxLength(50)
  optionName!: string;

  @ApiProperty({ description: "옵션값 (예: L, 검정)" })
  @IsString()
  @MaxLength(100)
  optionValue!: string;

  @ApiProperty({ description: "추가 금액", default: 0 })
  @IsNumber()
  @Min(0)
  additionalPrice!: number;

  @ApiProperty({ description: "옵션별 재고", default: 0 })
  @IsNumber()
  @Min(0)
  stock!: number;

  @ApiProperty({ description: "활성화 여부", default: true })
  @IsBoolean()
  isActive!: boolean;
}

export class CreateProductDto {
  @ApiProperty({ description: "카테고리 ID" })
  @IsString()
  categoryId!: string;

  @ApiProperty({ description: "상품명" })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: "상품 코드 (SKU)" })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({ description: "상품 설명" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: "정상가 (원)" })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ description: "할인가 (원)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ description: "원가 (원)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiProperty({ description: "재고 수량", default: 0 })
  @IsNumber()
  @Min(0)
  stock!: number;

  @ApiProperty({ description: "최소 주문 수량", default: 1 })
  @IsNumber()
  @Min(1)
  minOrderQty!: number;

  @ApiPropertyOptional({ description: "최대 주문 수량" })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxOrderQty?: number;

  @ApiPropertyOptional({ description: "브랜드" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ description: "제조사" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  manufacturer?: string;

  @ApiPropertyOptional({ description: "원산지" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  origin?: string;

  @ApiPropertyOptional({ description: "무게 (g)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiProperty({ description: "활성화 여부", default: true })
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty({ description: "추천 상품 여부", default: false })
  @IsBoolean()
  isFeatured!: boolean;

  @ApiProperty({ description: "신상품 여부", default: false })
  @IsBoolean()
  isNew!: boolean;

  @ApiPropertyOptional({ description: "상품 이미지 목록" })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @ApiPropertyOptional({ description: "상품 옵션 목록" })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDto)
  options?: ProductOptionDto[];
}

export class UpdateProductDto extends CreateProductDto {}

export class AddImageUrlDto {
  @ApiProperty({ description: "외부 이미지 URL" })
  @IsUrl()
  imageUrl!: string;

  @ApiPropertyOptional({ description: "이미지 대체 텍스트" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;
}
