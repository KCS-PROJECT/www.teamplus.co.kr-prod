/**
 * Native Bridge Service
 * Flutter WebView와 통신하기 위한 서비스
 *
 * Flutter의 assets/js/native_bridge.js와 연동됩니다.
 */

import type {
  IdentityProvider,
  IdentityPurpose,
  IdentityVerificationResult,
  UserIdentityStatus,
  ApiError,
} from "@/types";
import { ApiErrorCode, createApiError } from "@/types";
import { handleBridgeError } from "./bridge-error-handler";
import {
  verifyOrigin,
  createSecurityContext,
  validateSecurityContext,
  isSecurityEnforced,
} from "./bridge-security";

// ============================================
// 작업별 타임아웃 설정 (ms)
// ============================================
// 정상 API는 1~3초 내 응답해야 함. 타임아웃이 길면 Bridge hang 시
// 사용자 체감 지연이 그만큼 늘어남 → Web axios fallback이 늦게 발동.
// 일반 API는 10초로 제한하고, 특수 작업만 길게 유지.
// [C-1 2026-06-07] 타임아웃·버전계약·로거는 native-bridge-core.ts 로 분리.
import { getOperationTimeout, bridgeLogger } from "./native-bridge-core";
export {
  BRIDGE_WEB_VERSION,
  BRIDGE_MIN_APP_VERSION,
  getAppBridgeVersion,
  isAppBridgeCompatible,
  bridgeLogger,
} from "./native-bridge-core";
export type { BridgeLogger } from "./native-bridge-core";
// [C-1 2026-06-07] Flutter Bridge 타입 정의는 native-bridge-core 로 분리.
import type {
  FlutterInAppWebView,
  FlutterBridgeAuth,
  FlutterBridgeIdentity,
  FlutterBridgeQR,
  FlutterBridgeNavigation,
  FlutterBridgePayment,
  UIConfig,
  AppBarEventType,
  AppBarEventHandler,
  FlutterBridgeUI,
  DeviceInfo,
  UploadSource,
  UploadPickResult,
  UploadBridgeCategory,
  RemoteUploadedFile,
  LocalStoredFile,
  LocalFileMeta,
  LocalFileContent,
  StorageInfo,
  UploadPermissionResult,
  FlutterBridgeUpload,
  FlutterBridge,
  WebFlutterBridge,
  ApiRequestOptions,
} from "./native-bridge-core";
export type {
  FlutterInAppWebView,
  FlutterBridgeAuth,
  FlutterBridgeIdentity,
  FlutterBridgeQR,
  FlutterBridgeNavigation,
  FlutterBridgePayment,
  UIConfig,
  AppBarEventType,
  AppBarEventHandler,
  FlutterBridgeUI,
  DeviceInfo,
  UploadSource,
  UploadPickResult,
  UploadBridgeCategory,
  RemoteUploadedFile,
  LocalStoredFile,
  LocalFileMeta,
  LocalFileContent,
  StorageInfo,
  UploadPermissionResult,
  FlutterBridgeUpload,
  FlutterBridge,
  WebFlutterBridge,
  ApiRequestOptions,
};
// [C-1 2026-06-07] 요청관리·getBridge 는 native-bridge-core 로 분리.
import { getBridge, generateRequestId, pendingApiRequests, CANCELLED_ERROR_CODE, cancelRequest, cancelAllRequests } from "./native-bridge-core";
import { isFlutterBridgeAvailable } from "@/lib/environment";
export { CANCELLED_ERROR_CODE, cancelRequest, cancelAllRequests, isFlutterBridgeAvailable };
//   내부 사용(navigation 모듈의 isAndroid) + 공개 API 호환 re-export.
import { isAndroid } from "./native-bridge-screens";
export {
  getPlatform,
  isIOS,
  isAndroid,
  isMobile,
  isMainScreen,
  isSubmainScreen,
  isMainOrSubmainScreen,
  getAppBarVariant,
} from "./native-bridge-screens";
export type { Platform, AppBarVariantAuto } from "./native-bridge-screens";
import { parseNativeError, ApiRequestError } from "./native-bridge-core";
import { addMessageListener, initApiResponseListener } from "./native-bridge-core";
export { addMessageListener, removeMessageListener, initApiResponseListener } from "./native-bridge-core";
import { computeScreenBreakpoint } from "./native-bridge-screens";
export { computeScreenBreakpoint } from "./native-bridge-screens";
export type { ScreenBreakpoint } from "./native-bridge-screens";
// [C-1 2026-06-07] auth/identity/qr/biometric/navigation 모듈은 native-bridge-handlers 로 분리.
import { auth, identity, qr, biometric, navigation } from "./native-bridge-handlers";
export { auth, identity, qr, biometric, navigation };
export { ApiRequestError };
// [C-1 2026-06-07] 공유 헬퍼 callNativeApi/callUIBridge 는 native-bridge-core 로 분리.
import { callNativeApi, callUIBridge } from "./native-bridge-core";
import type { RequiredUIMethods as _RUM } from "./native-bridge-core";
// [C-1 2026-06-07] api/payment/upload 모듈은 native-bridge-api 로 분리.
import { api, payment, upload } from "./native-bridge-api";
export { api, payment, upload } from "./native-bridge-api";
// [C-1 2026-06-07] ui 모듈은 native-bridge-ui 로 분리.
import { ui } from "./native-bridge-ui";
export { ui } from "./native-bridge-ui";
import type { ThemeMode } from "./native-bridge-ui";
export type { ThemeMode } from "./native-bridge-ui";
// [C-1 2026-06-07] theme 모듈은 native-bridge-ui 로 분리.
import { theme } from "./native-bridge-ui";
export { theme } from "./native-bridge-ui";

/**
 * Native 앱 환경인지 확인
 * @see {@link @/lib/environment.ts} 의 isNativeApp() 과 동일한 역할
 */
import { isNativeApp } from "@/lib/environment";
import { devError, devLog, devWarn } from "@/lib/logger";
export { isNativeApp };

// 기본 export
const nativeBridge = {
  isAvailable: isFlutterBridgeAvailable,
  isNativeApp,
  initApiResponseListener,
  cancelRequest,
  cancelAllRequests,
  auth,
  identity,
  qr,
  navigation,
  payment,
  ui,
  api,
  theme,
};

export default nativeBridge;
