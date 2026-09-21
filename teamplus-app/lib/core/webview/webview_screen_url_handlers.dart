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

/// WebView 가 직접 로드할 수 있는 스킴. 이 외에는 모두 외부 앱으로 위임한다.
///
/// 카드사·간편결제 앱 스킴을 화이트리스트로 관리하면 목록에 없는 앱이 호출될 때
/// WebView 가 그대로 로드하다 ERR_UNKNOWN_URL_SCHEME 으로 끊긴다. 카드사는 앱 버전마다
/// 스킴을 바꾸고 결제창이 intent 와 직접 스킴을 함께 쏘기도 해서 목록을 따라갈 수 없다.
/// PG 사(나이스·토스·PortOne) 권장 방식이 동일하게 "웹 스킴 외에는 전부 외부 위임" 이다.
const _webLoadableSchemes = {'http', 'https', 'about', 'data', 'blob', 'file'};

bool _isExternalAppScheme(String scheme) =>
    scheme.isNotEmpty && !_webLoadableSchemes.contains(scheme.toLowerCase());

/// 앱 스킴으로 향하는 폼 POST 를 GET 이동으로 바꾸는 주입 스크립트.
///
/// 판정은 `new URL()` 로 푼 절대 주소의 프로토콜로만 한다 — 상대 경로 폼을 오판하지 않고,
/// `<input name="action">` 이 form.action 을 가리는 경우도 프로토타입 getter 로 우회한다.
/// GET 폼은 원래 가로채기 대상이라 손대지 않는다.
const String _appSchemeFormGuardScript = r'''
(function () {
  if (window.__tpAppSchemeFormGuard) return;
  window.__tpAppSchemeFormGuard = true;
  var WEB = { 'http:': 1, 'https:': 1, 'about:': 1, 'data:': 1, 'blob:': 1, 'javascript:': 1, 'file:': 1 };
  var actionDesc = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'action');
  function appSchemeAction(f) {
    var raw, proto;
    try { raw = actionDesc && actionDesc.get ? actionDesc.get.call(f) : f.getAttribute('action'); } catch (e) { return null; }
    if (!raw) return null;
    try { proto = new URL(raw, document.baseURI).protocol; } catch (e) { return null; }
    return WEB[proto] ? null : raw;
  }
  function isPost(f) {
    var m; try { m = f.getAttribute('method'); } catch (e) { m = null; }
    return String(m || 'get').toLowerCase() === 'post';
  }
  function reroute(f) {
    if (!isPost(f)) return false;
    var a = appSchemeAction(f);
    if (!a) return false;
    try { console.warn('[tp] app-scheme POST rerouted to GET: ' + a.split(':')[0]); } catch (e) {}
    try { window.location.href = a; } catch (e) {}
    return true;
  }
  try {
    var submit0 = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () { if (reroute(this)) return; return submit0.apply(this, arguments); };
    if (HTMLFormElement.prototype.requestSubmit) {
      var req0 = HTMLFormElement.prototype.requestSubmit;
      HTMLFormElement.prototype.requestSubmit = function () { if (reroute(this)) return; return req0.apply(this, arguments); };
    }
  } catch (e) {}
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.tagName === 'FORM' && reroute(f)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
''';

/// 같은 intent 주소가 짧은 간격으로 두 번 오면(결제창의 GET + 폼 POST 재라우팅) 두 번째는
/// 무시한다 — 스토어 선택창이 겹쳐 뜨는 것을 막는다.
String? _lastIntentUrl;
int _lastIntentAtMs = 0;

/// intent:// URL 파싱 및 실행.
///
/// `intent://HOST/PATH?PARAMS#Intent;scheme=ACTUAL;package=PKG;S.key=val;end`
/// 형식에서 실제 스킴을 추출해 `ACTUAL://HOST/PATH?PARAMS` 로 재구성한 뒤 실행한다.
/// 실패 시 `S.browser_fallback_url` → `market://details?id=PACKAGE` 순으로 폴백한다.
Future<void> _launchIntentUrl(String intentUrl) async {
  final nowMs = DateTime.now().millisecondsSinceEpoch;
  if (intentUrl == _lastIntentUrl && nowMs - _lastIntentAtMs < 2000) {
    debugPrint('[WebView] intent 중복 호출 무시');
    return;
  }
  _lastIntentUrl = intentUrl;
  _lastIntentAtMs = nowMs;

  // 마커 대소문자는 결제수단마다 다르다(`#Intent;` · `#intent;`). 대문자만 보면
  //   소문자를 쓰는 카드사에서 앱 호출이 조용히 누락된다.
  final markerMatch =
      RegExp(r'#intent;', caseSensitive: false).firstMatch(intentUrl);
  final schemeMatch = RegExp(r'#intent;.*?scheme=([^;]+)', caseSensitive: false)
      .firstMatch(intentUrl);
  if (markerMatch == null || schemeMatch == null) {
    debugPrint('[WebView] intent URL 에서 scheme 추출 실패');
    return;
  }

  final actualScheme = schemeMatch.group(1)!;
  final hashIndex = markerMatch.start;
  if (hashIndex <= 0) return;

  final dataPath = intentUrl.substring('intent://'.length, hashIndex);
  final packageMatch =
      RegExp(r'package=([^;]+)', caseSensitive: false).firstMatch(intentUrl);

  debugPrint('[WebView] intent → $actualScheme (pkg=${packageMatch?.group(1) ?? "none"})');

  // url_launcher 는 처리할 앱이 없으면 예외 대신 false 를 돌려준다 — 반환값을 봐야 폴백이 돈다.
  try {
    final launched = await launchUrl(
      Uri.parse('$actualScheme://$dataPath'),
      mode: LaunchMode.externalApplication,
    );
    if (launched) return;
    debugPrint('[WebView] $actualScheme 처리 앱 없음 → 폴백');
  } catch (e) {
    debugPrint('[WebView] 재구성 URL 실행 실패: $e');
  }

  // 폴백 1: S.browser_fallback_url
  final fallbackMatch =
      RegExp(r'S\.browser_fallback_url=([^;]+)').firstMatch(intentUrl);
  if (fallbackMatch != null) {
    try {
      final launched = await launchUrl(
        Uri.parse(Uri.decodeComponent(fallbackMatch.group(1)!)),
        mode: LaunchMode.externalApplication,
      );
      if (launched) return;
    } catch (e) {
      debugPrint('[WebView] 폴백 URL 실행 실패: $e');
    }
  }

  // 폴백 2: 앱 미설치로 보고 스토어로 안내한다.
  final packageName = packageMatch?.group(1);
  if (packageName != null && packageName.isNotEmpty) {
    try {
      final launched = await launchUrl(
        Uri.parse('market://details?id=$packageName'),
        mode: LaunchMode.externalApplication,
      );
      if (!launched) debugPrint('[WebView] 스토어 앱 없음: $packageName');
    } catch (e) {
      debugPrint('[WebView] 스토어 이동 실패: $e');
    }
  }
}
