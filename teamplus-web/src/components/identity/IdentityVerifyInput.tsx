"use client";

/**
 * IdentityVerifyInput — 회원가입 본인인증 트리거 입력 컴포넌트
 *
 * UX:
 *   - 미인증: 이름 입력란 형태. 탭하면 PortOne SDK 호출 → KG 통합인증창
 *   - 인증 완료: 이름/휴대폰 자동 채움 + readonly + 체크 표시
 *
 * 부모는 onVerified 콜백으로 (requestId, name, phoneMasked, status) 를 받는다.
 * 회원가입 API 호출 시 requestId 를 identityVerificationId 로 전달.
 *
 * 백엔드:
 *   POST /identity/initiate-anonymous { provider:'portone', purpose:'registration' }
 *   POST /identity/callback/portone   { requestId, identityVerificationId }
 */

import { useCallback, useEffect, useState } from "react";
import {
  initiateAnonymousIdentity,
  submitPortOneCallback,
  parsePortOneSdkParams,
  type IdentityResult,
} from "@/services/identity";
import { isNativeApp } from "@/lib/environment";

/**
 * WebView 환경에서 PortOne `requestIdentityVerification` 은 popup 을
 * 띄우지 못해 즉시 USER_CANCEL 로 reject 된다. redirectUrl 옵션을
 * 지정하면 현재 페이지를 PortOne 으로 redirect → 인증 후 redirectUrl
 * 로 복귀하는 흐름으로 우회한다. sessionStorage 는 복귀 시 callback
 * 페이지가 결과를 원래 페이지로 핸드오프하는 통로다.
 */
const IDV_PENDING_KEY = "idv:pending";
const IDV_RESULT_KEY = "idv:result";
const IDV_HANDOFF_TTL_MS = 30 * 60 * 1000;

interface IdvPendingHandoff {
  requestId: string;
  identityVerificationId: string;
  returnTo: string;
  timestamp: number;
}

interface IdvResultHandoff {
  requestId: string;
  success: boolean;
  maskedName?: string;
  maskedPhone?: string;
  needsGuardianConsent?: boolean;
  errorMessage?: string;
  timestamp: number;
}

export interface IdentityVerifyResult {
  /** TEAMPLUS IdentityVerification.requestId — 회원가입 API 에 그대로 전달 */
  requestId: string;
  /** 마스킹된 이름 (홍*동) — 표시용 */
  maskedName?: string;
  /** 마스킹된 휴대폰 (010-****-5678) — 표시용 */
  maskedPhone?: string;
  /** 만 14세 미만 보호자 동의 필요 플래그 */
  needsGuardianConsent?: boolean;
}

export interface IdentityVerifyInputProps {
  /** 인증 완료 시 호출 (부모가 requestId 를 form 상태에 저장) */
  onVerified: (result: IdentityVerifyResult) => void;
  /** 인증 실패/취소 시 호출 (선택) */
  onError?: (message: string) => void;
  /** 이미 인증된 상태 표시 (부모가 form 상태로 유지) */
  verified?: IdentityVerifyResult | null;
  /** 라벨 (기본: "이름") */
  label?: string;
  /** disabled */
  disabled?: boolean;
  /** id (접근성 — htmlFor) */
  id?: string;
}

