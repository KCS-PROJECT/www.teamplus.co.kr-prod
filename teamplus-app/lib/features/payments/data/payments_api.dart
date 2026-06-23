import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../../../core/network/api_client.dart';

/// 결제 기록 DTO
class PaymentDto {
  final String id;
  final String orderNumber;
  final double amount;
  final String paymentStatus;
  final String? paymentMethod;
  final String? tid;
  final DateTime createdAt;
  final DateTime? completedAt;
  final ProductDto? product;

  PaymentDto({
    required this.id,
    required this.orderNumber,
    required this.amount,
    required this.paymentStatus,
    this.paymentMethod,
    this.tid,
    required this.createdAt,
    this.completedAt,
    this.product,
  });

  factory PaymentDto.fromJson(Map<String, dynamic> json) {
    return PaymentDto(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as String,
      amount: (json['amount'] as num).toDouble(),
      paymentStatus: json['paymentStatus'] as String,
      paymentMethod: json['paymentMethod'] as String?,
      tid: json['tid'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      completedAt: json['completedAt'] != null
          ? DateTime.parse(json['completedAt'] as String)
          : null,
      product: json['product'] != null
          ? ProductDto.fromJson(json['product'] as Map<String, dynamic>)
          : null,
    );
  }

  /// 결제 상태 한글 표시
  String get statusText {
    switch (paymentStatus.toLowerCase()) {
      case 'pending':
        return '대기중';
      case 'completed':
        return '결제완료';
      case 'failed':
        return '결제실패';
      case 'refunded':
        return '환불완료';
      case 'cancelled':
        return '취소';
      default:
        return paymentStatus;
    }
  }

  /// 결제 완료 여부
  bool get isCompleted => paymentStatus.toLowerCase() == 'completed';

  /// 금액 포맷팅
  String get formattedAmount => '₩${amount.toStringAsFixed(0).replaceAllMapped(
        RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
        (Match m) => '${m[1]},',
      )}';
}

/// 상품 정보 DTO
class ProductDto {
  final String id;
  final String name;
  final double price;
  final int sessionsPerMonth;
  final String? description;
  final ClassInfoDto? classInfo;

  ProductDto({
    required this.id,
    required this.name,
    required this.price,
    required this.sessionsPerMonth,
    this.description,
    this.classInfo,
  });

  factory ProductDto.fromJson(Map<String, dynamic> json) {
    return ProductDto(
      id: json['id'] as String,
      name: json['name'] as String,
      price: (json['price'] as num).toDouble(),
      sessionsPerMonth: json['sessionsPerMonth'] as int? ?? 0,
      description: json['description'] as String?,
      classInfo: json['class'] != null
          ? ClassInfoDto.fromJson(json['class'] as Map<String, dynamic>)
          : null,
    );
  }
}

/// 수업 정보 DTO
class ClassInfoDto {
  final String id;
  final String className;

  ClassInfoDto({
    required this.id,
    required this.className,
  });

  factory ClassInfoDto.fromJson(Map<String, dynamic> json) {
    return ClassInfoDto(
      id: json['id'] as String,
      className: json['className'] as String,
    );
  }
}

/// 결제 통계 DTO
class PaymentStatsDto {
  final int totalPayments;
  final int completedCount;
  final int failedCount;
  final int refundedCount;
  final double totalRevenue;
  final double totalRefunded;
  final double netRevenue;
  final String successRate;

  PaymentStatsDto({
    required this.totalPayments,
    required this.completedCount,
    required this.failedCount,
    required this.refundedCount,
    required this.totalRevenue,
    required this.totalRefunded,
    required this.netRevenue,
    required this.successRate,
  });

  factory PaymentStatsDto.fromJson(Map<String, dynamic> json) {
    return PaymentStatsDto(
      totalPayments: json['totalPayments'] as int? ?? 0,
      completedCount: json['completedCount'] as int? ?? 0,
      failedCount: json['failedCount'] as int? ?? 0,
      refundedCount: json['refundedCount'] as int? ?? 0,
      totalRevenue: (json['totalRevenue'] as num?)?.toDouble() ?? 0,
      totalRefunded: (json['totalRefunded'] as num?)?.toDouble() ?? 0,
      netRevenue: (json['netRevenue'] as num?)?.toDouble() ?? 0,
      successRate: json['successRate'] as String? ?? '0',
    );
  }
}

