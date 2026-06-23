import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../../shared/widgets/app_input.dart';
import '../providers/profile_provider.dart';

/// 비밀번호 변경 화면
///
/// 현재 비밀번호 확인 후 새 비밀번호로 변경합니다.
/// 백엔드 `PATCH /api/v1/auth/change-password` 를 호출합니다.
class ProfilePasswordScreen extends ConsumerStatefulWidget {
  const ProfilePasswordScreen({super.key});

  @override
  ConsumerState<ProfilePasswordScreen> createState() =>
      _ProfilePasswordScreenState();
}

class _ProfilePasswordScreenState extends ConsumerState<ProfilePasswordScreen> {
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _isSaving = false;
  String? _currentPasswordError;
  String? _newPasswordError;
  String? _confirmPasswordError;

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  bool _validate() {
    bool valid = true;

    // 현재 비밀번호
    if (_currentPasswordController.text.isEmpty) {
      setState(() => _currentPasswordError = '현재 비밀번호를 입력해주세요.');
      valid = false;
    } else {
      setState(() => _currentPasswordError = null);
    }

    // 새 비밀번호 (최소 8자, 영문+숫자+특수문자)
    final newPwd = _newPasswordController.text;
    if (newPwd.isEmpty) {
      setState(() => _newPasswordError = '새 비밀번호를 입력해주세요.');
      valid = false;
    } else if (newPwd.length < 8) {
      setState(() => _newPasswordError = '비밀번호는 8자 이상이어야 합니다.');
      valid = false;
    } else if (!RegExp(
            r'^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$')
        .hasMatch(newPwd)) {
      setState(() => _newPasswordError = '영문, 숫자, 특수문자를 포함하여 8자 이상 입력해주세요.');
      valid = false;
    } else if (newPwd == _currentPasswordController.text) {
      setState(() => _newPasswordError = '새 비밀번호는 현재 비밀번호와 달라야 합니다.');
      valid = false;
    } else {
      setState(() => _newPasswordError = null);
    }

    // 새 비밀번호 확인
    if (_confirmPasswordController.text.isEmpty) {
      setState(() => _confirmPasswordError = '새 비밀번호를 한 번 더 입력해주세요.');
      valid = false;
    } else if (_confirmPasswordController.text != newPwd) {
      setState(() => _confirmPasswordError = '비밀번호가 일치하지 않습니다.');
      valid = false;
    } else {
      setState(() => _confirmPasswordError = null);
    }

    return valid;
  }

  Future<void> _changePassword() async {
    if (!_validate()) return;
    setState(() => _isSaving = true);

    try {
      await ref.read(changePasswordProvider((
        currentPassword: _currentPasswordController.text,
        newPassword: _newPasswordController.text,
      )).future);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('비밀번호가 변경되었습니다.'),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        // 현재 비밀번호 불일치 가능성 높음
        setState(() => _currentPasswordError = '현재 비밀번호가 올바르지 않습니다.');
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('비밀번호 변경에 실패했습니다. 현재 비밀번호를 확인해주세요.'),
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
    return Scaffold(
      appBar: const TeamplusAppBar(title: '비밀번호 변경'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 안내 문구
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.info.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: AppColors.info.withValues(alpha: 0.2),
                    width: 1,
                  ),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.info_outline,
                      size: 18,
                      color: AppColors.info,
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '안전한 비밀번호 사용을 위해 영문, 숫자, 특수문자를 조합하여 8자 이상 설정하세요.',
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.darkText,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // 현재 비밀번호
              PasswordTextField(
                controller: _currentPasswordController,
                labelText: '현재 비밀번호',
                hintText: '현재 비밀번호를 입력하세요',
                errorText: _currentPasswordError,
                onChanged: (_) {
                  if (_currentPasswordError != null) {
                    setState(() => _currentPasswordError = null);
                  }
                },
              ),
              const SizedBox(height: 20),

              // 새 비밀번호
              PasswordTextField(
                controller: _newPasswordController,
                labelText: '새 비밀번호',
                hintText: '영문 + 숫자 + 특수문자 8자 이상',
                errorText: _newPasswordError,
                onChanged: (_) {
                  if (_newPasswordError != null) {
                    setState(() => _newPasswordError = null);
                  }
                  // 확인 필드도 다시 검사
                  if (_confirmPasswordController.text.isNotEmpty &&
                      _confirmPasswordError != null) {
                    setState(() => _confirmPasswordError = null);
                  }
                },
              ),
              const SizedBox(height: 20),

              // 새 비밀번호 확인
              PasswordTextField(
                controller: _confirmPasswordController,
                labelText: '새 비밀번호 확인',
                hintText: '새 비밀번호를 한 번 더 입력하세요',
                errorText: _confirmPasswordError,
                onChanged: (_) {
                  if (_confirmPasswordError != null) {
                    setState(() => _confirmPasswordError = null);
                  }
                },
              ),
              const SizedBox(height: 40),

              // 변경 버튼
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isSaving ? null : _changePassword,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.white,
                    disabledBackgroundColor:
                        AppColors.primary.withValues(alpha: 0.5),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: _isSaving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.white,
                          ),
                        )
                      : const Text(
                          '비밀번호 변경하기',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