export default function IdentityVerifyInput({
  onVerified,
  onError,
  verified,
  label = "이름",
  disabled,
  id,
}: IdentityVerifyInputProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // WebView redirect 복귀 시 callback 페이지가 sessionStorage 에 적어둔
  // 결과를 회수해 부모 onVerified/onError 로 전달한다. 1회 소비 후 제거.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (verified) return;
    try {
      const raw = window.sessionStorage.getItem(IDV_RESULT_KEY);
      if (!raw) return;
      const result = JSON.parse(raw) as IdvResultHandoff;
      window.sessionStorage.removeItem(IDV_RESULT_KEY);
      if (Date.now() - result.timestamp > IDV_HANDOFF_TTL_MS) return;
      if (result.success) {
        onVerified({
          requestId: result.requestId,
          maskedName: result.maskedName,
          maskedPhone: result.maskedPhone,
          needsGuardianConsent: result.needsGuardianConsent,
        });
      } else {
        const msg = result.errorMessage || "본인인증이 완료되지 않았습니다.";
        setErrorMsg(msg);
        onError?.(msg);
      }
    } catch {
      // sessionStorage 접근 실패 시 무시
    }
  }, [verified, onVerified, onError]);

  const handleStartVerify = useCallback(async () => {
    if (disabled || loading) return;
    setErrorMsg(null);
    setLoading(true);

    try {
      // 1. 백엔드에 익명 인증 시작 요청
      const initRes = await initiateAnonymousIdentity({
        provider: "portone",
        purpose: "registration",
      });

      if (!initRes.success || !initRes.data?.success) {
        const msg =
          initRes.data?.errorMessage ||
          initRes.error?.message ||
          "본인인증 시작에 실패했습니다.";
        setErrorMsg(msg);
        onError?.(msg);
        return;
      }

      const { requestId, authHtml } = initRes.data;
      const sdkParams = parsePortOneSdkParams(authHtml);
      if (!sdkParams) {
        const msg = "본인인증 채널 설정을 불러올 수 없습니다.";
        setErrorMsg(msg);
        onError?.(msg);
        return;
      }

      // 2. PortOne SDK 호출 (KG 통합인증창)
      //    동적 import 로 초기 번들 사이즈 영향 최소화
      const PortOne = (await import("@portone/browser-sdk/v2")).default;

      // WebView 환경에서는 popup 모드가 동작하지 않으므로 redirectUrl
      // 모드로 우회한다. SDK 가 현재 페이지를 PortOne 으로 redirect →
      // 인증 완료 후 redirectUrl(/identity/callback) 로 복귀.
      //
      // `windowType.mobile: 'REDIRECTION'` + `forceRedirect: true` 를 명시
      // 하지 않으면 PG사 기본값(KG이니시스 = POPUP)으로 동작하여 redirectUrl
      // 만으로는 popup 차단 + 즉시 USER_CANCEL 가 발생한다.
      if (isNativeApp()) {
        const handoff: IdvPendingHandoff = {
          requestId,
          identityVerificationId: sdkParams.identityVerificationId,
          returnTo: window.location.pathname + window.location.search,
          timestamp: Date.now(),
        };
        window.sessionStorage.setItem(IDV_PENDING_KEY, JSON.stringify(handoff));
        const redirectUrl = `${window.location.origin}/identity/callback`;
        await PortOne.requestIdentityVerification({
          storeId: sdkParams.storeId,
          channelKey: sdkParams.channelKey,
          identityVerificationId: sdkParams.identityVerificationId,
          redirectUrl,
          windowType: { mobile: "REDIRECTION" },
          forceRedirect: true,
        });
        // redirect 모드에서는 location 이 바뀌므로 이 코드 라인까지 도달하면
        // 일반적으로 사용자가 인증을 시작도 하기 전 SDK 가 거부한 케이스다.
        return;
      }

      const idvResp = await PortOne.requestIdentityVerification({
        storeId: sdkParams.storeId,
        channelKey: sdkParams.channelKey,
        identityVerificationId: sdkParams.identityVerificationId,
      });

      if (idvResp?.code !== undefined) {
        // PortOne SDK 가 실패/취소 시 code 필드 반환
        const msg =
          idvResp.message || "본인인증이 완료되지 않았습니다. 다시 시도해주세요.";
        setErrorMsg(msg);
        onError?.(msg);
        return;
      }

      // 3. 백엔드에 콜백 전송 → PortOne REST 호출 → 결과 저장
      const cbRes = await submitPortOneCallback({
        requestId,
        identityVerificationId: sdkParams.identityVerificationId,
      });

      if (!cbRes.success || !cbRes.data?.success) {
        const msg =
          cbRes.data?.errorMessage ||
          cbRes.error?.message ||
          "본인인증 결과 처리에 실패했습니다.";
        setErrorMsg(msg);
        onError?.(msg);
        return;
      }

      const result: IdentityResult = cbRes.data;
      onVerified({
        requestId,
        maskedName: result.name,
        maskedPhone: result.phone,
        needsGuardianConsent: result.needsGuardianConsent,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "본인인증 중 오류가 발생했습니다.";
      setErrorMsg(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [disabled, loading, onError, onVerified]);

  // 인증 완료 상태
  if (verified) {
    return (
      <div className="space-y-1">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
        <div
          id={id}
          className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 dark:border-emerald-700 dark:bg-emerald-900/20"
        >
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            {verified.maskedName ?? "본인인증 완료"}
            {verified.maskedPhone && (
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                {verified.maskedPhone}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
            인증완료
          </span>
        </div>
        {verified.needsGuardianConsent && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            만 14세 미만은 보호자 동의가 필요합니다.
          </p>
        )}
      </div>
    );
  }

  // 미인증 상태
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label} <span className="text-rose-500">*</span>
      </label>
      <button
        type="button"
        id={id}
        onClick={handleStartVerify}
        disabled={disabled || loading}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3 text-left text-sm text-slate-500 transition hover:border-blue-500 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:bg-slate-700"
        aria-label="본인인증 시작"
      >
        <span>
          {loading
            ? "본인인증 진행 중..."
            : "탭하여 본인인증 시작 (휴대폰 인증)"}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="text-slate-400"
        >
          <path
            fillRule="evenodd"
            d="M7.3 5.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4-1.4L10.6 10 7.3 6.7a1 1 0 010-1.4z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {errorMsg && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{errorMsg}</p>
      )}
    </div>
  );
}
