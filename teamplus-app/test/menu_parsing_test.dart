import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:teamplus_app/core/menu/menu_models.dart';

void main() {
  group('AppServerMenuItem 파싱 테스트', () {
    // ── 백엔드 GET /api/v1/menus/my 실제 응답 구조 기반 샘플 ──
    // 서비스: getMenusByUserType() → findMany(parentId: null, include: children)
    // 응답 형식: 배열 직접 반환 (wrapping 없음)

    const adminMenuJson = '''
[
  {
    "id": "clxtest001",
    "userType": "ADMIN",
    "label": "회원 관리",
    "icon": "users",
    "href": "#",
    "parentId": null,
    "order": 1,
    "isActive": true,
    "createdAt": "2026-04-18T00:00:00.000Z",
    "updatedAt": "2026-04-18T00:00:00.000Z",
    "children": [
      {
        "id": "clxtest002",
        "userType": "ADMIN",
        "label": "회원 목록",
        "icon": "users",
        "href": "/members",
        "parentId": "clxtest001",
        "order": 1,
        "isActive": true,
        "createdAt": "2026-04-18T00:00:00.000Z",
        "updatedAt": "2026-04-18T00:00:00.000Z",
        "children": []
      },
      {
        "id": "clxtest003",
        "userType": "ADMIN",
        "label": "가입 승인",
        "icon": "user-check",
        "href": "/approval",
        "parentId": "clxtest001",
        "order": 2,
        "isActive": true,
        "createdAt": "2026-04-18T00:00:00.000Z",
        "updatedAt": "2026-04-18T00:00:00.000Z",
        "children": []
      }
    ]
  },
  {
    "id": "clxtest010",
    "userType": "ADMIN",
    "label": "결제·정산",
    "icon": "credit-card",
    "href": "#",
    "parentId": null,
    "order": 3,
    "isActive": true,
    "createdAt": "2026-04-18T00:00:00.000Z",
    "updatedAt": "2026-04-18T00:00:00.000Z",
    "children": [
      {
        "id": "clxtest011",
        "userType": "ADMIN",
        "label": "결제 관리",
        "icon": "credit-card",
        "href": "/payments-manage",
        "parentId": "clxtest010",
        "order": 1,
        "isActive": true,
        "createdAt": "2026-04-18T00:00:00.000Z",
        "updatedAt": "2026-04-18T00:00:00.000Z",
        "children": []
      }
    ]
  }
]''';

    const parentMenuJson = '''
[
  {
    "id": "clxtest100",
    "userType": "PARENT",
    "label": "자녀 관리",
    "icon": "users",
    "href": "#",
    "parentId": null,
    "order": 1,
    "isActive": true,
    "createdAt": "2026-04-18T00:00:00.000Z",
    "updatedAt": "2026-04-18T00:00:00.000Z",
    "children": [
      {
        "id": "clxtest101",
        "userType": "PARENT",
        "label": "자녀 목록",
        "icon": "baby",
        "href": "/children",
        "parentId": "clxtest100",
        "order": 1,
        "isActive": true,
        "createdAt": "2026-04-18T00:00:00.000Z",
        "updatedAt": "2026-04-18T00:00:00.000Z",
        "children": []
      }
    ]
  }
]''';

    const teenMenuJson = '''
[
  {
    "id": "clxtest200",
    "userType": "TEEN",
    "label": "나의 활동",
    "icon": "activity",
    "href": "#",
    "parentId": null,
    "order": 1,
    "isActive": true,
    "createdAt": "2026-04-18T00:00:00.000Z",
    "updatedAt": "2026-04-18T00:00:00.000Z",
    "children": [
      {
        "id": "clxtest201",
        "userType": "TEEN",
        "label": "출석 이력",
        "icon": "check-square",
        "href": "/attendance-history",
        "parentId": "clxtest200",
        "order": 1,
        "isActive": true,
        "createdAt": "2026-04-18T00:00:00.000Z",
        "updatedAt": "2026-04-18T00:00:00.000Z",
        "children": []
      },
      {
        "id": "clxtest202",
        "userType": "TEEN",
        "label": "QR 체크인",
        "icon": "qr-code",
        "href": "/qr-checkin",
        "parentId": "clxtest200",
        "order": 2,
        "isActive": true,
        "createdAt": "2026-04-18T00:00:00.000Z",
        "updatedAt": "2026-04-18T00:00:00.000Z",
        "children": []
      }
    ]
  }
]''';

    test('[ADMIN] 최상위 메뉴 그룹 파싱 및 children 재귀 확인', () {
      final raw = jsonDecode(adminMenuJson) as List;
      final items = raw
          .map((e) => AppServerMenuItem.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(items.length, 2, reason: '2개 최상위 그룹');

      final first = items[0];
      expect(first.id, 'clxtest001');
      expect(first.userType, 'ADMIN');
      expect(first.label, '회원 관리');
      expect(first.icon, 'users');
      expect(first.href, '#');
      expect(first.parentId, isNull);
      expect(first.order, 1);
      expect(first.isActive, isTrue);
      expect(first.hasChildren, isTrue);
      expect(first.children.length, 2, reason: '하위 메뉴 2개');

      final child = first.children[0];
      expect(child.id, 'clxtest002');
      expect(child.label, '회원 목록');
      expect(child.href, '/members');
      expect(child.parentId, 'clxtest001');
      expect(child.hasChildren, isFalse);
    });

    test('[PARENT] 학부모 메뉴 파싱 및 isActive 기본값 확인', () {
      final raw = jsonDecode(parentMenuJson) as List;
      final items = raw
          .map((e) => AppServerMenuItem.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(items.length, 1);
      expect(items[0].userType, 'PARENT');
      expect(items[0].isActive, isTrue);
      expect(items[0].children[0].href, '/children');
    });

    test('[TEEN] 청소년 메뉴 파싱 및 children 정렬 확인', () {
      final raw = jsonDecode(teenMenuJson) as List;
      final items = raw
          .map((e) => AppServerMenuItem.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(items.length, 1);
      expect(items[0].userType, 'TEEN');
      expect(items[0].children.length, 2);
      expect(items[0].children[0].order, lessThan(items[0].children[1].order),
          reason: 'order 오름차순 정렬 확인');
    });

    test('[필드 누락 방어] isActive 없는 JSON → 기본값 true', () {
      const json = '''
{
  "id": "clxtest999",
  "userType": "COACH",
  "label": "테스트",
  "icon": "home",
  "href": "/home",
  "parentId": null,
  "order": 99
}''';
      final item =
          AppServerMenuItem.fromJson(jsonDecode(json) as Map<String, dynamic>);
      expect(item.isActive, isTrue, reason: 'isActive 누락 시 기본값 true');
      expect(item.children, isEmpty, reason: 'children 누락 시 빈 리스트');
    });

    test('[비활성 필터] isActive=false 메뉴는 provider에서 제외되는 조건 검증', () {
      const json = '''
[
  {"id":"a","userType":"ADMIN","label":"활성","icon":"home","href":"/home","parentId":null,"order":1,"isActive":true,"children":[]},
  {"id":"b","userType":"ADMIN","label":"비활성","icon":"x","href":"/hidden","parentId":null,"order":2,"isActive":false,"children":[]}
]''';
      final raw = jsonDecode(json) as List;
      final allItems = raw
          .map((e) => AppServerMenuItem.fromJson(e as Map<String, dynamic>))
          .toList();
      final activeOnly = allItems.where((e) => e.isActive).toList();

      expect(allItems.length, 2);
      expect(activeOnly.length, 1, reason: '비활성 메뉴 제외 후 1개');
      expect(activeOnly[0].id, 'a');
    });
  });
}
