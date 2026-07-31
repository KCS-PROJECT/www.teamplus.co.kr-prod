import 'package:flutter/foundation.dart'
    show LicenseEntryWithLineBreaks, LicenseRegistry;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:package_info_plus/package_info_plus.dart';

import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_card.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';

/// 번들 폰트 라이선스 원문 경로 — pubspec `assets/fonts/` 항목으로 함께 번들된다.
const String _kPretendardLicenseAsset = 'assets/fonts/OFL.txt';

/// `LicenseRegistry` 중복 등록 가드.
///
/// Flutter 기본 [showLicensePage] 는 pub 의존성 라이선스만 수집하므로, 직접 번들한
/// 폰트(Pretendard)는 등록해 주지 않으면 어디에도 고지되지 않는다. addLicense 는
/// 누적 등록이라 화면 재진입마다 호출하면 같은 항목이 여러 번 나열되므로 1회로 제한한다.
bool _pretendardLicenseRegistered = false;

/// 오픈소스 라이선스 고지 화면.
///
/// Apache-2.0 §4(d)(NOTICE 포함) · MIT/BSD(저작권 고지 + 라이선스 전문 포함) ·
/// SIL OFL 1.1 §2(폰트 사본 배포 시 저작권 고지 + 라이선스 포함) 의무를 이행한다.
class ProfileLicensesScreen extends StatefulWidget {
  const ProfileLicensesScreen({super.key});

  @override
  State<ProfileLicensesScreen> createState() => _ProfileLicensesScreenState();
}

class _ProfileLicensesScreenState extends State<ProfileLicensesScreen> {
  @override
  void initState() {
    super.initState();
    _registerBundledFontLicense();
  }

  void _registerBundledFontLicense() {
    if (_pretendardLicenseRegistered) return;
    _pretendardLicenseRegistered = true;
    LicenseRegistry.addLicense(() async* {
      final text = await rootBundle.loadString(_kPretendardLicenseAsset);
      yield LicenseEntryWithLineBreaks(const ['Pretendard'], text);
    });
  }

  Future<void> _openLicensePage() async {
    final info = await PackageInfo.fromPlatform();
    if (!mounted) return;
    showLicensePage(
      context: context,
      applicationName: '팀플러스',
      applicationVersion: 'v${info.version} (${info.buildNumber})',
      applicationLegalese: '© 주식회사 아이스타임즈',
    );
  }

  Future<void> _openFontLicense() async {
    final text = await rootBundle.loadString(_kPretendardLicenseAsset);
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _LicenseTextScreen(
          title: 'Pretendard 폰트 라이선스',
          body: text,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const TeamplusAppBar(title: '오픈소스 라이선스'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '팀플러스는 다음 오픈소스 소프트웨어와 폰트를 사용하고 있으며, '
                '각 라이선스의 고지 의무에 따라 저작권 표시와 라이선스 전문을 제공합니다.',
                style: TextStyle(
                  fontSize: 14,
                  height: 1.6,
                  color: AppColors.lightText,
                ),
              ),
              const SizedBox(height: 20),
              AppCard(
                child: Column(
                  children: [
                    _buildMenuItem(
                      icon: Icons.inventory_2_outlined,
                      label: '오픈소스 소프트웨어 전문',
                      description: '앱에 포함된 모든 패키지의 라이선스 전문',
                      onTap: _openLicensePage,
                    ),
                    const Divider(height: 1),
                    _buildMenuItem(
                      icon: Icons.text_fields_outlined,
                      label: 'Pretendard 폰트 (SIL OFL 1.1)',
                      description: 'Copyright © 2021 Kil Hyung-jin',
                      onTap: _openFontLicense,
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

  Widget _buildMenuItem({
    required IconData icon,
    required String label,
    required String description,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Row(
          children: [
            Icon(icon, color: AppColors.darkText, size: 24),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: AppColors.darkText,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.hintText,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.lightText),
          ],
        ),
      ),
    );
  }
}

/// 라이선스 원문 표시 — 등폭 폰트 + 줄바꿈 보존.
class _LicenseTextScreen extends StatelessWidget {
  const _LicenseTextScreen({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: TeamplusAppBar(title: title),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: SelectableText(
            body,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12,
              height: 1.6,
              color: AppColors.darkText,
            ),
          ),
        ),
      ),
    );
  }
}
