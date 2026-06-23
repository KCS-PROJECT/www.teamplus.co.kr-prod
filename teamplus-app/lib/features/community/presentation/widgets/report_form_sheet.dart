import 'package:flutter/material.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_error.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/app_theme.dart';

/// 신고 카테고리
enum ReportCategory {
  spam('스팸', '광고, 홍보성 게시글'),
  harassment('괴롭힘', '욕설, 비방, 위협'),
  inappropriate('부적절한 콘텐츠', '음란물, 폭력적 콘텐츠'),
  fakeProfile('가짜 프로필', '사칭, 허위 정보'),
  other('기타', '그 외 이유');

  final String label;
  final String description;
  const ReportCategory(this.label, this.description);
}

/// 신고 폼 Modal Bottom Sheet
///
/// `POST /api/v1/users/me/reports` 엔드포인트를 호출합니다.
/// 24시간 내 중복 신고 시 429 응답으로 안내 메시지를 표시합니다.
class ReportFormSheet extends StatefulWidget {
  final String targetUserId;
  final String targetUserName;
  final String? postId;
  final String? messageId;

  const ReportFormSheet({
    super.key,
    required this.targetUserId,
    required this.targetUserName,
    this.postId,
    this.messageId,
  });

  @override
  State<ReportFormSheet> createState() => _ReportFormSheetState();
}

class _ReportFormSheetState extends State<ReportFormSheet> {
  ReportCategory? _selectedCategory;
  final _descController = TextEditingController();
  bool _isSubmitting = false;
  static const int _maxLength = 500;

  @override
  void dispose() {
    _descController.dispose();
    super.dispose();
  }

  bool get _canSubmit => _selectedCategory != null && !_isSubmitting;

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _isSubmitting = true);

    final targetType = widget.messageId != null
        ? 'MESSAGE'
        : widget.postId != null
            ? 'POST'
            : 'USER';
    final targetId = widget.messageId ?? widget.postId;

    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);

    try {
      await ApiClient().post(
        '/users/me/reports',
        data: {
          'reportedUserId': widget.targetUserId,
          'targetType': targetType,
          if (targetId != null) 'targetId': targetId,
          'category': _selectedCategory!.name,
          'description': _descController.text.trim(),
        },
      );

      if (mounted) {
        nav.pop();
        messenger.showSnackBar(
          const SnackBar(
            content: Text('신고가 접수되었습니다.'),
            backgroundColor: AppColors.primary,
          ),
        );
      }
    } on ApiError catch (e) {
      final message =
          e.statusCode == 429 ? '이미 신고하셨습니다. 24시간 후 다시 시도해주세요.' : e.message;
      if (mounted) {
        messenger.showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (_) {
      if (mounted) {
        messenger.showSnackBar(
          const SnackBar(content: Text('신고 중 오류가 발생했습니다.')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 핸들 + 헤더
              _buildHeader(),
              const Divider(height: 1),

              // 폼 스크롤 영역
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.65,
                ),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(AppTheme.spacingLG),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildCategorySection(),
                      const SizedBox(height: AppTheme.spacingLG),
                      _buildDescriptionField(),
                      const SizedBox(height: AppTheme.spacingXL),
                      _buildSubmitButton(),
                      const SizedBox(height: AppTheme.spacingMD),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 핸들
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.dividers,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  '신고하기',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.darkText,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${widget.targetUserName} 님을 신고합니다',
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.lightText,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close, color: AppColors.darkText),
          ),
        ],
      ),
    );
  }

  Widget _buildCategorySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '신고 사유',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.darkText,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          '해당하는 사유를 선택해 주세요.',
          style: TextStyle(fontSize: 12, color: AppColors.lightText),
        ),
        const SizedBox(height: 12),
        ...ReportCategory.values.map(_buildCategoryTile),
      ],
    );
  }

  Widget _buildCategoryTile(ReportCategory category) {
    final isSelected = _selectedCategory == category;
    return GestureDetector(
      onTap: () => setState(() => _selectedCategory = category),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.06)
              : Colors.transparent,
          border: Border.all(
            color: isSelected ? AppColors.primary : AppColors.dividers,
            width: isSelected ? 1.5 : 1,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? AppColors.primary : AppColors.lightText,
                  width: 2,
                ),
                color: isSelected ? AppColors.primary : Colors.transparent,
              ),
              child: isSelected
                  ? const Icon(Icons.check, color: Colors.white, size: 12)
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    category.label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color:
                          isSelected ? AppColors.primary : AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    category.description,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.lightText,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDescriptionField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '상세 내용 (선택)',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: AppColors.darkText,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _descController,
          maxLines: 4,
          maxLength: _maxLength,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: '신고 내용을 자세히 설명해 주세요.',
            hintStyle: const TextStyle(
              fontSize: 14,
              color: AppColors.lightText,
            ),
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
              borderSide:
                  const BorderSide(color: AppColors.primary, width: 1.5),
            ),
            contentPadding: const EdgeInsets.all(14),
            counterStyle: const TextStyle(
              fontSize: 12,
              color: AppColors.lightText,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSubmitButton() {
    return SizedBox(
      height: 52,
      child: ElevatedButton(
        onPressed: _canSubmit ? _submit : null,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.error,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.error.withValues(alpha: 0.4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: _isSubmitting
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Text(
                '신고 제출하기',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
      ),
    );
  }
}
