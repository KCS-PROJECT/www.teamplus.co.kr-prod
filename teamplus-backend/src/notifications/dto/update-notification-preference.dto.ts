import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

// 전역 enableImplicitConversion이 문자열 "false"를 true로 바꾸기 전에
// 원본 값을 복원하여 @IsBoolean이 JSON boolean만 허용하도록 한다.
const PreserveRawBoolean = () =>
  Transform(({ obj, key }) => obj[key], { toClassOnly: true });

export class NotificationCategoriesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  class?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  payment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  notice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  system?: boolean;

  @ApiPropertyOptional({
    description:
      "레거시 호환 필드. User.marketingConsent와 동일한 값으로 저장됩니다.",
  })
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  marketing?: boolean;
}

export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  smsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  soundEnabled?: boolean;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  vibrationEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true, example: "22:00" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursStart?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "08:00" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursEnd?: string | null;

  @ApiPropertyOptional({ type: NotificationCategoriesDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationCategoriesDto)
  categories?: NotificationCategoriesDto;

  @ApiPropertyOptional({
    description:
      "마케팅 정보 수신 동의의 법적 기준값. categories.marketing보다 우선합니다.",
  })
  @IsOptional()
  @PreserveRawBoolean()
  @IsBoolean()
  marketingConsent?: boolean;

  @ApiPropertyOptional({
    description:
      "동의 화면에서 확인한 현행 마케팅 약관 버전. false→true 동의 시 필수입니다.",
    example: "1.1.0",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  marketingConsentTermsVersion?: string;
}
