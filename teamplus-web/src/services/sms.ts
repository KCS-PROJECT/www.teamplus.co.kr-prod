/**
 * SMS/OTP Service
 *
 * 휴대폰 인증번호 발송 및 확인 서비스
 */

import { api } from './api-client';
import { devLog } from '@/lib/logger';

/** OTP 발송 목적 */
export type OtpPurpose = 'signup' | 'find-id' | 'reset-password' | 'change-phone';

/** OTP 발송 요청 */
export interface SendOtpRequest {
  phone: string;
  purpose: OtpPurpose;
}

/** OTP 발송 결과 */
export interface SendOtpResponse {
  success: boolean;
  message: string;
  remainingTime?: number;
  /** 개발 환경 전용 OTP (백엔드 NODE_ENV !== 'production' 일 때만 포함) */
  devOtp?: string;
}

/** OTP 확인 요청 */
export interface VerifyOtpRequest {
  phone: string;
  purpose: OtpPurpose;
  code: string;
}

/** OTP 확인 결과 */
export interface VerifyOtpResponse {
  valid: boolean;
  message: string;
}

/** 재발송 가능 여부 확인 결과 */
export interface ResendStatusResponse {
  canResend: boolean;
  waitSeconds: number;
}

/**
 * 휴대폰 번호 정규화 (숫자만 추출)
 */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * 휴대폰 번호 유효성 검사
 */
export function validatePhone(phone: string): { valid: boolean; message: string } {
  const normalized = normalizePhone(phone);

  if (!normalized) {
    return { valid: false, message: '휴대폰 번호를 입력해주세요.' };
  }

  if (!/^01[0-9]{8,9}$/.test(normalized)) {
    return { valid: false, message: '올바른 휴대폰 번호 형식이 아닙니다. (예: 01012345678)' };
  }

  return { valid: true, message: '' };
}

/**
 * 인증번호 유효성 검사
 */
export function validateOtpCode(code: string): { valid: boolean; message: string } {
  if (!code) {
    return { valid: false, message: '인증번호를 입력해주세요.' };
  }

  if (!/^[0-9]{6}$/.test(code)) {
    return { valid: false, message: '인증번호는 6자리 숫자입니다.' };
  }

  return { valid: true, message: '' };
}

/**
 * 인증번호 발송
 */
export async function sendOtp(request: SendOtpRequest): Promise<SendOtpResponse> {
  const validation = validatePhone(request.phone);
  if (!validation.valid) {
    return { success: false, message: validation.message };
  }

  const response = await api.post<SendOtpResponse>('/sms/send', {
    phone: normalizePhone(request.phone),
    purpose: request.purpose,
  });

  if (response.success && response.data) {
    // 개발 환경 한정: OTP 를 브라우저 콘솔에 출력 (백엔드가 dev 일 때만 devOtp 가 응답에 포함됨)
    if (process.env.NODE_ENV !== 'production' && response.data.devOtp) {
      // eslint-disable-next-line no-console
      devLog(
        `%c[DEV SMS] OTP: ${response.data.devOtp} (purpose: ${request.purpose}, phone: ${normalizePhone(request.phone)})`,
        'color: #1E3FAE; font-weight: bold; font-size: 13px;',
      );
    }
    return response.data;
  }

  // API 에러 메시지 추출
  const message = response.error?.message || '인증번호 발송에 실패했습니다.';
  return { success: false, message };
}

/**
 * 인증번호 확인
 */
export async function verifyOtp(request: VerifyOtpRequest): Promise<VerifyOtpResponse> {
  const phoneValidation = validatePhone(request.phone);
  if (!phoneValidation.valid) {
    return { valid: false, message: phoneValidation.message };
  }

  const codeValidation = validateOtpCode(request.code);
  if (!codeValidation.valid) {
    return { valid: false, message: codeValidation.message };
  }

  const response = await api.post<VerifyOtpResponse>('/sms/verify', {
    phone: normalizePhone(request.phone),
    purpose: request.purpose,
    code: request.code,
  });

  if (response.success && response.data) {
    return response.data;
  }

  // API 에러 메시지 추출
  const message = response.error?.message || '인증번호 확인에 실패했습니다.';
  return { valid: false, message };
}

/**
 * 재발송 가능 여부 확인
 */
export async function checkResendStatus(phone: string): Promise<ResendStatusResponse> {
  const normalized = normalizePhone(phone);

  if (!normalized) {
    return { canResend: true, waitSeconds: 0 };
  }

  const response = await api.get<ResendStatusResponse>('/sms/resend-status', {
    params: { phone: normalized },
  });

  if (response.success && response.data) {
    return response.data;
  }

  // 에러 시 재발송 가능으로 처리 (서버에서 다시 검증)
  return { canResend: true, waitSeconds: 0 };
}

/**
 * 남은 시간 포맷팅 (초 → "MM:SS")
 */
export function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return '00:00';

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}
