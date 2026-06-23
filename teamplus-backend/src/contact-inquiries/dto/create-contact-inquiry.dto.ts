import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Equals,
} from "class-validator";

/**
 * 도입 상담 신청 생성 DTO (공개 제출).
 *
 * teamplus-home 의 ContactForm 이 호출한다.
 * 모든 문자열 필드는 service 단에서 sanitizeStrict 로 XSS 살균된다.
 */
export class CreateContactInquiryDto {
  @ApiProperty({ description: "클럽명/단체명", maxLength: 120, example: "강남 아이스하키 클럽" })
  @IsString()
  @IsNotEmpty({ message: "단체명을 입력해주세요." })
  @MaxLength(120)
  organizationName!: string;

  @ApiProperty({ description: "담당자 성함", maxLength: 60, example: "홍길동" })
  @IsString()
  @IsNotEmpty({ message: "담당자 성함을 입력해주세요." })
  @MaxLength(60)
  managerName!: string;

  @ApiProperty({ description: "이메일", example: "manager@example.com" })
  @IsEmail({}, { message: "유효한 이메일 주소를 입력해주세요." })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ description: "연락처", maxLength: 30, example: "010-1234-5678" })
  @IsString()
  @IsNotEmpty({ message: "연락처를 입력해주세요." })
  @MaxLength(30)
  phone!: string;

  @ApiProperty({
    description: "관심 플랜",
    required: false,
    enum: ["starter", "business", "enterprise", "undecided"],
    example: "business",
  })
  @IsOptional()
  @IsIn(["starter", "business", "enterprise", "undecided"])
  interestedPlan?: string;

  @ApiProperty({
    description: "클럽 규모",
    required: false,
    maxLength: 30,
    example: "50-150명",
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  clubSize?: string;

  @ApiProperty({
    description: "문의 내용",
    required: false,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiProperty({
    description: "개인정보 수집·이용 동의 (필수 true)",
    example: true,
  })
  @IsBoolean()
  @Equals(true, { message: "개인정보 수집·이용에 동의해주세요." })
  privacyAgreed!: boolean;
}
