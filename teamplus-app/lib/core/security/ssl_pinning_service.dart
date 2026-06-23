import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// SSL/TLS Certificate Pinning 서비스
///
/// MITM 공격 차단을 위해 서버 인증서를 앱에 포함시켜 검증
class SslPinningService {
  static final SslPinningService _instance = SslPinningService._internal();
  factory SslPinningService() => _instance;
  SslPinningService._internal();

  SecurityContext? _securityContext;
  bool _isInitialized = false;

  /// 인증서 로드 및 초기화
  Future<void> initialize() async {
    if (_isInitialized) return;

    // 개발 환경: SSL Pinning 비활성화 (디버깅 편의)
    if (kDebugMode) {
      debugPrint('[SSL Pinning] 개발 모드 - Pinning 비활성화');
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

      // 인증서 내용이 비어있거나 플레이스홀더인 경우 무시
      final certContent = String.fromCharCodes(certData);
      if (certContent.trim().isEmpty || certContent.contains('Placeholder')) {
        debugPrint('[SSL Pinning] 유효한 인증서가 없음 - Pinning 없이 계속됨');
        _isInitialized = true;
        return;
      }

      _securityContext = SecurityContext.defaultContext
        ..setTrustedCertificatesBytes(certData);

      _isInitialized = true;
      debugPrint('[SSL Pinning] 인증서 로드 완료: $certPath');
    } catch (e) {
      debugPrint('[SSL Pinning] 인증서 로드 실패 (Pinning 없이 계속됨): $e');
      // 에러를 던지지 않고 초기화 완료 처리하여 앱 실행 유지
      _isInitialized = true;
    }
  }

  /// Dio용 HttpClientAdapter 생성
  HttpClientAdapter createAdapter() {
    // 개발 모드: 기본 Adapter
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

  /// 초기화 상태 확인
  bool get isInitialized => _isInitialized;
}
