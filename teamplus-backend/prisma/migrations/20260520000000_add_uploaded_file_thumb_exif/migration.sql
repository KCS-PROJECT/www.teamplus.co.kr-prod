-- AlterTable
ALTER TABLE "uploaded_files" ADD COLUMN "thumb_url" TEXT;
ALTER TABLE "uploaded_files" ADD COLUMN "exif_json" JSONB;
