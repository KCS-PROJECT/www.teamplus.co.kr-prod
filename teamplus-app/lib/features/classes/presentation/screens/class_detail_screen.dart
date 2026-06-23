import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/notification/push_notification_service.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../data/waitlist_api.dart';
import '../../../payments/presentation/screens/payment_screen.dart';

class ClassDetailScreen extends ConsumerStatefulWidget {
  final Map<String, dynamic> classData;

  const ClassDetailScreen({
    super.key,
    required this.classData,
  });

  @override
  ConsumerState<ClassDetailScreen> createState() => _ClassDetailScreenState();
}

class _ClassDetailScreenState extends ConsumerState<ClassDetailScreen> {
  WaitlistDto? _myWaitlist;
  bool _isFetchingWaitlist = false;
  bool _isWaitlistAction = false;

  StreamSubscription<NotificationPayload>? _notificationSub;

  @override
  void initState() {
    super.initState();
    _fetchMyWaitlist();
    _subscribeToPromotionNotification();
  }

  @override
  void dispose() {
    _notificationSub?.cancel();
    super.dispose();
  }

  String get _classId => widget.classData['id']?.toString() ?? '';

  /// 내 대기 목록에서 현재 수업의 항목 조회
  Future<void> _fetchMyWaitlist() async {
    if (_classId.isEmpty) return;
    setState(() => _isFetchingWaitlist = true);
    try {
      final api = ref.read(waitlistApiProvider);
      final list = await api.getMyWaitlists();
      final entry = list
          .where(
            (w) =>
                w.classId == _classId &&
                (w.status == 'WAITING' || w.status == 'CONFIRMED'),
          )
          .firstOrNull;
      if (mounted) setState(() => _myWaitlist = entry);
    } catch (e) {
      if (kDebugMode) debugPrint('[ClassDetail] 대기 조회 오류: $e');
    } finally {
      if (mounted) setState(() => _isFetchingWaitlist = false);
    }
  }

  /// 승격 푸시 알림 수신 리스너
  void _subscribeToPromotionNotification() {
    _notificationSub = PushNotificationService().notificationStream.listen(
      (payload) {
        if (!mounted) return;
        if (payload.type == 'WAITLIST_PROMOTED' &&
            payload.data?['classId'] == _classId) {
          _fetchMyWaitlist();
          _showPromotionModal(payload.data?['waitlistId'] as String?);
        }
      },
    );
  }

  /// 대기 등록
  Future<void> _registerWaitlist() async {
    setState(() => _isWaitlistAction = true);
    try {
      final api = ref.read(waitlistApiProvider);
      final entry = await api.createWaitlist(classId: _classId);
      if (mounted) {
        setState(() => _myWaitlist = entry);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${entry.position}번째 대기 등록 완료'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final code = e.response?.statusCode;
      final msg = code == 409 ? '이미 대기 중인 수업입니다.' : '대기 등록 중 오류가 발생했습니다.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() => _isWaitlistAction = false);
    }
  }

  /// 대기 취소
  Future<void> _cancelWaitlist() async {
    final waitlist = _myWaitlist;
    if (waitlist == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('대기 취소'),
        content: const Text('대기 신청을 취소하시겠습니까?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('아니오'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('취소하기'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _isWaitlistAction = true);
    try {
      final api = ref.read(waitlistApiProvider);
      await api.cancelWaitlist(waitlist.id);
      if (mounted) {
        setState(() => _myWaitlist = null);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('대기 신청이 취소되었습니다.'),
            backgroundColor: AppColors.lightText,
          ),
        );
      }
    } on DioException catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('대기 취소 중 오류가 발생했습니다.'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isWaitlistAction = false);
    }
  }

