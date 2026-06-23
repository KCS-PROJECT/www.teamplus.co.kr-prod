import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 자녀 PIN 검증 + 로그인 DTO
 *
 * 자녀가 로그인 페이지에서 고정 PIN을 입력하여 인증 + JWT 발급을 요청합니다.
 */
export class VerifyAndLoginDto {
  @ApiProperty({
    description: "자녀 이메일",
    example: "child@example.com",
  })
  @IsEmail({}, { message: "올바른 이메일 형식을 입력해주세요." })
  @IsNotEmpty({ message: "이메일을 입력해주세요." })
  childEmail!: string;

  @ApiProperty({
    description: "6자리 숫자 PIN",
    example: "482916",
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: "PIN은 문자열이어야 합니다." })
  @IsNotEmpty({ message: "PIN을 입력해주세요." })
  @Length(6, 6, { message: "PIN은 정확히 6자리여야 합니다." })
  @Matches(/^\d{6}$/, { message: "PIN은 6자리 숫자만 가능합니다." })
  pin!: string;

  @ApiProperty({ description: "Challenge Token (로그인 응답에서 받은 JWT)" })
  @IsString()
  @IsNotEmpty({ message: "challengeToken은 필수입니다." })
  challengeToken!: string;
}
