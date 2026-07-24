#!/usr/bin/env bash
#
# 환불 승인제 마이그레이션 검증 — **disposable 격리 스키마 전용** (rebaseline-plan.md §5 mutation test).
#
#   production DB 는 미접촉. 대상 URL 의 schema 를 pc_refund_test 로 치환해 전용 스키마에서:
#     1) FK 타깃 스텁(payments/users/refund_logs) 생성
#     2) 매니페스트 5종 **2회 연속** 실행(멱등)
#     3) RO postcheck PASS
#     4) mutation probe: 활성 3상태 각각 중복 차단 + terminal 3상태 중복 허용 + source CHECK 위반
#        (GET STACKED DIAGNOSTICS 로 제약명 검증)
#     5) negative 3종(비고유 인덱스·컬럼 드롭·predicate 훼손) → RO postcheck FAIL
#     6) DROP SCHEMA(정리)
#   어느 단계든 실패 시 비0 종료. 실행 로그는 _workspace/refund-approval/06_disposable-db-verification.log 로 저장.
set -uo pipefail
cd "$(dirname "$0")/../.."   # backend 루트

SCHEMA_NAME="pc_refund_test"
DIR="prisma/manual-migrations"
BASE_URL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' .env | sed -E 's/^DATABASE_URL=//' | tr -d '"')}"
TEST_URL="$(echo "$BASE_URL" | sed -E "s/schema=[^&]+/schema=${SCHEMA_NAME}/")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
RC=0

run()  { npx prisma db execute --url "$TEST_URL" --file "$1" >/dev/null 2>&1; }
runv() { npx prisma db execute --url "$TEST_URL" --file "$1" 2>&1; }
ok()   { echo "PASS: $1"; }
bad()  { echo "FAIL: $1"; RC=1; }

echo "== disposable DB refund migration verification =="
echo "schema=${SCHEMA_NAME}  utc=$(date -u +%FT%TZ)"

# ── 0. 스키마 + FK 타깃 스텁 ──
cat > "$TMP/00_setup.sql" <<EOF
DROP SCHEMA IF EXISTS ${SCHEMA_NAME} CASCADE;
CREATE SCHEMA ${SCHEMA_NAME};
CREATE TABLE ${SCHEMA_NAME}.payments (id text PRIMARY KEY);
CREATE TABLE ${SCHEMA_NAME}.users (id text PRIMARY KEY);
CREATE TABLE ${SCHEMA_NAME}.refund_logs (id text PRIMARY KEY);
INSERT INTO ${SCHEMA_NAME}.payments(id) VALUES ('pay_test_1');
INSERT INTO ${SCHEMA_NAME}.users(id) VALUES ('usr_test_1');
EOF
run "$TMP/00_setup.sql" && ok "격리 스키마 + FK 스텁 생성" || bad "스키마/스텁 생성"

