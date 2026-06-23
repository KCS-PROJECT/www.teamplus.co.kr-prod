import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../onboarding/presentation/widgets/signup_design_tokens.dart';

/// 고객센터 안내 — SoT: teamplus-web `COMPANY_INFO`(lib/legal/policy-content.ts).
/// 앱에는 공유 회사정보 상수가 없어 로컬 정의한다(번호 변경 시 web/app 양쪽 동기화).
const String _csPhone = '02-557-5321';
const String _csHours = '평일 09:00~18:00';

/// M4 · 시스템 점검 공지 (System Maintenance Notice)
///
/// 참고: `팀플러스 추가화면.html` 의 `screen-maintenance.jsx`(SystemMaintenanceScreen) 1:1 매핑.
/// 풀스크린 · 앱 네이티브 무드 · 펭구 엔지니어 일러스트 중심.
///
/// 관리자가 등록한 점검 공지(SystemNotice)의 **제목·내용·기간**을 동적으로 표시한다.
/// (값이 없으면 기본 안내 문구로 폴백 — 진입 차단 자체는 항상 동작)
class SystemMaintenanceScreen extends StatefulWidget {
  const SystemMaintenanceScreen({
    super.key,
    this.title,
    this.content,
    this.startAt,
    this.expiresAt,
    this.serverNow,
    this.reason,
    this.noticeDate,
    this.csPhone,
    this.csHours,
    this.onConfirm,
  });

  /// 관리자가 등록한 점검 공지 제목(없으면 기본 문구).
  final String? title;

  /// 관리자가 등록한 점검 공지 내용(없으면 기본 안내 · 길면 스크롤).
  final String? content;

  /// 점검 시작 일시(표시용 · 단말 로컬 시각).
  final DateTime? startAt;

  /// 점검 종료 일시(표시용 · 단말 로컬 시각).
  final DateTime? expiresAt;

  /// 서버 현재 시각(단말 로컬 시각으로 변환됨).
  /// '예상 완료'가 오늘인지 판정할 때 단말 시계 대신 이 값을 우선 사용한다.
  /// null이면 단말 시각으로 폴백(점검 정책상 차단 자체는 서버 판정이라 무관).
  final DateTime? serverNow;

  /// 점검 사유(있으면 정보 카드 '점검사유' 행 표시 · 없으면 행 자체를 숨김).
  /// 백엔드 `SystemNotice.maintenanceReason` → 게이트가 주입.
  final String? reason;

  /// 공지 등록 일시(createdAt) — 공지 상세 카드의 날짜 표시용(없으면 날짜 생략).
  final DateTime? noticeDate;

  /// 고객센터 전화번호(서버 AppSettings.supportPhone). null이면 기본 상수 폴백.
  final String? csPhone;

  /// 고객센터 운영시간(서버 AppSettings.supportHours). null이면 기본 상수 폴백.
  final String? csHours;

  /// 확인 콜백 — 값이 있을 때만 "확인했어요" 버튼이 노출된다.
  /// 시스템 점검 차단 컨텍스트에서는 null 로 두어 버튼을 숨기고
  /// 사용자가 화면을 빠져나갈 수 없도록 한다.
  final VoidCallback? onConfirm;

  @override
  State<SystemMaintenanceScreen> createState() =>
      _SystemMaintenanceScreenState();
}

