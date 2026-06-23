import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/core/router/deep_link_handler.dart';

/// DeepLinkHandler URL→경로 변환 회귀 가드.
///
/// 2026-05-27 운영 도메인 전환(app.teamplus.com → teamplusweb.icetimes.co.kr).
/// 2026-06-15 레거시 *.teamplus.com 제거(전 도메인 DNS SERVFAIL) — host 게이트는
/// 운영 teamplusweb 단일. 운영 Universal Link / App Link 가 `resolveWebPath` 에서
/// 정상 라우팅되고, 폐기 도메인은 신뢰 게이트에서 차단됨을 보장한다.
///
/// 이 테스트가 깨지면 운영 딥링크가 무력화되거나 폐기 도메인이 다시 신뢰될 수 있다.
void main() {
  group('isUniversalLinkHost', () {
    test('운영 도메인 teamplusweb.icetimes.co.kr → true', () {
      expect(
        DeepLinkHandler.isUniversalLinkHost('teamplusweb.icetimes.co.kr'),
        isTrue,
      );
    });

    test('폐기 레거시 *.teamplus.com → false (2026-06-15 DNS 폐기·재등록 피싱 차단)', () {
      // 전 도메인 패밀리 DNS SERVFAIL. host allowlist 에서 제거되어 더 이상
      // 신뢰 Universal Link 로 인식되지 않아야 한다 (재등록 피싱 방지).
      expect(DeepLinkHandler.isUniversalLinkHost('app.teamplus.com'), isFalse);
      expect(DeepLinkHandler.isUniversalLinkHost('www.teamplus.com'), isFalse);
      expect(DeepLinkHandler.isUniversalLinkHost('teamplus.com'), isFalse);
    });

    test('외부 도메인 → false (피싱 차단)', () {
      expect(DeepLinkHandler.isUniversalLinkHost('evil.com'), isFalse);
    });

    test('빈 host → false', () {
      expect(DeepLinkHandler.isUniversalLinkHost(''), isFalse);
    });
  });

  group('resolveWebPath — Universal Link / App Link (운영 도메인)', () {
    test('공지 상세 /notice/123 → /notices/123', () {
      expect(
        DeepLinkHandler.resolveWebPath(
          Uri.parse('https://teamplusweb.icetimes.co.kr/notice/123'),
        ),
        '/notices/123',
      );
    });

    test('수업 상세 /classes/5 → /classes/5', () {
      expect(
        DeepLinkHandler.resolveWebPath(
          Uri.parse('https://teamplusweb.icetimes.co.kr/classes/5'),
        ),
        '/classes/5',
      );
    });

    test('출석 /attendance/9 → /attendance?scheduleId=9', () {
      expect(
        DeepLinkHandler.resolveWebPath(
          Uri.parse('https://teamplusweb.icetimes.co.kr/attendance/9'),
        ),
        '/attendance?scheduleId=9',
      );
    });

    test('결제 /payment/7 → /payment/7', () {
      expect(
        DeepLinkHandler.resolveWebPath(
          Uri.parse('https://teamplusweb.icetimes.co.kr/payment/7'),
        ),
        '/payment/7',
      );
    });

    test('매핑되지 않은 경로는 그대로 전달 /shop/42 → /shop/42', () {
      expect(
        DeepLinkHandler.resolveWebPath(
          Uri.parse('https://teamplusweb.icetimes.co.kr/shop/42'),
        ),
        '/shop/42',
      );
    });

    test('폐기 레거시 도메인 https → null (2026-06-15 제거 — 신뢰 게이트 차단)', () {
      expect(
        DeepLinkHandler.resolveWebPath(
          Uri.parse('https://app.teamplus.com/notice/1'),
        ),
        isNull,
      );
    });
  });

  group('resolveWebPath — 거부 케이스', () {
    test('외부 도메인 https → null', () {
      expect(
        DeepLinkHandler.resolveWebPath(Uri.parse('https://evil.com/notice/1')),
        isNull,
      );
    });
  });

  group('resolveWebPath — custom scheme (teamplus://) 회귀 유지', () {
    test('teamplus://class/123 → /classes/123', () {
      expect(
        DeepLinkHandler.resolveWebPath(Uri.parse('teamplus://class/123')),
        '/classes/123',
      );
    });

    test('teamplus://notice/5 → /notices/5', () {
      expect(
        DeepLinkHandler.resolveWebPath(Uri.parse('teamplus://notice/5')),
        '/notices/5',
      );
    });
  });
}
