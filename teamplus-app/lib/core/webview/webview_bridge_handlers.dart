// WebView Bridge 핸들러 구현 (C-2 분리 2026-06-07) — extension on WebViewBridge.
// part of 이므로 main 파일 import·private 멤버를 그대로 공유. tear-off 는 main 의 delegate 가 보존.
part of 'webview_bridge.dart';

extension WebViewBridgeHandlers on WebViewBridge {
  Future<Map<String, dynamic>> _handleCancelRequestImpl(List<dynamic> args) async {
    try {
      if (args.isEmpty) {
        return BridgeResponse.error(error: 'requestId가 필요합니다.').toJson();
      }

      final request = args[0] as Map<String, dynamic>;
      final requestId = request['requestId'] as String?;

      if (requestId == null) {
        return BridgeResponse.error(error: 'requestId가 필요합니다.').toJson();
      }

      final cancelled = cancelRequest(requestId);
      return BridgeResponse.success(
        data: {'cancelled': cancelled, 'requestId': requestId},
      ).toJson();
    } catch (e) {
      return BridgeResponse.error(error: '요청 취소 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handleAuthRequestImpl(List<dynamic> args) async {
    try {
      final action = args.isNotEmpty ? args[0] as String : 'getToken';

      switch (action) {
        case 'getToken':
          // 토큰 정보 반환
          final tokenInfo = await _tokenStorage.getTokenInfo();
          return BridgeResponse.success(data: tokenInfo).toJson();

        case 'saveToken':
          // 토큰 저장
          if (args.length < 2) {
            return BridgeResponse.error(error: '토큰 정보가 필요합니다.').toJson();
          }
          final tokenData = args[1] as Map<String, dynamic>;
          await _tokenStorage.saveTokenInfo(
            accessToken: tokenData['accessToken'] as String,
            refreshToken: tokenData['refreshToken'] as String?,
            expiryTimestamp: tokenData['expiryTimestamp'] as int?,
            userId: tokenData['userId'] as String?,
            userType: tokenData['userType'] as String?,
            userName: tokenData['userName'] as String?,
            userEmail: tokenData['userEmail'] as String?,
          );
          // 로그인/회원가입 성공 → FCM 토큰을 해당 계정에 등록 (fire-and-forget)
          unawaited(_notificationService.ensureTokenRegistered());
          return BridgeResponse.success(
            data: {'message': '토큰이 저장되었습니다.'},
          ).toJson();

        case 'clearToken':
          // 토큰 삭제 (로그아웃) — 인증이 유효한 동안 FCM 디바이스 비활성화 후 토큰 제거
          await _notificationService.unregisterTokenFromServer();
          await _tokenStorage.clearAll();
          return BridgeResponse.success(
            data: {'message': '토큰이 삭제되었습니다.'},
          ).toJson();

        case 'isAuthenticated':
          // 인증 상태 확인
          final isAuth = await _tokenStorage.isAuthenticated();
          return BridgeResponse.success(
            data: {'isAuthenticated': isAuth},
          ).toJson();

        case 'requireLogin':
          {
            // Web 의 useAuthGuard / requireLogin 이 위임하는 가드
            // - 인증됨: { isAuthenticated: true }
            // - 미인증: 네이티브 로그인 화면 자동 오픈 + { isAuthenticated: false }
            final isAuth = await _tokenStorage.isAuthenticated();
            if (isAuth) {
              return BridgeResponse.success(
                data: {'isAuthenticated': true},
              ).toJson();
            }
            final options = (args.length > 1 && args[1] is Map)
                ? Map<String, dynamic>.from(args[1] as Map)
                : <String, dynamic>{};
            final returnPath = options['returnPath'] as String?;
            final message = options['message'] as String? ?? '로그인이 필요합니다.';
            _showAuthGuardSnackBar(message);
            _navigateToLoginScreen(returnPath);
            return BridgeResponse.success(
              data: {'isAuthenticated': false, 'navigated': true},
            ).toJson();
          }

        case 'openLoginScreen':
          {
            // 강제로 네이티브 로그인 화면 열기
            final options = (args.length > 1 && args[1] is Map)
                ? Map<String, dynamic>.from(args[1] as Map)
                : <String, dynamic>{};
            final returnPath = options['returnPath'] as String?;
            _navigateToLoginScreen(returnPath);
            return BridgeResponse.success(
              data: {'navigated': true},
            ).toJson();
          }

        default:
          return BridgeResponse.error(error: '알 수 없는 인증 요청입니다.').toJson();
      }
    } catch (e) {
      return BridgeResponse.error(error: '인증 처리 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handleQrScanRequestImpl(List<dynamic> args) async {
    try {
      final action = args.isNotEmpty ? args[0] as String : 'scan';

      switch (action) {
        case 'requestPermission':
          // 카메라 권한 요청
          final hasPermission = await _qrScanner.requestCameraPermission();
          return BridgeResponse.success(
            data: {'hasPermission': hasPermission},
          ).toJson();

        case 'checkPermission':
          // 카메라 권한 확인
          final hasPermission = await _qrScanner.hasCameraPermission();
          return BridgeResponse.success(
            data: {'hasPermission': hasPermission},
          ).toJson();

        case 'scan':
          // 네이티브 QR 스캐너 화면 실행 → 스캔된 UUID 반환
          if (onQrScanRequest == null) {
            return BridgeResponse.error(
              error: 'QR 스캐너 초기화가 완료되지 않았습니다. 잠시 후 다시 시도해주세요.',
            ).toJson();
          }
          final qrData = await onQrScanRequest!();
          if (qrData == null || qrData.isEmpty) {
            // 사용자 취소 또는 스캔 실패 — data=null 로 반환 (Web 측에서 null 처리)
            return BridgeResponse.success(data: null).toJson();
          }
          // BridgeResponse.data 는 Map 타입이므로 qrData 를 객체로 감싼다.
          // Web native-bridge.qr.scan() 이 {qrData: ...} 를 문자열로 언래핑.
          return BridgeResponse.success(data: {'qrData': qrData}).toJson();

        default:
          return BridgeResponse.error(error: '알 수 없는 QR 스캔 요청입니다.').toJson();
      }
    } catch (e) {
      return BridgeResponse.error(error: 'QR 스캔 처리 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handlePaymentRequestImpl(List<dynamic> args) async {
    try {
      if (args.isEmpty) {
        return BridgeResponse.error(error: '결제 정보가 필요합니다.').toJson();
      }

      final paymentData = args[0] as Map<String, dynamic>;
      final action = paymentData['action'] as String? ?? 'initiate';

      switch (action) {
        case 'initiate':
          // KG이니시스 결제 시작 - 결제 요청 데이터 반환
          // 실제 결제는 Native에서 WebView 화면으로 처리
          return BridgeResponse.success(
            data: {
              'action': 'openPayment',
              'paymentUrl': paymentData['paymentUrl'],
              'orderNumber': paymentData['orderNumber'],
              'amount': paymentData['amount'],
              'productName': paymentData['productName'],
              'buyerName': paymentData['buyerName'],
              'buyerPhone': paymentData['buyerPhone'],
              'buyerEmail': paymentData['buyerEmail'],
            },
          ).toJson();

        case 'verify':
          // 결제 검증 (서버 측 검증)
          final transactionId = paymentData['transactionId'] as String?;
          final orderNumber = paymentData['orderNumber'] as String?;
          final amount = paymentData['amount'] as int?;

          if (transactionId == null || orderNumber == null || amount == null) {
            return BridgeResponse.error(error: '결제 검증 정보가 부족합니다.').toJson();
          }

          final verified = await _paymentService.verifyPayment(
            transactionId: transactionId,
            orderNumber: orderNumber,
            amount: amount,
          );

          return BridgeResponse.success(
            data: {
              'verified': verified,
              'transactionId': transactionId,
            },
          ).toJson();

        case 'cancel':
          // 결제 취소
          final transactionId = paymentData['transactionId'] as String?;
          final reason = paymentData['reason'] as String? ?? '사용자 요청';

          if (transactionId == null) {
            return BridgeResponse.error(error: '결제 취소 정보가 부족합니다.').toJson();
          }

          final cancelled = await _paymentService.cancelPayment(
            transactionId: transactionId,
            reason: reason,
          );

          return BridgeResponse.success(
            data: {'cancelled': cancelled},
          ).toJson();

        default:
          return BridgeResponse.error(error: '알 수 없는 결제 요청입니다.').toJson();
      }
    } catch (e) {
      return BridgeResponse.error(error: '결제 처리 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handleApiRequestImpl(List<dynamic> args) async {
    try {
      if (args.isEmpty) {
        final error = ApiError.fromCode(ApiErrorCode.badRequest,
            message: 'API 요청 정보가 필요합니다.');
        return BridgeResponse.errorWithApiError(apiError: error).toJson();
      }

      final request = args[0] as Map<String, dynamic>;
      final method = (request['method'] as String?)?.toUpperCase() ?? 'GET';
      final endpoint = request['endpoint'] as String?;
      // [2026-05-13 Phase C-1] body 이중 인코딩 차단.
      //   WebView 가 fetch / axios 등을 통해 `data: JSON.stringify(payload)` 형태로
      //   전달하면 Dio 가 한번 더 인코딩하여 backend ValidationPipe 가 string 으로 인지 → 파싱 실패.
      //   문자열이고 JSON 으로 보이면 한 번 디코딩하여 map/list 로 정규화. 디코딩 실패 시 원본 유지.
      dynamic data = request['data'];
      if (data is String) {
        final trimmed = data.trim();
        if (trimmed.isNotEmpty &&
            (trimmed.startsWith('{') || trimmed.startsWith('['))) {
          try {
            data = jsonDecode(trimmed);
          } catch (_) {
            // raw string body 의도일 수 있으니 유지
          }
        }
      }
      final queryParams = request['queryParams'] as Map<String, dynamic>?;
      final isAsync = request['async'] ?? true;
      final requestId = request['requestId'] as String?;
      final security = request['_security'] as Map<String, dynamic>?;

      if (endpoint == null || endpoint.isEmpty) {
        final error = ApiError.fromCode(ApiErrorCode.badRequest,
            message: 'API endpoint가 필요합니다.');
        return BridgeResponse.errorWithApiError(apiError: error).toJson();
      }

      // 2026-04-22 (P0-NB-002): _security.timestamp/nonce 실제 검증.
      // Web 이 createSecurityContext() 로 부착한 보안 메타데이터를 Dart 가 읽어
      // 5분 초과 · nonce 재사용 요청을 차단한다.
      final securityError = _verifySecurity(security);
      if (securityError != null) {
        debugPrint(
            '[Bridge][Security] _security 검증 실패: $securityError · endpoint=$endpoint');
        final error = ApiError.fromCode(
          ApiErrorCode.authInvalid,
          message: '보안 검증에 실패했습니다. 앱을 다시 실행해주세요. ($securityError)',
        );
        return BridgeResponse.errorWithApiError(apiError: error).toJson();
      }

      if (isAsync == true) {
        // 비동기: 즉시 응답하고 결과는 별도 메시지로 전송
        if (requestId == null) {
          final error = ApiError.fromCode(ApiErrorCode.badRequest,
              message: '비동기 요청에는 requestId가 필요합니다.');
          return BridgeResponse.errorWithApiError(apiError: error).toJson();
        }
        _processAsyncApiRequest(requestId, method, endpoint, data, queryParams);
        return BridgeResponse.success(
          data: {'requestId': requestId, 'pending': true},
        ).toJson();
      } else {
        // 동기: 결과를 기다려서 반환
        final response =
            await _executeApiRequest(method, endpoint, data, queryParams);
        return BridgeResponse.success(data: response).toJson();
      }
    } on ApiError catch (e) {
      return BridgeResponse.errorWithApiError(apiError: e).toJson();
    } catch (e) {
      final apiError =
          ApiError.unknown(message: 'API 요청 처리 중 오류: $e', originalError: e);
      return BridgeResponse.errorWithApiError(apiError: apiError).toJson();
    }
  }

  Future<Map<String, dynamic>> _handleUIRequestImpl(List<dynamic> args) async {
    try {
      if (args.isEmpty) {
        return BridgeResponse.error(error: 'UI 설정 정보가 필요합니다.').toJson();
      }

      final uiData = args[0] as Map<String, dynamic>;
      final action = uiData['action'] as String? ?? 'setConfig';

      switch (action) {
        case 'setConfig':
          // UI 설정 변경
          final config = UIConfig.fromJson(uiData);
          debugPrint('[UI Bridge] UI 설정 변경 요청: $config');

          // 콜백을 통해 WebViewScreen에 전달
          if (onUIConfigChange != null) {
            onUIConfigChange!(config);
            return BridgeResponse.success(
              data: {
                'applied': true,
                'config': config.toJson(),
              },
            ).toJson();
          } else {
            return BridgeResponse.error(
              error: 'UI 콜백이 설정되지 않았습니다.',
            ).toJson();
          }

        case 'getConfig':
          // 현재 UI 설정 조회 (WebViewScreen에서 직접 관리)
          return BridgeResponse.success(
            data: {
              'message': 'UI 설정은 WebViewScreen에서 직접 관리됩니다.',
            },
          ).toJson();

        case 'showStatusBar':
          // 상태바만 표시
          if (onUIConfigChange != null) {
            onUIConfigChange!(const UIConfig(showStatusBar: true));
            return BridgeResponse.success(data: {'showStatusBar': true})
                .toJson();
          }
          return BridgeResponse.error(error: 'UI 콜백이 설정되지 않았습니다.').toJson();

        case 'hideStatusBar':
          // 상태바만 숨김
          if (onUIConfigChange != null) {
            onUIConfigChange!(const UIConfig(showStatusBar: false));
            return BridgeResponse.success(data: {'showStatusBar': false})
                .toJson();
          }
          return BridgeResponse.error(error: 'UI 콜백이 설정되지 않았습니다.').toJson();

        case 'showAppBar':
          // AppBar만 표시
          final title = uiData['title'] as String?;
          if (onUIConfigChange != null) {
            onUIConfigChange!(UIConfig(showAppBar: true, appBarTitle: title));
            return BridgeResponse.success(
                data: {'showAppBar': true, 'title': title}).toJson();
          }
          return BridgeResponse.error(error: 'UI 콜백이 설정되지 않았습니다.').toJson();

        case 'hideAppBar':
          // AppBar만 숨김
          if (onUIConfigChange != null) {
            onUIConfigChange!(const UIConfig(showAppBar: false));
            return BridgeResponse.success(data: {'showAppBar': false}).toJson();
          }
          return BridgeResponse.error(error: 'UI 콜백이 설정되지 않았습니다.').toJson();

        case 'showBottomNav':
          // BottomNav만 표시
          if (onUIConfigChange != null) {
            onUIConfigChange!(const UIConfig(showBottomNav: true));
            return BridgeResponse.success(data: {'showBottomNav': true})
                .toJson();
          }
          return BridgeResponse.error(error: 'UI 콜백이 설정되지 않았습니다.').toJson();

        case 'hideBottomNav':
          // BottomNav만 숨김
          if (onUIConfigChange != null) {
            onUIConfigChange!(const UIConfig(showBottomNav: false));
            return BridgeResponse.success(data: {'showBottomNav': false})
                .toJson();
          }
          return BridgeResponse.error(error: 'UI 콜백이 설정되지 않았습니다.').toJson();

        case 'enterFullscreen':
          // 전체화면 모드 진입 (상태바, AppBar, BottomNav 모두 숨김)
          if (onUIConfigChange != null) {
            onUIConfigChange!(const UIConfig(
              showStatusBar: false,
              showAppBar: false,
              showBottomNav: false,
            ));
            return BridgeResponse.success(data: {'fullscreen': true}).toJson();
          }
          return BridgeResponse.error(error: 'UI 콜백이 설정되지 않았습니다.').toJson();

        case 'exitFullscreen':
          // 전체화면 모드 종료
          // ⚠️ 2026-05-12: UIConfig 강제 변경 제거 (이전엔 showAppBar:false 로
          // 하드코딩 복원하여 useNativeUI({showAppBar:true}) 페이지의 AppBar 누락).
          // 페이지별 UI 상태는 Web 의 useNativeUI(ui.setConfig) 가 적용한 값을
          // 그대로 유지하고, exitFullscreen 은 단순히 fullscreen 플래그만 해제한다.
          return BridgeResponse.success(data: {'fullscreen': false}).toJson();

        case 'startLoading':
          // 클라이언트 사이드 네비게이션 시 로딩 스피너 표시
          // Web에서 페이지 전환 시 호출하여 Native 스피너 표시
          debugPrint('[UI Bridge] startLoading 요청');
          if (onUIConfigChange != null) {
            // isLoading: true로 WebViewScreen에 로딩 상태 전달
            onUIConfigChange!(const UIConfig(
              isLoading: true,
              showStatusBar: false,
              showAppBar: false,
              showBottomNav: false,
            ));
          }
          return BridgeResponse.success(data: {'loading': true}).toJson();

        case 'stopLoading':
          // 클라이언트 사이드 네비게이션 완료 시 로딩 스피너 숨김
          debugPrint('[UI Bridge] stopLoading 요청');
          if (onUIConfigChange != null) {
            // isLoading: false로 WebViewScreen에 로딩 종료 전달
            onUIConfigChange!(const UIConfig(
              isLoading: false,
            ));
          }
          return BridgeResponse.success(data: {'loading': false}).toJson();

        case 'setPullToRefresh':
          // Pull-to-Refresh 활성/비활성 직접 제어 (2026-05-13 신규 — 이슈 D15).
          //
          // Web 계약 (`teamplus-web/src/services/native-bridge.ts setPullToRefresh`):
          //   { action: 'setPullToRefresh', enabled: boolean }
          //   → { enabled: boolean }
          //
          // 용도:
          //   - 페이지가 자체 새로고침 UX 를 갖고 있어 Native PTR 로 인한 의도치 않은
          //     reload 가 사용자 경험을 해치는 경우 (예: 무한스크롤 목록, drag&drop 영역,
          //     상단 캐러셀 페이지) Web 측에서 명시적으로 비활성화.
          //   - 반대로 인증 경로 외에 PTR 이 필요한 페이지는 명시적으로 활성화.
          //
          // 미호출 시: WebViewScreen._syncPullToRefreshEnabled() 의 URL 기반 자동 정책
          //   (인증/온보딩 경로 = 비활성, 그 외 = 활성) 이 그대로 적용됨.
          final enabled = uiData['enabled'] as bool?;
          if (enabled == null) {
            return BridgeResponse.error(
              error: 'setPullToRefresh: enabled(boolean) 가 필요합니다.',
            ).toJson();
          }
          if (onUIConfigChange != null) {
            onUIConfigChange!(UIConfig(pullToRefreshEnabled: enabled));
            return BridgeResponse.success(data: {'enabled': enabled}).toJson();
          }
          return BridgeResponse.error(error: 'UI 콜백이 설정되지 않았습니다.').toJson();

        case 'getAppVersion':
          // 네이티브 앱 버전/빌드 번호 조회.
          //
          // Web 계약 (`teamplus-web/src/services/native-bridge.ts` getAppVersion):
          //   { version: string; build?: string; platform: 'ios' | 'android' }
          //
          // 강제 업데이트 화면(`/force-update`) · AppSettings 버전 비교에 사용.
          try {
            final info = await PackageInfo.fromPlatform();
            return BridgeResponse.success(data: {
              'version': info.version,
              'build': info.buildNumber,
              'platform': Platform.isIOS ? 'ios' : 'android',
            }).toJson();
          } catch (e) {
            debugPrint('[UI Bridge] getAppVersion 실패: $e');
            return BridgeResponse.error(
              error: '앱 버전 조회 실패: $e',
            ).toJson();
          }

        case 'getDeviceInfo':
          // 디바이스 해상도/Safe Area 조회 (2026-05-08 신규).
          //
          // Web 계약 (`teamplus-web/src/services/native-bridge.ts` getDeviceInfo):
          //   {
          //     screen: { width: number, height: number },        // logical pixels (CSS px)
          //     physicalSize: { width: number, height: number },  // 물리 픽셀
          //     safeArea: {
          //       top: number, bottom: number, left: number, right: number  // logical pixels
          //     },
          //     viewInsets: {
          //       top: number, bottom: number, left: number, right: number  // 키보드 등
          //     },
          //     devicePixelRatio: number,
          //     platform: 'ios' | 'android',
          //     orientation: 'portrait' | 'landscape',
          //   }
          //
          // 용도: Android WebView 에서 env(safe-area-inset-bottom) 가 0px 로 평가되어
          // BottomNav 가 navigation/indicator 영역을 침범하는 문제 해결. Web 측에서
          // 본 값을 받아 CSS 변수 (--safe-area-inset-*) 로 주입하여 정확한 padding 적용.
          try {
            final view = WidgetsBinding.instance.platformDispatcher.views.first;
            final dpr = view.devicePixelRatio;
            final physicalSize = view.physicalSize;
            // viewPadding: 영구적 system inset (notch, home indicator, navigation bar) — 키보드 미포함
            // padding: viewPadding - 키보드 등 동적 inset
            // → BottomNav safe-area 보호용에는 viewPadding 이 정확함
            final viewPadding = view.viewPadding;
            final padding = view.padding;
            final viewInsets = view.viewInsets;

            // 물리 픽셀 → 논리 픽셀(CSS px) 변환 (DPR 로 나눔)
            final logicalWidth = physicalSize.width / dpr;
            final logicalHeight = physicalSize.height / dpr;
            // safeArea: viewPadding 우선 (영구 inset) — Android edgeToEdge 환경에서
            // navigation bar 높이를 정확히 반영. padding.bottom 이 키보드로 인해
            // 변동되어도 BottomNav 보호 영역은 일관 유지.
            final safeTop = viewPadding.top / dpr;
            final safeBottom = viewPadding.bottom / dpr;
            final safeLeft = viewPadding.left / dpr;
            final safeRight = viewPadding.right / dpr;
            final insetTop = viewInsets.top / dpr;
            final insetBottom = viewInsets.bottom / dpr;
            final insetLeft = viewInsets.left / dpr;
            final insetRight = viewInsets.right / dpr;
            // 디버그 — Android navigation bar 잘림 진단
            debugPrint(
              '[UI Bridge] getDeviceInfo · platform=${Platform.isIOS ? "ios" : "android"} '
              '· dpr=$dpr · viewPadding.bottom=${viewPadding.bottom}px (logical ${safeBottom}px) '
              '· padding.bottom=${padding.bottom}px',
            );

            final orientation =
                logicalWidth > logicalHeight ? 'landscape' : 'portrait';

            return BridgeResponse.success(data: {
              'screen': {
                'width': logicalWidth,
                'height': logicalHeight,
              },
              'physicalSize': {
                'width': physicalSize.width,
                'height': physicalSize.height,
              },
              'safeArea': {
                'top': safeTop,
                'bottom': safeBottom,
                'left': safeLeft,
                'right': safeRight,
              },
              'viewInsets': {
                'top': insetTop,
                'bottom': insetBottom,
                'left': insetLeft,
                'right': insetRight,
              },
              'devicePixelRatio': dpr,
              'platform': Platform.isIOS ? 'ios' : 'android',
              'orientation': orientation,
            }).toJson();
          } catch (e) {
            debugPrint('[UI Bridge] getDeviceInfo 실패: $e');
            return BridgeResponse.error(
              error: '디바이스 정보 조회 실패: $e',
            ).toJson();
          }

        case 'signalFirstPaint':
          // 🎨 WebView 첫 paint 완료 신호 → Flutter native_splash hide
          //
          // SPEC: claudedocs/SPEC_LOADER_IMPECCABLE_2026-05-20.md §3.4
          // SoT : docs/Design/LOADING_TIMING_POLICY.md (Phase 5)
          //
          // Web 호출 시점 (`teamplus-web/src/components/providers/ClientProviders.tsx`):
          //   useEffect(() => {
          //     if (!isNativeApp()) return;
          //     requestAnimationFrame(() => {
          //       requestAnimationFrame(() => {
          //         nativeBridge.ui.signalFirstPaint?.();
          //       });
          //     });
          //   }, []);
          //
          // 2 RAF 패턴으로 실제 paint 가 GPU 에 도착한 후 native 에 알린다.
          // main.dart 의 `removeNativeSplashOnce` 가 idempotent 하므로 중복 호출
          // 안전 (failsafe Timer 와 race 발생 시 boolean 가드로 1회만 동작).
          debugPrint('[UI Bridge] signalFirstPaint — native_splash hide 요청');
          removeNativeSplashOnce(trigger: 'web-signal');
          return BridgeResponse.success(
            data: {'splashRemoved': true},
          ).toJson();

        default:
          return BridgeResponse.error(error: '알 수 없는 UI 요청입니다: $action')
              .toJson();
      }
    } catch (e) {
      debugPrint('[UI Bridge] UI 처리 중 오류: $e');
      return BridgeResponse.error(error: 'UI 처리 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handleThemeRequestImpl(List<dynamic> args) async {
    try {
      if (args.isEmpty) {
        return BridgeResponse.error(error: '테마 설정 정보가 필요합니다.').toJson();
      }

      final themeData = args[0] as Map<String, dynamic>;
      final action = themeData['action'] as String? ?? 'setTheme';

      switch (action) {
        case 'setTheme':
          final mode = themeData['mode'] as String?;

          if (mode == null) {
            return BridgeResponse.error(error: '테마 모드가 필요합니다.').toJson();
          }

          debugPrint('[Theme Bridge] 테마 변경 요청: $mode');

          final themeMode = switch (mode) {
            'light' => ThemeMode.light,
            'dark' => ThemeMode.dark,
            _ => ThemeMode.system,
          };

          if (onThemeChange != null) {
            onThemeChange!(themeMode);
            return BridgeResponse.success(
              data: {'applied': true, 'mode': mode},
            ).toJson();
          }

          return BridgeResponse.error(
            error: '테마 콜백이 설정되지 않았습니다.',
          ).toJson();

        case 'getTheme':
          // 현재 OS 테마 감지하여 반환
          final brightness =
              WidgetsBinding.instance.platformDispatcher.platformBrightness;
          final currentMode = brightness == Brightness.dark ? 'dark' : 'light';
          return BridgeResponse.success(
            data: {'mode': currentMode},
          ).toJson();

        default:
          return BridgeResponse.error(
            error: '알 수 없는 테마 요청입니다: $action',
          ).toJson();
      }
    } catch (e) {
      return BridgeResponse.error(error: '테마 처리 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handleBiometricAvailabilityCheckImpl() async {
    try {
      final availability = await _biometricService.checkAvailability();
      final biometrics = await _biometricService.getAvailableBiometrics();

      if (availability == BiometricAvailability.available) {
        // 사용 가능한 생체인증 타입 추출
        final biometricTypes =
            biometrics.map((b) => b.toString().split('.').last).toList();

        return BridgeResponse.success(
          data: {
            'available': true,
            'availabilityStatus': 'available',
            'biometricTypes': biometricTypes,
          },
        ).toJson();
      } else if (availability == BiometricAvailability.notAvailable) {
        return BridgeResponse.success(
          data: {
            'available': false,
            'availabilityStatus': 'notAvailable',
            'message': '생체인증이 등록되지 않았습니다.',
          },
        ).toJson();
      } else {
        return BridgeResponse.success(
          data: {
            'available': false,
            'availabilityStatus': 'unavailable',
            'message': '기기가 생체인증을 지원하지 않습니다.',
          },
        ).toJson();
      }
    } catch (e) {
      debugPrint('[Biometric Bridge] 가용성 확인 중 오류: $e');
      return BridgeResponse.error(
        error: '생체인증 가능 여부 확인 실패: $e',
      ).toJson();
    }
  }

  Future<Map<String, dynamic>> _handleGetAvailableBiometricsImpl() async {
    try {
      final biometrics = await _biometricService.getAvailableBiometrics();
      final biometricTypes =
          biometrics.map((b) => b.toString().split('.').last).toList();

      return BridgeResponse.success(
        data: {
          'biometricTypes': biometricTypes,
          'count': biometricTypes.length,
        },
      ).toJson();
    } catch (e) {
      debugPrint('[Biometric Bridge] 생체인증 목록 조회 중 오류: $e');
      return BridgeResponse.error(
        error: '생체인증 목록 조회 실패: $e',
      ).toJson();
    }
  }

  Future<Map<String, dynamic>> _handleBiometricStatusImpl() async {
    try {
      final status = await _biometricService.getStatus();
      return BridgeResponse.success(data: status).toJson();
    } catch (e) {
      debugPrint('[Biometric Bridge] 상태 조회 중 오류: $e');
      return BridgeResponse.error(
        error: '상태 조회 실패: $e',
      ).toJson();
    }
  }

  Future<Map<String, dynamic>> _handleBiometricRequestImpl(
      List<dynamic> args) async {
    try {
      // 요청 데이터 파싱
      final requestData =
          args.isNotEmpty ? args[0] as Map<String, dynamic>? : null;
      final action = requestData?['action'] as String? ?? 'authenticate';
      final reason = requestData?['reason'] as String? ?? '생체인증이 필요합니다.';

      switch (action) {
        case 'checkAvailability':
          // 🔐 생체인증 가능 여부 확인
          return await _handleBiometricAvailabilityCheck();

        case 'authenticate':
          // 🔐 생체인증 실행
          return await _handleBiometricAuthenticate(reason);

        case 'getAvailableBiometrics':
          // 사용 가능한 생체인증 목록 조회
          return await _handleGetAvailableBiometrics();

        case 'getStatus':
          // 생체인증 상태 정보 조회 (디버그용)
          return await _handleBiometricStatus();

        default:
          return BridgeResponse.error(
            error: '알 수 없는 생체인증 요청입니다.',
          ).toJson();
      }
    } catch (e) {
      debugPrint('[Biometric Bridge] 생체인증 처리 중 오류: $e');
      return BridgeResponse.error(error: '생체인증 처리 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handleBiometricAuthenticateImpl(
      String reason) async {
    try {
      final result = await _biometricService.authenticate(reason: reason);

      switch (result) {
        case BiometricResult.success:
          // ✅ 인증 성공
          await sendBiometricResultToWeb(
            authenticated: true,
            message: '생체인증이 완료되었습니다.',
          );
          return BridgeResponse.success(
            data: {
              'authenticated': true,
              'message': '생체인증이 완료되었습니다.',
            },
          ).toJson();

        case BiometricResult.failed:
          // ❌ 인증 실패 (지문/얼굴 일치 안 함)
          return BridgeResponse.error(
            error: '생체인증 실패: 지문 또는 얼굴이 일치하지 않습니다.',
          ).toJson();

        case BiometricResult.locked:
          // 🔒 계정 잠금 (실패 횟수 초과)
          return BridgeResponse.error(
            error: '생체인증이 너무 많이 실패했습니다. 나중에 다시 시도해주세요.',
          ).toJson();

        case BiometricResult.userCancelled:
          // ⛔ 사용자 취소
          return BridgeResponse.error(
            error: '생체인증이 취소되었습니다.',
          ).toJson();

        case BiometricResult.deviceNotSupported:
          // 🚫 기기에서 지원하지 않음
          return BridgeResponse.error(
            error: '기기가 생체인증을 지원하지 않습니다.',
          ).toJson();

        case BiometricResult.unknown:
          // 알 수 없는 오류
          return BridgeResponse.error(
            error: '알 수 없는 오류가 발생했습니다.',
          ).toJson();
      }
    } catch (e) {
      debugPrint('[Biometric Bridge] 생체인증 실행 중 오류: $e');
      return BridgeResponse.error(
        error: '생체인증 실행 중 오류: $e',
      ).toJson();
    }
  }

  Future<Map<String, dynamic>> _handleNotificationRequestImpl(
      List<dynamic> args) async {
    try {
      if (args.isEmpty) {
        return BridgeResponse.error(error: '알림 정보가 필요합니다.').toJson();
      }

      final notificationData = args[0] as Map<String, dynamic>;
      final action = notificationData['action'] as String? ?? 'show';

      switch (action) {
        case 'requestPermission':
          // 푸시 알림 권한 요청
          final granted = await _notificationService.requestPermission();
          return BridgeResponse.success(
            data: {'granted': granted},
          ).toJson();

        case 'show':
          // 로컬 알림 표시
          final title = notificationData['title'] as String? ?? '';
          final body = notificationData['body'] as String? ?? '';
          final channelId = notificationData['channelId'] as String?;
          final payload = notificationData['payload'] as Map<String, dynamic>?;

          await _notificationService.showNotification(
            title: title,
            body: body,
            channelId: channelId,
            payload: payload,
          );

          return BridgeResponse.success(
            data: {'shown': true},
          ).toJson();

        case 'getToken':
          // FCM 토큰 조회
          final token = _notificationService.fcmToken;
          return BridgeResponse.success(
            data: {'token': token ?? ''},
          ).toJson();

        case 'checkPermission':
          // 권한 상태 확인
          final hasPermission = await _notificationService.hasPermission();
          return BridgeResponse.success(
            data: {'hasPermission': hasPermission},
          ).toJson();

        case 'cancelAll':
          // 모든 알림 삭제
          await _notificationService.cancelAllNotifications();
          return BridgeResponse.success(
            data: {'cancelled': true},
          ).toJson();

        default:
          return BridgeResponse.error(error: '알 수 없는 알림 요청입니다.').toJson();
      }
    } catch (e) {
      return BridgeResponse.error(error: '알림 처리 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handleNavigationRequestImpl(
      List<dynamic> args) async {
    try {
      if (args.isEmpty) {
        return BridgeResponse.error(error: '네비게이션 정보가 필요합니다.').toJson();
      }

      final navigationData = args[0] as Map<String, dynamic>;
      final action = navigationData['action'] as String? ?? 'navigate';

      switch (action) {
        case 'setHardwareBackEnabled':
          final enabled = navigationData['enabled'] as bool? ?? false;
          onHardwareBackEnabledChange?.call(enabled);
          return BridgeResponse.success(data: {'enabled': enabled}).toJson();

        case 'backReceived':
          // Web 이 백키 이벤트를 정상 수신했음을 알림 → fallback timer cancel
          onBackReceived?.call();
          return BridgeResponse.success(data: {'ack': true}).toJson();

        case 'exitApp':
          // Android 만 실제 종료. iOS 는 Apple 정책상 종료 금지 (리젝 사유) → silent no-op.
          if (Platform.isAndroid) {
            await SystemNavigator.pop();
          }
          return BridgeResponse.success(
            data: {'exited': Platform.isAndroid},
          ).toJson();

        case 'openExternal':
          // 외부 URL 을 기기 기본 브라우저로 위임 — 메인 WebView 세션을 유지한다.
          //   (window.open(_blank) 가 onCreateWindow 로 메인 WebView 를 덮는 문제 회피)
          final url = navigationData['url'] as String?;
          if (url == null || url.isEmpty) {
            return BridgeResponse.error(error: '열 URL이 필요합니다.').toJson();
          }
          final externalUri = Uri.tryParse(url);
          if (externalUri == null) {
            return BridgeResponse.error(error: '유효하지 않은 URL입니다.').toJson();
          }
          try {
            final ok = await launchUrl(
              externalUri,
              mode: LaunchMode.externalApplication,
            );
            return BridgeResponse.success(data: {'opened': ok}).toJson();
          } catch (e) {
            return BridgeResponse.error(error: '외부 브라우저 열기 실패: $e').toJson();
          }

        case 'navigate':
        default:
          final route = navigationData['route'] as String?;
          final params = navigationData['params'] as Map<String, dynamic>?;
          if (route != null) {
            onNavigationRequest?.call(route, params);
          }
          return BridgeResponse.success(
            data: {
              'action': 'navigate',
              'route': route,
              'params': params,
            },
          ).toJson();
      }
    } catch (e) {
      return BridgeResponse.error(error: '네비게이션 처리 중 오류: $e').toJson();
    }
  }

  Future<Map<String, dynamic>> _handleIdentityVerificationRequestImpl(
      List<dynamic> args) async {
    try {
      if (args.isEmpty) {
        return BridgeResponse.error(error: '본인인증 정보가 필요합니다.').toJson();
      }

      final verificationData = args[0] as Map<String, dynamic>;
      final action = verificationData['action'] as String? ?? 'start';

      switch (action) {
        case 'start':
          // 본인인증 시작 - 외부 WebView 열기 필요
          final provider =
              verificationData['provider'] as String? ?? 'kg_inicis';
          final purpose =
              verificationData['purpose'] as String? ?? 'registration';
          final authUrl = verificationData['authUrl'] as String?;
          final requestId = verificationData['requestId'] as String?;

          if (authUrl == null || requestId == null) {
            return BridgeResponse.error(
              error: '인증 URL 및 요청 ID가 필요합니다.',
            ).toJson();
          }

          return BridgeResponse.success(
            data: {
              'action': 'openIdentityWebView',
              'authUrl': authUrl,
              'requestId': requestId,
              'provider': provider,
              'purpose': purpose,
            },
          ).toJson();

        case 'checkStatus':
          // 본인인증 상태 확인
          final requestId = verificationData['requestId'] as String?;
          if (requestId == null) {
            return BridgeResponse.error(error: '요청 ID가 필요합니다.').toJson();
          }

          return BridgeResponse.success(
            data: {
              'action': 'checkIdentityStatus',
              'requestId': requestId,
            },
          ).toJson();

        case 'getProviders':
          // 사용 가능한 본인인증 제공자 목록
          return BridgeResponse.success(
            data: {
              'providers': [
                {'id': 'kg_inicis', 'name': 'KG이니시스', 'type': 'phone'},
                {'id': 'kakao', 'name': '카카오', 'type': 'kakao'},
                {'id': 'nice', 'name': 'NICE평가정보', 'type': 'phone'},
                {'id': 'pass', 'name': 'PASS', 'type': 'carrier'},
              ],
            },
          ).toJson();

        case 'getUserVerificationStatus':
          // 사용자 본인인증 상태 조회
          return BridgeResponse.success(
            data: {
              'action': 'getUserVerificationStatus',
            },
          ).toJson();

        default:
          return BridgeResponse.error(error: '알 수 없는 본인인증 요청입니다.').toJson();
      }
    } catch (e) {
      return BridgeResponse.error(error: '본인인증 처리 중 오류: $e').toJson();
    }
  }
}
