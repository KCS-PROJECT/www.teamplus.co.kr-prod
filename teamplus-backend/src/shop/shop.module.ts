import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ShopController } from "./shop.controller";
import { ShopService } from "./shop.service";
import { getCategoryDir } from "@/common/upload-paths";

@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        // 단일 진입점 — UPLOAD_ROOT env 적용
        destination: getCategoryDir("products"),
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
        ];
        // [2026-06-10 SECURITY] MIME + 확장자 동시 검증 (저장형 XSS 차단).
        const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
        const ext = extname(file.originalname).toLowerCase();
        if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
          callback(null, true);
        } else {
          callback(new Error("지원하지 않는 이미지 형식입니다."), false);
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
