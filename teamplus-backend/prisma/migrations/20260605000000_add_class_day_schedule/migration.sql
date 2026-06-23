-- CreateTable: class_day_schedules (icehockey 스키마)
-- 수업 요일별 시간·장소 규칙 테이블 신규 생성
-- 기존 classes / class_schedules 테이블은 무변경 (하위호환 보존)

CREATE TABLE "icehockey"."class_day_schedules" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "day_of_week" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "venue_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_day_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: class_id 단일 인덱스
CREATE INDEX "class_day_schedules_class_id_idx" ON "icehockey"."class_day_schedules"("class_id");

-- CreateIndex: venue_id 단일 인덱스
CREATE INDEX "class_day_schedules_venue_id_idx" ON "icehockey"."class_day_schedules"("venue_id");

-- CreateUniqueIndex: 수업당 요일 1행만 허용
CREATE UNIQUE INDEX "class_day_schedules_class_id_day_of_week_key" ON "icehockey"."class_day_schedules"("class_id", "day_of_week");

-- AddForeignKey: class_id → icehockey.classes(id) ON DELETE CASCADE
ALTER TABLE "icehockey"."class_day_schedules" ADD CONSTRAINT "class_day_schedules_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "icehockey"."classes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: venue_id → icehockey.venues(id) ON DELETE SET NULL
ALTER TABLE "icehockey"."class_day_schedules" ADD CONSTRAINT "class_day_schedules_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "icehockey"."venues"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
