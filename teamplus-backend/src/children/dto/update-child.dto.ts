import {
  IsString,
  IsDateString,
  IsOptional,
  MaxLength,
  MinLength,
  IsEnum,
  Matches,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 자녀 정보 수정 DTO
 *
 * 학부모가 자녀 정보를 수정할 때 사용합니다.
 */
export class UpdateChildDto {
  @ApiPropertyOptional({
    description: "자녀 이름 (이름)",
    example: "민수",
    minLength: 1,
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "자녀 이름은 1자 이상이어야 합니다." })
  @MaxLength(20, { message: "자녀 이름은 20자 이하이어야 합니다." })
  firstName?: string;

  @ApiPropertyOptional({
    description: "자녀 성",
    example: "김",
    minLength: 1,
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "자녀 성은 1자 이상이어야 합니다." })
  @MaxLength(10, { message: "자녀 성은 10자 이하이어야 합니다." })
  lastName?: string;

  @ApiPropertyOptional({
    description: "생년월일 (YYYY-MM-DD)",
    example: "2015-03-15",
  })
  @IsOptional()
  @IsDateString({}, { message: "올바른 날짜 형식이 아닙니다. (YYYY-MM-DD)" })
  birthDate?: string;

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
  })
  @IsOptional()
  @IsEnum(["parent", "guardian", "grandparent", "other"], {
    message: "관계는 parent, guardian, grandparent, other 중 하나여야 합니다.",
  })
  relationship?: string;

  @ApiPropertyOptional({
    description: "휴대폰 번호",
    example: "01012345678",
  })
  @IsOptional()
  @IsString()
  @Matches(/^01[0-9]{8,9}$/, {
    message: "휴대폰 번호는 01로 시작하는 10~11자리 숫자여야 합니다.",
  })
  phone?: string;

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
    description: "주 보호자 여부",
    example: true,
  })
  @IsOptional()
  isPrimary?: boolean;

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
      "자녀 소속 팀 변경. 팀 ID 지정 시 기존 활성 팀에서 탈퇴 후 해당 팀에 PLAYER로 가입 신청(pending)됩니다. null 지정 시 소속 없이 전환되며, 키를 보내지 않으면 팀 변경이 일어나지 않습니다.",
    example: "clxxxxxxxxxxxxxxxxxxxxxxxx",
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: "팀 ID를 문자열로 입력해주세요." })
  teamId?: string | null;
}
