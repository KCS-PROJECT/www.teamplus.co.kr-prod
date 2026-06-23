import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { VenuesController } from "./venues.controller";
import { VenuesService } from "./venues.service";

/**
 * VenuesModule
 * - MulterModule 등록: 구장 대표 이미지 업로드 대상 `uploads/venues/`
 * - 허용 MIME: image/jpeg, image/png, image/webp
 * - 최대 파일 크기: 5MB (구장 이미지는 카드 썸네일용이므로 충분)
 */
@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: join(__dirname, "../../..", "uploads/venues"),
        filename: (_req, file, callback) => {
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 10);
          const ext = extname(file.originalname).toLowerCase();
          callback(null, `venue-${timestamp}-${randomStr}${ext}`);
        },
      }),
      fileFilter: (_req, file, callback) => {
        const allowedMimes = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
        ];
        // [2026-06-10 SECURITY] MIME + 확장자 동시 검증 (저장형 XSS 차단).
        const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
        const ext = extname(file.originalname).toLowerCase();
        if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
          callback(null, true);
        } else {
          callback(
            new Error(
              "지원하지 않는 이미지 형식입니다. (jpeg/png/webp 만 허용)",
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  ],
  controllers: [VenuesController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
