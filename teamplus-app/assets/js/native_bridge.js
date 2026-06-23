/**
 * TEAMPLUS Flutter Native Bridge
 * Web ↔ Flutter Native 양방향 통신
 *
 * 사용 예시:
 * ```javascript
 * // 토큰 조회
 * const tokenInfo = await FlutterBridge.auth.getToken();
 *
 * // QR 스캔
 * const qrResult = await FlutterBridge.qr.scan();
 *
 * // 결제 시작
 * const paymentResult = await FlutterBridge.payment.initiate({...});
 * ```
 */

class FlutterBridge {
  constructor() {
    this.messageHandlers = {};
    this.setupMessageListener();
  }

  /**
   * Native로부터 메시지 수신 리스너
   */
  setupMessageListener() {
    window.flutterBridge = {
      onMessage: (messageJson) => {
        try {
          const message = JSON.parse(messageJson);
          this.handleNativeMessage(message);
        } catch (error) {
          console.error("Failed to parse native message:", error);
        }
      },
    };
  }

  /**
   * Native 메시지 처리
   */
  handleNativeMessage(message) {
    const { type, data } = message;
    const handlers = this.messageHandlers[type] || [];

    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error handling ${type} message:`, error);
      }
    });
  }

  /**
   * 메시지 핸들러 등록
   */
  on(type, handler) {
    if (!this.messageHandlers[type]) {
      this.messageHandlers[type] = [];
    }
    this.messageHandlers[type].push(handler);
  }

  /**
   * 메시지 핸들러 제거
   */
  off(type, handler) {
    if (!this.messageHandlers[type]) return;

    const index = this.messageHandlers[type].indexOf(handler);
    if (index > -1) {
      this.messageHandlers[type].splice(index, 1);
    }
  }

  /**
   * Native 함수 호출 (Promise 기반)
   */
  async callNative(handlerName, ...args) {
    try {
      if (
        window.flutter_inappwebview &&
        window.flutter_inappwebview.callHandler
      ) {
        const result = await window.flutter_inappwebview.callHandler(
          handlerName,
          ...args,
        );
        return result;
      } else {
        throw new Error("Flutter bridge not available");
      }
    } catch (error) {
      console.error(`Failed to call native handler ${handlerName}:`, error);
      throw error;
    }
  }

  /**
   * 인증 관련 메서드
   */
  auth = {
    /**
     * 토큰 정보 조회
     */
    getToken: async () => {
      const result = await this.callNative("auth", "getToken");
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "Failed to get token");
    },

    /**
     * 토큰 저장
     */
    saveToken: async (tokenData) => {
      const result = await this.callNative("auth", "saveToken", tokenData);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "Failed to save token");
    },

    /**
     * 토큰 삭제 (로그아웃)
     */
    clearToken: async () => {
      const result = await this.callNative("auth", "clearToken");
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "Failed to clear token");
    },

    /**
     * 인증 상태 확인
     */
    isAuthenticated: async () => {
      const result = await this.callNative("auth", "isAuthenticated");
      if (result.success) {
        return result.data.isAuthenticated;
      }
      throw new Error(result.error || "Failed to check authentication");
    },
  };

  /**
   * QR 스캔 관련 메서드
   */
  qr = {
    /**
     * 카메라 권한 요청
     */
    requestPermission: async () => {
      const result = await this.callNative("qrScan", "requestPermission");
      if (result.success) {
        return result.data.hasPermission;
      }
      throw new Error(result.error || "Failed to request camera permission");
    },

    /**
     * 카메라 권한 확인
     */
    checkPermission: async () => {
      const result = await this.callNative("qrScan", "checkPermission");
      if (result.success) {
        return result.data.hasPermission;
      }
      throw new Error(result.error || "Failed to check camera permission");
    },

    /**
     * QR 스캔 시작
     */
    scan: async () => {
      const result = await this.callNative("qrScan", "scan");
      if (result.success) {
        return new Promise((resolve, reject) => {
          // Native에서 결과를 메시지로 전송할 때까지 대기
          const handler = (data) => {
            if (data.action === "scanResult") {
              this.off("qrScan", handler);
              resolve(data.result);
            }
          };
          this.on("qrScan", handler);

          // 타임아웃 설정 (30초)
          setTimeout(() => {
            this.off("qrScan", handler);
            reject(new Error("QR scan timeout"));
          }, 30000);
        });
      }
      throw new Error(result.error || "Failed to start QR scan");
    },
  };

  /**
   * 결제 관련 메서드
   */
  payment = {
    /**
     * 결제 시작
     */
    initiate: async (paymentData) => {
      const result = await this.callNative("payment", {
        action: "initiate",
        ...paymentData,
      });

      if (result.success) {
        return new Promise((resolve, reject) => {
          // Native에서 결제 결과를 메시지로 전송할 때까지 대기
          const handler = (data) => {
            if (data.action === "paymentResult") {
              this.off("payment", handler);
              if (data.success) {
                resolve(data);
              } else {
                reject(new Error(data.errorMessage || "Payment failed"));
              }
            }
          };
          this.on("payment", handler);

          // 타임아웃 설정 (5분)
          setTimeout(() => {
            this.off("payment", handler);
            reject(new Error("Payment timeout"));
          }, 300000);
        });
      }
      throw new Error(result.error || "Failed to initiate payment");
    },

    /**
     * 결제 검증
     */
    verify: async (transactionId) => {
      const result = await this.callNative("payment", {
        action: "verify",
        transactionId,
      });

      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "Failed to verify payment");
    },
  };

  /**
   * 생체인증 관련 메서드
   */
  biometric = {
    /**
     * 생체인증 가능 여부 확인
     */
    checkAvailability: async () => {
      const result = await this.callNative("biometric", "checkAvailability");
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "Failed to check biometric availability");
    },

    /**
     * 생체인증 실행
     */
    authenticate: async () => {
      const result = await this.callNative("biometric", "authenticate");
      if (result.success) {
        return result.data.authenticated;
      }
      throw new Error(result.error || "Biometric authentication failed");
    },
  };

  /**
   * 알림 관련 메서드
   */
  notification = {
    /**
     * 푸시 알림 권한 요청
     */
    requestPermission: async () => {
      const result = await this.callNative("notification", {
        action: "requestPermission",
      });
      if (result.success) {
        return result.data.granted;
      }
      throw new Error(
        result.error || "Failed to request notification permission",
      );
    },

    /**
     * 로컬 알림 표시
     */
    show: async (notificationData) => {
      const result = await this.callNative("notification", {
        action: "show",
        ...notificationData,
      });
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "Failed to show notification");
    },

    /**
     * FCM 토큰 조회
     */
    getToken: async () => {
      const result = await this.callNative("notification", {
        action: "getToken",
      });
      if (result.success) {
        return result.data.token;
      }
      throw new Error(result.error || "Failed to get FCM token");
    },

    /**
     * 알림 수신 리스너
     */
    onReceived: (handler) => {
      this.on("notification", (data) => {
        if (data.action === "notificationReceived") {
          handler(data.notification);
        }
      });
    },
  };

  /**
   * 네비게이션 관련 메서드
   */
  navigation = {
    /**
     * 네이티브 화면으로 이동
     */
    navigate: async (route, params = {}) => {
      const result = await this.callNative("navigation", {
        route,
        params,
      });
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "Failed to navigate");
    },

    /**
     * 네이티브 뒤로가기 — AppBar back 버튼과 동일한 흐름을 JS 에서도 트리거.
     */
    back: async () => {
      const result = await this.callNative("navigation", { action: "back" });
      if (result && result.success) {
        return result.data;
      }
      throw new Error((result && result.error) || "Failed to navigate back");
    },

    /**
     * 현재 WebView/모달 닫기 — 일회성 화면(본인인증·결제) 용.
     */
    close: async () => {
      const result = await this.callNative("navigation", { action: "close" });
      if (result && result.success) {
        return result.data;
      }
      throw new Error((result && result.error) || "Failed to close");
    },

    /**
     * 딥링크 수신 리스너
     */
    onDeepLink: (handler) => {
      this.on("navigation", (data) => {
        if (data.action === "deepLink") {
          handler(data.url);
        }
      });
    },
  };

  /**
   * 네이티브 UI 제어 (StatusBar / AppBar / BottomNav / 로딩 스피너).
   *
   * Web 측 `useNativeUI()` 훅의 기본 진입점. 단일 `setConfig` 로 일괄 설정하거나
   * `showAppBar` / `hideBottomNav` 같은 개별 액션도 지원한다.
   *
   * @see teamplus-app/lib/core/webview/webview_bridge.dart `_handleUIRequest`
   */
  ui = {
    /**
     * UI 설정 일괄 적용 (권장).
     * @param {Object} config
     * @param {boolean} [config.showStatusBar]
     * @param {boolean} [config.showAppBar]
     * @param {string}  [config.appBarTitle]
     * @param {string}  [config.appBarColor]
     * @param {boolean} [config.showBackButton]
     * @param {boolean} [config.showMenuButton]
     * @param {'left'|'right'} [config.menuButtonPosition]
     * @param {boolean} [config.showRefreshButton]
     * @param {boolean} [config.showBottomNav]
     * @param {boolean} [config.isLoading]
     */
    setConfig: async (config) => {
      const result = await this.callNative("ui", {
        action: "setConfig",
        ...(config || {}),
      });
      if (result && result.success) {
        return result.data;
      }
      throw new Error((result && result.error) || "Failed to apply UI config");
    },

    showStatusBar: async () => bridge.ui._single("showStatusBar"),
    hideStatusBar: async () => bridge.ui._single("hideStatusBar"),
    showAppBar: async (title) => bridge.ui._single("showAppBar", { title }),
    hideAppBar: async () => bridge.ui._single("hideAppBar"),
    showBottomNav: async () => bridge.ui._single("showBottomNav"),
    hideBottomNav: async () => bridge.ui._single("hideBottomNav"),

    /**
     * 네이티브 로딩 스피너 중단 — WebView 첫 페인트 후 호출 권장.
     */
    stopLoading: async () => bridge.ui._single("stopLoading"),

    /**
     * AppBar 버튼(back / menu / refresh) 네이티브 이벤트 구독.
     * @param {(eventType: 'back'|'menu'|'refresh') => void} handler
     * @returns {() => void} unsubscribe
     */
    onAppBarEvent: (handler) => {
      const wrapped = (data) => {
        if (
          data &&
          (data.action === "back" ||
            data.action === "menu" ||
            data.action === "refresh")
        ) {
          handler(data.action);
        }
      };
      this.on("ui", wrapped);
      return () => this.off("ui", wrapped);
    },

    _single: async (action, extra = {}) => {
      const result = await this.callNative("ui", { action, ...extra });
      if (result && result.success) {
        return result.data;
      }
      throw new Error(
        (result && result.error) || `Failed UI action: ${action}`,
      );
    },
  };

  /**
   * 소프트 키보드 이벤트 — 네이티브 Scaffold `resizeToAvoidBottomInset: true`
   * 와 함께 Web 측에서 키보드 높이/상태 변경을 감지해야 할 때 사용.
   *
   * Flutter 측이 `KeyboardVisibilityController` 또는 `MediaQuery.viewInsets`
   * 변화 시 `{ type: 'keyboard', data: { action: 'show'|'hide', height }}` 를
   * broadcast 하면 아래 핸들러가 수신한다 (Flutter 브로드캐스트는 후속 구현).
   *
   * Fallback: 브라우저 `visualViewport.resize` 로 동일 정보를 직접 계산 가능.
   */
  keyboard = {
    /**
     * 키보드 표시 이벤트 — `(height: number) => void`
     */
    onShow: (handler) => {
      const wrapped = (data) => {
        if (data && data.action === "show") {
          handler(typeof data.height === "number" ? data.height : 0);
        }
      };
      this.on("keyboard", wrapped);
      return () => this.off("keyboard", wrapped);
    },

    /**
     * 키보드 숨김 이벤트 — `() => void`
     */
    onHide: (handler) => {
      const wrapped = (data) => {
        if (data && data.action === "hide") {
          handler();
        }
      };
      this.on("keyboard", wrapped);
      return () => this.off("keyboard", wrapped);
    },

    /**
     * 현재 키보드 높이 조회 (지원되는 경우). 미지원 시 0 반환.
     */
    getHeight: async () => {
      try {
        const result = await this.callNative("keyboard", {
          action: "getHeight",
        });
        if (
          result &&
          result.success &&
          typeof result.data?.height === "number"
        ) {
          return result.data.height;
        }
      } catch (_) {
        // 네이티브 핸들러 미구현 환경 — visualViewport 기반 폴백
      }
      if (typeof window !== "undefined" && window.visualViewport) {
        return Math.max(0, window.innerHeight - window.visualViewport.height);
      }
      return 0;
    },
  };

  /**
   * 네이티브 Dio 기반 API 프록시 — SSL pinning · Keep-Alive · 재시도가 필요한
   * 호출에서 `window.fetch` 대신 사용. Web 환경에서는 일반 `fetch` 로 폴백.
   *
   * @param {Object} params
   * @param {string} params.method  GET|POST|PUT|PATCH|DELETE
   * @param {string} params.path    `/api/v1/...`
   * @param {Object} [params.query]
   * @param {Object} [params.body]
   * @param {Object} [params.headers]
   */
  apiRequest = async (params) => {
    const result = await this.callNative("api", params);
    if (result && result.success) {
      return result.data;
    }
    const err = new Error(
      (result && result.error && result.error.message) ||
        "Native API request failed",
    );
    if (result && result.error) {
      err.code = result.error.code;
      err.statusCode = result.error.statusCode;
    }
    throw err;
  };

  /**
   * 진행 중인 네이티브 API 요청 취소.
   */
  cancelRequest = async (requestId) => {
    const result = await this.callNative("cancelRequest", { requestId });
    if (result && result.success) {
      return result.data;
    }
    throw new Error((result && result.error) || "Failed to cancel request");
  };

  /**
   * 본인인증 관련 메서드
   */
  identity = {
    /**
     * 본인인증 시작
     * @param {Object} options - 인증 옵션
     * @param {string} options.authUrl - 인증 URL (백엔드에서 발급)
     * @param {string} options.requestId - 요청 ID
     * @param {string} [options.provider='kg_inicis'] - 인증 제공자 (kg_inicis, kakao, nice, pass)
     * @param {string} [options.purpose='registration'] - 인증 목적 (registration, payment)
     */
    start: async (options) => {
      const {
        authUrl,
        requestId,
        provider = "kg_inicis",
        purpose = "registration",
      } = options;

      if (!authUrl || !requestId) {
        throw new Error("authUrl and requestId are required");
      }

      const result = await this.callNative("identityVerification", {
        action: "start",
        authUrl,
        requestId,
        provider,
        purpose,
      });

      if (result.success) {
        return new Promise((resolve, reject) => {
          // Native에서 인증 결과를 메시지로 전송할 때까지 대기
          const handler = (data) => {
            if (
              data.action === "verificationResult" &&
              data.requestId === requestId
            ) {
              this.off("identityVerification", handler);
              if (data.success) {
                resolve(data);
              } else {
                reject(
                  new Error(data.errorMessage || "본인인증에 실패했습니다."),
                );
              }
            }
          };
          this.on("identityVerification", handler);

          // 타임아웃 설정 (10분)
          setTimeout(() => {
            this.off("identityVerification", handler);
            reject(new Error("본인인증 시간이 초과되었습니다."));
          }, 600000);
        });
      }
      throw new Error(result.error || "본인인증을 시작할 수 없습니다.");
    },

    /**
     * 본인인증 상태 확인
     * @param {string} requestId - 요청 ID
     */
    checkStatus: async (requestId) => {
      if (!requestId) {
        throw new Error("requestId is required");
      }

      const result = await this.callNative("identityVerification", {
        action: "checkStatus",
        requestId,
      });

      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "인증 상태를 확인할 수 없습니다.");
    },

    /**
     * 사용 가능한 인증 제공자 목록 조회
     */
    getProviders: async () => {
      const result = await this.callNative("identityVerification", {
        action: "getProviders",
      });

      if (result.success) {
        return result.data.providers;
      }
      throw new Error(result.error || "인증 제공자 목록을 가져올 수 없습니다.");
    },

    /**
     * 현재 사용자의 본인인증 상태 조회
     */
    getUserVerificationStatus: async () => {
      const result = await this.callNative("identityVerification", {
        action: "getUserVerificationStatus",
      });

      if (result.success) {
        return result.data;
      }
      throw new Error(result.error || "인증 상태를 조회할 수 없습니다.");
    },

    /**
     * 본인인증 결과 수신 리스너
     * @param {Function} handler - 결과 처리 콜백
     */
    onVerificationResult: (handler) => {
      this.on("identityVerification", (data) => {
        if (data.action === "verificationResult") {
          handler(data);
        }
      });
    },
  };

  /**
   * 📤 파일 업로드 (카메라 · 갤러리 · 로컬 CRUD · 백엔드 업로드)
   *
   * 모든 액션은 Dart 측 UploadHandler의 action 분기와 1:1 매칭.
   * 실패 시 { code, message } 에러를 포함한 Error throw.
   */
  upload = {
    _invoke: async (action, params = {}) => {
      const result = await this.callNative("upload", action, params);
      if (result && result.success) {
        return result.data;
      }
      const err = new Error(
        (result && result.error && result.error.message) ||
          `Upload action failed: ${action}`,
      );
      if (result && result.error) {
        err.code = result.error.code;
      }
      throw err;
    },

    // ===== 선택 (pick) =====
    pickImage: async (options = {}) => {
      return bridge.upload._invoke("pickImage", options);
    },
    pickMultipleImages: async (options = {}) => {
      return bridge.upload._invoke("pickMultipleImages", options);
    },
    pickFile: async (options = {}) => {
      return bridge.upload._invoke("pickFile", options);
    },

    // ===== 서버 업로드 =====
    uploadToServer: async (params) => {
      return bridge.upload._invoke("uploadToServer", params);
    },
    deleteRemote: async (params) => {
      return bridge.upload._invoke("deleteRemote", params);
    },

    // ===== 로컬 CRUD (연월 자동 디렉토리) =====
    saveLocal: async (params) => {
      return bridge.upload._invoke("saveLocal", params);
    },
    readLocal: async (params) => {
      return bridge.upload._invoke("readLocal", params);
    },
    listLocal: async (params = {}) => {
      return bridge.upload._invoke("listLocal", params);
    },
    renameLocal: async (params) => {
      return bridge.upload._invoke("renameLocal", params);
    },
    deleteLocal: async (params) => {
      return bridge.upload._invoke("deleteLocal", params);
    },
    clearCategory: async (params) => {
      return bridge.upload._invoke("clearCategory", params);
    },
    getStorageInfo: async () => {
      return bridge.upload._invoke("getStorageInfo", {});
    },

    // ===== 권한 =====
    requestPermission: async (params) => {
      return bridge.upload._invoke("requestPermission", params);
    },
    openSettings: async () => {
      return bridge.upload._invoke("openSettings", {});
    },
  };
}

// 전역 인스턴스 생성
const bridge = new FlutterBridge();

// 전역 객체로 노출
window.FlutterBridge = bridge;

// ES6 모듈로도 사용 가능
export default bridge;
