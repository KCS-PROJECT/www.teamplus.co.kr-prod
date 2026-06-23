import 'dart:io' show HttpDate;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/api_constants.dart';
import '../network/api_client.dart';
import '../providers/shared_providers.dart';

/// 시스템 점검(유지보수) 상태 스냅샷.
///
/// 점검 출처 SoT: 관리자가 등록한 점검 공지(SystemNotice, targetType=maintenance).
/// 점검 여부 판정은 **서버 시각** 기준으로 백엔드가 수행하며, 앱은 그 결과(활성 공지
/// 존재 여부)만 사용한다 → 단말 시계 오차/조작과 무관(2026-06-07 "서버시간 기준" 지시).
class MaintenanceStatus {
  const MaintenanceStatus({
    required this.isUnderMaintenance,
    this.title,
    this.content,
    this.startAt,
    this.expiresAt,
    this.serverNow,
    this.reason,
    this.noticeDate,
    this.csPhone,
    this.csHours,
  });

  /// 점검 진행 중 여부(서버 판정 결과).
  final bool isUnderMaintenance;

  /// 관리자가 등록한 점검 공지 제목.
  final String? title;

  /// 관리자가 등록한 점검 공지 내용(길 수 있음 → 화면에서 스크롤).
  final String? content;

  /// 점검 시작 일시(표시용 · 단말 로컬 시각으로 변환됨).
  final DateTime? startAt;

  /// 점검 종료 일시(표시용 · 단말 로컬 시각으로 변환됨).
  final DateTime? expiresAt;

  /// 서버 현재 시각(표시용 · 단말 로컬 시각으로 변환됨).
  /// 응답 `serverTime`(ISO8601) 또는 HTTP `Date` 헤더에서 파싱한다.
  /// 화면이 '예상 완료' 등 시각 표시를 단말 시계가 아닌 서버 기준으로 판정하는 데 쓴다.
  final DateTime? serverNow;

  /// 점검 사유(관리자 입력 · 정보 카드 '점검사유' 행). 없으면 행 숨김.
  final String? reason;

  /// 공지 등록 일시(createdAt · 단말 로컬 시각). 공지 상세 카드 날짜 표시용.
  final DateTime? noticeDate;

  /// 고객센터 전화번호(서버 AppSettings.supportPhone). 없으면 화면이 기본 상수로 폴백.
  final String? csPhone;

  /// 고객센터 운영시간(서버 AppSettings.supportHours). 없으면 화면이 기본 상수로 폴백.
  final String? csHours;

  /// fail-open 기본값 — 조회 실패/타임아웃 시 "점검 아님"으로 간주해 정상 진입.
  static const MaintenanceStatus none =
      MaintenanceStatus(isUnderMaintenance: false);
}

/// 시스템 점검 상태 조회 — 단일 진입점(SoT).
///
/// 백엔드 `GET /api/v1/app/maintenance-notice`(@Public)가 **서버 시각** 기준으로
/// 활성 점검 공지(제목/내용/시작/종료)를 1건 반환한다. 응답이 비면 점검 아님.
///
/// 호출 지점(둘 다 이 서비스를 재사용):
/// - 앱 시작: `InitialDestinationGate` — 점검 중이면 M4 화면 고정(진입 차단)
/// - 포그라운드 복귀: `app.dart _onAppResumed` — 점검 중이면 닫기 안내 알럿
///
/// 정책(2026-06-07 사용자 승인):
/// - 점검 출처 = 점검 공지(SystemNotice) 기간. (AppSettings.maintenanceMode 대체)
/// - 판정 기준 = 서버 시각.
/// - 네트워크/서버 오류·타임아웃 시 **fail-open** → 정상 진입.
class MaintenanceService {
  MaintenanceService(this._apiClient);

  final ApiClient _apiClient;

  /// 점검 검사 전용 짧은 타임아웃 — 앱 시작/복귀 지연 최소화.
  /// fail-open 정책이므로 초과 시 정상 진입.
  static const Duration _timeout = Duration(seconds: 3);

