/**
 * native-bridge 단순 핸들러 (auth/identity/qr/biometric/navigation) — C-1 분리 2026-06-07
 */
import { getBridge, bridgeLogger, addMessageListener } from "./native-bridge-core";
import { isAndroid } from "./native-bridge-screens";
import { isFlutterBridgeAvailable } from "@/lib/environment";
import { buildUrlWithParams, normalizeExternalUrl } from "@/lib/utils";
import type { IdentityProvider, IdentityPurpose, IdentityVerificationResult, UserIdentityStatus } from "@/types";
import { handleBridgeError } from "./bridge-error-handler";


/**
 * 인증 관련 기능
 */
export const auth = {
  /**
   * 토큰 정보 조회
   */
  async getToken(): Promise<{
    accessToken: string;
    refreshToken: string;
  } | null> {
    try {
      const bridge = getBridge();
      return await bridge.auth.getToken();
    } catch (error) {
      handleBridgeError("auth", error, { operation: "getToken" });
      return null;
    }
  },

  /**
   * 토큰 저장
   */
  async saveToken(tokenData: {
    accessToken: string;
    refreshToken: string;
  }): Promise<boolean> {
    try {
      const bridge = getBridge();
      await bridge.auth.saveToken(tokenData);
      return true;
    } catch (error) {
      handleBridgeError(
        "auth",
        {
          code: "AUTH_STORAGE_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "saveToken" },
      );
      return false;
    }
  },

  /**
   * 토큰 삭제 (로그아웃)
   */
  async clearToken(): Promise<boolean> {
    try {
      const bridge = getBridge();
      await bridge.auth.clearToken();
      return true;
    } catch (error) {
      handleBridgeError("auth", error, { operation: "clearToken" });
      return false;
    }
  },

  /**
   * 인증 상태 확인
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      const bridge = getBridge();
      return await bridge.auth.isAuthenticated();
    } catch (error) {
      handleBridgeError("auth", error, { operation: "isAuthenticated" });
      return false;
    }
  },

  /**
   * Sign in with Apple (네이티브 ASAuthorization) — iOS 4.8 동등 옵션.
   * 네이티브 미지원/취소 시 null 반환.
   */
  async appleSignIn(): Promise<{
    identityToken: string;
    authorizationCode?: string | null;
  } | null> {
    try {
      const bridge = getBridge();
      if (typeof bridge.auth.appleSignIn !== "function") return null;
      const result = await bridge.auth.appleSignIn();
      if (!result?.identityToken) return null;
      return {
        identityToken: result.identityToken,
        // 계정 삭제 시 Apple 토큰 revoke(iOS 5.1.1(v)) 용 — Backend 가 refresh_token 으로 교환
        authorizationCode: result.authorizationCode ?? null,
      };
    } catch (error) {
      handleBridgeError("auth", error, { operation: "appleSignIn" });
      return null;
    }
  },

  /**
   * 로그인 필수 가드 (네이티브 측에 위임)
   *
   * - 네이티브에서 인증 상태 확인 → 미인증이면 네이티브 로그인 화면 자동 표시
   * - returnPath 가 있으면 로그인 성공 후 해당 경로로 이동
   * - 반환: { isAuthenticated: boolean }
   *
   * Flutter 측 webview_bridge.dart 의 `auth` 핸들러 `requireLogin` action 과 대응.
   */
  async requireLogin(options?: {
    message?: string;
    returnPath?: string;
  }): Promise<boolean> {
    try {
      if (
        typeof window === "undefined" ||
        typeof window.flutter_inappwebview?.callHandler !== "function"
      ) {
        return false;
      }
      const result = (await window.flutter_inappwebview!.callHandler(
        "auth",
        "requireLogin",
        {
          message: options?.message,
          returnPath: options?.returnPath,
        },
      )) as { success: boolean; data?: { isAuthenticated?: boolean } };
      return Boolean(result?.data?.isAuthenticated);
    } catch (error) {
      handleBridgeError("auth", error, { operation: "requireLogin" });
      return false;
    }
  },

  /**
   * 네이티브 로그인 화면 열기 (returnPath 부착)
   *
   * Flutter 측 webview_bridge.dart 의 `auth` 핸들러 `openLoginScreen` action 과 대응.
   */
  async openLoginScreen(returnPath?: string): Promise<boolean> {
    try {
      if (
        typeof window === "undefined" ||
        typeof window.flutter_inappwebview?.callHandler !== "function"
      ) {
        return false;
      }
      const result = (await window.flutter_inappwebview!.callHandler(
        "auth",
        "openLoginScreen",
        { returnPath },
      )) as { success: boolean };
      return Boolean(result?.success);
    } catch (error) {
      handleBridgeError("auth", error, { operation: "openLoginScreen" });
      return false;
    }
  },
};

/**
 * 본인인증 관련 기능
 */
export const identity = {
  async start(options: {
    authUrl: string;
    requestId: string;
    provider?: IdentityProvider;
    purpose?: IdentityPurpose;
  }): Promise<IdentityVerificationResult> {
    try {
      const bridge = getBridge();
      return await bridge.identity.start({
        authUrl: options.authUrl,
        requestId: options.requestId,
        provider: options.provider || "kg_inicis",
        purpose: options.purpose || "registration",
      });
    } catch (error) {
      handleBridgeError("identity", error, {
        operation: "start",
        requestId: options.requestId,
      });
      throw error;
    }
  },

  async checkStatus(requestId: string): Promise<{ status: string }> {
    try {
      const bridge = getBridge();
      return await bridge.identity.checkStatus(requestId);
    } catch (error) {
      handleBridgeError("identity", error, {
        operation: "checkStatus",
        requestId,
      });
      return { status: "unknown" };
    }
  },

  async getProviders(): Promise<IdentityProvider[]> {
    try {
      const bridge = getBridge();
      return await bridge.identity.getProviders();
    } catch (error) {
      handleBridgeError("identity", error, { operation: "getProviders" });
      return [];
    }
  },

  async getUserVerificationStatus(): Promise<UserIdentityStatus> {
    try {
      const bridge = getBridge();
      return await bridge.identity.getUserVerificationStatus();
    } catch (error) {
      handleBridgeError("identity", error, {
        operation: "getUserVerificationStatus",
      });
      throw error;
    }
  },

  onVerificationResult(
    handler: (result: IdentityVerificationResult) => void,
  ): void {
    try {
      const bridge = getBridge();
      bridge.identity.onVerificationResult(handler);
    } catch (error) {
      handleBridgeError("identity", error, {
        operation: "onVerificationResult",
      });
    }
  },
};

/**
 * QR 스캔 관련 기능
 */
export const qr = {
  /**
   * 카메라 권한 요청
   */
  async requestPermission(): Promise<boolean> {
    try {
      const bridge = getBridge();
      return await bridge.qr.requestPermission();
    } catch (error) {
      handleBridgeError(
        "qr",
        {
          code: "QR_PERMISSION_DENIED",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "requestPermission" },
      );
      return false;
    }
  },

  /**
   * QR 스캔 시작
   * 응답 수용 포맷:
   * 1. `string` — 기존 단순 포맷
   * 2. `{ qrData: string }` — Flutter BridgeResponse.success(data: {qrData})
   * 3. `{ success, data: { qrData } }` — 완전 BridgeResponse (SDK 미언래핑)
   */
  async scan(): Promise<string | null> {
    try {
      const bridge = getBridge();
      const result = await bridge.qr.scan();

      if (result === null || result === undefined) {
        return null;
      }

      // 다양한 응답 포맷 흡수
      let qrString: string | null = null;
      if (typeof result === "string") {
        qrString = result;
      } else if (typeof result === "object") {
        const obj = result as Record<string, unknown>;
        if (typeof obj.qrData === "string") {
          qrString = obj.qrData;
        } else if (obj.data && typeof obj.data === "object") {
          const inner = obj.data as Record<string, unknown>;
          if (typeof inner.qrData === "string") qrString = inner.qrData;
        }
      }

      if (!qrString || qrString.trim().length === 0) {
        bridgeLogger.warn("QR scan returned empty or invalid result:", result);
        return null;
      }
      return qrString;
    } catch (error) {
      handleBridgeError(
        "qr",
        {
          code: "QR_SCAN_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
        { operation: "scan" },
      );
      return null;
    }
  },
};

/**
 * 생체인증 (Face ID / Touch ID) — Native(앱 WebView) 전용.
 *
 * Flutter `webview_bridge.dart` 의 `biometric` 핸들러(addJavaScriptHandler)와 대응.
 * window.FlutterBridge 프록시가 아니라 flutter_inappwebview.callHandler 를 직접 호출한다
 * (auth.requireLogin · navigation.setHardwareBackEnabled 와 동일 패턴).
 *
 * 반환 계약 (Flutter BridgeResponse.toJson):
 *   checkAvailability → { success, data: { available, availabilityStatus, biometricTypes } }
 *   authenticate      → 성공 { success:true, data:{ authenticated:true } } | 실패 { success:false, error }
 */
export const biometric = {
  /**
   * 생체인증 가능 여부 확인. available=true 이면 Face ID/지문 사용 가능.
   * 일반 브라우저(비 WebView) 또는 미등록 기기에서는 available=false.
   */
  async checkAvailability(): Promise<{
    available: boolean;
    availabilityStatus?: "available" | "notAvailable" | "unavailable";
    biometricTypes?: string[];
  }> {
    try {
      if (
        typeof window === "undefined" ||
        typeof window.flutter_inappwebview?.callHandler !== "function"
      ) {
        return { available: false };
      }
      const result = (await window.flutter_inappwebview!.callHandler(
        "biometric",
        { action: "checkAvailability" },
      )) as {
        success?: boolean;
        data?: {
          available?: boolean;
          availabilityStatus?: "available" | "notAvailable" | "unavailable";
          biometricTypes?: string[];
        };
      };
      const data = result?.data;
      return {
        available: Boolean(data?.available),
        availabilityStatus: data?.availabilityStatus,
        biometricTypes: data?.biometricTypes,
      };
    } catch (error) {
      handleBridgeError("biometric", error, { operation: "checkAvailability" });
      return { available: false };
    }
  },

  /**
   * 생체인증 실행. 성공 시 { success: true }.
   * 실패 / 취소 / 미지원 시 { success: false, message }.
   */
  async authenticate(options?: {
    reason?: string;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      if (
        typeof window === "undefined" ||
        typeof window.flutter_inappwebview?.callHandler !== "function"
      ) {
        return { success: false, message: "생체인증을 사용할 수 없습니다." };
      }
      const result = (await window.flutter_inappwebview!.callHandler(
        "biometric",
        {
          action: "authenticate",
          reason: options?.reason ?? "생체인증으로 로그인합니다.",
        },
      )) as {
        success?: boolean;
        data?: { authenticated?: boolean; message?: string };
        error?: string;
      };
      const ok = Boolean(result?.success && result?.data?.authenticated);
      return {
        success: ok,
        message: result?.data?.message ?? result?.error,
      };
    } catch (error) {
      handleBridgeError("biometric", error, { operation: "authenticate" });
      return { success: false, message: "생체인증 처리 중 오류가 발생했습니다." };
    }
  },
};

/**
 * `navigation.openExternal` 단일 config 객체 호출 형태.
 *
 * `url` 을 파라미터(필드)로 받는 형태 — 위치 인자 `openExternal(url, parameter)` 와
 * 동등하게 동작하며, url 과 쿼리 파라미터를 한 객체로 묶어 넘길 수 있다.
 */
export interface OpenExternalOptions {
  /** 외부 URL (절대 URL 권장) */
  url: string;
  /** 붙일 쿼리 파라미터 — object 또는 쿼리스트링 */
  parameter?: Record<string, unknown> | string;
  /**
   * 브릿지 미준비/예외 시 `window.open` 새 탭 폴백 허용 여부 (기본 true — 기존 동작).
   *
   * ⚠️ 네이티브 WebView 의 `window.open` 은 onCreateWindow 가 **메인 WebView 를 외부
   * 사이트로 교체**하고, iOS 는 back 제스처가 꺼져 있어 복귀 불가 좌초가 된다
   * (webview_screen.dart:1614·:1193). 본문 외부 링크(useContentLinkHandler)처럼
   * "셸 내 이동 금지" 계약인 호출은 반드시 false 를 지정한다 — 이 경우 폴백 없이
   * status:'failed' 를 반환하고 호출부가 안내를 담당한다.
   */
  fallbackToNewTab?: boolean;
}

/**
 * openExternal 결과.
 * - opened      : 기본 브라우저(또는 웹 새 탭)로 열림
 * - unsupported : 구버전 앱(1.0.0+5 미만) — openExternal 액션이 navigate default 분기로
 *                 흡수되어 응답에 `data.opened` 가 없는 경우. 업데이트 안내 대상.
 * - failed      : 현행 앱에서 실행 실패(launchUrl false·브릿지 에러/예외·미준비).
 *                 버전 문제가 아니므로 업데이트 안내가 아닌 일반 실패 안내 대상.
 */
export type OpenExternalStatus = "opened" | "unsupported" | "failed";

/**
 * 네비게이션 관련 기능
 */
export const navigation = {
  async navigate(
    route: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const bridge = getBridge();
      await bridge.navigation.navigate(route, params);
    } catch (error) {
      handleBridgeError("navigation", error, { operation: "navigate", route });
    }
  },

  onDeepLink(handler: (url: string) => void): void {
    try {
      const bridge = getBridge();
      bridge.navigation.onDeepLink(handler);
    } catch (error) {
      handleBridgeError("navigation", error, { operation: "onDeepLink" });
    }
  },

  /**
   * Android 하드웨어 백 버튼 가로채기 활성화/비활성화.
   * iOS 는 자동 무시 (해당 없음).
   *
   * 2026-05-16: Flutter navigation 핸들러로 action 디스패치하는 방식으로 통일.
   * Flutter 측은 `_handleNavigationRequest` 에서 `action === 'setHardwareBackEnabled'`
   * 분기로 처리하고, 활성화 시 백키 이벤트를 `sendMessageToWeb` 으로 push 한다.
   *
   * @example
   * navigation.setHardwareBackEnabled(true);
   * navigation.onHardwareBack(() => { handleBack(); });
   */
  setHardwareBackEnabled(enabled: boolean): void {
    if (!isAndroid()) return; // iOS / web 무시
    if (!isFlutterBridgeAvailable()) return;
    try {
      // flutter_inappwebview.callHandler 를 직접 사용 — Bridge proxy 의존성 제거.
      // 기존 setHardwareBackEnabled 슬롯이 Flutter 에 없어도 navigation 핸들러는 존재하므로 안전.
      if (typeof window !== "undefined" && window.flutter_inappwebview) {
        void window.flutter_inappwebview.callHandler("navigation", {
          action: "setHardwareBackEnabled",
          enabled,
        });
      }
    } catch (error) {
      handleBridgeError("navigation", error, {
        operation: "setHardwareBackEnabled",
        enabled,
      });
    }
  },

  /**
   * Android 하드웨어 백 버튼 이벤트 구독.
   * `setHardwareBackEnabled(true)` 먼저 호출 필수.
   *
   * 2026-05-16: JS 콜백 등록 → `addMessageListener` dispatcher 패턴으로 전환.
   * Flutter 는 JS 콜백을 보관할 수 없으므로 `sendMessageToWeb({type:'navigation',
   * data:{action:'hardwareBackPressed'}})` 를 push 하고 Web 이 수신·디스패치한다.
   * 동일 패턴: `ui.onDeviceMetricsChange` (line 2401 참조).
   *
   * 핸들러는 수신 즉시 Flutter 측 fallback timer 를 취소하기 위해
   * `action: 'backReceived'` ACK 를 자동 발송한다.
   *
   * @returns 구독 해제 함수 (cleanup 에 호출)
   */
  onHardwareBack(handler: () => void): () => void {
    if (!isAndroid()) return () => {}; // iOS / web no-op
    if (typeof window === "undefined") return () => {};
    return addMessageListener((messageJson) => {
      try {
        const message = JSON.parse(messageJson);
        if (
          message?.type === "navigation" &&
          message?.data?.action === "hardwareBackPressed"
        ) {
          // Flutter fallback timer 즉시 취소 — Web 이 정상 수신했음을 알림.
          try {
            if (window.flutter_inappwebview) {
              void window.flutter_inappwebview.callHandler("navigation", {
                action: "backReceived",
              });
            }
          } catch {
            // ignore ACK 실패 (timeout fallback 으로 안전 복구됨)
          }
          handler();
        }
      } catch {
        // JSON 파싱 실패 — 다른 listener 처리
      }
    });
  },

  /**
   * 앱 완전 종료 (Android only).
   * - Android: Flutter `SystemNavigator.pop()` → Activity finish → 프로세스 종료
   * - iOS: Apple 정책상 호출 금지 — Flutter 측에서 `Platform.isAndroid` 가드로 silent no-op
   *
   * 종료 확인 다이얼로그(ConfirmDialog)에서 "종료하기"를 선택한 경우에만 호출.
   */
  async exitApp(): Promise<void> {
    if (!isAndroid()) return; // iOS / web 무시
    if (!isFlutterBridgeAvailable()) return;
    try {
      if (typeof window !== "undefined" && window.flutter_inappwebview) {
        await window.flutter_inappwebview.callHandler("navigation", {
          action: "exitApp",
        });
      }
    } catch (error) {
      handleBridgeError("navigation", error, { operation: "exitApp" });
    }
  },

  /**
   * 외부 URL 열기 — 앱(WebView)은 기기 기본 브라우저로, 웹은 새 탭으로 연다.
   *
   * 앱에서 `window.open(url, '_blank')` 를 직접 쓰면 Flutter onCreateWindow 가
   * http/https 를 메인 WebView 에 loadUrl 하여 TEAMPLUS 화면을 덮어쓴다.
   * 영수증·외부 링크처럼 "잠깐 보고 돌아올" URL 은 외부 브라우저로 위임해야
   * WebView 세션이 유지된다. 브릿지 호출 실패 시 새 탭으로 폴백한다.
   *
   * `parameter` 를 넘기면 `buildUrlWithParams` 로 쿼리를 병합한 뒤 연다.
   * object·string 두 형태를 모두 받으며 값은 자동 인코딩된다(한글·특수문자 안전).
   * 최종 URL 은 웹에서 조립되어 넘어가므로 Flutter 네이티브는 수정할 필요가 없다.
   *
   * 첫 인자는 **url 문자열** 또는 **`{ url, parameter }` config 객체** 둘 다 받는다.
   * 즉 url 을 위치 인자로도, 파라미터(필드)로도 넘길 수 있다.
   *
   * @param target 외부 URL 문자열 또는 `{ url, parameter }` config 객체
   * @param parameter (target 이 문자열일 때) 붙일 쿼리 파라미터 — object 또는 쿼리스트링
   *
   * @example
   * navigation.openExternal('https://www.naver.com');
   * navigation.openExternal('https://www.naver.com', { q: 'test' });          // ?q=test
   * navigation.openExternal('https://www.naver.com', 'q=test&t=news');        // ?q=test&t=news
   * navigation.openExternal({ url: 'https://www.naver.com' });                // url 을 파라미터로
   * navigation.openExternal({ url: 'https://www.naver.com', parameter: { q: 'test' } });
   * navigation.openExternal({ url: 'https://www.naver.com', parameter: 'q=test&t=news' });
   */
  async openExternal(
    target: string | OpenExternalOptions,
    parameter?: Record<string, unknown> | string,
  ): Promise<{ status: OpenExternalStatus }> {
    const rawUrl = typeof target === "string" ? target : target?.url;
    const param = typeof target === "string" ? parameter : target?.parameter;
    // 기본 true — 기존 호출부(결제 영수증·앱 업데이트 안내)의 새 탭 폴백 동작 보존.
    const fallbackToNewTab =
      typeof target === "string" ? true : target?.fallbackToNewTab !== false;
    if (!rawUrl) return { status: "failed" };
    // 스킴 없는 bare-host(www.naver.com)는 https:// 부여 → 외부 브라우저에서 정상 오픈
    const finalUrl = buildUrlWithParams(normalizeExternalUrl(rawUrl), param);
    const openInNewTab = () => {
      if (typeof window !== "undefined") {
        window.open(finalUrl, "_blank", "noopener,noreferrer");
      }
    };
    if (
      !isFlutterBridgeAvailable() ||
      typeof window === "undefined" ||
      typeof window.flutter_inappwebview?.callHandler !== "function"
    ) {
      // 웹 브라우저(브릿지 없음) — 새 탭이 정상 경로. 네이티브인데 브릿지가 아직
      // 준비되지 않은 경계 상태에서는 fallbackToNewTab=false 호출이 좌초를 막는다.
      if (!fallbackToNewTab) return { status: "failed" };
      openInNewTab();
      return { status: "opened" };
    }
    try {
      const response = (await window.flutter_inappwebview.callHandler(
        "navigation",
        {
          action: "openExternal",
          url: finalUrl,
        },
      )) as { success?: boolean; data?: { opened?: boolean } } | undefined;
      // 구버전 앱(1.0.0+5 미만)은 이 액션이 navigate default 분기로 흡수되어 success 는
      // 오지만 data.opened 가 **없다** → unsupported(업데이트 안내 대상).
      // 현행 앱의 실행 실패(launchUrl false=data.opened:false · BridgeResponse.error)는
      // failed 로 구분한다 — 버전 문제가 아니므로 업데이트 안내를 띄우면 오안내다.
      if (response?.success === true) {
        if (response.data?.opened === true) return { status: "opened" };
        if (response.data?.opened === false) return { status: "failed" };
        return { status: "unsupported" };
      }
      return { status: "failed" };
    } catch (error) {
      handleBridgeError("navigation", error, {
        operation: "openExternal",
        url: finalUrl,
      });
      if (!fallbackToNewTab) return { status: "failed" };
      openInNewTab(); // 브릿지 실패 시 새 탭 폴백 (기존 호출부 동작 유지)
      return { status: "opened" };
    }
  },
};

// ──────────────────────────────────────────────────────────
// 플랫폼 판별 (iOS / Android / Web)
// ──────────────────────────────────────────────────────────


// ApiRequestError를 외부에서 사용할 수 있도록 export
