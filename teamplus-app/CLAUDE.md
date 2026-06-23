# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 프로젝트 개요

**TEAMPLUS Flutter App** — 아이스하키 클럽 관리 플랫폼의 하이브리드 앱 네이티브 셸.

- **아키텍처**: Flutter Native Shell (15-20%) + Next.js WebView (80-85%)
- **Flutter SDK**: >=3.4.0 <4.0.0
- **164개 .dart 파일** (`lib/`, 2026-04-19 실측), `.g.dart` 코드 생성 파일 3개 포함
- **24개 feature 모듈**, **30개 GoRoute**, **10개 JS Bridge 핸들러**

Next.js 웹앱(`teamplus-web`)을 `flutter_inappwebview`로 로드하고, JavaScript Bridge를 통해 네이티브 기능(생체인증, QR, 푸시, 보안 저장소, 결제) 제공.

---

## 개발 명령어

```bash
flutter pub get                  # 의존성 설치
flutter run [-d <device_id>]     # 디버그 실행
flutter build ios --release      # iOS 릴리스
flutter build appbundle --release # Android AAB 릴리스
flutter analyze                  # 린트
dart format lib/                 # 포맷

# @JsonSerializable 모델 수정 후 (3개 .g.dart 파일 재생성)
flutter pub run build_runner build --delete-conflicting-outputs

flutter clean && flutter pub get # 클린 리빌드
cd ios && pod install && cd ..   # iOS CocoaPods
flutter test                     # 테스트
```

---

## 아키텍처

### 하이브리드 앱 플로우

```
Flutter Native Shell
  ├── Native screens (30개 GoRoute: login, QR, dashboard, profile 등)
  ├── WebViewScreen (Next.js teamplus-web 로드)
  │     └── WebViewBridge (10개 JS 핸들러)
  └── MainShellScreen (멀티탭 WebView + 동적 헤더/하단 네비)
```

1. **네이티브 화면** — 로그인, 회원가입, 대시보드, QR, 프로필 등 (GoRouter 관리)
2. **WebView 모드** — `WebViewScreen`이 `teamplus-web` 로드, `WebViewBridge`로 통신

### 핵심 레이어

```
lib/
├── core/              # 인프라 (싱글톤 서비스, 기능 로직 없음)
│   ├── auth/          # TokenStorage (flutter_secure_storage)
│   ├── constants/     # AppEnvironment (local/dev/prod), ApiConstants
│   ├── crypto/        # AES 암호화
│   ├── identity/      # 본인인증 (딥링크 + WebView)
│   ├── logging/       # BridgeLogger + BridgeLogViewer (디버그 UI)
│   ├── menu/          # 서버 기반 동적 메뉴 (json_serializable)
│   ├── network/       # ApiClient (Dio 싱글톤), RetryInterceptor, connectivity
│   ├── notification/  # FCM + local notifications
│   ├── payment/       # KG이니시스 결제
│   ├── providers/     # 공유 Riverpod providers (apiClient, storage)
│   ├── router/        # GoRouter + DeepLinkHandler + ActivityRecordingRouteObserver
│   ├── security/      # Biometric, SSL pinning, AppLockManager
│   ├── storage/       # SecureStorageService, AppPreferencesService
│   ├── theme/         # Material 3 테마, 컬러 상수
│   ├── websocket/     # Socket.IO 서비스
│   └── webview/       # WebViewBridge, WebViewScreen, JsBridge 모델
├── features/          # 24개 기능 모듈
│   ├── [Full CA 7개]  # auth, notifications, attendance, classes, clubs, dashboard, payments
│   ├── [data+pres 2개] # community, main
│   └── [pres only 14개] # calendar, children, coach, home, identity, lessons, matches, onboarding, profile, qr, rinks, shop, splash, tournaments
│   └── webview/       # WebView 전용 (presentation 없음)
└── shared/            # 공유 위젯 + 유틸리티 (13개 파일)
    ├── utils/         # CancelableTimer
    └── widgets/       # AppButton, AppCard, AppInput, AppDrawer, teamplusAppBar, teamplusBottomNav,
                       # LoadingWidget, SkeletonLoading, MenuSkeletonScreen, DebugErrorDialog,
                       # KeyboardAwareScrollView, widgets.dart (barrel)
```

