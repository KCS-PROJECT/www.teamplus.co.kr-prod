/// WebView Bridge `storage` 핸들러 보안 화이트리스트.
///
/// 핵심 제약:
/// - Web 측이 보낸 raw key 앞에 `ns:web:` prefix를 강제로 붙여 `kv_store`만 접근.
///   도메인 테이블(profile_cache, schedules_cache 등) 절대 노출 금지.
/// - 키 정규식 `[A-Za-z0-9._\-]+`, 길이 ≤ 256자.
/// - JSON value 사이즈 ≤ 64KB.
/// - 키에 `token|secret|password|pin` 패턴 포함 시 reject (실수 방지).
///
/// 사용 예:
/// ```dart
/// final ns = BridgeKvWhitelist.namespaceWeb;          // 'web'
/// final fullKey = BridgeKvWhitelist.validateAndNormalize('ui.theme');
/// // fullKey == 'ns:web:ui.theme'
/// ```
class BridgeKvWhitelist {
  BridgeKvWhitelist._();

  /// WebView Bridge가 사용할 수 있는 유일한 네임스페이스.
  static const String namespaceWeb = 'web';

  /// 네이티브 전용 네임스페이스 (Bridge 비노출).
  static const String namespaceApp = 'app';

  /// 시스템 메타 네임스페이스 (스키마 버전, GC 타임스탬프 등).
  static const String namespaceSys = 'sys';

  /// Web 키 prefix — 모든 Bridge 호출에 자동 부착.
  static const String webPrefix = 'ns:web:';

  static const int maxKeyLength = 256;
  static const int maxValueBytes = 64 * 1024; // 64KB
  static const int maxKeysReturnedFromKeysAction = 200;

  static final RegExp _allowedKeyPattern = RegExp(r'^[A-Za-z0-9._\-]+$');
  static final RegExp _forbiddenSubstring = RegExp(
    r'(token|secret|password|pin|jwt|bearer)',
    caseSensitive: false,
  );

  /// 키 검증 + `ns:web:` prefix 부착. 실패 시 [BridgeStorageException] throw.
  static String validateAndNormalize(String rawKey) {
    if (rawKey.isEmpty || rawKey.length > maxKeyLength) {
      throw const BridgeStorageException(
        BridgeStorageErrorCode.invalidKey,
        'key length out of range',
      );
    }
    if (!_allowedKeyPattern.hasMatch(rawKey)) {
      throw const BridgeStorageException(
        BridgeStorageErrorCode.invalidKey,
        'illegal characters in key',
      );
    }
    if (_forbiddenSubstring.hasMatch(rawKey)) {
      throw const BridgeStorageException(
        BridgeStorageErrorCode.invalidKey,
        'key contains forbidden pattern (sensitive data must use auth handler)',
      );
    }
    return '$webPrefix$rawKey';
  }

  /// 값 사이즈 검증 (JSON 직렬화된 문자열 기준).
  static void validateValueSize(String jsonValue) {
    if (jsonValue.length > maxValueBytes) {
      throw const BridgeStorageException(
        BridgeStorageErrorCode.quota,
        'value too large (max 64KB)',
      );
    }
  }

  /// Bridge가 받은 prefix 인자 검증 — 동일 규칙(없거나 빈 문자열은 허용).
  static String? validateAndNormalizePrefix(String? rawPrefix) {
    if (rawPrefix == null || rawPrefix.isEmpty) return webPrefix;
    if (rawPrefix.length > maxKeyLength) {
      throw const BridgeStorageException(
        BridgeStorageErrorCode.invalidKey,
        'prefix length out of range',
      );
    }
    if (!_allowedKeyPattern.hasMatch(rawPrefix)) {
      throw const BridgeStorageException(
        BridgeStorageErrorCode.invalidKey,
        'illegal characters in prefix',
      );
    }
    return '$webPrefix$rawPrefix';
  }

  /// `ns:web:` prefix를 제거하여 Web 측에 돌려줄 raw key로 변환.
  static String stripWebPrefix(String fullKey) {
    if (fullKey.startsWith(webPrefix)) {
      return fullKey.substring(webPrefix.length);
    }
    return fullKey;
  }
}

/// Bridge `storage` 핸들러가 던지는 표준 에러 코드.
enum BridgeStorageErrorCode {
  invalidKey,
  notFound,
  quota,
  invalidValue,
  unknown,
}

extension BridgeStorageErrorCodeWire on BridgeStorageErrorCode {
  /// Web 측으로 내려보낼 와이어 포맷 문자열.
  String get wire {
    switch (this) {
      case BridgeStorageErrorCode.invalidKey:
        return 'STORAGE_INVALID_KEY';
      case BridgeStorageErrorCode.notFound:
        return 'STORAGE_NOT_FOUND';
      case BridgeStorageErrorCode.quota:
        return 'STORAGE_QUOTA';
      case BridgeStorageErrorCode.invalidValue:
        return 'STORAGE_INVALID_VALUE';
      case BridgeStorageErrorCode.unknown:
        return 'STORAGE_UNKNOWN';
    }
  }
}

/// Bridge `storage` 핸들러에서 발생하는 검증/조회 실패 예외.
class BridgeStorageException implements Exception {
  final BridgeStorageErrorCode code;
  final String message;

  const BridgeStorageException(this.code, this.message);

  @override
  String toString() => 'BridgeStorageException(${code.wire}): $message';
}
