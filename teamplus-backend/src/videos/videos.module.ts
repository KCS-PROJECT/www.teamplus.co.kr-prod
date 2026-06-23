import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { randomBytes } from "crypto";
import { extname } from "path";
import { VideosController } from "./videos.controller";
import { VideosService } from "./videos.service";
import { getCategoryDir } from "@/common/upload-paths";

@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        // 단일 진입점 `common/upload-paths.ts` 위임 — UPLOAD_ROOT env 적용.
        destination: getCategoryDir("videos"),
        filename: (_req, file, callback) => {
          const timestamp = Date.now();
          const randomStr = randomBytes(5).toString("hex");
          const ext = extname(file.originalname).toLowerCase();
          callback(null, `${timestamp}-${randomStr}${ext}`);
        },
      }),
      fileFilter: (_req, file, callback) => {
        const allowedMimes = [
          "video/mp4",
          "video/quicktime",
          "video/x-msvideo",
          "video/webm",
        ];
        // [2026-06-10 SECURITY] MIME + 확장자 동시 검증 (저장형 XSS 차단).
        //   기존: MIME(클라이언트 제어 가능)만 검사하고 확장자 보존 → .html/.svg 업로드 후
        //   /uploads 정적 서빙 시 브라우저에서 실행되는 저장형 XSS 가능.
        const allowedExts = [".mp4", ".mov", ".avi", ".webm"];
        const ext = extname(file.originalname).toLowerCase();
        if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
          callback(null, true);
        } else {
          callback(
            new Error(
              "지원하지 않는 영상 형식입니다. (mp4, mov, avi, webm만 허용)",
            ),
            false,
          );
        }
      },
      limits: {
        // 2026-05-23: R2 제거 + multipart 단일 채널 전환에 따라 영상은 50MB 한도.
        //   FilesService VIDEO 카테고리(50MB) 및 Web UPLOAD_LIMITS.VIDEO 와 동기화.
        //   모바일 카메라 영상은 클라이언트 video_compress 등으로 사전 압축 권장.
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
