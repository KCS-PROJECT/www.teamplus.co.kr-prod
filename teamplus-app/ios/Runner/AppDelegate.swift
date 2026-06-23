import Flutter
import UIKit
import FirebaseCore
import FirebaseMessaging
import UserNotifications

// MARK: - CustomFlutterViewController
//
// iOS 26 + UIScene 환경에서 Flutter 의 SystemChrome.setEnabledSystemUIMode 호출이
// status bar 시스템 아이콘(시계/Wi-Fi/배터리)을 숨기지 못하는 이슈가 보고됨.
// 정공법으로 FlutterViewController 를 subclass 하고 prefersStatusBarHidden 을
// 직접 override 하여 method channel 통해 Flutter 에서 동적 제어한다.
//
// Storyboard 의 root VC class 도 이 클래스로 변경되어 있어야 작동한다.
@objc class CustomFlutterViewController: FlutterViewController {
  // [수정 2026-05-19 v13] 초기값 true — 앱 부팅 직후 첫 ViewController 가
  //   생성될 때 statusbar 가 숨겨진 상태로 시작. Info.plist 의
  //   UIViewControllerBasedStatusBarAppearance=true 와 함께 작동.
  //   web 측이 useNativeUI({ showStatusBar: true }) 호출하면 native channel
  //   setStatusBarHidden(false) 가 호출되어 표시 모드로 전환.
  private var _statusBarHidden: Bool = true

  func setStatusBarHidden(_ hidden: Bool) {
    guard _statusBarHidden != hidden else { return }
    _statusBarHidden = hidden
    // status bar 변화 alpha 트랜지션 + 시스템 update 트리거
    UIView.animate(withDuration: 0.2) { [weak self] in
      self?.setNeedsStatusBarAppearanceUpdate()
    }
  }

  override var prefersStatusBarHidden: Bool {
    return _statusBarHidden
  }

  override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation {
    return .fade
  }
}

