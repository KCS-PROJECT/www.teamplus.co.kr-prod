import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 자녀 OTP 발송 요청 DTO
 *
 * 자녀 이메일만 전달하면 서버가 DB에서 연결된 부모 연락처를 조회하여 발송합니다.
 */
export class RequestOtpDto {
  @ApiProperty({
    description: "자녀 이메일",
    example: "child@example.com",
  })
  @IsEmail({}, { message: "올바른 이메일 형식을 입력해주세요." })
  @IsNotEmpty({ message: "이메일을 입력해주세요." })
  childEmail!: string;

  @ApiProperty({ description: "Challenge Token (로그인 응답에서 받은 JWT)" })
  @IsString()
  @IsNotEmpty({ message: "challengeToken은 필수입니다." })
  challengeToken!: string;
}
