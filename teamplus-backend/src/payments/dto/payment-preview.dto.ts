import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  Min,
  IsDateString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum FeeTypeEnum {
  MONTHLY_FIXED = "MONTHLY_FIXED",
  PER_SESSION = "PER_SESSION",
  PER_GAME = "PER_GAME",
}

export enum BillingTimingEnum {
  PREPAID = "PREPAID",
  POSTPAID = "POSTPAID",
}

export class PaymentPreviewQueryDto {
  @ApiProperty({ description: "수업 상품 ID" })
  @IsString()
  productId!: string;

  @ApiPropertyOptional({
    description: "후결제 시 실제 출석 횟수 (PER_SESSION + POSTPAID 조합)",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  attendanceCount?: number;

  @ApiPropertyOptional({
    description: "후결제 정산 대상 월 (YYYY-MM 형식)",
    example: "2026-02",
  })
  @IsOptional()
  @IsDateString()
  month?: string;
}

export class PaymentPreviewResponseDto {
  @ApiProperty({ description: "결제 방식", enum: FeeTypeEnum })
  feeType!: string;

  @ApiProperty({ description: "결제 시점", enum: BillingTimingEnum })
  billingTiming!: string;

  @ApiProperty({ description: "계산된 결제 금액 (원)" })
  amount!: number;

  @ApiProperty({ description: "금액 계산 설명" })
  description!: string;

  @ApiPropertyOptional({ description: "출석 횟수 (횟수제 후결제 시)" })
  attendanceCount?: number;
}

export class CreateClassProductWithFeeDto {
  @ApiProperty({ description: "수업 ID" })
  @IsString()
  classId!: string;

  @ApiProperty({ description: "상품명" })
  @IsString()
  productName!: string;

  @ApiPropertyOptional({ description: "설명" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: "기본 가격 (원)" })
  @IsInt()
  @Min(0)
  price!: number;

  @ApiProperty({ description: "월 수업 횟수" })
  @IsInt()
  @Min(1)
  sessionsPerMonth!: number;

  @ApiProperty({ description: "수강 기간 (일)", default: 30 })
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiPropertyOptional({
    description: "결제 방식",
    enum: FeeTypeEnum,
    default: FeeTypeEnum.PER_SESSION,
  })
  @IsOptional()
  @IsEnum(FeeTypeEnum)
  feeType?: FeeTypeEnum;

  @ApiPropertyOptional({
    description: "결제 시점",
    enum: BillingTimingEnum,
    default: BillingTimingEnum.PREPAID,
  })
  @IsOptional()
  @IsEnum(BillingTimingEnum)
  billingTiming?: BillingTimingEnum;

  @ApiPropertyOptional({
    description: "주당 수업 횟수 (월정액 계산용)",
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sessionsPerWeek?: number;

  @ApiPropertyOptional({
    description: "회당 수업료 (횟수제/경기당 계산용, 원)",
    example: 70000,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  feePerSession?: number;
}
