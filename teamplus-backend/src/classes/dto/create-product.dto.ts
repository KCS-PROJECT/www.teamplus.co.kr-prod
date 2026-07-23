import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateClassProductDto {
  @ApiProperty({
    example: "월 8회 수업",
    description: "상품 이름",
  })
  @IsNotEmpty({ message: "상품 이름은 필수입니다." })
  @IsString({ message: "상품 이름은 문자열이어야 합니다." })
  productName!: string;

  @ApiPropertyOptional({
    example: "주 2회 수업 (1개월)",
    description: "상품 설명",
  })
  @IsOptional()
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

  @ApiPropertyOptional({
    example: 0,
    description:
      "발급 크레딧 수량(월 수업 횟수) — 0(기본) = 크레딧 미발급. >0 일 때만 결제 시 발급·출석 차감. 정액(MONTHLY_FIXED)은 무차감 기간제라 표시/정합용으로만 사용하며 출석 회차 게이트에 영향 없음.",
  })
  @IsOptional()
  @IsNumber({}, { message: "발급 크레딧 수량은 숫자여야 합니다." })
  @Min(0, { message: "발급 크레딧 수량은 0회 이상이어야 합니다." })
  sessionsPerMonth?: number;

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

  // [Lifecycle v4.1 §9.2] 월별 패키지 귀속월 — "YYYY-MM". MONTHLY_FIXED 전용.
  //   판매 승인 사이클의 확인 단계(다음 달 복제 생성)에서 전송된다. 생성 후 불변.
  @ApiPropertyOptional({
    example: "2026-08",
    description: "귀속월 (YYYY-MM) — 월별 패키지. 미전송 시 무월(레거시 폴백)",
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "귀속월은 YYYY-MM 형식이어야 합니다.",
  })
  billingMonth?: string;

  // [폐기 예정] "주 N회" 자동 파생(classDays.length) 제거로 신규 전송 없음 —
  //   구 클라이언트 하위호환용으로만 수용. 표시·제약 어디에도 미사용.
  @ApiPropertyOptional({
    example: 2,
    description: "주당 수업 횟수 (deprecated — 신규 미사용, 하위호환 수용만)",
  })
  @IsOptional()
  @IsNumber({}, { message: "주당 수업 횟수는 숫자여야 합니다." })
  @Min(1, { message: "주당 수업 횟수는 1 이상이어야 합니다." })
  sessionsPerWeek?: number;
}