@main
@objc class AppDelegate: FlutterAppDelegate, MessagingDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // 🔔 Firebase / FCM 초기화 — GeneratedPluginRegistrant 보다 먼저 호출.
    //    GoogleService-Info.plist 가 Runner 타깃 리소스로 포함되어야 자동 인식됨.
    //
    // 2026-05-16: Firebase 4.x SDK 부터 plist 누락 시 fatal exception 으로 강화됨.
    //   시뮬레이터/개발 초기 환경에서 plist 없이도 앱이 실행되도록 가드 추가.
    //   plist 추가 시 자동으로 FCM 활성화. PROD 빌드 전에는 반드시 plist 배치 필수.
    let hasFirebaseConfig = Bundle.main.path(
      forResource: "GoogleService-Info", ofType: "plist"
    ) != nil

    if hasFirebaseConfig {
      // 2026-05-16: 콜드 스타트 SLA 4s 대응 — didFinishLaunching 동기 블록 회피.
      //   FirebaseApp.configure() 가 동기 50ms 정도 잡아먹는데, FCM 토큰 수신은
      //   Splash 페이드 시간에 백그라운드로 진행해도 충분 (사용자 인지 콜드 스타트 미차단).
      DispatchQueue.main.async {
        if FirebaseApp.app() == nil {
          FirebaseApp.configure()
        }
        // 🔔 APNs 토큰을 FCM 으로 자동 전달하도록 Messaging 델리게이트 연결
        Messaging.messaging().delegate = self
      }
    } else {
      print("[AppDelegate] ⚠️ GoogleService-Info.plist 누락 — Firebase/FCM 비활성화 (시뮬레이터/개발용)")
    }

    // 🔔 시스템 알림 센터 델리게이트 (포그라운드 배너 표시용) — Firebase 독립적이므로 항상 등록
    UNUserNotificationCenter.current().delegate = self

    // [2026-06-14 · 앱심사 Apple HIG 4.5.4] 부팅 시 OS 알림 권한 팝업 자동 노출 제거.
    //   기존: didFinishLaunching 에서 requestAuthorization([.alert,.badge,.sound]) 를
    //   호출해 앱 첫 실행 즉시 '사전 설명 없이' OS 알림 팝업을 띄웠다 → 부팅 팝업의 실제 근원.
    //   변경: 알림 권한 요청 책임은 가입 플로우 A5 사전설명 화면(SignupPermissionsScreen)이
    //   permission_handler(Permission.notification.request) 로 단독 담당한다.
    //   네이티브는 더 이상 권한을 직접 요청하지 않는다.
    //   ※ 아래 registerForRemoteNotifications() 는 '권한과 무관하게' APNs 디바이스 토큰을
    //     수신하는 호출이라 팝업을 띄우지 않는다. 사용자가 A5 에서 알림을 허용하면 이미
    //     매핑된 APNs↔FCM 토큰으로 즉시 푸시가 표시된다. firebase_messaging 의
    //     FirebaseAppDelegateProxyEnabled(기본 true) swizzling 이 APNs→FCM 매핑을 처리.

    // 🔔 APNs 등록 (firebase_messaging Flutter 플러그인이 실제 토큰 수신을 담당)
    //    Firebase 미설정 시 APNs 토큰만 받고 FCM 매핑은 비활성화됨 — 시뮬레이터에선 무영향.
    //    권한과 독립적인 디바이스 토큰 등록이므로 부팅 시 호출해도 OS 팝업이 뜨지 않는다.
    application.registerForRemoteNotifications()

    GeneratedPluginRegistrant.register(with: self)

    // UIScene 마이그레이션:
    // 기존에 `window?.rootViewController`로 접근해 등록했던 MethodChannel은
    // Scene 라이프사이클에서는 `scene(_:willConnectTo:)`가 호출된 뒤에야 window가 준비되므로
    // SceneDelegate.swift에서 등록한다.
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // MARK: - MessagingDelegate

  /// FCM 토큰 갱신 콜백 — Flutter 측 firebase_messaging.onTokenRefresh 가 동일 이벤트를
  /// 수신하므로 여기서는 디버그 로깅만 남긴다.
  func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
    if let token = fcmToken {
      print("[AppDelegate] FCM token refreshed: \(token.prefix(16))...")
    }
  }

  /// UISceneSession 구성 — Info.plist의 `UIApplicationSceneManifest`를 사용한다.
  override func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    return UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
  }

  // FlutterAppDelegate.lastAppModificationTime 크래시 방지 —
  // 상태 복원을 비활성화한다. UIScene 모드에서도 동일하게 유지.
  override func application(
    _ application: UIApplication,
    shouldSaveSecureApplicationState coder: NSCoder
  ) -> Bool {
    return false
  }

  override func application(
    _ application: UIApplication,
    shouldRestoreSecureApplicationState coder: NSCoder
  ) -> Bool {
    return false
  }
}

// MARK: - SceneDelegate

