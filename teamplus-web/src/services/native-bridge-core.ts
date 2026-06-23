/**
 * native-bridge 공유 core — 타임아웃·버전계약·로거 (C-1 분리 · 2026-06-07)
 * 의존성: @/lib/logger 만. native-bridge.ts 및 향후 분리될 모듈들이 import.
 */
import { devLog, devWarn, devError } from "@/lib/logger";
import { ApiErrorCode, createApiError, type ApiError } from "@/types";
import type { IdentityProvider, IdentityPurpose, IdentityVerificationResult, UserIdentityStatus } from "@/types";
import { verifyOrigin, isSecurityEnforced, createSecurityContext, validateSecurityContext } from "./bridge-security";
import { handleBridgeError } from "./bridge-error-handler";

const OPERATION_TIMEOUTS: Record<string, number> = {
  auth: 8000, // 인증: 8초 (토큰 읽기/갱신은 빠르게 실패 후 재시도)
  api: 10000, // API: 10초 (hang 감지 + Web axios fallback 조기 발동)
  qrScan: 60000, // QR 스캔: 60초 (사용자 상호작용)
  payment: 45000, // 결제: 45초 (외부 게이트웨이)
  biometric: 30000, // 생체인증: 30초
  ui: 5000, // UI 제어: 5초
  notification: 10000, // 알림: 10초
};

/** 핸들러 이름으로 타임아웃 값 조회 */
export function getOperationTimeout(handler: string): number {
  return OPERATION_TIMEOUTS[handler] ?? OPERATION_TIMEOUTS.api;
}

const isDev = process.env.NODE_ENV === "development";

// ============================================
// Bridge Version Contract
// --------------------------------------------
// 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P2-NB-005):
// Web ↔ App 간 브릿지 계약 버전 관리. 앱이 주입 스크립트에서
// `window.FlutterBridge.__VERSION__` 를 선언하면 Web 이 호환성을 검증한다.
// 하위 호환 깨지는 변경은 MAJOR bump, 기능 추가는 MINOR, 버그 수정은 PATCH.
// ============================================

/** Web 이 요구하는 Bridge 인터페이스 버전 (SemVer). */
export const BRIDGE_WEB_VERSION = "1.1.0" as const;

/** Web 이 동작하기 위한 최소 App Bridge 버전. 미만이면 앱 업데이트 유도. */
export const BRIDGE_MIN_APP_VERSION = "1.0.0" as const;

/** 현재 App 이 주입한 Bridge 버전 조회 (없으면 null — 레거시 앱). */
export function getAppBridgeVersion(): string | null {
  if (typeof window === "undefined") return null;
  const bridge = window.FlutterBridge as unknown as
    | { __VERSION__?: string }
    | undefined;
  return bridge?.__VERSION__ ?? null;
}

/**
 * App Bridge 버전이 Web 요구사항을 충족하는지 확인.
 * - true: 호환 가능 또는 버전 미선언(레거시 호환 유지)
 * - false: 미충족 → 사용자에게 앱 업데이트 유도 권장
 */
export function isAppBridgeCompatible(
  minVersion: string = BRIDGE_MIN_APP_VERSION,
): boolean {
  const appVersion = getAppBridgeVersion();
  if (!appVersion) return true; // 레거시 앱 호환 유지
  return compareSemver(appVersion, minVersion) >= 0;
}

/** SemVer 비교 유틸 — a > b → 1 · a === b → 0 · a < b → -1 */
function compareSemver(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0, aPatch = 0] = a
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = b
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

// ============================================
// BridgeLogger — 개발 모드 전용 통합 로깅
// --------------------------------------------
// 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P2-NB-003):
// 분산되어 있던 `if (isDev) { console.warn/error(...) }` 가드를 단일 유틸로 통합.
// 운영 모드에서는 모든 호출이 no-op 으로 컴파일러에 의해 제거(dead-code) 될 수 있다.
// ============================================

export interface BridgeLogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export const bridgeLogger: BridgeLogger = {
  debug: (msg, ...args) => {
    if (isDev) devLog(`[NativeBridge] ${msg}`, ...args);
  },
  info: (msg, ...args) => {
    if (isDev) console.info(`[NativeBridge] ${msg}`, ...args);
  },
  warn: (msg, ...args) => {
    if (isDev) devWarn(`[NativeBridge] ${msg}`, ...args);
  },
  error: (msg, ...args) => {
    // error 는 운영 모드에서도 출력 (Sentry 가 픽업할 수 있도록)
    devError(`[NativeBridge] ${msg}`, ...args);
  },
};

// ─── 에러 변환 (C-1 2026-06-07) ───

/**
 * Native에서 받은 에러를 표준 ApiError로 변환
 */
