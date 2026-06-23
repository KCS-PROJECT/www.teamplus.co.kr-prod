import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
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

  // 2026-05-19: billingMonth 필드 폐기.
  // 사유: 학부모별 결제일(N주 패키지 만료일)이 모두 다르므로 "월 단위 결제 대상"
  //       개념 자체가 시스템에서 의미가 없음. 만료 임박 시 학부모별 알림으로 대체.
}
