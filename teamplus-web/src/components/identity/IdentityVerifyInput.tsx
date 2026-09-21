"use client";

/**
 * IdentityVerifyInput — 회원가입 본인인증 트리거 입력 컴포넌트
 *
 * UX:
 *   - 미인증: 이름 입력란 형태. 탭하면 본인인증 시작 (provider 는 서버가 결정)
 *   - 인증 완료: 이름/휴대폰 자동 채움 + readonly + 체크 표시
 *
 * 부모는 onVerified 콜백으로 (requestId, name, phoneMasked, status) 를 받는다.
 * 회원가입 API 호출 시 requestId 를 identityVerificationId 로 전달.
 *
 * provider 분기 (Phase 2, 2026-09-18 — 서버가 activeProvider 로 결정, 응답의
 * provider 필드로 프론트가 갈라진다):
 *   - portone (기본): PortOne SDK 동적 import → KG 통합인증창. 웹뷰는 redirectUrl
 *     모드로 우회 (기존 로직 그대로).
 *   - kg_inicis: authHtml 은 KG 인증창으로 자동 submit 되는 HTML 문서 문자열이다.
 *     SDK 미개입. 웹 브라우저는 팝업(400x640)에 그려 넣고, 앱 웹뷰는 기존대로
 *     document 를 통째로 교체하는 페이지 전환을 쓴다(팝업 모드, 2026-09-21).
 *     결과는 성공/실패 URL 폴백 없이 백엔드 302 리다이렉트로만 돌아온다.
 *
 * 팝업 모드 (웹 브라우저, isNativeApp() === false && activeProvider === 'kg_inicis'):
 *   0. [R1 #3] 마운트 시 GET /identity/active-provider 로 activeProvider 를
 *      미리 조회해둔다. 클릭 시점에 이 값이 kg_inicis 로 확인된 경우에만 팝업을
 *      시도한다 — 운영 기본값이 아직 portone 인 상태로 배포되면 모든 웹 사용자가
 *      쓰이지도 않을 빈 팝업을 보게 되므로, 모를 때(null/조회 실패)는 팝업을
 *      아예 열지 않고 기존 경로(포트원 SDK 자체 팝업/redirect)로 그대로 둔다.
 *   1. 클릭 핸들러의 동기 구간에서 빈 팝업을 먼저 연다(window.open) — 사용자
 *      제스처가 소진되기 전에 열어야 Safari 등의 팝업 차단을 피한다.
 *   2. initiateAnonymousIdentity 응답의 authHtml 을 팝업 document 에 그려 넣는다.
 *      팝업이 KG 인증창으로 자동 submit 되어 이동한다. 그 직전에 popup.closed 를
 *      다시 확인해, 네트워크 왕복 중 사용자가 이미 닫았다면 페이지 전환으로 합류한다.
 *   3. 팝업이 /identity/callback?authWindow=popup 에 착지하면 postMessage(+보조
 *      localStorage 크럼)로 결과(및 needsGuardianConsent)를 돌려주고 스스로 닫는다
 *      — 부모(이 컴포넌트)의 폼 상태는 그대로 유지된다. 팝업이 postMessage 직후
 *      곧장 close() 하므로, 닫힘 감지는 유예 시간을 두고 확정한다(경합 방지).
 *   4. window.open 이 null(팝업 차단)이면 조용히 앱 웹뷰와 동일한 페이지 전환으로
 *      강등한다 — 이때만 onBeforeRedirect 로 폼 스냅샷을 남긴다.
 *
 * 백엔드:
 *   POST /identity/initiate-anonymous { purpose:'registration', returnUrl }
 *   POST /identity/callback/portone   { requestId, identityVerificationId }  (portone 전용)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initiateAnonymousIdentity,
  submitPortOneCallback,
  parsePortOneSdkParams,
  getActiveIdentityProvider,
  type IdentityResult,
  type IdentityProvider,
} from "@/services/identity";
import { isNativeApp } from "@/lib/environment";
import { MESSAGES } from "@/lib/messages";
import {
  IDV_AUTH_WINDOW_QUERY_PARAM,
  IDV_AUTH_WINDOW_POPUP_VALUE,
  IDV_POPUP_MESSAGE_TYPE,
  IDV_POPUP_STORAGE_KEY,
  IDV_POPUP_TIMEOUT_MS,
  IDV_POPUP_CLOSE_POLL_MS,
  IDV_POPUP_CLOSE_GRACE_MS,
  IDV_PENDING_KEY,
  IDV_RESULT_KEY,
  IDV_HANDOFF_TTL_MS,
  openIdentityPopup,
  resolveKgFailureMessage,
  type IdvPopupResultMessage,
  type IdvPopupStorageCrumb,
  type IdvPendingHandoff,
  type IdvResultHandoff,
} from "@/lib/identity-popup";

/**
 * WebView 환경에서 PortOne `requestIdentityVerification` 은 popup 을
 * 띄우지 못해 즉시 USER_CANCEL 로 reject 된다. redirectUrl 옵션을
 * 지정하면 현재 페이지를 PortOne 으로 redirect → 인증 후 redirectUrl
 * 로 복귀하는 흐름으로 우회한다. sessionStorage 는 복귀 시 callback
 * 페이지가 결과를 원래 페이지로 핸드오프하는 통로다.
 *
 * [R1 #7] 핸드오프 인터페이스와 sessionStorage 키는 @/lib/identity-popup 에서
 * 콜백 페이지와 공유한다 — 각자 선언하면 새 필드 추가 시 양쪽에 손으로
 * 맞춰야 하는 드리프트가 생긴다.
 */

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
  /**
   * KG 직결 경로가 document.write 로 페이지를 통째로 교체하기 직전에 호출된다.
   * 부모(가입 폼 등)가 React state 스냅샷을 저장할 마지막 동기 지점 — 포트원
   * 경로(팝업/SDK redirect)는 이 콜백을 타지 않는다(그 경로는 손대지 않음).
   */
  onBeforeRedirect?: () => void;
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
  onBeforeRedirect,
  verified,
  label = "이름",
  disabled,
  id,
}: IdentityVerifyInputProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // [R1 #3] 클릭 "이전"에 activeProvider 를 알아야 kg_inicis 일 때만 팝업을
  // 투기적으로 연다 — 운영 기본값이 아직 portone 이면 팝업을 아예 시도하지
  // 않아 포트원 SDK 자체 팝업/redirect 흐름이 이 컴포넌트 이전과 동일하게 동작한다.
  // 조회 실패·미도착(null)이면 팝업을 열지 않고 기존 경로(kg_inicis 페이지 전환
  // 또는 portone SDK)로 안전하게 폴백한다.
  const [activeProvider, setActiveProvider] = useState<IdentityProvider | null>(
    null,
  );

  // 팝업 대기 중 unmount 되면 message/storage 리스너와 인터벌을 정리해야 한다.
  // waitForIdentityPopupResult 가 진행 중일 때만 값이 채워지고, 완료 시 스스로 비운다.
  const popupCleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      popupCleanupRef.current?.();
      popupCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getActiveIdentityProvider()
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.provider) {
          setActiveProvider(res.data.provider);
        }
      })
      .catch(() => {
        // 무시 — activeProvider 가 null 로 남으면 팝업을 열지 않는 안전한 폴백.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * 팝업 창의 인증 결과를 postMessage(주 통로) 또는 localStorage 크럼(COOP 등으로
   * opener 참조가 끊겼을 때의 보조 통로)으로 수신할 때까지 대기한다.
   * 사용자가 팝업을 결과 없이 닫거나 30분(인증 요청 만료와 동일)이 지나면 실패로 종료한다.
   * settled 플래그로 onVerified/onError 가 정확히 한 번만 호출되도록 보장한다.
   */
  const waitForIdentityPopupResult = useCallback(
    (
      popup: Window,
      requestId: string,
    ): Promise<{
      success: boolean;
      errorMessage?: string;
      needsGuardianConsent?: boolean;
    }> => {
      return new Promise((resolve) => {
        let settled = false;
        let closeGraceTimer: number | null = null;

        // [R1 #6] 이 세션이 남긴 크럼은 소비 여부와 무관하게(메시지로 이겼든,
        // 실패/타임아웃으로 끝났든) 정리한다 — 단일 고정 키라 다음 시도까지
        // 이전 requestId 가 남아있을 이유가 없다.
        const clearCrumb = () => {
          try {
            window.localStorage.removeItem(IDV_POPUP_STORAGE_KEY);
          } catch {
            // ignore
          }
        };

        const cleanup = () => {
          window.removeEventListener("message", onMessage);
          window.removeEventListener("storage", onStorage);
          window.clearInterval(closePoll);
          window.clearTimeout(timeout);
          if (closeGraceTimer !== null) window.clearTimeout(closeGraceTimer);
          popupCleanupRef.current = null;
        };

        const finish = (result: {
          success: boolean;
          errorMessage?: string;
          needsGuardianConsent?: boolean;
        }) => {
          if (settled) return;
          settled = true;
          cleanup();
          clearCrumb();
          resolve(result);
        };

        const resolveFailure = (code: string | null | undefined) =>
          finish({
            success: false,
            errorMessage: resolveKgFailureMessage(code, {
              identityFailed: MESSAGES.verify.identityFailed,
              identityFailedByCode: MESSAGES.verify.identityFailedByCode,
            }),
          });

        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          if (event.source !== popup) return;
          const data = event.data as Partial<IdvPopupResultMessage> | undefined;
          if (!data || data.type !== IDV_POPUP_MESSAGE_TYPE) return;
          if (!data.requestId || data.requestId !== requestId) return;
          if (data.status === "completed") {
            finish({
              success: true,
              needsGuardianConsent: data.needsGuardianConsent,
            });
          } else {
            resolveFailure(data.code);
          }
        };

        const onStorage = (event: StorageEvent) => {
          if (event.key !== IDV_POPUP_STORAGE_KEY || !event.newValue) return;
          try {
            const crumb = JSON.parse(event.newValue) as IdvPopupStorageCrumb;
            if (crumb.requestId !== requestId) return;
            if (Date.now() - crumb.timestamp > IDV_POPUP_TIMEOUT_MS) {
              clearCrumb();
              return;
            }
            if (crumb.status === "completed") {
              finish({
                success: true,
                needsGuardianConsent: crumb.needsGuardianConsent,
              });
            } else {
              resolveFailure(crumb.code);
            }
          } catch {
            // 파싱 실패 시 무시 — postMessage 가 정상 통로라 크럼은 보조 수단일 뿐이다.
          }
        };

        // [R1 #1] 콜백 페이지는 postMessage 직후 같은 동기 블록에서 close() 를
        // 부른다. 이 poll 이 그 사이 틱에 걸려 popup.closed 를 먼저 보고 바로
        // 실패 확정하면, 뒤늦게 도착하는 성공 메시지가 settled 가드에 막혀
        // 버려진다. 닫힘을 처음 감지했을 때는 유예 타이머만 걸고, 그 유예
        // 동안에도 결과가 없을 때만 최종 실패로 확정한다 — 전송 중이던
        // 메시지/크럼이 이길 시간을 준다.
        const closePoll = window.setInterval(() => {
          if (settled || closeGraceTimer !== null) return;
          if (!popup.closed) return;
          closeGraceTimer = window.setTimeout(() => {
            finish({
              success: false,
              errorMessage: MESSAGES.verify.identityFailed,
            });
          }, IDV_POPUP_CLOSE_GRACE_MS);
        }, IDV_POPUP_CLOSE_POLL_MS);

        const timeout = window.setTimeout(() => {
          finish({ success: false, errorMessage: MESSAGES.verify.identityFailed });
          try {
            if (!popup.closed) popup.close();
          } catch {
            // ignore
          }
        }, IDV_POPUP_TIMEOUT_MS);

        window.addEventListener("message", onMessage);
        window.addEventListener("storage", onStorage);
        // unmount 시 대기를 실패로 즉시 종료시켜 리스너를 회수한다.
        popupCleanupRef.current = () =>
          finish({ success: false, errorMessage: MESSAGES.verify.identityFailed });
      });
    },
    [],
  );

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

    // [R1 #3] activeProvider 를 사전 조회로 이미 알고 있을 때만 팝업을 연다.
    // 운영 기본값은 아직 portone 이라, 여기서 모르는 채로(activeProvider===null)
    // 투기적으로 열면 모든 웹 사용자가 쓰이지도 않을 빈 팝업을 보게 되고
    // 포트원 SDK 팝업의 사용자 제스처까지 이 호출이 먼저 소진해버린다.
    // 팝업은 클릭 핸들러의 동기 구간(첫 await 이전)에서 열어야 한다 — await 뒤에
    // 열면 사용자 제스처가 소진되어 Safari 등에서 팝업 차단이 발동한다.
    const usePopup = !isNativeApp() && activeProvider === "kg_inicis";
    const popup = usePopup ? openIdentityPopup() : null;
    const popupOpened = usePopup && !!popup && !popup.closed;

    try {
      // 1. 백엔드에 익명 인증 시작 요청 — provider 는 지정하지 않는다(서버 activeProvider 가 결정).
      //    returnUrl 은 KG 직결 경로에서만 쓰인다(포트원은 redirectUrl 을 SDK 호출에 별도로 넘긴다).
      //    팝업이 실제로 열렸을 때만 authWindow=popup 을 실어 보낸다 — 백엔드는 이 쿼리를
      //    해석하지 않고 최종 302 까지 그대로 승계할 뿐이라 백엔드 변경이 필요 없다.
      const initRes = await initiateAnonymousIdentity({
        purpose: "registration",
        returnUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/identity/callback${
                popupOpened
                  ? `?${IDV_AUTH_WINDOW_QUERY_PARAM}=${IDV_AUTH_WINDOW_POPUP_VALUE}`
                  : ""
              }`
            : undefined,
      });

      if (!initRes.success || !initRes.data?.success) {
        popup?.close();
        const msg =
          initRes.data?.errorMessage ||
          initRes.error?.message ||
          "본인인증 시작에 실패했습니다.";
        setErrorMsg(msg);
        onError?.(msg);
        return;
      }

      const { requestId, authHtml, provider } = initRes.data;

      // KG이니시스 직결 — authHtml 은 KG 인증창으로 자동 submit 되는 HTML 문서 문자열.
      if (provider === "kg_inicis") {
        if (!authHtml) {
          popup?.close();
          const msg = MESSAGES.verify.identityChannelUnavailable;
          setErrorMsg(msg);
          onError?.(msg);
          return;
        }

        // [R1 #5] popupOpened 는 initiateAnonymousIdentity 의 await 이전에
        // 계산됐다 — 그 왕복 동안 빈 창만 보이므로 사용자가 직접 닫을 수 있다.
        // 여기서 popup.closed 를 다시 확인해, 이미 닫혔다면 팝업 차단과 동일하게
        // 페이지 전환 경로로 합류시킨다(무음 실패로 에러 토스트만 뜨는 것을 방지).
        if (popupOpened && popup && !popup.closed) {
          popup.document.open();
          popup.document.write(authHtml);
          popup.document.close();

          const result = await waitForIdentityPopupResult(popup, requestId);
          try {
            if (!popup.closed) popup.close();
          } catch {
            // ignore
          }
          if (!mountedRef.current) return;
          if (result.success) {
            onVerified({
              requestId,
              needsGuardianConsent: result.needsGuardianConsent,
            });
          } else {
            const msg = result.errorMessage || MESSAGES.verify.identityFailed;
            setErrorMsg(msg);
            onError?.(msg);
          }
          return;
        }

        // 팝업 차단(popup === null) 또는 네이티브 웹뷰 — 기존 페이지 전환으로 강등.
        const handoff: IdvPendingHandoff = {
          requestId,
          provider: "kg_inicis",
          // KG 경로는 PortOne identityVerificationId 가 없다 — 결과는 백엔드 리다이렉트로만 돌아온다.
          identityVerificationId: "",
          returnTo: window.location.pathname + window.location.search,
          timestamp: Date.now(),
        };
        window.sessionStorage.setItem(IDV_PENDING_KEY, JSON.stringify(handoff));
        // 부모(가입 폼 등)가 React state 스냅샷을 저장할 마지막 동기 지점 —
        // 바로 다음 줄에서 document 전체가 교체되므로 이후에는 호출할 수 없다.
        onBeforeRedirect?.();
        document.open();
        document.write(authHtml);
        document.close();
        // 페이지가 KG 인증창으로 전환되므로 이 실행 컨텍스트는 여기서 끝난다.
        return;
      }

      // provider === "portone" — 팝업은 쓰지 않으므로 열어뒀다면 정리한다.
      if (popupOpened) {
        try {
          popup?.close();
        } catch {
          // ignore
        }
      }

      // provider === "portone" (기본 경로) — 기존 로직 그대로
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
          provider: "portone",
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
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        // ignore
      }
      const msg =
        err instanceof Error
          ? err.message
          : "본인인증 중 오류가 발생했습니다.";
      setErrorMsg(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [
    disabled,
    loading,
    onError,
    onVerified,
    onBeforeRedirect,
    waitForIdentityPopupResult,
    activeProvider,
  ]);

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
