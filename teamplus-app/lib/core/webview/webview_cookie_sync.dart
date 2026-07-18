import 'package:flutter/foundation.dart' show kIsWeb, debugPrint;
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../constants/app_environment.dart';

/// WebView 쿠키 저장소 ↔ Native 토큰 동기화 SoT.
///
/// **문제 (2026-07-15 로그인 개선 ①)**:
///   네이티브 앱에서 로그인/refresh 는 Native Bridge → Flutter Dio 로 수행되므로,
///   백엔드가 응답에 싣는 httpOnly `teamplus_refresh_token` 쿠키(Set-Cookie)가
///   Flutter Dio(쿠키 jar 없음)에서 버려지고 WebView 쿠키 저장소에는 절대 도달하지
///   않는다. 그 결과 Next.js 미들웨어의 "access 만료 + refresh 유효 → 통과 후
///   클라이언트 갱신 위임"(middleware.ts 2026-06-04) 정책이 네이티브에서만 무력화되어,
///   access(15분) 만료 후 하드/RSC 네비게이션마다 `/login?redirect=...` 으로 튕겼다.
///
/// **해결**:
///   Flutter `CookieManager`(iOS WKHTTPCookieStore / Android CookieManager 글로벌
///   저장소)로 웹앱 호스트에 refresh 토큰을 httpOnly 쿠키로 직접 심어 웹 브라우저
///   로그인과 동일한 쿠키 토폴로지를 만든다. 백엔드가 웹 브라우저에 설정하는 것과
///   동일 쿠키(이름·httpOnly·SameSite=Lax·path=/·7일)이므로 신규 공격면 없음.
///
/// **호출 지점 (토큰 생명주기 전체 커버)**:
///   1. `resolveInitialDestination` — 콜드 스타트, WebView 첫 문서 요청 **이전**
///   2. Bridge `auth.saveToken` — 로그인/회원가입/웹발 refresh (web `saveTokens` 경유)
///   3. Bridge `auth.clearToken` — 로그아웃 (쿠키 삭제)
///   4. `ApiClient.onRefreshTokenRotated` — Flutter Dio 인터셉터의 401 자동 갱신
class WebViewCookieSync {
  const WebViewCookieSync._();

  /// 백엔드 `auth.controller.ts` `REFRESH_COOKIE` 와 동일한 이름 (계약).
  static const String _cookieName = 'teamplus_refresh_token';

  /// refresh 만료(7일)와 정합 — backend setRefreshCookie maxAge 와 동일.
  static const Duration _cookieMaxAge = Duration(days: 7);

  /// refresh 토큰을 WebView 쿠키 저장소에 동기화한다.
  ///
  /// - [refreshToken] 이 null/빈 문자열 → 쿠키 삭제 (로그아웃/미인증).
  /// - 그 외 → httpOnly 쿠키로 설정/갱신.
  ///
  /// 실패해도 앱 흐름을 막지 않는다(fail-open) — 쿠키 부재 시 미들웨어의
  /// native UA 폴백(middleware.ts)이 2차 안전망으로 동작한다.
  static Future<void> syncRefreshToken(String? refreshToken) async {
    if (kIsWeb) return;
    try {
      final url = WebUri(appEnv.webAppUrl);
      final cookieManager = CookieManager.instance();

      if (refreshToken == null || refreshToken.isEmpty) {
        await cookieManager.deleteCookie(
          url: url,
          name: _cookieName,
          path: '/',
        );
        debugPrint('[CookieSync] refresh 쿠키 삭제 (host=${url.host})');
        return;
      }

      await cookieManager.setCookie(
        url: url,
        name: _cookieName,
        value: refreshToken,
        path: '/',
        expiresDate:
            DateTime.now().add(_cookieMaxAge).millisecondsSinceEpoch,
        isHttpOnly: true,
        // dev 는 http(비-secure) 환경이므로 스킴 기준으로만 Secure 부착 —
        // backend setRefreshCookie 의 `secure: NODE_ENV === 'production'` 과 정합.
        isSecure: url.scheme == 'https',
        sameSite: HTTPCookieSameSitePolicy.LAX,
      );
      debugPrint('[CookieSync] refresh 쿠키 동기화 완료 (host=${url.host})');
    } catch (e) {
      // CookieManager 미가용(테스트 환경 등)/플랫폼 오류 — 흐름 차단 금지.
      debugPrint('[CookieSync] refresh 쿠키 동기화 실패 (무시): $e');
    }
  }
}