export function parseNativeError(error: unknown): ApiError {
  // 이미 ApiError 형식인 경우.
  // 백엔드 AllExceptionsFilter 원본 body 가 그대로 전달되면 코드 필드가
  // `errorCode` 이므로 폴백으로 함께 인식한다 (예: 409 SESSION_EXISTS).
  if (
    error &&
    typeof error === "object" &&
    ("code" in error || "errorCode" in error) &&
    "message" in error
  ) {
    const err = error as {
      code?: string;
      errorCode?: string;
      message: string;
      statusCode?: number;
      details?: Record<string, unknown>;
    };
    return {
      code: err.code ?? err.errorCode ?? ApiErrorCode.UNKNOWN_ERROR,
      message: err.message,
      statusCode: err.statusCode,
      details: err.details,
    };
  }

  // 문자열 에러인 경우
  if (typeof error === "string") {
    return createApiError(ApiErrorCode.UNKNOWN_ERROR, error);
  }

  // 기타 에러인 경우
  return createApiError(ApiErrorCode.UNKNOWN_ERROR, String(error));
}

/**
 * ApiError를 Error 객체로 변환 (기존 코드 호환용)
 */
export class ApiRequestError extends Error {
  readonly apiError: ApiError;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = "ApiRequestError";
    this.apiError = apiError;
  }
}

// ─── Flutter Bridge 타입 정의 (C-1 2026-06-07) ───

// ============================================
// Flutter Bridge 타입 정의
// ============================================

/** Flutter InAppWebView callHandler 인터페이스 */
export interface FlutterInAppWebView {
  callHandler: (handlerName: string, ...args: unknown[]) => Promise<unknown>;
}

/** Flutter Bridge Auth 모듈 */
export interface FlutterBridgeAuth {
  getToken(): Promise<{ accessToken: string; refreshToken: string } | null>;
  saveToken(tokenData: {
    accessToken: string;
    refreshToken: string;
  }): Promise<void>;
  clearToken(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  /**
   * Sign in with Apple (네이티브 ASAuthorization) → identityToken 반환.
   * 미지원(구버전 브릿지)일 수 있어 optional. 취소 시 null.
   */
  appleSignIn?(): Promise<{
    identityToken: string;
    authorizationCode?: string | null;
    email?: string | null;
    fullName?: string | null;
  } | null>;
}

/** Flutter Bridge Identity 모듈 */
export interface FlutterBridgeIdentity {
  start(options: {
    authUrl: string;
    requestId: string;
    provider: IdentityProvider;
    purpose: IdentityPurpose;
  }): Promise<IdentityVerificationResult>;
  checkStatus(requestId: string): Promise<{ status: string }>;
  getProviders(): Promise<IdentityProvider[]>;
  getUserVerificationStatus(): Promise<UserIdentityStatus>;
  onVerificationResult(
    handler: (result: IdentityVerificationResult) => void,
  ): void;
}

/** Flutter Bridge QR 모듈 */
export interface FlutterBridgeQR {
  requestPermission(): Promise<boolean>;
  scan(): Promise<string | null>;
}

/** Flutter Bridge Navigation 모듈 */
export interface FlutterBridgeNavigation {
  navigate(route: string, params?: Record<string, unknown>): Promise<void>;
  onDeepLink(handler: (url: string) => void): void;
  /**
   * Android 하드웨어 백 버튼 가로채기 활성화/비활성화.
   * - true: 시스템 백 동작 차단 → JS 측 핸들러가 `onHardwareBack` 으로 처리
   * - false: 네이티브 기본(Activity 종료/뒤로가기) 동작 복원
   * iOS 는 무시 (해당 없음).
   */
  setHardwareBackEnabled?(enabled: boolean): void;
  /**
   * 안드로이드 하드웨어 백 버튼 이벤트 구독.
   * setHardwareBackEnabled(true) 를 먼저 호출해야 콜백이 발화한다.
   */
  onHardwareBack?(handler: () => void): void;
  /**
   * 앱 완전 종료 (Android only — iOS 는 Apple 정책상 silent no-op).
   * 종료 확인 다이얼로그에서 "종료하기"를 선택한 경우에만 호출.
   */
  exitApp?(): Promise<void>;
}

/** Flutter Bridge Payment 모듈 */
export interface FlutterBridgePayment {
  initiate(paymentData: {
    orderId: string;
    amount: number;
    productName: string;
    buyerName: string;
    buyerPhone: string;
    buyerEmail: string;
  }): Promise<{
    success: boolean;
    transactionId?: string;
    errorMessage?: string;
  }>;
  verify(transactionId: string): Promise<{
    success: boolean;
    verified: boolean;
    errorMessage?: string;
  }>;
}

/** UI 설정 인터페이스 */
export interface UIConfig {
  // ============================================
  // StatusBar 설정
  // ============================================
  /** 상태바 표시 여부 */
  showStatusBar?: boolean;
  /** 상태바 스타일 (true: 흰색 아이콘, false: 검정 아이콘) */
  statusBarLight?: boolean;
  /** 상태바 배경 색상 (HEX, 예: '#FFFFFF' · AARRGGBB 8자리도 허용) - Android only */
  statusBarColor?: string | null;
  /**
   * 하단 시스템 네비게이션 바 색상 (Android). HEX 6자리 또는 8자리.
   * null 전달 시 네이티브 기본값으로 복원. 모달 오버레이와 톤을 맞추는 용도.
   */
  navigationBarColor?: string | null;
  /**
   * Scaffold 배경색 (iOS safe area 상/하단 영역 색).
   * null 전달 시 네이티브 기본값으로 복원. 웹 모달 open 시 dim 색으로 통일하는 용도.
   */
  scaffoldBackgroundColor?: string | null;
  /**
   * Scrim 오버레이 표시 여부 — iOS/Android 공통 dim 처리.
   * true 시 Status Bar · Safe Area · System Navigation Bar 전 영역을 네이티브 Container로 덮는다.
   * iOS는 SystemUiOverlayStyle 색상 필드를 무시하고 Scaffold 배경은 InAppWebView 합성 충돌로
   * 반투명 불가하므로, Stack 위 IgnorePointer Container 방식이 유일하게 확실한 해법이다.
   */
  showScrim?: boolean;
  /**
   * Scrim 색상 (AARRGGBB 또는 RRGGBB HEX). 미지정 시 `#8C141826` (rink-900 @ 55%)로 기본 적용.
   * 웹 `.overlay-fullscreen-dim`(rgb(20 24 38 / 0.55), rink-900/55)과 톤 일치. (2026-05-30 통일)
   */
  scrimColor?: string;
  /**
   * 하단 home indicator / system navigation bar 영역 전용 색상.
   * 미지정 시 `scrimColor` 와 동일. 전체메뉴처럼 상단은 dim, 하단은 패널 표면색으로
   * 칠해야 하는 경우에 사용한다.
   */
  scrimBottomColor?: string;
  /**
   * 하단 home indicator / system navigation bar 영역 scrim 적용 여부.
   * 미지정 시 `true` (Flutter 기본값) — 상하단 모두 dim.
   *
   * BottomSheet 류는 화면 하단까지 카드가 차지하므로 `false` 로 설정해야
   * BottomSheet 카드 위에 dim 이 덮이는 시각 버그를 회피한다(2026-05-16 사건).
   * SoT: docs/Design/MODAL_DIM_POLICY.md
   */
  scrimBottom?: boolean;

