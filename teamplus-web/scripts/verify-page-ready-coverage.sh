#!/bin/bash
# verify-page-ready-coverage.sh — usePageReady 100% 커버리지 검증
# v16 정책: 모든 page.tsx 는 usePageReady 호출 필수
# SoT: docs/Design/LOADING_TIMING_POLICY.md (v16, 2026-05-16)
set -e
cd "$(dirname "$0")/.."
missing=$(find src/app -name "page.tsx" -print0 | xargs -0 grep -L "usePageReady" 2>/dev/null | wc -l | tr -d ' ')
if [ "$missing" -gt 0 ]; then
  echo "❌ usePageReady 미적용 page.tsx $missing 개 발견:"
  find src/app -name "page.tsx" -print0 | xargs -0 grep -L "usePageReady" 2>/dev/null
  echo ""
  echo "📖 SoT: docs/Design/LOADING_TIMING_POLICY.md (v16)"
  exit 1
fi
total=$(find src/app -name "page.tsx" | wc -l | tr -d ' ')
echo "✅ ${total}/${total} (100%) usePageReady 적용 완료"
exit 0
