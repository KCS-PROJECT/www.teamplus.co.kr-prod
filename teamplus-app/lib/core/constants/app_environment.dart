// 앱 환경 설정
// 로컬, 개발, 운영 환경을 구분하여 서버 주소 및 설정을 관리합니다.

import 'package:flutter/foundation.dart'
    show kReleaseMode, kDebugMode, debugPrint;

/// 환경 타입
enum EnvironmentType {
  /// 로컬 개발 환경 (localhost / 시뮬레이터 전용)
  local,

  /// 홈/LAN 환경 (개발 머신 LAN IP — 실기기·외부 단말)
  home,

  /// 개발 서버 환경 (dev server)
  dev,

  /// 운영 서버 환경 (production)
  prod,
}

/// 환경별 설정
class EnvironmentConfig {
  final EnvironmentType type;
  final String apiHost;
  final String apiPort;
  final String webHost;
  final String webPort;
  final bool useHttps;
  final bool enableLogging;

  const EnvironmentConfig({
    required this.type,
    required this.apiHost,
    required this.apiPort,
    required this.webHost,
    required this.webPort,
    required this.useHttps,
    required this.enableLogging,
  });

  /// 기본 포트(https=443 / http=80)는 URL 에서 생략한다.
  /// 도메인 기반 PROD 에서 `:443` 이 노출되면 OAuth redirect_uri 정확매칭·
  /// Universal Link/App Link 도메인 매칭·CORS 가 깨질 수 있으므로 방지.
  String _portSuffix(String port) {
    final isDefault = (useHttps && port == '443') || (!useHttps && port == '80');
    return isDefault ? '' : ':$port';
  }

  /// API Base URL
  String get apiBaseUrl {
    final protocol = useHttps ? 'https' : 'http';
    return '$protocol://$apiHost${_portSuffix(apiPort)}/api/v1';
  }

  /// WebView URL (설정된 호스트 사용)
  String get webAppUrl {
    final protocol = useHttps ? 'https' : 'http';
    return '$protocol://$webHost${_portSuffix(webPort)}';
  }

  /// 환경 이름
  String get name {
    switch (type) {
      case EnvironmentType.local:
        return 'LOCAL';
      case EnvironmentType.home:
        return 'HOME';
      case EnvironmentType.dev:
        return 'DEV';
      case EnvironmentType.prod:
        return 'PROD';
    }
  }
}

/// 환경 관리자
class AppEnvironment {
  static AppEnvironment? _instance;
  late EnvironmentConfig _config;

  AppEnvironment._();

  static AppEnvironment get instance {
    _instance ??= AppEnvironment._();
    return _instance!;
  }

  /// 현재 환경 설정
  EnvironmentConfig get config => _config;

