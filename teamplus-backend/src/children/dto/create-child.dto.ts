import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsDateString,
  IsOptional,
  MaxLength,
  MinLength,
  IsEnum,
  Matches,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 자녀 등록 DTO
 *
 * 학부모가 자녀를 등록할 때 사용합니다.
 * 자녀 정보는 학부모가 대리 입력합니다.
 */
export class CreateChildDto {
  @ApiProperty({
    description: "자녀 이름 (이름)",
    example: "민수",
    minLength: 1,
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty({ message: "자녀 이름을 입력해주세요." })
  @MinLength(1, { message: "자녀 이름은 1자 이상이어야 합니다." })
  @MaxLength(20, { message: "자녀 이름은 20자 이하이어야 합니다." })
  firstName!: string;

  @ApiProperty({
    description: "자녀 성",
    example: "김",
    minLength: 1,
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty({ message: "자녀 성을 입력해주세요." })
  @MinLength(1, { message: "자녀 성은 1자 이상이어야 합니다." })
  @MaxLength(10, { message: "자녀 성은 10자 이하이어야 합니다." })
  lastName!: string;

  @ApiProperty({
    description: "생년월일 (YYYY-MM-DD)",
    example: "2015-03-15",
  })
  @IsDateString({}, { message: "올바른 날짜 형식이 아닙니다. (YYYY-MM-DD)" })
  @IsNotEmpty({ message: "생년월일을 입력해주세요." })
  birthDate!: string;

  @ApiPropertyOptional({
    description:
      "[Deprecated] 자녀 개별 로그인 폐지에 따라 미입력 시 내부 식별자가 자동 생성됩니다.",
    example: "child@example.com",
    deprecated: true,
  })
  @IsOptional()
  @IsEmail({}, { message: "유효한 이메일 주소를 입력해주세요." })
  email?: string;

  @ApiPropertyOptional({
    description:
      "[Deprecated] 자녀 개별 로그인 폐지에 따라 미입력 시 랜덤 해시가 자동 생성됩니다.",
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description:
      "자녀 휴대폰 번호 (선택). 없으면 시스템이 내부 식별자를 자동 생성합니다.",
    example: "01012345678",
  })
  @IsOptional()
  @IsString()
  @Matches(/^01[0-9]{8,9}$/, {
    message: "휴대폰 번호는 01로 시작하는 10~11자리 숫자여야 합니다.",
  })
  phone?: string;

  @ApiPropertyOptional({
    description: "성별 (M: 남, F: 여)",
    example: "M",
    enum: ["M", "F"],
  })
  @IsOptional()
  @IsEnum(["M", "F"], { message: "성별은 M(남) 또는 F(여)이어야 합니다." })
  gender?: string;

  @ApiPropertyOptional({
    description: "학부모와의 관계",
    example: "parent",
    enum: ["parent", "guardian", "grandparent", "other"],
    default: "parent",
  })
  @IsOptional()
  @IsEnum(["parent", "guardian", "grandparent", "other"], {
    message: "관계는 parent, guardian, grandparent, other 중 하나여야 합니다.",
  })
  relationship?: string;

  @ApiPropertyOptional({
    description: "메모/특이사항",
    example: "천식이 있어서 격한 운동 시 주의가 필요합니다.",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "메모는 500자 이하이어야 합니다." })
  note?: string;

  @ApiPropertyOptional({
    description:
      "자녀 프로필 사진 URL — POST /api/v1/files/upload (category=AVATAR) 응답의 url",
    example: "/uploads/avatar/2026/05/16/홍길동_202605161700_a1b2.jpg",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "이미지 URL은 500자 이하이어야 합니다." })
  imageUrl?: string;

  @ApiPropertyOptional({
    description:
      "자녀가 가입할 팀 ID (선택). 미지정 시 팀 미소속으로 등록되며, 지정 시 해당 팀에 PLAYER로 가입 신청(pending)됩니다.",
    example: "clxxxxxxxxxxxxxxxxxxxxxxxx",
  })
  @IsOptional()
  @IsString({ message: "팀 ID를 문자열로 입력해주세요." })
  teamId?: string;

  /**
   * [Deprecated 2026-04-29] 옵션 A 도입 후 무시됩니다.
   *
   * 본 필드는 옵션 A(학부모 팀 가입) 도입 이전에 자녀 등록 시 팀 코드를 받기 위한 필드였으나,
   * 현재는 백엔드 `children.service.ts` 가 학부모 ClubMember(roleInTeam='PARENT', approvalStatus='approved')
   * 의 teamId 를 자동으로 적용하므로 본 필드의 입력값은 서버에서 무시됩니다.
   *
   * - 구버전 클라이언트 호환을 위해 옵셔널 필드로 유지하며, 빈 문자열/누락도 허용합니다.
   * - 잘못된 형식(특수문자 등)이 들어오면 `@Matches` 가 거부합니다(API 계약 일관성).
   * - SoT: 학부모 ClubMember.teamId. (PARENT_TEAM_REGISTRATION_SPEC.md §3 참조)
   * - 향후 PR 에서 본 필드 완전 제거 예정.
   */
  @ApiPropertyOptional({
    description:
      "[Deprecated] 옵션 A 도입(2026-04-29) 후 서버에서 무시됨. 학부모 ClubMember 의 teamId 가 자동 적용됨.",
    example: "RUBY-DUCKS",
    minLength: 3,
    maxLength: 32,
    deprecated: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.teamCode !== undefined && o.teamCode !== "")
  @IsString()
  @MinLength(3, { message: "팀 코드는 최소 3자 이상이어야 합니다." })
  @MaxLength(32, { message: "팀 코드는 32자 이하이어야 합니다." })
  @Matches(/^[A-Za-z0-9_\-]+$/, {
    message: "팀 코드는 영문, 숫자, -, _ 만 사용 가능합니다.",
  })
  teamCode?: string;
}
