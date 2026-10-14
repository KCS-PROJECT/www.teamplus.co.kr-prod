import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  NICE_PAYOUT_GATEWAY,
  type NiceBalanceResult,
  type NicePayoutCallMeta,
  type NicePayoutGateway,
  type NicePayoutOutcome,
  type NicePayoutRequestInput,
  type NicePayoutRequestResult,
  type NicePayoutResultsQuery,
  type NicePayoutResultsResult,
  type NiceSubMallRequest,
  type NiceSubMallResult,
} from "./gateway/nice-payout.types";

interface CallContext {
  teamId?: string | null;
  settlementId?: string | null;
  requestedBy?: string | null;
}

/**
 * 나이스 지급대행 호출의 단일 통로 — 모든 호출을 nice_payout_api_logs 에 남긴다.
 * 사용 단계(off/readonly/live) 판단은 호출하는 쪽 책임이다. 이 서비스는 요청 내용을 검사하지 않는다.
 */
@Injectable()
export class NicePayoutApiService {
  private readonly logger = new Logger(NicePayoutApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NICE_PAYOUT_GATEWAY) private readonly gateway: NicePayoutGateway,
  ) {}

  async getBalance(ctx: CallContext): Promise<NiceBalanceResult> {
    const result = await this.gateway.getBalance();
    await this.record(result.meta, result.outcome, ctx);
    return result;
  }

  async upsertSubMall(
    req: NiceSubMallRequest,
    ctx: CallContext,
  ): Promise<NiceSubMallResult> {
    const result = await this.gateway.upsertSubMall(req);
    await this.record(result.meta, result.outcome, ctx, {
      subId: req.subId,
      reqType: req.reqType,
    });
    return result;
  }

  /** 지급 요청(0102001) — 돈이 나가는 호출. 호출 전제(live·운영자 요청·정산당 1건)는 호출하는 쪽이 보장한다. */
  async requestPayout(
    req: NicePayoutRequestInput,
    ctx: CallContext,
  ): Promise<NicePayoutRequestResult> {
    const result = await this.gateway.requestPayout(req);
    await this.record(result.meta, result.outcome, ctx, { subId: req.subId });
    return result;
  }

  /** 지급 결과 조회(0101002) — 지급일 단위. */
  async queryPayoutResults(
    req: NicePayoutResultsQuery,
    ctx: CallContext,
  ): Promise<NicePayoutResultsResult> {
    const result = await this.gateway.queryPayoutResults(req);
    await this.record(result.meta, result.outcome, ctx, { subId: req.subId });
    return result;
  }

  /** 기록 실패가 호출 결과 반영을 막으면 안 된다 — 나이스 쪽은 이미 처리됐을 수 있다. */
  private async record(
    meta: NicePayoutCallMeta,
    outcome: NicePayoutOutcome,
    ctx: CallContext,
    extra: { subId?: string; reqType?: number } = {},
  ) {
    try {
      await this.prisma.nicePayoutApiLog.create({
        data: {
          sid: meta.sid,
          teamId: ctx.teamId ?? null,
          settlementId: ctx.settlementId ?? null,
          subId: extra.subId ?? null,
          reqType: extra.reqType ?? null,
          resCode: meta.resCode?.slice(0, 10) ?? null,
          resMsg: meta.resMsg?.slice(0, 200) ?? null,
          outcome,
          httpStatus: meta.httpStatus,
          durationMs: Math.max(0, Math.round(meta.durationMs)),
          error: meta.error?.slice(0, 50) ?? null,
          requestedBy: ctx.requestedBy ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `지급대행 호출 기록 실패: sid=${meta.sid}, teamId=${ctx.teamId ?? "-"}, resCode=${meta.resCode ?? "-"}: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }
}
