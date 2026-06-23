/// 암호화된 로그인 요청 모델
///
/// ⚠️ 주의: Freezed 대신 일반 클래스로 구현
/// - Freezed는 build_runner 코드 생성 필요
/// - 단순 모델은 일반 클래스가 더 효율적
///
/// 구조:
/// ```json
/// {
///   "encryptedData": "gU3x7F...",  // Base64-encoded 암호화 데이터
///   "iv": "kL9p1Q...",              // Base64-encoded IV (16바이트)
///   "authTag": "mN4r2T..."          // Base64-encoded 인증 태그 (16바이트)
/// }
/// ```
class EncryptedLoginRequest {
  /// Base64-encoded 암호화 데이터
  /// 포함 내용: {"email": "...", "password": "..."}
  final String encryptedData;

  /// Base64-encoded IV (16바이트)
  /// AES-GCM의 Initialization Vector
  final String iv;

  /// Base64-encoded 인증 태그 (16바이트)
  /// 데이터 무결성 검증 및 변조 감지
  final String authTag;

  const EncryptedLoginRequest({
    required this.encryptedData,
    required this.iv,
    required this.authTag,
  });

  /// JSON 직렬화
  Map<String, dynamic> toJson() => {
        'encryptedData': encryptedData,
        'iv': iv,
        'authTag': authTag,
      };

  /// JSON 역직렬화
  factory EncryptedLoginRequest.fromJson(Map<String, dynamic> json) {
    return EncryptedLoginRequest(
      encryptedData: json['encryptedData'] as String,
      iv: json['iv'] as String,
      authTag: json['authTag'] as String,
    );
  }

  /// EncryptionService의 EncryptedPayload로부터 생성
  ///
  /// @param payload EncryptionService.encryptCredentials()의 반환값
  /// @return EncryptedLoginRequest 인스턴스
  factory EncryptedLoginRequest.fromEncryptedPayload(dynamic payload) {
    return EncryptedLoginRequest(
      encryptedData: payload.encryptedData as String,
      iv: payload.iv as String,
      authTag: payload.authTag as String,
    );
  }

  /// 복사 메서드
  EncryptedLoginRequest copyWith({
    String? encryptedData,
    String? iv,
    String? authTag,
  }) {
    return EncryptedLoginRequest(
      encryptedData: encryptedData ?? this.encryptedData,
      iv: iv ?? this.iv,
      authTag: authTag ?? this.authTag,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is EncryptedLoginRequest &&
          runtimeType == other.runtimeType &&
          encryptedData == other.encryptedData &&
          iv == other.iv &&
          authTag == other.authTag;

  @override
  int get hashCode => Object.hash(encryptedData, iv, authTag);

  @override
  String toString() =>
      'EncryptedLoginRequest(encryptedData: ${encryptedData.length} chars, iv: ${iv.length} chars)';
}
