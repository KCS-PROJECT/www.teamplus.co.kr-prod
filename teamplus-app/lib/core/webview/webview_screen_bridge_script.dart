// part of webview_screen.dart — FlutterBridge 주입 스크립트(_flutterBridgeScript) 분리.
// AT_DOCUMENT_START 에서 window.FlutterBridge 를 주입하는 const 문자열.
// M2 리팩터 2026-06-24: webview_screen.dart 본문 축소 목적. 문자열 내용·동작 변경 없음
// (top-level private const 그대로 이동).
part of 'webview_screen.dart';

/// FlutterBridge 주입 스크립트
/// 페이지의 JavaScript가 실행되기 전에 window.FlutterBridge 객체를 생성합니다.
/// AT_DOCUMENT_START에서 실행되어 Web 코드보다 먼저 주입됩니다.
const String _flutterBridgeScript = '''
(function() {
  // Flutter WebViewScreen 이 네이티브 viewPadding.top 으로 status bar 영역을
  // 이미 예약한다. Web CSS env()/Bridge top inset 이 다시 더해지면 첫 페인트 후
  // 상단 여백이 늦게 생기므로 DOCUMENT_START 에서 즉시 0으로 고정한다.
  try {
    var root = document.documentElement;
    if (root && root.style) {
      root.style.setProperty('--safe-area-inset-top', '0px');
      root.dataset.nativeSafeAreaTopHandled = 'flutter';
    }
  } catch (_) {}

  // 이미 주입된 경우 건너뛰기
  if (window.FlutterBridge) {
    console.log('[FlutterBridge] Already injected');
    return;
  }

  console.log('[FlutterBridge] Injecting bridge object at DOCUMENT_START...');

  // flutter_inappwebview가 준비될 때까지 대기하는 헬퍼 함수
  function waitForInAppWebView(callback, maxAttempts) {
    maxAttempts = maxAttempts || 50;
    var attempts = 0;

    function check() {
      if (window.flutter_inappwebview) {
        callback();
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(check, 10);
      } else {
        console.error('[FlutterBridge] flutter_inappwebview not available after ' + maxAttempts + ' attempts');
      }
    }
    check();
  }

  // flutter_inappwebview를 래핑하는 FlutterBridge 객체 생성
  // 2026-04-22 (SPEC_NATIVE_BRIDGE_REFACTOR · P2-NB-005):
  // Web 이 `getAppBridgeVersion()` 로 읽어 호환성 검증. 계약 변경 시 MINOR bump.
  // 하위 호환 깨지는 변경은 MAJOR bump (Web 의 BRIDGE_MIN_APP_VERSION 과 동기화).
  window.FlutterBridge = {
    __VERSION__: '1.1.0',  // A-3 (upload / ui.share / getAppVersion / requestNotificationPermission wrapper 추가)
    // 인증 모듈
    auth: {
      getToken: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('auth', 'getToken')
              .then(function(response) {
                if (response && response.success && response.data) {
                  resolve(response.data);
                } else {
                  resolve(null);
                }
              })
              .catch(reject);
          });
        });
      },
      saveToken: function(tokenData) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('auth', 'saveToken', tokenData)
              .then(function(response) {
                if (response && response.success) {
                  resolve();
                } else {
                  reject(new Error(response?.error || 'Failed to save token'));
                }
              })
              .catch(reject);
          });
        });
      },
      clearToken: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('auth', 'clearToken')
              .then(function(response) {
                if (response && response.success) {
                  resolve();
                } else {
                  reject(new Error(response?.error || 'Failed to clear token'));
                }
              })
              .catch(reject);
          });
        });
      },
      isAuthenticated: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('auth', 'isAuthenticated')
              .then(function(response) {
                if (response && response.success && response.data) {
                  resolve(response.data.isAuthenticated === true);
                } else {
                  resolve(false);
                }
              })
              .catch(function() { resolve(false); });
          });
        });
      }
    },

    // QR 스캔 모듈
    qr: {
      requestPermission: function() {
        return new Promise(function(resolve) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('qrScan', 'requestPermission')
              .then(function(response) {
                resolve(response?.success && response?.data?.hasPermission === true);
              })
              .catch(function() { resolve(false); });
          });
        });
      },
      scan: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('qrScan', 'scan')
              .then(function(response) {
                if (response && response.success && response.data) {
                  resolve(response.data);
                } else {
                  resolve(null);
                }
              })
              .catch(reject);
          });
        });
      }
    },

    // 네비게이션 모듈
    navigation: {
      navigate: function(route, params) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('navigation', { route: route, params: params })
              .then(resolve)
              .catch(reject);
          });
        });
      },
      onDeepLink: function(handler) {
        window._flutterDeepLinkHandler = handler;
      }
    },

    // 결제 모듈
    payment: {
      initiate: function(paymentData) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('payment', Object.assign({ action: 'initiate' }, paymentData))
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  resolve({ success: false, errorMessage: response?.error });
                }
              })
              .catch(reject);
          });
        });
      },
      verify: function(transactionId) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('payment', { action: 'verify', transactionId: transactionId })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  resolve({ success: false, verified: false, errorMessage: response?.error });
                }
              })
              .catch(reject);
          });
        });
      }
    },

    // 본인인증 모듈
    identity: {
      start: function(options) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('identityVerification', Object.assign({ action: 'start' }, options))
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error || 'Identity verification failed'));
                }
              })
              .catch(reject);
          });
        });
      },
      checkStatus: function(requestId) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('identityVerification', { action: 'checkStatus', requestId: requestId })
              .then(resolve)
              .catch(reject);
          });
        });
      },
      getProviders: function() {
        return new Promise(function(resolve) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('identityVerification', { action: 'getProviders' })
              .then(function(response) {
                if (response && response.success && response.data) {
                  resolve(response.data.providers || []);
                } else {
                  resolve([]);
                }
              })
              .catch(function() { resolve([]); });
          });
        });
      },
      getUserVerificationStatus: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('identityVerification', { action: 'getUserVerificationStatus' })
              .then(resolve)
              .catch(reject);
          });
        });
      },
      onVerificationResult: function(handler) {
        window._flutterIdentityResultHandler = handler;
      }
    },

    // UI 제어 모듈 (상태바, AppBar, BottomNav)
    ui: {
      // 전체 UI 설정 변경
      setConfig: function(config) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', Object.assign({ action: 'setConfig' }, config))
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || 'UI 설정 변경 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 상태바 표시
      showStatusBar: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'showStatusBar' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '상태바 표시 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 상태바 숨김
      hideStatusBar: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'hideStatusBar' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '상태바 숨김 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // AppBar 표시
      showAppBar: function(title) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'showAppBar', title: title })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || 'AppBar 표시 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // AppBar 숨김
      hideAppBar: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'hideAppBar' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || 'AppBar 숨김 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // BottomNav 표시
      showBottomNav: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'showBottomNav' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || 'BottomNav 표시 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // BottomNav 숨김
      hideBottomNav: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'hideBottomNav' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || 'BottomNav 숨김 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 전체화면 모드 진입 (상태바, AppBar, BottomNav 모두 숨김)
      enterFullscreen: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'enterFullscreen' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '전체화면 진입 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 전체화면 모드 종료 (기본 UI 복원)
      exitFullscreen: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'exitFullscreen' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '전체화면 종료 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 클라이언트 사이드 네비게이션 시 로딩 스피너 표시
      startLoading: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'startLoading' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '로딩 시작 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 클라이언트 사이드 네비게이션 완료 시 로딩 스피너 숨김
      stopLoading: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'stopLoading' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '로딩 종료 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // Native InAppWebView Pull-to-Refresh 활성/비활성 직접 제어 (2026-05-13 — 이슈 D15).
      // setConfig({ pullToRefreshEnabled: <bool> }) 와 동일한 효과의 명령형 API.
      setPullToRefresh: function(enabled) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'setPullToRefresh', enabled: enabled })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || 'PullToRefresh 설정 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // UI 설정 변경 이벤트 리스너 등록
      onConfigChange: function(handler) {
        window._flutterUIConfigHandler = handler;
      },

      // AppBar 버튼 이벤트 리스너 등록
      // handler: (eventType: 'back' | 'menu' | 'refresh') => void
      onAppBarEvent: function(handler) {
        window._flutterAppBarEventHandler = handler;
      },

      // ─── Sprint 5 (2026-04-22 추가): 웹 TS 타입 계약과 동기화 ───
      // native-bridge.ts 는 이미 ui.share / ui.getAppVersion / ui.requestNotificationPermission
      // wrapper 를 기대하지만 기존 JS 주입 스크립트에는 누락되어 있었다 (js_natvice1.md P0).
      // Dart 쪽 `ui` 핸들러가 각 action 을 처리하지 못하면 Web 에서는 promise reject 로
      // 안전하게 폴백한다 (native-bridge.ts:1516 주석 참고).

      // 네이티브 공유 시트 열기
      share: function(payload) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', Object.assign({ action: 'share' }, payload || {}))
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '공유 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 앱 버전 조회
      getAppVersion: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'getAppVersion' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '앱 버전 조회 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 푸시 알림 권한 요청
      requestNotificationPermission: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('ui', { action: 'requestNotificationPermission' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '푸시 권한 요청 실패'));
                }
              })
              .catch(reject);
          });
        });
      }
    },

    // ─── Upload 모듈 (2026-04-22 추가) ───
    // Dart 쪽 `upload` 핸들러는 webview_bridge.dart:296-300 에 이미 등록되어 있으나
    // JS wrapper 가 부재하여 Web 에서 이 표면을 쓰면 런타임 오류가 발생했다 (js_natvice1.md P0).
    // native-bridge.ts:381 의 FlutterBridgeUpload 인터페이스와 1:1 매핑.
    upload: {
      // 카메라 / 갤러리 / 문서 픽커로 파일 선택
      pickFile: function(options) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('upload', Object.assign({ action: 'pickFile' }, options || {}))
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '파일 선택 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 네이티브가 직접 서버 업로드 (대용량 파일 최적화)
      uploadToServer: function(payload) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('upload', Object.assign({ action: 'uploadToServer' }, payload || {}))
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '업로드 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 로컬 파일 메타 조회
      getLocalFileMeta: function(payload) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('upload', Object.assign({ action: 'getLocalFileMeta' }, payload || {}))
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '파일 메타 조회 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 저장 공간 정보
      getStorageInfo: function() {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('upload', { action: 'getStorageInfo' })
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '저장 공간 조회 실패'));
                }
              })
              .catch(reject);
          });
        });
      },

      // 업로드 권한 확인
      checkPermission: function(payload) {
        return new Promise(function(resolve, reject) {
          waitForInAppWebView(function() {
            window.flutter_inappwebview.callHandler('upload', Object.assign({ action: 'checkPermission' }, payload || {}))
              .then(function(response) {
                if (response && response.success) {
                  resolve(response.data);
                } else {
                  reject(new Error(response?.error?.message || response?.error || '권한 확인 실패'));
                }
              })
              .catch(reject);
          });
        });
      }
    }
  };

  // ────────────────────────────────────────────────────────────
  // flutterBridge 메시지 핸들러 초기화 (Native → Web 통신용)
  //
  // 2026-04-22 (SPEC_NATIVE_BRIDGE_APP_DISPATCHER · A-1 완전 dispatcher 전환):
  //   · A-2 (이전 핸들러 보존) 완료 상태에서 A-1 완전 전환 적용.
  //   · Set 기반 listeners 로 다중 리스너 지원.
  //   · addMessageListener / removeMessageListener Public API 노출.
  //   · _appBridgeDispatcherInstalled 멱등성 가드로 재주입 시 no-op.
  //   · 기존 4개 내장 branches 를 appInternalListener 로 캡슐화.
  //   · _originalFlutterBridgeOnMessage legacy 레퍼런스 유지 (A-2 호환).
  //   · Web 쪽 native-bridge.ts v3 dispatcher 와 체인 유지:
  //     - 정상: App(DOCUMENT_START) → Web(native-bridge 로드) → 양방향 체인 ✅
  //     - 역순: Web 먼저 설치 시 App dispatcher 가 listeners.add(prev) 편입 ✅
  //     - 재주입: _appBridgeDispatcherInstalled 가드로 no-op ✅
  // ────────────────────────────────────────────────────────────
  (function installAppDispatcher() {
    if (window._appBridgeDispatcherInstalled) return;

    window.flutterBridge = window.flutterBridge || {};

    // Set 기반 리스너 저장소
    var listeners = new Set();

    // 기존 onMessage 가 이미 있으면 보존 (Web dispatcher 가 먼저 설치된 드문 케이스)
    if (typeof window.flutterBridge.onMessage === 'function') {
      var prev = window.flutterBridge.onMessage;
      listeners.add(prev);
      window._originalFlutterBridgeOnMessage = prev;  // A-2 legacy 호환 유지
    }

    // 내장 App 핸들러 — 4개 branches 를 단일 리스너로 캡슐화
    function appInternalListener(messageJson) {
      try {
        var message = JSON.parse(messageJson);

        // 딥링크 메시지 처리
        if (message.type === 'navigation' && message.data && message.data.action === 'deepLink' && window._flutterDeepLinkHandler) {
          window._flutterDeepLinkHandler(message.data.url);
        }

        // 본인인증 결과 처리
        if (message.type === 'identityVerification' && message.data && message.data.action === 'verificationResult' && window._flutterIdentityResultHandler) {
          window._flutterIdentityResultHandler(message.data);
        }

        // UI 설정 변경 처리
        if (message.type === 'ui' && message.data && message.data.action === 'configChanged' && window._flutterUIConfigHandler) {
          window._flutterUIConfigHandler(message.data.config);
        }

        // AppBar 버튼 이벤트 처리
        if (message.type === 'ui' && message.data && message.data.action === 'appBarEvent' && window._flutterAppBarEventHandler) {
          console.log('[FlutterBridge] AppBar 이벤트 수신:', message.data.eventType);
          window._flutterAppBarEventHandler(message.data.eventType);
        }
      } catch (e) {
        console.error('[FlutterBridge] app internal listener error:', e);
      }
    }
    listeners.add(appInternalListener);

    // dispatcher 단일 진입점
    window.flutterBridge.onMessage = function(messageJson) {
      listeners.forEach(function(fn) {
        try { fn(messageJson); } catch (e) { console.error('[FlutterBridge] listener error:', e); }
      });
    };

    // Public API
    window.flutterBridge.addMessageListener = function(listener) {
      if (typeof listener !== 'function') return function() {};
      listeners.add(listener);
      return function() { listeners.delete(listener); };
    };
    window.flutterBridge.removeMessageListener = function(listener) {
      listeners.delete(listener);
    };

    window._appBridgeDispatcherInstalled = true;
    console.log('[FlutterBridge] App dispatcher installed (Set 기반)');
  })();

  // 🚀 클라이언트 사이드 네비게이션 함수
  // Flutter BottomNav에서 호출하여 Next.js SPA 네비게이션 수행
  // Web에서 __NEXT_ROUTER_PUSH__를 설정하면 그것을 사용, 아니면 history.pushState 사용
  window.teamplusNavigate = function(path) {
    console.log('[FlutterBridge] teamplusNavigate called with path:', path);

    // Next.js router가 설정되어 있으면 사용 (가장 권장)
    if (window.__NEXT_ROUTER_PUSH__) {
      console.log('[FlutterBridge] Using Next.js router');
      window.__NEXT_ROUTER_PUSH__(path);
      return;
    }

    // history.pushState + popstate 이벤트로 네비게이션
    // Next.js App Router는 popstate를 감지하여 클라이언트 네비게이션 수행
    console.log('[FlutterBridge] Using history.pushState');
    window.history.pushState({ path: path }, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { path: path } }));
  };

  console.log('[FlutterBridge] Bridge object injected successfully at DOCUMENT_START');
})();
''';
