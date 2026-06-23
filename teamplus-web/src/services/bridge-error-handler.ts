/**
 * Bridge Error Handler
 *
 * Native Bridge 오류를 중앙에서 처리하고 사용자에게 알립니다.
 *
 * 주요 기능:
 * - 사용자 친화적 오류 메시지 변환
 * - 중요도별 오류 분류 (critical, warning, info)
 * - Toast 알림 연동 (React 컴포넌트에서 등록)
 * - 콘솔 로깅 (개발 환경)
 * - Sentry 연동 (프로덕션 환경)
 */

import * as Sentry from '@sentry/nextjs';
import { devLog, devWarn } from '@/lib/logger';

// ============================================
// 오류 타입 정의
// ============================================

/** 오류 심각도 */
export type ErrorSeverity = 'critical' | 'warning' | 'info';

/** Bridge 오류 정보 */
export interface BridgeError {
  /** 오류 코드 */
  code: string;
  /** 기술적 오류 메시지 (개발자용) */
  technicalMessage: string;
  /** 사용자 친화적 메시지 */
  userMessage: string;
  /** 오류 심각도 */
  severity: ErrorSeverity;
  /** 발생 모듈 */
  module: 'auth' | 'qr' | 'payment' | 'navigation' | 'identity' | 'api' | 'ui' | 'upload' | 'biometric' | 'general';
  /** 원본 오류 */
  originalError?: unknown;
  /** 추가 컨텍스트 */
  context?: Record<string, unknown>;
}

