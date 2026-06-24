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
    _Agreement(
      label: '[필수] 개인정보 제3자 제공 동의',
      isRequired: true,
      body: _kBodyThirdParty,
    ),
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

                    // 동의등급제 안내
                    const Padding(
                      padding: EdgeInsets.only(bottom: 10),
                      child: Text(
                        '동의등급제 안내',
                        style: TextStyle(
                          fontFamily: ST.font,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: ST.text2,
                          letterSpacing: -0.13,
                        ),
                      ),
                    ),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Row(
                        children: const [
                          _Grade(label: '안심', color: Color(0xFF7ED5D0)),
                          _Grade(label: '다소안심', color: Color(0xFF9ADF7A)),
                          _Grade(label: '보통', color: Color(0xFFD4A85A)),
                          _Grade(label: '신중', color: Color(0xFFE8895C)),
                          _Grade(label: '주의', color: Color(0xFFD44A4A)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      '동의등급제는 개인(신용) 선택적 동의 항목에 대해\n사생활 비밀과 자유를 침해할 위험, 이익 등을 고려해\n5가지 등급을 부여하는 제도예요.',
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

  Widget _buildRow({
    required String text,
    required bool checked,
    required VoidCallback onToggle,
    required VoidCallback onDetail,
  }) {
    return Row(
      children: [
        // 체크 영역만 토글
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onToggle,
          child: Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: checked ? ST.ice500 : ST.line,
              shape: BoxShape.circle,
            ),
            child:
                const Icon(Icons.check_rounded, size: 14, color: Colors.white),
          ),
        ),
        const SizedBox(width: 12),
        // 텍스트 + chevron 영역 — 탭하면 상세보기
        Expanded(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onDetail,
            child: Row(
              children: [
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
                const Icon(Icons.chevron_right_rounded,
                    size: 18, color: ST.text4),
              ],
            ),
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
    return Container(
      height: viewHeight * 0.9,
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
          // 동의 / 닫기 버튼
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
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

class _Grade extends StatelessWidget {
  const _Grade({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 6),
        color: color,
        alignment: Alignment.center,
        child: Text(
          label,
          style: const TextStyle(
            fontFamily: ST.font,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
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
가입 절차 완료 즉시 본인확인 원본 정보는 폐기하며, CI/DI 만 회원 식별을 위해 회원 탈퇴 시까지 보관합니다.

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
- 필수: 이름, 생년월일, 성별, 휴대폰 번호, 이메일, 비밀번호
- 자녀 정보: 이름, 생년월일, 성별, 스케이팅 레벨, 프로필 사진(선택)
- 자동 수집: 접속 IP, 기기 정보, 서비스 이용 기록

제2조 (이용 목적)
- 회원 식별 및 인증
- 수업 매칭, 출석 관리, 결제 처리
- 코치 메모, 진도 리포트 제공
- 고객 문의 응대 및 분쟁 해결

제3조 (보유 및 이용 기간)
회원 탈퇴 시까지. 단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
- 계약·청약철회 기록: 5년
- 대금 결제·재화 공급 기록: 5년
- 소비자 불만 처리 기록: 3년

제4조 (거부 권리)
회원은 개인정보 수집·이용을 거부할 수 있으며, 거부 시 회원 가입 및 서비스 이용이 제한됩니다.''';

const String _kBodyThirdParty = '''제1조 (제공 대상 및 목적)
1) PG사(KG이니시스)
- 제공 항목: 이름, 휴대폰 번호, 결제 정보
- 이용 목적: 결제 처리 및 환불

2) 가입한 클럽·아카데미
- 제공 항목: 자녀 이름, 생년월일, 스케이팅 레벨, 보호자 연락처
- 이용 목적: 수업 운영, 출석 확인, 안전 관리

3) 알림톡 발송 대행사(카카오 비즈메시지)
- 제공 항목: 이름, 휴대폰 번호
- 이용 목적: 출석·결제·일정 변경 알림

제2조 (보유 및 이용 기간)
- PG사: 결제 완료 후 5년 (전자상거래법)
- 클럽·아카데미: 수업 종료 후 1년
- 알림톡 대행사: 발송 후 즉시 폐기

제3조 (거부 권리)
회원은 제3자 제공을 거부할 수 있으며, 거부 시 해당 서비스(결제, 클럽 수업, 알림) 이용이 제한됩니다.''';

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
