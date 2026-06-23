import { IsNumber, IsOptional, IsString, IsBoolean, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * UpdateClassProductDto (2026-05-22 신규) — 수업 패키지 부분 수정.
 *
 * 모든 필드 optional. classId 는 path param 으로 전달되므로 DTO 에 미포함.
 * isActive 가 false 면 GET 응답에 disabledReason="비활성 패키지" 로 표시됨.
 */
export class UpdateClassProductDto {
  @ApiPropertyOptional({ example: "주 2회 4주 정기권", description: "상품 이름" })
  @IsOptional()
  @IsString({ message: "상품 이름은 문자열이어야 합니다." })
  productName?: string;

  @ApiPropertyOptional({ example: "주 2회 수업, 4주 유효", description: "상품 설명" })
  @IsOptional()
  @IsString({ message: "상품 설명은 문자열이어야 합니다." })
  description?: string;

  @ApiPropertyOptional({ example: 280000, description: "가격 (원)" })
  @IsOptional()
  @IsNumber({}, { message: "가격은 숫자여야 합니다." })
  @Min(0, { message: "가격은 0원 이상이어야 합니다." })
  price?: number;

  @ApiPropertyOptional({ example: 8, description: "월 수업 횟수" })
  @IsOptional()
  @IsNumber({}, { message: "월 수업 횟수는 숫자여야 합니다." })
  @Min(1, { message: "월 수업 횟수는 1회 이상이어야 합니다." })
  sessionsPerMonth?: number;

  @ApiPropertyOptional({ example: 28, description: "유효 기간 (일)" })
  @IsOptional()
  @IsNumber({}, { message: "유효 기간은 숫자여야 합니다." })
  @Min(1, { message: "유효 기간은 1일 이상이어야 합니다." })
  durationDays?: number;

  @ApiPropertyOptional({ example: 2, description: "주당 수업 횟수" })
  @IsOptional()
  @IsNumber({}, { message: "주당 수업 횟수는 숫자여야 합니다." })
  @Min(1, { message: "주당 수업 횟수는 1회 이상이어야 합니다." })
  sessionsPerWeek?: number;

  @ApiPropertyOptional({ example: 35000, description: "회당 단가 (원)" })
  @IsOptional()
  @IsNumber({}, { message: "회당 단가는 숫자여야 합니다." })
  @Min(0, { message: "회당 단가는 0원 이상이어야 합니다." })
  feePerSession?: number;

  @ApiPropertyOptional({ example: true, description: "활성 여부 (false = 결제·노출 차단)" })
  @IsOptional()
  @IsBoolean({ message: "활성 여부는 boolean 이어야 합니다." })
  isActive?: boolean;

  // 2026-05-22 옵션 H — feeType 변경 가능 (1회권 ↔ 정기권). 보통 미사용.
  @ApiPropertyOptional({
    example: "MONTHLY_FIXED",
    description: "결제 방식 — PER_SESSION | MONTHLY_FIXED",
  })
  @IsOptional()
  @IsString({ message: "결제 방식은 문자열이어야 합니다." })
  feeType?: string;
}
