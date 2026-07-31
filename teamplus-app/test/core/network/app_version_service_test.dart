// AppVersionService 단위 테스트.
//
// 핵심 회귀 방지 대상:
//  1) 서버 전역 ResponseEnvelopeInterceptor 래핑({success, requestId, data})
//     해제 — 최상위에서 읽으면 전부 기본값(0.0.0)이 되어 게이트가 조용히
//     무력화된다 (2026-07-30 DEV 실측으로 확인된 실제 장애).
//  2) 자기 플랫폼(platform=ios|android) 쿼리 전달 — 서버가 플랫폼별 행으로
//     판정값을 내려주는 계약의 클라이언트측 절반.
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:teamplus_app/core/network/app_version_service.dart';

class _MockDio extends Mock implements Dio {}

Response<dynamic> _response(dynamic data) => Response<dynamic>(
      requestOptions: RequestOptions(path: '/app/versions/latest'),
      statusCode: 200,
      data: data,
    );

const _payload = <String, dynamic>{
  'currentVersion': '1.0.2',
  'minimumVersion': '1.8.0',
  'latestVersion': '2.0.0',
  'forceUpdate': true,
  'updateMessage': '안정성 개선',
  'iosStoreUrl': 'https://apps.apple.com/kr/app/id1',
  'androidStoreUrl': 'https://play.google.com/store/apps/details?id=a',
};

void main() {
  late _MockDio dio;

  setUp(() {
    dio = _MockDio();
  });

  AppVersionService service({TargetPlatform platform = TargetPlatform.android}) =>
      AppVersionService(dio: dio, platformOverride: platform);

  void stubGet(dynamic data) {
    when(() => dio.get<dynamic>(
          any(),
          queryParameters: any(named: 'queryParameters'),
        )).thenAnswer((_) async => _response(data));
  }

  group('envelope 해제', () {
    test('{success, requestId, data} 래핑 응답 → data 내부 값으로 파싱', () async {
      stubGet(<String, dynamic>{
        'success': true,
        'requestId': 'req-1',
        'data': _payload,
      });

      final info = await service().fetchLatestVersionInfo();

      expect(info, isNotNull);
      expect(info!.minimumVersion, '1.8.0');
      expect(info.latestVersion, '2.0.0');
      expect(info.forceUpdate, isTrue);
      expect(info.androidStoreUrl, contains('play.google.com'));
    });

    test('비래핑(플랫) 응답도 방어적으로 파싱', () async {
      stubGet(_payload);

      final info = await service().fetchLatestVersionInfo();

      expect(info, isNotNull);
      expect(info!.minimumVersion, '1.8.0');
    });

    test('Map 이 아닌 응답 → null (fail-open)', () async {
      stubGet('unexpected');

      expect(await service().fetchLatestVersionInfo(), isNull);
    });
  });

  group('플랫폼 쿼리 전달', () {
    test('Android → platform=android 로 요청', () async {
      stubGet(_payload);

      await service(platform: TargetPlatform.android).fetchLatestVersionInfo();

      final captured = verify(() => dio.get<dynamic>(
            any(),
            queryParameters: captureAny(named: 'queryParameters'),
          )).captured.single as Map<String, dynamic>;
      expect(captured['platform'], 'android');
    });

    test('iOS → platform=ios 로 요청', () async {
      stubGet(_payload);

      await service(platform: TargetPlatform.iOS).fetchLatestVersionInfo();

      final captured = verify(() => dio.get<dynamic>(
            any(),
            queryParameters: captureAny(named: 'queryParameters'),
          )).captured.single as Map<String, dynamic>;
      expect(captured['platform'], 'ios');
    });
  });
}
