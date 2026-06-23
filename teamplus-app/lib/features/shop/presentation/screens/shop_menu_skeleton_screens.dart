import 'package:flutter/material.dart';
import '../../../../shared/widgets/menu_skeleton_screen.dart';

class ReturnsRefundScreen extends StatelessWidget {
  const ReturnsRefundScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '반품/환불',
      subtitle: '반품 및 환불 요청을 관리하는 기본 화면입니다.',
      sections: [
        SkeletonSection(
          title: '요청 목록',
          helperText: '필터/검색/상태별 분류 영역',
        ),
        SkeletonSection(
          title: '처리 정보',
          helperText: '사유, 환불 방식, 처리 담당자 입력',
          itemCount: 2,
        ),
      ],
    );
  }
}

class SettlementHistoryScreen extends StatelessWidget {
  const SettlementHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '정산 내역',
      subtitle: '정산 현황과 정산 요청 내역을 확인하는 화면입니다.',
      sections: [
        SkeletonSection(
          title: '정산 요약',
          helperText: '기간별 매출/수수료 요약',
          itemCount: 2,
        ),
        SkeletonSection(
          title: '정산 리스트',
          helperText: '정산 상태, 지급일, 금액 표시',
        ),
      ],
    );
  }
}

class CustomerListScreen extends StatelessWidget {
  const CustomerListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '회원 리스트',
      subtitle: '회원 정보와 구매 이력 요약을 보여주는 화면입니다.',
      sections: [
        SkeletonSection(
          title: '검색/필터',
          helperText: '이름, 등급, 가입일 기준 필터',
          itemCount: 2,
        ),
        SkeletonSection(
          title: '회원 목록',
          helperText: '회원 기본 정보 및 상태 표시',
        ),
      ],
    );
  }
}

class InquiryManagementScreen extends StatelessWidget {
  const InquiryManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '문의 관리',
      subtitle: '1:1 문의 및 상담 기록을 관리하는 화면입니다.',
      sections: [
        SkeletonSection(
          title: '문의 목록',
          helperText: '상태, 담당자, 처리 기한',
        ),
        SkeletonSection(
          title: '응답 작성',
          helperText: '답변 템플릿 및 처리 이력',
          itemCount: 2,
        ),
      ],
    );
  }
}

class ReviewManagementScreen extends StatelessWidget {
  const ReviewManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '리뷰 관리',
      subtitle: '리뷰 승인 및 신고 처리를 위한 화면입니다.',
      sections: [
        SkeletonSection(
          title: '리뷰 목록',
          helperText: '평점, 신고 여부, 상태별 정렬',
        ),
        SkeletonSection(
          title: '리뷰 상세',
          helperText: '이미지, 평점, 답글 작성',
          itemCount: 2,
        ),
      ],
    );
  }
}

class CouponManagementScreen extends StatelessWidget {
  const CouponManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '쿠폰 관리',
      subtitle: '쿠폰 생성과 적용 현황을 관리하는 화면입니다.',
      sections: [
        SkeletonSection(
          title: '쿠폰 리스트',
          helperText: '상태/유효기간/할인 유형',
        ),
        SkeletonSection(
          title: '쿠폰 생성',
          helperText: '쿠폰명, 할인율, 적용 조건 입력',
          itemCount: 2,
        ),
      ],
    );
  }
}

class BannerPopupScreen extends StatelessWidget {
  const BannerPopupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '배너/팝업',
      subtitle: '메인 배너 및 팝업 노출을 관리하는 화면입니다.',
      sections: [
        SkeletonSection(
          title: '노출 리스트',
          helperText: '노출 위치, 기간, 우선순위 관리',
        ),
        SkeletonSection(
          title: '콘텐츠 설정',
          helperText: '이미지 업로드, 링크 설정',
          itemCount: 2,
        ),
      ],
    );
  }
}

class ExhibitionScreen extends StatelessWidget {
  const ExhibitionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '기획전',
      subtitle: '테마별 상품 큐레이션을 구성하는 화면입니다.',
      sections: [
        SkeletonSection(
          title: '기획전 목록',
          helperText: '기간, 테마, 노출 상태',
        ),
        SkeletonSection(
          title: '상품 구성',
          helperText: '상품 추가, 순서 정렬',
          itemCount: 2,
        ),
      ],
    );
  }
}

class PaymentShippingSettingsScreen extends StatelessWidget {
  const PaymentShippingSettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '결제/배송 설정',
      subtitle: '결제 수단과 배송 정책을 설정하는 화면입니다.',
      sections: [
        SkeletonSection(
          title: '결제 설정',
          helperText: 'PG사, 결제 수단, 수수료',
          itemCount: 2,
        ),
        SkeletonSection(
          title: '배송 설정',
          helperText: '배송비, 택배사, 출고지 정보',
          itemCount: 2,
        ),
      ],
    );
  }
}

class PolicyManagementScreen extends StatelessWidget {
  const PolicyManagementScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const MenuSkeletonScreen(
      title: '운영 정책',
      subtitle: '약관 및 운영 정책을 관리하는 화면입니다.',
      sections: [
        SkeletonSection(
          title: '정책 목록',
          helperText: '약관, 개인정보, 운영 정책',
        ),
        SkeletonSection(
          title: '정책 편집',
          helperText: '에디터 및 버전 관리',
          itemCount: 2,
        ),
      ],
    );
  }
}
