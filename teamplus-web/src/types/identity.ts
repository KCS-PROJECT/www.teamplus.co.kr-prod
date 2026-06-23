/**
 * 본인인증 관련 공통 타입 정의
 * Flutter와 Next.js에서 공통으로 사용
 */

// 본인인증 제공자
export type IdentityProvider = 'kg_inicis' | 'kakao' | 'nice' | 'pass';

// 본인인증 목적
export type IdentityPurpose = 'registration' | 'payment';

// 본인인증 상태
export type IdentityStatus = 'pending' | 'verified' | 'failed' | 'expired';

// 본인인증 요청 시작 결과
export interface IdentityInitiateResult {
  success: boolean;
  requestId?: string;
  authUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

// 본인인증 완료 결과
export interface IdentityVerificationResult {
  success: boolean;
  requestId: string;
  verifiedName?: string;
  verifiedPhone?: string;
  verifiedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

// 사용자 본인인증 상태
export interface UserIdentityStatus {
  isVerified: boolean;
  verifiedAt?: string;
  verifiedName?: string;
}

// 본인인증 콜백 데이터
export interface IdentityCallbackData {
  requestId: string;
  success: boolean;
  provider?: string;
  errorCode?: string;
  errorMessage?: string;
}

// 제공자별 디스플레이 정보
export const IdentityProviderInfo: Record<IdentityProvider, { name: string; description: string }> = {
  kg_inicis: { name: 'KG이니시스', description: '신용카드 본인인증' },
  kakao: { name: '카카오', description: '카카오톡 간편인증' },
  nice: { name: 'NICE평가정보', description: '휴대폰 본인인증' },
  pass: { name: 'PASS', description: '통신사 PASS 인증' },
};