  // ============================================
  // AppBar 설정
  // ============================================
  /** AppBar 표시 여부 */
  showAppBar?: boolean;
  /** AppBar 타이틀 */
  appBarTitle?: string;
  /** AppBar 배경 색상 (HEX, 예: '#FFFFFF') */
  appBarColor?: string;
  /** 뒤로가기 버튼 (<) 표시 여부 */
  showBackButton?: boolean;
  /** 햄버거 메뉴 버튼 표시 여부 */
  showMenuButton?: boolean;
  /** 메뉴 버튼 위치 ('left': 왼쪽/leading, 'right': 오른쪽/actions) */
  menuButtonPosition?: "left" | "right";
  /** 새로고침 버튼 표시 여부 */
  showRefreshButton?: boolean;

  // ============================================
  // BottomNav 설정
  // ============================================
  /** BottomNav 표시 여부 */
  showBottomNav?: boolean;

  // ============================================
  // PullToRefresh 정책 (2026-05-13 신규 — 이슈 D15)
  // ============================================
  /**
   * Native InAppWebView Pull-to-Refresh 활성화 여부.
   *
   * - `undefined` (미지정) : Flutter 기본 정책 적용 — URL 기반 자동
   *                          (인증/온보딩 경로 비활성, 그 외 활성)
   * - `true`               : 강제 활성화 — URL 무관
   * - `false`              : 강제 비활성화 — 페이지가 자체 새로고침 UX 를 갖고 있어
   *                          Native PTR 로 인한 의도치 않은 reload 를 방지하고 싶을 때
   *
   * 사용 예:
   * ```ts
   * useNativeUI({ showAppBar: true, pullToRefreshEnabled: false });
   * // 또는 직접 호출
   * await ui.setPullToRefresh(false);
   * ```
   */
  pullToRefreshEnabled?: boolean;
}

/** AppBar 이벤트 타입 */
export type AppBarEventType = "back" | "menu" | "refresh";

/** AppBar 이벤트 핸들러 */
export type AppBarEventHandler = (eventType: AppBarEventType) => void;

/** Flutter Bridge UI 모듈 */
export interface FlutterBridgeUI {
  setConfig(config: UIConfig): Promise<{ applied: boolean; config: UIConfig }>;
  showStatusBar(): Promise<{ showStatusBar: boolean }>;
  hideStatusBar(): Promise<{ showStatusBar: boolean }>;
  showAppBar(title?: string): Promise<{ showAppBar: boolean; title?: string }>;
  hideAppBar(): Promise<{ showAppBar: boolean }>;
  showBottomNav(): Promise<{ showBottomNav: boolean }>;
  hideBottomNav(): Promise<{ showBottomNav: boolean }>;
  enterFullscreen(): Promise<{ fullscreen: boolean }>;
  exitFullscreen(): Promise<{ fullscreen: boolean }>;
  startLoading(): Promise<{ loading: boolean }>;
  stopLoading(): Promise<{ loading: boolean }>;
  /**
   * Native InAppWebView Pull-to-Refresh 활성/비활성 직접 제어 (2026-05-13 신규 — 이슈 D15).
   *
   * - 페이지가 자체 새로고침 UX (예: 무한스크롤 onClick refresh) 를 갖고 있어 Native PTR
   *   reload 가 사용자 경험을 해치는 경우 `false` 호출.
   * - 미호출 시 Flutter 측 URL 기반 자동 정책 (인증/온보딩 = 비활성, 그 외 = 활성) 적용.
   *
   * `useNativeUI({ pullToRefreshEnabled })` 와 동일한 효과 — setConfig 호출과 별도로
   * 명령형 API 가 필요한 경우 사용.
   */
  setPullToRefresh(enabled: boolean): Promise<{ enabled: boolean }>;
  onConfigChange(handler: (config: UIConfig) => void): void;
  /** AppBar 버튼 이벤트 핸들러 등록 (뒤로가기, 메뉴, 새로고침) */
  /**
   * AppBar 버튼 이벤트 핸들러 등록 (뒤로가기, 메뉴, 새로고침).
   * Native 측 Bridge 인터페이스는 void 반환하지만, 상위 `ui.onAppBarEvent` wrapper 가
   * `() => void` 구독 해제 함수를 반환한다 (P2-1).
   */
  onAppBarEvent(handler: AppBarEventHandler): void;

