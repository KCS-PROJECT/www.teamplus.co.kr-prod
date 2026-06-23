-- [2026-06-18] 도입 상담 신청(ContactInquiry) — contact_inquiries 테이블 + ContactInquiryStatus enum 신규 생성.
--   · teamplus-home 랜딩 도입 상담 폼 저장용. 앱 내 학부모↔코치 1:1 상담(Consultation)과 완전 별개 도메인.
--   · 원격 공유 DEV DB(drift) 대상 수동 적용 (prisma migrate dev 금지) → prisma db execute 로 적용.
--   · 비한정(unqualified) 식별자 — manual-migrations 컨벤션 일치(search_path = 연결 스키마). 로컬(public)/원격(icehockey) 양쪽 안전.
--   · 컬럼명은 camelCase — schema.prisma ContactInquiry 모델에 필드 @map 없음(테이블만 @@map). Prisma Client 런타임 기대치와 1:1.
--   · 전부 멱등: enum 은 DO/EXCEPTION 가드(PG enum 은 IF NOT EXISTS 미지원), 테이블·인덱스는 IF NOT EXISTS.

-- 1) Enum: ContactInquiryStatus (PostgreSQL enum 은 CREATE TYPE IF NOT EXISTS 미지원 → duplicate_object 가드)
DO $$
BEGIN
  CREATE TYPE "ContactInquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- 2) Table: contact_inquiries
CREATE TABLE IF NOT EXISTS "contact_inquiries" (
    "id"               TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "managerName"      TEXT NOT NULL,
    "email"            TEXT NOT NULL,
    "phone"            TEXT NOT NULL,
    "interestedPlan"   TEXT,
    "clubSize"         TEXT,
    "message"          TEXT,
    "privacyAgreed"    BOOLEAN NOT NULL DEFAULT false,
    "status"           "ContactInquiryStatus" NOT NULL DEFAULT 'NEW',
    "adminMemo"        TEXT,
    "source"           TEXT NOT NULL DEFAULT 'home_contact',
    "ipAddress"        TEXT,
    "userAgent"        TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "deletedAt"        TIMESTAMP(3),
    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id")
);

-- 3) Index (Prisma 컨벤션 이름 — 향후 db pull/drift 정합성 유지)
CREATE INDEX IF NOT EXISTS "contact_inquiries_status_deletedAt_createdAt_idx" ON "contact_inquiries"("status", "deletedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "contact_inquiries_deletedAt_createdAt_idx"        ON "contact_inquiries"("deletedAt", "createdAt");
