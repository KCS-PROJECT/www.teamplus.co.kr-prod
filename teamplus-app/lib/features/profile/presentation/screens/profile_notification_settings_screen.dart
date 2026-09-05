import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../providers/profile_provider.dart';

/// 알림 설정 화면
///
/// 푸시 알림 항목별 ON/OFF를 제어합니다.
/// 백엔드 `GET /api/v1/notifications/settings` 조회 후
/// `PATCH /api/v1/notifications/settings` 로 저장합니다.
///
/// [2026-07-29] OS 알림 권한 배너 추가 — 여기 토글은 서버 설정일 뿐이라,
/// 기기 알림 권한이 거부된 상태에선 전부 켜도 실제 푸시가 도착하지 않는다.
/// 권한 미허용 시 상단 배너로 알리고 설정 이동을 안내한다 (A5 권한 안내와 동일 패턴).
class ProfileNotificationSettingsScreen extends ConsumerStatefulWidget {
  const ProfileNotificationSettingsScreen({super.key});

  @override
  ConsumerState<ProfileNotificationSettingsScreen> createState() =>
      _ProfileNotificationSettingsScreenState();
}

class _ProfileNotificationSettingsScreenState
    extends ConsumerState<ProfileNotificationSettingsScreen>
    with WidgetsBindingObserver {
  // 로컬 편집 상태 (서버 응답으로 초기화)
  Map<String, bool>? _localSettings;
  bool _isDirty = false;
  bool _isSaving = false;

  /// 기기(OS) 알림 권한이 거부되어 실제 푸시가 차단된 상태인지.
  bool _osPermissionBlocked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkOsNotificationPermission();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// 설정 앱에 다녀온 뒤(resume) 배너 상태를 자동 갱신한다.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkOsNotificationPermission();
    }
  }

  Future<void> _checkOsNotificationPermission() async {
    try {
      final status = await Permission.notification.status;
      final blocked = status.isDenied ||
          status.isPermanentlyDenied ||
          status.isRestricted;
      if (mounted && blocked != _osPermissionBlocked) {
        setState(() => _osPermissionBlocked = blocked);
      }
    } catch (_) {
      // 상태 조회 실패는 배너 미표시로 폴백 (기능 차단 없음)
    }
  }

  /// 서버 응답 → 로컬 상태 초기화 (최초 1회)
  void _initLocalSettings(Map<String, dynamic> serverSettings) {
    if (_localSettings != null) return; // 이미 초기화됨
    _localSettings = {
      'pushEnabled': (serverSettings['pushEnabled'] ?? true) as bool,
      'attendanceAlert': (serverSettings['attendanceAlert'] ?? true) as bool,
      'paymentAlert': (serverSettings['paymentAlert'] ?? true) as bool,
      'classReminder': (serverSettings['classReminder'] ?? true) as bool,
      'eventAlert': (serverSettings['eventAlert'] ?? true) as bool,
      'marketingAlert': (serverSettings['marketingAlert'] ?? false) as bool,
    };
  }

  void _toggle(String key, bool value) {
    setState(() {
      _localSettings![key] = value;
      _isDirty = true;

      // 전체 푸시를 OFF하면 하위 항목도 모두 OFF
      if (key == 'pushEnabled' && !value) {
        _localSettings!['attendanceAlert'] = false;
        _localSettings!['paymentAlert'] = false;
        _localSettings!['classReminder'] = false;
        _localSettings!['eventAlert'] = false;
        _localSettings!['marketingAlert'] = false;
      }
      // 하위 항목 중 하나라도 ON이면 전체 푸시도 ON
      if (key != 'pushEnabled' && value) {
        _localSettings!['pushEnabled'] = true;
      }
    });
  }

  Future<void> _save() async {
    if (!_isDirty || _localSettings == null) return;
    setState(() => _isSaving = true);

    try {
      await ref
          .read(updateNotificationSettingsProvider(_localSettings!).future);

      // 서버 캐시 갱신
      ref.invalidate(notificationSettingsProvider);

      setState(() => _isDirty = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('알림 설정이 저장되었습니다.'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('알림 설정 저장에 실패했습니다. 다시 시도해주세요.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final settingsAsync = ref.watch(notificationSettingsProvider);

    return Scaffold(
      appBar: TeamplusAppBar(
        title: '알림 설정',
        actions: [
          if (_isDirty)
            TextButton(
              onPressed: _isSaving ? null : _save,
              child: _isSaving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.primary,
                      ),
                    )
                  : const Text(
                      '저장',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
            ),
        ],
      ),
      body: settingsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 12),
              const Text('설정을 불러올 수 없습니다.'),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => ref.invalidate(notificationSettingsProvider),
                child: const Text('다시 시도'),
              ),
            ],
          ),
        ),
        data: (serverSettings) {
          _initLocalSettings(serverSettings);
          final s = _localSettings!;
          final pushOn = s['pushEnabled']!;

          return SafeArea(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                // ── OS 알림 권한 배너 (권한 거부 시에만) ────
                if (_osPermissionBlocked) _buildOsPermissionBanner(),

                // ── 전체 푸시 알림 ──────────────────────────
                _buildSection(
                  children: [
                    _buildSwitchTile(
                      icon: Icons.notifications_outlined,
                      iconColor: AppColors.primary,
                      title: '푸시 알림',
                      subtitle: '앱 푸시 알림을 받습니다',
                      value: pushOn,
                      onChanged: (v) => _toggle('pushEnabled', v),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // ── 알림 항목 ─────────────────────────────
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Text(
                    '알림 항목',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.hintText,
                    ),
                  ),
                ),
                _buildSection(
                  children: [
                    _buildSwitchTile(
                      icon: Icons.qr_code_scanner,
                      iconColor: AppColors.success,
                      title: '출석 알림',
                      subtitle: '수업 체크인·체크아웃 알림',
                      value: s['attendanceAlert']!,
                      enabled: pushOn,
                      onChanged: (v) => _toggle('attendanceAlert', v),
                    ),
                    const Divider(height: 1, indent: 56),
                    _buildSwitchTile(
                      icon: Icons.credit_card_outlined,
                      iconColor: AppColors.warning,
                      title: '결제 알림',
                      subtitle: '결제 완료 및 결제권 변동 알림',
                      value: s['paymentAlert']!,
                      enabled: pushOn,
                      onChanged: (v) => _toggle('paymentAlert', v),
                    ),
                    const Divider(height: 1, indent: 56),
                    _buildSwitchTile(
                      icon: Icons.event_outlined,
                      iconColor: AppColors.info,
                      title: '수업 리마인더',
                      subtitle: '수업 시작 전 알림',
                      value: s['classReminder']!,
                      enabled: pushOn,
                      onChanged: (v) => _toggle('classReminder', v),
                    ),
                    const Divider(height: 1, indent: 56),
                    _buildSwitchTile(
                      icon: Icons.emoji_events_outlined,
                      iconColor: const Color(0xFFB45309),
                      title: '이벤트 알림',
                      subtitle: '대회·매치·클럽 이벤트 알림',
                      value: s['eventAlert']!,
                      enabled: pushOn,
                      onChanged: (v) => _toggle('eventAlert', v),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // ── 마케팅 ────────────────────────────────
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Text(
                    '마케팅',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.hintText,
                    ),
                  ),
                ),
                _buildSection(
                  children: [
                    _buildSwitchTile(
                      icon: Icons.campaign_outlined,
                      iconColor: AppColors.lightText,
                      title: '마케팅 알림',
                      subtitle: '프로모션·신규 서비스 정보 알림',
                      value: s['marketingAlert']!,
                      enabled: pushOn,
                      onChanged: (v) => _toggle('marketingAlert', v),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }

  /// OS 알림 권한 거부 상태 안내 배너 — 토글(서버 설정)과 무관하게 실제 푸시가
  /// 차단되어 있음을 알리고 설정 이동을 안내한다.
  Widget _buildOsPermissionBanner() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border:
            Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.notifications_off_outlined,
              size: 20, color: AppColors.warning),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              '기기 알림 권한이 꺼져 있어\n푸시 알림이 도착하지 않아요.',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
          ),
          TextButton(
            onPressed: openAppSettings,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              minimumSize: const Size(0, 36),
            ),
            child: const Text(
              '설정으로 이동',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection({required List<Widget> children}) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.borderColor, width: 1),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildSwitchTile({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required bool value,
    bool enabled = true,
    required ValueChanged<bool> onChanged,
  }) {
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: iconColor.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon,
            size: 20, color: enabled ? iconColor : AppColors.hintText),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: enabled ? AppColors.darkText : AppColors.hintText,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(
          fontSize: 12,
          color: AppColors.hintText,
        ),
      ),
      trailing: Switch(
        value: value && enabled,
        onChanged: enabled ? onChanged : null,
        thumbColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? AppColors.primary : null),
        trackColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected)
                ? AppColors.primary.withValues(alpha: 0.4)
                : null),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    );
  }
}
