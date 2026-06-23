import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 일괄 처리 단위 패키지 항목.
 *  - id 없음 → 신규 생성(create)
 *  - id 있음 → 기존 패키지 수정(update)
 */
export class BulkClassProductItemDto {
  @ApiPropertyOptional({
    example: "product-cuid",
    description: "패키지 ID. 없으면 신규 생성, 있으면 기존 패키지 수정.",
  })
  @IsOptional()
  @IsString({ message: "패키지 ID는 문자열이어야 합니다." })
  id?: string;

  @ApiProperty({ example: "주 2회 4주 정기권", description: "상품 이름" })
  @IsNotEmpty({ message: "상품 이름은 필수입니다." })
  @IsString({ message: "상품 이름은 문자열이어야 합니다." })
  productName!: string;

  @ApiProperty({ example: 240000, description: "가격 (원)" })
  @IsNotEmpty({ message: "가격은 필수입니다." })
  @IsNumber({}, { message: "가격은 숫자여야 합니다." })
  @Min(0, { message: "가격은 0원 이상이어야 합니다." })
  price!: number;

  @ApiProperty({
    example: "MONTHLY_FIXED",
    enum: ["PER_SESSION", "MONTHLY_FIXED"],
    description: "결제 방식 — PER_SESSION(횟수제) | MONTHLY_FIXED(정기권)",
  })
  @IsNotEmpty({ message: "결제 방식은 필수입니다." })
  @IsString({ message: "결제 방식은 문자열이어야 합니다." })
  @IsIn(["PER_SESSION", "MONTHLY_FIXED"], {
    message: "결제 방식은 PER_SESSION 또는 MONTHLY_FIXED 여야 합니다.",
  })
  feeType!: string;

  @ApiProperty({
    example: 8,
    description: "월 수업 횟수(정기권의 총 회수). 횟수제는 보통 1.",
  })
  @IsNotEmpty({ message: "월 수업 횟수는 필수입니다." })
  @IsNumber({}, { message: "월 수업 횟수는 숫자여야 합니다." })
  @Min(1, { message: "월 수업 횟수는 1회 이상이어야 합니다." })
  sessionsPerMonth!: number;

  @ApiPropertyOptional({
    example: 2,
    description: "주당 수업 횟수 (정기권 검증에 사용).",
  })
  @IsOptional()
  @IsNumber({}, { message: "주당 수업 횟수는 숫자여야 합니다." })
  @Min(1, { message: "주당 수업 횟수는 1회 이상이어야 합니다." })
  sessionsPerWeek?: number;

  @ApiPropertyOptional({ example: 28, description: "유효 기간 (일)" })
  @IsOptional()
  @IsNumber({}, { message: "유효 기간은 숫자여야 합니다." })
  @Min(1, { message: "유효 기간은 1일 이상이어야 합니다." })
  durationDays?: number;

  @ApiPropertyOptional({ example: "주 2회 수업, 4주 유효", description: "상품 설명" })
  @IsOptional()
  @IsString({ message: "상품 설명은 문자열이어야 합니다." })
  description?: string;
}

/**
 * 수업 패키지 일괄 반영 요청.
 *  - upserts: 추가(id 없음) + 수정(id 있음) 대상
 *  - deleteIds: 삭제 대상 패키지 ID 목록 (결제 이력 있으면 soft delete)
 * 전체가 단일 트랜잭션으로 처리되어 부분 반영이 발생하지 않는다.
 */
export class BulkClassProductsDto {
  @ApiProperty({
    type: [BulkClassProductItemDto],
    description: "추가/수정할 패키지 목록 (id 유무로 구분).",
  })
  @IsArray({ message: "upserts는 배열이어야 합니다." })
  @ValidateNested({ each: true })
  @Type(() => BulkClassProductItemDto)
  upserts!: BulkClassProductItemDto[];

  @ApiProperty({
    type: [String],
    example: ["product-cuid-1", "product-cuid-2"],
    description: "삭제할 패키지 ID 목록.",
  })
  @IsArray({ message: "deleteIds는 배열이어야 합니다." })
  @IsString({ each: true, message: "deleteIds 항목은 문자열이어야 합니다." })
  deleteIds!: string[];
}
