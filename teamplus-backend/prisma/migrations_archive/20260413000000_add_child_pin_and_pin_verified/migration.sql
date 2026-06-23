-- CreateTable: child_pins (ChildPin 모델)
CREATE TABLE "child_pins" (
    "id" TEXT NOT NULL,
    "child_profile_id" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_set_by" TEXT NOT NULL,
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_pins_pkey" PRIMARY KEY ("id")
);

-- AlterTable: child_profiles에 pin_verified_until 컬럼 추가
ALTER TABLE "child_profiles" ADD COLUMN "pin_verified_until" TIMESTAMP(3);

-- CreateIndex: child_pins unique + indexes
CREATE UNIQUE INDEX "child_pins_child_profile_id_key" ON "child_pins"("child_profile_id");
CREATE INDEX "child_pins_child_profile_id_idx" ON "child_pins"("child_profile_id");
CREATE INDEX "child_pins_locked_until_idx" ON "child_pins"("locked_until");

-- CreateIndex: child_profiles pin_verified_until index
CREATE INDEX "child_profiles_pin_verified_until_idx" ON "child_profiles"("pin_verified_until");

-- AddForeignKey: child_pins → child_profiles
ALTER TABLE "child_pins" ADD CONSTRAINT "child_pins_child_profile_id_fkey"
    FOREIGN KEY ("child_profile_id") REFERENCES "child_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
