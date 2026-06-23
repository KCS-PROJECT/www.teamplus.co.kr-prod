import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  ValidateNested,
  IsEnum,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum OrderStatus {
  PENDING = "pending",
  PAID = "paid",
  PREPARING = "preparing",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

export class OrderItemDto {
  @ApiProperty({
    description: "상품 ID",
    example: "product-uuid",
  })
  @IsString()
  productId!: string;

  @ApiProperty({
    description: "수량",
    example: 2,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    description: "상품 옵션 (사이즈, 색상 등)",
    example: { size: "M", color: "black" },
  })
  @IsOptional()
  options?: Record<string, string>;
}

export class ShippingAddressDto {
  @ApiProperty({ description: "수령인 이름", example: "홍길동" })
  @IsString()
  recipientName!: string;

  @ApiProperty({ description: "연락처", example: "010-1234-5678" })
  @IsString()
  phone!: string;

  @ApiProperty({ description: "우편번호", example: "12345" })
  @IsString()
  postalCode!: string;

  @ApiProperty({
    description: "기본 주소",
    example: "서울시 강남구 테헤란로 123",
  })
  @IsString()
  address!: string;

  @ApiPropertyOptional({ description: "상세 주소", example: "101동 1001호" })
  @IsOptional()
  @IsString()
  addressDetail?: string;

  @ApiPropertyOptional({
    description: "배송 메모",
    example: "문 앞에 놓아주세요",
  })
  @IsOptional()
  @IsString()
  deliveryMemo?: string;
}

export class CreateOrderDto {
  @ApiProperty({
    description: "주문 상품 목록",
    type: [OrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiProperty({
    description: "배송지 정보",
    type: ShippingAddressDto,
  })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @ApiPropertyOptional({
    description: "주문 메모",
    example: "선물 포장 부탁드립니다",
  })
  @IsOptional()
  @IsString()
  orderMemo?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: "주문 상태",
    enum: OrderStatus,
    example: OrderStatus.SHIPPED,
  })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({
    description: "운송장 번호",
    example: "1234567890",
  })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({
    description: "택배사 코드",
    example: "CJ",
  })
  @IsOptional()
  @IsString()
  courierCode?: string;

  @ApiPropertyOptional({
    description: "상태 변경 메모",
    example: "고객 요청으로 배송 보류",
  })
  @IsOptional()
  @IsString()
  note?: string;
}
