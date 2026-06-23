import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/upload/upload_service.dart';
import '../../../../core/utils/image_url.dart';
import '../../../../core/storage/file_storage_service.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../../../shared/widgets/app_input.dart';
import '../providers/profile_provider.dart';

/// 프로필 정보 수정 화면
///
/// 이름·휴대폰 번호·프로필 사진을 수정하고 백엔드 API를 호출합니다.
/// - 프로필 사진: `POST /api/v1/files/upload` (category=AVATAR) → avatarUrl 획득
///   → `PUT /api/v1/users/me/profile` 의 avatarUrl 필드로 저장
class ProfileEditScreen extends ConsumerStatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  ConsumerState<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends ConsumerState<ProfileEditScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _uploadService = UploadService();
  final _imagePicker = ImagePicker();

  bool _initialized = false;
  bool _isSaving = false;
  bool _isUploadingAvatar = false;
  String? _nameError;
  String? _phoneError;
  String? _avatarUrl; // 서버에 저장된 아바타 URL (초기값 = 프로필에서 로드)
  File? _localAvatarFile; // 사용자가 선택했지만 아직 업로드 전 파일

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  // ──────────────────────────────────────────────────────────
  // 프로필 사진 선택 및 업로드
  // ──────────────────────────────────────────────────────────

  Future<void> _changeAvatar() async {
    // 갤러리 또는 카메라 선택 시트
    final source = await _showImageSourceSheet();
    if (source == null) return;

    XFile? picked;
    try {
      picked = await _imagePicker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 800,
        maxHeight: 800,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('사진 접근 권한이 필요합니다. 설정에서 허용해주세요.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
      return;
    }

    if (picked == null) return; // 사용자 취소

    setState(() {
      _localAvatarFile = File(picked!.path);
      _isUploadingAvatar = true;
    });

    try {
      final uploaded = await _uploadService.uploadFile(
        localPath: picked.path,
        category: UploadCategory.avatar,
        refType: 'USER',
        originalName: picked.name,
      );

      setState(() => _avatarUrl = uploaded.url);

      // 서버 프로필에 avatarUrl 즉시 반영 (이름/전화는 저장하기 버튼 사용)
      await ref.read(updateAvatarProvider(uploaded.url).future);
      ref.invalidate(myProfileProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('프로필 사진이 변경되었습니다.'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } on UploadException catch (e) {
      setState(() => _localAvatarFile = null); // 미리보기 롤백
      if (mounted) {
        final msg =
            e.code == 'PERMISSION_DENIED' || e.code == 'PERMISSION_BLOCKED'
                ? '사진 접근 권한이 거부되었습니다. 설정에서 허용해주세요.'
                : e.code == 'CANCELLED'
                    ? '사진 선택이 취소되었습니다.'
                    : '사진 업로드에 실패했습니다. 다시 시도해주세요.';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppColors.error),
        );
      }
    } catch (_) {
      setState(() => _localAvatarFile = null);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('사진 업로드 중 오류가 발생했습니다. 다시 시도해주세요.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploadingAvatar = false);
    }
  }

  Future<ImageSource?> _showImageSourceSheet() {
    return showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.borderColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('갤러리에서 선택'),
              onTap: () => Navigator.of(context).pop(ImageSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('카메라로 촬영'),
              onTap: () => Navigator.of(context).pop(ImageSource.camera),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  bool _validate() {
    bool valid = true;

    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _nameError = '이름을 입력해주세요.');
      valid = false;
    } else if (name.length < 2) {
      setState(() => _nameError = '이름은 2자 이상 입력해주세요.');
      valid = false;
    } else {
      setState(() => _nameError = null);
    }

    final phone = _phoneController.text.trim();
    // 빈 값 허용 (선택 항목). 입력한 경우만 형식 검사
    if (phone.isNotEmpty) {
      final digits = phone.replaceAll('-', '').replaceAll(' ', '');
      if (!RegExp(r'^01[0-9]\d{7,8}$').hasMatch(digits)) {
        setState(() => _phoneError = '올바른 휴대폰 번호를 입력해주세요. 예) 010-1234-5678');
        valid = false;
      } else {
        setState(() => _phoneError = null);
      }
    } else {
      setState(() => _phoneError = null);
    }

    return valid;
  }

  Future<void> _save() async {
    if (!_validate()) return;
    setState(() => _isSaving = true);

    try {
      await ref.read(updateProfileProvider({
        'name': _nameController.text.trim(),
        if (_phoneController.text.trim().isNotEmpty)
          'phone': _phoneController.text.trim(),
      }).future);

      // 캐시된 프로필 갱신
      ref.invalidate(myProfileProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('프로필이 수정되었습니다.'),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('저장에 실패했습니다. 다시 시도해주세요.'),
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
    final profileAsync = ref.watch(myProfileProvider);

    return Scaffold(
      appBar: const TeamplusAppBar(title: '프로필 수정'),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: AppColors.error),
              const SizedBox(height: 12),
              const Text('정보를 불러올 수 없습니다.'),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => ref.invalidate(myProfileProvider),
                child: const Text('다시 시도'),
              ),
            ],
          ),
        ),
        data: (profile) {
          // 최초 1회만 초기화 (재빌드 시 입력값 덮어쓰기 방지)
          if (!_initialized) {
            _nameController.text = profile?['name'] ?? '';
            _phoneController.text = profile?['phone'] ?? '';
            _avatarUrl = profile?['avatarUrl'] as String?;
            _initialized = true;
          }

          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 프로필 아바타
                  Center(
                    child: Stack(
                      children: [
                        Container(
                          width: 90,
                          height: 90,
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.1),
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: AppColors.borderColor,
                              width: 1,
                            ),
                          ),
                          child: ClipOval(
                            child: _localAvatarFile != null
                                // 선택 후 업로드 전 로컬 미리보기
                                ? Image.file(
                                    _localAvatarFile!,
                                    width: 90,
                                    height: 90,
                                    fit: BoxFit.cover,
                                  )
                                : _avatarUrl != null && _avatarUrl!.isNotEmpty
                                    // 서버 아바타 URL — origin 기준 절대화 (path suffix 회피)
                                    ? Image.network(
                                        absoluteImageUrl(_avatarUrl)!,
                                        width: 90,
                                        height: 90,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, __, ___) =>
                                            const Icon(
                                          Icons.person,
                                          size: 48,
                                          color: AppColors.primary,
                                        ),
                                      )
                                    // 기본 아이콘
                                    : const Icon(
                                        Icons.person,
                                        size: 48,
                                        color: AppColors.primary,
                                      ),
                          ),
                        ),
                        // 카메라 배지 — 업로드 중에는 로딩 표시
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: _isUploadingAvatar
                                  ? AppColors.primary.withValues(alpha: 0.6)
                                  : AppColors.primary,
                              shape: BoxShape.circle,
                              border:
                                  Border.all(color: AppColors.white, width: 2),
                            ),
                            child: _isUploadingAvatar
                                ? const Padding(
                                    padding: EdgeInsets.all(5),
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppColors.white,
                                    ),
                                  )
                                : const Icon(
                                    Icons.camera_alt,
                                    size: 14,
                                    color: AppColors.white,
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      onPressed: _isUploadingAvatar ? null : _changeAvatar,
                      child: Text(
                        _isUploadingAvatar ? '업로드 중...' : '사진 변경',
                        style: TextStyle(
                          fontSize: 14,
                          color: _isUploadingAvatar
                              ? AppColors.hintText
                              : AppColors.primary,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // 이름
                  AppTextField(
                    controller: _nameController,
                    labelText: '이름',
                    hintText: '이름을 입력하세요',
                    prefixIcon: Icons.person_outline,
                    errorText: _nameError,
                    onChanged: (_) {
                      if (_nameError != null) setState(() => _nameError = null);
                    },
                  ),
                  const SizedBox(height: 20),

                  // 휴대폰 번호
                  AppTextField(
                    controller: _phoneController,
                    labelText: '휴대폰 번호',
                    hintText: '010-0000-0000',
                    keyboardType: TextInputType.phone,
                    prefixIcon: Icons.phone_outlined,
                    errorText: _phoneError,
                    onChanged: (_) {
                      if (_phoneError != null)
                        setState(() => _phoneError = null);
                    },
                  ),
                  const SizedBox(height: 8),
                  const Padding(
                    padding: EdgeInsets.only(left: 2),
                    child: Text(
                      '휴대폰 번호 변경 시 본인인증이 필요할 수 있습니다.',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.hintText,
                      ),
                    ),
                  ),
                  const SizedBox(height: 40),

                  // 저장 버튼
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _isSaving ? null : _save,
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
                              '저장하기',
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
          );
        },
      ),
    );
  }
}
