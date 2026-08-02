-- [2026-08-02] 기존 발행 블로그 5편 커버 이미지 채움 — 브랜드 커버(teamplus-home /public/images/blog/*.png).
--   · 신규 3편 커버는 20260802_seed_blog_geo_guides.sql INSERT 에 포함되어 이 파일 범위 아님.
--   · 멱등·보호: "coverImageUrl" IS NULL 일 때만 갱신 — 어드민에서 수동 지정한 커버는 덮어쓰지 않음.
--   · 이미지 파일은 같은 커밋의 teamplus-home 정적 리소스로 배포됨.

UPDATE "blog_posts" SET "coverImageUrl" = $blog$https://teamplus.icetimes.co.kr/images/blog/2026-dfd00a2c.png$blog$, "updatedAt" = now()
  WHERE "slug" = $blog$2026-dfd00a2c$blog$ AND "coverImageUrl" IS NULL;
UPDATE "blog_posts" SET "coverImageUrl" = $blog$https://teamplus.icetimes.co.kr/images/blog/qr-1d778079.png$blog$, "updatedAt" = now()
  WHERE "slug" = $blog$qr-1d778079$blog$ AND "coverImageUrl" IS NULL;
UPDATE "blog_posts" SET "coverImageUrl" = $blog$https://teamplus.icetimes.co.kr/images/blog/5-68af60a1.png$blog$, "updatedAt" = now()
  WHERE "slug" = $blog$5-68af60a1$blog$ AND "coverImageUrl" IS NULL;
UPDATE "blog_posts" SET "coverImageUrl" = $blog$https://teamplus.icetimes.co.kr/images/blog/2026-27ab5284.png$blog$, "updatedAt" = now()
  WHERE "slug" = $blog$2026-27ab5284$blog$ AND "coverImageUrl" IS NULL;
UPDATE "blog_posts" SET "coverImageUrl" = $blog$https://teamplus.icetimes.co.kr/images/blog/a051b758.png$blog$, "updatedAt" = now()
  WHERE "slug" = $blog$a051b758$blog$ AND "coverImageUrl" IS NULL;
