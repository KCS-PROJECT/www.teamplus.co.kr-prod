import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import { EquipmentInspectionController } from "./equipment-inspection.controller";
import { EquipmentInspectionService } from "./equipment-inspection.service";
import { getCategoryDir } from "@/common/upload-paths";

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    // FileInterceptor("photo") 가 사용할 디스크 스토리지.
    // 단일 진입점 헬퍼로 UPLOAD_ROOT env 적용 — 다른 도메인과 동일한 베이스에서
    // `inspections/` 하위 디렉토리만 격리.
    MulterModule.register({
      storage: diskStorage({
        destination: getCategoryDir("inspections"),
        filename: (_req, file, callback) => {
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 10);
          const ext = extname(file.originalname).toLowerCase();
          callback(null, `${timestamp}-${randomStr}${ext}`);
        },
      }),
      fileFilter: (_req, file, callback) => {
        const allowedMimes = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/heic",
          "image/heif",
        ];
        // [2026-06-10 SECURITY] MIME + 확장자 동시 검증 (저장형 XSS 차단).
        const allowedExts = [
          ".jpg",
          ".jpeg",
          ".png",
          ".gif",
          ".webp",
          ".heic",
          ".heif",
        ];
        const ext = extname(file.originalname).toLowerCase();
        if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
          callback(null, true);
        } else {
          callback(new Error("지원하지 않는 이미지 형식입니다."), false);
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB — 모바일 카메라 사진 충분
      },
    }),
  ],
  controllers: [EquipmentInspectionController],
  providers: [EquipmentInspectionService],
  exports: [EquipmentInspectionService],
})
export class EquipmentInspectionModule {}