### Clean Architecture 적용 범위

| 구조                                   | 적용 feature                                                                       | 설명                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| **Full CA** (data/domain/presentation) | `auth`, `notifications`, `attendance`, `classes`, `clubs`, `dashboard`, `payments` | entities, repositories, providers 포함 |
| **data + presentation**                | `community`, `main`                                                                | domain 레이어 없음                     |
| **presentation only**                  | 나머지 14개                                                                        | screens/widgets만 존재                 |

> 새 기능 추가 시 해당 feature의 기존 패턴을 따를 것.

---

## 상태 관리: Riverpod 2.6

```dart
// features/*/presentation/providers/ 에 정의
final authStateProvider = FutureProvider<bool>((ref) async { ... });

// core/providers/shared_providers.dart 에 인프라 provider
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());
final secureStorageProvider = Provider<SecureStorageService>((ref) => SecureStorageService());

// ConsumerWidget 또는 ConsumerStatefulWidget 사용
class MyWidget extends ConsumerWidget {
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(someProvider);
    return state.when(data: ..., loading: ..., error: ...);
  }
}
```

---

## 네비게이션: GoRouter (30개 라우트)

`lib/core/router/app_router.dart` — Riverpod `Provider<GoRouter>`.

**인증 리다이렉트**: `authStateProvider` 확인 → 미인증 시 `/login`으로 리다이렉트. 코치는 `/coach-dashboard`로 분기.

**Public 라우트** (인증 불필요): `/onboarding`, `/login`, `/register`, `/home`, `/webview`

**전체 라우트 맵:**

| 카테고리      | 라우트                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core**      | `/` (splash), `/onboarding`, `/login`, `/register`, `/biometric-lock`                                                                              |
| **Dashboard** | `/dashboard` (학부모), `/coach-dashboard` (코치)                                                                                                   |
| **QR**        | `/qr-scanner`, `/qr-checkin`                                                                                                                       |
| **수업/클럽** | `/classes`, `/club-join`, `/club-feed`, `/club-events`                                                                                             |
| **이력**      | `/attendance-history`, `/payment-history`                                                                                                          |
| **프로필**    | `/profile`, `/profile/edit`, `/profile/password`, `/profile/notifications`, `/profile/security`                                                    |
| **기능**      | `/home`, `/children`, `/lesson-card`, `/coach-admin`, `/calendar`, `/shop-admin`, `/tournaments`, `/rinks`, `/match-recruitment`, `/notifications` |
| **기타**      | `/identity-verify` (본인인증, extras 필수), `/webview` (하이브리드 메인, extras: url, title, showAppBar, showBottomNav, userType)                  |

**ActivityRecordingRouteObserver**: 모든 라우트 변경 시 `AppLockManager`에 활동 기록 (생체인증 타임아웃용).

---

## WebView Bridge (10개 핸들러)

`lib/core/webview/webview_bridge.dart` (구현) + `js_bridge.dart` (메시지/응답 모델)

| 핸들러                 | 기능                                                      |
| ---------------------- | --------------------------------------------------------- |
| `auth`                 | 토큰 get/save/clear (`flutter_secure_storage`)            |
| `qrScan`               | 카메라 권한 + `mobile_scanner`                            |
| `payment`              | KG이니시스 결제 플로우                                    |
| `biometric`            | Face ID / Touch ID (`local_auth`)                         |
| `notification`         | 푸시 알림 관리                                            |
| `navigation`           | 네이티브 화면 이동 제어                                   |
| `identityVerification` | 본인인증 (딥링크 + WebView)                               |
| `api`                  | 네이티브 Dio 클라이언트로 API 프록시 (SSL pinned)         |
| `cancelRequest`        | 진행 중인 API 요청 취소                                   |
| `ui`                   | 네이티브 UI 제어: StatusBar, AppBar, BottomNav, 로딩 상태 |

