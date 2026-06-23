import { IsEnum, IsOptional, IsInt, Min, Max } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { WishlistTargetType } from "./add-wishlist.dto";

export class QueryWishlistDto {
  @ApiPropertyOptional({
    description: "필터링할 대상 타입",
    enum: WishlistTargetType,
  })
  @IsOptional()
  @IsEnum(WishlistTargetType, {
    message: "유효한 대상 타입을 입력해주세요.",
  })
  type?: WishlistTargetType;

  @ApiPropertyOptional({
    description: "페이지 번호 (1부터 시작)",
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "페이지 번호는 정수여야 합니다." })
  @Min(1, { message: "페이지 번호는 1 이상이어야 합니다." })
  page?: number = 1;

  @ApiPropertyOptional({
    description: "페이지당 항목 수",
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "페이지 크기는 정수여야 합니다." })
  @Min(1, { message: "페이지 크기는 1 이상이어야 합니다." })
  @Max(100, { message: "페이지 크기는 100 이하여야 합니다." })
  pageSize?: number = 20;
}