  /// 승격 확정 (24h 내)
  Future<void> _confirmWaitlist(String waitlistId) async {
    setState(() => _isWaitlistAction = true);
    try {
      final api = ref.read(waitlistApiProvider);
      final entry = await api.confirmWaitlist(waitlistId);
      if (mounted) {
        setState(() => _myWaitlist = entry);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('수업 등록이 확정되었습니다. 결제를 진행해주세요.'),
            backgroundColor: AppColors.success,
          ),
        );
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final code = e.response?.statusCode;
      final msg = code == 400 ? '확정 기한이 만료되었습니다.' : '확정 중 오류가 발생했습니다.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() => _isWaitlistAction = false);
    }
  }

  /// 승격 알림 CTA 모달
  void _showPromotionModal(String? waitlistId) {
    if (waitlistId == null) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.celebration, color: AppColors.primary),
            SizedBox(width: 8),
            Text('대기 순번 승격!'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.classData['name'] as String? ?? '수업',
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 16,
                color: AppColors.darkText,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              '정원이 생겼습니다!\n24시간 내에 확정하지 않으면 자동 취소됩니다.',
              style: TextStyle(
                  fontSize: 14, color: AppColors.lightText, height: 1.5),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('나중에'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              _confirmWaitlist(waitlistId);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            ),
            child: const Text('지금 확정하기'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final availableSpots = (widget.classData['capacity'] as int? ?? 0) -
        (widget.classData['enrolled'] as int? ?? 0);
    final myWaitlist = _myWaitlist;

    return Scaffold(
      appBar: const TeamplusAppBar(title: '수업 상세'),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 수업 이름
                  Text(
                    widget.classData['name'] as String? ?? '',
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 8),

                  // 연령 배지
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      widget.classData['ageRange'] as String? ?? '',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // 설명
                  Text(
                    widget.classData['description'] as String? ?? '',
                    style: const TextStyle(
                      fontSize: 16,
                      color: AppColors.darkText,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 32),

                  // 수업 정보
                  const Text(
                    '수업 정보',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 16),

                  _buildDetailCard(
                    icon: Icons.schedule,
                    label: '일정',
                    value: widget.classData['schedule'] as String? ?? '',
                  ),
                  const SizedBox(height: 12),

                  _buildDetailCard(
                    icon: Icons.person,
                    label: '담당코치',
                    value: widget.classData['coach'] as String? ?? '',
                  ),
                  const SizedBox(height: 12),

                  _buildDetailCard(
                    icon: Icons.people,
                    label: '정원',
                    value:
                        '${widget.classData['enrolled']}/${widget.classData['capacity']}명',
                    trailing: availableSpots > 0
                        ? Text(
                            '(잔여 $availableSpots석)',
                            style: const TextStyle(
                              fontSize: 14,
                              color: AppColors.success,
                            ),
                          )
                        : const Text(
                            '(마감)',
                            style: TextStyle(
                              fontSize: 14,
                              color: AppColors.error,
                            ),
                          ),
                  ),
                  const SizedBox(height: 12),

                  _buildDetailCard(
                    icon: Icons.calendar_month,
                    label: '수업 횟수',
                    value: widget.classData['sessions'] as String? ?? '',
                  ),
                  const SizedBox(height: 32),

                  // 수업료
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.primary.withValues(alpha: 0.1),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          '수업료',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: AppColors.darkText,
                          ),
                        ),
                        Text(
                          widget.classData['price'] as String? ?? '',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // 대기 정보 배지 (대기 중일 때만)
                  if (myWaitlist != null && myWaitlist.isWaiting) ...[
                    const SizedBox(height: 20),
                    _buildWaitlistBadge(myWaitlist),
                  ],
                ],
              ),
            ),
          ),

          // 하단 CTA
          _buildBottomCta(availableSpots, myWaitlist),
        ],
      ),
    );
  }

  /// 대기 순번 배지
  Widget _buildWaitlistBadge(WaitlistDto waitlist) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: Row(
        children: [
          const Icon(Icons.hourglass_top, size: 20, color: Color(0xFFB45309)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '대기 ${waitlist.position}번째',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: Color(0xFF92400E),
                  ),
                ),
                const Text(
                  '정원 발생 시 순서대로 알림을 드립니다.',
                  style: TextStyle(fontSize: 12, color: Color(0xFFB45309)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 하단 버튼 영역
  Widget _buildBottomCta(int availableSpots, WaitlistDto? myWaitlist) {
    return Container(
      padding: const EdgeInsets.all(24),
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
        child: _isFetchingWaitlist
            ? const Center(
                child: SizedBox(
                  height: 48,
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            : _buildCtaButton(availableSpots, myWaitlist),
      ),
    );
  }

  Widget _buildCtaButton(int availableSpots, WaitlistDto? myWaitlist) {
    // 정원 있음 → 수업 신청
    if (availableSpots > 0) {
      return PrimaryButton(
        label: '수업 신청하기',
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => PaymentScreen(classData: widget.classData),
            ),
          );
        },
        icon: Icons.payment,
      );
    }

    // 승격 확정 대기 중 (notifiedAt 있고 confirmedAt 없음)
    if (myWaitlist != null &&
        myWaitlist.status == 'CONFIRMED' &&
        myWaitlist.confirmedAt == null &&
        myWaitlist.isWithinConfirmationWindow) {
      return Column(
        children: [
          PrimaryButton(
            label: '지금 확정하기',
            onPressed: _isWaitlistAction
                ? null
                : () => _confirmWaitlist(myWaitlist.id),
            icon: Icons.check_circle,
          ),
          if (myWaitlist.expiresAt != null) ...[
            const SizedBox(height: 8),
            Text(
              '확정 기한: ${_formatDeadline(myWaitlist.expiresAt!)}',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, color: AppColors.error),
            ),
          ],
        ],
      );
    }

    // 이미 결제 완료 확정 상태
    if (myWaitlist != null && myWaitlist.isConfirmed) {
      return PrimaryButton(
        label: '수업 신청 완료 — 결제하기',
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => PaymentScreen(classData: widget.classData),
            ),
          );
        },
        icon: Icons.payment,
      );
    }

    // 대기 등록 중
    if (myWaitlist != null && myWaitlist.isWaiting) {
      return OutlinedButton.icon(
        onPressed: _isWaitlistAction ? null : _cancelWaitlist,
        icon: _isWaitlistAction
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.cancel_outlined),
        label: Text(_isWaitlistAction ? '처리 중...' : '대기 취소하기'),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: AppColors.error),
          foregroundColor: AppColors.error,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
    }

    // 정원 초과 + 미신청 → 대기 등록
    return PrimaryButton(
      label: _isWaitlistAction ? '등록 중...' : '대기 등록하기',
      onPressed: _isWaitlistAction ? null : _registerWaitlist,
      icon: Icons.hourglass_empty,
    );
  }

  Widget _buildDetailCard({
    required IconData icon,
    required String label,
    required String value,
    Widget? trailing,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        border: Border.all(color: AppColors.dividers),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, size: 24, color: AppColors.primary),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.darkText,
                  ),
                ),
              ],
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }

  String _formatDeadline(DateTime deadline) {
    final diff = deadline.difference(DateTime.now());
    if (diff.isNegative) return '기한 만료';
    final hours = diff.inHours;
    final minutes = diff.inMinutes % 60;
    return '$hours시간 $minutes분 후';
  }
}
