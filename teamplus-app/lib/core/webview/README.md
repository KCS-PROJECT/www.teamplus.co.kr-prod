# WebView Bridge 사용 가이드

Flutter Native와 WebView(JavaScript) 간의 양방향 통신을 위한 Bridge 시스템입니다.

## 아키텍처

```
┌─────────────────────────────────────────┐
│  Flutter Native (Dart)                  │
│  • webview_bridge.dart                  │
│  • webview_screen.dart                  │
│  • js_bridge.dart                       │
│  • token_storage.dart                   │
│  • qr_scanner_service.dart              │
└───────────────┬─────────────────────────┘
                │ JavaScript Bridge
┌───────────────▼─────────────────────────┐
│  WebView (JavaScript)                   │
│  • native_bridge.js                     │
│  • React/Vue.js Web App                 │
└─────────────────────────────────────────┘
```

## 주요 컴포넌트

### 1. Flutter Native (Dart)

#### `webview_bridge.dart`

- JavaScript 핸들러 등록 및 관리
- Native → Web 메시지 전송
- Web → Native 요청 처리
- 6가지 메시지 타입 지원:
  - `auth`: 인증 토큰 관리
  - `qrScan`: QR 코드 스캔
  - `payment`: 결제 처리
  - `biometric`: 생체인증
  - `notification`: 푸시 알림
  - `navigation`: 딥링크/네비게이션

#### `webview_screen.dart`

- WebView 화면 구현
- 로딩/에러 상태 관리
- Pull-to-refresh
- 오프라인 캐싱
- 접근성 설정

#### `js_bridge.dart`

- 메시지 직렬화/역직렬화
- 콜백 관리
- 타입 정의

#### `token_storage.dart`

- JWT 토큰 안전 저장
- flutter_secure_storage 기반
- 토큰 만료 검증

#### `qr_scanner_service.dart`

- QR 코드 스캔
- 카메라 권한 관리
- TEAMPLUS 출석 QR 파싱

### 2. Web (JavaScript)

#### `native_bridge.js`

- Native 함수 호출 API
- Promise 기반 비동기 처리
- 이벤트 리스너 관리
- 전역 객체로 노출: `window.FlutterBridge`

## 사용 예시

### Flutter Native → Web 메시지 전송

```dart
// 1. WebView Bridge 인스턴스 가져오기
final bridge = webViewScreen.bridge;

// 2. 인증 토큰 전송
await bridge?.sendAuthTokenToWeb();

// 3. QR 스캔 결과 전송
final qrResult = QrScanResult(
  code: 'teamplus://checkin?scheduleId=123&memberId=456',
  scannedAt: DateTime.now(),
);
await bridge?.sendQrResultToWeb(qrResult);

// 4. 결제 결과 전송
await bridge?.sendPaymentResultToWeb(
  success: true,
  transactionId: 'txn_123456',
  orderNumber: 'ORD-20260104-001',
);

// 5. 푸시 알림 전송
await bridge?.sendNotificationToWeb({
  'title': '결제 완료',
  'body': '수업료가 결제되었습니다.',
  'data': {'orderId': '123'},
});

// 6. 딥링크 전송
await bridge?.sendDeepLinkToWeb('teamplus://classes/123');
```

### Web → Flutter Native 요청

```javascript
// 1. 인증 토큰 조회
const tokenInfo = await FlutterBridge.auth.getToken();
console.log("Access Token:", tokenInfo.accessToken);

// 2. 인증 상태 확인
const isAuth = await FlutterBridge.auth.isAuthenticated();

// 3. 토큰 저장 (로그인 시)
await FlutterBridge.auth.saveToken({
  accessToken: "eyJhbGc...",
  refreshToken: "refresh_token",
  expiryTimestamp: 1704326400,
  userId: "user_123",
  userType: "parent",
});

// 4. 로그아웃
await FlutterBridge.auth.clearToken();

// 5. QR 스캔 시작
try {
  const qrResult = await FlutterBridge.qr.scan();
  console.log("QR Code:", qrResult.code);
} catch (error) {
  console.error("QR Scan failed:", error);
}

// 6. 결제 시작
try {
  const paymentResult = await FlutterBridge.payment.initiate({
    orderNumber: "ORD-20260104-001",
    amount: 240000,
    paymentUrl: "https://pay.inicis.com/...",
  });
  console.log("Payment Success:", paymentResult.transactionId);
} catch (error) {
  console.error("Payment failed:", error);
}

// 7. 생체인증
const isBiometricAvailable = await FlutterBridge.biometric.checkAvailability();
if (isBiometricAvailable.available) {
  const authenticated = await FlutterBridge.biometric.authenticate();
  console.log("Authenticated:", authenticated);
}

// 8. 푸시 알림 권한 요청
const granted = await FlutterBridge.notification.requestPermission();

// 9. FCM 토큰 조회
const fcmToken = await FlutterBridge.notification.getToken();

// 10. 알림 수신 리스너
FlutterBridge.notification.onReceived((notification) => {
  console.log("Notification received:", notification);
  // UI 업데이트
});

// 11. 딥링크 리스너
FlutterBridge.navigation.onDeepLink((url) => {
  console.log("Deep link:", url);
  // teamplus://classes/123 → /classes/123 경로로 이동
});

// 12. Native 화면 이동
await FlutterBridge.navigation.navigate("/qr-scanner", {
  scheduleId: "123",
});
```

