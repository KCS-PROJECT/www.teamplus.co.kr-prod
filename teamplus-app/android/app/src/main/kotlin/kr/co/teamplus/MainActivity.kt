package kr.co.teamplus

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val  CHANNEL = "com.kr.www.teamplus/screen_capture"

    // [2026-07-15 BACKKEY FIX] 앱 완전 종료 채널.
    //   FlutterFragmentActivity 는 OnBackPressedDispatcherOwner 이므로
    //   Flutter 의 SystemNavigator.pop() 이 finish() 가 아니라
    //   onBackPressedDispatcher.onBackPressed() 로 위임되고, Android 12+ 루트
    //   태스크에서는 등록 콜백이 없으면 moveTaskToBack(백그라운드)로 동작해
    //   앱이 종료되지 않는다. Dart AppExit.terminate() 가 이 채널을 호출해
    //   finishAndRemoveTask() 로 태스크를 실제 종료·recents 제거한다.
    private val APP_CONTROL_CHANNEL = "com.kr.www.teamplus/app_control"

    // [2026-06-06 BUG FIX] status bar(appstatus) 영역 붕괴 방어.
    //   LaunchTheme 의 windowFullscreen=true 가 남긴 FLAG_FULLSCREEN 이 일부
    //   실기기/OS 버전에서 NormalTheme 전환 후에도 잔존해 status bar 가 숨겨지고
    //   MediaQuery.viewPadding.top 이 0 으로 붕괴됐다. styles.xml 에서 플래그를
    //   제거했고, 여기서 런타임으로도 명시 해제하여 기기 파편화와 무관하게
    //   edge-to-edge(시스템바 표시 + 콘텐츠가 뒤로 그려짐) 를 보장한다.
    override fun onCreate(savedInstanceState: Bundle?) {
        // [2026-08-01 Play 권장 조치] AndroidX 표준 edge-to-edge 진입점.
        //   Play 정적 분석이 EdgeToEdge.enable()/enableEdgeToEdge() 호출 존재를 확인하므로
        //   (카드: "일부 사용자에게는 더 넓은 화면이 표시되지 않을 수 있습니다") 명시 호출한다.
        //   내부적으로 setDecorFitsSystemWindows(false) + 시스템바 투명 스타일 — 아래 기존
        //   수동 호출과 동일 계열이라 동작 변화 없음. Flutter 쪽 SystemUiMode 는 불변
        //   (appstatus 회귀 이력상 네이티브에서 SystemUiMode 를 건드리지 않는다).
        enableEdgeToEdge()
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

        // [2026-07-15 BACKKEY FIX] 앱 완전 종료 채널.
        //   finishAndRemoveTask() 는 이 태스크의 모든 activity 를 finish 하고
        //   recents 목록에서도 제거해 사용자 관점에서 앱을 완전히 종료한다.
        //   (SystemNavigator.pop() 의 moveTaskToBack 백그라운드 전환 회귀 차단)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, APP_CONTROL_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "exitApp" -> {
                        finishAndRemoveTask()
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
