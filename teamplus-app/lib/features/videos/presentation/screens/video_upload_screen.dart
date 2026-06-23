import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_error.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';

/// 자녀 영상 등록 화면 (2026-05-23 — R2 제거 후 multipart 단일 채널)
///
/// 업로드 플로우:
///   1. ImagePicker → 갤러리 또는 카메라로 영상 선택 (최대 50MB)
///   2. POST /api/v1/videos  (multipart/form-data) — multer 디스크 저장 + Video 레코드 자동 생성
///
/// 진입: ChildCard "영상 등록" 버튼 → context.push('/videos/upload',
///         extra: {'childId': '...', 'childName': '...'})
class VideoUploadScreen extends ConsumerStatefulWidget {
  final String childId;
  final String childName;

  const VideoUploadScreen({
    super.key,
    required this.childId,
    required this.childName,
  });

  @override
  ConsumerState<VideoUploadScreen> createState() => _VideoUploadScreenState();
}

class _VideoUploadScreenState extends ConsumerState<VideoUploadScreen> {
  XFile? _selectedVideo;
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  bool _isBusy = false;
  double _uploadProgress = 0;

  static const int _maxBytes = 50 * 1024 * 1024; // 50MB

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    super.dispose();
  }

  bool get _canUpload =>
      _selectedVideo != null &&
      _titleController.text.trim().isNotEmpty &&
      !_isBusy;

  String get _statusLabel =>
      '영상 업로드 중... ${(_uploadProgress * 100).toStringAsFixed(0)}%';

  Future<void> _pickVideo({required ImageSource source}) async {
    final video = await ImagePicker().pickVideo(
      source: source,
      maxDuration: const Duration(minutes: 10),
    );
    if (video != null && mounted) {
      setState(() => _selectedVideo = video);
    }
  }

  Future<void> _showPickerSheet() async {
    if (_isBusy) return;
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('카메라로 촬영'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                _pickVideo(source: ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('갤러리에서 선택'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                _pickVideo(source: ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _upload() async {
    if (!_canUpload) return;
    final messenger = ScaffoldMessenger.of(context);

    final file = File(_selectedVideo!.path);
    final fileName = _selectedVideo!.name;
    final size = await file.length();
    if (size > _maxBytes) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('50MB 이하 영상만 업로드할 수 있습니다.'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    try {
      setState(() {
        _isBusy = true;
        _uploadProgress = 0;
      });

      final formData = FormData.fromMap(<String, dynamic>{
        'file': await MultipartFile.fromFile(
          file.path,
          filename: fileName,
          contentType: DioMediaType.parse('video/mp4'),
        ),
        'title': _titleController.text.trim(),
        if (_descController.text.trim().isNotEmpty)
          'description': _descController.text.trim(),
        'videoType': 'highlight',
        'isPublic': false,
      });

      await ApiClient().post(
        '/videos',
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
          sendTimeout: const Duration(minutes: 5),
          receiveTimeout: const Duration(minutes: 1),
        ),
        onSendProgress: (sent, total) {
          if (total > 0 && mounted) {
            setState(() => _uploadProgress = sent / total);
          }
        },
      );

      if (mounted) {
        messenger.showSnackBar(
          const SnackBar(
            content: Text('영상이 등록되었습니다.'),
            backgroundColor: AppColors.success,
          ),
        );
        context.pop();
      }
    } on ApiError catch (e) {
      messenger.showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.error),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('업로드 중 오류가 발생했습니다. 다시 시도해주세요.'),
          backgroundColor: AppColors.error,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isBusy = false;
          _uploadProgress = 0;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: TeamplusAppBar(title: '${widget.childName} 영상 등록'),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildVideoPicker(),
                  const SizedBox(height: 28),
                  _buildLabel('제목 *'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _titleController,
                    enabled: !_isBusy,
                    maxLength: 100,
                    onChanged: (_) => setState(() {}),
                    textInputAction: TextInputAction.next,
                    decoration: _inputDecoration('영상 제목을 입력해주세요'),
                  ),
                  const SizedBox(height: 20),
                  _buildLabel('설명 (선택)'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _descController,
                    enabled: !_isBusy,
                    maxLines: 4,
                    maxLength: 500,
                    decoration: _inputDecoration('영상에 대한 설명을 입력해주세요'),
                  ),
                ],
              ),
            ),
          ),
          _buildBottomSection(),
        ],
      ),
    );
  }

  Widget _buildVideoPicker() {
    return GestureDetector(
      onTap: _isBusy ? null : _showPickerSheet,
      child: Container(
        width: double.infinity,
        height: 180,
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: _selectedVideo != null
                ? AppColors.primary
                : AppColors.borderColor,
            width: _selectedVideo != null ? 1.5 : 1,
          ),
        ),
        child:
            _selectedVideo != null ? _buildSelectedState() : _buildEmptyState(),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: AppColors.primaryLight.withValues(alpha: 0.3),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.video_library_outlined,
            size: 32,
            color: AppColors.primary,
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          '영상 선택하기',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.primary,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          '카메라 또는 갤러리에서 영상을 선택해주세요 (최대 50MB · 10분)',
          style: TextStyle(fontSize: 12, color: AppColors.lightText),
        ),
      ],
    );
  }

  Widget _buildSelectedState() {
    final name = _selectedVideo!.name;
    final displayName = name.length > 32 ? '${name.substring(0, 29)}...' : name;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.check_circle_outline,
            size: 40,
            color: AppColors.success,
          ),
          const SizedBox(height: 8),
          Text(
            displayName,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.darkText,
            ),
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _isBusy ? null : _showPickerSheet,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            ),
            child: const Text(
              '다시 선택',
              style: TextStyle(fontSize: 13, color: AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomSection() {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
      decoration: BoxDecoration(
        color: AppColors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            offset: const Offset(0, -2),
            blurRadius: 8,
          ),
        ],
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_isBusy) ...[
              LinearProgressIndicator(
                value: _uploadProgress > 0 ? _uploadProgress : null,
                backgroundColor: AppColors.dividers,
                color: AppColors.primary,
                minHeight: 6,
                borderRadius: BorderRadius.circular(3),
              ),
              const SizedBox(height: 6),
              Text(
                _statusLabel,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.lightText,
                ),
              ),
              const SizedBox(height: 10),
            ],
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: PrimaryButton(
                label: '영상 등록하기',
                onPressed: _canUpload ? _upload : null,
                isLoading: _isBusy,
                icon: Icons.upload,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: AppColors.darkText,
      ),
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(fontSize: 14, color: AppColors.hintText),
      filled: true,
      fillColor: AppColors.background,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.dividers),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.dividers),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.dividers),
      ),
      contentPadding: const EdgeInsets.all(14),
      counterStyle: const TextStyle(fontSize: 12, color: AppColors.lightText),
    );
  }
}
