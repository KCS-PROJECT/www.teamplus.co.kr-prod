import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * [2026-06-17] 본인인증 기반 아이디 찾기 — 휴대폰 본인인증(requestId)만으로 가입 이력 조회.
 */
export class FindIdByIdentityDto {
  @ApiProperty({
    example: "a1b2c3d4-...",
    description: "본인인증 요청 ID (IdentityVerification.requestId)",
  })
  @IsNotEmpty({ message: "본인인증을 먼저 완료해주세요." })
  @IsString()
  identityVerificationId!: string;
}

/**
 * [2026-06-17] 본인인증 기반 비밀번호 재설정 — 임시 비밀번호 메일 발송.
 *  휴대폰 본인인증(requestId) 완료 후, 임시 비밀번호를 받을 이메일 주소(가입 아이디와 무관)를 입력받는다.
 */
export class FindAccountDto {
  @ApiProperty({
    example: "a1b2c3d4-...",
    description: "본인인증 요청 ID (IdentityVerification.requestId)",
  })
  @IsNotEmpty({ message: "본인인증을 먼저 완료해주세요." })
  @IsString()
  identityVerificationId!: string;

  @ApiProperty({
    example: "user@example.com",
    description: "임시 비밀번호를 받을 이메일 주소",
  })
  @IsNotEmpty({ message: "이메일은 필수입니다." })
  @IsEmail({}, { message: "유효한 이메일 주소를 입력해주세요." })
  email!: string;
}
