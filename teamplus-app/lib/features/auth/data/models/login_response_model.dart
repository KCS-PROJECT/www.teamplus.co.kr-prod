/// 로그인 응답 모델
///
/// ⚠️ 주의: JsonSerializable 대신 일반 클래스로 구현
/// - 코드 생성 불필요
/// - 단순 모델은 수동 직렬화가 더 효율적
class LoginResponse {
  final String accessToken;
  final String refreshToken;
  final UserData user;

  const LoginResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      user: UserData.fromJson(json['user'] as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'user': user.toJson(),
      };
}

/// 사용자 데이터 모델
class UserData {
  final String id;
  final String email;
  final String userType;
  final String? name;
  final String? phone;

  const UserData({
    required this.id,
    required this.email,
    required this.userType,
    this.name,
    this.phone,
  });

  factory UserData.fromJson(Map<String, dynamic> json) {
    return UserData(
      id: json['id'] as String,
      email: json['email'] as String,
      userType: json['userType'] as String,
      name: json['name'] as String?,
      phone: json['phone'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'userType': userType,
        if (name != null) 'name': name,
        if (phone != null) 'phone': phone,
      };
}
