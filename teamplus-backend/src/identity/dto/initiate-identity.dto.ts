import { IsString, IsEnum, IsOptional } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 본인인증 제공자 타입
 */
export enum IdentityProviderType {
  KG_INICIS = "kg_inicis",
  KAKAO = "kakao",
  NICE = "nice",
  PASS = "pass",
  /**
   * 포트원(PortOne) 게이트웨이 경유 KG이니시스 통합인증.
   * 직계약 KG_INICIS 와 별도 채널로 운용 (2026-05-26 결정).
   */
  PORTONE = "portone",
}

/**
 * 본인인증 목적
 */
export enum IdentityPurpose {
  REGISTRATION = "registration",
  PAYMENT = "payment",
  PROFILE_UPDATE = "profile_update",
}

/**
 * 본인인증 시작 요청 DTO
 */
export class InitiateIdentityDto {
  @ApiProperty({
    enum: IdentityProviderType,
    description: "본인인증 제공자",
    example: IdentityProviderType.KAKAO,
  })
  @IsEnum(IdentityProviderType)
  provider!: IdentityProviderType;

  @ApiProperty({
    enum: IdentityPurpose,
    description: "본인인증 목적",
    example: IdentityPurpose.REGISTRATION,
  })
  @IsEnum(IdentityPurpose)
  purpose!: IdentityPurpose;

  @ApiPropertyOptional({
    description: "인증 완료 후 리다이렉트 URL",
    example: "https://example.com/identity/result",
  })
  @IsOptional()
  @IsString()
  returnUrl?: string;

  @ApiPropertyOptional({
    description: "추가 메타데이터",
    example: { orderId: "12345" },
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * 본인인증 시작 응답 DTO
 */
export class InitiateIdentityResponseDto {
  @ApiProperty({
    description: "요청 성공 여부",
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: "고유 요청 ID",
    example: "req_abc123xyz789",
  })
  requestId!: string;

  @ApiPropertyOptional({
    description: "인증 페이지 URL (제공자 페이지로 리다이렉트)",
    example: "https://auth.provider.com/verify?token=xyz",
  })
  authUrl?: string;

  @ApiPropertyOptional({
    description: "인증 요청 HTML (팝업 방식)",
  })
  authHtml?: string;

  @ApiPropertyOptional({
    description: "인증 요청 만료 시간",
    example: "2025-01-15T10:30:00Z",
  })
  expiresAt?: string;

  @ApiPropertyOptional({
    description: "오류 메시지",
    example: "인증 요청 생성에 실패했습니다.",
  })
  errorMessage?: string;
}