**UIConfig** (웹이 네이티브 크롬 제어): `showStatusBar`, `showAppBar`, `appBarTitle`, `showBackButton`, `showMenuButton`, `showBottomNav`, `isLoading` 등.

### 화면 해상도 push (2026-05-09 신규)

Flutter `WidgetsBindingObserver.didChangeMetrics()` 가 회전·키보드·접힘·다중창 변경을
감지하여 `WebViewBridge.sendDeviceMetricsToWeb()` 를 호출, Web 의 autolayout 시스템
(CSS 변수 + `[data-screen-bp]`) 을 즉시 갱신합니다.

- **위치**: `lib/core/webview/webview_screen.dart` (override), `webview_bridge.dart`
  (`sendDeviceMetricsToWeb` + `_handleUIRequest` getDeviceInfo)
- **계약**: `BridgeMessage(type=ui, action='deviceMetricsChanged', data.info=DeviceInfo)`
- **DeviceInfo**: `{ screen, physicalSize, safeArea, viewInsets, devicePixelRatio, platform, orientation }`
  (logical pixels = physicalSize / devicePixelRatio)
- **Web 수신**: `ui.onDeviceMetricsChange` (subscribe 단일 진입점)
- **SoT**: [`docs/Architecture/SCREEN_METRICS.md`](../docs/Architecture/SCREEN_METRICS.md)

**금지**:

- ❌ Web 측에서 `window.innerWidth` 직접 읽기 (Native MediaQuery 와 미세 차이 발생)
- ❌ Flutter 측에서 별도 채널로 화면 크기 통신 (단일 push API 만 사용)

---

## 환경 설정

`lib/core/constants/app_environment.dart` — 싱글톤 `AppEnvironment`:

| Env       | API Host                          | Web Host | Port (API/Web) | HTTPS | 활성 조건                              |
| --------- | --------------------------------- | -------- | -------------- | ----- | -------------------------------------- |
| **LOCAL** | `127.0.0.1` (시뮬레이터 전용)     | 동일     | 5003 / 5001    | No    | debug 자동 / `APP_ENV=local`           |
| **HOME**  | `192.168.0.100` (Mac LAN IP, en0) | 동일     | 5003 / 5001    | No    | `APP_ENV=home` 명시 (실기기/외부 단말) |
| **DEV**   | `211.236.174.115`                 | 동일     | 5003 / 5001    | No    | `APP_ENV=dev`                          |
| **PROD**  | `211.236.174.230`                 | 동일     | 5003 / 5001    | Yes   | release 자동 / `APP_ENV=prod`          |

```dart
// main.dart
AppEnvironment.instance.initialize(forceEnvironment: EnvironmentType.local);
// 또는 빌드 시 --dart-define APP_ENV=home 으로 LAN IP 활성화
```

자동 감지: `kReleaseMode` → PROD, 그 외 → LOCAL. HOME 은 자동 감지에서 제외 (실기기 사용 시 `APP_ENV=home` 명시).
전역 접근: `appEnv.apiBaseUrl`, `appEnv.webAppUrl`.

> **주의**: HOME IP(`_homeMachineIp`)는 개발 머신 LAN IP이므로 Wi-Fi 변경 시 동기화 대상 (`app_environment.dart` · `teamplus-backend/src/main.ts` CORS · `ios/Runner/Info.plist` NSExceptionDomains).

---

## API Client

`lib/core/network/api_client.dart` — Dio 싱글톤 (**v8.5에서 4개 인터셉터 체인으로 확장**):

