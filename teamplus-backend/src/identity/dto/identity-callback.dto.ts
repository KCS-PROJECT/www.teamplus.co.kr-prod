import { IsString, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 본인인증 콜백 요청 DTO
 *
 * 각 제공자로부터 받는 콜백 데이터
 */
export class IdentityCallbackDto {
  @ApiPropertyOptional({
    description: "요청 ID (일부 제공자만 제공)",
    example: "req_abc123xyz789",
  })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional({
    description: "인증 코드 (OAuth 방식)",
    example: "auth_code_xyz",
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: "상태 값 (CSRF 방지)",
    example: "state_123",
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({
    description: "인증 토큰 (일부 제공자)",
    example: "token_xyz",
  })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({
    description: "암호화된 데이터 (NICE)",
    example: "encrypted_data_string",
  })
  @IsOptional()
  @IsString()
  encData?: string;

  @ApiPropertyOptional({
    description: "무결성 검증 값 (NICE)",
    example: "integrity_value",
  })
  @IsOptional()
  @IsString()
  integrityValue?: string;

  @ApiPropertyOptional({
    description: "결과 코드",
    example: "0000",
  })
  @IsOptional()
  @IsString()
  resultCode?: string;

  @ApiPropertyOptional({
    description: "결과 메시지",
    example: "인증 성공",
  })
  @IsOptional()
  @IsString()
  resultMsg?: string;

  @ApiPropertyOptional({
    description: "서명 값",
    example: "signature_hash",
  })
  @IsOptional()
  @IsString()
  signature?: string;
}

/**
 * KG이니시스 본인인증 콜백 DTO
 */
export class KgInicisIdentityCallbackDto extends IdentityCallbackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  txId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authToken?: string;
}

/**
 * 카카오 인증 콜백 DTO
 */
export class KakaoIdentityCallbackDto extends IdentityCallbackDto {
  @ApiPropertyOptional({
    description: "카카오 에러 코드",
    example: "access_denied",
  })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({
    description: "카카오 에러 설명",
    example: "사용자가 인증을 취소했습니다.",
  })
  @IsOptional()
  @IsString()
  error_description?: string;
}

/**
 * NICE평가정보 콜백 DTO
 */
export class NiceIdentityCallbackDto extends IdentityCallbackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tokenVersionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reqNo?: string;
}

/**
 * PASS 앱 콜백 DTO
 */
export class PassIdentityCallbackDto extends IdentityCallbackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  txId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrier?: string; // SKT, KT, LGU+
}

/**
 * 포트원(PortOne) 본인인증 콜백 DTO
 *
 * 프론트 @portone/browser-sdk 의 requestIdentityVerification() 성공 후
 * 클라이언트가 백엔드로 전달하는 페이로드. PortOne REST API 로
 * 인증 결과를 조회할 때 키로 사용된다.
 */
export class PortOneIdentityCallbackDto extends IdentityCallbackDto {
  @ApiPropertyOptional({
    description: "포트원 발급 identityVerificationId (인증 조회 키)",
    example: "id-verify-01HXYZ123",
  })
  @IsOptional()
  @IsString()
  identityVerificationId?: string;
}
