-- 수업 결제방식 기본값 제거 — 선택형(BOTH) 신규 생성 중단.
-- 기존에는 billing_mode DEFAULT 'BOTH' 라서 감독이 결제방식을 고르지 않으면
-- 학부모가 선불/후불을 택1하는 선택형 수업이 조용히 만들어졌다. 후불은 결제 없이
-- 즉시 등록되어 선택 비용이 0이라 후불 쏠림(역선택)과 미수금 리스크가 누적된다.
-- 애플리케이션은 이미 billing_mode 를 필수로 받는다(CreateClassDto @IsIn(PREPAID|POSTPAID),
-- schema.prisma 의 @default 제거로 Prisma create 입력 필수화). 이 문장은 DB 층까지
-- 동일 계약을 맞춰 Prisma 를 우회하는 직접 INSERT 도 NOT NULL 로 막는다.
--
-- 무영향 보장:
--   · DEFAULT 는 신규 INSERT 에만 적용된다. 기존 행의 billing_mode 값은 그대로 남는다.
--   · 기존 BOTH 수업은 조회·등록·출석·정산 읽기 경로가 그대로라 계속 동작한다.
--   · NOT NULL 제약과 인덱스는 변경하지 않는다.
--
-- 실행 순서: 애플리케이션 코드 배포 이후. 반대로 하면 billing_mode 를 보내지 않는
--            구 코드가 NOT NULL 위반으로 실패한다.
--
-- 롤백: ALTER TABLE "classes" ALTER COLUMN "billing_mode" SET DEFAULT 'BOTH';

ALTER TABLE "classes" ALTER COLUMN "billing_mode" DROP DEFAULT;

COMMENT ON COLUMN "classes"."billing_mode" IS
  '결제 방식 — 생성 시 확정, 수정 불가. PREPAID(선불) | POSTPAID(후불). BOTH(선택형)는 신규 생성 중단이며 기존 행만 유지된다.';
