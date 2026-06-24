import 'dart:convert';
import 'package:encrypt/encrypt.dart' as encrypt;
import 'package:flutter/foundation.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../logging/app_logger.dart';

/// 암호화 결과 인터페이스
///
/// 서버와 주고받는 JSON 페이로드 구조
/// ⚠️ 주의: Dart는 중첩 클래스를 허용하지 않으므로 반드시 클래스 외부에 선언
class EncryptedPayload {
  /// Base64-encoded 암호화 데이터
  final String encryptedData;

  /// Base64-encoded IV (16바이트, 요청마다 다름)
  final String iv;

  /// Base64-encoded 인증 태그 (16바이트)
  /// 데이터 무결성 검증 및 변조 감지
  final String authTag;

  EncryptedPayload({
    required this.encryptedData,
    required this.iv,
    required this.authTag,
  });

  /// JSON 직렬화 (API 요청용)
  Map<String, dynamic> toJson() => {
        'encryptedData': encryptedData,
        'iv': iv,
        'authTag': authTag,
      };

  /// 디버그용 문자열 표현
  @override
  String toString() =>
      'EncryptedPayload(data=${encryptedData.length} bytes, iv=${iv.length} bytes)';
}

/// AES-256-GCM 암호화 서비스
///
/// Web Crypto API와 동일한 스펙으로 구현:
/// - 알고리즘: AES-256-GCM
/// - 키: 256비트 (32바이트)
/// - IV: 16바이트 (요청마다 랜덤)
/// - Auth Tag: 16바이트 (무결성 검증)
///
/// 사용처:
/// - 로그인 화면에서 이메일/비밀번호 암호화
/// - 백엔드로 암호화된 요청 전송
class EncryptionService {
  /// 환경 변수에서 로드한 secret key (32바이트 = 256비트)
  /// 빌드 시 --dart-define으로 주입: flutter run --dart-define=CRYPTO_SECRET_KEY=...
  static const String _secretKeyHex = String.fromEnvironment(
    'CRYPTO_SECRET_KEY',
    defaultValue: '',
  );

  late final encrypt.Key _key;
  late final encrypt.Encrypter _encrypter;

  /// EncryptionService 초기화
  ///
  /// 환경 변수 검증 및 암호화 엔진 설정
  /// @throws Exception CRYPTO_SECRET_KEY가 없거나 길이가 64가 아닌 경우
  EncryptionService() {
    if (_secretKeyHex.isEmpty || _secretKeyHex.length != 64) {
      throw Exception('CRYPTO_SECRET_KEY must be 64 hex chars (32 bytes). '
          'Set via: flutter run --dart-define=CRYPTO_SECRET_KEY=<hex>');
    }

    // Hex string → Uint8List (32바이트)
    final keyBytes = _hexToBytes(_secretKeyHex);
    _key = encrypt.Key(keyBytes);

    // AES-256-GCM 모드로 암호화 엔진 초기화
    _encrypter = encrypt.Encrypter(encrypt.AES(
      _key,
      mode: encrypt.AESMode.gcm,
    ));
  }

  /// 최소 페이로드 크기를 보장하기 위한 패딩 추가
  ///
  /// Backend DTO에서 encryptedData 최소 100자를 요구하므로,
  /// 평문이 최소 80바이트가 되도록 패딩 추가
  /// (80바이트 → Base64 ~107자)
  ///
  /// @param plaintext 원본 평문
  /// @return 패딩이 추가된 평문
  String _addPadding(String plaintext) {
    const minPlaintextSize = 80; // 80바이트 → Base64 ~107자
    final currentSize = utf8.encode(plaintext).length;

    if (currentSize >= minPlaintextSize) {
      return plaintext;
    }

    // JSON 객체에 _pad 필드 추가
    try {
      final obj = jsonDecode(plaintext) as Map<String, dynamic>;
      final paddingNeeded = minPlaintextSize - currentSize;
      // 랜덤 패딩 생성 (A-Z 문자)
      final random = encrypt.SecureRandom(paddingNeeded);
      final padding = String.fromCharCodes(
        random.bytes.map((b) => 65 + (b % 26)), // A-Z 문자
      );
      obj['_pad'] = padding;
      return jsonEncode(obj);
    } catch (e) {
      // JSON 이 아닌 평문(비-JSON)은 정상 케이스 — 직접 공백 패딩으로 폴백.
      //   ⚠️ 평문/키 노출 금지: 평문 내용은 절대 로깅하지 않고 폴백 사용 사실만 debug 기록.
      AppLogger.instance.debug(
        'EncryptionService: 비-JSON 평문 → 공백 패딩 폴백',
        context: {
          'op': 'encryption.addPadding',
          'reason': e.runtimeType.toString(),
        },
      );
      final paddingNeeded = minPlaintextSize - currentSize;
      return plaintext + ' ' * paddingNeeded;
    }
  }

