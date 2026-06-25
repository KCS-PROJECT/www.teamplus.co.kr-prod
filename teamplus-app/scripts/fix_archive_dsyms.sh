#!/usr/bin/env bash
#
# fix_archive_dsyms.sh
# ─────────────────────────────────────────────────────────────────────────────
# App Store 업로드 시 "Upload Symbols Failed — The archive did not include a dSYM
# for the objective_c.framework ..." 경고를 해소하기 위해, 아카이브(.xcarchive)
# 안에서 dSYM 이 누락된 framework 들의 dSYM 을 dsymutil 로 생성해
# `<archive>/dSYMs/` 폴더에 채워 넣는다.
#
# 배경:
#   - objective_c.framework 는 CocoaPods Pod 가 아니라 Flutter 가 빌드하는 FFI
#     framework 라, Podfile/Xcode 빌드 설정(DEBUG_INFORMATION_FORMAT)으로 dSYM 을
#     직접 강제할 수 없다. 그래서 아카이브 생성 "후"에 보완한다.
#   - 이 경고는 무시해도 출시에 영향이 없다(크래시 심볼화 가독성만 영향). 본 스크립트는
#     크래시 리포트 심볼화를 정밀하게 유지하고 싶을 때만 사용한다.
#
# 사용법:
#   ./scripts/fix_archive_dsyms.sh [<경로>/Foo.xcarchive]
#     - 인자 생략 시 ~/Library/Developer/Xcode/Archives 에서 가장 최근 아카이브 자동 선택.
#   실행 후 Xcode Organizer 에서 해당 아카이브를 다시 "Distribute App" 한다.
#
# 한계:
#   - Release 빌드에서 바이너리가 strip 되어 DWARF 정보가 없으면 dsymutil 로 dSYM 을
#     만들 수 없다(이 경우 경고는 무시가 정답). 그런 framework 는 건너뛰고 로그를 남긴다.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ARCHIVE="${1:-}"

if [[ -z "$ARCHIVE" ]]; then
  ARCHIVE=$(ls -dt "$HOME/Library/Developer/Xcode/Archives/"*/*.xcarchive 2>/dev/null | head -1 || true)
fi

if [[ -z "$ARCHIVE" || ! -d "$ARCHIVE" ]]; then
  echo "❌ .xcarchive 를 찾을 수 없습니다. 경로를 인자로 전달하세요." >&2
  echo "   예) ./scripts/fix_archive_dsyms.sh ~/Library/Developer/Xcode/Archives/2026-06-25/Runner\\ 13-00.xcarchive" >&2
  exit 1
fi

echo "📦 Archive: $ARCHIVE"

APP_DIR=$(ls -d "$ARCHIVE/Products/Applications/"*.app 2>/dev/null | head -1 || true)
if [[ -z "$APP_DIR" || ! -d "$APP_DIR" ]]; then
  echo "❌ .app 을 찾을 수 없습니다: $ARCHIVE/Products/Applications/" >&2
  exit 1
fi

FW_DIR="$APP_DIR/Frameworks"
DSYM_DIR="$ARCHIVE/dSYMs"
mkdir -p "$DSYM_DIR"

if [[ ! -d "$FW_DIR" ]]; then
  echo "ℹ️  Frameworks 디렉토리가 없습니다: $FW_DIR (처리할 항목 없음)"
  exit 0
fi

shopt -s nullglob
generated=0
skipped=0

for fw in "$FW_DIR"/*.framework; do
  name=$(basename "$fw" .framework)
  binary="$fw/$name"
  [[ -f "$binary" ]] || continue

  # 이미 dSYM 이 있으면 건너뜀
  if [[ -d "$DSYM_DIR/$name.framework.dSYM" ]]; then
    continue
  fi

  # dsymutil 로 dSYM 생성 시도 (DWARF 가 strip 된 경우 실패 → 건너뜀)
  if dsymutil "$binary" -o "$DSYM_DIR/$name.framework.dSYM" >/dev/null 2>&1 \
     && [[ -d "$DSYM_DIR/$name.framework.dSYM" ]]; then
    echo "✅ dSYM 생성: $name.framework.dSYM"
    generated=$((generated + 1))
  else
    rm -rf "$DSYM_DIR/$name.framework.dSYM" 2>/dev/null || true
    echo "⚠️  dSYM 생성 불가(심볼 strip 추정, 무시 가능): $name.framework"
    skipped=$((skipped + 1))
  fi
done

echo ""
echo "🎉 완료 — 생성 ${generated}개 · 건너뜀 ${skipped}개"
echo "   이제 Xcode Organizer 에서 해당 아카이브를 다시 'Distribute App' 하세요."