  /// 환경 초기화
  /// main.dart에서 앱 시작 시 호출
  void initialize({EnvironmentType? forceEnvironment}) {
    if (forceEnvironment != null) {
      _config = _getConfig(forceEnvironment);
      _logEnvironment();
      return;
    }

    // ── 2026-04-23: tbot 테스트 하네스 모드 감지 ────────────────────────────
    // tbot 이 `flutter run --dart-define TBOT_ENABLED=true --dart-define API_BASE=...
    // --dart-define WEB_BASE=...` 로 주입하면 해당 host/port 를 그대로 사용한다.
    // 이는 시뮬레이터 내부에서 외부 LAN IP 가 `Network is unreachable` 로 실패하는 문제를
    // 해결하기 위한 분기 — localhost:5001 같은 주소로 WebView 가 바로 접근 가능.
    const tbotEnabled =
        bool.fromEnvironment('TBOT_ENABLED', defaultValue: false);
    const tbotApiBase = String.fromEnvironment('API_BASE', defaultValue: '');
    const tbotWebBase = String.fromEnvironment('WEB_BASE', defaultValue: '');
    if (tbotEnabled && tbotApiBase.isNotEmpty && tbotWebBase.isNotEmpty) {
      final cfg = _tryBuildTbotConfig(tbotApiBase, tbotWebBase);
      if (cfg != null) {
        _config = cfg;
        _logEnvironment();
        return;
      }
    }

    // ── 2026-05-10: APP_ENV dart-define 환경 강제 지정 ──────────────────
    // 빌드/실행 명령에서 명시적으로 환경을 선택할 수 있도록 한다.
    // 사용 예:
    //   flutter run --dart-define APP_ENV=local  → 시뮬레이터 (127.0.0.1)
    //   flutter run --dart-define APP_ENV=home   → 홈/LAN IP (192.168.0.100)
    //   flutter run --dart-define APP_ENV=dev    → 개발 서버 (211.236.174.115)
    //   flutter run --dart-define APP_ENV=prod   → 운영 서버
    //   flutter run                              → 자동 감지 (debug=local, release=prod)
    const appEnvOverride = String.fromEnvironment('APP_ENV', defaultValue: '');
    if (appEnvOverride.isNotEmpty) {
      switch (appEnvOverride.toLowerCase()) {
        case 'local':
          _config = _getConfig(EnvironmentType.local);
          _logEnvironment();
          return;
        case 'home':
          _config = _getConfig(EnvironmentType.home);
          _logEnvironment();
          return;
        case 'dev':
        case 'development':
          _config = _getConfig(EnvironmentType.dev);
          _logEnvironment();
          return;
        case 'prod':
        case 'production':
          _config = _getConfig(EnvironmentType.prod);
          _logEnvironment();
          return;
        default:
          // 잘못된 값은 무시하고 자동 감지로 폴백
          if (kDebugMode) {
            debugPrint(
                '[AppEnvironment] ⚠️ Unknown APP_ENV="$appEnvOverride" — fallback to auto detect.');
          }
      }
    }

    // 자동 환경 감지
    if (kReleaseMode) {
      _config = _getConfig(EnvironmentType.prod);
    } else {
      // 디버그 모드에서는 개발(DEV) 서버 사용 (로컬 서버로 되돌리려면 아래 주석 변경)
      _config = _getConfig(EnvironmentType.dev);
      // _config = _getConfig(EnvironmentType.local);
    }

    _logEnvironment();
  }

  /// tbot dart-define 에서 `API_BASE`/`WEB_BASE` URL 을 파싱해
  /// [EnvironmentConfig] 를 생성. 파싱 실패 시 null 반환(=기존 경로로 폴백).
  EnvironmentConfig? _tryBuildTbotConfig(String apiBase, String webBase) {
    try {
      final apiUri = Uri.parse(apiBase);
      final webUri = Uri.parse(webBase);
      if (apiUri.host.isEmpty || webUri.host.isEmpty) return null;
      return EnvironmentConfig(
        type: EnvironmentType.local,
        apiHost: apiUri.host,
        apiPort: apiUri.hasPort
            ? '${apiUri.port}'
            : (apiUri.scheme == 'https' ? '443' : '80'),
        webHost: webUri.host,
        webPort: webUri.hasPort
            ? '${webUri.port}'
            : (webUri.scheme == 'https' ? '443' : '80'),
        useHttps: apiUri.scheme == 'https',
        enableLogging: true,
      );
    } catch (_) {
      return null;
    }
  }

  /// 환경별 설정 반환
  EnvironmentConfig _getConfig(EnvironmentType type) {
    switch (type) {
      case EnvironmentType.local:
        return _localConfig;
      case EnvironmentType.home:
        return _homeConfig;
      case EnvironmentType.dev:
        return _devConfig;
      case EnvironmentType.prod:
        return _prodConfig;
    }
  }

  /// 환경 로깅
  ///
  /// 2026-05-16: prod 외(local / home / dev + dsh / kms / kty LOCAL_MACHINE_IP 변종)에서
  /// release 빌드에서도 환경 박스를 출력. `_config.enableLogging` 이 prod=false /
  /// 나머지=true 로 이미 설정되어 있어 신규 환경 추가 시에도 정책이 자동 유지된다.
  void _logEnvironment() {
    if (_config.enableLogging) {
      debugPrint('╔════════════════════════════════════════════════════════╗');
      debugPrint('║  🌍 Environment: ${_config.name.padRight(40)}║');
      debugPrint('║  📡 API: ${_config.apiBaseUrl.padRight(45)}║');
      debugPrint('║  🌐 Web: ${_config.webAppUrl.padRight(45)}║');
      debugPrint('╚════════════════════════════════════════════════════════╝');
    }
  }

