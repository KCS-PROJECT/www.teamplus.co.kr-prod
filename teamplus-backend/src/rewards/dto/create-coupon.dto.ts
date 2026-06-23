import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsEnum,
  Min,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateCouponDto {
  @ApiProperty({ description: "쿠폰 코드", example: "STICKER-REWARD-001" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ description: "쿠폰명", example: "스티커판 완성 보상 쿠폰" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: "쿠폰 설명" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: "할인 유형",
    enum: ["FIXED", "PERCENTAGE"],
    example: "FIXED",
  })
  @IsEnum(["FIXED", "PERCENTAGE"], {
    message: "할인 유형은 FIXED 또는 PERCENTAGE여야 합니다.",
  })
  discountType!: string;

  @ApiProperty({ description: "할인 금액/비율", example: 5000 })
  @IsInt()
  @Min(1)
  discountValue!: number;

  @ApiPropertyOptional({ description: "최소 주문금액" })
  @IsOptional()
  @IsInt()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ description: "최대 할인금액" })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ description: "전체 사용 제한 수" })
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ description: "1인당 사용 제한", default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  usagePerUser?: number;

  @ApiProperty({
    description: "사용 시작일",
    example: "2026-04-13T00:00:00.000Z",
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    description: "사용 종료일",
    example: "2026-12-31T23:59:59.000Z",
  })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ description: "활성화 여부", default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
