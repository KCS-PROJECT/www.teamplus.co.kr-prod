import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

/// ⏱ Cold Start 타임라인 계측기
///
/// 앱 부팅 주요 구간에 타임스탬프를 기록하여 **Splash → WebView 콘텐츠 준비**
/// 까지의 실제 소요 시간을 측정한다. `flutter run --profile` 에서 콘솔 출력
/// + DevTools Timeline 동시 제공.
///
/// 목표: **≤4000ms** (사용자별 역할 대시보드 콘텐츠 준비).
///
/// ### 사용법
/// 1. `main.dart` 최상단: `BootTimeline.instance.start()`
/// 2. 각 지점: `BootTimeline.instance.mark('marker_name')`
/// 3. Web content ready: `BootTimeline.instance.finish(path: ...)` 호출 시
///    종합 리포트가 콘솔에 출력되고 4초 기준 ✅/❌ 판정.
///
/// ### DevTools Timeline
/// 각 mark 는 `Timeline.instantSync` 로도 기록되어 DevTools Performance
/// 탭 > Timeline Events 에서 확인 가능.
class BootTimeline {
  BootTimeline._();
  static final BootTimeline instance = BootTimeline._();

  final Stopwatch _sw = Stopwatch();
  final List<_Mark> _marks = [];
  bool _finished = false;

  /// 계측 시작 — `main()` 최상단에서 호출.
  /// 중복 호출은 무시 (Hot Reload 대응).
  void start() {
    if (_sw.isRunning) return;
    _sw.start();
    _marks.clear();
    _finished = false;
    _record('main_start');
  }

  /// 현재 시각에 마커 기록.
  void mark(String name) {
    if (!_sw.isRunning || _finished) return;
    _record(name);
  }

  /// 최종 마커 + 종합 리포트 출력. 한 번만 실행.
  void finish({
    String path = 'unknown',
    String markerName = 'first_contentful_data',
  }) {
    if (_finished) return;
    _finished = true;
    _record(markerName);
    _sw.stop();

    if (!kDebugMode && !kProfileMode) return;

    final totalMs = _sw.elapsedMilliseconds;
    final pass = totalMs <= 4000;
    final banner = pass ? '✅ PASS (≤4000ms)' : '❌ FAIL (>4000ms)';

    final buf = StringBuffer();
    buf.writeln('');
    buf.writeln('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    buf.writeln('⏱  BootTimeline — Cold Start 측정 완료');
    buf.writeln('    path: $path');
    buf.writeln('    total: ${totalMs}ms  $banner');
    buf.writeln('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    int? prev;
    for (final m in _marks) {
      final delta = prev == null ? 0 : m.ms - prev;
      buf.writeln('    ${m.ms.toString().padLeft(5)}ms '
          '(+${delta.toString().padLeft(4)})  ${m.name}');
      prev = m.ms;
    }
    buf.writeln('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    buf.writeln('');

    // debugPrint 는 대용량 문자열을 잘라서 출력하므로 전체 보존
    debugPrint(buf.toString());
  }

  /// 최근 마커까지의 간단 요약 (finish 전 상태 확인용).
  String snapshot() {
    final total = _sw.elapsedMilliseconds;
    return 'BootTimeline @ ${total}ms / ${_marks.length} marks';
  }

  void _record(String name) {
    final ms = _sw.elapsedMilliseconds;
    _marks.add(_Mark(name, ms));
    // DevTools Timeline 동기 기록
    developer.Timeline.instantSync('boot.$name');
    if (kDebugMode || kProfileMode) {
      debugPrint('[BootTimeline] ${ms.toString().padLeft(5)}ms  $name');
    }
  }
}

class _Mark {
  final String name;
  final int ms;
  const _Mark(this.name, this.ms);
}
