/**
 * TransactionLogCleanupService (2026-06-08)
 *
 * 거래로그 90일 보관 정책 — 매일 04:00 KST 에 cutoff(90일) 경과 행을 청크 단위로 삭제.
 * 기존 배치가 자정에 몰려 있어(DB 연결 경합 회피) 04:00 으로 분산.
 *
 * Postgres deleteMany 는 LIMIT 미지원 → id 서브셋(take) 기반 청크 삭제 반복.
 * 대량 삭제 시 락/부하를 피하기 위해 청크 사이 짧은 sleep.
 */

import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { LoggerService } from "../logger/logger.service";

const RETENTION_DAYS = 90;
const CHUNK_SIZE = 5000;
/** 1회 실행 최대 청크 (안전 상한 — 100만 건/회). 초과분은 다음 날 처리 */
const MAX_CHUNKS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TransactionLogCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @Cron("0 4 * * *", { timeZone: "Asia/Seoul" })
  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
    let totalDeleted = 0;
    const startedAt = Date.now();

    try {
      for (let i = 0; i < MAX_CHUNKS; i++) {
        const rows = await this.prisma.transactionLog.findMany({
          where: { occurredAt: { lt: cutoff } },
          select: { id: true },
          take: CHUNK_SIZE,
        });
        if (rows.length === 0) break;

        const res = await this.prisma.transactionLog.deleteMany({
          where: { id: { in: rows.map((r) => r.id) } },
        });
        totalDeleted += res.count;

        if (rows.length < CHUNK_SIZE) break;
        // 부하 분산 — 다음 청크 전 짧은 대기
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      this.logger.info("[TX_LOG_CLEANUP] 90일 경과 거래로그 정리 완료", {
        category: "system",
        cutoff: cutoff.toISOString(),
        deleted: totalDeleted,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      this.logger.error("[TX_LOG_CLEANUP] 거래로그 정리 실패", err, {
        category: "system",
        cutoff: cutoff.toISOString(),
        deletedSoFar: totalDeleted,
      });
    }
  }
}
