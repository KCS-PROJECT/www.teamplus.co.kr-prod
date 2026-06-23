import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  Matches,
} from "class-validator";

/**
 * 암호화된 로그인 요청 DTO
 *
 * 클라이언트에서 전송하는 암호화된 이메일/비밀번호 페이로드
 *
 * 요청 바디:
 * ```json
 * {
 *   "encryptedData": "gU3x7F...",    // Base64 암호화 데이터
 *   "iv": "kL9p1Q...",               // Base64 IV (16 바이트)
 *   "authTag": "mN4r2T..."           // Base64 인증 태그 (16 바이트)
 * }
 * ```
 *
 * 서버 처리:
 * ```typescript
 * @Post('login')
 * async login(@Body() encryptedDto: EncryptedLoginDto) {
 *   const decrypted = decryptCredentials(encryptedDto);
 *   const { email, password } = JSON.parse(decrypted);
 *   // ...기존 인증 로직...
 * }
 * ```
 */
export class EncryptedLoginDto {
  /**
   * Base64 암호화 데이터
   *
   * 포함 내용: {"email": "user@example.com", "password": "secret", "_pad": "..."}
   * AES-256-GCM으로 암호화됨
   *
   * 크기 제한: 100 ~ 2732 글자 (최대 2KB 페이로드)
   * - 최소: 100자 (DoS 공격 방지, 클라이언트에서 패딩 추가)
   * - 최대: 2732자 = 2048 바이트 Base64 인코딩
   */
  @IsString({ message: "encryptedData는 문자열이어야 합니다" })
  @IsNotEmpty({ message: "encryptedData는 필수입니다" })
  @MinLength(100, {
    message: "encryptedData는 최소 100글자 이상이어야 합니다",
  })
  @MaxLength(2732, {
    message: "encryptedData는 최대 2732글자(2KB)를 초과할 수 없습니다",
  })
  @Matches(/^[A-Za-z0-9+/=]+$/, {
    message: "encryptedData는 유효한 Base64 형식이어야 합니다",
  })
  encryptedData!: string;

  /**
   * Base64 IV (Initialization Vector, 16바이트)
   *
   * AES-GCM의 Initialization Vector
   * 모든 암호화마다 새로 생성 (재사용 방지)
   *
   * 크기 제한: 정확히 24글자 (16 바이트 Base64 인코딩)
   */
  @IsString({ message: "iv는 문자열이어야 합니다" })
  @IsNotEmpty({ message: "iv는 필수입니다" })
  @MinLength(24, {
    message: "iv는 정확히 24글자여야 합니다 (16 바이트 Base64)",
  })
  @MaxLength(24, {
    message: "iv는 정확히 24글자여야 합니다 (16 바이트 Base64)",
  })
  @Matches(/^[A-Za-z0-9+/=]+$/, {
    message: "iv는 유효한 Base64 형식이어야 합니다",
  })
  iv!: string;

  /**
   * Base64 인증 태그 (16바이트)
   *
   * GCM 모드에서 생성되는 인증 태그
   * 데이터 무결성 검증 및 변조 감지
   *
   * 크기 제한: 정확히 24글자 (16 바이트 Base64 인코딩)
   */
  @IsString({ message: "authTag는 문자열이어야 합니다" })
  @IsNotEmpty({ message: "authTag는 필수입니다" })
  @MinLength(24, {
    message: "authTag는 정확히 24글자여야 합니다 (16 바이트 Base64)",
  })
  @MaxLength(24, {
    message: "authTag는 정확히 24글자여야 합니다 (16 바이트 Base64)",
  })
  @Matches(/^[A-Za-z0-9+/=]+$/, {
    message: "authTag는 유효한 Base64 형식이어야 합니다",
  })
  authTag!: string;
}
