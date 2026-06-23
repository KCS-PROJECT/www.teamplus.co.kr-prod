import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'bridge_logger.dart';

/// 브릿지 통신 실시간 로그 뷰어 위젯
///
/// 개발 모드에서 Flutter ↔ Web 브릿지 통신을 실시간으로 모니터링합니다.
class BridgeLogViewer extends StatefulWidget {
  /// 최대 표시할 로그 수
  final int maxDisplayLogs;

  /// 자동 스크롤 여부
  final bool autoScroll;

  /// 초기 필터 (handler name)
  final String? initialFilter;

  const BridgeLogViewer({
    super.key,
    this.maxDisplayLogs = 100,
    this.autoScroll = true,
    this.initialFilter,
  });

  @override
  State<BridgeLogViewer> createState() => _BridgeLogViewerState();
}

class _BridgeLogViewerState extends State<BridgeLogViewer> {
  final ScrollController _scrollController = ScrollController();
  final List<BridgeLogEntry> _logs = [];
  String? _filter;
  bool _autoScroll = true;
  bool _showStats = false;

  @override
  void initState() {
    super.initState();
    _filter = widget.initialFilter;
    _autoScroll = widget.autoScroll;

    // 기존 로그 로드
    _logs.addAll(bridgeLogger.logs);

    // 새 로그 구독
    bridgeLogger.addListener(_onNewLog);
  }

  @override
  void dispose() {
    bridgeLogger.removeListener(_onNewLog);
    _scrollController.dispose();
    super.dispose();
  }

