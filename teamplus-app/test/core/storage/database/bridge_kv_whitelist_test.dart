import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/core/storage/database/bridge_kv_whitelist.dart';

void main() {
  group('BridgeKvWhitelist.validateAndNormalize', () {
    test('정상 키는 ns:web: prefix 부착하여 반환', () {
      expect(
        BridgeKvWhitelist.validateAndNormalize('ui.theme'),
        equals('ns:web:ui.theme'),
      );
      expect(
        BridgeKvWhitelist.validateAndNormalize('post-123'),
        equals('ns:web:post-123'),
      );
    });

    test('빈 키 reject', () {
      expect(
        () => BridgeKvWhitelist.validateAndNormalize(''),
        throwsA(isA<BridgeStorageException>().having(
          (e) => e.code,
          'code',
          BridgeStorageErrorCode.invalidKey,
        )),
      );
    });

    test('256자 초과 키 reject', () {
      final longKey = 'a' * 257;
      expect(
        () => BridgeKvWhitelist.validateAndNormalize(longKey),
        throwsA(isA<BridgeStorageException>()),
      );
    });

    test('정규식 위반 (path traversal 등) reject', () {
      final invalids = ['../etc/passwd', 'a/b', 'a b', "a'b", 'a;DROP'];
      for (final k in invalids) {
        expect(
          () => BridgeKvWhitelist.validateAndNormalize(k),
          throwsA(isA<BridgeStorageException>()),
          reason: 'should reject: $k',
        );
      }
    });

    test('금지 패턴(token/secret/password/pin/jwt/bearer) reject', () {
      final invalids = [
        'access_token',
        'user.secret',
        'login.password',
        'auth.pin',
        'jwt-cache',
        'bearer.key',
        'TOKEN',
        'Secret',
      ];
      for (final k in invalids) {
        expect(
          () => BridgeKvWhitelist.validateAndNormalize(k),
          throwsA(isA<BridgeStorageException>()),
          reason: 'should reject sensitive pattern: $k',
        );
      }
    });
  });

  group('BridgeKvWhitelist.validateValueSize', () {
    test('64KB 이하 통과', () {
      final value = 'x' * (64 * 1024);
      expect(
        () => BridgeKvWhitelist.validateValueSize(value),
        returnsNormally,
      );
    });

    test('64KB 초과 reject', () {
      final value = 'x' * (64 * 1024 + 1);
      expect(
        () => BridgeKvWhitelist.validateValueSize(value),
        throwsA(isA<BridgeStorageException>().having(
          (e) => e.code,
          'code',
          BridgeStorageErrorCode.quota,
        )),
      );
    });
  });

  group('BridgeKvWhitelist.stripWebPrefix', () {
    test('prefix 제거', () {
      expect(
        BridgeKvWhitelist.stripWebPrefix('ns:web:ui.theme'),
        equals('ui.theme'),
      );
    });

    test('prefix 없는 키는 그대로 반환', () {
      expect(
        BridgeKvWhitelist.stripWebPrefix('foo.bar'),
        equals('foo.bar'),
      );
    });
  });

  group('BridgeStorageErrorCode.wire', () {
    test('와이어 포맷', () {
      expect(BridgeStorageErrorCode.invalidKey.wire, 'STORAGE_INVALID_KEY');
      expect(BridgeStorageErrorCode.notFound.wire, 'STORAGE_NOT_FOUND');
      expect(BridgeStorageErrorCode.quota.wire, 'STORAGE_QUOTA');
      expect(BridgeStorageErrorCode.invalidValue.wire, 'STORAGE_INVALID_VALUE');
      expect(BridgeStorageErrorCode.unknown.wire, 'STORAGE_UNKNOWN');
    });
  });
}
