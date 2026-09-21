"use client";

/**
 * /identity/callback — 본인인증 제공자 복귀 처리 페이지
 *
 * 두 provider 의 복귀를 함께 처리한다 (Phase 2, 2026-09-18):
 *
 * PortOne (`redirectUrl` 복귀, provider === 'portone'):
 *   WebView 환경에서 IdentityVerifyInput 이 PortOne SDK 를 redirect 모드로
 *   호출하면, 인증 완료 후 PortOne 이 이 페이지로 GET redirect 한다.
 *   URL 쿼리: identityVerificationId(항상) · code/message(실패·취소 시, 부재=성공)
 *
 * KG이니시스 직결 (백엔드 302 복귀, provider === 'kg_inicis'):
 *   IdentityVerifyInput 이 authHtml 을 document.write 로 그려 KG 인증창으로
 *   페이지 전환하면, KG → 백엔드(successUrl/failUrl) → 이 페이지로 302 리다이렉트된다.
 *   URL 쿼리: requestId · status(completed|failed) · code(실패 시). PII 는 싣지 않으므로
 *   마스킹된 이름/휴대폰은 제공되지 않는다 — signup 화면은 "본인인증 완료" 로 표시한다.
 *
 *   팝업 모드(웹 브라우저, 2026-09-21): KG 인증창이 팝업에서 열렸다면 위 302 는
 *   팝업 안에서 이 페이지로 떨어진다. 이때는 sessionStorage 의 pending 핸드오프에
 *   의존하지 않고(팝업은 별도 창이라 부모의 sessionStorage 를 공유하지 않을 수 있다)
 *   쿼리(authWindow=popup)만으로 판단해 postMessage(+보조 localStorage 크럼)로
 *   부모(IdentityVerifyInput)에 결과를 돌려주고 스스로 닫는다.
 *   [R1 #2] postMessage 는 opener 가 살아있을 때만 시도하지만, 크럼 저장과
 *   window.close() 는 opener 존재 여부와 무관하게 항상 실행한다 — opener 가
 *   끊긴 경우에도 부모가 storage 이벤트로 결과를 받아야 하고, 팝업 자체도
 *   pending 경로로 새지 않고 스스로 닫혀야 한다. authWindow=popup 인 경우
 *   어떤 결과든 다른 페이지로 router.replace 하지 않는다 — close() 가 무시되는
 *   드문 경우(스크립트로 열리지 않은 창 등)에는 "이 창을 닫아주세요" 안내만 남긴다.
 *
 * 페이지 전환 경로(팝업 미사용/차단, 네이티브 웹뷰)는 결과를 sessionStorage 에
 * 저장하고 사용자가 인증을 시작한 원래 페이지(returnTo)로 router.replace 한다.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { submitPortOneCallback } from "@/services/identity";
import { MESSAGES } from "@/lib/messages";
import {
  IDV_AUTH_WINDOW_QUERY_PARAM,
  IDV_AUTH_WINDOW_POPUP_VALUE,
  IDV_POPUP_MESSAGE_TYPE,
  IDV_POPUP_STORAGE_KEY,
  IDV_PENDING_KEY,
  IDV_RESULT_KEY,
  resolveKgFailureMessage,
  type IdvPopupResultMessage,
  type IdvPendingHandoff,
  type IdvResultHandoff,
} from "@/lib/identity-popup";

export default function IdentityCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // PortOne redirect 가 페이지 mount 를 두 번 트리거할 수 있으므로
  // 처리 1회 보장. callback API 중복 호출 방지가 목적.
  const processedRef = useRef(false);
  // [R1 #2] 팝업이 window.close() 로 스스로 닫히지 못한 경우(스크립트로 열리지
  // 않은 창 등)에만 표시되는 안내 — 정상 케이스는 창이 사라지므로 이 렌더를
  // 사용자가 보지 못한다.
  const [popupCloseNoticeVisible, setPopupCloseNoticeVisible] = useState(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const code = searchParams.get("code");
    const message = searchParams.get("message");
    const identityVerificationId = searchParams.get("identityVerificationId");

    // 팝업 모드 배달 — sessionStorage(pending)에 의존하지 않고 쿼리만으로 판단한다.
    // 팝업은 부모와 별도 브라우징 컨텍스트라 sessionStorage 를 공유하지 않을 수
    // 있고, 애초에 부모의 폼 상태를 건드리지 않는 것이 팝업 모드의 목적이므로
    // 여기서는 결과를 postMessage/크럼으로만 전달한다. opener 존재 여부와 무관하게
    // 이 분기에 들어오면 어떤 경우에도 pending 경로나 /signup 으로 새지 않는다.
    const authWindow = searchParams.get(IDV_AUTH_WINDOW_QUERY_PARAM);
    if (authWindow === IDV_AUTH_WINDOW_POPUP_VALUE) {
      const requestId = searchParams.get("requestId") || "";
      const status = searchParams.get("status") || "failed";
      // needsGuardianConsent 는 PII 가 아닌 불리언 플래그라 302 쿼리로 승계된다
      // (identity.controller.ts buildIdentityRedirect 참조).
      const needsGuardianConsent = searchParams.get("guardianConsent") === "1";
      const resultMessage: IdvPopupResultMessage = {
        type: IDV_POPUP_MESSAGE_TYPE,
        requestId,
        status,
        code,
        needsGuardianConsent,
      };

      if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(resultMessage, window.location.origin);
        } catch {
          // COOP 등으로 postMessage 자체가 던져질 수 있다 — 아래 storage 크럼이 보조 통로.
        }
      }
      // [R1 #2] opener 존재 여부와 무관하게 항상 실행 — opener 가 끊긴 경우에도
      // 부모가 storage 이벤트로 결과를 받고, 팝업 자체도 스스로 닫혀야 한다.
      try {
        window.localStorage.setItem(
          IDV_POPUP_STORAGE_KEY,
          JSON.stringify({ ...resultMessage, timestamp: Date.now() }),
        );
      } catch {
        // localStorage 접근 실패 시 무시 — postMessage 가 이미 시도됐다.
      }
      window.close();
      // close() 가 무시되면(스크립트로 열리지 않은 창 등) 이 렌더가 사용자에게
      // 보인다 — authWindow=popup 경로는 어떤 경우에도 다른 페이지로 보내지 않는다.
      setPopupCloseNoticeVisible(true);
      return;
    }

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

    // KG이니시스 직결 복귀 — pending.provider 로만 분기한다(쿼리 존재 여부 신뢰 금지, R1 #1).
    // portone 분기(아래)는 pending.provider === "portone" 일 때만 도달한다.
    if (pending.provider === "kg_inicis") {
      const returnedRequestId = searchParams.get("requestId");
      const kgStatus = searchParams.get("status");

      // 최초 요청자(pending.requestId)와 다른 값이 돌아오면 신뢰하지 않는다.
      if (!returnedRequestId || returnedRequestId !== pending.requestId) {
        writeResultAndReturn({
          requestId: pending.requestId,
          success: false,
          errorMessage: MESSAGES.verify.identityFailed,
          timestamp: Date.now(),
        });
        return;
      }

      if (kgStatus === "completed") {
        writeResultAndReturn({
          requestId: pending.requestId,
          success: true,
          // [R1 #4] PII 아닌 불리언 플래그라 302 쿼리로 승계된다 — 이 값이 없으면
          // 페이지 전환 경로(팝업 차단/네이티브)에서 만 14세 미만 보호자 동의
          // 안내가 조용히 사라진다.
          needsGuardianConsent: searchParams.get("guardianConsent") === "1",
          timestamp: Date.now(),
        });
      } else {
        writeResultAndReturn({
          requestId: pending.requestId,
          success: false,
          errorMessage: resolveKgFailureMessage(code, {
            identityFailed: MESSAGES.verify.identityFailed,
            identityFailedByCode: MESSAGES.verify.identityFailedByCode,
          }),
          timestamp: Date.now(),
        });
      }
      return;
    }

    // 실패/취소 분기 (PortOne)
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

  if (popupCloseNoticeVisible) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-wbg dark:bg-puck">
        <p className="text-sm font-medium text-wtext-2 dark:text-rink-100">
          {MESSAGES.verify.popupCloseManually}
        </p>
      </div>
    );
  }

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
