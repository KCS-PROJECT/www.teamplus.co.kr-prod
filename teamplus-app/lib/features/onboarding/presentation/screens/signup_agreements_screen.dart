import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/signup_flow_provider.dart';
import '../widgets/signup_app_bar.dart';
import '../widgets/signup_button.dart';
import '../widgets/signup_design_tokens.dart';

/// A6 · 약관 동의 (참고: onboarding-2.jsx OnAgreementsScreen)
/// 각 약관 행의 chevron 영역 탭 시 상세보기 bottom sheet 표시.
class SignupAgreementsScreen extends ConsumerStatefulWidget {
  const SignupAgreementsScreen({super.key});

  @override
  ConsumerState<SignupAgreementsScreen> createState() =>
      _SignupAgreementsScreenState();
}

class _SignupAgreementsScreenState
    extends ConsumerState<SignupAgreementsScreen> {
  static final _agreements = <_Agreement>[
    _Agreement(
      label: '[필수] 본인확인 서비스 이용 동의',
      isRequired: true,
      body: _kBodyIdentity,
    ),
    _Agreement(
      label: '[필수] 통신사 이용약관 동의',
      isRequired: true,
      body: _kBodyCarrier,
    ),
    _Agreement(
      label: '[필수] 개인정보 수집 및 이용 동의',
      isRequired: true,
      body: _kBodyPrivacy,
    ),
    // [2026-07-30] '[필수] 개인정보 제3자 제공 동의' 항목 삭제.
    //   PIPA §22⑤ — 선택적 동의 거부를 이유로 서비스 제공을 거부할 수 없다. 결제·알림 등
    //   서비스 수반 외부 처리는 §26 '처리 위탁'이므로 별도 제3자 제공 동의 자체가 불필요하다.
    //   웹 정책 SoT(terms-content.ts · legal/policy-content.ts §3)도 2026-06-14 부터
    //   외부 처리를 전부 위탁으로 통일했다. 위탁 고지는 _kBodyPrivacy 제3조로 이관.
    _Agreement(
      label: '[필수] 팀플러스 이용약관',
      isRequired: true,
      body: _kBodyService,
    ),
    _Agreement(
      label: '[선택] 마케팅 정보 수신',
      isRequired: false,
      body: _kBodyMarketing,
    ),
  ];

  late List<bool> _checks;

  /// 모든 약관(필수+선택) 체크 여부 — 전체 동의 박스 ON 표시 조건.
  bool get _allChecked => _checks.every((e) => e);

  /// 필수 약관만 모두 체크되었는지 — [확인] 버튼 활성 조건.
  /// 선택 약관([선택] 마케팅 정보 수신)은 미체크여도 가입을 진행할 수 있어야 하므로
  /// 버튼 활성 조건에서 제외한다.
  bool get _requiredChecked {
    for (int i = 0; i < _agreements.length; i++) {
      if (_agreements[i].isRequired && !_checks[i]) return false;
    }
    return true;
  }

  @override
  void initState() {
    super.initState();
    // 모든 항목 미체크 상태로 시작 (사용자가 직접 체크 필요)
    _checks = List<bool>.filled(_agreements.length, false);
  }

  void _toggleAll() {
    final next = !_checks.every((e) => e);
    setState(() {
      for (int i = 0; i < _checks.length; i++) {
        _checks[i] = next;
      }
    });
  }

  Future<void> _showAgreementDetail(int index) async {
    final agreement = _agreements[index];
    final agreed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: ST.puck.withValues(alpha: 0.55),
      builder: (_) => _AgreementDetailSheet(agreement: agreement),
    );
    if (agreed == true && mounted) {
      setState(() => _checks[index] = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final all = _allChecked;

    return Scaffold(
      backgroundColor: ST.surface,
      appBar: SignupAppBar(
        title: '약관동의',
        leading: SignupAppBarLeading.back,
        showClose: false,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 전체 동의 박스
                    InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: _toggleAll,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 18, vertical: 16),
                        decoration: BoxDecoration(
                          color: ST.ice50,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: ST.ice500, width: 1.5),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: all ? ST.ice500 : ST.line,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.check_rounded,
                                  size: 16, color: Colors.white),
                            ),
                            const SizedBox(width: 12),
                            const Text(
                              '약관 전체 동의',
                              style: TextStyle(
                                fontFamily: ST.font,
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: ST.text1,
                                letterSpacing: -0.15,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Container(height: 1, color: ST.line),
                    ),

                    // 항목들
                    for (int i = 0; i < _agreements.length; i++) ...[
                      if (i != 0) const SizedBox(height: 18),
                      _buildRow(
                        text: _agreements[i].label,
                        checked: _checks[i],
                        onToggle: () =>
                            setState(() => _checks[i] = !_checks[i]),
                        onDetail: () => _showAgreementDetail(i),
                      ),
                    ],

                    const SizedBox(height: 28),

                    // [2026-07-30] '동의등급제 안내'(5등급 색상 바 + 설명) 삭제.
                    //   신용정보법상 '개인신용정보' 선택적 동의에 적용되는 제도로,
                    //   신용정보 제공·조회를 하지 않는 본 서비스에는 무관한 문구였다.
                    //   대신 PIPA §22⑤(선택 거부 시에도 서비스 제공) + 동의 기록 시점을 고지한다.
                    const Text(
                      '[선택] 항목은 동의하지 않아도 회원가입과 서비스 이용에 제한이 없어요.\n'
                      '여기에서 확인한 동의 내용은 회원가입 단계에서 최종 확인 후 기록됩니다.',
                      style: TextStyle(
                        fontFamily: ST.font,
                        fontSize: 12,
                        color: ST.text3,
                        height: 1.55,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: SignupButton(
                label: '확인',
                variant: _requiredChecked
                    ? SignupBtnVariant.primary
                    : SignupBtnVariant.disabled,
                onPressed: _requiredChecked
                    ? () {
                        ref
                            .read(signupFlowProvider.notifier)
                            .acceptAgreements();
                        context.push('/signup/welcome');
                      }
                    : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // [2026-07-29 탭 영역 수정] 기존엔 22px 체크 원만 토글이고 라벨 텍스트 전체가
  //   상세보기 시트로 연결되어, 라벨을 눌러 체크하려던 사용자가 "선택해도 버튼이
  //   활성화되지 않는다"고 체감했다(파일 상단 주석의 원 의도는 chevron 영역만
  //   상세보기). 체크 원 + 라벨 = 토글, chevron = 상세보기로 분리해 의도와 일치시킴.
  Widget _buildRow({
    required String text,
    required bool checked,
    required VoidCallback onToggle,
    required VoidCallback onDetail,
  }) {
    return Row(
      children: [
        // 체크 원 + 라벨 — 행 대부분을 토글 터치 타겟으로 확대
        Expanded(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onToggle,
            child: Row(
              children: [
                Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: checked ? ST.ice500 : ST.line,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_rounded,
                      size: 14, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    text,
                    style: const TextStyle(
                      fontFamily: ST.font,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: ST.text2,
                      letterSpacing: -0.14,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        // chevron — 상세보기 전용 (패딩으로 터치 타겟 확보)
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onDetail,
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            child:
                Icon(Icons.chevron_right_rounded, size: 18, color: ST.text4),
          ),
        ),
      ],
    );
  }
}

/// 약관 모델
class _Agreement {
  const _Agreement({
    required this.label,
    required this.isRequired,
    required this.body,
  });

  final String label;
  final bool isRequired;
  final String body;
}

/// 약관 상세보기 bottom sheet — 90% 높이, 헤더 + 본문 + 동의 버튼
class _AgreementDetailSheet extends StatelessWidget {
  const _AgreementDetailSheet({required this.agreement});

  final _Agreement agreement;

  @override
  Widget build(BuildContext context) {
    final viewHeight = MediaQuery.of(context).size.height;
    // [2026-07-18] 하단 시스템 내비게이션 바(제스처/버튼) 높이. 시트는 화면 바닥에
    //   붙어 올라오므로 이 값을 확보하지 않으면 '닫기/동의하기' 버튼이 내비게이션 바에
    //   가려진다(사용자 보고). 버튼 아래 여백에 가산해 항상 보이도록 한다.
    final bottomInset = MediaQuery.of(context).viewPadding.bottom;
    return Container(
      // 시트 높이도 하단 내비 바 높이만큼 키워 본문 스크롤 영역이 눌리지 않게 한다.
      height: viewHeight * 0.9 + bottomInset,
      decoration: const BoxDecoration(
        color: ST.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Drag handle
          Container(
            margin: const EdgeInsets.only(top: 10, bottom: 6),
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: ST.line,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // 헤더
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 12, 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    agreement.label,
                    style: const TextStyle(
                      fontFamily: ST.font,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: ST.text1,
                      letterSpacing: -0.17,
                    ),
                  ),
                ),
                IconButton(
                  padding: EdgeInsets.zero,
                  tooltip: '닫기',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded,
                      size: 22, color: ST.text1),
                ),
              ],
            ),
          ),
          Container(height: 1, color: ST.line2),
          // 본문 (스크롤)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Text(
                  agreement.body,
                  style: const TextStyle(
                    fontFamily: ST.font,
                    fontSize: 14,
                    color: ST.text2,
                    height: 1.7,
                    letterSpacing: -0.14,
                  ),
                ),
              ),
            ),
          ),
          // 동의 / 닫기 버튼 — 하단 내비게이션 바 높이(bottomInset)만큼 여백 확보.
          Padding(
            padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + bottomInset),
            child: Row(
              children: [
                Expanded(
                  child: SignupButton(
                    label: '닫기',
                    variant: SignupBtnVariant.ghost,
                    onPressed: () => Navigator.of(context).pop(false),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: SignupButton(
                    label: '동의하기',
                    onPressed: () => Navigator.of(context).pop(true),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 약관 본문 — placeholder (실 운영 시 백엔드 CMS 또는 별도 마크다운 문서로 분리 권장)
// ─────────────────────────────────────────────────────────────────────────

const String _kBodyIdentity = '''제1조 (목적)
본 약관은 회원이 팀플러스에서 휴대폰 본인확인 서비스를 이용함에 있어 필요한 사항을 규정합니다.

제2조 (수집 항목)
- 이름, 생년월일, 성별, 휴대폰 번호, 통신사 정보
- 본인확인 인증 결과(CI/DI)

제3조 (이용 목적)
- 회원 신원 확인 및 부정 가입 방지
- 만 14세 미만 아동 보호자 확인
- 명의 도용 방지 및 서비스 보안

제4조 (보유 및 이용 기간)
본인확인 결과(이름, 생년월일, 성별, 휴대폰 번호, CI/DI)는 명의 도용 확인·중복 가입 방지·법정대리인 확인 목적으로 회원 탈퇴 시까지 보관하며, 탈퇴 시 지체 없이 파기(비식별화)합니다.
※ 관계 법령에 따라 보존 의무가 있는 거래·결제 기록은 해당 법정 기간 동안 별도 보관합니다.

제5조 (거부 권리)
본 동의를 거부할 권리가 있으며, 거부 시 회원 가입이 제한됩니다.''';

const String _kBodyCarrier = '''제1조 (목적)
휴대폰 본인확인을 위해 회원이 가입한 이동통신사(SKT, KT, LG U+ 및 알뜰폰 사업자)와 정보를 송수신하는 절차를 규정합니다.

제2조 (제공 정보)
- 이름, 생년월일, 성별, 휴대폰 번호
- 통신사 인증 요청 식별값

제3조 (제공 대상)
SK텔레콤, KT, LG U+ 및 본인확인기관(KISA 지정)

제4조 (이용 목적)
- 휴대폰 명의자 본인 확인
- SMS 인증번호 발송

제5조 (보유 기간)
인증 절차 종료 시 즉시 폐기됩니다.''';

const String _kBodyPrivacy = '''제1조 (수집 항목)
- 회원(필수): 이름, 생년월일, 성별, 휴대폰 번호, 아이디, 비밀번호
- 자녀(필수): 이름, 생년월일
- 자녀(선택): 성별, 보호자와의 관계, 프로필 사진, 특이사항 메모, 자녀 로그인용 아이디·비밀번호·연락처
- 자동 수집: 접속 IP, 기기 정보, 서비스 이용 기록
- 결제 정보: 거래번호·금액·결제수단 (카드번호 등 카드 정보 자체는 저장하지 않으며 PG사가 토큰화하여 관리)
※ 자녀의 학습 레벨·진도율·평가일은 수집 항목이 아니라 코치 평가에 따라 서비스 이용 중 생성되는 기록입니다.

제2조 (이용 목적)
- 회원 식별 및 인증, 만 14세 미만 아동의 법정대리인 동의 확인
- 수업 매칭, 출석 관리, 결제 처리
- 코치 메모, 진도 리포트 제공
- 고객 문의 응대 및 분쟁 해결

제3조 (제3자 제공 및 처리 위탁)
1) 회사는 회원의 개인정보를 제3자에게 제공하지 않습니다. 다만 회원의 별도 동의가 있거나 법령에 특별한 규정이 있는 경우에 한합니다.
2) 결제·본인확인·알림 발송 등 서비스 제공에 수반되는 외부 처리는 제3자 '제공'이 아니라 「개인정보보호법」 제26조에 따른 '처리 위탁'으로, 회사의 관리·감독 하에 이루어집니다.
- 주식회사 KG이니시스: 결제 처리·정산, 통합 본인인증
- 주식회사 코리아포트원: 본인인증 중개
- 주식회사 카카오: 알림톡 발송
- NHN클라우드(주): SMS 인증·알림 발송(알림톡 실패 시 폴백)
- Google LLC(Firebase Cloud Messaging): 앱 푸시 알림 발송
- 택배사(CJ대한통운·한진택배·롯데글로벌로지스 등): 쇼핑몰 상품 배송
3) 소속 클럽·아카데미의 코치·운영진은 수업·출석 운영에 필요한 범위에서 회원·자녀의 기본 정보를 열람할 수 있으며, 이는 서비스 운영을 위한 내부 접근으로 접근 이력이 기록됩니다.

제4조 (보유 및 이용 기간)
회원 탈퇴 시까지. 단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
- 계약·청약철회 기록: 5년
- 대금 결제·재화 공급 기록: 5년
- 소비자 불만 처리 기록: 3년

제5조 (거부 권리)
회원은 개인정보 수집·이용을 거부할 수 있으며, 거부 시 회원 가입 및 서비스 이용이 제한됩니다.''';

const String _kBodyService = '''제1장 총칙

제1조 (목적)
본 약관은 팀플러스(이하 "회사")가 제공하는 아이스하키 수업 예약·진행·관리 서비스 이용에 관한 회사와 회원의 권리, 의무 및 책임 사항을 규정합니다.

제2조 (용어의 정의)
- "회원": 본 약관에 동의하고 가입한 학부모, 코치, 감독, 학생을 말합니다.
- "수업": 회사가 중개하는 아이스하키 강습, 클럽 활동, 대회 등 모든 활동을 의미합니다.
- "결제권": 수업 결제에 사용되는 선불 충전 금액입니다.

제2장 서비스 이용

제3조 (서비스 제공)
회사는 다음 서비스를 제공합니다.
1. 수업 예약 및 출석 관리
2. 결제·환불·결제권 관리
3. 코치 메모, 진도 리포트
4. 클럽/아카데미 가입 중개
5. 대회 및 이벤트 정보

제4조 (회원의 의무)
회원은 다음 행위를 하여서는 안 됩니다.
1. 타인의 정보 도용 및 부정 가입
2. 회사·코치·다른 회원에 대한 명예 훼손
3. 서비스 운영 방해 행위
4. 법령 또는 공서양속에 위배되는 행위

제3장 결제 및 환불

제5조 (결제)
- 모든 결제는 회사가 지정한 PG사(KG이니시스)를 통해 이루어집니다.
- 카드 정보는 회사 서버에 저장되지 않으며 PG사가 토큰화하여 관리합니다.

제6조 (환불)
- 수업 시작 24시간 전: 100% 환불
- 수업 시작 24시간 이내: 환불 불가 (정당한 사유 시 협의)
- 결제권 환불: 사용하지 않은 잔액에 한해 환불

제4장 기타

제7조 (계약의 해지)
회원은 언제든지 마이페이지에서 탈퇴할 수 있습니다.

제8조 (분쟁 해결)
본 약관과 관련된 분쟁은 회사 본점 소재지 관할 법원을 1심 법원으로 합니다.''';

const String _kBodyMarketing = '''제1조 (목적)
회사가 진행하는 이벤트, 신규 수업, 할인 혜택, 시즌별 프로모션 등의 정보를 회원에게 안내하기 위한 마케팅 정보 수신 동의에 관한 사항입니다.

제2조 (전송 채널)
- 이메일
- SMS / 알림톡
- 앱 푸시 알림

제3조 (수신 정보)
- 신규 수업 및 코치 소개
- 시즌 할인 및 쿠폰
- 대회 및 이벤트 안내
- 멤버십 혜택 안내

제4조 (수신 거부)
회원은 언제든지 마이페이지 > 알림 설정에서 수신 거부할 수 있으며, 거부 시에도 회원 가입 및 서비스 이용에는 제한이 없습니다.

제5조 (유효 기간)
회원 탈퇴 또는 수신 거부 시까지.''';
