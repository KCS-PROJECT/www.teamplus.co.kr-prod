import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 자녀 OTP 검증 + 로그인 DTO
 *
 * 부모 전화번호는 서버가 DB에서 조회하므로 클라이언트에서 전달하지 않습니다.
 */
export class VerifyOtpAndLoginDto {
  @ApiProperty({
    description: "자녀 이메일",
    example: "child@example.com",
  })
  @IsEmail({}, { message: "올바른 이메일 형식을 입력해주세요." })
  @IsNotEmpty({ message: "이메일을 입력해주세요." })
  childEmail!: string;

  @ApiProperty({
    description: "6자리 인증번호 (OTP)",
    example: "593271",
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: "인증번호는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "인증번호를 입력해주세요." })
  @Length(6, 6, { message: "인증번호는 정확히 6자리여야 합니다." })
  @Matches(/^\d{6}$/, { message: "인증번호는 6자리 숫자만 가능합니다." })
  otp!: string;

  @ApiProperty({ description: "Challenge Token (로그인 응답에서 받은 JWT)" })
  @IsString()
  @IsNotEmpty({ message: "challengeToken은 필수입니다." })
  challengeToken!: string;
}