  // ─── Sprint 5: 공유 / 앱 버전 / 푸시 권한 (native 미탑재 시 undefined) ───
  /** 네이티브 공유 시트 열기. native 미탑재 시 웹에서 자동 폴백 */
  share?(payload: {
    title?: string;
    text?: string;
    url?: string;
  }): Promise<{ shared: boolean }>;
  /** 네이티브 앱 버전 조회 (pubspec.yaml 기반) */
  getAppVersion?(): Promise<{
    version: string;
    build?: string;
    platform: "ios" | "android";
  }>;
  /** 푸시 알림 권한 요청 */
  requestNotificationPermission?(): Promise<{ granted: boolean }>;
  /**
   * WebView 첫 paint 완료 신호 → Flutter native_splash hide 트리거 (2026-05-20 v18 신규).
   *
   * SPEC: claudedocs/SPEC_LOADER_IMPECCABLE_2026-05-20.md §3.4
   * SoT : docs/Design/LOADING_TIMING_POLICY.md (Phase 5)
   *
   * - main.dart 의 `removeNativeSplashOnce()` 는 idempotent. 중복 호출 안전.
   * - 5초 failsafe 와 race 발생 시 boolean 가드로 1회만 동작.
   * - 구버전 Flutter 빌드(signalFirstPaint 미지원)에서는 undefined → no-op.
   */
  signalFirstPaint?(): Promise<{ splashRemoved: boolean }>;
  /**
   * 디바이스 해상도/Safe Area 조회 (2026-05-08 신규).
   *
   * Android WebView 에서 `env(safe-area-inset-bottom)` 이 0px 로 평가되어
   * BottomNav 가 navigation/indicator 영역을 침범하는 문제를 해결하기 위해 추가.
   * Flutter `MediaQuery.padding` 값을 logical pixels(CSS px) 단위로 반환.
   *
   * native 미탑재 시 undefined → Web 측은 기존 `env(safe-area-inset-*)` 폴백 사용.
   */
  getDeviceInfo?(): Promise<DeviceInfo>;