1. **`ApiLifecycleInterceptor`** — X-Request-ID(UUID v4) 생성, X-Client-Platform(ios/android/flutter), X-Client-Version, X-Device-Id 헤더 부착. 응답 수신 시 durationMs 계산 및 1초 초과 시 `[API SLA_BREACH]` 로그. 외부에서 `ApiClient().lifecycleHooks.subscribeBefore/After/Error` 로 훅 등록 가능.
2. **`AuthGuardInterceptor`** — 전처리 단계 로그인 검증. `isPublicApiPath()` 화이트리스트 외 경로에서 토큰 없으면 401+`AUTH_REQUIRED` 즉시 reject + `ApiClient().onAuthRequired` 콜백 발사(main.dart에서 GoRouter `/login?redirect&reason=required` 이동 등록).
3. **`EtagCacheInterceptor`** — GET 응답 LRU 100 엔트리 메모리 캐시. 재요청 시 `If-None-Match` 자동 첨부, 서버 304 시 캐시 body로 복구 → 반복 조회 네트워크 전송 0 byte.
4. **`_AuthInterceptor`** — Bearer 토큰 자동 첨부, 401 시 토큰 갱신 (singleton promise로 race condition 방지).
5. **`RetryInterceptor`** — 지수 백오프 (최대 3회, jitter, 5xx만).
6. **`PrettyDioLogger`** — 디버그 모드 요청/응답 로그.

**타임아웃 (v8.5 1초 SLA 대응)**: connect **5s** · receive **10s** · send **15s** (기존 30s/30s/30s에서 축소)
**BaseOptions**: `Accept-Encoding: gzip, deflate` · `Connection: keep-alive` · `persistentConnection: true` 명시 (서버 compression 대응 + TCP 재사용)

엔드포인트 상수: `lib/core/constants/api_constants.dart`
공개 경로 패턴: `kPublicApiPatterns` (auth/child-auth/identity/sms/app(settings|banners|premium-events/featured)/main-popups/academies/public 등) — 서버 `@Public()` 선언과 동기화 필요.

---

## 보안

| 영역               | 구현                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **토큰 저장**      | `flutter_secure_storage` (iOS Keychain `first_unlock`). accessToken, refreshToken, expiry, userId, userType, userName, userEmail, biometric 설정 |
| **생체인증**       | `local_auth` + `AppLockManager` 비활성 추적. 앱 재개 시 잠금 확인 → `BiometricPromptScreen`                                                      |
| **SSL Pinning**    | `assets/certificates/dev/` · `prod/` (Phase 7 — 미배포)                                                                                          |
| **루팅/탈옥 감지** | `flutter_jailbreak_detection`                                                                                                                    |
| **암호화**         | `encrypt` + `pointycastle` (AES, 본인인증용)                                                                                                     |

---

## 주요 의존성 (`pubspec.yaml`)

| 카테고리       | 패키지                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------- |
| **네트워크**   | `dio` 5.7, `http`, `connectivity_plus`, `socket_io_client` 3                                        |
| **WebView**    | `flutter_inappwebview` 6                                                                            |
| **상태관리**   | `flutter_riverpod` 2.6, `riverpod`                                                                  |
| **네비게이션** | `go_router` 17, `app_links` (딥링크)                                                                |
| **보안**       | `flutter_secure_storage` 10, `local_auth`, `flutter_jailbreak_detection`, `encrypt`, `pointycastle` |
| **알림**       | `firebase_messaging` 15, `flutter_local_notifications` 18                                           |
| **QR**         | `mobile_scanner` 7, `qr_flutter` 4                                                                  |
| **저장**       | `shared_preferences`, `hive` + `hive_flutter` (오프라인 캐시)                                       |
| **UI**         | `flutter_svg`, `flutter_native_splash`, `flutter_launcher_icons`                                    |
| **유틸**       | `intl`, `url_launcher`, `package_info_plus`, `permission_handler`                                   |
| **코드 생성**  | `json_annotation` / `json_serializable` + `build_runner`                                            |
| **테스트**     | `mockito`, `mocktail`, `flutter_lints`                                                              |

