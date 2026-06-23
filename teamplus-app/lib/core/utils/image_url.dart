import '../constants/app_environment.dart';

/// 이미지 표시용 URL 절대화 헬퍼 (Flutter — Web `lib/image-url.ts` 동일 패턴)
///
/// Backend `POST /api/v1/files/upload` 응답의 `url` 필드는 상대 경로(`/uploads/...`)다.
/// `Image.network()` 는 절대 URL 만 받으므로 origin 기준으로 절대화한다.
///
/// `apiBaseUrl` 이 `http://host:port/api/v1` 처럼 path suffix 를 포함하므로,
/// 정적 자원 prefix `/uploads/` 가 `/api/v1/uploads/` 로 합성되지 않도록
/// **origin (scheme + host + port) 만** 사용한다.
///
/// 2026-05-23 hotfix — 팀 로고/프로필 사진 업로드 후 표시 404 차단.
///
/// 동작:
/// - `null` / 빈 문자열 → `null`
/// - `data:` / `blob:` / `http://` / `https://` → 원본 그대로
/// - `/` 시작 → `${apiOrigin}${path}`
/// - 그 외 → `${apiOrigin}/${path}`
///
/// @param cacheBust 같은 URL 강제 재로드. updatedAt 등 timestamp 전달 시 `?v=` 부착.
String? absoluteImageUrl(String? url, {Object? cacheBust}) {
  if (url == null) return null;
  final trimmed = url.trim();
  if (trimmed.isEmpty) return null;

  // 이미 절대 URL (또는 data:/blob:)
  if (trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://')) {
    return _appendCacheBust(trimmed, cacheBust);
  }

  // apiBaseUrl 에서 origin 만 추출
  final apiOrigin = _apiOrigin();
  if (apiOrigin == null) return null;

  final base = trimmed.startsWith('/')
      ? '$apiOrigin$trimmed'
      : '$apiOrigin/$trimmed';
  return _appendCacheBust(base, cacheBust);
}

String? _apiOrigin() {
  try {
    final uri = Uri.parse(appEnv.apiBaseUrl);
    if (uri.hasScheme && uri.host.isNotEmpty) {
      final port = uri.hasPort ? ':${uri.port}' : '';
      return '${uri.scheme}://${uri.host}$port';
    }
  } catch (_) {
    // fallback
  }
  return appEnv.apiBaseUrl;
}

String _appendCacheBust(String url, Object? cacheBust) {
  if (cacheBust == null) return url;
  final v = cacheBust is DateTime
      ? cacheBust.millisecondsSinceEpoch.toString()
      : cacheBust.toString();
  if (v.isEmpty) return url;
  final sep = url.contains('?') ? '&' : '?';
  return '$url${sep}v=${Uri.encodeComponent(v)}';
}