  /**
   * 화면 metrics 변경 push 이벤트 구독 (2026-05-09 신규).
   *
   * Flutter 측이 `WidgetsBindingObserver.didChangeMetrics` (회전·키보드·접힘) 또는
   * `didChangePlatformBrightness` 변경을 감지하여 Web 으로 push 합니다. Web 은 본
   * subscription 으로 변경 사항을 받아 `applyDeviceInsetsToCss` 를 즉시 재실행하여
   * autolayout CSS 변수를 갱신합니다.
   *
   * native 미탑재 환경에서는 본 메서드가 미구현 — `subscribeToDeviceMetrics` 가
   * `window.resize` / `visualViewport.resize` 폴백으로 대체합니다.
   *
   * @returns unsubscribe 함수 (effect cleanup)
   */
  onDeviceMetricsChange?(handler: (info: DeviceInfo) => void): () => void;
}

/** 디바이스 해상도/Safe Area 정보 (logical pixels = CSS px) */
export interface DeviceInfo {
  /** 논리 화면 크기 (CSS px) */
  screen: { width: number; height: number };
  /** 물리 픽셀 크기 (참고용) */
  physicalSize: { width: number; height: number };
  /** Safe Area inset (notch, home indicator, navigation bar 등) */
  safeArea: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  /** ViewInsets (키보드 등 일시 가림 영역) */
  viewInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  /** Device Pixel Ratio */
  devicePixelRatio: number;
  /** 플랫폼 */
  platform: "ios" | "android";
  /** 화면 방향 */
  orientation: "portrait" | "landscape";
}

/** 업로드 소스 종류 */
export type UploadSource = "camera" | "gallery" | "files";

/** 업로드 선택 결과 (Flutter → Web) */
export interface UploadPickResult {
  /** 원본 파일명 */
  name: string;
  /** 바이트 크기 */
  size: number;
  /** MIME 타입 */
  mimeType: string;
  /**
   * 임시 로컬 경로(Native) 또는 base64 데이터 URL.
   * Web 측에서는 이를 Blob/File로 변환해 multipart 업로드에 사용.
   */
  path?: string;
  dataUrl?: string;
  /** 이미지/영상 가로 (있을 때) */
  width?: number;
  /** 이미지/영상 세로 (있을 때) */
  height?: number;
}

/** Flutter 업로드 카테고리 (서버 UploadCategory enum과 1:1) */
export type UploadBridgeCategory =
  | "IMAGE"
  | "AVATAR"
  | "DOCUMENT"
  | "VIDEO"
  | "ATTACHMENT";

/** 원격(백엔드) 업로드 결과 */
export interface RemoteUploadedFile {
  id: string;
  category: UploadBridgeCategory;
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: string;
}

/** 로컬 저장 결과 (saveLocal) */
export interface LocalStoredFile {
  path: string;
  relativePath: string;
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  createdAt: string;
  category: UploadBridgeCategory;
}

/** 로컬 파일 메타 (listLocal · renameLocal) */
export interface LocalFileMeta {
  path: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  category: UploadBridgeCategory;
  storedName: string;
  mimeType: string;
}

/** 로컬 파일 본문 (readLocal) */
export interface LocalFileContent {
  path: string;
  size: number;
  mimeType: string;
  dataBase64: string;
}

/** 저장소 통계 (getStorageInfo) */
export interface StorageInfo {
  totalBytes: number;
  fileCount: number;
  byCategory: Record<UploadBridgeCategory, number>;
  rootPath: string;
}

/** 권한 요청 결과 */
export interface UploadPermissionResult {
  granted: boolean;
  permanentlyDenied?: boolean;
  message?: string;
}

/** Flutter 업로드 브릿지 */
export interface FlutterBridgeUpload {
  /** 카메라 또는 갤러리로 이미지 선택 */
  pickImage(options: {
    source: UploadSource;
    maxSize?: number;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  }): Promise<UploadPickResult>;
  /** 갤러리에서 다중 이미지 선택 */
  pickMultipleImages(options?: {
    maxCount?: number;
    maxSize?: number;
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  }): Promise<{ files: UploadPickResult[] }>;
  /** 문서·첨부파일 선택 (iOS DocumentPicker / Android SAF) */
  pickFile(options?: {
    accept?: string[];
    maxSize?: number;
  }): Promise<UploadPickResult>;

  /** 로컬 파일을 백엔드에 업로드 (`POST /api/v1/files/upload`) */
  uploadToServer(params: {
    localPath: string;
    category: UploadBridgeCategory;
    refType?: string;
    refId?: string;
    originalName?: string;
  }): Promise<RemoteUploadedFile>;
  /** 서버 업로드 파일 삭제 */
  deleteRemote(params: { id: string }): Promise<{ deleted: true; id: string }>;

  /** 로컬 저장 (연월 자동 디렉토리) — dataBase64 또는 sourcePath */
  saveLocal(params: {
    category: UploadBridgeCategory;
    originalName: string;
    dataBase64?: string;
    sourcePath?: string;
  }): Promise<LocalStoredFile>;
  /** 로컬 파일 읽기 (base64) */
  readLocal(params: { path: string }): Promise<LocalFileContent>;
  /** 로컬 파일 목록 (카테고리 선택) */
  listLocal(params?: {
    category?: UploadBridgeCategory;
  }): Promise<{ files: LocalFileMeta[] }>;
  /** 로컬 파일명 변경 (연월 경로 유지) */
  renameLocal(params: {
    oldPath: string;
    newFileName: string;
  }): Promise<LocalFileMeta>;
  /** 로컬 파일 단일 삭제 */
  deleteLocal(params: {
    path: string;
  }): Promise<{ deleted: true; path: string }>;
  /** 카테고리 전체 삭제 */
  clearCategory(params: {
    category: UploadBridgeCategory;
  }): Promise<{ deletedCount: number; category: UploadBridgeCategory }>;
  /** 저장소 통계 */
  getStorageInfo(): Promise<StorageInfo>;

