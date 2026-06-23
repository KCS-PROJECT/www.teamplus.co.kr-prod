import {
  IsNotEmpty,
  MinLength,
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserType } from "@prisma/client";

export class RegisterDto {
  @ApiProperty({
    example: "hong123",
    description: "아이디 (계정 식별자)",
  })
  @IsString()
  @IsNotEmpty({ message: "아이디를 입력해주세요." })
  email!: string;

  // 본인인증 자동 채움(B안, 2026-05-26) — 클라이언트가 빈 값으로 전송 가능.
  //   · PARENT/COACH/DIRECTOR/ACADEMY_DIRECTOR 는 verification 에서 자동 채움
  //   · 자동 채움 후에도 빈 값이면 register() 가 BadRequestException 발생
  @ApiPropertyOptional({
    example: "01012345678",
    description: "휴대폰 번호 (본인인증 자동 채움 가능 — 빈 값으로 전송 가능)",
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: "길동",
    description: "이름 (본인인증 자동 채움 가능)",
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    example: "홍",
    description: "성 (본인인증 자동 채움 가능)",
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({
    example: "SecurePassword123",
    description: "User password (min 8 characters)",
    minLength: 8,
  })
  @IsNotEmpty({ message: "비밀번호는 필수입니다." })
  @MinLength(8, {
    message: "비밀번호는 최소 8자 이상이어야 합니다.",
  })
  password!: string;

  @ApiProperty({
    enum: ["PARENT", "COACH", "ADMIN", "TEEN", "CHILD"],
    description: "User type",
    example: "PARENT",
  })
  @IsEnum(UserType, {
    message: "User type must be one of: PARENT, COACH, ADMIN, TEEN, CHILD",
  })
  userType!: UserType;

  @ApiPropertyOptional({
    example: "2015-06-15",
    description: "생년월일 (TEEN/CHILD 회원가입 시 필수, YYYY-MM-DD 형식)",
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: "유효한 날짜 형식을 입력해주세요. (예: 2015-06-15)" },
  )
  birthDate?: string;

  @ApiPropertyOptional({
    example: "MALE",
    description: "성별 (MALE/FEMALE/OTHER)",
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: "12345", description: "우편번호" })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ example: "서울시 강남구", description: "기본 주소" })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: "101동 202호", description: "상세 주소" })
  @IsOptional()
  @IsString()
  addressDetail?: string;

  /**
   * NEW-02 (2026-05-22) — 본인인증 검증 ID.
   *
   * PARENT / COACH / DIRECTOR / ACADEMY_DIRECTOR 가입 시 **필수**.
   * (CHILD / TEEN 은 법정대리인 동의 L-10 으로 대체.)
   *
   * Flutter 측 가입 흐름(A8 identity_carrier + A9 sms_verify)에서 NICE/PASS/Kakao
   * 본인인증 완료 후 받은 IdentityVerification.requestId 를 전달.
   * 서버는 status='completed' · verifiedAt 30분 내 · name 일치를 검증한다.
   */
  @ApiPropertyOptional({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description:
      "본인인증 검증 ID (PARENT/COACH/DIRECTOR 가입 시 필수). NICE/PASS/Kakao 완료 후 받은 requestId.",
  })
  @IsOptional()
  @IsString()
  identityVerificationId?: string;
}
