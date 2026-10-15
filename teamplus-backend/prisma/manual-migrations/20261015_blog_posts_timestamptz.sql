-- blog_posts 시각 컬럼을 schema.prisma(@db.Timestamptz(3))에 맞춘다.
--   · 20260714_add_blog_posts.sql 이 TIMESTAMP(3) 으로 만들어, 그 SQL 로 생성된 DB(운영)는 타임존 없는 컬럼이다.
--   · 앱(Prisma)은 파라미터에 형변환을 붙이지 않아 timestamp 컬럼에 UTC 벽시계를 쓴다 → UTC 로 해석해 변환한다.
--   · 이미 timestamptz 인 컬럼에 AT TIME ZONE 을 다시 적용하면 -9시간이 되므로 타임존 없는 컬럼만 바꾼다.
--   · 시드 9건(20260716·20260802 시드 SQL)은 세션 TZ(KST) 벽시계로 저장돼 UTC 해석이 맞지 않는다.
--     저장소 밖 일회성 보정을 먼저 실행해야 하며, 보정 전 시드 값이 남아 있으면 변환하지 않고 멈춘다
--     (claudedocs/blog-posts-timezone-fix-2026-10-15.md).

DO $$
DECLARE
  naive_cols text[];
BEGIN
  IF to_regclass(format('%I.blog_posts', current_schema())) IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(column_name::text ORDER BY column_name) INTO naive_cols
    FROM information_schema.columns
   WHERE table_schema = current_schema() AND table_name = 'blog_posts'
     AND column_name IN ('createdAt', 'updatedAt', 'publishedAt', 'deletedAt')
     AND data_type = 'timestamp without time zone';

  IF naive_cols IS NOT NULL THEN
    IF 'createdAt' = ANY(naive_cols) AND EXISTS (
         SELECT 1 FROM "blog_posts"
          WHERE ("createdAt" >= '2026-07-15 02:00:00' AND "createdAt" < '2026-07-15 03:10:00')
             OR ("createdAt" >= '2026-08-02 12:45:00' AND "createdAt" < '2026-08-02 12:46:00')) THEN
      RAISE EXCEPTION 'blog_posts 시드 시각 일회성 보정이 먼저 필요 — claudedocs/blog-posts-timezone-fix-2026-10-15.md';
    END IF;

    EXECUTE 'ALTER TABLE "blog_posts" ' || (
      SELECT string_agg(format('ALTER COLUMN %1$I TYPE TIMESTAMPTZ(3) USING %1$I AT TIME ZONE ''UTC''', c), ', ')
        FROM unnest(naive_cols) AS c);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'blog_posts'
                AND column_name IN ('createdAt', 'updatedAt', 'publishedAt', 'deletedAt')
                AND data_type <> 'timestamp with time zone') THEN
    RAISE EXCEPTION 'blog_posts 시각 컬럼 타입 변환 실패';
  END IF;
END $$;
