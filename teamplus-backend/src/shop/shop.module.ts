import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ShopController } from "./shop.controller";
import { ShopService } from "./shop.service";
import { ShopEnabledGuard } from "./guards/shop-enabled.guard";
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
  // ShopEnabledGuard — 쇼핑몰 피처 플래그 게이트(fail-closed). ShopController 클래스
  // 레벨 @UseGuards 로 부착되며, DI 해석을 명시하기 위해 providers 에 등록한다.
  providers: [ShopService, ShopEnabledGuard],
  exports: [ShopService],
})
export class ShopModule {}
