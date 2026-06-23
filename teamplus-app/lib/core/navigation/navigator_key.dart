import 'package:flutter/material.dart';

/// 전역 Navigator Key (Single Source of Truth)
///
/// - DeepLinkHandler 가 라우터 컨텍스트에 접근할 때 사용
/// - WebViewBridge 가 native ↔ web 네비게이션 시 context 조회용
/// - GoRouter 인스턴스 생성 시 `navigatorKey` 로 주입
///
/// main.dart 와 app.dart 양쪽 entry point 가 동일 인스턴스를 사용하도록
/// 이 파일을 단일 SoT 로 유지한다. 절대 다른 곳에서 새로 생성하지 말 것.
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