  /// AES-256-GCM으로 평문 암호화
  ///
  /// 동작 흐름:
  /// 1. 최소 크기 보장을 위한 패딩 추가
  /// 2. 16바이트 랜덤 IV 생성
  /// 3. AES-256-GCM으로 평문 암호화
  /// 4. 인증 태그 추출 (마지막 16바이트)
  /// 5. Base64로 인코딩하여 반환
  ///
  /// @param plaintext 암호화할 평문 (보통 JSON stringified object)
  /// @return Base64-encoded encryptedData, iv, authTag (최소 100자 보장)
  /// @throws Exception 암호화 실패 시
  ///
  /// @example
  /// final credentials = jsonEncode({
  ///   'email': 'user@teamplus.com',
  ///   'password': 'secret123'
  /// });
  /// final payload = await encryptionService.encryptCredentials(credentials);
  /// // API 요청
  /// final response = await api.post('/auth/login', payload.toJson());
  Future<EncryptedPayload> encryptCredentials(String plaintext) async {
    try {
      // 1. 최소 크기 보장을 위한 패딩 추가
      final paddedPlaintext = _addPadding(plaintext);

      // 2. 16바이트 랜덤 IV 생성
      final iv = encrypt.IV.fromSecureRandom(16);

      // 3. AES-256-GCM으로 암호화 (패딩된 평문 사용)
      // encrypt 패키지는 IV와 평문으로부터 ciphertext를 생성
      final encrypted = _encrypter.encrypt(
        paddedPlaintext,
        iv: iv,
      );

      // 4. 인증 태그 추출
      // encrypt 패키지는 ciphertext에 authTag를 포함하므로 분리 필요
      // GCM 모드: ciphertext = actual_ciphertext || authTag (마지막 16바이트)
      final cipherBytes = encrypted.bytes;
      final dataLen = cipherBytes.length - 16; // authTag 16바이트 제외
      final encryptedData = cipherBytes.sublist(0, dataLen);
      final authTag = cipherBytes.sublist(dataLen);

      // 5. Base64 인코딩하여 반환
      return EncryptedPayload(
        encryptedData: base64Encode(encryptedData),
        iv: base64Encode(iv.bytes),
        authTag: base64Encode(authTag),
      );
    } catch (e, st) {
      // 암호화 실패 — 구조화 로깅 + Sentry 보고 (로그인 자격증명 암호화 실패는 로그인 차단으로 직결).
      //   ⚠️ 평문/키/IV 는 절대 로깅하지 않는다. 실패 사실·예외 타입만 기록.
      AppLogger.instance.error(
        'AES-256-GCM 암호화 실패',
        error: e,
        stackTrace: st,
        category: ErrorCategory.client,
        context: {'op': 'encryption.encryptCredentials'},
      );
      _reportCryptoToSentry(e, st, operation: 'encryption.encryptCredentials');
      throw Exception('Encryption failed: $e');
    }
  }

  /// Hex string을 Uint8List로 변환
  ///
  /// 예: "0123456789abcdef" → [0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]
  ///
  /// @param hex 16진수 문자열 (짝수 길이, lowercase/uppercase 모두 지원)
  /// @return Uint8List (각 바이트)
  Uint8List _hexToBytes(String hex) {
    final length = hex.length;
    final result = Uint8List(length ~/ 2);
    for (var i = 0; i < length; i += 2) {
      result[i ~/ 2] = int.parse(hex.substring(i, i + 2), radix: 16);
    }
    return result;
  }

  /// 암호화 서비스 상태 확인 (개발용)
  ///
  /// @return {isConfigured, keyLength} 상태 정보
  Map<String, dynamic> getStatus() {
    return {
      'isConfigured': _secretKeyHex.isNotEmpty && _secretKeyHex.length == 64,
      'keyLength': _secretKeyHex.length,
      'encrypterInitialized': true, // _encrypter is always non-null after init
    };
  }
}

/// 전역 EncryptionService 인스턴스 (앱 전체에서 재사용)
///
/// 사용:
/// ```dart
/// final payload = await encryptionService.encryptCredentials(credentials);
/// ```
final encryptionService = EncryptionService();

/// Sentry 보고 — SENTRY_DSN 미설정/미초기화 시 no-op.
///
/// main.dart 의 Sentry init 패턴(DSN 없으면 초기화 안 됨)에 맞춰 try/catch 로 감싸
/// 미초기화 환경에서도 호출부에 예외가 전파되지 않도록 한다.
/// ⚠️ 평문/키 등 민감정보는 전달하지 않는다 — 예외 객체(타입/메시지)만 보고.
void _reportCryptoToSentry(
  Object error,
  StackTrace? stackTrace, {
  required String operation,
}) {
  try {
    Sentry.captureException(
      error,
      stackTrace: stackTrace,
      withScope: (scope) {
        scope.level = SentryLevel.error;
        scope.setTag('operation', operation);
      },
    );
  } catch (_) {
    /* Sentry 미초기화 시 무시 */
  }
}
