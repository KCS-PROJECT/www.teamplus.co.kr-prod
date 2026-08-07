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
import { REGISTER_ENDPOINT_ALLOWED_USER_TYPES } from "../constants/public-signup.constants";

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

  /**
   * [2026-08-06 SECURITY · R14-C1] 역할 차단은 **서비스 allowlist 가드 단일 지점**에서 수행한다.
   *
   * DTO 에 `@IsIn(allowlist)` 을 걸었더니 ValidationPipe 가 먼저 400 을 던지면서
   * **CHILD/TEEN 가족정책 안내 문구(2026-06-18 앱심사 대응)와 역할별 안내가 HTTP 응답에서 소실**됐다
   * (Codex Round 2 지적 1). class-validator 는 값별로 다른 메시지를 낼 수 없다.
   *
   * → DTO 는 "알려진 UserType 인가"만 검사하고, **누가 가입 가능한가는 서비스가 판정**한다.
   *   서비스 가드는 DB 조회 이전에 실행되므로 방어력 손실은 없다.
   */
  @ApiProperty({
    enum: REGISTER_ENDPOINT_ALLOWED_USER_TYPES,
    description:
      "회원 유형. 이 엔드포인트는 팀/오픈클래스 정보를 받지 않으므로 **PARENT 만 가입 가능**합니다. 감독·오픈클래스 감독은 POST /auth/signup 을, 코치는 감독의 코치 등록을, 자녀는 보호자 계정을, 관리자는 운영자 콘솔을 이용합니다.",
    example: "PARENT",
  })
  @IsEnum(UserType, { message: "유효한 회원 유형을 입력해주세요." })
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
