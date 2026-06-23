"use client";

/**
 * /identity/callback — PortOne `redirectUrl` 복귀 처리 페이지
 *
 * WebView 환경에서 IdentityVerifyInput 이 PortOne SDK 를 redirect 모드로
 * 호출하면, 인증 완료 후 PortOne 이 이 페이지로 GET redirect 한다.
 * 이 페이지는 결과를 sessionStorage 에 저장하고 사용자가 인증을 시작한
 * 원래 페이지(returnTo)로 router.replace 한다.
 *
 * URL 쿼리 (PortOne v2 기준):
 *   - identityVerificationId : 항상 포함
 *   - identityVerificationTxId : 성공 시 포함
 *   - code, message : 실패/취소 시 포함 (code 부재 = 성공)
 */

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { submitPortOneCallback } from "@/services/identity";

const IDV_PENDING_KEY = "idv:pending";
const IDV_RESULT_KEY = "idv:result";

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

export default function IdentityCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // PortOne redirect 가 페이지 mount 를 두 번 트리거할 수 있으므로
  // 처리 1회 보장. callback API 중복 호출 방지가 목적.
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const code = searchParams.get("code");
    const message = searchParams.get("message");
    const identityVerificationId = searchParams.get("identityVerificationId");

    let pending: IdvPendingHandoff | null = null;
    try {
      const raw = window.sessionStorage.getItem(IDV_PENDING_KEY);
      if (raw) {
        pending = JSON.parse(raw) as IdvPendingHandoff;
        window.sessionStorage.removeItem(IDV_PENDING_KEY);
      }
    } catch {
      pending = null;
    }

    // pending 이 없으면 직접 진입 또는 sessionStorage 유실 — 회원가입으로 보냄
    if (!pending) {
      router.replace("/signup");
      return;
    }

    const writeResultAndReturn = (result: IdvResultHandoff) => {
      try {
        window.sessionStorage.setItem(IDV_RESULT_KEY, JSON.stringify(result));
      } catch {
        // 저장 실패 시도 그대로 진행 (IdentityVerifyInput 이 결과를 못 받아 재시도하게 됨)
      }
      router.replace(pending!.returnTo);
    };

    // 실패/취소 분기
    if (code) {
      writeResultAndReturn({
        requestId: pending.requestId,
        success: false,
        errorMessage: message || "본인인증이 완료되지 않았습니다.",
        timestamp: Date.now(),
      });
      return;
    }

    // 성공 — 백엔드 callback 호출해서 결과 fetch
    (async () => {
      try {
        const cbRes = await submitPortOneCallback({
          requestId: pending!.requestId,
          identityVerificationId:
            identityVerificationId || pending!.identityVerificationId,
        });

        if (!cbRes.success || !cbRes.data?.success) {
          writeResultAndReturn({
            requestId: pending!.requestId,
            success: false,
            errorMessage:
              cbRes.data?.errorMessage ||
              cbRes.error?.message ||
              "본인인증 결과 처리에 실패했습니다.",
            timestamp: Date.now(),
          });
          return;
        }

        writeResultAndReturn({
          requestId: pending!.requestId,
          success: true,
          maskedName: cbRes.data.name,
          maskedPhone: cbRes.data.phone,
          needsGuardianConsent: cbRes.data.needsGuardianConsent,
          timestamp: Date.now(),
        });
      } catch (err) {
        writeResultAndReturn({
          requestId: pending!.requestId,
          success: false,
          errorMessage:
            err instanceof Error
              ? err.message
              : "본인인증 결과 처리 중 오류가 발생했습니다.",
          timestamp: Date.now(),
        });
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-wbg dark:bg-puck">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-ice-500 border-t-transparent" />
        <p className="text-sm font-medium text-wtext-2 dark:text-rink-100">
          본인인증 결과를 처리하고 있어요...
        </p>
      </div>
    </div>
  );
}
