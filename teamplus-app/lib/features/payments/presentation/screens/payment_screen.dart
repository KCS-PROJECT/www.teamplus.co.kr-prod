import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/payment/kg_inicis_service.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/security/screen_capture_guard.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../widgets/payment_option_card.dart';

class PaymentScreen extends ConsumerStatefulWidget {
  final Map<String, dynamic> classData;

  const PaymentScreen({
    super.key,
    required this.classData,
  });

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen>
    with ConsumerScreenCaptureMixin {
  String _paymentMethod = 'card'; // card, bank_transfer
  bool _isProcessing = false;
  bool _agreedToTerms = false;

  void _handlePayment() async {
    if (!_agreedToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('결제 약관에 동의해주세요.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    setState(() {
      _isProcessing = true;
    });

    try {
      // -------------------------------------------------------
      // Step 1: 백엔드에 결제 주문 생성 요청
      // POST /api/v1/payments/initiate → orderNumber 수령
      // -------------------------------------------------------
      final paymentsApi = ref.read(paymentsApiProvider);
      final priceString = widget.classData['price'] as String;
      final amount = int.parse(priceString.replaceAll(RegExp(r'[^0-9]'), ''));
      final productId = widget.classData['productId'] as String? ?? '';

      final initiateResponse = await paymentsApi.initiatePayment(
        productId: productId,
        amount: amount,
        paymentMethod: _paymentMethod == 'card' ? 'card' : 'bank',
        buyerName: widget.classData['buyerName'] as String?,
        buyerEmail: widget.classData['buyerEmail'] as String?,
        buyerPhone: widget.classData['buyerPhone'] as String?,
      );

      if (kDebugMode) {
        debugPrint('[Payment] 주문 생성 완료: '
            'orderNumber=${initiateResponse.orderNumber}, '
            'amount=${initiateResponse.amount}');
      }

      if (!mounted) return;

      // -------------------------------------------------------
      // Step 2: KG이니시스 결제 WebView 표시
      // KGInicisService.initiatePayment() → 결제 결과 수신
      // -------------------------------------------------------
      final kgInicisService = KGInicisService();
      final paymentRequest = KGInicisPaymentRequest(
        orderNumber: initiateResponse.orderNumber,
        amount: initiateResponse.amount,
        productName: widget.classData['name'] as String,
        buyerName: widget.classData['buyerName'] as String? ?? '고객',
        buyerPhone: widget.classData['buyerPhone'] as String? ?? '',
        buyerEmail: widget.classData['buyerEmail'] as String? ?? '',
      );

      final paymentResult = await kgInicisService.initiatePayment(
        context: context,
        request: paymentRequest,
      );

      if (!mounted) return;

      // -------------------------------------------------------
      // Step 3: 결제 결과 처리
      // -------------------------------------------------------
      switch (paymentResult.status) {
        case PaymentResultStatus.success:
          // Step 3a: 서버 측 결제 검증
          final verified = await kgInicisService.verifyPayment(
            transactionId: paymentResult.transactionId!,
            orderNumber: paymentResult.orderNumber!,
            amount: paymentResult.amount!,
          );

          if (!mounted) return;

          if (verified) {
            // 결제권 잔액 캐시 무효화 (결제 성공으로 결제권 발급됨)
            ref.invalidate(myCreditBalanceProvider);
            _showPaymentSuccessDialog(paymentResult.orderNumber);
          } else {
            // 검증 실패 — 결제는 성공했으나 서버 검증 실패
            _showPaymentErrorSnackBar(
              '결제 검증에 실패했습니다. 고객센터에 문의해주세요.\n'
              '주문번호: ${paymentResult.orderNumber}',
            );
          }

        case PaymentResultStatus.cancelled:
          _showPaymentErrorSnackBar('결제가 취소되었습니다.');

        case PaymentResultStatus.timeout:
          _showPaymentErrorSnackBar(
            '결제 시간이 초과되었습니다. 다시 시도해주세요.',
          );

        case PaymentResultStatus.failed:
          final errorMsg = paymentResult.errorMessage ?? '결제 처리에 실패했습니다.';
          _showPaymentErrorSnackBar(errorMsg);
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[Payment] 결제 오류: $e');
      }
      if (mounted) {
        _showPaymentErrorSnackBar(
          '결제 중 오류가 발생했습니다. 다시 시도해주세요.',
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
        });
      }
    }
  }