  /** 권한 요청 (카메라/사진/마이크) */
  requestPermission(params: {
    kind: "camera" | "photos" | "microphone";
  }): Promise<UploadPermissionResult>;
  /** OS 설정 앱으로 이동 (permanentlyDenied 복구용) */
  openSettings(): Promise<{ opened: boolean }>;
}

/** Flutter Bridge 전체 인터페이스 */
export interface FlutterBridge {
  auth: FlutterBridgeAuth;
  identity: FlutterBridgeIdentity;
  qr: FlutterBridgeQR;
  navigation: FlutterBridgeNavigation;
  payment: FlutterBridgePayment;
  ui: FlutterBridgeUI;
  /** 업로드(카메라·갤러리·문서) — 선택 기능 */
  upload?: FlutterBridgeUpload;
}

/** Web-Flutter 통신용 Bridge 인터페이스 */
export interface WebFlutterBridge {
  onMessage?: (messageJson: string) => void;
}

// Window 타입 확장
declare global {
  interface Window {
    FlutterBridge?: FlutterBridge;
    flutter_inappwebview?: FlutterInAppWebView;
    flutterBridge?: WebFlutterBridge;
  }
}

// ============================================
// API 요청 옵션 타입
// ============================================
export interface ApiRequestOptions {
  /** true: 비동기 (기본값), false: 동기 */
  async?: boolean;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
}

// ─── 요청관리·getBridge (C-1 2026-06-07) ───

// 비동기 요청 대기 관리.
// 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P2-2): 이전에 `abortController?: AbortController`
// 필드가 선언만 되어 있고 실제로 set 되지 않던 dead field 를 제거. 취소는
// requestId 기반 reject + `cancelRequest` native 알림으로 일원화. AbortSignal 연동은
// `api.call(..., { signal })` 레벨에서 `signal.addEventListener('abort', ...)` 로 처리.
export const pendingApiRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
  }
>();

/**
 * 요청 취소 에러 코드
 */
export const CANCELLED_ERROR_CODE = "CANCELLED";

/**
 * 특정 요청 취소
 */
export function cancelRequest(requestId: string): boolean {
  const pending = pendingApiRequests.get(requestId);
  if (pending) {
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    const cancelError = createApiError(
      CANCELLED_ERROR_CODE,
      "요청이 취소되었습니다.",
    );
    pending.reject(new ApiRequestError(cancelError));
    pendingApiRequests.delete(requestId);

    // Native에 취소 알림 (Flutter에서 처리)
    if (typeof window !== "undefined" && window.flutter_inappwebview) {
      window.flutter_inappwebview
        .callHandler("cancelRequest", { requestId })
        .catch(() => {
          // 취소 알림 실패는 무시
        });
    }
    return true;
  }
  return false;
}

/**
 * 모든 대기 중인 요청 취소
 */
export function cancelAllRequests(): void {
  const requestIds = Array.from(pendingApiRequests.keys());
  requestIds.forEach(cancelRequest);
}

// 요청 ID 생성
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Flutter Bridge 가용 여부 — SOT 는 `lib/environment.ts` 의 isFlutterBridgeAvailable.
// 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P1-1): 기존 native-bridge 에 중복 정의된
// 완화된 체크(`FlutterBridge` 존재만 확인) 를 제거하고, `FlutterBridge.auth` 까지
// 확인하는 environment.ts 의 엄격한 체크를 단일 SOT 로 재export. 두 군데에서 기준이
// 달라 "준비 완료 vs 미완료" 판단이 엇갈리던 문제를 근본 해결.
import { isFlutterBridgeAvailable } from "@/lib/environment";
export { isFlutterBridgeAvailable };

// Flutter Bridge 인스턴스 가져오기 (Origin 검증 포함)
export function getBridge(): FlutterBridge {
  if (!isFlutterBridgeAvailable()) {
    throw new Error("Flutter Bridge not available. Running outside WebView?");
  }

  // Origin 검증: 허용된 origin에서만 Bridge 접근 허용
  if (!verifyOrigin()) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "unknown";
    if (isSecurityEnforced()) {
      throw new Error(`Bridge access denied: unauthorized origin (${origin})`);
    } else {
      bridgeLogger.warn(`Origin 검증 실패 (개발 모드, 허용): ${origin}`);
    }
  }

  return window.FlutterBridge!;
}

// ─── Native→Web 메시지 dispatcher (C-1 2026-06-07) ───

// ============================================
// Native → Web 메시지 Dispatcher
// --------------------------------------------
// 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P0-1): 이전에는 `initApiResponseListener()`
// 가 `window.flutterBridge.onMessage` 를 **재할당** 하는 방식이었다. Flutter 앱의
// webview_screen.dart 도 같은 슬롯을 재할당하고 있어 deep link / UI / AppBar 이벤트와
// API 응답 중 일부가 유실되는 충돌이 있었다 (단일 슬롯 stomp).
//
// 해결:
//   1) 내부 `bridgeMessageListeners: Set<(messageJson) => void>` dispatcher 유지
//   2) `addMessageListener(listener)` · `removeMessageListener(listener)` export
//   3) 최초 초기화 시점에 `window.flutterBridge.onMessage` 가 이미 다른 핸들러로
//      설정되어 있으면 **보존** 하고, dispatcher 가 **원본 핸들러도 함께 호출**.
//   4) initApiResponseListener() 는 **함수 시그니처 유지**, 내부 구현만 dispatcher
//      기반으로 전환 (호출처 api-client.ts:140 하위 호환).
// ============================================

type BridgeMessageListener = (messageJson: string) => void;

const bridgeMessageListeners = new Set<BridgeMessageListener>();
let bridgeDispatcherInstalled = false;
let previousOnMessage: BridgeMessageListener | null = null;

