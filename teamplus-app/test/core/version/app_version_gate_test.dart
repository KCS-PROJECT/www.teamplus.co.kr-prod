// AppVersionGate — 앱 버전 업데이트 게이트 순수 판정 단위 테스트
//
// 검증 범위 (decideVersionGate):
//   1) 현재 < minVersion → 강제(promptForce)
//   2) 서버 forceUpdate=true → 강제
//   3) 강제이지만 스토어 URL 없음 → none (fail-open: 스토어로 보낼 수 없음)
//   4) 현재 < latest(강제 아님) + URL + 미억제 → 권장(promptOptional)
//   5) 권장이지만 24h 억제 중 → none
//   6) 권장이지만 스토어 URL 없음 → none
//   7) 최신 → none
//   8) 플랫폼별 스토어 URL 분기(iOS=iosStoreUrl / Android=androidStoreUrl)
//   9) 판정 결과의 현재 버전은 디바이스 실측값으로 표기

import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/core/network/app_version_service.dart';
import 'package:teamplus_app/core/version/app_version_gate.dart';

void main() {
  // 공통: 양 플랫폼 스토어 URL 이 채워진 서버 응답.
  AppVersionInfo info({
    required String minimumVersion,
    required String latestVersion,
    bool forceUpdate = false,
    String? iosStoreUrl = 'https://apps.apple.com/kr/app/id123456789',
    String? androidStoreUrl =
        'https://play.google.com/store/apps/details?id=com.kr.www.teamplus',
    String? updateMessage,
  }) {
    return AppVersionInfo(
      currentVersion: '0.0.0', // 서버 값 — 판정에서 디바이스 값으로 덮어씀
      minimumVersion: minimumVersion,
      latestVersion: latestVersion,
      forceUpdate: forceUpdate,
      updateMessage: updateMessage,
      iosStoreUrl: iosStoreUrl,
      androidStoreUrl: androidStoreUrl,
    );
  }

  group('강제 업데이트', () {
    test('현재 < minVersion → promptForce', () {
      final d = decideVersionGate(
        currentVersion: '1.0.0',
        info: info(minimumVersion: '1.1.0', latestVersion: '1.2.0'),
        isIOS: false,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.promptForce);
      expect(d.compareResult, VersionCompareResult.forceUpdate);
      expect(d.shouldPrompt, isTrue);
    });

    test('서버 forceUpdate=true → promptForce (버전 동일이어도)', () {
      final d = decideVersionGate(
        currentVersion: '1.2.0',
        info: info(
          minimumVersion: '1.0.0',
          latestVersion: '1.2.0',
          forceUpdate: true,
        ),
        isIOS: true,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.promptForce);
    });

    test('강제이지만 스토어 URL 없음 → none (fail-open)', () {
      final d = decideVersionGate(
        currentVersion: '1.0.0',
        info: info(
          minimumVersion: '1.1.0',
          latestVersion: '1.2.0',
          androidStoreUrl: null,
        ),
        isIOS: false,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.none);
      expect(d.shouldPrompt, isFalse);
    });

    test('강제는 억제와 무관하게 항상 차단', () {
      final d = decideVersionGate(
        currentVersion: '1.0.0',
        info: info(minimumVersion: '1.1.0', latestVersion: '1.2.0'),
        isIOS: false,
        isSuppressed: true, // 억제 중이어도 강제는 뜬다
      );
      expect(d.action, VersionGateAction.promptForce);
    });
  });

  group('권장 업데이트', () {
    test('현재 < latest(강제 아님) + URL + 미억제 → promptOptional', () {
      final d = decideVersionGate(
        currentVersion: '1.1.0',
        info: info(minimumVersion: '1.0.0', latestVersion: '1.2.0'),
        isIOS: false,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.promptOptional);
      expect(d.compareResult, VersionCompareResult.optionalUpdate);
    });

    test('권장이지만 24h 억제 중 → none', () {
      final d = decideVersionGate(
        currentVersion: '1.1.0',
        info: info(minimumVersion: '1.0.0', latestVersion: '1.2.0'),
        isIOS: false,
        isSuppressed: true,
      );
      expect(d.action, VersionGateAction.none);
    });

    test('권장이지만 스토어 URL 없음 → none', () {
      final d = decideVersionGate(
        currentVersion: '1.1.0',
        info: info(
          minimumVersion: '1.0.0',
          latestVersion: '1.2.0',
          iosStoreUrl: null,
        ),
        isIOS: true,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.none);
    });

    test('빈 문자열 스토어 URL 도 없음으로 취급 → none', () {
      final d = decideVersionGate(
        currentVersion: '1.1.0',
        info: info(
          minimumVersion: '1.0.0',
          latestVersion: '1.2.0',
          androidStoreUrl: '   ',
        ),
        isIOS: false,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.none);
    });
  });

  group('최신 버전', () {
    test('현재 == latest → none', () {
      final d = decideVersionGate(
        currentVersion: '1.2.0',
        info: info(minimumVersion: '1.0.0', latestVersion: '1.2.0'),
        isIOS: false,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.none);
    });

    test('현재 > latest → none', () {
      final d = decideVersionGate(
        currentVersion: '2.0.0',
        info: info(minimumVersion: '1.0.0', latestVersion: '1.2.0'),
        isIOS: false,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.none);
    });
  });

  group('플랫폼 분기 & 표기', () {
    test('iOS 는 iosStoreUrl 유무로 판정 (androidStoreUrl 무시)', () {
      // iOS URL 없음 + Android URL 있음 → iOS 판정은 none
      final d = decideVersionGate(
        currentVersion: '1.0.0',
        info: info(
          minimumVersion: '1.1.0',
          latestVersion: '1.2.0',
          iosStoreUrl: null,
          androidStoreUrl: 'https://play.google.com/x',
        ),
        isIOS: true,
        isSuppressed: false,
      );
      expect(d.action, VersionGateAction.none);
    });

    test('판정 결과의 currentVersion 은 디바이스 실측값', () {
      final d = decideVersionGate(
        currentVersion: '1.1.0',
        info: info(minimumVersion: '1.0.0', latestVersion: '1.2.0'),
        isIOS: false,
        isSuppressed: false,
      );
      expect(d.versionInfo!.currentVersion, '1.1.0'); // 서버 0.0.0 아님
      expect(d.versionInfo!.latestVersion, '1.2.0');
    });
  });
}