  // ============================================================
  // 환경별 설정 정의
  // ============================================================

  /// 로컬 개발 머신 주소 — iOS Simulator 기본 실행은 Mac 의 localhost 로 접근한다.
  /// 실기기/LAN 테스트처럼 외부 단말 접근이 필요하면 `LOCAL_MACHINE_IP` 또는
  /// `APP_ENV=home` 으로 개발자별 주소를 주입한다.
  ///   flutter run --dart-define-from-file=dart_defines/kms.json
  ///   (kms=211.236.174.110 / kty=211.236.174.90 / dsh=211.236.174.86)
  /// 미지정 시 127.0.0.1 로 폴백 → 시뮬레이터가 현재 워크스페이스의 Next dev server 를 본다.
  /// ※ Info.plist 의 NSExceptionDomains 에 본인 IP 등록 필수.
  /// ※ IP 변경 시 dart_defines/{이니셜}.json 만 수정 (이 파일은 손대지 않음).
  static const _devMachineIp = String.fromEnvironment(
    'LOCAL_MACHINE_IP',
    defaultValue: '127.0.0.1',
  );

  static const _localConfig = EnvironmentConfig(
    type: EnvironmentType.local,
    apiHost: _devMachineIp,
    apiPort: '5003',
    webHost: _devMachineIp,
    webPort: '5001',
    useHttps: false,
    enableLogging: true,
  );

  /// 홈/LAN 환경 설정
  /// 개발 머신 LAN IP — 같은 Wi-Fi 의 실기기·외부 단말이 접근.
  /// 활성: `flutter run --dart-define-from-file=dart_defines/kms.json --dart-define APP_ENV=home`
  /// HOME_MACHINE_IP 미지정 시 LOCAL_MACHINE_IP 와 동일 IP 사용 (대개 같은 머신).
  /// ※ IP 변경 시 dart_defines/{이니셜}.json 만 수정.
  static const _homeMachineIp = String.fromEnvironment(
    'HOME_MACHINE_IP',
    defaultValue: _devMachineIp,
  );

  static const _homeConfig = EnvironmentConfig(
    type: EnvironmentType.home,
    apiHost: _homeMachineIp,
    apiPort: '5003',
    webHost: _homeMachineIp,
    webPort: '5001',
    useHttps: false,
    enableLogging: true,
  );

  /// 개발 서버 환경 설정
  /// ⚠️ 개발 서버에 유효한 SSL 인증서가 없으면 useHttps: false 사용
  static const _devConfig = EnvironmentConfig(
    type: EnvironmentType.dev,
    apiHost: '211.236.174.115',
    apiPort: '5003',
    webHost: '211.236.174.115',
    webPort: '5001',
    useHttps: false, // 개발 서버 SSL 인증서 없음 → HTTP 사용
    enableLogging: true,
  );

  /// 운영 서버 환경 설정
  /// (2026-05-27) 도메인 전환 — 단일 도메인 https://teamplusweb.icetimes.co.kr (443)
  ///   · web = https://teamplusweb.icetimes.co.kr
  ///   · api = https://teamplusweb.icetimes.co.kr/api/v1
  /// 포트 443 은 _portSuffix() 가 URL 에서 생략한다.
  /// ⚠️ 인프라(nginx 등 리버스 프록시)가 443 → web(5001) / `/api` → 백엔드(5003)
  ///    로 라우팅하도록 구성되어 있어야 함. 인프라 변경 선행 필수.
  static const _prodConfig = EnvironmentConfig(
    type: EnvironmentType.prod,
    apiHost: 'teamplusweb.icetimes.co.kr',
    apiPort: '443',
    webHost: 'teamplusweb.icetimes.co.kr',
    webPort: '443',
    useHttps: true,
    enableLogging: false,
  );
}

/// 빠른 접근용 전역 getter
EnvironmentConfig get appEnv => AppEnvironment.instance.config;
