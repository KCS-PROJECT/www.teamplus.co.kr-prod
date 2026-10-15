import {
  NiceBalanceResult,
  NicePayoutCallMeta,
  NicePayoutGateway,
  NicePayoutRequestInput,
  NicePayoutRequestResult,
  NicePayoutResultRow,
  NicePayoutResultsQuery,
  NicePayoutResultsResult,
  NicePayoutSid,
  NiceSubMallRequest,
  NiceSubMallResult,
} from "./nice-payout.types";
import { classifyPayoutResCode } from "./payout-res-code.util";
import { nowKstParts } from "@/common/utils/kst-date.util";

export const FAKE_PAYOUT_REMAIN_AMT = 10_000_000;
export const FAKE_PAYOUT_FAIL_MARK = "실패테스트";
export const FAKE_PAYOUT_DELAY_MARK = "지연테스트";

/**
 * 지급 요청 재현 표식 — 금액의 끝 세 자리로 고른다(어드민에서 정산 금액을 바꿔 시험한다).
 *   997: 나이스에 접수되지 않고 응답도 없음(결과 조회에 안 나타남 → 지급 예정으로 복귀 경로)
 *   998: 접수는 됐는데 응답 유실(결과 조회로만 확정되는 경로)
 *   999: 접수 성공, 지급일 결과는 실패(잔액 부족 재현)
 */
export const FAKE_PAYOUT_LOST_SUFFIX = 997;
export const FAKE_PAYOUT_UNCONFIRMED_SUFFIX = 998;
export const FAKE_PAYOUT_FAIL_SUFFIX = 999;

interface FakePayoutEntry {
  seq: string;
  subId: string;
  settlmntDt: string;
  settlmntAmt: number;
}

/**
 * 개발용 가짜 게이트웨이 — 외부 호출 없음. 등록 상태는 프로세스 메모리에만 있어 재기동 시 초기화된다.
 * 예금주명에 표식 문자열을 넣어 실패(1003)·결과 불명(timeout) 흐름을 재현한다.
 */
export class NicePayoutFakeGateway implements NicePayoutGateway {
  readonly kind = "fake" as const;

  private readonly subMalls = new Set<string>();
  private readonly payouts: FakePayoutEntry[] = [];
  private seqCounter = 0;

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

  async requestPayout(
    req: NicePayoutRequestInput,
  ): Promise<NicePayoutRequestResult> {
    const startedAt = Date.now();
    const suffix = req.settlmntAmt % 1000;

    if (suffix === FAKE_PAYOUT_LOST_SUFFIX) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      return {
        outcome: "AMBIGUOUS",
        meta: {
          ...this.meta("0102001", null, Date.now() - startedAt),
          error: "timeout",
        },
        seq: null,
      };
    }

    if (
      req.dupChkYn === "Y" &&
      this.payouts.some(
        (p) =>
          p.subId === req.subId &&
          p.settlmntDt === req.settlmntDt &&
          p.settlmntAmt === req.settlmntAmt,
      )
    ) {
      return {
        outcome: "TERMINAL",
        meta: this.meta("0102001", "1103", Date.now() - startedAt),
        seq: null,
      };
    }

    this.seqCounter += 1;
    const seq = `FAKE${String(this.seqCounter).padStart(6, "0")}`;
    this.payouts.push({
      seq,
      subId: req.subId,
      settlmntDt: req.settlmntDt,
      settlmntAmt: req.settlmntAmt,
    });

    if (suffix === FAKE_PAYOUT_UNCONFIRMED_SUFFIX) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      return {
        outcome: "AMBIGUOUS",
        meta: {
          ...this.meta("0102001", null, Date.now() - startedAt),
          error: "timeout",
        },
        seq: null,
      };
    }

    return {
      outcome: "SUCCESS",
      meta: this.meta("0102001", "0000", Date.now() - startedAt),
      seq,
    };
  }

  /** 지급일이 KST 오늘 이전·당일이면 성공/실패로, 아직 오지 않았으면 "요청" 으로 보여준다. */
  async queryPayoutResults(
    req: NicePayoutResultsQuery,
  ): Promise<NicePayoutResultsResult> {
    const { year, month, day } = nowKstParts();
    const todayCompact = `${year}${month}${day}`;
    const rows: NicePayoutResultRow[] = this.payouts
      .filter(
        (p) =>
          p.settlmntDt === req.settlmntDt &&
          (!req.subId || p.subId === req.subId),
      )
      .map((p) => {
        const due = p.settlmntDt <= todayCompact;
        const fail = p.settlmntAmt % 1000 === FAKE_PAYOUT_FAIL_SUFFIX;
        return {
          seq: p.seq,
          subId: p.subId,
          statusNm: !due ? "요청" : fail ? "실패" : "성공",
          settlmntAmt: p.settlmntAmt,
          errReason: due && fail ? "잔액부족(가짜 게이트웨이)" : null,
        };
      });
    const succCnt = rows.filter((r) => r.statusNm === "성공").length;
    const failCnt = rows.filter((r) => r.statusNm === "실패").length;
    return {
      outcome: "SUCCESS",
      meta: this.meta("0101002", "0000", 0),
      totCnt: rows.length,
      succCnt,
      failCnt,
      remainAmt: FAKE_PAYOUT_REMAIN_AMT,
      rows,
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
