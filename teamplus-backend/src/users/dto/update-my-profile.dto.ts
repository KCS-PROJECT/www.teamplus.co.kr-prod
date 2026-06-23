import { IsString, IsOptional, Matches, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateMyProfileDto {
  @ApiPropertyOptional({
    description: "이름",
    example: "길동",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({
    description: "성",
    example: "홍",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

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
    description:
      "프로필 아바타 URL (통합 Files 모듈 업로드 결과). 빈 문자열 전달 시 아바타 제거.",
    example: "/uploads/avatar/2026/04/1712345678-ab3f9c12.webp",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^(\/uploads\/|https?:\/\/|$)/, {
    message: "아바타 URL은 /uploads/ 경로 또는 http(s) URL이어야 합니다.",
  })
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: "우편번호",
    example: "06236",
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @ApiPropertyOptional({
    description: "기본주소 (도로명 또는 지번)",
    example: "서울특별시 강남구 테헤란로 123",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({
    description: "상세주소",
    example: "101동 202호",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressDetail?: string;
}
