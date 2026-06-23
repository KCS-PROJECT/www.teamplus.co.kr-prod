class AuthResponse {
  final String accessToken;
  final String refreshToken;
  final String userId;
  final String userType;
  final String email;

  AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.userType,
    required this.email,
  });
}