### React 컴포넌트 예시

```jsx
import React, { useEffect, useState } from "react";

function LoginForm() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // 초기 인증 상태 확인
    checkAuth();

    // 토큰 업데이트 리스너
    FlutterBridge.on("auth", (data) => {
      if (data.action === "tokenUpdate") {
        console.log("Token updated:", data.tokenInfo);
      }
    });
  }, []);

  const checkAuth = async () => {
    try {
      const isAuth = await FlutterBridge.auth.isAuthenticated();
      setIsAuthenticated(isAuth);
    } catch (error) {
      console.error("Auth check failed:", error);
    }
  };

  const handleLogin = async (email, password) => {
    try {
      // 백엔드 로그인 API 호출
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      // Native에 토큰 저장
      await FlutterBridge.auth.saveToken({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiryTimestamp: data.expiryTimestamp,
        userId: data.userId,
        userType: data.userType,
      });

      setIsAuthenticated(true);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      // 백엔드 로그아웃 API 호출
      await fetch("/api/auth/logout", { method: "POST" });

      // Native에서 토큰 삭제
      await FlutterBridge.auth.clearToken();

      setIsAuthenticated(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div>
      {isAuthenticated ? (
        <button onClick={handleLogout}>로그아웃</button>
      ) : (
        <form onSubmit={handleLogin}>{/* Login form */}</form>
      )}
    </div>
  );
}

export default LoginForm;
```

### Vue 컴포넌트 예시

```vue
<template>
  <div>
    <button @click="scanQr" :disabled="scanning">
      {{ scanning ? "QR 스캔 중..." : "QR 체크인" }}
    </button>
    <p v-if="qrResult">스캔 결과: {{ qrResult.code }}</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      scanning: false,
      qrResult: null,
    };
  },
  mounted() {
    // QR 스캔 결과 리스너
    FlutterBridge.on("qrScan", (data) => {
      if (data.action === "scanResult") {
        this.qrResult = data.result;
        this.scanning = false;
        this.handleQrResult(data.result);
      }
    });
  },
  methods: {
    async scanQr() {
      this.scanning = true;
      try {
        // 카메라 권한 확인
        const hasPermission = await FlutterBridge.qr.checkPermission();
        if (!hasPermission) {
          const granted = await FlutterBridge.qr.requestPermission();
          if (!granted) {
            alert("카메라 권한이 필요합니다.");
            this.scanning = false;
            return;
          }
        }

        // QR 스캔 시작
        const result = await FlutterBridge.qr.scan();
        this.qrResult = result;
        this.handleQrResult(result);
      } catch (error) {
        console.error("QR scan failed:", error);
        alert("QR 스캔에 실패했습니다.");
      } finally {
        this.scanning = false;
      }
    },
    async handleQrResult(result) {
      try {
        // TEAMPLUS 출석 QR 파싱
        const params = new URLSearchParams(result.code.split("?")[1]);
        const scheduleId = params.get("scheduleId");
        const memberId = params.get("memberId");

        // 백엔드 출석 체크인 API 호출
        const response = await fetch("/api/attendance/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduleId, memberId }),
        });

        if (response.ok) {
          alert("출석 체크인이 완료되었습니다!");
        } else {
          alert("출석 체크인에 실패했습니다.");
        }
      } catch (error) {
        console.error("Check-in failed:", error);
        alert("출석 처리 중 오류가 발생했습니다.");
      }
    },
  },
};
</script>
```

## 메시지 타입 상세

### 1. auth (인증)

**Web → Native 요청**

```javascript
// 토큰 조회
await FlutterBridge.auth.getToken()

// 토큰 저장
await FlutterBridge.auth.saveToken({ accessToken, refreshToken, ... })

// 토큰 삭제
await FlutterBridge.auth.clearToken()

// 인증 상태 확인
await FlutterBridge.auth.isAuthenticated()
```

**Native → Web 메시지**

```javascript
{
  type: 'auth',
  data: {
    action: 'tokenUpdate',
    tokenInfo: { accessToken, refreshToken, userId, userType }
  }
}
```

