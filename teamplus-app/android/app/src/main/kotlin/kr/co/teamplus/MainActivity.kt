package kr.co.teamplus

import android.os.Bundle
import android.view.WindowManager
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
        // [2026-09-05 Play 권장 조치 ②] androidx.activity `enableEdgeToEdge()` 호출 제거.
        //   08-01 에 넣은 enableEdgeToEdge() 가 androidx.activity 의 EdgeToEdgeApi23/26/29/35
        //   (R8 mapping e.s/e.t/e.v/e.x) 를 끌어들였고, 그 구현이 SDK 가드 없이
        //   Window.setStatusBarColor/setNavigationBarColor(API 35 deprecated) 를 호출해 Play 콘솔
        //   "지원 중단된 API 사용(더 넓은 화면)" 권장 조치 ② 의 원인이 됐다(16/1.0.4 mapping 역추적).
        //   edge-to-edge 자체는 아래 clearFlags(FLAG_FULLSCREEN) + WindowCompat.setDecorFitsSystemWindows(false)
        //   (androidx WindowCompat 경로 — Play 미지적. 위임 대상인 플랫폼 Window.setDecorFitsSystemWindows 는
        //   API 35 에서 deprecated·무시되지만 35+ 는 OS 가 edge-to-edge 를 강제하므로 결과 동일)로 보장되고,
        //   시스템바 투명·아이콘 밝기는 Flutter
        //   SystemChrome.setSystemUIOverlayStyle(엔진 PlatformPlugin, API<35 가드 경유)이 수행한다.
        //   API 35+ 는 OS 강제 edge-to-edge 라 무관.
        //   ⚠️ enableEdgeToEdge()/EdgeToEdge.enable() 를 다시 넣지 말 것 — ② 재발.
        //   ① "더 넓은 화면 미표시" 카드는 이 제거 후에도 남을 수 있음(flutter/flutter#169810: 사용자 영향 없음)
        //      — 코드 조치 없이 관찰. ① 을 없애려고 enableEdgeToEdge() 를 되살리면 ② 가 되돌아온다.
        //   Flutter 쪽 SystemUiMode 는 불변(appstatus 회귀 이력상 네이티브에서 건드리지 않는다).
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
