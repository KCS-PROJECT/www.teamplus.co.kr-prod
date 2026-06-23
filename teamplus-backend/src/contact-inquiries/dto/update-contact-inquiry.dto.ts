import { ApiProperty } from "@nestjs/swagger";
import { ContactInquiryStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * 도입 상담 신청 수정 DTO (관리자 전용).
 * 상태 변경 및 관리자 처리 메모만 수정 가능.
 */
export class UpdateContactInquiryDto {
  @ApiProperty({
    description: "처리 상태",
    required: false,
    enum: ContactInquiryStatus,
    example: ContactInquiryStatus.IN_PROGRESS,
  })
  @IsOptional()
  @IsEnum(ContactInquiryStatus)
  status?: ContactInquiryStatus;

  @ApiProperty({
    description: "관리자 처리 메모",
    required: false,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminMemo?: string;
}