function installBridgeDispatcher(): void {
  if (typeof window === "undefined" || bridgeDispatcherInstalled) return;

  window.flutterBridge = window.flutterBridge || {};

  // 기존 핸들러가 이미 있으면 보존해 함께 호출 (App 측 주입 스크립트 호환).
  if (typeof window.flutterBridge.onMessage === "function") {
    previousOnMessage = window.flutterBridge.onMessage as BridgeMessageListener;
  }

  window.flutterBridge.onMessage = (messageJson: string) => {
    // 1) 보존된 기존 핸들러 선호출
    if (previousOnMessage) {
      try {
        previousOnMessage(messageJson);
      } catch (e) {
        bridgeLogger.error("previous onMessage failed:", e);
      }
    }
    // 2) 모든 등록 리스너에 분배
    bridgeMessageListeners.forEach((listener) => {
      try {
        listener(messageJson);
      } catch (e) {
        bridgeLogger.error("listener failed:", e);
      }
    });
  };

  bridgeDispatcherInstalled = true;
}

/**
 * Native → Web 메시지 리스너 등록. 반환된 함수를 호출하면 해제된다.
 *
 * dispatcher 는 최초 호출 시 자동 설치되며 `window.flutterBridge.onMessage` 를
 * 덮어쓰지 않고 기존 핸들러가 있으면 함께 호출한다.
 */
export function addMessageListener(
  listener: BridgeMessageListener,
): () => void {
  installBridgeDispatcher();
  bridgeMessageListeners.add(listener);
  return () => {
    bridgeMessageListeners.delete(listener);
  };
}

/** Native → Web 메시지 리스너 제거 */
export function removeMessageListener(listener: BridgeMessageListener): void {
  bridgeMessageListeners.delete(listener);
}

/**
 * API 응답 리스너 초기화
 * 앱 시작 시 호출하여 비동기 API 응답을 수신할 수 있도록 합니다.
 *
 * 하위 호환: api-client.ts 등 외부 호출처 보존 — 내부 구현만 dispatcher 기반 전환.
 */
export function initApiResponseListener(): void {
  if (typeof window === "undefined") return;

  addMessageListener((messageJson) => {
    try {
      const message = JSON.parse(messageJson);

      // API 응답 처리
      if (message.type === "api" && message.data?.action === "apiResponse") {
        const { requestId, success, data, error } = message.data;
        const pending = pendingApiRequests.get(requestId);

        if (pending) {
          // 타임아웃 타이머 정리
          if (pending.timeoutId) clearTimeout(pending.timeoutId);

          if (success) {
            // [2026-05-14 fix v2] 백엔드 응답 envelope unwrap — 조건 강화.
            //   Flutter Dio 가 백엔드 응답 본문 `{success, data}` 를 그대로 전달하면
            //   여기서 한 번 더 success/data 가 중첩되어 web 측 `response.data.user` 가
            //   undefined 가 되어 로그인 / 페이지 데이터 fetch 가 무한 실패하던 회귀를 차단.
            //
            //   ⚠️ 휴리스틱 안전성: envelope 으로 판정하려면 `success` 가 boolean 이고
            //     동시에 `data` 또는 `error` 키가 있어야 한다. (단순 `{success:true}` 만
            //     리턴하는 정상 응답이 envelope 으로 오인되어 null 로 unwrap 되던 회귀 차단.)
            let payload: unknown = data;
            if (
              payload &&
              typeof payload === "object" &&
              !Array.isArray(payload) &&
              "success" in payload &&
              typeof (payload as { success?: unknown }).success === "boolean" &&
              ("data" in payload || "error" in payload || "message" in payload)
            ) {
              const envelope = payload as {
                success: boolean;
                data?: unknown;
                error?: unknown;
              };
              if (envelope.success === false) {
                pending.reject(
                  new ApiRequestError(parseNativeError(envelope.error)),
                );
                pendingApiRequests.delete(requestId);
                return;
              }
              // data 키가 명시적으로 있을 때만 풀고, 그 외(예: {success:true} 만 있는 응답)는 원본 유지
              if ("data" in payload) {
                payload = envelope.data ?? null;
              }
            }
            pending.resolve(payload);
          } else {
            const apiError = parseNativeError(error);
            pending.reject(new ApiRequestError(apiError));
          }
          pendingApiRequests.delete(requestId);
        }
      }
    } catch (e) {
      bridgeLogger.error("Failed to parse bridge message:", e);
    }
  });
}

// ─── 공유 호출 헬퍼 callNativeApi/callUIBridge (C-1 2026-06-07) ───

/**
 * Native API 호출 (내부 유틸리티)
 *
 * 보안 검증 포함:
 * - Origin 검증: 허용된 origin에서만 호출 가능
 * - Timestamp 검증: 5분 이내 요청만 허용
 * - Nonce 검증: 동일 요청 재사용 차단
 */
