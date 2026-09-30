import {
  NiceBalanceResult,
  NicePayoutCallMeta,
  NicePayoutGateway,
  NicePayoutSid,
  NiceSubMallRequest,
  NiceSubMallResult,
} from "./nice-payout.types";
import { classifyPayoutResCode } from "./payout-res-code.util";

export const FAKE_PAYOUT_REMAIN_AMT = 10_000_000;
export const FAKE_PAYOUT_FAIL_MARK = "실패테스트";
export const FAKE_PAYOUT_DELAY_MARK = "지연테스트";

/**
 * 개발용 가짜 게이트웨이 — 외부 호출 없음. 등록 상태는 프로세스 메모리에만 있어 재기동 시 초기화된다.
 * 예금주명에 표식 문자열을 넣어 실패(1003)·결과 불명(timeout) 흐름을 재현한다.
 */
export class NicePayoutFakeGateway implements NicePayoutGateway {
  readonly kind = "fake" as const;

  private readonly subMalls = new Set<string>();

  constructor(private readonly delayMs = 1500) {}

  isConfigured(): boolean {
    return true;
  }

  async getBalance(): Promise<NiceBalanceResult> {
    return {
      outcome: "SUCCESS",
      meta: this.meta("0101001", "0000", 0),
      remainAmt: FAKE_PAYOUT_REMAIN_AMT,
    };
  }

  async upsertSubMall(req: NiceSubMallRequest): Promise<NiceSubMallResult> {
    const startedAt = Date.now();

    if (req.accntNm.includes(FAKE_PAYOUT_DELAY_MARK)) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      return {
        outcome: "AMBIGUOUS",
        meta: {
          ...this.meta("0105001", null, Date.now() - startedAt),
          error: "timeout",
        },
      };
    }

    let resCode = "0000";
    if (req.reqType === 0 && this.subMalls.has(req.subId)) resCode = "1106";
    else if (req.reqType === 1 && !this.subMalls.has(req.subId))
      resCode = "1105";
    else if (req.accntNm.includes(FAKE_PAYOUT_FAIL_MARK)) resCode = "1003";

    if (resCode === "0000") this.subMalls.add(req.subId);

    return {
      outcome: classifyPayoutResCode(resCode),
      meta: this.meta("0105001", resCode, Date.now() - startedAt),
    };
  }

  private meta(
    sid: NicePayoutSid,
    resCode: string | null,
    durationMs: number,
  ): NicePayoutCallMeta {
    return {
      sid,
      resCode,
      resMsg: resCode === "0000" ? "" : null,
      httpStatus: resCode === null ? null : 200,
      durationMs,
      error: null,
    };
  }
}
