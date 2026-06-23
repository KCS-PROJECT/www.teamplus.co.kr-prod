/**
 * 본인인증 서비스 (PortOne 경유 KG이니시스 통합인증)
 *
 * 흐름 (회원가입 직전 호출):
 *   1. initiateAnonymous({ provider:'portone' })
 *      → 백엔드가 IdentityVerification 레코드 생성 + 채널키/storeId/idvId 회신
 *   2. PortOne.requestIdentityVerification({ storeId, channelKey, identityVerificationId })
 *      → KG 통합인증창 노출 → 사용자 인증
 *   3. submitPortOneCallback({ requestId, identityVerificationId })
 *      → 백엔드가 PortOne REST 호출로 결과 조회 + DB 저장
 *   4. 회원가입 API 호출 시 requestId 를 identityVerificationId 로 전달
 */

import { api } from "./api-client";
import type { ApiResponse } from "@/types/api";

export type IdentityProvider =
  | "portone"
  | "kg_inicis"
  | "kakao"
  | "nice"
  | "pass";

export type IdentityPurpose =
  | "registration"
  | "payment"
  | "profile_update";

export type IdentityStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired";

/**
 * 익명 본인인증 시작 응답
 *
 * authHtml 은 portone 의 경우 JSON 문자열이며 SDK 호출에 필요한
 * { storeId, channelKey, identityVerificationId } 를 담는다.
 */
export interface InitiateIdentityResponse {
  success: boolean;
  requestId: string;
  authUrl?: string;
  authHtml?: string;
  expiresAt?: string;
  errorMessage?: string;
}

export interface PortOneSdkParams {
  storeId: string;
  channelKey: string;
  identityVerificationId: string;
}

/**
 * 본인인증 결과 조회 응답
 *
 * 백엔드가 민감 정보(이름/휴대폰/생년월일) 는 마스킹해서 반환.
 * 가입 폼에 자동 주입하려면 별도 plaintext 응답이 아닌 인증된 requestId
 * 를 회원가입 API 에 그대로 전달하면 백엔드가 ci/di 만 저장한다.
 */
export interface IdentityResult {
  success: boolean;
  requestId: string;
  status: IdentityStatus;
  name?: string; // 마스킹된 이름 (홍*동)
  phone?: string; // 마스킹된 휴대폰 (010-****-5678)
  birthDate?: string; // 마스킹된 생년월일 (1990-**-**)
  gender?: "M" | "F" | string;
  verifiedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  /** PIPA 만14세 미만 보호자 동의 필요 플래그 (backend computeAgeFlags) */
  isUnder14?: boolean;
  needsGuardianConsent?: boolean;
}

export interface IdentityStatusResponse {
  requestId: string;
  status: IdentityStatus;
  provider?: string;
  purpose?: string;
  requestedAt?: string;
  expiresAt?: string;
}

/**
 * 회원가입 전 익명 본인인증 시작 (JWT 불필요)
 */
export async function initiateAnonymousIdentity(params: {
  provider: IdentityProvider;
  purpose: IdentityPurpose;
  returnUrl?: string;
}): Promise<ApiResponse<InitiateIdentityResponse>> {
  return api.post<InitiateIdentityResponse>(
    "/identity/initiate-anonymous",
    params,
  );
}

/**
 * PortOne SDK 인증 완료 후 백엔드에 콜백 전송
 *
 * 백엔드가 PortOne REST API 로 인증 결과를 조회·저장한다.
 */
export async function submitPortOneCallback(params: {
  requestId: string;
  identityVerificationId: string;
}): Promise<ApiResponse<IdentityResult>> {
  return api.post<IdentityResult>("/identity/callback/portone", params);
}

/**
 * 본인인증 결과 조회 (마스킹된 응답)
 */
export async function getIdentityResult(
  requestId: string,
): Promise<ApiResponse<IdentityResult>> {
  return api.get<IdentityResult>(`/identity/result/${encodeURIComponent(requestId)}`);
}

/**
 * 본인인증 상태 폴링용 (선택)
 */
export async function checkIdentityStatus(
  requestId: string,
): Promise<ApiResponse<IdentityStatusResponse>> {
  return api.get<IdentityStatusResponse>(
    `/identity/status/${encodeURIComponent(requestId)}`,
  );
}

/**
 * PortOne authHtml(JSON 문자열) 을 SDK 파라미터 객체로 파싱.
 *
 * portone 게이트웨이는 별도 인증창 URL 대신 SDK 호출 파라미터를
 * authHtml 필드에 JSON 문자열로 회신한다.
 */
export function parsePortOneSdkParams(
  authHtml: string | undefined,
): PortOneSdkParams | null {
  if (!authHtml) return null;
  try {
    const parsed = JSON.parse(authHtml);
    if (
      parsed?.provider === "portone" &&
      parsed?.storeId &&
      parsed?.channelKey &&
      parsed?.identityVerificationId
    ) {
      return {
        storeId: parsed.storeId,
        channelKey: parsed.channelKey,
        identityVerificationId: parsed.identityVerificationId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

const identityService = {
  initiateAnonymous: initiateAnonymousIdentity,
  submitPortOneCallback,
  getResult: getIdentityResult,
  checkStatus: checkIdentityStatus,
  parsePortOneSdkParams,
};

export default identityService;