  Future<MaintenanceStatus> check() async {
    try {
      final response = await _apiClient
          .get(ApiConstants.maintenanceNoticeEndpoint)
          .timeout(_timeout);

      final body = response.data;
      final Map<String, dynamic>? root =
          body is Map<String, dynamic> ? body : null;
      if (root == null) return MaintenanceStatus.none;

      // 응답 형태: { maintenance: {...}|null } 또는 { data: { maintenance: {...} } }
      dynamic raw = root['maintenance'];
      if (raw == null && root['data'] is Map<String, dynamic>) {
        raw = (root['data'] as Map<String, dynamic>)['maintenance'];
      }
      if (raw is! Map<String, dynamic>) return MaintenanceStatus.none;

      // 활성 점검 공지 존재 → 점검 중 (판정은 서버가 서버 시각으로 이미 수행).
      final title = (raw['title'] as String?)?.trim();
      final content = (raw['content'] as String?)?.trim();
      final reason = (raw['maintenanceReason'] as String?)?.trim();

      // 고객센터 안내(서버 AppSettings) — maintenance 와 형제 레벨(root 또는 data 래퍼).
      Map<String, dynamic>? cc =
          root['customerCenter'] as Map<String, dynamic>?;
      if (cc == null && root['data'] is Map<String, dynamic>) {
        cc = (root['data'] as Map<String, dynamic>)['customerCenter']
            as Map<String, dynamic>?;
      }

      return MaintenanceStatus(
        isUnderMaintenance: true,
        title: (title != null && title.isNotEmpty) ? title : null,
        content: (content != null && content.isNotEmpty) ? content : null,
        startAt: _parseDate(raw['startAt']),
        expiresAt: _parseDate(raw['expiresAt']),
        // 서버 현재 시각 — 응답 serverTime 우선, 없으면 HTTP Date 헤더 폴백.
        serverNow: _parseServerNow(root, response.headers.value('date')),
        reason: (reason != null && reason.isNotEmpty) ? reason : null,
        noticeDate: _parseDate(raw['createdAt']),
        csPhone: _nonEmptyStr(cc?['phone']),
        csHours: _nonEmptyStr(cc?['hours']),
      );
    } catch (_) {
      // fail-open — 점검 아님으로 간주하고 정상 진입.
      return MaintenanceStatus.none;
    }
  }

  /// ISO 8601 문자열 → 단말 로컬 DateTime(표시용). 실패 시 null.
  static DateTime? _parseDate(dynamic value) {
    if (value is String && value.isNotEmpty) {
      return DateTime.tryParse(value)?.toLocal();
    }
    return null;
  }

  /// 문자열 trim 후 비어있으면 null.
  static String? _nonEmptyStr(dynamic value) {
    final s = value is String ? value.trim() : null;
    return (s != null && s.isNotEmpty) ? s : null;
  }

  /// 서버 현재 시각 — 응답 body `serverTime`(ISO8601, `data` 래퍼 방어) 우선,
  /// 없으면 HTTP `Date` 응답 헤더(RFC 7231/GMT)에서 파싱. 둘 다 실패 시 null.
  /// 단말 시계와 무관하게 화면의 시각 표시를 서버 기준으로 맞추기 위함.
  static DateTime? _parseServerNow(
    Map<String, dynamic> root,
    String? dateHeader,
  ) {
    dynamic raw = root['serverTime'];
    if (raw == null && root['data'] is Map<String, dynamic>) {
      raw = (root['data'] as Map<String, dynamic>)['serverTime'];
    }
    if (raw is String && raw.isNotEmpty) {
      final dt = DateTime.tryParse(raw);
      if (dt != null) return dt.toLocal();
    }
    if (dateHeader != null && dateHeader.isNotEmpty) {
      try {
        return HttpDate.parse(dateHeader).toLocal();
      } catch (_) {
        // 헤더 형식 불일치 — 무시.
      }
    }
    return null;
  }
}

/// 시스템 점검 조회 서비스 provider.
final maintenanceServiceProvider = Provider<MaintenanceService>(
  (ref) => MaintenanceService(ref.read(apiClientProvider)),
);
