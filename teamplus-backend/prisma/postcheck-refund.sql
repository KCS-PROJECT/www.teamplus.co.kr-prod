-- [2026-07-24 재기준화 §5] 환불 승인제 production DB 계약 postcheck — **읽기 전용(RO)**.
-- 실행: npm run db:postcheck:refund-approval
--   (= prisma db execute --file prisma/postcheck-refund.sql --schema prisma/schema.prisma)
--
-- 원칙(rebaseline-plan.md §5 production postcheck):
--   - 읽기 전용 catalog 검사만. production DB 에 probe row 를 INSERT 하지 않는다.
--   - target schema 귀속(current_schema) + table/column/type + constraint/index 정의를 **정확 집합**으로 검증
--     (상태/소스 초과값·predicate 추가 상태 거부).
--   - 검사 불가(객체 부재·정의 조회 실패)면 PASS 가 아니라 FAIL. fixture-skip-후-PASS 경로 없음.
--   - mutation/negative probe 는 여기에 없다 → disposable DB 테스트(run: test-refund-migration.sh)로 분리.
DO $$
DECLARE
  v_schema   text := current_schema();
  v_rr       regclass := to_regclass(quote_ident(v_schema) || '.refund_requests');
  v_rl       regclass := to_regclass(quote_ident(v_schema) || '.refund_logs');
  v_missing  text := '';
  v_srcdef   text;
  v_idx      pg_index%rowtype;
  v_pred     text;
  v_src_vals text[];
  v_prd_vals text[];
BEGIN
  -- ① 테이블 귀속(target schema).
  IF v_rr IS NULL THEN
    RAISE EXCEPTION '[refund postcheck FAILED] % 스키마에 refund_requests 테이블 없음.', v_schema;
  END IF;
  IF v_rl IS NULL THEN
    v_missing := v_missing || 'refund_logs 테이블(대상 스키마) 없음; ';
  END IF;

  -- ② source CHECK: 대상 테이블 귀속 + convalidated + **정확 집합**(초과값 거부).
  SELECT pg_get_constraintdef(oid) INTO v_srcdef
  FROM pg_constraint
  WHERE conrelid = v_rr AND conname = 'chk_refund_request_source' AND contype = 'c' AND convalidated;
  IF v_srcdef IS NULL THEN
    v_missing := v_missing || 'chk_refund_request_source(대상테이블 귀속 valid CHECK 없음); ';
  ELSE
    -- 정렬/콜레이션 무관 집합 동등 비교(양방향 @>): 요구 4값 정확히, 초과값 거부.
    SELECT array_agg(m[1]) INTO v_src_vals
    FROM regexp_matches(v_srcdef, '''([A-Z_]+)''', 'g') AS m;
    IF v_src_vals IS NULL
       OR NOT (v_src_vals @> ARRAY['CLASS_PREPAID','CLASS_POSTPAID','TOURNAMENT','DIRECT']
               AND ARRAY['CLASS_PREPAID','CLASS_POSTPAID','TOURNAMENT','DIRECT'] @> v_src_vals) THEN
      v_missing := v_missing || 'chk_refund_request_source 값 집합 불일치(' || coalesce(array_to_string(v_src_vals, ','), 'none') || '); ';
    END IF;
  END IF;

  -- ③ active partial unique index: 대상 테이블의 payment_id UNIQUE·VALID·READY partial + predicate **정확 3집합**.
  SELECT i.* INTO v_idx
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname = 'refund_requests_active_payment_key' AND i.indrelid = v_rr;
  IF NOT FOUND THEN
    v_missing := v_missing || 'refund_requests_active_payment_key(대상 테이블 귀속 인덱스 없음); ';
  ELSE
    IF NOT v_idx.indisunique THEN
      v_missing := v_missing || 'active index UNIQUE 아님; ';
    END IF;
    IF NOT (v_idx.indisvalid AND v_idx.indisready) THEN
      v_missing := v_missing || 'active index invalid/not-ready; ';
    END IF;
    IF v_idx.indpred IS NULL THEN
      v_missing := v_missing || 'active index partial 아님(predicate 없음); ';
    ELSE
      v_pred := pg_get_expr(v_idx.indpred, v_idx.indrelid);
      SELECT array_agg(m[1]) INTO v_prd_vals
      FROM regexp_matches(v_pred, '''([a-z_]+)''', 'g') AS m;
      -- 정렬/콜레이션 무관 집합 동등 비교: 정확히 3상태, 추가 상태 거부.
      IF v_prd_vals IS NULL
         OR NOT (v_prd_vals @> ARRAY['pending','executing','execution_failed']
                 AND ARRAY['pending','executing','execution_failed'] @> v_prd_vals) THEN
        v_missing := v_missing || 'active index predicate 상태 집합 불일치(' || coalesce(array_to_string(v_prd_vals, ','), 'none') || '); ';
      END IF;
    END IF;
    IF pg_get_indexdef(v_idx.indexrelid) !~ '\(payment_id\)' THEN
      v_missing := v_missing || 'active index 컬럼 != (payment_id); ';
    END IF;
  END IF;

  -- ④ refund_logs.actor_id 컬럼 존재 + 타입(text) — target schema 귀속.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'refund_logs'
      AND column_name = 'actor_id' AND data_type = 'text'
  ) THEN
    v_missing := v_missing || 'refund_logs.actor_id(text) 누락/타입불일치; ';
  END IF;

  -- ⑤ refund_requests.pg_first_attempted_at 컬럼 존재 + 타입(timestamptz).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'refund_requests'
      AND column_name = 'pg_first_attempted_at' AND data_type = 'timestamp with time zone'
  ) THEN
    v_missing := v_missing || 'refund_requests.pg_first_attempted_at(timestamptz) 누락/타입불일치; ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION '[refund postcheck FAILED] 계약 위반(schema=%): %', v_schema, v_missing;
  END IF;
  RAISE NOTICE '[refund postcheck OK] RO 정밀 5계약 통과(schema=%).', v_schema;
END $$;
