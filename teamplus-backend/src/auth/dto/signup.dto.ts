import {
  IsNotEmpty,
  MinLength,
  IsEnum,
  IsOptional,
  IsString,
  IsObject,
  IsBoolean,
  IsDateString,
  ValidateNested,
  ValidateIf,
  MaxLength,
  Matches,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserType } from "@prisma/client";

/**
 * 팀 감독 가입 시 함께 생성할 팀 정보 (설계서 §4.5)
 * - userType=DIRECTOR 일 때 필수.
 * - Club.description 은 이번 범위에서 제외 (필요 시 팀 편집 화면에서 입력).
 */
export class SignupClubDto {
  @ApiProperty({
    description: "팀 이름",
    example: "루비덕스",
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: "팀 이름을 입력해주세요." })
  @MinLength(2, { message: "팀 이름은 최소 2자 이상이어야 합니다." })
  @MaxLength(50, { message: "팀 이름은 50자 이하이어야 합니다." })
  clubName!: string;

  @ApiPropertyOptional({ description: "기본 훈련 장소", maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "훈련 장소는 100자 이하이어야 합니다." })
  location?: string;

  @ApiPropertyOptional({ description: "기본 훈련 링크장 ID (Venue FK · 2026-05-22)" })
  @IsOptional()
  @IsString()
  venueId?: string;
  // [2026-06-07] 팀 감독 가입자는 항상 HEAD_COACH. 단장(MANAGER)은 감독이
  //   코치 등록(POST /admin/coaches)에서 생성하므로 회원가입에서 역할 선택 제거.
}

/**
 * 오픈클래스 감독 가입 시 함께 생성할 오픈클래스 정보 (설계서 §4.6)
 * - userType=ACADEMY_DIRECTOR 일 때 필수.
 * - Academy.code 는 서버 자동 생성(ACAD-XXXXXX).
 */
export class SignupAcademyDto {
  @ApiProperty({
    description: "오픈클래스 이름",
    example: "블랙아이스 아카데미",
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: "오픈클래스 이름을 입력해주세요." })
  @MinLength(2, { message: "오픈클래스 이름은 최소 2자 이상이어야 합니다." })
  @MaxLength(50, { message: "오픈클래스 이름은 50자 이하이어야 합니다." })
  name!: string;

  @ApiPropertyOptional({ description: "지역", maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: "지역은 50자 이하이어야 합니다." })
  region?: string;
}

export class SignupAgreementsDto {
  @ApiProperty({ description: "서비스 이용약관 동의" })
  @IsBoolean()
  terms!: boolean;

  @ApiProperty({ description: "개인정보 처리방침 동의" })
  @IsBoolean()
  privacy!: boolean;

  @ApiPropertyOptional({ description: "마케팅 정보 수신 동의" })
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}

