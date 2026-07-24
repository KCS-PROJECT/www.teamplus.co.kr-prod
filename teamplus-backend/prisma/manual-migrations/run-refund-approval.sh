#!/usr/bin/env bash
#
# 환불 승인제(Phase 1) 전용 마이그레이션 러너 (rebaseline-plan.md §5)
#
# refund-approval.manifest 에 명시된 환불 SQL 5종만, 명시 순서대로 실행한다.
#   - 전역 apply-all.sh 를 호출하지 않는다(비환불 SQL·backfill·seed·rollback 실행 0회 보장).
#   - manifest 가 참조하는 파일이 없으면 즉시 실패(비0).
#   - --list / --dry-run: 실행할 파일 목록만 출력하고 종료(DB 미접촉).
#
# 사용:
#   bash run-refund-approval.sh --list          # dry-run(목록만)
#   bash run-refund-approval.sh                  # 현재 DATABASE_URL 대상 실행
#   DATABASE_URL="postgresql://..." bash run-refund-approval.sh   # 특정 DB 대상
set -euo pipefail

# backend 루트로 이동(스크립트 위치: prisma/manual-migrations/)
cd "$(dirname "$0")/../.."

SCHEMA="prisma/schema.prisma"
DIR="prisma/manual-migrations"
MANIFEST="$DIR/refund-approval.manifest"

if [ ! -f "$MANIFEST" ]; then
  echo "[refund-approval] 매니페스트 없음: $MANIFEST" >&2
  exit 1
fi

# 매니페스트 파싱('#' 주석·빈 줄 제거, 공백 트림).
mapfile -t FILES < <(sed -E 's/#.*$//' "$MANIFEST" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | grep -v '^$')

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "[refund-approval] 매니페스트에 실행할 SQL 없음" >&2
  exit 1
fi

# 참조 파일 존재 검증(누락 시 즉시 실패).
for f in "${FILES[@]}"; do
  if [ ! -f "$DIR/$f" ]; then
    echo "[refund-approval] 매니페스트가 참조하는 SQL 미존재: $DIR/$f" >&2
    exit 1
  fi
done

MODE="${1:-run}"
if [ "$MODE" = "--list" ] || [ "$MODE" = "--dry-run" ]; then
  echo "[refund-approval] dry-run — 실행 대상 ${#FILES[@]}개:"
  for f in "${FILES[@]}"; do echo "  $f"; done
  exit 0
fi

echo "[refund-approval] 환불 SQL ${#FILES[@]}종 순차 적용 시작(멱등)"
for f in "${FILES[@]}"; do
  echo "[refund-approval] applying $f"
  npx prisma db execute --file "$DIR/$f" --schema "$SCHEMA"
done
echo "[refund-approval] 환불 5종 적용 완료"
