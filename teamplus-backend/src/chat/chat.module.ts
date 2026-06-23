import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { ModerationModule } from "@/moderation/moderation.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import { getCategoryDir } from "@/common/upload-paths";

@Module({
  imports: [
    PrismaModule,
    NotificationsModule, // 신규 메시지 FCM 푸시(pushOnlyToUsers)
    ModerationModule, // 차단 사용자 ID 조회(getBlockedUserIds) — 채팅 차단 필터링
    MulterModule.register({
      storage: diskStorage({
        // 단일 진입점 — UPLOAD_ROOT env 적용. files/videos/shop/inspections/tms 와 동일 베이스.
        destination: getCategoryDir("chat"),
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
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "video/mp4",
          "video/quicktime",
          "audio/mpeg",
          "audio/mp4",
        ];
        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new Error("지원하지 않는 파일 형식입니다."), false);
        }
      },
      limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
      },
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
