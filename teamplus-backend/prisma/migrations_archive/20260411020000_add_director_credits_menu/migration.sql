-- Add "크레딧 관리" sub-menu under DIRECTOR "재정" group
-- Idempotent: only inserts if a row with same userType/href does not exist.
-- Uses gen_random_uuid() which is provided by pgcrypto (built-in to PG 13+).
--
-- Why this migration exists:
--   기존 시드는 prisma/seed.ts에서 director "재정" 그룹에 결제 관리 1개만 만들었음.
--   감독 메인 화면에서 "결제 및 크레딧" QuickAction이 제거되며, 대신 GlobalMenu
--   드로어와 director-payments 페이지를 통해 /director-credits 로 진입한다.
--   이미 시드된 운영 DB에도 동일 메뉴가 보이도록 idempotent insert 처리.

DO $$
DECLARE
  v_parent_id TEXT;
  v_now TIMESTAMP := NOW();
BEGIN
  -- "재정" 그룹 (DIRECTOR, parent_id IS NULL) 의 id 조회
  SELECT id INTO v_parent_id
  FROM app_menus
  WHERE user_type = 'DIRECTOR'
    AND parent_id IS NULL
    AND label = '재정'
  LIMIT 1;

  -- "재정" 그룹이 존재하고, "크레딧 관리" 가 아직 없을 때만 INSERT
  IF v_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app_menus
    WHERE user_type = 'DIRECTOR'
      AND href = '/director-credits'
      AND parent_id = v_parent_id
  ) THEN
    INSERT INTO app_menus (
      id, user_type, label, icon, href, parent_id, "order", is_active, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text,
      'DIRECTOR',
      '크레딧 관리',
      'account_balance_wallet',
      '/director-credits',
      v_parent_id,
      2,
      true,
      v_now,
      v_now
    );
  END IF;
END $$;
