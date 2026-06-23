import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
  ArrayMinSize,
  ArrayMaxSize,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";

const emptyStringToUndefined = ({ value }: { value: unknown }) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export class UpdateAppSettingsDto {
  // 기본 정보 (어드민 UI)
  @ApiPropertyOptional({ description: "앱 이름" })
  @IsOptional()
  @IsString()
  appName?: string;

  @ApiPropertyOptional({ description: "앱 버전 (예: 1.0.0)" })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({ description: "API URL" })
  @IsOptional()
  @IsString()
  apiUrl?: string;

  // 고객 지원 (어드민 UI)
  @ApiPropertyOptional({ description: "지원 이메일" })
  @IsOptional()
  @Transform(emptyStringToUndefined)
  @IsEmail()
  supportEmail?: string;

  @ApiPropertyOptional({ description: "지원 전화번호" })
  @IsOptional()
  @IsString()
  supportPhone?: string;

  @ApiPropertyOptional({ description: "고객센터 운영시간 (예: 평일 09:00~18:00)" })
  @IsOptional()
  @IsString()
  supportHours?: string;

  // 시스템 모드 (어드민 UI)
  @ApiPropertyOptional({ description: "유지보수 모드 활성화" })
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @ApiPropertyOptional({ description: "유지보수 메시지" })
  @IsOptional()
  @IsString()
  maintenanceMessage?: string;

  @ApiPropertyOptional({ description: "디버그 모드 활성화" })
  @IsOptional()
  @IsBoolean()
  debugMode?: boolean;

  // 서버 설정 (어드민 UI)
  @ApiPropertyOptional({
    description: "최대 업로드 크기 (MB, 1-500)",
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxUploadSize?: number;

  @ApiPropertyOptional({
    description: "세션 타임아웃 (분, 5-480)",
    minimum: 5,
    maximum: 480,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  sessionTimeout?: number;

  // 앱 버전 관리 (운영 전용)
  @ApiPropertyOptional({ description: "iOS 최소 앱 버전 (예: 1.2.3)" })
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: "SemVer 형식이어야 합니다 (예: 1.2.3)",
  })
  minimumAppVersionIos?: string;

  @ApiPropertyOptional({ description: "Android 최소 앱 버전 (예: 1.2.3)" })
  @IsOptional()
  @IsString()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: "SemVer 형식이어야 합니다 (예: 1.2.3)",
  })
  minimumAppVersionAnd?: string;

  @ApiPropertyOptional({ description: "강제 업데이트 메시지" })
  @IsOptional()
  @IsString()
  forceUpdateMessage?: string;

  // 회원/인증 설정 (운영 전용)
  @ApiPropertyOptional({ description: "회원가입 허용" })
  @IsOptional()
  @IsBoolean()
  signupEnabled?: boolean;

  @ApiPropertyOptional({ description: "소셜 로그인 허용" })
  @IsOptional()
  @IsBoolean()
  socialLoginEnabled?: boolean;

  @ApiPropertyOptional({
    description: "최대 로그인 시도 횟수 (1-10)",
    minimum: 1,
    maximum: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxLoginAttempts?: number;

  // 크레딧/QR 설정 (운영 전용)
  @ApiPropertyOptional({
    description: "크레딧 만료일 (일, 30-365)",
    minimum: 30,
    maximum: 365,
  })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(365)
  creditExpireDays?: number;

  @ApiPropertyOptional({
    description: "QR 만료 시간 (분, 1-60)",
    minimum: 1,
    maximum: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  qrExpireMinutes?: number;

  // 약관 버전 (운영 전용)
  @ApiPropertyOptional({ description: "이용약관 버전" })
  @IsOptional()
  @IsString()
  termsVersion?: string;

  @ApiPropertyOptional({ description: "개인정보처리방침 버전" })
  @IsOptional()
  @IsString()
  privacyVersion?: string;

  // 정산 설정 (P-12, P-13 — 2026-05-21 추가)
  @ApiPropertyOptional({
    description: "플랫폼 수수료율 (0.0000 ~ 1.0000, 예: 0.03 = 3%)",
    minimum: 0,
    maximum: 1,
    example: 0.03,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1)
  commissionRate?: number;

  @ApiPropertyOptional({
    description:
      "정산 지급일 배열 (1~31, 31은 말일 의미. 예: [10, 31] = 매월 10일·말일 2회)",
    type: [Number],
    example: [10, 31],
    minItems: 1,
    maxItems: 4,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(31, { each: true })
  settlementDays?: number[];
}