  /// 결제 성공 다이얼로그 표시
  void _showPaymentSuccessDialog([String? orderNumber]) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success, size: 28),
            SizedBox(width: 12),
            Text('결제 완료'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('결제가 완료되었습니다.'),
            const SizedBox(height: 8),
            const Text(
              '수업권이 자동으로 발급되었습니다.',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.lightText,
              ),
            ),
            if (orderNumber != null) ...[
              const SizedBox(height: 4),
              Text(
                '주문번호: $orderNumber',
                style:
                    const TextStyle(fontSize: 12, color: AppColors.lightText),
              ),
            ],
            const SizedBox(height: 16),
            _buildPaymentSummary(),
          ],
        ),
        actions: [
          PrimaryButton(
            label: '결제 이력 보기',
            onPressed: () {
              Navigator.of(dialogContext).pop();
              context.go('/payment-history');
            },
          ),
        ],
      ),
    );
  }

  /// 결제 에러 스낵바 표시
  void _showPaymentErrorSnackBar(String message) {
    setState(() {
      _isProcessing = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.error,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  /// 환불 규정 보기 — 웹 약관(/terms?section=refund)을 WebView 로 표시.
  /// WebView 라우트 계약(extra: url/title/showAppBar/showBottomNav) 준수.
  void _openRefundPolicy() {
    context.push('/webview', extra: {
      'url': '${ApiConstants.webAppUrl}/terms?section=refund',
      'title': '환불 규정',
      'showAppBar': true,
      'showBottomNav': false,
    });
  }

  @override
  Widget build(BuildContext context) {
    final priceString = widget.classData['price'] as String;
    final price = priceString.replaceAll(RegExp(r'[^0-9]'), '');

    return Scaffold(
      appBar: const TeamplusAppBar(title: '결제하기'),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Class Info
                  const Text(
                    '수업 정보',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.primaryLight.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.classData['name'],
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppColors.darkText,
                          ),
                        ),
                        const SizedBox(height: 8),
                        _buildInfoRow('일정', widget.classData['schedule']),
                        const SizedBox(height: 4),
                        _buildInfoRow('코치', widget.classData['coach']),
                        const SizedBox(height: 4),
                        _buildInfoRow('수업 횟수', widget.classData['sessions']),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Payment Method
                  const Text(
                    '결제 방법',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 16),

                  RadioGroup<String>(
                    groupValue: _paymentMethod,
                    onChanged: (value) {
                      if (value != null && !_isProcessing) {
                        setState(() => _paymentMethod = value);
                      }
                    },
                    child: Column(
                      children: [
                        RadioListTile<String>(
                          title: const Row(
                            children: [
                              Icon(Icons.credit_card, size: 20),
                              SizedBox(width: 12),
                              Text('신용/체크카드'),
                            ],
                          ),
                          value: 'card',
                          enabled: !_isProcessing,
                          activeColor: AppColors.primary,
                        ),
                        RadioListTile<String>(
                          title: const Row(
                            children: [
                              Icon(Icons.account_balance, size: 20),
                              SizedBox(width: 12),
                              Text('계좌이체'),
                            ],
                          ),
                          value: 'bank_transfer',
                          enabled: !_isProcessing,
                          activeColor: AppColors.primary,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Payment Summary
                  const Text(
                    '결제 금액',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _buildPaymentSummary(),
                  const SizedBox(height: 32),

                  // Terms Agreement
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppColors.background,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      children: [
                        CheckboxListTile(
                          title: const Text(
                            '결제 약관 및 개인정보 처리방침에 동의합니다',
                            style: TextStyle(fontSize: 14),
                          ),
                          value: _agreedToTerms,
                          onChanged: _isProcessing
                              ? null
                              : (value) {
                                  setState(() {
                                    _agreedToTerms = value!;
                                  });
                                },
                          activeColor: AppColors.primary,
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          '• 결제 후 수업권이 자동으로 발급됩니다\n• 수업권은 90일 동안 유효합니다',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.lightText,
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 8),
                        // 환불 규정 보기 — 결제 취소·환불 안내(웹 약관 /terms?section=refund)
                        InkWell(
                          onTap: _isProcessing ? null : _openRefundPolicy,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: const [
                                Icon(
                                  Icons.receipt_long_outlined,
                                  size: 16,
                                  color: AppColors.primary,
                                ),
                                SizedBox(width: 6),
                                Text(
                                  '환불 규정 보기',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.primary,
                                  ),
                                ),
                                SizedBox(width: 2),
                                Icon(
                                  Icons.chevron_right,
                                  size: 16,
                                  color: AppColors.primary,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bottom CTA
          Container(
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
              child: PrimaryButton(
                label: '₩$price 결제하기',
                onPressed: _handlePayment,
                isLoading: _isProcessing,
                icon: Icons.payment,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Row(
      children: [
        Text(
          '$label: ',
          style: const TextStyle(
            fontSize: 14,
            color: AppColors.lightText,
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            fontSize: 14,
            color: AppColors.darkText,
          ),
        ),
      ],
    );
  }

  Widget _buildPaymentSummary() {
    final priceString = widget.classData['price'] as String? ?? '0';
    final amount =
        int.tryParse(priceString.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
    final feeType =
        ClassFeeType.fromString(widget.classData['feeType'] as String?);

    return PaymentOptionCard(
      feeType: feeType,
      totalAmount: amount,
      weeksPerMonth: widget.classData['weeksPerMonth'] as int?,
      pricePerSession: widget.classData['pricePerSession'] as int?,
      sessionsPerMonth: widget.classData['sessionsPerMonth'] as int?,
      sessionCount: widget.classData['sessionCount'] as int?,
      gameCount: widget.classData['gameCount'] as int?,
      feePerGame: widget.classData['feePerGame'] as int?,
    );
  }
}