class _SystemMaintenanceScreenState extends State<SystemMaintenanceScreen>
    with TickerProviderStateMixin {
  // 일러스트 작업중 점 점 점(3 dot) — 1.4s 반복.
  late final AnimationController _dotsController;
  // 상태 배지 펄스 도트(원본 pulseDot 1.6s) — 디자인 SoT 복원.
  late final AnimationController _pulseController;
  // 점검 진행바(인디터미네이트 maintBar 1.9s) — 좌→우 슬라이드.
  late final AnimationController _barController;

  @override
  void initState() {
    super.initState();
    _dotsController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();
    _barController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1900),
    )..repeat();
  }

  @override
  void dispose() {
    _dotsController.dispose();
    _pulseController.dispose();
    _barController.dispose();
    super.dispose();
  }

  static String _two(int n) => n.toString().padLeft(2, '0');

  /// "오전/오후 hh:mm" 12시간 포맷 — intl 한글 locale 미초기화 환경 대응 수동 변환.
  static String _koreanTime(DateTime dt) {
    final isPm = dt.hour >= 12;
    var h12 = dt.hour % 12;
    if (h12 == 0) h12 = 12;
    return '${isPm ? '오후' : '오전'} ${_two(h12)}:${_two(dt.minute)}';
  }

  /// 예상 완료 — 기준 시각(서버 우선)과 같은 날이면 시간만, 다른 날이면 "MM.dd " 접두.
  static String _formatEta(DateTime end, DateTime now) {
    final sameDay =
        now.year == end.year && now.month == end.month && now.day == end.day;
    final time = _koreanTime(end);
    return sameDay ? time : '${_two(end.month)}.${_two(end.day)} $time';
  }

  /// 점검일 — "yyyy.MM.dd" / 다른 날 "yyyy.MM.dd ~ MM.dd"(다른 해면 양쪽 full).
  static String _formatDateRange(DateTime? s, DateTime? e) {
    String d(DateTime x) => '${x.year}.${_two(x.month)}.${_two(x.day)}';
    if (s != null && e != null) {
      final sameDay = s.year == e.year && s.month == e.month && s.day == e.day;
      if (sameDay) return d(s);
      return s.year == e.year
          ? '${d(s)} ~ ${_two(e.month)}.${_two(e.day)}'
          : '${d(s)} ~ ${d(e)}';
    }
    return s != null ? d(s) : (e != null ? d(e) : '');
  }

  /// 점검시간 — "HH:mm ~ HH:mm"(24시간 · 분 단위).
  static String _formatTimeRange(DateTime? s, DateTime? e) {
    String t(DateTime x) => '${_two(x.hour)}:${_two(x.minute)}';
    if (s != null && e != null) return '${t(s)} ~ ${t(e)}';
    if (s != null) return '${t(s)} ~';
    if (e != null) return '~ ${t(e)}';
    return '';
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
        systemNavigationBarColor: Color(0xFFFFFFFF),
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: PopScope(
        canPop: false,
        child: Scaffold(
          backgroundColor: const Color(0xFFF4F6FB),
          body: Stack(
            children: [
              // Layer 1 · 부드러운 배경 그라디언트 (빙판 분위기)
              const Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      stops: [0.0, 0.6, 1.0],
                      colors: [
                        ST.ice50,
                        Color(0xFFF4F6FB),
                        Color(0xFFFFFFFF),
                      ],
                    ),
                  ),
                ),
              ),

              // Layer 2 · 상단 글로우 (radial ice200, blur 20)
              Positioned(
                top: -80,
                left: 0,
                right: 0,
                height: 360,
                child: IgnorePointer(
                  child: Center(
                    child: SizedBox(
                      width: 360,
                      height: 360,
                      child: CustomPaint(
                        painter: _TopGlowPainter(),
                      ),
                    ),
                  ),
                ),
              ),

              // Layer 3 · 본문 (SafeArea)
              SafeArea(
                bottom: false,
                child: Column(
                  children: [
                    Expanded(
                      child: SingleChildScrollView(
                        physics: const ClampingScrollPhysics(),
                        // 원본 CSS `padding: "16px 24px 0"` 1:1 매핑 — bottom 0
                        padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const SizedBox(height: 12),
                            // 헤더 배지 — "SYSTEM MAINTENANCE" + 펄스 도트(원본 1:1)
                            Center(
                              child: AnimatedBuilder(
                                animation: _pulseController,
                                builder: (context, _) => _StatusPill(
                                  label: 'SYSTEM MAINTENANCE',
                                  pulse: _pulseController.value,
                                ),
                              ),
                            ),

                            const SizedBox(height: 22),

                            // 일러스트 — 펭구 엔지니어 + 빙판 + 콘
                            Center(
                              child: SizedBox(
                                width: 240,
                                height: 220,
                                child: AnimatedBuilder(
                                  animation: _dotsController,
                                  builder: (context, _) {
                                    return CustomPaint(
                                      painter: _PenguEngineerPainter(
                                        progress: _dotsController.value,
                                      ),
                                    );
                                  },
                                ),
                              ),
                            ),

                            const SizedBox(height: 18),

                            // Title — 히어로는 항상 브랜드 기본 문구(안심 메시지).
                            // 관리자 등록 제목/내용은 아래 '공지' 카드에서 명확히 표시한다.
                            Text(
                              '잠시 빙판을 정비 중이에요',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontFamily: ST.font,
                                fontSize: 24,
                                fontWeight: FontWeight.w900,
                                color: ST.text1,
                                letterSpacing: -0.84, // -0.035em * 24
                                height: 1.35,
                              ),
                            ),

                            const SizedBox(height: 8),

                            // Subtitle — 점검 중 기본 안내(항상 노출)
                            const Text(
                              '더 빠르고 안전한 서비스 제공을 위해\n시스템을 점검하고 있어요. 잠시만 기다려 주세요.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontFamily: ST.font,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: ST.text3,
                                height: 1.6,
                              ),
                            ),

                            const SizedBox(height: 22),

                            // 점검 진행바 + 예상 완료(있으면) — 인디터미네이트
                            AnimatedBuilder(
                              animation: _barController,
                              builder: (context, _) => _ProgressSection(
                                barProgress: _barController.value,
                                etaText: widget.expiresAt != null
                                    ? _formatEta(widget.expiresAt!,
                                        widget.serverNow ?? DateTime.now())
                                    : null,
                              ),
                            ),

                            const SizedBox(height: 16),

                            // 점검 정보 카드 — 점검일/점검시간/점검사유 아이콘 칩 행
                            // (디자인 순서: 진행바 → 점검 정보 → 공지 상세)
                            if (widget.startAt != null ||
                                widget.expiresAt != null ||
                                widget.reason != null) ...[
                              _MaintenanceInfoCard(
                                rows: [
                                  if (widget.startAt != null ||
                                      widget.expiresAt != null) ...[
                                    _InfoRow(
                                      icon: Icons.event_rounded,
                                      tint: ST.ice600,
                                      bg: ST.ice50,
                                      label: '점검일',
                                      value: _formatDateRange(
                                          widget.startAt, widget.expiresAt),
                                    ),
                                    _InfoRow(
                                      icon: Icons.schedule_rounded,
                                      tint: const Color(0xFFE89B00),
                                      bg: ST.sun100,
                                      label: '점검시간',
                                      value: _formatTimeRange(
                                          widget.startAt, widget.expiresAt),
                                    ),
                                  ],
                                  if (widget.reason != null)
                                    _InfoRow(
                                      icon: Icons.shield_rounded,
                                      tint: ST.flame500,
                                      bg: ST.flame100,
                                      label: '점검사유',
                                      value: widget.reason!,
                                    ),
                                ],
                              ),
                              const SizedBox(height: 14),
                            ],

                            // 공지 상세 카드 — 공지사항 제목 + 내용 (관리자 등록).
                            if (widget.title != null || widget.content != null)
                              _NoticeCard(
                                title: widget.title,
                                content: widget.content,
                                date: widget.noticeDate,
                              ),
                          ],
                        ),
                      ),
                    ),

                    // 하단 고정 영역 — 고객센터 안내(상시) + 확인 버튼(onConfirm 시).
                    // 차단 모드에서는 onConfirm 미전달 → 확인 버튼 숨김(빠져나갈 경로 없음).
                    // 고객센터는 점검 중 지원 연락처라 항상 노출(탭 시 tel: 다이얼만 열림 →
                    // 앱 화면을 벗어나지 않으므로 차단 정책과 무관).
                    Padding(
                      padding: EdgeInsets.fromLTRB(
                        24,
                        4,
                        24,
                        24 + MediaQuery.of(context).viewPadding.bottom,
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // 고객센터 전화·운영시간 — 서버(AppSettings)값 우선, 없으면 상수 폴백.
                          _CustomerSupportButton(
                            phone: widget.csPhone ?? _csPhone,
                            hours: widget.csHours ?? _csHours,
                          ),
                          if (widget.onConfirm != null) ...[
                            const SizedBox(height: 8),
                            SizedBox(
                              width: double.infinity,
                              height: 56,
                              child: _ConfirmButton(
                                label: '확인했어요',
                                onPressed: widget.onConfirm,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 상단 글로우 (radial gradient ice200 → transparent, blur 20 효과)
class _TopGlowPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final paint = Paint()
      ..shader = RadialGradient(
        colors: [
          ST.ice200.withValues(alpha: 0.6),
          ST.ice200.withValues(alpha: 0.0),
        ],
        stops: const [0.0, 0.7],
      ).createShader(rect)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 20);

    canvas.drawCircle(center, radius, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// 상태 배지 — "SYSTEM MAINTENANCE" + 펄스 도트(원본 pulseDot 1.6s 1:1)
class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.pulse});
  final String label;

  /// 펄스 진행값 0~1(반복) — 도트 위 확산 링의 scale(1→2.6)/opacity(0.55→0) 구동.
  final double pulse;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
      decoration: BoxDecoration(
        color: ST.surface,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: ST.line2, width: 1),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D141826), // rgba(20,24,38,0.05)
            offset: Offset(0, 4),
            blurRadius: 14,
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // 펄스 도트 — 베이스 솔리드 + 확산 링
          SizedBox(
            width: 7,
            height: 7,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                Opacity(
                  opacity: (1 - pulse) * 0.55,
                  child: Transform.scale(
                    scale: 1 + pulse * 1.6, // 1 → 2.6
                    child: const DecoratedBox(
                      decoration: BoxDecoration(
                        color: ST.ice500,
                        shape: BoxShape.circle,
                      ),
                      child: SizedBox(width: 7, height: 7),
                    ),
                  ),
                ),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    color: ST.ice500,
                    shape: BoxShape.circle,
                  ),
                  child: SizedBox(width: 7, height: 7),
                ),
              ],
            ),
          ),
          const SizedBox(width: 7),
          Text(
            label,
            style: const TextStyle(
              fontFamily: ST.font,
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              color: ST.ice600,
              letterSpacing: 0.23, // 0.02em * 11.5
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

/// 점검 진행바 섹션 — "점검 진행 중" + 예상 완료(있으면) + 인디터미네이트 바.
class _ProgressSection extends StatelessWidget {
  const _ProgressSection({required this.barProgress, this.etaText});

  /// 0~1 반복 — 바의 좌→우 슬라이드 위치 구동(maintBar 1.9s).
  final double barProgress;

  /// 예상 완료 표시 텍스트(없으면 우측 라벨 숨김).
  final String? etaText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const Text(
              '점검 진행 중',
              style: TextStyle(
                fontFamily: ST.font,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: ST.text2,
                letterSpacing: -0.12,
              ),
            ),
            if (etaText != null)
              Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(
                      text: '예상 완료 ',
                      style: TextStyle(
                        fontFamily: ST.font,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: ST.text3,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                    TextSpan(
                      text: etaText,
                      style: const TextStyle(
                        fontFamily: ST.font,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: ST.ice600,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: SizedBox(
            height: 7,
            child: ColoredBox(
              color: ST.ice100,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final w = constraints.maxWidth;
                  final barW = w * 0.42;
                  // left: -barW → w (좌측 밖에서 우측 밖으로 슬라이드)
                  final left = -barW + (w + barW) * barProgress;
                  return Stack(
                    children: [
                      Positioned(
                        left: left,
                        top: 0,
                        bottom: 0,
                        width: barW,
                        child: const DecoratedBox(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.all(Radius.circular(999)),
                            gradient: LinearGradient(
                              begin: Alignment.centerLeft,
                              end: Alignment.centerRight,
                              colors: [ST.ice400, ST.ice500],
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// 고객센터 안내 버튼 — 탭 시 tel: 다이얼(앱을 벗어나지 않음).
class _CustomerSupportButton extends StatelessWidget {
  const _CustomerSupportButton({required this.phone, required this.hours});

  /// 고객센터 전화(서버 우선)·운영시간. 호출부에서 서버값 또는 상수 폴백을 주입.
  final String phone;
  final String hours;

  Future<void> _dial() async {
    final digits = phone.replaceAll(RegExp(r'[^0-9]'), '');
    final uri = Uri(scheme: 'tel', path: digits);
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
      }
    } catch (_) {
      // 다이얼 불가(시뮬레이터 등) — 조용히 무시.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: _dial,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: ST.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: ST.line2, width: 1),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x0A141826), // rgba(20,24,38,0.04)
                      offset: Offset(0, 3),
                      blurRadius: 10,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.support_agent_rounded,
                  size: 18,
                  color: ST.text2,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      '문제가 계속되나요?',
                      style: TextStyle(
                        fontFamily: ST.font,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: ST.text1,
                        letterSpacing: -0.13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '고객센터 $phone · $hours',
                      style: const TextStyle(
                        fontFamily: ST.font,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w500,
                        color: ST.text3,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: ST.text4,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 점검 정보 카드 — 아이콘 칩 + 라벨 + 값(우측) 행 구조(원본 1:1).
class _MaintenanceInfoCard extends StatelessWidget {
  const _MaintenanceInfoCard({required this.rows});
  final List<_InfoRow> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: ST.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ST.line2, width: 1),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D141826), // rgba(20,24,38,0.05)
            offset: Offset(0, 8),
            blurRadius: 22,
          ),
        ],
      ),
      child: Column(
        children: [
          for (int i = 0; i < rows.length; i++) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // 아이콘 칩 (tint + 연한 배경)
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: rows[i].bg,
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Icon(rows[i].icon, size: 16, color: rows[i].tint),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    rows[i].label,
                    style: const TextStyle(
                      fontFamily: ST.font,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: ST.text3,
                      letterSpacing: -0.125, // -0.01em * 12.5
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      rows[i].value,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        fontFamily: ST.font,
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: ST.text1,
                        letterSpacing: -0.135, // -0.01em * 13.5
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (i < rows.length - 1)
              const Divider(height: 1, thickness: 1, color: ST.line2),
          ],
        ],
      ),
    );
  }
}

class _InfoRow {
  final IconData icon;
  final Color tint;
  final Color bg;
  final String label;
  final String value;
  const _InfoRow({
    required this.icon,
    required this.tint,
    required this.bg,
    required this.label,
    required this.value,
  });
}

/// 공지 상세 카드 — '공지사항' 헤더(아이콘+라벨+날짜) + 제목 + 내용. (디자인 1:1)
/// 제목/내용 중 주입된 것만 표시(둘 다 없으면 호출부에서 렌더 생략).
/// 본문 좌측 정렬, 길이 제한 없음(상위 SingleChildScrollView 로 스크롤).
class _NoticeCard extends StatelessWidget {
  const _NoticeCard({this.title, this.content, this.date});
  final String? title;
  final String? content;
  final DateTime? date;

  static String _ymd(DateTime d) =>
      '${d.year}.${d.month.toString().padLeft(2, '0')}.${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      decoration: BoxDecoration(
        color: ST.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ST.line2, width: 1),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D141826), // rgba(20,24,38,0.05)
            offset: Offset(0, 8),
            blurRadius: 22,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 헤더 — 아이콘 칩 + '공지사항' + 날짜(우측)
          Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: ST.ice50,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Icon(
                  Icons.campaign_rounded,
                  size: 14,
                  color: ST.ice600,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                '공지사항',
                style: TextStyle(
                  fontFamily: ST.font,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: ST.ice600,
                  letterSpacing: 0.44, // 0.04em * 11
                ),
              ),
              if (date != null) ...[
                const Spacer(),
                Text(
                  _ymd(date!),
                  style: const TextStyle(
                    fontFamily: ST.font,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: ST.text4,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ],
          ),

          // 공지 제목
          if (title != null) ...[
            const SizedBox(height: 11),
            Text(
              title!,
              textAlign: TextAlign.left,
              style: const TextStyle(
                fontFamily: ST.font,
                fontSize: 15.5,
                fontWeight: FontWeight.w800,
                color: ST.text1,
                height: 1.4,
                letterSpacing: -0.31, // -0.02em * 15.5
              ),
            ),
          ],

          // 공지 내용
          if (content != null) ...[
            SizedBox(height: title != null ? 8 : 11),
            Text(
              content!,
              textAlign: TextAlign.left,
              style: const TextStyle(
                fontFamily: ST.font,
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: ST.text3,
                height: 1.72,
                letterSpacing: -0.13, // -0.01em * 13
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Confirm CTA Button — ice500 + blue shadow
class _ConfirmButton extends StatelessWidget {
  const _ConfirmButton({required this.label, this.onPressed});
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            // rgba ice500 0x44 = alpha 0.267
            color: ST.ice500.withValues(alpha: 0.267),
            offset: const Offset(0, 14),
            blurRadius: 28,
          ),
        ],
      ),
      child: Material(
        color: ST.ice500,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onPressed,
          child: Center(
            child: Text(
              label,
              style: const TextStyle(
                fontFamily: ST.font,
                fontSize: 15.5,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.31, // -0.02em * 15.5
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 펭구 엔지니어 + 빙판 + 콘 일러스트 (240x220 viewBox)
///
/// 참고자료 `screen-maintenance.jsx` SVG 1:1 매핑.
class _PenguEngineerPainter extends CustomPainter {
  _PenguEngineerPainter({required this.progress});

  /// 0.0 ~ 1.0 반복 (작업중 점 점 점 애니메이션용)
  final double progress;

  // viewBox 240x220 → canvas size 스케일
  double _sx(Size size) => size.width / 240.0;
  double _sy(Size size) => size.height / 220.0;

  Offset _p(Size size, double x, double y) =>
      Offset(x * _sx(size), y * _sy(size));

  @override
  void paint(Canvas canvas, Size size) {
    final sx = _sx(size);
    final sy = _sy(size);

    // ============================================================
    // 1. 빙판 배경 (라운드 사각, linear gradient #EAF1FE → #FFF, stroke #DCE3F2)
    // ============================================================
    final rinkRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(20 * sx, 40 * sy, 200 * sx, 150 * sy),
      Radius.circular(30 * math.min(sx, sy)),
    );
    final rinkPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFFEAF1FE), Color(0xFFFFFFFF)],
      ).createShader(
        Rect.fromLTWH(20 * sx, 40 * sy, 200 * sx, 150 * sy),
      );
    canvas.drawRRect(rinkRect, rinkPaint);
    canvas.drawRRect(
      rinkRect,
      Paint()
        ..color = const Color(0xFFDCE3F2)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );

    // ============================================================
    // 2. 빙판 라인 (center red line, opacity 0.25)
    // ============================================================
    canvas.drawLine(
      _p(size, 20, 115),
      _p(size, 220, 115),
      Paint()
        ..color = ST.flame500.withValues(alpha: 0.25)
        ..strokeWidth = 1.5,
    );

    // 빙판 face-off circle (ice blue, opacity 0.4)
    canvas.drawCircle(
      _p(size, 120, 115),
      22 * math.min(sx, sy),
      Paint()
        ..color = ST.ice300.withValues(alpha: 0.4)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    // face-off dot
    canvas.drawCircle(
      _p(size, 120, 115),
      2 * math.min(sx, sy),
      Paint()..color = ST.flame500.withValues(alpha: 0.5),
    );

    // ============================================================
    // 3. 그림자 (radial — penguin 발 아래)
    // ============================================================
    final shadowRect = Rect.fromCenter(
      center: _p(size, 120, 175),
      width: 96 * sx,
      height: 12 * sy,
    );
    canvas.drawOval(
      shadowRect,
      Paint()
        ..shader = RadialGradient(
          colors: [
            const Color(0x2E141826), // rgba(20,24,38,0.18)
            const Color(0x00141826),
          ],
        ).createShader(shadowRect),
    );

    // ============================================================
    // 4. 펭구 본체 (translate to (120,100))
    // ============================================================
    _drawPengu(canvas, size);

    // ============================================================
    // 5. 콘 (좌측 48,158)
    // ============================================================
    _drawCone(canvas, size, center: _p(size, 48, 158), large: true);

    // ============================================================
    // 6. 콘 (우측 192,162)
    // ============================================================
    _drawCone(canvas, size, center: _p(size, 192, 162), large: false);

    // ============================================================
    // 7. 공구 박스 (70,168)
    // ============================================================
    _drawToolbox(canvas, size, center: _p(size, 70, 168));

    // ============================================================
    // 8. 작업 중 표시 — 점 점 점 (170,60에서 시작, 8px 간격)
    // ============================================================
    _drawWorkingDots(canvas, size);

    // ============================================================
    // 9. 눈송이 흩날림 (opacity 0.5, ice300)
    // ============================================================
    _drawSnowflakes(canvas, size);
  }

  void _drawPengu(Canvas canvas, Size size) {
    final sx = _sx(size);
    final sy = _sy(size);

    // Pengu 중심 (120, 100) - 모든 좌표는 이 기준
    // 펭구 좌표 (cx, cy) → canvas: (120+cx)*sx, (100+cy)*sy
    Offset pp(double x, double y) => Offset((120 + x) * sx, (100 + y) * sy);

    // 공통 penguBody gradient 정의 — 각 shape 마다 자체 bounding box 로
    // shader 를 생성해 SVG `objectBoundingBox` 동작과 일치시킨다.
    const penguBodyGradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0xFF2A3247), Color(0xFF1F2536)],
    );

    // ---- 몸 (계란형) — penguBody linear gradient #2A3247 → #1F2536 ----
    // 몸 path bounding box: x[-34,34], y[18,92] → canvas (86,118)~(154,192)
    final bodyShader = penguBodyGradient.createShader(
      Rect.fromLTWH(86 * sx, 118 * sy, 68 * sx, 74 * sy),
    );

    final bodyPath = Path()
      ..moveTo(pp(-34, 65).dx, pp(-34, 65).dy)
      ..quadraticBezierTo(
          pp(-34, 18).dx, pp(-34, 18).dy, pp(0, 18).dx, pp(0, 18).dy)
      ..quadraticBezierTo(
          pp(34, 18).dx, pp(34, 18).dy, pp(34, 65).dx, pp(34, 65).dy)
      ..lineTo(pp(32, 85).dx, pp(32, 85).dy)
      ..quadraticBezierTo(
          pp(32, 92).dx, pp(32, 92).dy, pp(25, 92).dx, pp(25, 92).dy)
      ..lineTo(pp(-25, 92).dx, pp(-25, 92).dy)
      ..quadraticBezierTo(
          pp(-32, 92).dx, pp(-32, 92).dy, pp(-32, 85).dx, pp(-32, 85).dy)
      ..close();
    canvas.drawPath(bodyPath, Paint()..shader = bodyShader);

    // ---- 배 (흰색) ----
    final bellyPath = Path()
      ..moveTo(pp(-22, 58).dx, pp(-22, 58).dy)
      ..quadraticBezierTo(
          pp(-22, 32).dx, pp(-22, 32).dy, pp(0, 32).dx, pp(0, 32).dy)
      ..quadraticBezierTo(
          pp(22, 32).dx, pp(22, 32).dy, pp(22, 58).dx, pp(22, 58).dy)
      ..lineTo(pp(20, 80).dx, pp(20, 80).dy)
      ..quadraticBezierTo(
          pp(20, 85).dx, pp(20, 85).dy, pp(14, 85).dx, pp(14, 85).dy)
      ..lineTo(pp(-14, 85).dx, pp(-14, 85).dy)
      ..quadraticBezierTo(
          pp(-20, 85).dx, pp(-20, 85).dy, pp(-20, 80).dx, pp(-20, 80).dy)
      ..close();
    canvas.drawPath(bellyPath, Paint()..color = Colors.white);

    // ---- 안전 조끼 — vestGrad #FFC940 → #F59E0B ----
    final vestShader = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0xFFFFC940), Color(0xFFF59E0B)],
    ).createShader(Rect.fromLTWH(92 * sx, 126 * sy, 56 * sx, 32 * sy));

    final vestPath = Path()
      ..moveTo(pp(-28, 42).dx, pp(-28, 42).dy)
      ..quadraticBezierTo(
          pp(-28, 28).dx, pp(-28, 28).dy, pp(-16, 26).dx, pp(-16, 26).dy)
      ..lineTo(pp(-8, 30).dx, pp(-8, 30).dy)
      ..lineTo(pp(0, 28).dx, pp(0, 28).dy)
      ..lineTo(pp(8, 30).dx, pp(8, 30).dy)
      ..lineTo(pp(16, 26).dx, pp(16, 26).dy)
      ..quadraticBezierTo(
          pp(28, 28).dx, pp(28, 28).dy, pp(28, 42).dx, pp(28, 42).dy)
      ..lineTo(pp(28, 58).dx, pp(28, 58).dy)
      ..lineTo(pp(-28, 58).dx, pp(-28, 58).dy)
      ..close();
    canvas.drawPath(vestPath, Paint()..shader = vestShader);

    // 조끼 반사 띠 (흰색 가로 줄)
    canvas.drawRect(
      Rect.fromLTWH(pp(-30, 46).dx, pp(-30, 46).dy, 60 * sx, 3 * sy),
      Paint()..color = Colors.white.withValues(alpha: 0.8),
    );
    canvas.drawRect(
      Rect.fromLTWH(pp(-30, 53).dx, pp(-30, 53).dy, 60 * sx, 2 * sy),
      Paint()..color = Colors.white.withValues(alpha: 0.6),
    );

    // ---- 머리 (계란형 ellipse) ----
    // 원본 SVG `<ellipse fill="url(#penguBody)">` 는 ellipse 자체 bounding box
    // 기준으로 gradient 가 적용된다. 머리는 몸과 별도 shader 가 필요.
    // 머리 bounding box: center pp(0,0), rx=26, ry=22 → 좌상단 (-26, -22) 기준
    final headRect = Rect.fromCenter(
      center: pp(0, 0),
      width: 52 * sx,
      height: 44 * sy,
    );
    final headShader = penguBodyGradient.createShader(headRect);
    canvas.drawOval(headRect, Paint()..shader = headShader);

    // ---- 헬멧 (sun + dark stroke) ----
    final helmetPath = Path()
      ..moveTo(pp(-28, -2).dx, pp(-28, -2).dy)
      ..quadraticBezierTo(
          pp(-28, -28).dx, pp(-28, -28).dy, pp(0, -28).dx, pp(0, -28).dy)
      ..quadraticBezierTo(
          pp(28, -28).dx, pp(28, -28).dy, pp(28, -2).dx, pp(28, -2).dy)
      ..lineTo(pp(28, 4).dx, pp(28, 4).dy)
      ..lineTo(pp(-28, 4).dx, pp(-28, 4).dy)
      ..close();
    canvas.drawPath(helmetPath, Paint()..color = const Color(0xFFFFC940));
    canvas.drawPath(
      helmetPath,
      Paint()
        ..color = const Color(0xFFE89B00)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    // 헬멧 챙 (dark amber bar)
    canvas.drawRect(
      Rect.fromLTWH(pp(-30, 0).dx, pp(-30, 0).dy, 60 * sx, 4 * sy),
      Paint()..color = const Color(0xFFE89B00),
    );
    // 헬멧 라이트 (front headlamp)
    canvas.drawCircle(
      pp(0, -20),
      3.5 * math.min(sx, sy),
      Paint()..color = Colors.white.withValues(alpha: 0.9),
    );
    canvas.drawCircle(
      pp(0, -20),
      2 * math.min(sx, sy),
      Paint()..color = const Color(0xFFFFD23F),
    );
    // 헬멧 광 (highlight arc)
    final highlightPath = Path()
      ..moveTo(pp(-16, -22).dx, pp(-16, -22).dy)
      ..quadraticBezierTo(
          pp(-10, -28).dx, pp(-10, -28).dy, pp(0, -28).dx, pp(0, -28).dy);
    canvas.drawPath(
      highlightPath,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.6)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round,
    );

    // ---- 눈 (흰자 + 검은 동공 + 하이라이트) ----
    final whiteEye = Paint()..color = Colors.white;
    final pupilPaint = Paint()..color = const Color(0xFF0E1426);

    canvas.drawOval(
      Rect.fromCenter(center: pp(-9, 2), width: 7 * sx, height: 9 * sy),
      whiteEye,
    );
    canvas.drawOval(
      Rect.fromCenter(center: pp(9, 2), width: 7 * sx, height: 9 * sy),
      whiteEye,
    );
    canvas.drawCircle(pp(-8, 3), 2 * math.min(sx, sy), pupilPaint);
    canvas.drawCircle(pp(10, 3), 2 * math.min(sx, sy), pupilPaint);
    canvas.drawCircle(
        pp(-7.5, 2.2), 0.7 * math.min(sx, sy), Paint()..color = Colors.white);
    canvas.drawCircle(
        pp(10.5, 2.2), 0.7 * math.min(sx, sy), Paint()..color = Colors.white);

    // ---- 부리 ----
    final beakPath = Path()
      ..moveTo(pp(-3, 9).dx, pp(-3, 9).dy)
      ..lineTo(pp(3, 9).dx, pp(3, 9).dy)
      ..lineTo(pp(0, 13).dx, pp(0, 13).dy)
      ..close();
    canvas.drawPath(beakPath, Paint()..color = const Color(0xFFFFB72E));

    // ---- 볼 홍조 ----
    final blushPaint = Paint()
      ..color = const Color(0xFFFF9DB8).withValues(alpha: 0.6);
    canvas.drawOval(
      Rect.fromCenter(center: pp(-15, 9), width: 5 * sx, height: 3 * sy),
      blushPaint,
    );
    canvas.drawOval(
      Rect.fromCenter(center: pp(15, 9), width: 5 * sx, height: 3 * sy),
      blushPaint,
    );

    // ---- 왼팔 (rotate -20deg around (-30, 45)) ----
    // SVG `<ellipse fill="url(#penguBody)" transform="rotate(...)">` 는
    // ellipse 자체 bounding box 기준 gradient. canvas.translate/rotate 후
    // local 좌표계에서 shader 를 생성해야 정확히 일치한다.
    canvas.save();
    canvas.translate(pp(-30, 45).dx, pp(-30, 45).dy);
    canvas.rotate(-20 * math.pi / 180);
    final leftArmRect =
        Rect.fromCenter(center: Offset.zero, width: 12 * sx, height: 28 * sy);
    final leftArmShader = penguBodyGradient.createShader(leftArmRect);
    canvas.drawOval(leftArmRect, Paint()..shader = leftArmShader);
    canvas.restore();

    // ---- 렌치 (left arm, translate(-46, 30) rotate(-30deg)) ----
    canvas.save();
    canvas.translate(pp(-46, 30).dx, pp(-46, 30).dy);
    canvas.rotate(-30 * math.pi / 180);
    // 손잡이 (light steel)
    final handleRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(-2 * sx, 0, 3.5 * sx, 22 * sy),
      Radius.circular(1.5 * math.min(sx, sy)),
    );
    canvas.drawRRect(handleRect, Paint()..color = const Color(0xFFCFD6E8));
    // 헤드 (darker steel)
    final wrenchHeadPath = Path()
      ..moveTo(-5 * sx, -2 * sy)
      ..quadraticBezierTo(-8 * sx, -4 * sy, -8 * sx, -8 * sy)
      ..quadraticBezierTo(-8 * sx, -12 * sy, -4 * sx, -12 * sy)
      ..lineTo(4 * sx, -12 * sy)
      ..quadraticBezierTo(8 * sx, -12 * sy, 8 * sx, -8 * sy)
      ..quadraticBezierTo(8 * sx, -4 * sy, 5 * sx, -2 * sy)
      ..lineTo(4 * sx, 1 * sy)
      ..lineTo(-4 * sx, 1 * sy)
      ..close();
    canvas.drawPath(wrenchHeadPath, Paint()..color = const Color(0xFF8B95AD));
    // 헤드 hole
    canvas.drawCircle(
      Offset(0, -7 * sy),
      2.5 * math.min(sx, sy),
      Paint()..color = const Color(0xFFCFD6E8),
    );
    canvas.restore();

    // ---- 오른팔 (rotate 15deg around (30,45)) ----
    canvas.save();
    canvas.translate(pp(30, 45).dx, pp(30, 45).dy);
    canvas.rotate(15 * math.pi / 180);
    final rightArmRect =
        Rect.fromCenter(center: Offset.zero, width: 12 * sx, height: 28 * sy);
    final rightArmShader = penguBodyGradient.createShader(rightArmRect);
    canvas.drawOval(rightArmRect, Paint()..shader = rightArmShader);
    canvas.restore();

    // ---- 발 (orange) ----
    final feetPaint = Paint()..color = const Color(0xFFFFB72E);
    canvas.drawOval(
      Rect.fromCenter(center: pp(-12, 92), width: 18 * sx, height: 7 * sy),
      feetPaint,
    );
    canvas.drawOval(
      Rect.fromCenter(center: pp(12, 92), width: 18 * sx, height: 7 * sy),
      feetPaint,
    );
  }

  /// 콘 (orange gradient + 흰띠 + 검은 base)
  void _drawCone(Canvas canvas, Size size,
      {required Offset center, required bool large}) {
    final sx = _sx(size);
    final sy = _sy(size);

    canvas.save();
    canvas.translate(center.dx, center.dy);

    // SVG `<linearGradient gradientUnits="objectBoundingBox">` 동작 일치를 위해
    // canvas.translate 후 local 좌표계로 shader rect 생성.
    // 큰 콘 path bounds: x[-8,8], y[-12,0] / 작은 콘: x[-7,7], y[-10,0]
    final coneRect = large
        ? Rect.fromLTWH(-8 * sx, -12 * sy, 16 * sx, 12 * sy)
        : Rect.fromLTWH(-7 * sx, -10 * sy, 14 * sx, 10 * sy);
    final coneShader = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0xFFFF8B5A), Color(0xFFFF5A36)],
    ).createShader(coneRect);

    if (large) {
      // 큰 콘 (48,158)
      final conePath = Path()
        ..moveTo(0, 0)
        ..lineTo(-8 * sx, -2 * sy)
        ..lineTo(-7 * sx, -10 * sy)
        ..lineTo(-1 * sx, -12 * sy)
        ..lineTo(1 * sx, -12 * sy)
        ..lineTo(7 * sx, -10 * sy)
        ..lineTo(8 * sx, -2 * sy)
        ..close();
      canvas.drawPath(conePath, Paint()..shader = coneShader);

      // 흰 띠 (얇은+굵은)
      canvas.drawLine(
        Offset(-7 * sx, -6 * sy),
        Offset(7 * sx, -6 * sy),
        Paint()
          ..color = Colors.white
          ..strokeWidth = 2,
      );
      canvas.drawLine(
        Offset(-7.5 * sx, -3 * sy),
        Offset(7.5 * sx, -3 * sy),
        Paint()
          ..color = Colors.white
          ..strokeWidth = 2.5,
      );
      // 검은 base
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(-10 * sx, -1 * sy, 20 * sx, 3 * sy),
          Radius.circular(0.5 * math.min(sx, sy)),
        ),
        Paint()..color = const Color(0xFF1F2536),
      );
    } else {
      // 작은 콘 (192,162)
      final conePath = Path()
        ..moveTo(0, 0)
        ..lineTo(-7 * sx, -2 * sy)
        ..lineTo(-6 * sx, -8 * sy)
        ..lineTo(-1 * sx, -10 * sy)
        ..lineTo(1 * sx, -10 * sy)
        ..lineTo(6 * sx, -8 * sy)
        ..lineTo(7 * sx, -2 * sy)
        ..close();
      canvas.drawPath(conePath, Paint()..shader = coneShader);

      canvas.drawLine(
        Offset(-6 * sx, -5 * sy),
        Offset(6 * sx, -5 * sy),
        Paint()
          ..color = Colors.white
          ..strokeWidth = 2,
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(-8 * sx, -1 * sy, 16 * sx, 2.5 * sy),
          Radius.circular(0.5 * math.min(sx, sy)),
        ),
        Paint()..color = const Color(0xFF1F2536),
      );
    }

    canvas.restore();
  }

  /// 공구 박스 (blue rect + handle)
  void _drawToolbox(Canvas canvas, Size size, {required Offset center}) {
    final sx = _sx(size);
    final sy = _sy(size);

    canvas.save();
    canvas.translate(center.dx, center.dy);

    final toolboxPaint = Paint()..color = const Color(0xFF5A82FF);

    // 본체
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(-12 * sx, 0, 24 * sx, 11 * sy),
        Radius.circular(2 * math.min(sx, sy)),
      ),
      toolboxPaint,
    );
    // 손잡이
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(-8 * sx, -4 * sy, 16 * sx, 5 * sy),
        Radius.circular(2 * math.min(sx, sy)),
      ),
      toolboxPaint,
    );
    // 본체 반짝임
    canvas.drawRect(
      Rect.fromLTWH(-12 * sx, 3 * sy, 24 * sx, 1.5 * sy),
      Paint()..color = Colors.white.withValues(alpha: 0.4),
    );

    canvas.restore();
  }

  /// 작업 중 표시 — 펄스 도트 3개 (170,60에서 8px 간격)
  /// progress 0~1 반복, 각 도트는 0.0/0.143/0.286 phase 시프트
  void _drawWorkingDots(Canvas canvas, Size size) {
    final sx = _sx(size);
    final sy = _sy(size);

    final baseX = 170.0;
    final baseY = 60.0;
    final phases = [0.0, 0.143, 0.286];

    for (var i = 0; i < 3; i++) {
      final t = (progress + phases[i]) % 1.0;
      // SVG animate: 0.3 → 1 → 0.3 (sin wave)
      final eased = 0.3 + 0.7 * (0.5 + 0.5 * math.sin(t * 2 * math.pi));
      canvas.drawCircle(
        Offset((baseX + i * 8) * sx, baseY * sy),
        2.5 * math.min(sx, sy),
        Paint()..color = const Color(0xFFFFC940).withValues(alpha: eased),
      );
    }
  }

  /// 눈송이 흩날림 (4개, ice300, opacity 0.5)
  ///
  /// 원본 SVG `<text x="40" y="62" fontSize="14" fill="#85a8ff">❅</text>` 와
  /// 1:1 매핑하기 위해 TextPainter 로 유니코드 글리프 그대로 렌더링.
  /// SVG `<text>` y 는 baseline 기준 → TextPainter 의 `computeLineMetrics().ascent`
  /// 로 정확히 보정.
  void _drawSnowflakes(Canvas canvas, Size size) {
    final sx = _sx(size);
    final sy = _sy(size);

    final snowflakes = [
      _Snowflake(40, 62, 14),
      _Snowflake(200, 100, 10),
      _Snowflake(36, 120, 8),
      _Snowflake(205, 140, 12),
    ];

    for (final s in snowflakes) {
      final tp = TextPainter(
        text: TextSpan(
          text: '❅',
          style: TextStyle(
            fontSize: s.fontSize * math.min(sx, sy),
            color: ST.ice300.withValues(alpha: 0.5),
            height: 1.0,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();

      // SVG <text> y 는 baseline 기준. TextPainter baseline 보정.
      final metrics = tp.computeLineMetrics();
      final ascent =
          metrics.isNotEmpty ? metrics.first.ascent : tp.height * 0.8;
      final offset = Offset(
        s.x * sx,
        s.y * sy - ascent,
      );
      tp.paint(canvas, offset);
    }
  }

  @override
  bool shouldRepaint(covariant _PenguEngineerPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

class _Snowflake {
  final double x;
  final double y;
  final double fontSize;
  const _Snowflake(this.x, this.y, this.fontSize);
}
