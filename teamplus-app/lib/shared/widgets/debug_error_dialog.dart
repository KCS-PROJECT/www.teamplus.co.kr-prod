import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// 디버그 모드에서 에러 정보를 표시하고 복사할 수 있는 다이얼로그
///
/// kDebugMode일 때만 복사 기능이 활성화됩니다.
class DebugErrorDialog extends StatelessWidget {
  /// 에러 제목
  final String title;

  /// 사용자 친화적 에러 메시지
  final String message;

  /// 기술적 에러 상세 (스택 트레이스, 에러 코드 등)
  final String? technicalDetails;

  /// 에러 코드
  final String? errorCode;

  /// HTTP 상태 코드
  final int? statusCode;

  /// 타임스탬프
  final DateTime? timestamp;

  /// 에러 소스 (어느 화면/기능에서 발생했는지)
  final String? source;

  const DebugErrorDialog({
    super.key,
    this.title = '오류가 발생했습니다',
    required this.message,
    this.technicalDetails,
    this.errorCode,
    this.statusCode,
    this.timestamp,
    this.source,
  });

  /// 에러 정보를 문자열로 포맷팅
  String _formatErrorInfo() {
    final buffer = StringBuffer();
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln('TEAMPLUS ERROR REPORT');
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln();
    buffer.writeln('📅 Timestamp: ${timestamp ?? DateTime.now()}');
    if (source != null) {
      buffer.writeln('📍 Source: $source');
    }
    if (errorCode != null) {
      buffer.writeln('🔢 Error Code: $errorCode');
    }
    if (statusCode != null) {
      buffer.writeln('🌐 HTTP Status: $statusCode');
    }
    buffer.writeln();
    buffer.writeln('─── User Message ───');
    buffer.writeln(message);
    buffer.writeln();
    if (technicalDetails != null && technicalDetails!.isNotEmpty) {
      buffer.writeln('─── Technical Details ───');
      buffer.writeln(technicalDetails);
      buffer.writeln();
    }
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln('App Mode: ${kDebugMode ? 'DEBUG' : 'RELEASE'}');
    buffer.writeln('═══════════════════════════════════════');

    return buffer.toString();
  }