  void _onNewLog(BridgeLogEntry entry) {
    setState(() {
      _logs.add(entry);
      // 최대 수 제한
      while (_logs.length > widget.maxDisplayLogs) {
        _logs.removeAt(0);
      }
    });

    // 자동 스크롤
    if (_autoScroll && _scrollController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 100),
          curve: Curves.easeOut,
        );
      });
    }
  }

  List<BridgeLogEntry> get _filteredLogs {
    if (_filter == null || _filter!.isEmpty) {
      return _logs;
    }
    return _logs
        .where((log) =>
            log.handlerName.toLowerCase().contains(_filter!.toLowerCase()) ||
            (log.action?.toLowerCase().contains(_filter!.toLowerCase()) ??
                false))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.grey[900],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          // 헤더
          _buildHeader(),
          // 필터
          _buildFilterBar(),
          // 통계 (접을 수 있음)
          if (_showStats) _buildStats(),
          // 로그 리스트
          Expanded(child: _buildLogList()),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey[850],
        borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
      ),
      child: Row(
        children: [
          const Icon(Icons.compare_arrows, color: Colors.cyan, size: 20),
          const SizedBox(width: 8),
          const Text(
            'Bridge Log',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
          const Spacer(),
          // 통계 토글
          IconButton(
            icon: Icon(
              _showStats ? Icons.analytics : Icons.analytics_outlined,
              color: _showStats ? Colors.cyan : Colors.grey,
              size: 18,
            ),
            onPressed: () => setState(() => _showStats = !_showStats),
            tooltip: '통계 보기',
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
          // 자동 스크롤 토글
          IconButton(
            icon: Icon(
              _autoScroll
                  ? Icons.vertical_align_bottom
                  : Icons.vertical_align_center,
              color: _autoScroll ? Colors.green : Colors.grey,
              size: 18,
            ),
            onPressed: () => setState(() => _autoScroll = !_autoScroll),
            tooltip: _autoScroll ? '자동 스크롤 끄기' : '자동 스크롤 켜기',
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
          // 로그 클리어
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.red, size: 18),
            onPressed: () {
              setState(() => _logs.clear());
              bridgeLogger.clear();
            },
            tooltip: '로그 삭제',
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      color: Colors.grey[850],
      child: Row(
        children: [
          const Icon(Icons.filter_list, color: Colors.grey, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              style: const TextStyle(color: Colors.white, fontSize: 12),
              decoration: InputDecoration(
                hintText: '필터 (handler/action)',
                hintStyle: TextStyle(color: Colors.grey[600], fontSize: 12),
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
              ),
              onChanged: (value) => setState(() => _filter = value),
            ),
          ),
          Text(
            '${_filteredLogs.length}/${_logs.length}',
            style: TextStyle(color: Colors.grey[500], fontSize: 10),
          ),
        ],
      ),
    );
  }

  Widget _buildStats() {
    final stats = bridgeLogger.getStats();
    return Container(
      padding: const EdgeInsets.all(12),
      color: Colors.grey[850],
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildStatItem('Total', stats['total'], Colors.white),
          _buildStatItem('Web→Native', stats['webToNative'], Colors.blue),
          _buildStatItem('Native→Web', stats['nativeToWeb'], Colors.green),
          _buildStatItem('Errors', stats['errors'], Colors.red),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, int value, Color color) {
    return Column(
      children: [
        Text(
          value.toString(),
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
        Text(
          label,
          style: TextStyle(color: Colors.grey[500], fontSize: 10),
        ),
      ],
    );
  }

  Widget _buildLogList() {
    final filteredLogs = _filteredLogs;

    if (filteredLogs.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inbox, color: Colors.grey[700], size: 48),
            const SizedBox(height: 8),
            Text(
              '로그가 없습니다',
              style: TextStyle(color: Colors.grey[600], fontSize: 12),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(8),
      itemCount: filteredLogs.length,
      itemBuilder: (context, index) {
        final log = filteredLogs[index];
        return _buildLogItem(log);
      },
    );
  }

  Widget _buildLogItem(BridgeLogEntry log) {
    final isWebToNative = log.direction == BridgeDirection.webToNative;
    final directionColor = isWebToNative ? Colors.blue : Colors.green;

    return GestureDetector(
      onLongPress: () => _copyLogToClipboard(log),
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: log.isError
              ? Colors.red.withValues(alpha: 0.1)
              : Colors.grey[800],
          borderRadius: BorderRadius.circular(4),
          border: log.isError
              ? Border.all(color: Colors.red.withValues(alpha: 0.3))
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 헤더 행
            Row(
              children: [
                // 방향 아이콘
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  decoration: BoxDecoration(
                    color: directionColor.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    log.directionSymbol,
                    style: const TextStyle(fontSize: 10),
                  ),
                ),
                const SizedBox(width: 8),
                // 핸들러 이름
                Text(
                  log.handlerName,
                  style: TextStyle(
                    color: directionColor,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
                // 액션
                if (log.action != null) ...[
                  Text(
                    '.',
                    style: TextStyle(color: Colors.grey[600], fontSize: 12),
                  ),
                  Text(
                    log.action!,
                    style: TextStyle(color: Colors.grey[400], fontSize: 12),
                  ),
                ],
                const Spacer(),
                // 상태
                Text(
                  log.statusSymbol,
                  style: const TextStyle(fontSize: 10),
                ),
                // 소요 시간
                if (log.duration != null) ...[
                  const SizedBox(width: 4),
                  Text(
                    '${log.duration!.inMilliseconds}ms',
                    style: TextStyle(color: Colors.grey[500], fontSize: 10),
                  ),
                ],
              ],
            ),
            // 시간
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                log.timestamp.toString().substring(11, 23),
                style: TextStyle(color: Colors.grey[600], fontSize: 10),
              ),
            ),
            // 에러 메시지
            if (log.isError && log.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  log.errorMessage!,
                  style: const TextStyle(color: Colors.red, fontSize: 10),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _copyLogToClipboard(BridgeLogEntry log) {
    final text = log.toJson().toString();
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('로그가 클립보드에 복사되었습니다'),
        duration: Duration(seconds: 1),
      ),
    );
  }
}

/// 오버레이로 표시되는 미니 로그 뷰어
class BridgeLogOverlay extends StatefulWidget {
  final Widget child;
  final bool enabled;

  const BridgeLogOverlay({
    super.key,
    required this.child,
    this.enabled = true,
  });

  @override
  State<BridgeLogOverlay> createState() => _BridgeLogOverlayState();
}

class _BridgeLogOverlayState extends State<BridgeLogOverlay> {
  bool _isExpanded = false;
  final List<BridgeLogEntry> _recentLogs = [];

  @override
  void initState() {
    super.initState();
    if (widget.enabled) {
      bridgeLogger.addListener(_onNewLog);
    }
  }

  @override
  void dispose() {
    bridgeLogger.removeListener(_onNewLog);
    super.dispose();
  }

  void _onNewLog(BridgeLogEntry entry) {
    setState(() {
      _recentLogs.add(entry);
      if (_recentLogs.length > 5) {
        _recentLogs.removeAt(0);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) return widget.child;

    return Stack(
      children: [
        widget.child,
        // 미니 로그 버튼
        Positioned(
          right: 8,
          bottom: 100,
          child: GestureDetector(
            onTap: () => setState(() => _isExpanded = !_isExpanded),
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.compare_arrows,
                    color: Colors.cyan,
                    size: 16,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${bridgeLogger.logs.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        // 확장된 로그 뷰
        if (_isExpanded)
          const Positioned(
            right: 8,
            bottom: 140,
            width: 300,
            height: 200,
            child: BridgeLogViewer(maxDisplayLogs: 50),
          ),
      ],
    );
  }
}

/// 브릿지 로그 뷰어를 보여주는 다이얼로그
void showBridgeLogDialog(BuildContext context) {
  showDialog(
    context: context,
    builder: (context) => Dialog(
      backgroundColor: Colors.transparent,
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: BoxDecoration(
          color: Colors.grey[900],
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            // 닫기 버튼
            Align(
              alignment: Alignment.topRight,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
            // 로그 뷰어
            const Expanded(
              child: BridgeLogViewer(),
            ),
          ],
        ),
      ),
    ),
  );
}
