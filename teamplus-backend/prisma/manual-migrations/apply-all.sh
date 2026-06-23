#!/usr/bin/env bash
#
# manual-migrations/*.sql 를 파일명 정렬 순으로 멱등 적용한다.
#
# 배경: 원격 공유 DEV/PROD DB 는 drift 정책상 `prisma migrate dev` 를 쓰지 않고,
#   스키마 변경을 prisma/manual-migrations/*.sql 로 수동 작성한다. 그런데 배포의
#   `prisma migrate deploy`(db:migrate:prod)는 prisma/migrations/ 만 적용하고
#   manual-migrations/ 는 적용하지 않아, 신규 테이블/컬럼이 운영 DB 에 생성되지 않는
#   사고가 발생했다(예: contact_inquiries 누락 → 500 "데이터베이스 오류").
#   → 이 스크립트로 배포 시 manual-migrations 까지 함께 적용해 재발을 막는다.
#
# 멱등성: 모든 SQL 은 IF NOT EXISTS / duplicate_object 가드를 포함하므로 반복 실행 안전.
# DATABASE_URL 은 .env(또는 환경변수)에서 prisma 가 읽는다 — 대상 DB 를 바꾸려면
#   DATABASE_URL 을 해당 DB(로컬/DEV/PROD)로 지정해 실행한다.
#
# 사용:
#   npm run db:migrate:manual            # 현재 DATABASE_URL 대상
#   DATABASE_URL="postgresql://..." npm run db:migrate:manual   # 특정 DB 대상
set -euo pipefail

# backend 루트로 이동(스크립트 위치: prisma/manual-migrations/)
cd "$(dirname "$0")/../.."

SCHEMA="prisma/schema.prisma"
DIR="prisma/manual-migrations"

shopt -s nullglob
files=("$DIR"/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "[manual-migration] 적용할 SQL 없음 ($DIR)"
  exit 0
fi

# 파일명 정렬(날짜 prefix 순) — 의존 순서 보장
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort)); unset IFS

echo "[manual-migration] ${#sorted[@]}개 파일 멱등 적용 시작"
for f in "${sorted[@]}"; do
  echo "[manual-migration] applying $(basename "$f")"
  npx prisma db execute --file "$f" --schema "$SCHEMA"
done
echo "[manual-migration] 전체 적용 완료"
