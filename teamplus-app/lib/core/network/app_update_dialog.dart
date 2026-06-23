import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../ui/dim_dialog.dart';
import 'app_version_service.dart';

/// 앱 업데이트 다이얼로그
///
/// 강제 업데이트: 닫기 불가, 스토어 이동만 허용
/// 선택적 업데이트: 닫기 가능
class AppUpdateDialog extends StatelessWidget {
  final VersionCompareResult updateType;
  final AppVersionInfo versionInfo;

  const AppUpdateDialog({
    super.key,
    required this.updateType,
    required this.versionInfo,
  });

  bool get _isForceUpdate => updateType == VersionCompareResult.forceUpdate;

  String get _storeUrl {
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return versionInfo.iosStoreUrl ??
          'https://apps.apple.com/kr/app/id0000000000';
    }
    return versionInfo.androidStoreUrl ??
        'https://play.google.com/store/apps/details?id=com.teamplus.app';
  }

  Future<void> _openStore() async {
    final uri = Uri.parse(_storeUrl);
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        debugPrint('[AppUpdateDialog] 스토어 URL 열기 실패: $_storeUrl');
      }
    } catch (e) {
      debugPrint('[AppUpdateDialog] 스토어 열기 오류: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // 강제 업데이트 시 뒤로가기 비활성화
      canPop: !_isForceUpdate,
      onPopInvokedWithResult: (didPop, result) {
        if (_isForceUpdate && !didPop) {
          // 강제 업데이트 중 뒤로가기 시 앱 종료 안내
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('업데이트 후 사용하실 수 있습니다.'),
              duration: Duration(seconds: 2),
            ),
          );
        }
      },
      child: AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        contentPadding: EdgeInsets.zero,
        content: _buildContent(context),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 상단 아이콘 영역
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 28),
          decoration: const BoxDecoration(
            color: Color(0xFF1E3FAE),
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(16),
              topRight: Radius.circular(16),
            ),
          ),
          child: Column(
            children: [
              const Icon(
                Icons.system_update_rounded,
                size: 56,
                color: Colors.white,
              ),
              const SizedBox(height: 8),
              Text(
                _isForceUpdate ? '필수 업데이트' : '새 버전 출시',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),

        // 본문
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _isForceUpdate
                    ? '서비스 이용을 위해 최신 버전으로 업데이트해 주세요.'
                    : '더 나은 서비스를 위해 새 버전으로 업데이트하세요.',
                style: const TextStyle(
                  fontSize: 14,
                  color: Color(0xFF374151),
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
              if (versionInfo.updateMessage != null &&
                  versionInfo.updateMessage!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    versionInfo.updateMessage!,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF6B7280),
                      height: 1.4,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '현재: ${versionInfo.currentVersion}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF9CA3AF),
                    ),
                  ),
                  const Text(
                    ' → ',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF9CA3AF),
                    ),
                  ),
                  Text(
                    '최신: ${versionInfo.latestVersion}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF1E3FAE),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // 버튼 영역
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            children: [
              // 업데이트 버튼
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _openStore,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1E3FAE),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    elevation: 0,
                  ),
                  child: const Text(
                    '지금 업데이트',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),

              // 강제 업데이트: 앱 종료 버튼 / 선택적 업데이트: 나중에 버튼
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () {
                    if (_isForceUpdate) {
                      // 강제 업데이트: 앱 종료
                      SystemNavigator.pop();
                    } else {
                      // 선택적 업데이트: 다이얼로그 닫기
                      Navigator.of(context).pop();
                    }
                  },
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    foregroundColor: _isForceUpdate
                        ? const Color(0xFFDC2626)
                        : const Color(0xFF6B7280),
                  ),
                  child: Text(
                    _isForceUpdate ? '앱 종료' : '나중에',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// 업데이트 다이얼로그 표시 유틸리티
class AppUpdateDialogHelper {
  /// 업데이트 다이얼로그 표시
  ///
  /// [context]: BuildContext
  /// [updateType]: 업데이트 타입 (강제/선택적)
  /// [versionInfo]: 버전 정보
  static Future<void> show({
    required BuildContext context,
    required VersionCompareResult updateType,
    required AppVersionInfo versionInfo,
  }) async {
    if (!context.mounted) return;

    await showDimDialog<void>(
      context: context,
      barrierDismissible: updateType != VersionCompareResult.forceUpdate,
      builder: (context) => AppUpdateDialog(
        updateType: updateType,
        versionInfo: versionInfo,
      ),
    );
  }
}
