# TEAMPLUS App

아이스하키 클럽 관리 플랫폼 - Flutter 하이브리드 앱

**Tech Stack**: Flutter 3.16+ + Dart 3.4+ + WebView + Riverpod

---

## 📊 Current Status (2026-01-25)

| 항목                 | 현황                                    |
| -------------------- | --------------------------------------- |
| **Architecture**     | Hybrid (Native 15-20% + WebView 80-85%) |
| **Flutter Version**  | 3.16+                                   |
| **Dart SDK**         | >=3.4.0 <4.0.0                          |
| **State Management** | Riverpod                                |
| **Navigation**       | GoRouter                                |
| **WebView**          | flutter_inappwebview                    |

### Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Flutter Native Shell (15-20%)             │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────────────┐   │
│  │ Biometric   │ │ QR Scanner   │ │ Secure Storage      │   │
│  │ Auth        │ │ (Camera)     │ │ (JWT)               │   │
│  └─────────────┘ └──────────────┘ └─────────────────────┘   │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────────────┐   │
│  │ Push        │ │ Payment      │ │ SSL Pinning         │   │
│  │ Notifications│ │ (KG Inicis) │ │                     │   │
│  └─────────────┘ └──────────────┘ └─────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│              WebView (flutter_inappwebview) (80-85%)         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Next.js Web App (teamplus-web)          │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                    JavaScript Bridge                         │
│         Native ↔ Web bidirectional communication            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Flutter 3.16 or higher
- Dart 3.4+
- Android Studio / Xcode

### Installation

```bash
# Install dependencies
flutter pub get

# Run in debug mode
flutter run

# Run on specific device
flutter run -d <device_id>

# Release build
flutter run --release
```

### Build Commands

```bash
# iOS
flutter build ios --release

# Android APK
flutter build apk --release

# Android App Bundle
flutter build appbundle --release
```

---

## 📁 Project Structure

```
lib/
├── core/                    # Infrastructure layer
│   ├── auth/               # Token storage
│   ├── constants/          # API endpoints, environment config
│   ├── crypto/             # Encryption service
│   ├── network/            # Dio HTTP client
│   ├── router/             # GoRouter configuration
│   ├── security/           # Biometric, SSL pinning
│   ├── storage/            # Secure storage service
│   ├── theme/              # Material Design 3 theme
│   └── webview/            # WebView bridge (JS ↔ Native)
├── features/               # Feature modules (Clean Architecture)
│   ├── auth/               # Login, register, biometric
│   ├── attendance/         # QR check-in
│   ├── coach/              # Coach admin screens
│   ├── dashboard/          # Dashboards
│   ├── notifications/      # Push notifications
│   ├── payments/           # Payment integration
│   └── shop/               # Shop admin
├── shared/                 # Shared widgets
│   └── widgets/            # Reusable UI components
└── main.dart               # App entry point
```

---

## 🔗 WebView Bridge

Native ↔ Web 통신을 위한 JavaScript Bridge:

### JS Handlers (Web → Native)

| Handler        | Description                  |
| -------------- | ---------------------------- |
| `auth`         | Token get/save/clear         |
| `qrScan`       | Camera permission & scanning |
| `payment`      | KG Inicis payment flow       |
| `biometric`    | Face ID / Touch ID           |
| `notification` | Push notification            |
| `api`          | API requests via native HTTP |
| `ui`           | Control native UI            |

### Native → Web Messages

```dart
await bridge.sendAuthTokenToWeb();
await bridge.sendQrResultToWeb(result);
await bridge.sendPaymentResultToWeb(success: true);
```

---

## 🔐 Security Features

- **SSL Certificate Pinning**: `lib/core/security/ssl_pinning_service.dart`
- **Secure Token Storage**: `flutter_secure_storage` for encrypted storage
- **Biometric Authentication**: Face ID / Touch ID via `local_auth`
- **App Lock**: Configurable timeout with biometric unlock

---

## 🔧 Development Commands

```bash
# Code generation (JSON serialization)
flutter pub run build_runner build --delete-conflicting-outputs

# Watch mode for code generation
flutter pub run build_runner watch --delete-conflicting-outputs

# Analyze code
flutter analyze

# Format code
dart format lib/

# Clean build cache
flutter clean && flutter pub get
```

---

## 📱 Platform-Specific

### iOS

- Minimum version: iOS 13.0
- CocoaPods: `cd ios && pod install`
- Permissions: Camera, Biometric in `Info.plist`

### Android

- Uses 10.0.2.2 for localhost in emulator
- Camera permission in `AndroidManifest.xml`

---

## 🌍 Environment Configuration

| Environment | API Port | Web Port | HTTPS |
| ----------- | -------- | -------- | ----- |
| LOCAL       | 4001     | 3000     | No    |
| DEV         | 4001     | 3000     | Yes   |
| PROD        | 4001     | 3000     | Yes   |

---

**Version**: 2.0.0
**Last Updated**: 2026-01-25
**Status**: MVP 70% Complete
