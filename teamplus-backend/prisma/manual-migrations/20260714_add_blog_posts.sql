-- [2026-07-14] 랜딩 블로그(BlogPost) — blog_posts 테이블 + BlogCategory/BlogStatus enum 신규 생성.
--   · teamplus-admin(일반관리 ▸ 블로그 관리) 등록 → teamplus-home 랜딩 /blog 공개 노출용.
--   · content 는 리치텍스트 HTML — 저장 시 백엔드 sanitizeBlogHtml 로 살균한 값만 들어간다.
--   · 원격 공유 DEV DB(drift) 대상 수동 적용 (prisma migrate dev 금지) → prisma db execute 로 적용.
--   · 비한정(unqualified) 식별자 — manual-migrations 컨벤션 일치(search_path = 연결 스키마). 로컬(public)/원격(icehockey) 양쪽 안전.
--   · 컬럼명은 camelCase — schema.prisma BlogPost 모델에 필드 @map 없음(테이블만 @@map). Prisma Client 런타임 기대치와 1:1.
--   · 전부 멱등: enum 은 DO/EXCEPTION 가드(PG enum 은 IF NOT EXISTS 미지원), 테이블·인덱스는 IF NOT EXISTS.

-- 1) Enum: BlogCategory (PostgreSQL enum 은 CREATE TYPE IF NOT EXISTS 미지원 → duplicate_object 가드)
DO $$
BEGIN
  CREATE TYPE "BlogCategory" AS ENUM ('NEWS', 'GUIDE', 'EVENT', 'PRESS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2) Enum: BlogStatus
DO $$
BEGIN
  CREATE TYPE "BlogStatus" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 3) Table: blog_posts
CREATE TABLE IF NOT EXISTS "blog_posts" (
    "id"            TEXT NOT NULL,
    "slug"          TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "summary"       TEXT NOT NULL,
    "content"       TEXT NOT NULL,
    "category"      "BlogCategory" NOT NULL DEFAULT 'NEWS',
    "coverImageUrl" TEXT,
    "status"        "BlogStatus" NOT NULL DEFAULT 'DRAFT',
    "pinned"        BOOLEAN NOT NULL DEFAULT false,
    "viewCount"     INTEGER NOT NULL DEFAULT 0,
    "publishedAt"   TIMESTAMP(3),
    "authorId"      TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "deletedAt"     TIMESTAMP(3),
    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- 4) Unique index on slug (Prisma @unique 컨벤션 이름)
CREATE UNIQUE INDEX IF NOT EXISTS "blog_posts_slug_key" ON "blog_posts"("slug");

-- 5) Index (Prisma 컨벤션 이름 — 향후 db pull/drift 정합성 유지)
CREATE INDEX IF NOT EXISTS "blog_posts_status_deletedAt_pinned_publishedAt_idx"     ON "blog_posts"("status", "deletedAt", "pinned", "publishedAt");
CREATE INDEX IF NOT EXISTS "blog_posts_category_status_deletedAt_publishedAt_idx"   ON "blog_posts"("category", "status", "deletedAt", "publishedAt");
