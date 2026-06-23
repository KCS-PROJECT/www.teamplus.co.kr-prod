import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 본인인증 상태
 */
export enum IdentityStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  EXPIRED = "expired",
}

/**
 * 본인인증 결과 응답 DTO
 */
export class IdentityResultDto {
  @ApiProperty({
    description: "요청 성공 여부",
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: "요청 ID",
    example: "req_abc123xyz789",
  })
  requestId!: string;

  @ApiProperty({
    enum: IdentityStatus,
    description: "인증 상태",
    example: IdentityStatus.COMPLETED,
  })
  status!: IdentityStatus;

  @ApiPropertyOptional({
    description: "인증된 이름",
    example: "홍길동",
  })
  name?: string;

  @ApiPropertyOptional({
    description: "인증된 전화번호 (마스킹)",
    example: "010-****-5678",
  })
  phone?: string;

  @ApiPropertyOptional({
    description: "생년월일 (마스킹)",
    example: "1990-**-**",
  })
  birthDate?: string;

  @ApiPropertyOptional({
    description: "성별",
    example: "M",
  })
  gender?: string;

  @ApiPropertyOptional({
    description: "인증 완료 시간",
    example: "2025-01-14T10:30:00Z",
  })
  verifiedAt?: string;

  @ApiPropertyOptional({
    description: "오류 코드",
    example: "AUTH_EXPIRED",
  })
  errorCode?: string;

  @ApiPropertyOptional({
    description: "오류 메시지",
    example: "인증 요청이 만료되었습니다.",
  })
  errorMessage?: string;

  /**
   * [2026-05-13 Phase E-5] PIPA 만 14세 미만 보호.
   *
   * 인증된 사용자가 만 14세 미만인 경우 `true`. 클라이언트는 이 플래그를 보고
   * 일반 회원가입 흐름 대신 **보호자 동의 절차** (별도 양식 + 보호자 동의서) 로
   * 라우팅해야 한다. 만 14세 이상이거나 birthDate 불명확이면 `false`.
   *
   * 근거: 개인정보보호법 §22의2 — 만 14세 미만 아동의 개인정보 처리에 대한
   * 법정대리인 동의 의무.
   */
  @ApiPropertyOptional({
    description: "만 14세 미만 여부 (true 시 보호자 동의 필수)",
    example: false,
  })
  isUnder14?: boolean;

  @ApiPropertyOptional({
    description: "보호자 동의 절차 필요 여부",
    example: false,
  })
  needsGuardianConsent?: boolean;
}

/**
 * 본인인증 상태 확인 응답 DTO
 */
export class IdentityStatusDto {
  @ApiProperty({
    description: "요청 ID",
    example: "req_abc123xyz789",
  })
  requestId!: string;

  @ApiProperty({
    enum: IdentityStatus,
    description: "인증 상태",
    example: IdentityStatus.PENDING,
  })
  status!: IdentityStatus;

  @ApiPropertyOptional({
    description: "인증 제공자",
    example: "kakao",
  })
  provider?: string;

  @ApiPropertyOptional({
    description: "인증 목적",
    example: "registration",
  })
  purpose?: string;

  @ApiPropertyOptional({
    description: "요청 시간",
    example: "2025-01-14T10:00:00Z",
  })
  requestedAt?: string;

  @ApiPropertyOptional({
    description: "만료 시간",
    example: "2025-01-14T10:30:00Z",
  })
  expiresAt?: string;
}

/**
 * 사용자 인증 상태 응답 DTO
 */
export class UserIdentityStatusDto {
  @ApiProperty({
    description: "사용자 ID",
    example: "user_abc123",
  })
  userId!: string;

  @ApiProperty({
    description: "본인인증 완료 여부",
    example: true,
  })
  isVerified!: boolean;

  @ApiPropertyOptional({
    description: "인증 완료 시간",
    example: "2025-01-14T10:30:00Z",
  })
  verifiedAt?: string;

  @ApiPropertyOptional({
    description: "인증된 이름 (마스킹)",
    example: "홍*동",
  })
  verifiedName?: string;

  @ApiPropertyOptional({
    description: "인증에 사용된 제공자",
    example: "kakao",
  })
  provider?: string;
}
