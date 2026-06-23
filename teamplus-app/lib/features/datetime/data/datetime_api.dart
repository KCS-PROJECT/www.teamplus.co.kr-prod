import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../../core/network/api_client.dart';

/// Backend `/api/v1/datetime` 응답 DTO
///
/// Web/Admin 와 동일한 데이터 구조. 단일 통합 호출로 8개 포맷 모두 수신한다.
class DateTimeData {
  final String year; // yyyy            ex) "2026"
  final String month; // yyyyMM          ex) "202604"
  final String date; // yyyyMMdd        ex) "20260419"
  final String dateTime; // yyyyMMddHHmm    ex) "202604190920"
  final String dateTimeSecond; // yyyyMMddHHmmss  ex) "20260419092028"
  final String
      dateTimeMillisecond; // yyyyMMddHHmmssSSSS ex) "202604190920280205"
  final List<String> weeklyDates; // 월요일 기준 7일 ex) ["13",...,"19"]
  final List<String> monthlyDates; // 1일 ~ 말일       ex) ["01",...,"30"]
  final String baseDate; // 사용된 기준 날짜 (YYYYMMDD)
  final bool isCustomBase; // baseDate 쿼리 사용 여부
  final String timezone; // 항상 "Asia/Seoul"

  const DateTimeData({
    required this.year,
    required this.month,
    required this.date,
    required this.dateTime,
    required this.dateTimeSecond,
    required this.dateTimeMillisecond,
    required this.weeklyDates,
    required this.monthlyDates,
    required this.baseDate,
    required this.isCustomBase,
    required this.timezone,
  });

  factory DateTimeData.fromJson(Map<String, dynamic> json) {
    return DateTimeData(
      year: json['year'] as String,
      month: json['month'] as String,
      date: json['date'] as String,
      dateTime: json['dateTime'] as String,
      dateTimeSecond: json['dateTimeSecond'] as String,
      dateTimeMillisecond: json['dateTimeMillisecond'] as String,
      weeklyDates: (json['weeklyDates'] as List<dynamic>)
          .map((e) => e as String)
          .toList(growable: false),
      monthlyDates: (json['monthlyDates'] as List<dynamic>)
          .map((e) => e as String)
          .toList(growable: false),
      baseDate: json['baseDate'] as String,
      isCustomBase: json['isCustomBase'] as bool? ?? false,
      timezone: json['timezone'] as String? ?? 'Asia/Seoul',
    );
  }
}

/// DateTime API 클라이언트
///
/// Web/Admin 의 `datetimeService` 와 1:1 대응.
class DateTimeApi {
  final ApiClient _client;

  DateTimeApi(this._client);

  /// 응답 unwrap
  /// - `{ success, data }` 래퍼가 있으면 data 추출
  /// - 그 외에는 body 자체를 raw 데이터로 사용 (TEAMPLUS 표준)
  Map<String, dynamic> _unwrap(Response response) {
    final body = response.data;
    if (body is Map<String, dynamic>) {
      final data = body['data'];
      if (body['success'] == true && data is Map<String, dynamic>) {
        return data;
      }
      return body;
    }
    throw Exception('잘못된 응답 형식: ${response.data}');
  }

  Map<String, dynamic> _query(String? baseDate) {
    return baseDate != null && baseDate.isNotEmpty
        ? <String, dynamic>{'baseDate': baseDate}
        : const <String, dynamic>{};
  }

  /// 통합 8개 포맷 한 번에 조회 (공통 훅이 사용)
  Future<DateTimeData> getAll({String? baseDate}) async {
    try {
      final response = await _client.dio.get<Map<String, dynamic>>(
        '/datetime',
        queryParameters: _query(baseDate),
      );
      return DateTimeData.fromJson(_unwrap(response));
    } on DioException catch (e) {
      debugPrint('[DateTimeApi.getAll] error: ${e.message}');
      rethrow;
    }
  }

  Future<String> getYear({String? baseDate}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/datetime/year',
      queryParameters: _query(baseDate),
    );
    return _unwrap(response)['year'] as String;
  }

  Future<String> getMonth({String? baseDate}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/datetime/month',
      queryParameters: _query(baseDate),
    );
    return _unwrap(response)['month'] as String;
  }

  Future<String> getDate({String? baseDate}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/datetime/date',
      queryParameters: _query(baseDate),
    );
    return _unwrap(response)['date'] as String;
  }

  Future<String> getDateTime({String? baseDate}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/datetime/datetime',
      queryParameters: _query(baseDate),
    );
    return _unwrap(response)['dateTime'] as String;
  }

  Future<String> getDateTimeSecond({String? baseDate}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/datetime/datetime-second',
      queryParameters: _query(baseDate),
    );
    return _unwrap(response)['dateTimeSecond'] as String;
  }

  Future<String> getDateTimeMillisecond({String? baseDate}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/datetime/datetime-millisecond',
      queryParameters: _query(baseDate),
    );
    return _unwrap(response)['dateTimeMillisecond'] as String;
  }

  Future<List<String>> getWeeklyDates({String? baseDate}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/datetime/weekly',
      queryParameters: _query(baseDate),
    );
    return (_unwrap(response)['weeklyDates'] as List<dynamic>)
        .map((e) => e as String)
        .toList(growable: false);
  }

  Future<List<String>> getMonthlyDates({String? baseDate}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/datetime/monthly',
      queryParameters: _query(baseDate),
    );
    return (_unwrap(response)['monthlyDates'] as List<dynamic>)
        .map((e) => e as String)
        .toList(growable: false);
  }
}