---

## 코드 생성

`@JsonSerializable()` 사용 모델 (`.g.dart` 3개):

수정 후 반드시 실행:

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

`.g.dart` 파일은 직접 수정 금지.

---

## 플랫폼 노트

|               | iOS                                                                                  | Android                                                |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **최소 버전** | **iOS 15.0** (2026-05-12 상향 — firebase_core 4.x / file_picker 12 요구)             | SDK 21                                                 |
| **권한**      | `Info.plist`: Camera, FaceID                                                         | `AndroidManifest.xml`: Camera                          |
| **의존성 후** | `cd ios && pod install`                                                              | 자동                                                   |
| **특이사항**  | Podfile `platform :ios, '15.0'` · 메이저 업그레이드 시 deployment target 동기화 필수 | 에뮬레이터 localhost → `10.0.2.2` (환경 설정에서 처리) |

**폰트**: **Pretendard** (한글 최적화) — Regular 400, Medium 500, SemiBold 600, Bold 700
**스플래시**: 배경 `#1E40AF`, 아이콘 `splash_logo.png`

---

## 디버깅

| 도구              | 설명                                                       |
| ----------------- | ---------------------------------------------------------- |
| **Bridge 로그**   | `[Bridge]` prefix 콘솔 출력, `BridgeLogger` 디버그 기록    |
| **Bridge 뷰어**   | `lib/core/logging/bridge_log_viewer.dart` — 인앱 디버그 UI |
| **네트워크 로그** | `PrettyDioLogger` 디버그 모드 요청/응답                    |
| **환경 배너**     | `AppEnvironment` 시작 시 API/Web URL 출력                  |

### 자주 발생하는 문제

| 문제             | 해결                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| WebView 빈 화면  | `appEnv.webAppUrl` 확인 — `teamplus-web` 올바른 포트에서 실행 중인지 확인 |
| 토큰 갱신 실패   | `/auth/refresh` 엔드포인트 및 refresh token 유효성 확인                   |
| Android SSL 에러 | 네트워크 보안 설정 또는 인증서 업데이트                                   |
| 생체인증 미작동  | 기기에 등록된 생체인증 있는지 확인                                        |
| 코드 생성 오래됨 | `build_runner build` 실행                                                 |
| CocoaPods 불일치 | `cd ios && pod install --repo-update`                                     |

---

## 연관 프로젝트

| 프로젝트           | 기술 스택                         | 포트 |
| ------------------ | --------------------------------- | ---- |
| `teamplus-web`     | Next.js 15.5 (WebView에서 로드됨) | 5001 |
| `teamplus-backend` | NestJS API 서버                   | 5003 |
| `teamplus-admin`   | 관리자 대시보드                   | 5002 |

---

**Last Updated**: 2026-05-12 | **Version**: 2.2 (Major deps upgrade — Flutter 3.41.6 + Dart 3.11 · 14 direct deps 메이저 업: Riverpod 2→3 (legacy.dart 사용) · flutter_local_notifications 18→21 (named-only API) · local_auth 2→3 (`persistAcrossBackgrounding`) · file_picker 8→12-beta (iOS 14+) · google_sign_in 6→7 (`GoogleSignIn.instance` + `authenticate(scopeHint:)`) · share_plus 10→13 (`SharePlus.instance.share(ShareParams)`) · firebase_core 3→4 · firebase_messaging 15→16 · connectivity_plus 6→7 · app_links 6→7 · package_info_plus 8→10 · mime 1→2 · flutter_lints 4→6 · **iOS 13 → 15 deployment target 상향** · 41 컴파일 에러 해결 · flutter analyze 0 · flutter test 6/6 · android debug build 191MB)
**Version History** — v2.0(초기) → v2.1(API Lifecycle v8.5 — Dio 4-interceptor + 1초 SLA) → **v2.2(Flutter 3.41 메이저 업그레이드)**
