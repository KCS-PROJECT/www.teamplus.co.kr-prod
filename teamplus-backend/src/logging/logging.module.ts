/**
 * LoggingModule — 클라이언트 활동 수신 endpoint 묶음 (v8.6 P2-4, 2026-05-20)
 *
 * - POST /api/v1/logs/activity (활동 batch)
 * - POST /api/v1/logs/client-error (단일 에러)
 *
 * 사용:
 *   app.module.ts에 import { LoggingModule } from './logging/logging.module'
 *   imports: [..., LoggingModule]
 */
import { Module } from "@nestjs/common";
import { LoggingController } from "./logging.controller";

@Module({
  controllers: [LoggingController],
})
export class LoggingModule {}
