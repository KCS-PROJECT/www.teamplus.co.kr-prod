import { IsNotEmpty, IsString, MinLength, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SendResetCodeDto {
  @ApiProperty({ example: "hong123", description: "아이디 (계정 식별자)" })
  // 형식 무검증 — 기존 이메일 ID와 신규 일반 ID 모두 식별. 재설정 코드는 SMS 발송.
  @IsString()
  @IsNotEmpty({ message: "아이디를 입력해주세요." })
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: "hong123", description: "아이디 (계정 식별자)" })
  @IsString()
  @IsNotEmpty({ message: "아이디를 입력해주세요." })
  email!: string;

  @ApiProperty({ example: "123456", description: "인증 코드 (6자리)" })
  @IsNotEmpty({ message: "인증 코드는 필수입니다." })
  @IsString()
  code!: string;

  @ApiProperty({
    example: "NewPassword123!",
    description: "새 비밀번호 (8자 이상, 영문/숫자/특수문자 포함)",
  })
  @IsNotEmpty({ message: "새 비밀번호는 필수입니다." })
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  // 회원가입(signup.dto.ts)과 동일 규칙 — 영문+숫자+특수문자(허용 22종) 8자 이상.
  @Matches(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_+=~?.,{}[\]-])[A-Za-z0-9!@#$%^&*()_+=~?.,{}[\]-]{8,}$/,
    {
      message: "비밀번호는 영문, 숫자, 특수문자를 포함해 8자 이상이어야 합니다.",
    },
  )
  newPassword!: string;
}
