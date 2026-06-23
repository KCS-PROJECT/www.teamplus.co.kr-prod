import { ApiProperty } from "@nestjs/swagger";
import { ContactInquiryStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

/**
 * 도입 상담 신청 목록 조회 쿼리 DTO (관리자 전용).
 */
export class QueryContactInquiriesDto {
  @ApiProperty({
    description: "페이지 번호 (기본 1)",
    required: false,
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: "페이지당 항목 수 (기본 20, 최대 100)",
    required: false,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiProperty({
    description: "처리 상태 필터",
    required: false,
    enum: ContactInquiryStatus,
  })
  @IsOptional()
  @IsEnum(ContactInquiryStatus)
  status?: ContactInquiryStatus;

  @ApiProperty({
    description: "검색어 (조직명/담당자/이메일/전화 부분일치)",
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
