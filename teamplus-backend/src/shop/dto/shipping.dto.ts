import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateShippingPolicyDto {
  @ApiProperty({
    description: "배송 정책 이름",
    example: "기본 배송",
  })
  @IsString()
  name!: string;

  @ApiProperty({
    description: "배송비",
    example: 3000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  shippingFee!: number;

  @ApiPropertyOptional({
    description: "무료 배송 최소 금액",
    example: 50000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeShippingThreshold?: number;

  @ApiPropertyOptional({
    description: "지역별 추가 배송비 (제주, 도서산간)",
    example: 3000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  additionalFee?: number;

  @ApiPropertyOptional({
    description: "배송 예상 일수",
    example: "2-3",
  })
  @IsOptional()
  @IsString()
  estimatedDays?: string;

  @ApiPropertyOptional({
    description: "기본 배송 정책 여부",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    description: "활성화 여부",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateShippingPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeShippingThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  additionalFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  estimatedDays?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CourierDto {
  @ApiProperty({
    description: "택배사 코드",
    example: "CJ",
  })
  @IsString()
  code!: string;

  @ApiProperty({
    description: "택배사 이름",
    example: "CJ대한통운",
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: "배송 추적 URL 패턴",
    example:
      "https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo={trackingNumber}",
  })
  @IsOptional()
  @IsString()
  trackingUrlPattern?: string;
}
