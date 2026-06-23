import 'dart:async';

/// 간단한 타이머 래퍼 (취소/재시작 관리용)
class CancelableTimer {
  Timer? _timer;

  void cancel() {
    _timer?.cancel();
    _timer = null;
  }

  void start(Duration duration, void Function() onTimeout) {
    cancel();
    _timer = Timer(duration, onTimeout);
  }

  void startPeriodic(Duration duration, void Function() onTick) {
    cancel();
    _timer = Timer.periodic(duration, (_) => onTick());
  }
}
