import { IsEnum, IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * WishlistTargetType enum (Prisma schema와 동기화)
 */
export enum WishlistTargetType {
  PRODUCT = "PRODUCT",
  CLUB = "CLUB",
  ACADEMY = "ACADEMY",
  COACH = "COACH",
  CLASS = "CLASS",
  TOURNAMENT = "TOURNAMENT",
  VENUE = "VENUE",
  OTHER = "OTHER",
}

export class AddWishlistDto {
  @ApiProperty({
    description: "찜 대상 타입",
    enum: WishlistTargetType,
    example: WishlistTargetType.PRODUCT,
  })
  @IsEnum(WishlistTargetType, {
    message:
      "유효한 대상 타입을 입력해주세요. (PRODUCT, CLUB, ACADEMY, COACH, CLASS, TOURNAMENT, VENUE, OTHER)",
  })
  @IsNotEmpty({ message: "대상 타입은 필수입니다." })
  targetType!: WishlistTargetType;

  @ApiProperty({
    description: "찜 대상 리소스 ID",
    example: "clxyz12345",
  })
  @IsString({ message: "대상 ID는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "대상 ID는 필수입니다." })
  targetId!: string;
}
