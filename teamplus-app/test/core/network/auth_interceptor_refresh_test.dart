// _AuthInterceptor 토큰 갱신 회귀 테스트.
//
// 핵심 회귀 방지 대상:
//  1) 갱신 응답 envelope({success, requestId, data}) 해제 — 최상위에서 읽으면
//     토큰이 null 이 되어 갱신이 항상 실패하고 접속 토큰 만료 때마다 로그아웃됐다.
//  2) 갱신 실패 분류 — 서버가 거부(4xx)한 경우에만 로컬 토큰을 지운다.
//     서버에 닿지 못한 경우(연결 오류·5xx·429)는 토큰을 유지하고 요청만 실패한다.
//
// 갱신은 인터셉터 없는 새 Dio 로 나가므로 어댑터 목킹으로는 잡히지 않는다 —
// 로컬 HttpServer 를 백엔드로 세우고 baseUrl 을 그리로 돌려 두 경로를 실제 HTTP 로 검증한다.
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:teamplus_app/core/constants/app_environment.dart';
import 'package:teamplus_app/core/network/api_client.dart';

/// 갱신 엔드포인트가 낼 응답 종류.
enum _RefreshMode {
  envelope,
  emptyEnvelope,
  status503,
  status429,
  status401,
  drop
}

const _oldAccess = 'a.b.c';
const _oldRefresh = 'r.e.f';
const _newAccess = 'n.e.w';
const _newRefresh = 'n.r.t';

late HttpServer _server;
_RefreshMode _mode = _RefreshMode.envelope;
int _refreshCalls = 0;
final List<String?> _probeAuthHeaders = [];

Future<void> _startServer() async {
  _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  _server.listen((req) async {
    if (req.uri.path.endsWith('/auth/refresh')) {
      _refreshCalls += 1;
      switch (_mode) {
        case _RefreshMode.envelope:
          _json(req, 200, {
            'success': true,
            'requestId': 'req-1',
            'data': {'accessToken': _newAccess, 'refreshToken': _newRefresh},
          });
        case _RefreshMode.emptyEnvelope:
          _json(req, 200, {'success': true, 'requestId': 'req-2', 'data': {}});
        case _RefreshMode.status503:
          _json(req, 503, {'success': false, 'message': 'unavailable'});
        case _RefreshMode.status429:
          _json(req, 429, {'success': false, 'message': 'too many'});
        case _RefreshMode.status401:
          _json(req, 401, {
            'success': false,
            'errorCode': 'INVALID_REFRESH',
            'message': 'refresh rejected',
          });
        case _RefreshMode.drop:
          await req.response.detachSocket().then((s) => s.destroy());
      }
      return;
    }
    // 보호 API — 새 접속 토큰이면 200, 아니면 401.
    final auth = req.headers.value('authorization');
    _probeAuthHeaders.add(auth);
    if (auth == 'Bearer $_newAccess') {
      _json(req, 200, {'ok': true});
    } else {
      _json(req, 401, {
        'success': false,
        'errorCode': 'TOKEN_EXPIRED',
        'message': 'expired',
      });
    }
  });
}

void _json(HttpRequest req, int status, Map<String, dynamic> body) {
  req.response
    ..statusCode = status
    ..headers.contentType = ContentType.json
    ..write(jsonEncode(body))
    ..close();
}

Future<String?> _stored(String key) =>
    const FlutterSecureStorage().read(key: key);

/// RetryInterceptor 를 건너뛰기 위해 재시도 횟수를 소진 상태로 보낸다(연결 오류·5xx 는 재시도 대상).
Future<Response<dynamic>> _probe() => ApiClient().dio.get(
      '/probe',
      options: Options(extra: {'retryCount': 3}),
    );

Future<DioException> _probeExpectingError() async {
  try {
    await _probe();
  } on DioException catch (e) {
    return e;
  }
  fail('DioException 이 나야 한다');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    // flutter_test 바인딩은 모든 HttpClient 요청을 400 으로 막는 오버라이드를 심는다 —
    //   로컬 서버에 실제로 닿아야 하므로 해제한다(secure storage 목킹에는 바인딩이 필요해 유지).
    HttpOverrides.global = null;
    // ApiClient 생성자가 appEnv.apiBaseUrl 을 읽는다 — 환경 초기화 후 baseUrl 을 로컬 서버로 교체.
    AppEnvironment.instance.initialize(forceEnvironment: EnvironmentType.local);
    await _startServer();
    ApiClient().dio.options.baseUrl = 'http://127.0.0.1:${_server.port}';
  });

  tearDownAll(() async {
    await _server.close(force: true);
  });

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({
      'access_token': _oldAccess,
      'refresh_token': _oldRefresh,
    });
    _refreshCalls = 0;
    _probeAuthHeaders.clear();
  });

  test('갱신 응답 envelope 을 벗겨 토큰을 저장하고 원 요청을 새 토큰으로 재시도한다', () async {
    _mode = _RefreshMode.envelope;

    final res = await _probe();

    expect(res.statusCode, 200);
    expect(_refreshCalls, 1);
    expect(_probeAuthHeaders, ['Bearer $_oldAccess', 'Bearer $_newAccess']);
    expect(await _stored('access_token'), _newAccess);
    expect(await _stored('refresh_token'), _newRefresh);
  });

  test('갱신 응답(200)에 토큰이 없으면 저장하지 않고 토큰도 지우지 않는다', () async {
    _mode = _RefreshMode.emptyEnvelope;

    final err = await _probeExpectingError();

    expect(err.response?.statusCode, isNot(401));
    expect(await _stored('access_token'), _oldAccess);
    expect(await _stored('refresh_token'), _oldRefresh);
  });

  test('갱신이 5xx 면 토큰을 유지하고 원 요청을 전송 오류로 돌려준다', () async {
    _mode = _RefreshMode.status503;

    final err = await _probeExpectingError();

    expect(err.response?.statusCode, 503);
    expect(await _stored('access_token'), _oldAccess);
    expect(await _stored('refresh_token'), _oldRefresh);
  });

  test('갱신이 429(요청 제한)면 세션 판정으로 보지 않고 토큰을 유지한다', () async {
    _mode = _RefreshMode.status429;

    final err = await _probeExpectingError();

    expect(err.response?.statusCode, 429);
    expect(await _stored('access_token'), _oldAccess);
    expect(await _stored('refresh_token'), _oldRefresh);
  });

  test('갱신 요청이 서버에 닿지 못하면 토큰을 유지하고 연결 오류로 돌려준다', () async {
    _mode = _RefreshMode.drop;

    final err = await _probeExpectingError();

    expect(err.response, isNull);
    expect(await _stored('access_token'), _oldAccess);
    expect(await _stored('refresh_token'), _oldRefresh);
  });

  test('갱신을 서버가 401 로 거부하면 로컬 토큰을 지우고 401 을 그대로 전달한다', () async {
    _mode = _RefreshMode.status401;

    final err = await _probeExpectingError();

    expect(err.response?.statusCode, 401);
    expect(await _stored('access_token'), isNull);
    expect(await _stored('refresh_token'), isNull);
  });
}
