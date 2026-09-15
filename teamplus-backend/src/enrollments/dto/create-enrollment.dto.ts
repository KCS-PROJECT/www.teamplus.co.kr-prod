import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 수강신청 생성 DTO
 *
 * 두 가지 방식 지원:
 * 1. parent_direct: 학부모가 직접 수강신청 (requestType 생략 또는 'parent_direct')
 * 2. child_request: 자녀가 수강 요청 → 학부모 승인 필요 (requestType = 'child_request')
 */
export class CreateEnrollmentDto {
  @ApiProperty({
    description: "수강할 자녀 ID",
    example: "clxyz123abc",
  })
  @IsString()
  @IsNotEmpty({ message: "자녀 ID를 입력해주세요." })
  childId!: string;

  @ApiProperty({
    description: "신청할 수업 ID",
    example: "clxyz456def",
  })
  @IsString()
  @IsNotEmpty({ message: "수업 ID를 입력해주세요." })
  classId!: string;

  @ApiPropertyOptional({
    description: "선택한 상품 ID (월정액 등)",
    example: "clxyz789ghi",
  })
  @IsOptional()
  @IsString()
  classProductId?: string;

  @ApiPropertyOptional({
    description:
      "신청 유형 (parent_direct: 학부모 직접 신청, child_request: 자녀 요청)",
    example: "parent_direct",
    enum: ["parent_direct", "child_request"],
    default: "parent_direct",
  })
  @IsOptional()
  @IsEnum(["parent_direct", "child_request"], {
    message: "신청 유형은 parent_direct 또는 child_request이어야 합니다.",
  })
  requestType?: string;

  @ApiPropertyOptional({
    description: "메모/특이사항",
    example: "화요일 수업 선호합니다.",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "메모는 500자 이하이어야 합니다." })
  note?: string;

  // [Phase 3] 후불 신청 대상월 — 판매 중인 달(이번 달·다음 달) 중 학부모가 선택.
  //   선불은 상품 자체가 월을 고정하므로 이 필드를 보내면 400. 미전달 시
  //   판매 중인 달 중 가장 이른 달(saleGate.primaryMonth)로 폴백한다.
  @ApiPropertyOptional({
    description:
      "후불 신청 대상월(YYYY-MM). 선불 수업은 지정 불가(400) — 상품 자체가 귀속월을 고정한다. 미전달 시 판매 중인 달 중 가장 이른 달로 자동 결정.",
    example: "2026-09",
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "결제 대상월은 YYYY-MM 형식이어야 합니다.",
  })
  billingMonth?: string;
}
