import { IsString, IsOptional, Matches } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: "아이디 (계정 식별자)",
    example: "hong123",
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: "휴대폰 번호",
    example: "010-1234-5678",
  })
  @IsOptional()
  @IsString()
  @Matches(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, {
    message: "올바른 휴대폰 번호 형식이 아닙니다.",
  })
  phone?: string;

  @ApiPropertyOptional({
    description: "이름",
    example: "길동",
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    description: "성",
    example: "홍",
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description: "부서",
    example: "개발팀",
  })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({
    description: "직책",
    example: "매니저",
  })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({
    description: "프로필 이미지 URL (User.avatar_url 컬럼에 저장)",
    example: "/uploads/avatar/2026/04/1712345678-ab3f9c12.webp",
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: "2015-06-15",
    description: "생년월일 (YYYY-MM-DD)",
  })
  @IsOptional()
  @IsString()
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
}