export class SignupDto {
  // 본인인증 자동 채움(B안, 2026-05-26) — firstName/lastName/phone 옵셔널화
  //   · PARENT/COACH/DIRECTOR/ACADEMY_DIRECTOR 는 verification 에서 자동 채움
  //   · 사용자가 입력했으면 본인인증 결과와 일치 검증, 빈 값이면 verification 값 사용
  @ApiPropertyOptional({ example: "길동", description: "이름 (본인인증 자동 채움 가능)" })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: "홍", description: "성 (본인인증 자동 채움 가능)" })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ example: "hong123kim", description: "아이디 (영문 소문자/숫자/_ 8~20자)" })
  // 이메일 인증 폐기 — 일반 아이디로 입력받고 중복확인만 수행. email 컬럼 그대로 사용.
  // [2026-06-04] 아이디 길이 정책 4~20 → 8~20자 (첫글자 + 7~19).
  @IsString()
  @IsNotEmpty({ message: "아이디를 입력해주세요." })
  @Matches(/^[a-z][a-z0-9_]{7,19}$/, {
    message:
      "아이디는 영문 소문자로 시작하고, 영문 소문자·숫자·언더스코어(_)를 사용해 8~20자로 입력해주세요.",
  })
  email!: string;

  @ApiPropertyOptional({
    example: "01012345678",
    description: "휴대폰 번호 (본인인증 자동 채움 가능)",
  })
  @IsOptional()
  @IsString()
  @Matches(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, {
    message: "유효한 휴대폰 번호 형식이 아닙니다. (예: 01012345678)",
  })
  phone?: string;

  @ApiProperty({
    example: "SecurePassword123!",
    description: "비밀번호 (8자 이상, 영문/숫자/특수문자 포함)",
  })
  @IsNotEmpty({ message: "비밀번호는 필수입니다." })
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
    message: "비밀번호는 영문, 숫자, 특수문자를 포함해야 합니다.",
  })
  password!: string;

  @ApiPropertyOptional({
    enum: ["PARENT", "COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "TEEN", "CHILD"],
    default: "PARENT",
    description: "사용자 유형",
  })
  @IsOptional()
  @IsEnum(UserType, { message: "유효한 사용자 유형을 입력해주세요." })
  userType?: UserType;

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
    example: "M",
    description: "성별 (M: 남, F: 여)",
    enum: ["M", "F"],
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    example: "06234",
    description: "우편번호",
  })
  @IsOptional()
  @IsString()
  @MaxLength(10, { message: "우편번호는 10자 이하이어야 합니다." })
  zipCode?: string;

  @ApiPropertyOptional({
    example: "서울특별시 강남구 테헤란로 123",
    description: "주소",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "주소는 200자 이하이어야 합니다." })
  address?: string;

  @ApiPropertyOptional({
    example: "101호",
    description: "상세 주소",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "상세 주소는 100자 이하이어야 합니다." })
  addressDetail?: string;

  @ApiPropertyOptional({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description:
      "본인인증 검증 ID (PARENT/COACH/DIRECTOR 가입 시 필수). NICE/PASS/Kakao 완료 후 받은 requestId.",
  })
  @IsOptional()
  @IsString()
  identityVerificationId?: string;

  /**
   * 팀 감독 가입 시 필수 — 팀 정보 (설계서 §4.5)
   * userType=DIRECTOR 일 때만 검증.
   */
  @ApiPropertyOptional({
    description: "팀 정보 (userType=DIRECTOR 필수)",
    type: () => SignupClubDto,
  })
  @ValidateIf((o: { userType?: UserType }) => o.userType === "DIRECTOR")
  @IsObject({ message: "팀 정보를 입력해주세요." })
  @ValidateNested()
  @Type(() => SignupClubDto)
  clubInfo?: SignupClubDto;

  /**
   * 소속 팀 ID (신규 표준 식별자, 2026-06-01)
   * - 코치 가입 시 TeamPickerModal 선택 결과(team.id)를 전송.
   * - COACH: 선택. 있으면 ClubMember(COACH, pending) 생성 → 감독 승인.
   * - PARENT: 미사용. 학부모는 가입 시 팀을 선택하지 않으며,
   *   팀은 자녀 등록 시점에 자녀별로 결정된다(다팀·무소속 허용).
   * - teamCode 보다 우선 적용된다(불변 식별자).
   */
  @ApiPropertyOptional({
    description:
      "소속 팀 ID (코치 가입 시 팀 선택 결과). teamCode 보다 우선. 학부모는 미사용(자녀 등록 시점에 팀 선택).",
    example: "clxxxxxxxxxxxxxxxxxxxxxxxx",
  })
  @IsOptional()
  @IsString({ message: "팀 ID를 문자열로 입력해주세요." })
  teamId?: string;

  /**
   * 소속 팀 코드 (레거시 식별자 — 하위호환용, 2026-06-01)
   * - 신규 클라이언트는 teamId 를 사용한다. teamId 미입력 시에만 fallback 으로 조회.
   * - 코치 가입에서만 사용. 학부모는 가입 시 팀 코드를 사용하지 않는다.
   */
  @ApiPropertyOptional({
    description:
      "[Legacy] 소속 팀 코드. teamId 미입력 시 fallback 조회용. 신규 클라이언트는 teamId 사용.",
    example: "RUBY-DUCKS",
    minLength: 3,
    maxLength: 32,
    deprecated: true,
  })
  @ValidateIf(
    (o: { teamCode?: string }) =>
      o.teamCode !== undefined && o.teamCode !== "",
  )
  @IsString({ message: "팀 코드를 문자열로 입력해주세요." })
  @MinLength(3, { message: "팀 코드는 최소 3자 이상이어야 합니다." })
  @MaxLength(32, { message: "팀 코드는 32자 이하이어야 합니다." })
  @Matches(/^[A-Za-z0-9_\-]+$/, {
    message: "팀 코드는 영문, 숫자, -, _ 만 사용 가능합니다.",
  })
  teamCode?: string;

  /**
   * 오픈클래스 감독 가입 시 필수 — 오픈클래스 정보 (설계서 §4.6)
   * userType=ACADEMY_DIRECTOR 일 때만 검증.
   */
  @ApiPropertyOptional({
    description: "오픈클래스 정보 (userType=ACADEMY_DIRECTOR 필수)",
    type: () => SignupAcademyDto,
  })
  @ValidateIf((o: { userType?: UserType }) => o.userType === "ACADEMY_DIRECTOR")
  @IsObject({ message: "오픈클래스 정보를 입력해주세요." })
  @ValidateNested()
  @Type(() => SignupAcademyDto)
  academyInfo?: SignupAcademyDto;

  @ApiProperty({ description: "약관 동의 정보" })
  @IsObject()
  @ValidateNested()
  @Type(() => SignupAgreementsDto)
  agreements!: SignupAgreementsDto;
}
