#!/bin/bash
# TEAMPLUS Flutter iOS 실기기 실행 스크립트 (ios-deploy --justlaunch 우회)
#
# 배경: Xcode 26 + iOS 16 디바이스 조합에서 `flutter run`의 launch/attach 단계가
# 비신뢰적으로 실패함 (lldb는 success인데 CLI가 에러로 종료). 우회 패턴:
#   flutter build ios --release  →  ios-deploy --justlaunch
#
# 사용법:
#   ./scripts/run_ios.sh                       # dev 환경 · release 모드 · USB iOS 첫 번째 디바이스
#   ./scripts/run_ios.sh home                  # home 환경 (LAN IP) · release
#   ./scripts/run_ios.sh dev debug             # dev 환경 · debug 모드
#   IOS_DEVICE_ID=<udid> ./scripts/run_ios.sh  # 디바이스 명시
#
# 의존성:
#   - ios-deploy (brew install ios-deploy)

set -euo pipefail

ENV="${1:-dev}"
MODE="${2:-release}"

# ─── 환경별 entry point ─────────────────────────────────────────
case "$ENV" in
  local) TARGET="lib/main_local.dart"; echo "🏠 LOCAL 환경 (시뮬레이터 전용 — 실기기에는 home/dev/prod 권장)" ;;
  home)  TARGET="lib/main_dev.dart";   echo "🏡 HOME 환경 (LAN IP)" ;;
  dev)   TARGET="lib/main_dev.dart";   echo "🔧 DEV 환경" ;;
  prod)  TARGET="lib/main_prod.dart";  echo "🚀 PROD 환경" ;;
  *)
    echo "❌ 사용법: $0 [local|home|dev|prod] [release|debug|profile]"
    exit 1
    ;;
esac

# ─── 빌드 모드 검증 ─────────────────────────────────────────────
case "$MODE" in
  release|debug|profile) ;;
  *) echo "❌ 알 수 없는 모드: $MODE (release|debug|profile)"; exit 1 ;;
esac

# ─── ios-deploy 존재 확인 ───────────────────────────────────────
if ! command -v ios-deploy >/dev/null 2>&1; then
  echo "❌ ios-deploy 미설치. 다음 명령으로 설치:"
  echo "    brew install ios-deploy"
  exit 1
fi

# ─── 디바이스 ID 결정 ───────────────────────────────────────────
DEVICE_ID="${IOS_DEVICE_ID:-}"
if [ -z "$DEVICE_ID" ]; then
  DEVICE_ID=$(flutter devices --machine 2>/dev/null | \
    python3 -c "
import json, sys
try:
    devices = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for d in devices:
    if d.get('targetPlatform', '').startswith('ios') and not d.get('emulator', False):
        print(d.get('id', ''))
        break
" || true)
fi

if [ -z "$DEVICE_ID" ]; then
  echo "❌ USB로 연결된 iOS 디바이스를 찾지 못했습니다."
  echo "   - 케이블 연결 확인"
  echo "   - 디바이스에서 '이 컴퓨터를 신뢰' 승인"
  echo "   - 또는 IOS_DEVICE_ID=<udid> 명시"
  exit 1
fi

echo "📱 타겟 entry: $TARGET"
echo "⚙️  빌드 모드: $MODE"
echo "📲 디바이스 UDID: $DEVICE_ID"
echo "─────────────────────────────────────────"

# ─── 빌드 ───────────────────────────────────────────────────────
echo "🛠  flutter build ios --$MODE ..."
flutter build ios --"$MODE" -t "$TARGET" --no-pub

BUNDLE_PATH="build/ios/iphoneos/Runner.app"
if [ ! -d "$BUNDLE_PATH" ]; then
  echo "❌ 빌드 산출물 누락: $BUNDLE_PATH"
  exit 1
fi
echo "✅ 빌드 완료: $BUNDLE_PATH"
echo "─────────────────────────────────────────"

# ─── 디바이스 설치 + 실행 (트랜션트 인증서 신뢰 에러 대비 1회 재시도) ───
echo "📤 ios-deploy --justlaunch ..."
deploy_once() {
  ios-deploy --id "$DEVICE_ID" --bundle "$BUNDLE_PATH" --justlaunch --no-wifi 2>&1
}

launched_ok() {
  # lldb error: 가 출력에 없고 success 라인이 단독으로 등장하면 정상 launch
  ! grep -qE "^error: Cannot launch|invalid code signature|inadequate entitlements|not been explicitly trusted" <<<"$1" \
    && grep -qE "^success$" <<<"$1"
}

OUTPUT=$(deploy_once || true)
if launched_ok "$OUTPUT"; then
  echo "$OUTPUT" | tail -3
  echo "─────────────────────────────────────────"
  echo "✅ 디바이스에서 앱 실행됨."
else
  echo "⚠️  첫 시도 실패 — 재시도..."
  sleep 2
  OUTPUT=$(deploy_once || true)
  if launched_ok "$OUTPUT"; then
    echo "$OUTPUT" | tail -3
    echo "─────────────────────────────────────────"
    echo "✅ 재시도 성공 — 디바이스에서 앱 실행됨."
  else
    echo "$OUTPUT" | tail -10
    echo "─────────────────────────────────────────"
    echo "❌ 실행 실패. iPhone에서 직접 신뢰 승인이 필요할 수 있습니다:"
    echo "   설정 > 일반 > VPN 및 기기 관리 > 개발자 앱 > '신뢰'"
    exit 1
  fi
fi
echo "💡 Hot reload 필요 시: Xcode로 .xcworkspace 열고 Run → 별도 터미널에서 'flutter attach'"