  /// 클립보드에 에러 정보 복사
  Future<void> _copyToClipboard(BuildContext context) async {
    final errorInfo = _formatErrorInfo();

    try {
      await Clipboard.setData(ClipboardData(text: errorInfo));

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.check_circle, color: Colors.white),
                SizedBox(width: 8),
                Text('에러 정보가 클립보드에 복사되었습니다'),
              ],
            ),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.error, color: Colors.white),
                const SizedBox(width: 8),
                Text('복사 실패: $e'),
              ],
            ),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 사용자 메시지
            Text(
              message,
              style: TextStyle(
                fontSize: 15,
                color: Colors.grey[800],
              ),
            ),

            // 디버그 모드에서만 기술적 세부 정보 표시
            if (kDebugMode) ...[
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 8),

              // 디버그 배지
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Colors.orange.shade100,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: Colors.orange.shade300),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.bug_report,
                      size: 16,
                      color: Colors.orange,
                    ),
                    SizedBox(width: 4),
                    Text(
                      'DEBUG MODE',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Colors.orange,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 12),

              // 에러 코드
              if (errorCode != null) _buildInfoRow('Error Code', errorCode!),

              // HTTP 상태
              if (statusCode != null)
                _buildInfoRow('HTTP Status', statusCode.toString()),

              // 소스
              if (source != null) _buildInfoRow('Source', source!),

              // 타임스탬프
              _buildInfoRow(
                'Timestamp',
                (timestamp ?? DateTime.now()).toIso8601String(),
              ),

              // 기술적 상세
              if (technicalDetails != null && technicalDetails!.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text(
                  'Technical Details:',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.grey,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: SelectableText(
                    technicalDetails!,
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: Colors.grey.shade700,
                    ),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
      actions: [
        // 디버그 모드에서만 복사 버튼 표시
        if (kDebugMode)
          TextButton.icon(
            onPressed: () => _copyToClipboard(context),
            icon: const Icon(Icons.copy, size: 18),
            label: const Text('에러 복사'),
            style: TextButton.styleFrom(
              foregroundColor: Colors.blue,
            ),
          ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('확인'),
        ),
      ],
    );
  }

  /// 정보 행 위젯
  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 90,
            child: Text(
              '$label:',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade600,
              ),
            ),
          ),
          Expanded(
            child: SelectableText(
              value,
              style: const TextStyle(
                fontSize: 12,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 에러 다이얼로그 표시 헬퍼 메서드
  static Future<void> show(
    BuildContext context, {
    String title = '오류가 발생했습니다',
    required String message,
    String? technicalDetails,
    String? errorCode,
    int? statusCode,
    String? source,
  }) {
    return showDialog<void>(
      context: context,
      builder: (context) => DebugErrorDialog(
        title: title,
        message: message,
        technicalDetails: technicalDetails,
        errorCode: errorCode,
        statusCode: statusCode,
        timestamp: DateTime.now(),
        source: source,
      ),
    );
  }
}

/// 디버그 모드에서 에러를 표시하는 위젯
/// 인라인으로 에러 정보를 표시하고 복사 기능 제공
class DebugErrorWidget extends StatelessWidget {
  /// 에러 메시지
  final String message;

  /// 기술적 에러 상세
  final String? technicalDetails;

  /// 에러 코드
  final String? errorCode;

  /// HTTP 상태 코드
  final int? statusCode;

  /// 다시 시도 콜백
  final VoidCallback? onRetry;

  /// 에러 소스
  final String? source;

  const DebugErrorWidget({
    super.key,
    required this.message,
    this.technicalDetails,
    this.errorCode,
    this.statusCode,
    this.onRetry,
    this.source,
  });

  /// 에러 정보를 문자열로 포맷팅
  String _formatErrorInfo() {
    final buffer = StringBuffer();
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln('TEAMPLUS ERROR REPORT');
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln();
    buffer.writeln('📅 Timestamp: ${DateTime.now()}');
    if (source != null) {
      buffer.writeln('📍 Source: $source');
    }
    if (errorCode != null) {
      buffer.writeln('🔢 Error Code: $errorCode');
    }
    if (statusCode != null) {
      buffer.writeln('🌐 HTTP Status: $statusCode');
    }
    buffer.writeln();
    buffer.writeln('─── User Message ───');
    buffer.writeln(message);
    buffer.writeln();
    if (technicalDetails != null && technicalDetails!.isNotEmpty) {
      buffer.writeln('─── Technical Details ───');
      buffer.writeln(technicalDetails);
      buffer.writeln();
    }
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln('App Mode: ${kDebugMode ? 'DEBUG' : 'RELEASE'}');
    buffer.writeln('═══════════════════════════════════════');

    return buffer.toString();
  }

  /// 클립보드에 에러 정보 복사
  Future<void> _copyToClipboard(BuildContext context) async {
    final errorInfo = _formatErrorInfo();

    try {
      await Clipboard.setData(ClipboardData(text: errorInfo));

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.check_circle, color: Colors.white),
                SizedBox(width: 8),
                Text('에러 정보가 클립보드에 복사되었습니다'),
              ],
            ),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      debugPrint('클립보드 복사 실패: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.error_outline,
                size: 72,
                color: Colors.red,
              ),
              const SizedBox(height: 24),
              const Text(
                '페이지를 불러올 수 없습니다',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                message,
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey[600],
                ),
                textAlign: TextAlign.center,
              ),

              // 디버그 모드에서만 추가 정보 표시
              if (kDebugMode) ...[
                const SizedBox(height: 16),

                // 디버그 배지
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade100,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: Colors.orange.shade300),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.bug_report,
                        size: 16,
                        color: Colors.orange,
                      ),
                      SizedBox(width: 4),
                      Text(
                        'DEBUG MODE',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Colors.orange,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                // 기술적 상세 (확장 가능)
                if (technicalDetails != null || errorCode != null)
                  Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(maxWidth: 400),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey.shade300),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (errorCode != null)
                          Text(
                            'Error: $errorCode',
                            style: const TextStyle(
                              fontSize: 12,
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        if (statusCode != null)
                          Text(
                            'Status: $statusCode',
                            style: const TextStyle(
                              fontSize: 12,
                              fontFamily: 'monospace',
                            ),
                          ),
                        if (technicalDetails != null) ...[
                          const SizedBox(height: 8),
                          SelectableText(
                            technicalDetails!,
                            style: TextStyle(
                              fontSize: 11,
                              fontFamily: 'monospace',
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
              ],

              const SizedBox(height: 24),

              // 버튼 영역
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // 다시 시도 버튼
                  if (onRetry != null)
                    ElevatedButton.icon(
                      onPressed: onRetry,
                      icon: const Icon(Icons.refresh),
                      label: const Text('다시 시도'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 12,
                        ),
                        textStyle: const TextStyle(fontSize: 14),
                      ),
                    ),

                  // 디버그 모드에서만 복사 버튼 표시
                  if (kDebugMode) ...[
                    if (onRetry != null) const SizedBox(width: 12),
                    OutlinedButton.icon(
                      onPressed: () => _copyToClipboard(context),
                      icon: const Icon(Icons.copy, size: 18),
                      label: const Text('에러 복사'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 12,
                        ),
                        textStyle: const TextStyle(fontSize: 14),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
