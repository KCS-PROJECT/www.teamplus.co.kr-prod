/**
 * LogRotationScheduler — 10MB 자체 회전 + 자정 회전 (v8.6 P6, 2026-05-20)
 *
 * 사용자 요구사항:
 * - 10MB 단위로 자동 백업 (.log → .log.1, ..., 최대 5개 백업)
 * - SonicBoom 전환으로 잃은 pino-roll 자동 회전 기능 자체 복원
 *
 * 동작:
 * 1. 5분마다 모든 카테고리 파일 사이즈 체크 + 10MB 초과 시 회전
 * 2. 자정(KST) 회전: 일자 디렉토리 변경 → 새 디렉토리 생성 + 심볼릭 링크 갱신
 * 3. 회전 발생 시 LoggerService의 SonicBoom 인스턴스 재생성 (다음 write가 새 .log에)
 */

import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { LoggerService } from "./logger.service";
import {
  rotateAllIfExceeded,
  ROTATE_MAX_BYTES,
  ROTATE_MAX_BACKUPS,
  ensureAllCategoryFiles,
  updateAllCurrentSymlinks,
} from "./file-path.util";

@Injectable()
export class LogRotationScheduler {
  private readonly logger = new Logger(LogRotationScheduler.name);

  constructor(private readonly appLogger: LoggerService) {}

  /**
   * 5분마다 — 사이즈 기반 회전
   * Cron 표현식: 매시간 0, 5, 10, 15, ... 분 단위 실행
   */
  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: "log-rotation-size-check",
    timeZone: "Asia/Seoul",
  })
  async handleSizeBasedRotation(): Promise<void> {
    try {
      const result = rotateAllIfExceeded(
        new Date(),
        ROTATE_MAX_BYTES,
        ROTATE_MAX_BACKUPS,
      );

      if (result.total > 0) {
        this.logger.log(
          `[LogRotation] 회전 발생 ${result.total}개 파일: ${result.rotated.join(", ")}`,
        );
        // SonicBoom 인스턴스 재생성 — 다음 write가 새 .log 파일에
        this.appLogger.resetFileLoggers();
        this.appLogger.system(
          "info",
          `[LogRotation] ${result.total}개 파일 회전 완료 (10MB 초과)`,
          { rotatedFiles: result.rotated },
        );
      }
    } catch (err) {
      this.logger.error(
        "[LogRotation] size-based rotation 실패",
        (err as Error).stack,
      );
    }
  }

  /**
   * 매일 자정(KST) — 일자 회전
   * 새 일자 디렉토리 자동 생성 + 심볼릭 링크 새 일자로 갱신
   * SonicBoom 인스턴스 재생성으로 다음 write부터 새 일자 디렉토리에 기록
   */
  @Cron("0 0 * * *", {
    name: "log-rotation-daily",
    timeZone: "Asia/Seoul",
  })
  async handleDailyRotation(): Promise<void> {
    try {
      ensureAllCategoryFiles();
      updateAllCurrentSymlinks();
      this.appLogger.resetFileLoggers();
      this.appLogger.system("info", "[LogRotation] 자정 일자 회전 완료", {
        date: new Date().toISOString(),
      });
      this.logger.log("[LogRotation] 자정 일자 회전 완료");
    } catch (err) {
      this.logger.error(
        "[LogRotation] daily rotation 실패",
        (err as Error).stack,
      );
    }
  }
}