/** Toast 알림 핸들러 타입 */
type ToastHandler = {
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

/** 오류 리스너 콜백 */
type ErrorListener = (error: BridgeError) => void;

// ============================================
// 오류 메시지 매핑
// ============================================

/** 모듈별 기본 오류 메시지 */
const MODULE_ERROR_MESSAGES: Record<BridgeError['module'], string> = {
  auth: '인증 처리 중 오류가 발생했습니다.',
  qr: 'QR 코드 스캔 중 오류가 발생했습니다.',
  payment: '결제 처리 중 오류가 발생했습니다.',
  navigation: '화면 이동 중 오류가 발생했습니다.',
  identity: '본인인증 처리 중 오류가 발생했습니다.',
  api: '서버 통신 중 오류가 발생했습니다.',
  ui: 'UI 설정 중 오류가 발생했습니다.',
  upload: '파일 업로드 중 오류가 발생했습니다.',
  biometric: '생체인증 처리 중 오류가 발생했습니다.',
  general: '처리 중 오류가 발생했습니다.',
};

/** 특정 오류 코드별 메시지 매핑 */
const ERROR_CODE_MESSAGES: Record<string, { message: string; severity: ErrorSeverity }> = {
  // 네트워크 오류
  NETWORK_ERROR: { message: '네트워크 연결을 확인해주세요.', severity: 'critical' },
  TIMEOUT_ERROR: { message: '요청 시간이 초과되었습니다. 다시 시도해주세요.', severity: 'warning' },
  CANCELLED: { message: '요청이 취소되었습니다.', severity: 'info' },

  // 인증 오류
  AUTH_TOKEN_EXPIRED: { message: '로그인이 만료되었습니다. 다시 로그인해주세요.', severity: 'critical' },
  AUTH_INVALID_TOKEN: { message: '인증 정보가 올바르지 않습니다.', severity: 'critical' },
  AUTH_STORAGE_ERROR: { message: '인증 정보 저장에 실패했습니다.', severity: 'warning' },

  // QR 오류
  QR_PERMISSION_DENIED: { message: '카메라 권한이 필요합니다. 설정에서 권한을 허용해주세요.', severity: 'warning' },
  QR_SCAN_FAILED: { message: 'QR 코드 인식에 실패했습니다. 다시 시도해주세요.', severity: 'info' },
  QR_INVALID_CODE: { message: '올바르지 않은 QR 코드입니다.', severity: 'warning' },

  // 결제 오류
  PAYMENT_FAILED: { message: '결제 처리에 실패했습니다. 다시 시도해주세요.', severity: 'critical' },
  PAYMENT_CANCELLED: { message: '결제가 취소되었습니다.', severity: 'info' },
  PAYMENT_VERIFY_FAILED: { message: '결제 확인에 실패했습니다. 고객센터에 문의해주세요.', severity: 'critical' },

  // 본인인증 오류
  IDENTITY_FAILED: { message: '본인인증에 실패했습니다. 다시 시도해주세요.', severity: 'warning' },
  IDENTITY_CANCELLED: { message: '본인인증이 취소되었습니다.', severity: 'info' },
  IDENTITY_TIMEOUT: { message: '본인인증 시간이 초과되었습니다.', severity: 'warning' },

  // Bridge 오류
  BRIDGE_NOT_AVAILABLE: { message: '앱 기능을 사용할 수 없습니다.', severity: 'critical' },
  BRIDGE_COMMUNICATION_ERROR: { message: '앱 통신 중 오류가 발생했습니다.', severity: 'warning' },

  // UI 오류 — 네이티브 UI 제어 실패는 WebView 미탑재 환경 및 브릿지 준비 타이밍 이슈로
  // 앱 로딩 시점에 빈번. 사용자에게 노출하지 않고 개발자 로그로만 기록 (severity: 'info').
  // 단, setConfig 는 실질 화면 구성 실패이므로 'warning' 유지.
  UI_CONFIG_ERROR: { message: 'UI 설정 변경에 실패했습니다.', severity: 'warning' },
  UI_STATUSBAR_ERROR: { message: '상태바 설정에 실패했습니다.', severity: 'info' },
  UI_APPBAR_ERROR: { message: 'AppBar 설정에 실패했습니다.', severity: 'info' },
  UI_BOTTOMNAV_ERROR: { message: '하단 네비게이션 설정에 실패했습니다.', severity: 'info' },
  UI_FULLSCREEN_ERROR: { message: '전체화면 설정에 실패했습니다.', severity: 'info' },
  UI_LISTENER_ERROR: { message: 'UI 리스너 등록에 실패했습니다.', severity: 'info' },
  // 2026-04-22 (WEB-XXX): 누락된 4개 UI 코드 추가 — 기존에는 fallback 으로 인해
  // '"UI 설정 중 오류가 발생했습니다."' warning toast 가 앱 로딩 시 발사되는 문제 해결.
  UI_LOADING_ERROR: { message: '로딩 표시 제어에 실패했습니다.', severity: 'info' },
  UI_SHARE_ERROR: { message: '공유 기능을 사용할 수 없습니다.', severity: 'info' },
  UI_GET_APP_VERSION_ERROR: { message: '앱 버전 조회에 실패했습니다.', severity: 'info' },
  UI_NOTIFICATION_PERMISSION_ERROR: { message: '알림 권한 요청에 실패했습니다.', severity: 'info' },

  // 기타
  UNKNOWN_ERROR: { message: '알 수 없는 오류가 발생했습니다.', severity: 'warning' },
};

// ============================================
// Bridge Error Handler 클래스
// ============================================

class BridgeErrorHandler {
  private toastHandler: ToastHandler | null = null;
  private listeners: Set<ErrorListener> = new Set();
  private recentErrors: BridgeError[] = [];
  private readonly maxRecentErrors = 10;

  /**
   * Toast 핸들러 등록 (React 컴포넌트에서 호출)
   */
  registerToastHandler(handler: ToastHandler): void {
    this.toastHandler = handler;
  }

  /**
   * Toast 핸들러 해제
   */
  unregisterToastHandler(): void {
    this.toastHandler = null;
  }

  /**
   * 오류 리스너 추가
   */
  addListener(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 최근 오류 목록 조회
   */
  getRecentErrors(): BridgeError[] {
    return [...this.recentErrors];
  }

  /**
   * 최근 오류 목록 초기화
   */
  clearRecentErrors(): void {
    this.recentErrors = [];
  }

  /**
   * 오류 처리 메인 함수
   */
  handleError(
    module: BridgeError['module'],
    error: unknown,
    context?: Record<string, unknown>
  ): BridgeError {
    const bridgeError = this.parseError(module, error, context);

    // 최근 오류 목록에 추가
    this.recentErrors.unshift(bridgeError);
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.pop();
    }

    // 개발 환경 로깅
    if (process.env.NODE_ENV === 'development') {
      this.logError(bridgeError);
    }

    // 프로덕션 환경: Sentry 전송 (critical, warning만)
    if (process.env.NODE_ENV === 'production' && bridgeError.severity !== 'info') {
      this.sendToSentry(bridgeError);
    }

    // 리스너들에게 알림
    this.listeners.forEach((listener) => {
      try {
        listener(bridgeError);
      } catch {
        // 리스너 오류는 무시
      }
    });

    // Toast 알림 (critical, warning만 자동 표시)
    if (this.toastHandler && bridgeError.severity !== 'info') {
      this.showToast(bridgeError);
    }

    return bridgeError;
  }

  /**
   * 오류 파싱 및 BridgeError 변환
   */
  private parseError(
    module: BridgeError['module'],
    error: unknown,
    context?: Record<string, unknown>
  ): BridgeError {
    let code = 'UNKNOWN_ERROR';
    let technicalMessage = '알 수 없는 오류';

    // 오류 코드 및 메시지 추출
    if (error && typeof error === 'object') {
      if ('code' in error && typeof error.code === 'string') {
        code = error.code;
      }
      if ('message' in error && typeof error.message === 'string') {
        technicalMessage = error.message;
      }
    } else if (error instanceof Error) {
      technicalMessage = error.message;
    } else if (typeof error === 'string') {
      technicalMessage = error;
    }

    // 사용자 친화적 메시지 및 심각도 결정.
    // 2026-04-22: UI 모듈의 fallback severity 를 'info' 로 강등 — 네이티브 UI 제어
    // (상태바/AppBar/BottomNav/공유/앱버전 등) 실패는 사용자 경험에 크리티컬하지 않고
    // WebView 미탑재 · 브릿지 준비 타이밍 이슈로 앱 로딩 시 빈번. 신규 UI 에러 코드가
    // ERROR_CODE_MESSAGES 등록 전에 먼저 발생해도 사용자에게 toast 가 노출되지 않음.
    const fallbackSeverity: ErrorSeverity = module === 'ui' ? 'info' : 'warning';
    const mapping = ERROR_CODE_MESSAGES[code] || {
      message: MODULE_ERROR_MESSAGES[module],
      severity: fallbackSeverity,
    };

    return {
      code,
      technicalMessage,
      userMessage: mapping.message,
      severity: mapping.severity,
      module,
      originalError: error,
      context,
    };
  }

  /**
   * 개발 환경 콘솔 로깅
   */
  private logError(error: BridgeError): void {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const prefix = `[BridgeError:${error.module}]`;
    const severityEmoji = {
      critical: '🔴',
      warning: '🟡',
      info: '🔵',
    }[error.severity];

    console.group(`${severityEmoji} ${prefix} ${error.code}`);
    devLog('Technical:', error.technicalMessage);
    devLog('User Message:', error.userMessage);
    devLog('Severity:', error.severity);
    if (error.context) {
      devLog('Context:', error.context);
    }
    if (error.originalError) {
      devLog('Original Error:', error.originalError);
    }
    console.groupEnd();
  }

  /**
   * Sentry 오류 전송
   */
  private sendToSentry(error: BridgeError): void {
    Sentry.withScope((scope) => {
      scope.setTag('bridge_module', error.module);
      scope.setTag('error_code', error.code);
      scope.setTag('severity', error.severity);

      if (error.context) {
        scope.setExtras(error.context);
      }

      const sentryError = new Error(`[Bridge:${error.module}] ${error.technicalMessage}`);
      sentryError.name = `BridgeError:${error.code}`;

      if (error.severity === 'critical') {
        Sentry.captureException(sentryError);
      } else {
        Sentry.captureMessage(error.technicalMessage, 'warning');
      }
    });
  }

  /**
   * Toast 알림 표시
   */
  private showToast(error: BridgeError): void {
    if (!this.toastHandler) return;

    switch (error.severity) {
      case 'critical':
        this.toastHandler.error(error.userMessage);
        break;
      case 'warning':
        this.toastHandler.warning(error.userMessage);
        break;
      case 'info':
        this.toastHandler.info(error.userMessage);
        break;
    }
  }

  /**
   * 수동 Toast 표시 (명시적으로 알림이 필요한 경우)
   */
  showUserNotification(message: string, severity: ErrorSeverity = 'info'): void {
    if (!this.toastHandler) {
      if (process.env.NODE_ENV === 'development') {
        devWarn('[BridgeErrorHandler] Toast handler not registered');
      }
      return;
    }

    switch (severity) {
      case 'critical':
        this.toastHandler.error(message);
        break;
      case 'warning':
        this.toastHandler.warning(message);
        break;
      case 'info':
        this.toastHandler.info(message);
        break;
    }
  }
}

// 싱글톤 인스턴스
export const bridgeErrorHandler = new BridgeErrorHandler();

// 편의 함수 export
export function handleBridgeError(
  module: BridgeError['module'],
  error: unknown,
  context?: Record<string, unknown>
): BridgeError {
  return bridgeErrorHandler.handleError(module, error, context);
}

export default bridgeErrorHandler;
