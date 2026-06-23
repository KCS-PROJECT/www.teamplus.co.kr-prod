// MaintenanceService — 시스템 점검 공지(SystemNotice 기반) 단위 테스트
//
// 검증 범위:
//   1) 활성 점검 공지 있으면 점검 중 + 제목/내용/기간 파싱
//   2) maintenance=null 이면 정상 진입
//   3) {data:{maintenance}} 래핑 방어 파싱
//   4) 네트워크/서버 오류 시 fail-open (정상 진입)
//   5) 제목/내용 공백이면 null (점검 중 상태는 유지)
//
// 판정은 서버 시각 기준으로 백엔드가 수행하므로, 응답에 maintenance 객체가 있으면
// 곧 "점검 중"이다(앱은 디바이스 시각으로 재판정하지 않는다).

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:teamplus_app/core/maintenance/maintenance_service.dart';
import 'package:teamplus_app/core/network/api_client.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  late _MockApiClient api;
  late MaintenanceService service;

  setUp(() {
    api = _MockApiClient();
    service = MaintenanceService(api);
  });

  Response<dynamic> resp(dynamic data) => Response<dynamic>(
        requestOptions: RequestOptions(path: '/app/maintenance-notice'),
        data: data,
        statusCode: 200,
      );

  test('활성 점검 공지 있으면 점검 중 + 제목/내용/기간 파싱', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'maintenance': {
          'title': '서비스 점검 안내',
          'content': '02:00~06:00 시스템 점검이 진행됩니다.',
          'startAt': '2026-03-06T02:00:00.000Z',
          'expiresAt': '2026-03-06T06:00:00.000Z',
        },
      }),
    );

    final status = await service.check();

    expect(status.isUnderMaintenance, isTrue);
    expect(status.title, '서비스 점검 안내');
    expect(status.content, '02:00~06:00 시스템 점검이 진행됩니다.');
    expect(status.startAt, isNotNull);
    expect(status.expiresAt, isNotNull);
  });

  test('maintenance=null 이면 정상 진입', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({'maintenance': null}),
    );

    final status = await service.check();

    expect(status.isUnderMaintenance, isFalse);
  });

  test('{data:{maintenance}} 래핑 응답도 파싱', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'data': {
          'maintenance': {'title': '점검', 'content': '내용입니다.'},
        },
      }),
    );

    final status = await service.check();

    expect(status.isUnderMaintenance, isTrue);
    expect(status.title, '점검');
    expect(status.content, '내용입니다.');
  });

  test('네트워크/서버 오류 시 fail-open (정상 진입)', () async {
    when(() => api.get(any())).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/app/maintenance-notice'),
      ),
    );

    final status = await service.check();

    expect(status.isUnderMaintenance, isFalse);
  });

  test('제목/내용이 공백이면 null (점검 중 상태는 유지)', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'maintenance': {'title': '   ', 'content': ''},
      }),
    );

    final status = await service.check();

    expect(status.isUnderMaintenance, isTrue);
    expect(status.title, isNull);
    expect(status.content, isNull);
  });

  test('serverTime(body) → serverNow 파싱(서버 시각 기준)', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'maintenance': {'title': '점검', 'content': '내용'},
        'serverTime': '2026-05-18T09:00:00.000Z',
      }),
    );

    final status = await service.check();

    expect(status.serverNow, isNotNull);
    expect(status.serverNow!.toUtc(), DateTime.utc(2026, 5, 18, 9, 0, 0));
  });

  test('serverTime/Date 헤더 없으면 serverNow=null (점검 상태는 유지)', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'maintenance': {'title': '점검', 'content': '내용'},
      }),
    );

    final status = await service.check();

    expect(status.isUnderMaintenance, isTrue);
    expect(status.serverNow, isNull);
  });

  test('maintenanceReason / createdAt → reason / noticeDate 파싱', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'maintenance': {
          'title': '정기 시스템 점검 안내',
          'content': '점검 안내 본문입니다.',
          'maintenanceReason': '보안 업데이트',
          'createdAt': '2026-05-15T00:00:00.000Z',
        },
      }),
    );

    final status = await service.check();

    expect(status.reason, '보안 업데이트');
    expect(status.noticeDate, isNotNull);
  });

  test('maintenanceReason 공백이면 reason=null', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'maintenance': {'title': '점검', 'content': '내용', 'maintenanceReason': '  '},
      }),
    );

    final status = await service.check();

    expect(status.reason, isNull);
  });

  test('customerCenter → csPhone / csHours 파싱(서버값)', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'maintenance': {'title': '점검', 'content': '내용'},
        'customerCenter': {'phone': '1600-7777', 'hours': '매일 08:00~22:00'},
      }),
    );

    final status = await service.check();

    expect(status.csPhone, '1600-7777');
    expect(status.csHours, '매일 08:00~22:00');
  });

  test('customerCenter 없으면 csPhone/csHours=null (화면이 상수 폴백)', () async {
    when(() => api.get(any())).thenAnswer(
      (_) async => resp({
        'maintenance': {'title': '점검', 'content': '내용'},
      }),
    );

    final status = await service.check();

    expect(status.csPhone, isNull);
    expect(status.csHours, isNull);
  });
}