/// UIScene 라이프사이클 델리게이트.
///
/// `UISceneStoryboardFile = Main`으로 설정되어 있어 시스템이 `FlutterViewController`를
/// 루트 뷰 컨트롤러로 자동 로드하고 `window`에 연결한다. 이 델리게이트는 Scene이 연결된
/// 이후에 필요한 네이티브 기능(화면 캡처 방지 MethodChannel, 딥링크 URL 핸들링)만 담당한다.
@available(iOS 13.0, *)
@objc class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  /// iOS 캡처 방지용 보안 텍스트 필드 참조 (스크린샷/녹화 차단)
  private var secureTextField: UITextField?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    // UISceneStoryboardFile이 지정되어 있으면 UIKit이 storyboard의 initial VC를 생성해
    // self.window에 자동 할당한다. 비어있는 경우에만 수동으로 인스턴스화한다(iOS 13 호환).
    if self.window == nil {
      let storyboard = UIStoryboard(name: "Main", bundle: nil)
      let rootVC = storyboard.instantiateInitialViewController()
      let newWindow = UIWindow(windowScene: windowScene)
      newWindow.rootViewController = rootVC
      newWindow.makeKeyAndVisible()
      self.window = newWindow
    }

    // Flutter MethodChannel 등록 (화면 캡처 방지)
    if let controller = self.window?.rootViewController as? FlutterViewController {
      let screenCaptureChannel = FlutterMethodChannel(
        name: "com.kr.www.teamplus/screen_capture",
        binaryMessenger: controller.binaryMessenger
      )
      screenCaptureChannel.setMethodCallHandler { [weak self] call, result in
        switch call.method {
        case "enableSecureMode":
          self?.enableSecureMode()
          result(true)
        case "disableSecureMode":
          self?.disableSecureMode()
          result(true)
        default:
          result(FlutterMethodNotImplemented)
        }
      }

      // 🛡️ Status bar 동적 제어 method channel (2026-05-08)
      //   iOS 26 + UIScene 환경에서 Flutter SystemChrome 가 status bar 숨김 효과를
      //   안 주는 이슈 → CustomFlutterViewController 의 prefersStatusBarHidden 을
      //   native 측에서 직접 제어.
      if let customVC = controller as? CustomFlutterViewController {
        let statusBarChannel = FlutterMethodChannel(
          name: "com.kr.www.teamplus/status_bar",
          binaryMessenger: controller.binaryMessenger
        )
        statusBarChannel.setMethodCallHandler { [weak customVC] call, result in
          guard let customVC = customVC else {
            result(FlutterError(code: "VC_NIL", message: "ViewController nil", details: nil))
            return
          }
          switch call.method {
          case "setHidden":
            if let hidden = call.arguments as? Bool {
              customVC.setStatusBarHidden(hidden)
              result(true)
            } else if let args = call.arguments as? [String: Any], let hidden = args["hidden"] as? Bool {
              customVC.setStatusBarHidden(hidden)
              result(true)
            } else {
              result(FlutterError(code: "INVALID_ARGS", message: "Expected Bool or {hidden: Bool}", details: nil))
            }
          default:
            result(FlutterMethodNotImplemented)
          }
        }
      }
    }

    // 앱 콜드 스타트 시 딥링크(custom scheme)로 진입한 경우 URL 컨텍스트를 전달 —
    // FlutterAppDelegate의 openURL 파이프라인으로 위임하여 `app_links` 플러그인이 수신.
    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }

    // 앱 콜드 스타트 시 Universal Link(HTTPS)로 진입한 경우 NSUserActivity 를 포워딩 —
    // UIScene 라이프사이클에서는 AppDelegate 의 application(_:continue:restorationHandler:)
    // 가 호출되지 않으므로, scene 의 connectionOptions.userActivities 를 직접 위임해야
    // `app_links` 플러그인이 초기 링크(getInitialLink)를 수신할 수 있다.
    for activity in connectionOptions.userActivities {
      forwardUniversalLink(activity)
    }
  }

  /// 앱 실행 중 딥링크(custom scheme) 수신 — FlutterAppDelegate의 URL 핸들러로 포워딩.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? FlutterAppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(
        UIApplication.shared,
        open: context.url,
        options: [
          .sourceApplication: context.options.sourceApplication as Any,
          .annotation: context.options.annotation as Any,
          .openInPlace: context.options.openInPlace,
        ]
      )
    }
  }

  /// 앱 실행 중 Universal Link(HTTPS) 수신 — NSUserActivity 를 FlutterAppDelegate 의
  /// continue 핸들러로 포워딩하여 `app_links` 플러그인이 수신하도록 한다.
  /// (UIScene 라이프사이클에서는 AppDelegate 의 continue 가 호출되지 않아 필수)
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    forwardUniversalLink(userActivity)
  }

  /// NSUserActivity(Universal Link) 를 FlutterAppDelegate 로 위임하는 공통 헬퍼.
  /// 웹 브라우징 액티비티(NSUserActivityTypeBrowsingWeb)만 대상으로 한다.
  private func forwardUniversalLink(_ userActivity: NSUserActivity) {
    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
      let appDelegate = UIApplication.shared.delegate as? FlutterAppDelegate
    else { return }
    _ = appDelegate.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }

  // MARK: - Secure mode (screen capture prevention)

  /// iOS 캡처 방지 활성화 — `UITextField.isSecureTextEntry` 트릭으로 윈도우 레이어를 숨김 처리.
  private func enableSecureMode() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self, let window = self.window else { return }
      if self.secureTextField != nil { return }

      let field = UITextField()
      field.isSecureTextEntry = true
      field.isUserInteractionEnabled = false

      window.addSubview(field)
      field.centerYAnchor.constraint(equalTo: window.centerYAnchor).isActive = true
      field.centerXAnchor.constraint(equalTo: window.centerXAnchor).isActive = true
      window.layer.superlayer?.addSublayer(field.layer)
      field.layer.sublayers?.first?.addSublayer(window.layer)

      self.secureTextField = field
    }
  }

  private func disableSecureMode() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.secureTextField?.removeFromSuperview()
      self.secureTextField = nil
    }
  }
}
