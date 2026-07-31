/**
 * DataRetentionScheduler (2026-07-30)
 *
 * 보유기간이 경과한 로그·기록을 실제로 파기하는 배치. PIPA §21(보유기간 경과 시 지체 없이
 * 파기) 집행 코드가 저장소에 전무해 `securityConfig.auditLog.retention` 이 死설정이었고,
 * AuditLog·UserActivityLog 가 무기한 누적되던 문제를 해소한다.
 *
 * 보관기간 근거:
 *  - AuditLog(감사·접속기록): **2년** — 「개인정보의 안전성 확보조치 기준」 §8② 접속기록
 *    최소 1년, 고유식별정보(본인인증 CI/DI) 처리 시 최소 2년. 본 서비스는 CI/DI 와 아동
 *    개인정보를 처리하므로 2년. 값은 securityConfig 단일 SoT 에서 읽는다.
 *  - UserActivityLog 접속기록 성격(LOGIN/LOGOUT/API_CALL 등): **2년** — 위와 동일 근거.
 *    userId·ip·resource·durationMs 를 담아 사실상 접속기록에 해당한다.
 *  - UserActivityLog 그 외 행동로그(PAGE_VIEW/CLICK 등): **90일** — 접속기록이 아니라
 *    서비스 개선용 이용내역이라 최소 수집·최소 보관 원칙에 따라 짧게 유지.
 *
 * 삭제 방식은 TransactionLogCleanupService 와 동일 관례(청크 삭제 + 청크 간 sleep) —
 * Postgres deleteMany 는 LIMIT 미지원이라 id 서브셋(take) 기반 반복으로 락·부하를 분산한다.
 * 실행 시각은 기존 배치(자정 다수, 거래로그 04:00)와 겹치지 않게 04:30 KST.
 */

import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { LoggerService } from "../../logger/logger.service";
import { securityConfig } from "../../config/security.config";

/**
 * 접속기록 성격 판정 — 법정 최소 보관(2년) 대상.
 *
 * prefix 매칭인 이유: 로그인 **시도·실패**도 접속기록에 포함되는데(안전성확보조치 §8),
 * 클라이언트가 `LOGIN_FAILURE` 같은 파생 action 을 보내면 정확일치 목록에서는 누락돼
 * 90일에 조기 삭제된다. `LOGIN*`/`LOGOUT*` 를 통째로 접속기록으로 본다.
 */
const ACCESS_RECORD_WHERE: Prisma.UserActivityLogWhereInput = {
  OR: [
    { action: { startsWith: "LOGIN" } },
    { action: { startsWith: "LOGOUT" } },
    { action: "API_CALL" },
  ],
};

/** 접속기록이 아닌 일반 이용내역 보관일수 */
const ACTIVITY_RETENTION_DAYS = 90;

const CHUNK_SIZE = 5000;
/** 1회 실행 최대 청크 (안전 상한 — 모델당 100만 건/회). 초과분은 다음 날 처리 */
const MAX_CHUNKS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DataRetentionScheduler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @Cron("30 4 * * *", { timeZone: "Asia/Seoul" })
  async purgeExpiredRecords(): Promise<void> {
    const auditRetentionDays = securityConfig.auditLog.retention;
    const startedAt = Date.now();

    const auditCutoff = new Date(Date.now() - auditRetentionDays * DAY_MS);
    const activityCutoff = new Date(
      Date.now() - ACTIVITY_RETENTION_DAYS * DAY_MS,
    );

    const auditDeleted = await this.purgeInChunks(
      "AuditLog",
      (take) =>
        this.prisma.auditLog
          .findMany({
            where: { createdAt: { lt: auditCutoff } },
            select: { id: true },
            take,
          })
          .then((rows) => rows.map((r) => r.id)),
      (ids) => this.prisma.auditLog.deleteMany({ where: { id: { in: ids } } }),
    );

    // 접속기록 성격 활동로그 — 2년 경과분
    const accessDeleted = await this.purgeInChunks(
      "UserActivityLog(access)",
      (take) =>
        this.prisma.userActivityLog
          .findMany({
            where: {
              createdAt: { lt: auditCutoff },
              ...ACCESS_RECORD_WHERE,
            },
            select: { id: true },
            take,
          })
          .then((rows) => rows.map((r) => r.id)),
      (ids) =>
        this.prisma.userActivityLog.deleteMany({ where: { id: { in: ids } } }),
    );

    // 그 외 이용내역 활동로그 — 90일 경과분
    const activityDeleted = await this.purgeInChunks(
      "UserActivityLog(activity)",
      (take) =>
        this.prisma.userActivityLog
          .findMany({
            where: {
              createdAt: { lt: activityCutoff },
              NOT: ACCESS_RECORD_WHERE,
            },
            select: { id: true },
            take,
          })
          .then((rows) => rows.map((r) => r.id)),
      (ids) =>
        this.prisma.userActivityLog.deleteMany({ where: { id: { in: ids } } }),
    );

    this.logger.info("[DATA_RETENTION] 보유기간 경과 기록 파기 완료", {
      category: "system",
      auditRetentionDays,
      activityRetentionDays: ACTIVITY_RETENTION_DAYS,
      auditCutoff: auditCutoff.toISOString(),
      activityCutoff: activityCutoff.toISOString(),
      auditDeleted,
      accessDeleted,
      activityDeleted,
      durationMs: Date.now() - startedAt,
    });
  }

  /**
   * 청크 반복 삭제 공통 루틴.
   * 한 모델의 실패가 다른 모델 파기를 막지 않도록 예외를 여기서 흡수하고 0 을 반환한다
   * (파기는 매일 재시도되므로 1회 실패가 누락으로 굳지 않는다).
   */
  private async purgeInChunks(
    label: string,
    findIds: (take: number) => Promise<string[]>,
    deleteByIds: (ids: string[]) => Promise<{ count: number }>,
  ): Promise<number> {
    let totalDeleted = 0;
    try {
      for (let i = 0; i < MAX_CHUNKS; i++) {
        const ids = await findIds(CHUNK_SIZE);
        if (ids.length === 0) break;

        const res = await deleteByIds(ids);
        totalDeleted += res.count;

        if (ids.length < CHUNK_SIZE) break;
        // 부하 분산 — 다음 청크 전 짧은 대기
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (err) {
      this.logger.error(`[DATA_RETENTION] ${label} 파기 실패`, err, {
        category: "system",
        deletedSoFar: totalDeleted,
      });
    }
    return totalDeleted;
  }
}