/// 결제 주문 생성 응답 DTO
class PaymentInitiateResponse {
  final String orderNumber;
  final int amount;
  final String? merchantId;
  final String? paymentId;

  PaymentInitiateResponse({
    required this.orderNumber,
    required this.amount,
    this.merchantId,
    this.paymentId,
  });

  factory PaymentInitiateResponse.fromJson(Map<String, dynamic> json) {
    return PaymentInitiateResponse(
      orderNumber: json['orderNumber'] as String,
      amount: (json['amount'] as num).toInt(),
      merchantId: json['merchantId'] as String?,
      paymentId: json['paymentId'] as String? ?? json['id'] as String?,
    );
  }
}

/// 결제 API 서비스
class PaymentsApi {
  final ApiClient _client;

  PaymentsApi(this._client);

  /// 내 결제 이력 조회
  Future<List<PaymentDto>> getMyPayments({int limit = 20}) async {
    try {
      final Response response = await _client.get(
        '/payments/my',
        queryParameters: {'limit': limit},
      );

      final data = response.data;
      final List<dynamic> rawList =
          data is Map<String, dynamic> && data['data'] is List
              ? data['data'] as List
              : (data is List ? data : []);

      return rawList
          .map((e) => PaymentDto.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[PaymentsApi] getMyPayments error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 결제 상세 조회
  Future<PaymentDto> getPayment(String paymentId) async {
    try {
      final Response response = await _client.get('/payments/$paymentId');

      final data = response.data;
      final paymentData = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : data as Map<String, dynamic>;

      return PaymentDto.fromJson(paymentData);
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[PaymentsApi] getPayment error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 결제 상태 조회
  Future<PaymentDto> getPaymentStatus(String paymentId) async {
    try {
      final Response response =
          await _client.get('/payments/$paymentId/status');

      final data = response.data;
      final paymentData = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : data as Map<String, dynamic>;

      return PaymentDto.fromJson(paymentData);
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[PaymentsApi] getPaymentStatus error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 회원별 결제 이력 조회
  Future<List<PaymentDto>> getMemberPayments(String memberId,
      {int limit = 20}) async {
    try {
      final Response response = await _client.get(
        '/payments/member/$memberId',
        queryParameters: {'limit': limit},
      );

      final data = response.data;
      final List<dynamic> rawList =
          data is Map<String, dynamic> && data['data'] is List
              ? data['data'] as List
              : (data is List ? data : []);

      return rawList
          .map((e) => PaymentDto.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[PaymentsApi] getMemberPayments error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 결제 주문 생성 (initiate)
  Future<PaymentInitiateResponse> initiatePayment({
    required String productId,
    required int amount,
    required String paymentMethod,
    String? buyerName,
    String? buyerEmail,
    String? buyerPhone,
  }) async {
    try {
      final Response response = await _client.post(
        '/payments/initiate',
        data: {
          'productId': productId,
          'amount': amount,
          'paymentMethod': paymentMethod,
          if (buyerName != null) 'buyerName': buyerName,
          if (buyerEmail != null) 'buyerEmail': buyerEmail,
          if (buyerPhone != null) 'buyerPhone': buyerPhone,
        },
      );

      final data = response.data;
      final paymentData = data is Map<String, dynamic> && data['data'] != null
          ? data['data'] as Map<String, dynamic>
          : data as Map<String, dynamic>;

      return PaymentInitiateResponse.fromJson(paymentData);
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[PaymentsApi] initiatePayment error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }

  /// 환불 요청
  Future<void> requestRefund({
    required String paymentId,
    required String refundReason,
    double? refundAmount,
  }) async {
    try {
      await _client.post(
        '/payments/$paymentId/refund',
        data: {
          'refundReason': refundReason,
          if (refundAmount != null) 'refundAmount': refundAmount,
        },
      );
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('[PaymentsApi] requestRefund error: $e');
        debugPrint('$stack');
      }
      rethrow;
    }
  }
}
