/**
 * TransactionLogService (2026-06-08, v2 — 버퍼링 배치)
 *
 * 모든 HTTP 거래(요청·응답)를 requestId 단위 1행으로 적재한다.
 * 전역 ApiLifecycleInterceptor.finalize 가 `capture()` 를 fire-and-forget 으로 호출.
 *
 * v2 개선 (커넥션 풀 경합·P2002 로그유실 방어):
 *  - capture() 는 DB 를 직접 건드리지 않고 메모리 버퍼에 적재 → 요청당 커넥션 풀 점유 0.
 *  - 1초 주기 또는 100건 임계 도달 시 createMany(skipDuplicates) 로 일괄 적재(쓰기 효율↑).
 *  - skipDuplicates: 동일 requestId 동시 전송(client echo race) 시 P2002 없이 충돌 무시.
 *  - 버퍼 상한 초과 시 가장 오래된 항목 폐기(본 API 보호 우선) → 거래로그가 메모리를 잠식하지 않음.
 *  - onModuleDestroy: graceful shutdown 시 잔여 버퍼 flush.
 *
 * 보장: capture()/flush() 모두 try/catch swallow — 저장 실패가 본 API 응답에 영향 0.
 */

import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TxCaptureInput } from "./transaction-log.types";
import {
  decideResult,
  maskSensitive,
  preparePayload,
  toPathname,
} from "./transaction-log.util";

/** Prisma Json 컬럼 입력값으로 정규화 — null/undefined 는 컬럼 NULL 로. */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null
    ? undefined
    : (value as Prisma.InputJsonValue);
}

/** flush 주기 (ms) — 이 주기마다 버퍼를 비운다. */
const FLUSH_INTERVAL_MS = 1000;
/** 임계 건수 — 버퍼가 이 수에 도달하면 즉시 flush. */
const FLUSH_THRESHOLD = 100;
/** 버퍼 상한 — DB 지연 누적 시 메모리 폭주 방어(초과분 폐기). */
const MAX_BUFFER = 10_000;

@Injectable()
export class TransactionLogService implements OnModuleDestroy {
  private buffer: Prisma.TransactionLogCreateManyInput[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  /** 버퍼 상한 초과로 폐기된 누적 건수 (관측용) */
  private droppedCount = 0;

  constructor(private readonly prisma: PrismaService) {
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    // 타이머가 프로세스 종료를 막지 않도록 unref
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  /**
   * fire-and-forget 캡처 — DB 미접근(버퍼 적재만) → 본 API 응답 경로 영향 0.
   * 동기 가공(판정/마스킹/truncate)만 수행하고 즉시 반환한다.
   */
  capture(input: TxCaptureInput): void {
    try {
      const row = this.buildRow(input);
      // 폭주 방어 — 상한 초과 시 가장 오래된 항목 폐기(본 API 보호 우선)
      if (this.buffer.length >= MAX_BUFFER) {
        this.buffer.shift();
        this.droppedCount++;
      }
      this.buffer.push(row);
      if (this.buffer.length >= FLUSH_THRESHOLD) void this.flush();
    } catch {
      /* 가공 실패는 본 요청에 영향 없음 (silent swallow) */
    }
  }

  /** 캡처 입력 → DB 행. 판정·마스킹·truncate 를 동기 수행. */
  private buildRow(
    input: TxCaptureInput,
  ): Prisma.TransactionLogCreateManyInput {
    const { result, bizSuccess, errorCode, errorMessage } = decideResult(
      input.httpStatus,
      input.outputError,
      input.outputBody,
    );

    const reqHeaders = preparePayload(maskSensitive(input.reqHeaders));
    const reqBody = preparePayload(maskSensitive(input.reqBody));
    const reqQuery = preparePayload(maskSensitive(input.reqQuery));
    const reqParams = preparePayload(maskSensitive(input.reqParams));
    const resHeaders = preparePayload(maskSensitive(input.resHeaders));
    const resBody = preparePayload(maskSensitive(input.outputBody));

    const truncated =
      reqHeaders.truncated ||
      reqBody.truncated ||
      reqQuery.truncated ||
      reqParams.truncated ||
      resHeaders.truncated ||
      resBody.truncated;

    let responseBytes: number | null = null;
    try {
      responseBytes =
        input.outputBody !== undefined
          ? (JSON.stringify(input.outputBody)?.length ?? null)
          : null;
    } catch {
      responseBytes = null;
    }

    return {
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      method: input.method,
      path: toPathname(input.url),
      httpStatus: input.httpStatus,
      bizSuccess,
      result,
      errorCode,
      errorMessage,
      durationMs: input.durationMs,
      userId: input.userId ?? null,
      userRole: input.userRole ?? null,
      userEmail: input.userEmail ?? null,
      platform: input.platform ?? null,
      clientVersion: input.clientVersion ?? null,
      viewId: input.viewId ?? null,
      ip: input.ip ?? null,
      responseBytes,
      env: input.env,
      truncated,
      schemaVersion: 1,
      requestHeaders: toJson(reqHeaders.value),
      requestBody: toJson(reqBody.value),
      requestQuery: toJson(reqQuery.value),
      requestParams: toJson(reqParams.value),
      responseHeaders: toJson(resHeaders.value),
      responseBody: toJson(resBody.value),
    };
  }

  /**
   * 버퍼를 createMany 로 일괄 적재.
   * skipDuplicates: 동일 requestId 충돌(client echo race) 시 P2002 없이 무시.
   */
  private async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.prisma.transactionLog.createMany({
        data: batch,
        skipDuplicates: true,
      });
    } catch {
      /* 배치 저장 실패는 본 API 에 영향 없음 (재시도 안 함 — 다음 주기 진행) */
    } finally {
      this.flushing = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
