#!/bin/bash
# TEAMPLUS Flutter iOS 환경별 빌드 스크립트
# 사용법: ./scripts/build_ios.sh [local|dev|prod] [run|build|ipa] [appstore|adhoc]

set -e

ENV="${1:-dev}"
ACTION="${2:-run}"
EXPORT_METHOD="${3:-appstore}"

case "$ENV" in
  local)
    TARGET="lib/main_local.dart"
    echo "🏠 LOCAL 환경 빌드"
    ;;
  dev)
    TARGET="lib/main_dev.dart"
    echo "🔧 DEV 환경 빌드"
    ;;
  prod)
    TARGET="lib/main_prod.dart"
    echo "🚀 PROD 환경 빌드"
    ;;
  *)
    echo "❌ 사용법: $0 [local|dev|prod] [run|build|ipa] [appstore|adhoc]"
    echo ""
    echo "  환경:"
    echo "    local  - 로컬 개발 (211.236.174.86)"
    echo "    dev    - 개발 서버 (211.236.174.115)"
    echo "    prod   - 운영 서버 (211.236.174.230)"
    echo ""
    echo "  액션:"
    echo "    run    - Debug 실행 (기본값)"
    echo "    build  - Release 빌드 (.app)"
    echo "    ipa    - IPA 생성 (App Store/TestFlight 또는 Ad Hoc)"
    echo ""
    echo "  Export Method (ipa 액션 시):"
    echo "    appstore - App Store Connect 업로드용 (기본값)"
    echo "    adhoc    - Ad Hoc 배포 (외부 테스터 OTA 링크)"
    exit 1
    ;;
esac

echo "📱 타겟: $TARGET"
echo "⚡ 액션: $ACTION"
if [ "$ACTION" = "ipa" ]; then
  echo "📦 Export: $EXPORT_METHOD"
fi
echo "---"

case "$ACTION" in
  run)
    flutter run -t "$TARGET"
    ;;
  build)
    flutter build ios --release -t "$TARGET"
    echo "✅ 빌드 완료: build/ios/iphoneos/Runner.app"
    ;;
  ipa)
    case "$EXPORT_METHOD" in
      adhoc|ad-hoc)
        EXPORT_OPTS="ios/ExportOptions-AdHoc.plist"
        if [ ! -f "$EXPORT_OPTS" ]; then
          echo "❌ $EXPORT_OPTS 가 없습니다. Ad Hoc Provisioning Profile 생성 후 다시 시도하세요."
          exit 1
        fi
        echo "📦 Ad Hoc IPA 생성 (외부 테스터 OTA 배포용)"
        flutter build ipa --release -t "$TARGET" --export-options-plist="$EXPORT_OPTS"
        ;;
      appstore|app-store|app-store-connect)
        echo "📦 App Store Connect IPA 생성"
        flutter build ipa --release -t "$TARGET"
        ;;
      *)
        echo "❌ 알 수 없는 export method: $EXPORT_METHOD (appstore|adhoc)"
        exit 1
        ;;
    esac
    echo "✅ IPA 생성 완료: build/ios/ipa/"
    ;;
  *)
    echo "❌ 알 수 없는 액션: $ACTION (run|build|ipa)"
    exit 1
    ;;
esac
