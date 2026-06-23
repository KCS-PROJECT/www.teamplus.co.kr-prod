import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({
    example: "hong123",
    description: "아이디 (기존 이메일 계정도 그대로 사용)",
  })
  // 로그인은 형식 무검증 — 기존 이메일 ID(@ 포함)와 신규 일반 ID 모두 허용.
  @IsString()
  @IsNotEmpty({ message: "아이디를 입력해주세요." })
  email!: string;

  @ApiProperty({
    example: "SecurePassword123",
    description: "User password",
  })
  @IsNotEmpty({ message: "비밀번호는 필수입니다." })
  @MinLength(8, {
    message: "비밀번호는 최소 8자 이상이어야 합니다.",
  })
  password!: string;

  @ApiPropertyOptional({
    description:
      "단일 세션 정책 — 409 SESSION_EXISTS 확인 후 기존 접속을 종료하고 로그인할 때 true",
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
