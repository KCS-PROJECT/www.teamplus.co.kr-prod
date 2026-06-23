import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/security/biometric_service.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../providers/biometric_provider.dart';

/// 생체인증 설정 화면
/// 프로필 또는 설정 화면에 포함됨
class BiometricSettingsScreen extends ConsumerStatefulWidget {
  const BiometricSettingsScreen({super.key});

  @override
  ConsumerState<BiometricSettingsScreen> createState() =>
      _BiometricSettingsScreenState();
}

class _BiometricSettingsScreenState
    extends ConsumerState<BiometricSettingsScreen> {
  bool _isLoading = false;
  String? _errorMessage;
  String? _successMessage;

  @override
  Widget build(BuildContext context) {
    // 생체인증 가용성 확인
    final availabilityAsync = ref.watch(biometricAvailabilityProvider);
    final biometricEnabled = ref.watch(biometricEnabledProvider);
    final availableBiometricsAsync = ref.watch(availableBiometricsProvider);

    return availabilityAsync.when(
      data: (availability) => availableBiometricsAsync.when(
        data: (biometricTypes) => Scaffold(
          appBar: TeamplusAppBar(
            title: '생체인증 설정',
            backgroundColor: Colors.white,
            foregroundColor: Colors.grey.shade900,
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 📊 생체인증 가용 상태
                _buildAvailabilityCard(availability, biometricTypes),

                const SizedBox(height: 24),

                // 🔐 생체인증 활성화 토글
                if (availability == BiometricAvailability.available)
                  _buildBiometricToggle(biometricEnabled),

                const SizedBox(height: 24),

                // ℹ️ 정보 섹션
                _buildInfoSection(),

                const SizedBox(height: 24),

                // 💡 안내 문구
                _buildGuideSection(),

                // 📝 에러/성공 메시지
                if (_errorMessage != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        border: Border.all(color: Colors.red.shade200),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.error_outline,
                            color: Colors.red.shade600,
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: TextStyle(
                                color: Colors.red.shade700,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                if (_successMessage != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        border: Border.all(color: Colors.green.shade200),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.check_circle_outline,
                            color: Colors.green.shade600,
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _successMessage!,
                              style: TextStyle(
                                color: Colors.green.shade700,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        error: (error, stack) => Scaffold(
          appBar: const TeamplusAppBar(title: '생체인증 설정'),
          body: Center(
            child: Text('생체인증 목록 로드 실패: $error'),
          ),
        ),
        loading: () => Scaffold(
          appBar: const TeamplusAppBar(title: '생체인증 설정'),
          body: const Center(
            child: CircularProgressIndicator(),
          ),
        ),
      ),
      error: (error, stack) => Scaffold(
        appBar: const TeamplusAppBar(title: '생체인증 설정'),
        body: Center(
          child: Text('생체인증 가용성 확인 실패: $error'),
        ),
      ),
      loading: () => Scaffold(
        appBar: const TeamplusAppBar(title: '생체인증 설정'),
        body: const Center(
          child: CircularProgressIndicator(),
        ),
      ),
    );
  }

  /// 생체인증 가용성 카드
  Widget _buildAvailabilityCard(
    BiometricAvailability availability,
    List<String> biometricTypes,
  ) {
    final isAvailable = availability == BiometricAvailability.available;
    final icon = isAvailable ? Icons.check_circle : Icons.info;
    final color = isAvailable ? Colors.green : Colors.orange;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isAvailable ? Colors.green.shade50 : Colors.orange.shade50,
        border: Border.all(
          color: isAvailable ? Colors.green.shade200 : Colors.orange.shade200,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isAvailable ? '생체인증 사용 가능' : '생체인증 미지원',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: color,
                        fontSize: 16,
                      ),
                    ),
                    if (isAvailable && biometricTypes.isNotEmpty)
                      Text(
                        '등록된 생체인증: ${biometricTypes.join(", ")}',
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          if (!isAvailable)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                availability == BiometricAvailability.notAvailable
                    ? '이 기기에서 생체인증이 등록되지 않았습니다.\n기기의 설정 앱에서 생체인증을 등록해주세요.'
                    : '이 기기는 생체인증을 지원하지 않습니다.',
                style: TextStyle(
                  color: Colors.grey.shade700,
                  fontSize: 13,
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// 생체인증 활성화 토글
  Widget _buildBiometricToggle(bool isEnabled) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: Colors.grey.shade200),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '생체인증으로 로그인',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '지문 또는 얼굴인식으로 빠르게 로그인',
                    style: TextStyle(
                      color: Colors.grey.shade500,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
              Switch(
                value: isEnabled,
                onChanged: _isLoading
                    ? null
                    : (value) async {
                        await _toggleBiometric(value);
                      },
                thumbColor: WidgetStateColor.resolveWith(
                  (states) => Colors.blue.shade600,
                ),
              ),
            ],
          ),
        ),
        if (_isLoading)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: SizedBox(
              height: 4,
              child: LinearProgressIndicator(
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                  Colors.blue.shade600,
                ),
              ),
            ),
          ),
      ],
    );
  }

  /// 정보 섹션
  Widget _buildInfoSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '정보',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.grey.shade50,
            border: Border.all(color: Colors.grey.shade200),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildInfoItem(
                '🔒',
                '안전성',
                '생체인증 데이터는 기기에만 저장되며, 서버로 전송되지 않습니다.',
              ),
              const SizedBox(height: 12),
              _buildInfoItem(
                '⚡',
                '속도',
                '생체인증으로 빠르게 로그인할 수 있습니다.',
              ),
              const SizedBox(height: 12),
              _buildInfoItem(
                '🔄',
                '대체 방법',
                '생체인증이 실패하면 비밀번호로 로그인할 수 있습니다.',
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// 정보 항목
  Widget _buildInfoItem(String emoji, String title, String description) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(emoji, style: const TextStyle(fontSize: 16)),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                description,
                style: TextStyle(
                  color: Colors.grey.shade600,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// 안내 섹션
  Widget _buildGuideSection() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        border: Border.all(color: Colors.blue.shade200),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.info_outline,
            color: Colors.blue.shade600,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '팁',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.blue.shade700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '생체인증을 활성화하면 보안이 강화되고 빠른 로그인이 가능합니다. 기기의 생체인증 데이터와 일치해야 로그인됩니다.',
                  style: TextStyle(
                    color: Colors.blue.shade600,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 생체인증 토글 처리
  Future<void> _toggleBiometric(bool enable) async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _successMessage = null;
    });

    try {
      final biometricEnabledNotifier =
          ref.read(biometricEnabledProvider.notifier);

      if (enable) {
        // 생체인증 테스트
        const reason = '생체인증을 활성화하기 위해 인증이 필요합니다.';
        final result = await ref.read(
          biometricAuthenticateProvider(reason).future,
        );

        if (result == BiometricResult.success) {
          // 생체인증 활성화
          await biometricEnabledNotifier.enableBiometric();
          setState(() {
            _successMessage = '생체인증이 활성화되었습니다.';
          });
        } else {
          setState(() {
            _errorMessage = '생체인증 인증에 실패했습니다.';
          });
        }
      } else {
        // 생체인증 비활성화
        await biometricEnabledNotifier.disableBiometric();
        setState(() {
          _successMessage = '생체인증이 비활성화되었습니다.';
        });
      }
    } catch (e) {
      debugPrint('[BiometricSettings] Error: $e');
      setState(() {
        _errorMessage = '오류가 발생했습니다: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
}
