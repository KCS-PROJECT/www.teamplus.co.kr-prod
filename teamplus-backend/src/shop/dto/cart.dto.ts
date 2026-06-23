import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AddToCartDto {
  @ApiProperty({
    description: "상품 ID",
    example: "product-cuid",
  })
  @IsString()
  productId!: string;

  @ApiPropertyOptional({
    description: "상품 옵션 ID",
    example: "option-cuid",
  })
  @IsOptional()
  @IsString()
  optionId?: string;

  @ApiProperty({
    description: "수량",
    example: 1,
    minimum: 1,
    maximum: 99,
  })
  @IsNumber()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({
    description: "수량",
    example: 2,
    minimum: 1,
    maximum: 99,
  })
  @IsNumber()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class MergeCartItemDto {
  @ApiProperty({
    description: "상품 ID",
    example: "product-cuid",
  })
  @IsString()
  productId!: string;

  @ApiPropertyOptional({
    description: "상품 옵션 ID",
    example: "option-cuid",
  })
  @IsOptional()
  @IsString()
  optionId?: string;

  @ApiProperty({
    description: "수량",
    example: 1,
    minimum: 1,
    maximum: 99,
  })
  @IsNumber()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class MergeCartDto {
  @ApiProperty({
    description: "로컬 장바구니 상품 목록",
    type: [MergeCartItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MergeCartItemDto)
  items!: MergeCartItemDto[];
}