export async function callNativeApi(request: {
  method: string;
  endpoint: string;
  data?: unknown;
  queryParams?: Record<string, unknown>;
  async: boolean;
  requestId?: string;
}): Promise<unknown> {
  if (!isFlutterBridgeAvailable()) {
    const bridgeError = handleBridgeError(
      "api",
      {
        code: "BRIDGE_NOT_AVAILABLE",
        message: "Flutter Bridge를 사용할 수 없습니다.",
      },
      { endpoint: request.endpoint, method: request.method },
    );
    throw new ApiRequestError(
      createApiError(ApiErrorCode.NETWORK_ERROR, bridgeError.userMessage),
    );
  }

  if (
    typeof window === "undefined" ||
    typeof window.flutter_inappwebview?.callHandler !== "function"
  ) {
    const bridgeError = handleBridgeError(
      "api",
      {
        code: "BRIDGE_NOT_READY",
        message: "Flutter WebView Bridge가 아직 준비되지 않았습니다.",
      },
      { endpoint: request.endpoint, method: request.method },
    );
    throw new ApiRequestError(
      createApiError(ApiErrorCode.NETWORK_ERROR, bridgeError.userMessage),
    );
  }

  // 보안 컨텍스트 생성 및 검증
  const securityCtx = createSecurityContext("api");
  const validation = validateSecurityContext(securityCtx);

  if (!validation.valid) {
    if (isSecurityEnforced()) {
      const bridgeError = handleBridgeError(
        "api",
        {
          code: "SECURITY_VALIDATION_FAILED",
          message: `보안 검증 실패: ${validation.reason}`,
        },
        { endpoint: request.endpoint, method: request.method },
      );
      throw new ApiRequestError(
        createApiError(ApiErrorCode.NETWORK_ERROR, bridgeError.userMessage),
      );
    } else {
      bridgeLogger.warn(
        `보안 검증 실패 (개발 모드, 허용): ${validation.reason}`,
      );
    }
  }

  // 요청에 보안 메타데이터 첨부
  const securedRequest = {
    ...request,
    _security: {
      timestamp: securityCtx.timestamp,
      nonce: securityCtx.nonce,
    },
  };

  return new Promise((resolve, reject) => {
    try {
      // flutter_inappwebview의 callHandler 사용
      window
        .flutter_inappwebview!.callHandler("api", securedRequest)
        .then((result) => {
          const typedResult = result as {
            success: boolean;
            data?: unknown;
            error?: unknown;
            pending?: boolean;
          };
          if (typedResult.pending) {
            // 비동기: pendingRequests에 등록하고 대기
            // (이미 호출 전에 등록됨)
            resolve(typedResult);
          } else if (typedResult.success) {
            resolve(typedResult.data);
          } else {
            // 표준화된 에러 형식으로 변환
            const apiError = parseNativeError(typedResult.error);
            handleBridgeError("api", apiError, {
              endpoint: request.endpoint,
              method: request.method,
            });
            reject(new ApiRequestError(apiError));
          }
        })
        .catch((e: unknown) => {
          const bridgeError = handleBridgeError(
            "api",
            {
              code: "BRIDGE_COMMUNICATION_ERROR",
              message: e instanceof Error ? e.message : "Native 통신 오류",
            },
            { endpoint: request.endpoint, method: request.method },
          );
          const apiError = createApiError(
            ApiErrorCode.NETWORK_ERROR,
            bridgeError.userMessage,
          );
          reject(new ApiRequestError(apiError));
        });
    } catch (e) {
      const bridgeError = handleBridgeError(
        "api",
        {
          code: "BRIDGE_COMMUNICATION_ERROR",
          message: e instanceof Error ? e.message : "Native 호출 오류",
        },
        { endpoint: request.endpoint, method: request.method },
      );
      const apiError = createApiError(
        ApiErrorCode.NETWORK_ERROR,
        bridgeError.userMessage,
      );
      reject(new ApiRequestError(apiError));
    }
  });
}


// ============================================
// UI 헬퍼: 반복되는 try-catch 패턴 추출
// ============================================

/**
 * UI 브릿지 호출 래퍼 - boolean 결과 반환
 * NonNullable<>로 optional 메서드(Sprint 5 share/getAppVersion/requestNotificationPermission)를 제외
 */
export type RequiredUIMethods = {
  [K in keyof FlutterBridgeUI as NonNullable<FlutterBridgeUI[K]> extends (
    ...args: infer _P
  ) => Promise<unknown>
    ? undefined extends FlutterBridgeUI[K]
      ? never
      : K
    : never]: NonNullable<FlutterBridgeUI[K]>;
};

export async function callUIBridge<K extends keyof RequiredUIMethods>(
  method: K,
  errorCode: string,
  extractResult: (result: Awaited<ReturnType<RequiredUIMethods[K]>>) => boolean,
  ...args: Parameters<RequiredUIMethods[K]>
): Promise<boolean> {
  try {
    const bridge = getBridge();
    const fn = bridge.ui[method] as (...a: unknown[]) => Promise<unknown>;
    const result = await fn.apply(bridge.ui, args);
    return extractResult(result as Awaited<ReturnType<RequiredUIMethods[K]>>);
  } catch (error) {
    handleBridgeError(
      "ui",
      {
        code: errorCode,
        message: error instanceof Error ? error.message : String(error),
      },
      { operation: method },
    );
    return false;
  }
}
