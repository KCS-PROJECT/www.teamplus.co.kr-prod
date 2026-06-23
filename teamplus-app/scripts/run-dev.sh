#!/usr/bin/env bash
#
# TEAMPLUS Flutter App — 스마트 실행 스크립트
#
# 디바이스 타입을 자동 감지하여 적절한 빌드 모드를 선택합니다:
#   - iOS 시뮬레이터  → debug 모드 (Apple 정책상 release/profile 미지원)
#   - iOS 실기기      → release 모드 (또는 인자로 지정)
#   - Android 에뮬레이터/실기기 → release 모드 (또는 인자로 지정)
#
# 환경 변수는 자동으로 APP_ENV=dev (211.236.174.115:5003) 가 주입되며,
# 환경 박스 로그가 release 빌드에서도 노출됩니다 (enableLogging 정책).
#
# 사용법:
#   ./scripts/run-dev.sh                     # 자동 모드 선택
#   ./scripts/run-dev.sh debug               # 강제 debug
#   ./scripts/run-dev.sh release             # 강제 release (시뮬레이터면 에러)
#   ./scripts/run-dev.sh release dsh         # release + LOCAL_MACHINE_IP=dsh.json
#
# 작성일: 2026-05-16

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

# ─────────────────────────────────────────────────────────────────────────
# 1. 인자 파싱
# ─────────────────────────────────────────────────────────────────────────
FORCE_MODE="${1:-auto}"      # auto | debug | profile | release
DEFINE_FILE="${2:-}"          # dsh | kms | kty (dart_defines/{이름}.json)
APP_ENV="${APP_ENV:-dev}"     # 기본 DEV 환경

# ─────────────────────────────────────────────────────────────────────────
# 2. 디바이스 선택 (사용자 인터랙티브)
# ─────────────────────────────────────────────────────────────────────────
echo "📱 연결된 디바이스 조회 중..."
flutter devices --machine > /tmp/teamplus-devices.json 2>/dev/null || {
  echo "❌ flutter devices 명령 실패"; exit 1;
}

# 디바이스 개수 확인
DEVICE_COUNT=$(python3 -c "import json; d=json.load(open('/tmp/teamplus-devices.json')); print(len(d))" 2>/dev/null || echo "0")

if [[ "$DEVICE_COUNT" == "0" ]]; then
  echo "❌ 연결된 디바이스가 없습니다. 디바이스를 연결하거나 시뮬레이터/에뮬레이터를 실행하세요."
  exit 1
fi

# 디바이스 목록 표시 + 선택
flutter devices

echo ""
read -p "디바이스 ID 입력 (그대로 Enter 시 첫 번째 디바이스 자동 선택): " DEVICE_ID

if [[ -z "$DEVICE_ID" ]]; then
  DEVICE_ID=$(python3 -c "import json; d=json.load(open('/tmp/teamplus-devices.json')); print(d[0]['id'])")
  echo "→ 자동 선택: $DEVICE_ID"
fi

# ─────────────────────────────────────────────────────────────────────────
# 3. 시뮬레이터/에뮬레이터 여부 판정
# ─────────────────────────────────────────────────────────────────────────
IS_PHYSICAL=$(python3 -c "
import json
d = json.load(open('/tmp/teamplus-devices.json'))
for dev in d:
    if dev['id'] == '$DEVICE_ID':
        print('true' if dev.get('isDevice', False) else 'false')
        break
" 2>/dev/null || echo "unknown")

DEVICE_PLATFORM=$(python3 -c "
import json
d = json.load(open('/tmp/teamplus-devices.json'))
for dev in d:
    if dev['id'] == '$DEVICE_ID':
        print(dev.get('platformType', 'unknown'))
        break
" 2>/dev/null || echo "unknown")

echo ""
echo "🔍 디바이스 타입: platform=$DEVICE_PLATFORM, 실기기=$IS_PHYSICAL"

# ─────────────────────────────────────────────────────────────────────────
# 4. 빌드 모드 결정
# ─────────────────────────────────────────────────────────────────────────
if [[ "$FORCE_MODE" == "auto" ]]; then
  if [[ "$DEVICE_PLATFORM" == "ios" && "$IS_PHYSICAL" == "false" ]]; then
    MODE="debug"
    echo "⚠️  iOS 시뮬레이터 감지 → debug 모드로 자동 전환 (Apple 정책상 release/profile 미지원)"
  else
    MODE="release"
    echo "✅ 실기기/Android 에뮬레이터 → release 모드 자동 선택"
  fi
else
  if [[ "$FORCE_MODE" == "release" || "$FORCE_MODE" == "profile" ]]; then
    if [[ "$DEVICE_PLATFORM" == "ios" && "$IS_PHYSICAL" == "false" ]]; then
      echo "❌ iOS 시뮬레이터는 $FORCE_MODE 모드를 지원하지 않습니다."
      echo "   → debug 모드로 실행하거나 iOS 실기기를 연결하세요."
      exit 1
    fi
  fi
  MODE="$FORCE_MODE"
  echo "🎯 강제 모드: $MODE"
fi

# ─────────────────────────────────────────────────────────────────────────
# 5. dart-define 옵션 구성
# ─────────────────────────────────────────────────────────────────────────
DART_DEFINES="--dart-define=APP_ENV=$APP_ENV"

if [[ -n "$DEFINE_FILE" ]]; then
  DEFINE_PATH="dart_defines/${DEFINE_FILE}.json"
  if [[ -f "$DEFINE_PATH" ]]; then
    DART_DEFINES="$DART_DEFINES --dart-define-from-file=$DEFINE_PATH"
    echo "📄 dart-define 파일: $DEFINE_PATH"
  else
    echo "⚠️  dart-define 파일 없음: $DEFINE_PATH — 기본 IP(211.236.174.115)로 진행"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────
# 6. 실행
# ─────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "🚀 TEAMPLUS App 실행"
echo "   • 디바이스: $DEVICE_ID ($DEVICE_PLATFORM, 실기기=$IS_PHYSICAL)"
echo "   • 빌드 모드: $MODE"
echo "   • 환경: APP_ENV=$APP_ENV"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# clean + pub get (선택적 — 빠른 실행 원하면 SKIP_CLEAN=1 환경변수 설정)
if [[ -z "${SKIP_CLEAN:-}" ]]; then
  echo "🧹 flutter clean..."
  flutter clean > /dev/null
  echo "📦 flutter pub get..."
  flutter pub get > /dev/null
fi

# flutter run 실행
exec flutter run --$MODE $DART_DEFINES -d "$DEVICE_ID"
