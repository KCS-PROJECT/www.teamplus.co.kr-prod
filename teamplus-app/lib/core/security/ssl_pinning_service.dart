import 'dart:developer' as developer;
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../logging/app_logger.dart';

/// SSL/TLS Certificate Pinning 서비스
///
/// MITM 공격 차단을 위해 서버 인증서를 앱에 포함시켜 검증한다.
///
/// ## 운영(Ops) 책임 — 프로덕션 인증서 프로비저닝
/// 프로덕션 릴리스에서 Pinning 이 실제로 강제되려면
/// `assets/certificates/prod/teamplus_prod.pem` 에 **유효한 서버 인증서**가
/// 번들되어 있어야 한다. 인증서 발급·교체·만료 관리는 배포(Ops) 책임이다.
///
/// 인증서가 누락/비어있음/Placeholder/로드 실패인 경우, 릴리스 빌드는
/// **Pinning 없이 동작**하되 이 상태를 절대 조용히 넘기지 않는다:
/// - [isPinningActive] = false 로 명시적으로 기록한다.
/// - SEVERE 로그를 남겨 모니터링/크래시 리포팅이 추적할 수 있게 한다.
/// - 상위(앱 정책) 레이어는 [isPinningActive] 로 보안 상태를 질의하여
///   경고 배너·모니터링 이벤트 등으로 반드시 surface 해야 한다.
///
/// 앱을 hard-crash 시킬지 여부는 이 transport 레이어가 아니라 앱 정책 레이어의
/// 결정이므로, 여기서는 예외를 던지지 않고 상태만 명시적으로 노출한다.
class SslPinningService {
  static final SslPinningService _instance = SslPinningService._internal();
  factory SslPinningService() => _instance;
  SslPinningService._internal();

  SecurityContext? _securityContext;
  bool _isInitialized = false;

  /// Pinning 이 실제로 강제 적용되고 있는지 여부.
  /// - debug: 항상 false (디버깅 편의상 비활성화)
  /// - release/profile: 유효 인증서 로드 성공 시에만 true
  bool _pinningActive = false;

  /// 인증서 로드 및 초기화
  Future<void> initialize() async {
    if (_isInitialized) return;

    // 개발 환경: SSL Pinning 비활성화 (디버깅 편의) — 동작 변경 없음
    if (kDebugMode) {
      debugPrint('[SSL Pinning] 개발 모드 - Pinning 비활성화');
      _pinningActive = false;
      _isInitialized = true;
      return;
    }

    // 긴급 비활성화 스위치 — CA 교체·인증서 만료로 전 사용자가 통신 불가가 되는
    //   상황에서 핫픽스 빌드로 즉시 pinning 을 끌 수 있어야 한다.
    //   빌드: flutter build --dart-define=SSL_PINNING_ENABLED=false
    if (!_pinningEnabledByBuildConfig) {
      _markInsecure('빌드 설정으로 비활성화됨 (SSL_PINNING_ENABLED=false)');
      _isInitialized = true;
      return;
    }

    try {
      // 프로덕션 환경: 인증서 로드
      const certPath = kReleaseMode
          ? 'assets/certificates/prod/teamplus_prod.pem'
          : 'assets/certificates/dev/teamplus_dev.pem';

      final certBytes = await rootBundle.load(certPath);
      final certData = certBytes.buffer.asUint8List();

      // 인증서 내용이 비어있거나 플레이스홀더인 경우: 유효한 인증서 아님 → insecure
      final certContent = String.fromCharCodes(certData);
      if (certContent.trim().isEmpty || certContent.contains('Placeholder')) {
        _markInsecure('유효한 프로덕션 인증서가 없음 (비어있음/Placeholder): $certPath');
        _isInitialized = true;
        return;
      }

      // withTrustedRoots: false — 시스템 신뢰 저장소를 배제하고 번들된 CA 만 신뢰한다.
      //   [2026-07-30 수정] 이전 구현은 `SecurityContext.defaultContext` 에 인증서를
      //   *추가*했다. 그 경우 시스템 CA 가 계속 신뢰되므로, 공격자가 단말에 설치된
      //   임의 CA(기업 MDM·프록시·사용자 설치 루트)로 발급한 인증서를 제시하면
      //   그대로 통과해 pinning 이 사실상 무효였다. 또한 defaultContext 수정은
      //   앱 전역의 다른 HttpClient 에도 영향을 주는 부작용이 있었다.
      final context = SecurityContext(withTrustedRoots: false)
        ..setTrustedCertificatesBytes(certData);
      _securityContext = context;

      _pinningActive = true;
      _isInitialized = true;
      debugPrint('[SSL Pinning] 인증서 로드 완료(시스템 CA 배제): $certPath');
    } catch (e) {
      // 인증서 로드 실패 — 앱은 계속 실행하되 insecure 상태를 명시적으로 기록한다.
      _markInsecure('인증서 로드 실패: $e');
      _isInitialized = true;
    }
  }

