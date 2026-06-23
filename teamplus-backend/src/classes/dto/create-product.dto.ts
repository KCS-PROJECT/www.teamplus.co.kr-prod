import { IsNotEmpty, IsString, IsNumber, IsOptional, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateClassProductDto {
  @ApiProperty({
    example: "월 8회 수업",
    description: "상품 이름",
  })
  @IsNotEmpty({ message: "상품 이름은 필수입니다." })
  @IsString({ message: "상품 이름은 문자열이어야 합니다." })
  productName!: string;

  @ApiProperty({
    example: "주 2회 수업 (1개월)",
    description: "상품 설명",
  })
  @IsString({ message: "상품 설명은 문자열이어야 합니다." })
  description?: string;

  @ApiProperty({
    example: 240000,
    description: "가격 (원)",
  })
  @IsNotEmpty({ message: "가격은 필수입니다." })
  @IsNumber({}, { message: "가격은 숫자여야 합니다." })
  @Min(0, { message: "가격은 0원 이상이어야 합니다." })
  price!: number;

  @ApiProperty({
    example: 8,
    description: "월 수업 횟수",
  })
  @IsNotEmpty({ message: "월 수업 횟수는 필수입니다." })
  @IsNumber({}, { message: "월 수업 횟수는 숫자여야 합니다." })
  @Min(1, { message: "월 수업 횟수는 1회 이상이어야 합니다." })
  sessionsPerMonth!: number;

  @ApiProperty({
    example: 30,
    description: "유효 기간 (일)",
    default: 30,
  })
  @IsNumber({}, { message: "유효 기간은 숫자여야 합니다." })
  @Min(1, { message: "유효 기간은 1일 이상이어야 합니다." })
  durationDays?: number = 30;

  // 2026-05-22 옵션 H — PackageEditSheet 자동 변환 결과 반영.
  //   PER_SESSION (1회권) vs MONTHLY_FIXED (정기권) 명시. 미전송 시 백엔드는 기본값 사용.
  @ApiPropertyOptional({
    example: "MONTHLY_FIXED",
    description: "결제 방식 — PER_SESSION | MONTHLY_FIXED | PER_GAME",
  })
  @IsOptional()
  @IsString({ message: "결제 방식은 문자열이어야 합니다." })
  feeType?: string;

  // sessionsPerWeek = 수업 classDays.length (PackageEditSheet 가 자동 입력).
  // 학부모 결제 화면의 "주 N회" 라벨 표시 정합성을 위해 저장.
  @ApiPropertyOptional({
    example: 2,
    description: "주당 수업 횟수 (수업 일정 classDays 수와 일치)",
  })
  @IsOptional()
  @IsNumber({}, { message: "주당 수업 횟수는 숫자여야 합니다." })
  @Min(1, { message: "주당 수업 횟수는 1 이상이어야 합니다." })
  sessionsPerWeek?: number;
}
