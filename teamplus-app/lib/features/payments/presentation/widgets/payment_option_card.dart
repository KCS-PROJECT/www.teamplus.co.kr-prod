import 'package:flutter/material.dart';
import '../../../../core/theme/colors.dart';

/// 결제 상품의 feeType (ClassProduct.feeType)
enum ClassFeeType {
  /// 월정액 — 주 N회 × 회당 금액 × 4주
  monthlyFixed,

  /// 횟수제 — N회 × 회당 금액
  perSession,

  /// 경기당 — N경기 × 경기당 금액 (대회)
  perGame;

  static ClassFeeType fromString(String? value) {
    switch (value?.toUpperCase()) {
      case 'MONTHLY_FIXED':
        return ClassFeeType.monthlyFixed;
      case 'PER_SESSION':
        return ClassFeeType.perSession;
      case 'PER_GAME':
        return ClassFeeType.perGame;
      default:
        return ClassFeeType.monthlyFixed;
    }
  }
}

/// 결제 옵션 카드 — feeType별 가격 계산 방식을 표시
class PaymentOptionCard extends StatelessWidget {
  final ClassFeeType feeType;
  final int totalAmount;

  /// 월정액 전용: 주 횟수
  final int? weeksPerMonth;

  /// 월정액/횟수제: 회당 금액
  final int? pricePerSession;

  /// 월정액 전용: 월 횟수 (주당 횟수 × 4주)
  final int? sessionsPerMonth;

  /// 횟수제 전용: 구매 횟수
  final int? sessionCount;

  /// 경기당 전용: 경기 수
  final int? gameCount;

  /// 경기당 전용: 경기당 금액
  final int? feePerGame;

  const PaymentOptionCard({
    super.key,
    required this.feeType,
    required this.totalAmount,
    this.weeksPerMonth,
    this.pricePerSession,
    this.sessionsPerMonth,
    this.sessionCount,
    this.gameCount,
    this.feePerGame,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.primaryLight.withValues(alpha: 0.08),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildTypeLabel(),
          const SizedBox(height: 12),
          _buildCalculationRows(),
          const Divider(height: 20),
          _buildTotalRow(),
        ],
      ),
    );
  }

  Widget _buildTypeLabel() {
    final (label, color) = switch (feeType) {
      ClassFeeType.monthlyFixed => ('월정액', AppColors.primary),
      ClassFeeType.perSession => ('횟수제', AppColors.info),
      ClassFeeType.perGame => ('경기당', AppColors.warning),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  Widget _buildCalculationRows() {
    return switch (feeType) {
      ClassFeeType.monthlyFixed => _buildMonthlyFixed(),
      ClassFeeType.perSession => _buildPerSession(),
      ClassFeeType.perGame => _buildPerGame(),
    };
  }

  Widget _buildMonthlyFixed() {
    final weeks = weeksPerMonth ?? 4;
    final sessions = sessionsPerMonth ?? (weeks * 4);
    final unitPrice =
        pricePerSession ?? (sessions > 0 ? (totalAmount ~/ sessions) : 0);

    return Column(
      children: [
        _row('주 횟수', '주 $weeks회'),
        _row('월 수업 횟수', '$sessions회'),
        _row('회당 금액', _formatWon(unitPrice)),
        _row('적용 기간', '4주 (1개월)'),
      ],
    );
  }

  Widget _buildPerSession() {
    final count = sessionCount ?? 0;
    final unitPrice =
        pricePerSession ?? (count > 0 ? (totalAmount ~/ count) : 0);

    return Column(
      children: [
        _row('구매 횟수', '$count회'),
        _row('회당 금액', _formatWon(unitPrice)),
      ],
    );
  }

  Widget _buildPerGame() {
    final count = gameCount ?? 0;
    final unitFee = feePerGame ?? (count > 0 ? (totalAmount ~/ count) : 0);

    return Column(
      children: [
        _row('참가 경기 수', '$count경기'),
        _row('경기당 금액', _formatWon(unitFee)),
      ],
    );
  }

  Widget _buildTotalRow() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        const Text(
          '총 결제 금액',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: AppColors.darkText,
          ),
        ),
        Text(
          _formatWon(totalAmount),
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: AppColors.primary,
          ),
        ),
      ],
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 14, color: AppColors.lightText),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.darkText,
            ),
          ),
        ],
      ),
    );
  }

  String _formatWon(int amount) {
    final str = amount.toString().replaceAllMapped(
          RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
          (m) => '${m[1]},',
        );
    return '₩$str';
  }
}
