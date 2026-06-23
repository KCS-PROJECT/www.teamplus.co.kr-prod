/**
 * 본인인증 Gateway 인터페이스
 *
 * 4개 제공자가 구현해야 하는 공통 인터페이스:
 * - KG이니시스
 * - 카카오
 * - NICE평가정보
 * - PASS 앱
 */

/**
 * 인증 요청 파라미터
 */
export interface IdentityRequestParams {
  /** 고유 요청 ID */
  requestId: string;

  /** 인증 목적 (registration | payment | profile_update) */
  purpose: "registration" | "payment" | "profile_update";

  /** 사용자 ID (로그인된 경우) */
  userId?: string;

  /** 리턴 URL (인증 완료 후) */
  returnUrl?: string;

  /** 요청 IP */
  clientIp?: string;

  /** User-Agent */
  userAgent?: string;

  /** 추가 데이터 (제공자별 커스텀) */
  metadata?: Record<string, any>;
}

/**
 * 인증 요청 결과
 */
export interface IdentityRequestResult {
  /** 성공 여부 */
  success: boolean;

  /** 인증 URL (사용자가 이동할 페이지) */
  authUrl?: string;

  /** 인증 요청 HTML (직접 렌더링하는 경우) */
  authHtml?: string;

  /** 요청 ID */
  requestId: string;

  /** 오류 코드 */
  errorCode?: string;

  /** 오류 메시지 */
  errorMessage?: string;
}

/**
 * 콜백 처리 파라미터
 */
export interface IdentityCallbackParams {
  /** 요청 ID */
  requestId: string;

  /** 제공자 응답 데이터 */
  responseData: Record<string, any>;

  /** 서명 값 (검증용) */
  signature?: string;

  /** 요청 IP */
  clientIp?: string;
}

/**
 * 인증 결과 데이터
 */
export interface IdentityVerificationResult {
  /** 성공 여부 */
  success: boolean;

  /** 요청 ID */
  requestId: string;

  /** CI (Connecting Information) - 암호화 전 */
  ci?: string;

  /** DI (Duplicate Information) - 암호화 전 */
  di?: string;

  /** 인증된 이름 */
  name?: string;

  /** 인증된 전화번호 */
  phone?: string;

  /** 생년월일 (YYYYMMDD) */
  birthDate?: string;

  /** 성별 (M/F) */
  gender?: string;

  /** 통신사 (PASS 전용) */
  carrier?: string;

  /** 외국인 여부 */
  isForeigner?: boolean;

  /** 인증 일시 */
  verifiedAt?: Date;

  /** 오류 코드 */
  errorCode?: string;

  /** 오류 메시지 */
  errorMessage?: string;
}

/**
 * 서명 검증 결과
 */
export interface SignatureVerificationResult {
  /** 검증 성공 여부 */
  valid: boolean;

  /** 오류 메시지 */
  errorMessage?: string;
}

/**
 * 본인인증 제공자 타입
 */
export type IdentityProvider = "kg_inicis" | "kakao" | "nice" | "pass";

/**
 * 본인인증 Gateway 추상 인터페이스
 *
 * 모든 본인인증 제공자는 이 인터페이스를 구현해야 합니다.
 */
export interface IIdentityGateway {
  /**
   * 제공자 이름
   */
  readonly providerName: IdentityProvider;

  /**
   * 인증 요청 생성
   *
   * 사용자를 인증 페이지로 리다이렉트할 URL 또는 HTML을 반환합니다.
   *
   * @param params - 인증 요청 파라미터
   * @returns 인증 요청 결과 (URL 또는 HTML)
   */
  createAuthRequest(
    params: IdentityRequestParams,
  ): Promise<IdentityRequestResult>;

  /**
   * 콜백 처리
   *
   * 제공자로부터 받은 콜백 데이터를 처리하여 인증 결과를 반환합니다.
   *
   * @param params - 콜백 파라미터
   * @returns 인증 결과
   */
  processCallback(
    params: IdentityCallbackParams,
  ): Promise<IdentityVerificationResult>;

  /**
   * 서명 검증
   *
   * 콜백 데이터의 무결성을 검증합니다.
   *
   * @param data - 검증할 데이터
   * @param signature - 서명 값
   * @returns 검증 결과
   */
  verifySignature(
    data: Record<string, any>,
    signature: string,
  ): SignatureVerificationResult;

  /**
   * IP 화이트리스트 검증
   *
   * 요청이 허용된 IP에서 왔는지 확인합니다.
   *
   * @param ip - 요청 IP
   * @returns 허용 여부
   */
  verifyIpWhitelist(ip: string): boolean;

  /**
   * 인증 데이터 복호화
   *
   * 제공자로부터 받은 암호화된 데이터를 복호화합니다.
   *
   * @param encryptedData - 암호화된 데이터
   * @returns 복호화된 데이터
   */
  decryptData(encryptedData: string): Promise<Record<string, any>>;
}
