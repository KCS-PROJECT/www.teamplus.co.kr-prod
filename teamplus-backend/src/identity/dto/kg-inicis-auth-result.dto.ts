import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * KG이니시스 통합인증 STEP2 결과 수신 DTO
 *
 * successUrl / failUrl 로 **사용자 브라우저**가 폼 POST 하는 값이다.
 * 규격 SoT: docs/Reference/INICIS_UNIFIED_IDENTITY_API.md §5
 *
 * `resultCode` 가 `0000` 이 아니면 나머지 값은 오지 않을 수 있으므로 필수는 resultCode 뿐이다.
 *
 * ⚠️ 이 클래스는 `@ApiBody()` 문서화 전용이다. 핸들러는 이 타입으로 body 를 받지 않는다 —
 *   전역 ValidationPipe(`forbidNonWhitelisted`)가 메서드 파이프보다 먼저 돌아, DTO 로 받으면
 *   KG 가 규격 외 필드를 하나만 더 보내도 400 JSON 이 나가고 핸들러가 호출되지 않는다.
 *   실제 필드 화이트리스트는 IdentityController 의 pickKgFields() 가 담당한다.
 */
export class KgInicisAuthResultDto {
  @ApiProperty({
    description: "결과코드 (0000 성공)",
    example: "0000",
  })
  @IsString()
  @IsNotEmpty()
  resultCode!: string;

  @ApiPropertyOptional({
    description: "결과메시지 (UTF-8 urlEncoding)",
    example: "%EC%9D%B8%EC%A6%9D%EC%84%B1%EA%B3%B5",
  })
  @IsOptional()
  @IsString()
  resultMsg?: string;

  @ApiPropertyOptional({
    description:
      "결과조회 요청 URL. 이니시스 제공 호스트인지 서버에서 검증한 뒤에만 호출한다.",
    example: "https://kssa.inicis.com/api/result",
  })
  @IsOptional()
  @IsString()
  authRequestUrl?: string;

  @ApiPropertyOptional({
    description: "통합인증 트랜잭션 ID",
    example: "TXID1234567890",
  })
  @IsOptional()
  @IsString()
  txId?: string;

  @ApiPropertyOptional({
    description:
      "SEED 복호화 키 (Base64). reservedMsg=isUseToken=Y 일 때만 전달되며 로그에 남기지 않는다.",
  })
  @IsOptional()
  @IsString()
  token?: string;
}
