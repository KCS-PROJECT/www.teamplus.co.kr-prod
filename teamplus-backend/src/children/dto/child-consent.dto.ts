/**
 * L-10 (2026-05-22) — 만 14세 미만 자녀 등록 시 법정대리인 동의 DTO.
 *
 * PIPA(개인정보보호법) §22조 + 정통망법 §31조2 근거.
 * 동의 시점에 termsVersion/privacyVersion 스냅샷을 함께 저장하여
 * 약관 변경 시 재동의 필요 여부 판별에 사용.
 */

import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateChildConsentDto {
  @ApiProperty({
    description: "동의 대상 자녀 User.id (CHILD type)",
    example: "cmoib0iyp004nyhh7zcokylw9",
  })
  @IsString()
  childUserId!: string;

  @ApiProperty({
    description: "개인정보 수집·이용 동의 (필수)",
    example: true,
  })
  @IsBoolean()
  consentPersonalInfo!: boolean;

  @ApiProperty({
    description: "제3자 제공 동의 (선택)",
    example: false,
  })
  @IsBoolean()
  consentThirdParty!: boolean;

  @ApiProperty({
    description: "마케팅 활용 동의 (선택)",
    example: false,
  })
  @IsBoolean()
  consentMarketing!: boolean;

  @ApiProperty({
    description: "동의 확인 방법",
    enum: ["sms_otp", "identity_verify", "pin"],
    example: "sms_otp",
  })
  @IsIn(["sms_otp", "identity_verify", "pin"])
  verificationMethod!: "sms_otp" | "identity_verify" | "pin";

  @ApiProperty({
    description: "동의 시점의 약관 버전 (없으면 서버가 AppSettings.termsVersion 스냅샷)",
    required: false,
    example: "1.0",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  termsVersion?: string;

  @ApiProperty({
    description:
      "동의 시점의 개인정보처리방침 버전 (없으면 서버가 AppSettings.privacyVersion 스냅샷)",
    required: false,
    example: "1.0",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  privacyVersion?: string;
}

export class ChildConsentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  guardianUserId!: string;

  @ApiProperty()
  childUserId!: string;

  @ApiProperty()
  childAgeMonths!: number;

  @ApiProperty()
  termsVersion!: string;

  @ApiProperty()
  privacyVersion!: string;

  @ApiProperty()
  consentPersonalInfo!: boolean;

  @ApiProperty()
  consentThirdParty!: boolean;

  @ApiProperty()
  consentMarketing!: boolean;

  @ApiProperty()
  verificationMethod!: string;

  @ApiProperty({ required: false, nullable: true })
  revokedAt!: Date | null;

  @ApiProperty()
  signedAt!: Date;
}
