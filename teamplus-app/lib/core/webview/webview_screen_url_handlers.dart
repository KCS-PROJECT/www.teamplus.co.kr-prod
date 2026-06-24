// part of webview_screen.dart — 외부 URL/스킴 핸들러 분리.
// (카카오 스토어 fallback 판별 · 외부 앱 스킴 화이트리스트 · intent:// 파싱·실행)
// M2 리팩터 2026-06-24: webview_screen.dart 본문 축소 목적. 기존 top-level private
// 선언을 그대로 이동했을 뿐 동작/시그니처/접근성(라이브러리 private) 변경 없음.
part of 'webview_screen.dart';

/// 카카오 SDK 가 "카카오톡 미설치" 로 오판할 때 호출하는 Play Store fallback URL.
/// 백그라운드 카카오톡의 visibility 변경 감지 실패 + 공유 종료 후 지연 timer 로 인해
/// Store 앱 선택 바텀시트가 뜨는 문제를 차단한다.
bool _isKakaoStoreFallback(Uri uri) {
  if (uri.scheme == 'market' && uri.queryParameters['id'] == 'com.kakao.talk') {
    return true;
  }
  if ((uri.scheme == 'https' || uri.scheme == 'http') &&
      uri.host == 'play.google.com' &&
      uri.path == '/store/apps/details' &&
      uri.queryParameters['id'] == 'com.kakao.talk') {
    return true;
  }
  return false;
}

/// WebView 가 자체 로딩하지 않고 외부 앱으로 위임해야 하는 URL 스킴.
/// 등록되지 않은 스킴은 InAppWebView 가 ERR_UNKNOWN_URL_SCHEME 으로 실패해
/// 카카오 Share SDK 등이 [object Object] 에러로 끊긴다.
bool _isExternalAppScheme(String scheme) => const {
      // 카카오
      'kakaolink',
      'kakaotalk',
      'kakaoplus',
      'kakaokompassauth',
      'storylink',
      // 스토어 / 결제 / 인증
      'market',
      'ispmobile',
      'kftc-bankpay',
      'supertoss',
      'naverapp',
    }.contains(scheme);

/// intent:// URL 파싱 및 실행.
///
/// `intent://HOST/PATH?PARAMS#Intent;scheme=ACTUAL;package=PKG;S.key=val;end`
/// 형식에서 실제 스킴을 추출하여 `ACTUAL://HOST/PATH?PARAMS` 로 재구성한 뒤
/// 실행한다. 실패 시 `S.browser_fallback_url` 폴백 URL 을 시도한다.
Future<void> _launchIntentUrl(String intentUrl) async {
  final schemeMatch =
      RegExp(r'#Intent;.*?scheme=([^;]+)').firstMatch(intentUrl);
  if (schemeMatch == null) {
    debugPrint('[WebView] intent URL 에서 scheme 추출 실패: $intentUrl');
    return;
  }

  final actualScheme = schemeMatch.group(1)!;
  final hashIndex = intentUrl.indexOf('#Intent;');
  if (hashIndex <= 0) return;

  final dataPath = intentUrl.substring('intent://'.length, hashIndex);
  final reconstructed = Uri.parse('$actualScheme://$dataPath');

  debugPrint('[WebView] intent → $actualScheme://${dataPath.substring(0, dataPath.length.clamp(0, 60))}...');

  try {
    await launchUrl(reconstructed, mode: LaunchMode.externalApplication);
    return;
  } catch (e) {
    debugPrint('[WebView] 재구성 URL 실행 실패: $e');
  }

  // 폴백: S.browser_fallback_url 추출
  final fallbackMatch =
      RegExp(r'S\.browser_fallback_url=([^;]+)').firstMatch(intentUrl);
  if (fallbackMatch != null) {
    final fallbackUrl = Uri.decodeComponent(fallbackMatch.group(1)!);
    debugPrint('[WebView] intent 폴백 URL: $fallbackUrl');
    try {
      await launchUrl(
        Uri.parse(fallbackUrl),
        mode: LaunchMode.externalApplication,
      );
    } catch (e) {
      debugPrint('[WebView] 폴백 URL 실행 실패: $e');
    }
  }
}
