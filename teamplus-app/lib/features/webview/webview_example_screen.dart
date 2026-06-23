import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/webview/webview_screen.dart';
import '../../shared/widgets/teamplus_app_bar.dart';

/// WebView 사용 예시 화면
class WebViewExampleScreen extends ConsumerWidget {
  const WebViewExampleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: const TeamplusAppBar(title: 'WebView 예시'),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'TEAMPLUS WebView 통합',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 24),
            _buildExampleCard(
              context,
              title: '메인 WebView',
              description: 'React/Vue.js 웹 앱 로드',
              icon: Icons.web,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const WebViewScreen(
                      title: 'TEAMPLUS',
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 16),
            _buildExampleCard(
              context,
              title: '클래스 목록',
              description: '수업 목록 WebView',
              icon: Icons.school,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const WebViewScreen(
                      initialUrl: 'https://your-domain.com/classes',
                      title: '수업 목록',
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 16),
            _buildExampleCard(
              context,
              title: '결제 내역',
              description: '결제 내역 WebView',
              icon: Icons.payment,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const WebViewScreen(
                      initialUrl: 'https://your-domain.com/payments',
                      title: '결제 내역',
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 32),
            const Divider(),
            const SizedBox(height: 16),
            const Text(
              'Native 기능',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            _buildExampleCard(
              context,
              title: 'QR 체크인',
              description: 'QR 스캔으로 출석 체크',
              icon: Icons.qr_code_scanner,
              onTap: () {
                // QR 스캔 화면으로 이동
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('QR 스캔 화면은 별도 구현 필요'),
                  ),
                );
              },
            ),
            const SizedBox(height: 16),
            const Expanded(
              child: Card(
                child: Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '💡 WebView Bridge 사용법',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      SizedBox(height: 12),
                      Text(
                        '1. WebViewScreen 위젯 사용\n'
                        '2. JavaScript에서 FlutterBridge API 호출\n'
                        '3. Native → Web 메시지 전송\n'
                        '4. Web → Native 요청 처리',
                        style: TextStyle(fontSize: 14),
                      ),
                      SizedBox(height: 12),
                      Text(
                        '자세한 내용은 lib/core/webview/README.md 참고',
                        style: TextStyle(
                          fontSize: 12,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildExampleCard(
    BuildContext context, {
    required String title,
    required String description,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return Card(
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Theme.of(context).primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  color: Theme.of(context).primaryColor,
                  size: 28,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.arrow_forward_ios,
                size: 16,
                color: Colors.grey[400],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
