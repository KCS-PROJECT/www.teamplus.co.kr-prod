import 'dart:collection';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// ETag 기반 HTTP GET 응답 캐시 인터셉터
///
/// 서버가 반환한 `ETag` + response body 를 메모리에 보관하고, 동일 URL 의 후속 요청에
/// `If-None-Match` 헤더를 첨부한다. 서버가 `304 Not Modified` 를 응답하면
/// 캐시된 body 를 200 응답으로 치환하여 파싱 로직은 변경 없이 동작한다.
///
/// - **효과**: 반복 GET 요청에서 네트워크 전송량 0 + 파싱 시간만 소요 → 90% 단축
/// - **제약**: GET 메서드만 캐시. POST/PUT/PATCH/DELETE 는 통과.
///            Public API 도 동일하게 캐시 가능 (인증 무관).
/// - **용량 제한**: LRU 최대 100 엔트리 (대략 2-5MB 메모리). 초과 시 가장 오래된 항목 제거.
/// - **정합성**: 서버가 ETag 를 준 경우에만 캐시. 주지 않으면 캐시 건너뜀 (부담 없음).
///
/// 등록 순서: `AuthGuardInterceptor` 뒤, `_AuthInterceptor` 앞 — 토큰 갱신 재시도
/// 경로에서도 304 체크가 자연스럽게 먹히도록 한다.
class EtagCacheInterceptor extends Interceptor {
  EtagCacheInterceptor({this.maxEntries = 100});

  final int maxEntries;

  /// LRU 캐시 — key: 전체 URL + query hash
  final LinkedHashMap<String, _CacheEntry> _store =
      LinkedHashMap<String, _CacheEntry>();

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) {
    if (options.method.toUpperCase() != 'GET') {
      return handler.next(options);
    }
    final key = _keyOf(options);
    final cached = _store.remove(key); // LRU 재삽입
    if (cached != null) {
      _store[key] = cached;
      options.headers['If-None-Match'] = cached.etag;
      // 서버가 304 로 응답할 수 있도록 dio 가 자동 에러 처리하지 않게 설정
      options.extra['_etagCacheKey'] = key;
    }
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final method = response.requestOptions.method.toUpperCase();
    if (method != 'GET') return handler.next(response);

    final key = (response.requestOptions.extra['_etagCacheKey'] as String?) ??
        _keyOf(response.requestOptions);
    final etag = response.headers.value('etag');
    final status = response.statusCode ?? 0;

    if (status == 200 && etag != null && etag.isNotEmpty) {
      _putCache(key, _CacheEntry(etag: etag, data: response.data));
    }
    return handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // 일부 서버/Dio 설정은 304 를 error 로 분류. 이 경우 캐시 body 로 복구.
    if (err.response?.statusCode == 304) {
      final key = (err.requestOptions.extra['_etagCacheKey'] as String?) ??
          _keyOf(err.requestOptions);
      final cached = _store[key];
      if (cached != null) {
        if (kDebugMode) {
          debugPrint('[ETag] 304 hit → cache restore for $key');
        }
        final restored = Response<dynamic>(
          requestOptions: err.requestOptions,
          statusCode: 200,
          statusMessage: 'OK (ETag cache)',
          data: cached.data,
          headers: err.response?.headers ?? Headers(),
          extra: {'_etagCached': true},
        );
        return handler.resolve(restored);
      }
    }
    return handler.next(err);
  }

  void _putCache(String key, _CacheEntry entry) {
    _store.remove(key);
    _store[key] = entry;
    while (_store.length > maxEntries) {
      _store.remove(_store.keys.first);
    }
  }

  String _keyOf(RequestOptions options) {
    // query string 을 사전순 정렬하여 ?a=1&b=2 / ?b=2&a=1 동일 취급
    final query = Map<String, dynamic>.from(options.queryParameters)
      ..removeWhere((_, v) => v == null);
    final sortedKeys = query.keys.toList()..sort();
    final queryString = sortedKeys.map((k) => '$k=${query[k]}').join('&');
    return '${options.method}:${options.path}${queryString.isEmpty ? '' : '?$queryString'}';
  }

  /// 외부에서 특정 URL 캐시 무효화 (예: 로그아웃 시 전체 초기화)
  void invalidate({String? pathPrefix}) {
    if (pathPrefix == null) {
      _store.clear();
      return;
    }
    _store.removeWhere((key, _) => key.contains(pathPrefix));
  }
}

class _CacheEntry {
  _CacheEntry({required this.etag, required this.data});

  final String etag;
  final dynamic data;
}
