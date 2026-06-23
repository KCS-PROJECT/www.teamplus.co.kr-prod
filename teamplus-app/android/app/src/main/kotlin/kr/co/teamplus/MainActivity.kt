package kr.co.teamplus

import android.os.Bundle
import android.view.WindowManager
import androidx.core.view.WindowCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val  CHANNEL = "com.kr.www.teamplus/screen_capture"

    // [2026-06-06 BUG FIX] status bar(appstatus) 영역 붕괴 방어.
    //   LaunchTheme 의 windowFullscreen=true 가 남긴 FLAG_FULLSCREEN 이 일부
    //   실기기/OS 버전에서 NormalTheme 전환 후에도 잔존해 status bar 가 숨겨지고
    //   MediaQuery.viewPadding.top 이 0 으로 붕괴됐다. styles.xml 에서 플래그를
    //   제거했고, 여기서 런타임으로도 명시 해제하여 기기 파편화와 무관하게
    //   edge-to-edge(시스템바 표시 + 콘텐츠가 뒤로 그려짐) 를 보장한다.
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // FLAG_FULLSCREEN 잔존 시 강제 해제 → 시스템 status bar inset 복원
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        // Flutter 의 SystemUiMode.edgeToEdge 와 정합 — 콘텐츠가 시스템바 뒤로 그려지되
        // 시스템바 자체는 표시 유지(투명). viewPadding.top 이 status bar 높이로 채워진다.
        WindowCompat.setDecorFitsSystemWindows(window, false)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "enableSecureMode" -> {
                        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        result.success(true)
                    }
                    "disableSecureMode" -> {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