# ── 1~2. 매니페스트 5종 2회 실행(멱등) ──
mapfile -t FILES < <(sed -E 's/#.*$//' "$DIR/refund-approval.manifest" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' | grep -v '^$')
echo "manifest 항목 수: ${#FILES[@]} (기대 5)"
[ "${#FILES[@]}" -eq 5 ] && ok "manifest 5종" || bad "manifest 수 != 5"
apply_manifest() { for f in "${FILES[@]}"; do run "$DIR/$f" || return 1; done; }
apply_manifest && ok "manifest run1" || bad "manifest run1"
apply_manifest && ok "manifest run2 (멱등)" || bad "manifest run2 멱등"

# ── 3. RO postcheck PASS ──
run "prisma/postcheck-refund.sql" && ok "RO postcheck PASS" || bad "RO postcheck (PASS 기대)"

# ── 4. mutation probe ──
cat > "$TMP/probe.sql" <<EOF
SET search_path TO ${SCHEMA_NAME};
DO \$\$
DECLARE
  st text; v_con text; v_fail text := '';
  active_states   text[] := ARRAY['pending','executing','execution_failed'];
  terminal_states text[] := ARRAY['executed','rejected','canceled'];
BEGIN
  FOREACH st IN ARRAY active_states LOOP
    BEGIN
      INSERT INTO refund_requests(id,payment_id,requester_id,source_type,status,request_reason,requested_amount,updated_at)
        VALUES ('m_'||st||'_1','pay_test_1','usr_test_1','CLASS_PREPAID',st,'probe',0,now());
      INSERT INTO refund_requests(id,payment_id,requester_id,source_type,status,request_reason,requested_amount,updated_at)
        VALUES ('m_'||st||'_2','pay_test_1','usr_test_1','CLASS_PREPAID',st,'probe',0,now());
      v_fail := v_fail || ('active['||st||'] 중복 미차단; ');
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
      IF v_con IS DISTINCT FROM 'refund_requests_active_payment_key' THEN
        v_fail := v_fail || ('active['||st||'] 제약명='||coalesce(v_con,'null')||'; ');
      END IF;
    END;
  END LOOP;
  FOREACH st IN ARRAY terminal_states LOOP
    BEGIN
      INSERT INTO refund_requests(id,payment_id,requester_id,source_type,status,request_reason,requested_amount,updated_at)
        VALUES ('t_'||st||'_1','pay_test_1','usr_test_1','CLASS_PREPAID',st,'probe',0,now());
      INSERT INTO refund_requests(id,payment_id,requester_id,source_type,status,request_reason,requested_amount,updated_at)
        VALUES ('t_'||st||'_2','pay_test_1','usr_test_1','CLASS_PREPAID',st,'probe',0,now());
    EXCEPTION WHEN unique_violation THEN
      v_fail := v_fail || ('terminal['||st||'] 중복 차단됨(허용 기대); ');
    END;
  END LOOP;
  BEGIN
    INSERT INTO refund_requests(id,payment_id,requester_id,source_type,status,request_reason,requested_amount,updated_at)
      VALUES ('src_bad','pay_test_1','usr_test_1','BOGUS','pending','probe',0,now());
    v_fail := v_fail || 'source CHECK 미차단; ';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
    IF v_con IS DISTINCT FROM 'chk_refund_request_source' THEN
      v_fail := v_fail || ('source 제약명='||coalesce(v_con,'null')||'; ');
    END IF;
  END;
  IF v_fail <> '' THEN RAISE EXCEPTION 'mutation probe FAIL: %', v_fail; END IF;
  RAISE NOTICE 'mutation probe OK';
END \$\$;
EOF
run "$TMP/probe.sql" && ok "mutation probe(활성 중복차단·terminal 허용·source CHECK)" || bad "mutation probe"

# ── 5. negative 3종(훼손→FAIL 기대→복원) ──
neg() { # $1=제목 $2=훼손SQL $3=복원SQL
  printf '%s\n' "$2" > "$TMP/corrupt.sql"; run "$TMP/corrupt.sql" || { bad "$1 훼손 적용"; return; }
  if run "prisma/postcheck-refund.sql"; then bad "$1 (postcheck 가 FAIL 해야 함)"; else ok "$1 → postcheck FAIL(기대대로)"; fi
  printf '%s\n' "$3" > "$TMP/restore.sql"; run "$TMP/restore.sql" || bad "$1 복원"
}
IDX_DROP="DROP INDEX ${SCHEMA_NAME}.refund_requests_active_payment_key;"
IDX_GOOD="CREATE UNIQUE INDEX refund_requests_active_payment_key ON ${SCHEMA_NAME}.refund_requests(payment_id) WHERE status IN ('pending','executing','execution_failed');"
neg "N1 비고유 인덱스" "${IDX_DROP} CREATE INDEX refund_requests_active_payment_key ON ${SCHEMA_NAME}.refund_requests(payment_id) WHERE status IN ('pending','executing','execution_failed');" "${IDX_DROP} ${IDX_GOOD}"
neg "N2 컬럼 드롭" "ALTER TABLE ${SCHEMA_NAME}.refund_requests DROP COLUMN pg_first_attempted_at;" "ALTER TABLE ${SCHEMA_NAME}.refund_requests ADD COLUMN pg_first_attempted_at timestamptz;"
neg "N3 predicate 훼손" "${IDX_DROP} CREATE UNIQUE INDEX refund_requests_active_payment_key ON ${SCHEMA_NAME}.refund_requests(payment_id) WHERE status IN ('pending');" "${IDX_DROP} ${IDX_GOOD}"

# ── 6. 정리 ──
printf 'DROP SCHEMA IF EXISTS %s CASCADE;\n' "${SCHEMA_NAME}" > "$TMP/drop.sql"
run "$TMP/drop.sql" && ok "격리 스키마 정리(DROP)" || bad "스키마 정리"

echo "== 결과: $( [ $RC -eq 0 ] && echo ALL-PASS || echo HAS-FAIL ) =="
exit $RC
