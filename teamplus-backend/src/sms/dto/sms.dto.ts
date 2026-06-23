import { IsString, IsNotEmpty, Matches, IsIn, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 인증번호 발송 요청 DTO
 */
export class SendOtpDto {
  @ApiProperty({
    description: "휴대폰 번호 (숫자만, 하이픈 없이)",
    example: "01012345678",
  })
  @IsString()
  @IsNotEmpty({ message: "휴대폰 번호를 입력해주세요." })
  @Matches(/^01[0-9]{8,9}$/, {
    message: "올바른 휴대폰 번호 형식이 아닙니다. (예: 01012345678)",
  })
  phone!: string;

  @ApiProperty({
    description: "인증 목적",
    example: "signup",
    enum: ["signup", "find-id", "reset-password", "change-phone"],
  })
  @IsString()
  @IsNotEmpty({ message: "인증 목적을 입력해주세요." })
  @IsIn(["signup", "find-id", "reset-password", "change-phone"], {
    message: "유효하지 않은 인증 목적입니다.",
  })
  purpose!: "signup" | "find-id" | "reset-password" | "change-phone";
}

/**
 * 인증번호 확인 요청 DTO
 */
export class VerifyOtpDto {
  @ApiProperty({
    description: "휴대폰 번호 (숫자만)",
    example: "01012345678",
  })
  @IsString()
  @IsNotEmpty({ message: "휴대폰 번호를 입력해주세요." })
  @Matches(/^01[0-9]{8,9}$/, {
    message: "올바른 휴대폰 번호 형식이 아닙니다.",
  })
  phone!: string;

  @ApiProperty({
    description: "인증 목적",
    example: "signup",
    enum: ["signup", "find-id", "reset-password", "change-phone"],
  })
  @IsString()
  @IsNotEmpty({ message: "인증 목적을 입력해주세요." })
  @IsIn(["signup", "find-id", "reset-password", "change-phone"], {
    message: "유효하지 않은 인증 목적입니다.",
  })
  purpose!: "signup" | "find-id" | "reset-password" | "change-phone";

  @ApiProperty({
    description: "6자리 인증번호",
    example: "123456",
  })
  @IsString()
  @IsNotEmpty({ message: "인증번호를 입력해주세요." })
  @Length(6, 6, { message: "인증번호는 6자리입니다." })
  @Matches(/^[0-9]{6}$/, { message: "인증번호는 숫자 6자리입니다." })
  code!: string;
}
