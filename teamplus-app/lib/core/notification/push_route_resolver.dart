/// FCM 푸시 탭 payload → 웹 상대경로 결정 (순수 함수 — 회귀 테스트 대상)
///
/// 푸시 payload 계약 v1 소비부. 계약 SoT:
///   docs/Architecture/PUSH_NOTIFICATION_GUIDE.md §6 (backend `buildPushData()` 와 상호 pin)
///   FCM data = { v: "1", type: string, linkUrl?: string, notificationId?: string }
///
/// 우선순위:
///  ① data['linkUrl'] — 계약 v1 정식 경로 (내부 경로 검증 통과 시)
///  ② type 폴백맵    — linkUrl 없는 구버전 payload 하위호환 (웹 경로 기준 최소한만)
///  ③ '/notifications' — 웹 알림함 (항목 클릭으로 상세 이동 가능한 최종 폴백)
///
/// 반환 경로는 DeepLinkHandler.navigateToWebPath() 로 전달되어 딥링크와 동일한
/// 파이프라인(WebView 내 라우팅 / cold-start pending 버퍼)을 탄다.
library;

/// 웹 상대경로로 안전하게 사용할 수 있는지 검증.
/// "/" 시작 + 프로토콜 상대 URL("//", "/\") 금지 — 푸시 payload 를 경유한
/// 임의 외부 이동을 차단한다 (발송측 buildPushData 검증과 이중 방어).
bool isValidInternalWebPath(String path) {
  return path.startsWith('/') &&
      !path.startsWith('//') &&
      !path.startsWith('/\\');
}

/// 구버전 payload(linkUrl 부재) 하위호환용 type → 웹 경로 폴백맵.
/// 실존 웹 라우트(teamplus-web/src/app)만 매핑하고, 그 외에는 null 을 반환해
/// 최종 폴백(/notifications)으로 넘긴다. 신규 매핑 추가보다 백엔드 linkUrl
/// 보강이 우선이다(계약 v1).
String? _legacyTypeFallbackPath(String type) {
  if (type.isEmpty) return null;
  // 웹(teamplus-web) 실존 라우트만 매핑 — WebView 가 webAppUrl+path 를 로드하므로
  // 앱 GoRoute(/payment-history)가 아닌 웹 경로(/payment/history)여야 404 를 피한다.
  if (type.startsWith('payment')) return '/payment/history';
  if (type.contains('attendance')) return '/attendance-history';
  if (type == 'chat_message') return '/messages';
  return null;
}

/// FCM 푸시 탭 데이터에서 이동할 웹 경로를 결정한다. 항상 유효한 내부 경로를 반환.
String resolvePushPath(Map<String, dynamic> data) {
  final linkUrl = data['linkUrl'];
  if (linkUrl is String && linkUrl.isNotEmpty && isValidInternalWebPath(linkUrl)) {
    return linkUrl;
  }

  final type = (data['type'] as String? ?? '').toLowerCase();
  return _legacyTypeFallbackPath(type) ?? '/notifications';
}