  /// `--dart-define=SSL_PINNING_ENABLED=false` 로만 끌 수 있다(기본 활성).
  static const bool _pinningEnabledByBuildConfig =
      String.fromEnvironment('SSL_PINNING_ENABLED', defaultValue: 'true') !=
          'false';

  /// Pinning 미적용(insecure) 상태를 명시적으로 기록한다.
  ///
  /// 앱을 hard-crash 시키지 않는다(앱 정책 레이어의 결정). 대신 릴리스에서는
  /// SEVERE 로그를 남겨 모니터링/크래시 리포팅에서 반드시 추적되도록 한다.
  void _markInsecure(String reason) {
    _securityContext = null;
    _pinningActive = false;

    if (kReleaseMode) {
      // 릴리스: 모니터링/크래시 리포팅이 수집할 수 있는 SEVERE(level 1000) 로그.
      // debugPrint 는 릴리스에서 표면화가 보장되지 않으므로 developer.log 사용.
      developer.log(
        '⚠️ SEVERE: 릴리스 빌드가 SSL Pinning 없이 동작합니다. MITM 위험 — '
        '프로덕션 인증서 프로비저닝(ops) 필요. 사유: $reason',
        name: 'SslPinningService',
        level: 1000, // SEVERE
      );
    } else {
      debugPrint('[SSL Pinning] Pinning 없이 계속됨 — $reason');
    }
  }

  /// Dio용 HttpClientAdapter 생성
  HttpClientAdapter createAdapter() {
    // 개발 모드 또는 Pinning 미적용(insecure): 기본 Adapter
    if (kDebugMode || _securityContext == null) {
      return IOHttpClientAdapter();
    }

    // 프로덕션 모드: SSL Pinning Adapter
    return IOHttpClientAdapter(
      createHttpClient: () {
        final client = HttpClient(context: _securityContext);

        // 추가 보안 설정
        client.badCertificateCallback = (cert, host, port) {
          debugPrint('[SSL Pinning] 인증서 검증 실패: $host:$port');
          return false; // 인증서 불일치 시 연결 거부
        };

        return client;
      },
    );
  }

  /// release 빌드에서 pinning 이 꺼진 채 동작하는 상태를 모니터링에 표면화한다.
  ///
  /// [isPinningActive] 가 false 라는 사실을 아무도 조회하지 않으면 pinning 이
  /// 비활성인 채 배포돼도 알 수 없다(2026-07-30 감사에서 참조 0건으로 확인).
  /// `JailbreakDetectionService.checkAndReport()` 와 동일한 관례로 리포트한다.
  ///
  /// 앱을 차단하지 않는다 — 차단 여부는 transport 레이어가 아닌 정책 결정이고,
  /// 통신 자체를 막으면 사용자가 서비스를 전혀 쓸 수 없게 된다.
  void reportIfInsecure() {
    if (!kReleaseMode || _pinningActive) return;

    final context = <String, dynamic>{
      'pinningActive': _pinningActive,
      'initialized': _isInitialized,
      'buildConfigEnabled': _pinningEnabledByBuildConfig,
      'platform': defaultTargetPlatform.name,
      'severity': 'SEVERE',
    };

    AppLogger.instance.errorAs(
      ErrorCategory.client,
      '[Security] SSL Pinning 비활성 상태로 릴리스 동작 (MITM 위험)',
      context: context,
    );

    try {
      Sentry.captureMessage(
        '[Security] SSL Pinning inactive in release',
        level: SentryLevel.fatal,
        withScope: (scope) {
          scope.setTag('type', 'SSL_PINNING_INACTIVE');
          scope.setTag('platform', defaultTargetPlatform.name);
          scope.setContexts('transport_security', context);
        },
      );
    } catch (_) {
      /* Sentry 미초기화 시 무시 */
    }
  }

  /// 초기화 상태 확인
  bool get isInitialized => _isInitialized;

  /// SSL Pinning 이 실제로 강제 적용되고 있는지 여부.
  ///
  /// release 빌드에서 이 값이 false 이면 앱이 Pinning 없이 동작 중(insecure)이라는
  /// 의미이며, 상위(앱 정책) 레이어에서 경고 배너/모니터링 이벤트 등으로 반드시
  /// surface 해야 한다.
  bool get isPinningActive => _pinningActive;
}