### 2. qrScan (QR 스캔)

**Web → Native 요청**

```javascript
// 권한 요청
await FlutterBridge.qr.requestPermission();

// 권한 확인
await FlutterBridge.qr.checkPermission();

// 스캔 시작
await FlutterBridge.qr.scan();
```

**Native → Web 메시지**

```javascript
{
  type: 'qrScan',
  data: {
    action: 'scanResult',
    result: {
      code: 'teamplus://checkin?scheduleId=123&memberId=456',
      scannedAt: '2026-01-04T12:00:00.000Z'
    }
  }
}
```

### 3. payment (결제)

**Web → Native 요청**

```javascript
// 결제 시작
await FlutterBridge.payment.initiate({
  orderNumber: "ORD-20260104-001",
  amount: 240000,
  paymentUrl: "https://pay.inicis.com/...",
});

// 결제 검증
await FlutterBridge.payment.verify("txn_123456");
```

**Native → Web 메시지**

```javascript
{
  type: 'payment',
  data: {
    action: 'paymentResult',
    success: true,
    transactionId: 'txn_123456',
    orderNumber: 'ORD-20260104-001'
  }
}
```

### 4. biometric (생체인증)

**Web → Native 요청**

```javascript
// 가능 여부 확인
await FlutterBridge.biometric.checkAvailability();

// 인증 실행
await FlutterBridge.biometric.authenticate();
```

### 5. notification (알림)

**Web → Native 요청**

```javascript
// 권한 요청
await FlutterBridge.notification.requestPermission();

// 로컬 알림 표시
await FlutterBridge.notification.show({ title, body, data });

// FCM 토큰 조회
await FlutterBridge.notification.getToken();
```

**Native → Web 메시지**

```javascript
{
  type: 'notification',
  data: {
    action: 'notificationReceived',
    notification: { title, body, data }
  }
}
```

### 6. navigation (네비게이션)

**Web → Native 요청**

```javascript
// Native 화면 이동
await FlutterBridge.navigation.navigate("/qr-scanner", { scheduleId: "123" });
```

**Native → Web 메시지**

```javascript
{
  type: 'navigation',
  data: {
    action: 'deepLink',
    url: 'teamplus://classes/123'
  }
}
```

## 오프라인 캐싱

WebView는 기본적으로 캐싱이 활성화되어 있습니다:

- HTML, CSS, JavaScript 파일 캐시
- 이미지 및 정적 리소스 캐시
- API 응답은 Service Worker로 별도 구현 권장

## 보안 고려사항

1. **토큰 저장**: flutter_secure_storage 사용 (암호화)
2. **HTTPS Only**: HTTP 요청 차단
3. **XSS 방지**: CSP (Content Security Policy) 설정
4. **민감 정보**: JavaScript 콘솔에 로깅 금지
5. **권한 관리**: 카메라, 알림 등 런타임 권한 요청

## 디버깅

### Flutter Native 디버깅

```dart
// JavaScript 콘솔 로그 확인
onConsoleMessage: (controller, consoleMessage) {
  debugPrint('JS Console: ${consoleMessage.message}');
}
```

### Web 디버깅

```javascript
// Chrome DevTools에서 확인
console.log("Bridge available:", !!window.FlutterBridge);
console.log("InAppWebView available:", !!window.flutter_inappwebview);
```

## 문제 해결

### 1. Bridge가 undefined

```javascript
// 해결: WebView 로딩 완료 후 호출
window.addEventListener("flutterInAppWebViewPlatformReady", () => {
  console.log("Bridge ready:", !!window.FlutterBridge);
});
```

### 2. 토큰이 조회되지 않음

```dart
// 해결: 로그인 후 토큰 저장 확인
await _tokenStorage.saveAccessToken(token);
final saved = await _tokenStorage.getAccessToken();
debugPrint('Token saved: ${saved != null}');
```

### 3. QR 스캔 권한 거부

```dart
// 해결: 설정으로 이동 안내
if (status.isPermanentlyDenied) {
  await openAppSettings();
}
```

## TODO

- [ ] local_auth 패키지 연동 (생체인증)
- [ ] KG이니시스 결제 SDK 연동
- [ ] firebase_messaging 연동 (푸시 알림)
- [ ] url_launcher 연동 (외부 링크)
- [ ] Service Worker 구현 (오프라인 API 캐싱)

## 참고 자료

- [flutter_inappwebview 문서](https://pub.dev/packages/flutter_inappwebview)
- [flutter_secure_storage 문서](https://pub.dev/packages/flutter_secure_storage)
- [mobile_scanner 문서](https://pub.dev/packages/mobile_scanner)
- [TEAMPLUS PRD](../../../PRD.md)
- [TEAMPLUS PLAN](../../../PLAN.md)
