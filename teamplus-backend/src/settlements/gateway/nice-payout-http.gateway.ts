import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { buildPayoutEncKey, buildPayoutTrDtm } from "./nice-payout-crypto.util";
import {
  NiceBalanceResult,
  NicePayoutCallMeta,
  NicePayoutGateway,
  NicePayoutOutcome,
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

export const NICE_PAYOUT_DEFAULT_API_URL = "https://data.nicepay.co.kr/om/api";
export const NICE_PAYOUT_TIMEOUT_MS = 10_000;

interface CallResult {
  outcome: NicePayoutOutcome;
  meta: NicePayoutCallMeta;
  body: Record<string, unknown> | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 나이스는 숫자 필드를 숫자로도 문자열로도 보낸다 — 둘 다 받고 그 밖은 null. */
const toNumber = (raw: unknown): number | null => {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  return Number.isFinite(n) ? n : null;
};

const toText = (raw: unknown): string | null => {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
};

/** DI 는 nicePayoutGatewayProvider 팩토리로만 생성한다(시각 주입 인자 때문). */
export class NicePayoutHttpGateway implements NicePayoutGateway {
  readonly kind = "nice" as const;

  private readonly logger = new Logger(NicePayoutHttpGateway.name);
  private readonly mid: string;
  private readonly merchantKey: string;
  private readonly apiUrl: string;
  private readonly http: AxiosInstance;

  constructor(
    config: ConfigService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.mid = (config.get<string>("NICE_PAYOUT_MID") ?? "").trim();
    this.merchantKey = (
      config.get<string>("NICE_PAYOUT_MERCHANT_KEY") ?? ""
    ).trim();
    this.apiUrl =
      (config.get<string>("NICE_PAYOUT_API_URL") ?? "").trim() ||
      NICE_PAYOUT_DEFAULT_API_URL;
    this.http = axios.create({
      timeout: NICE_PAYOUT_TIMEOUT_MS,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      // 상태 코드 판정은 call() 에서 직접 한다 — 비2xx 도 AMBIGUOUS 로 돌려야 해서 예외를 받지 않는다.
      validateStatus: () => true,
    });
  }

  isConfigured(): boolean {
    return this.mid.length > 0 && this.merchantKey.length > 0;
  }

  async getBalance(): Promise<NiceBalanceResult> {
    const { outcome, meta, body } = await this.call("0101001", {});
    const remainAmt =
      outcome === "SUCCESS" && body ? toNumber(body.remainAmt) : null;
    return { outcome, meta, remainAmt };
  }

  async requestPayout(
    req: NicePayoutRequestInput,
  ): Promise<NicePayoutRequestResult> {
    const fields: Record<string, string> = {
      settlmntDt: req.settlmntDt,
      subId: req.subId,
      settlmntAmt: String(req.settlmntAmt),
      dupChkYn: req.dupChkYn,
    };
    if (req.accntDesc) fields.accntDesc = req.accntDesc;
    const { outcome, meta, body } = await this.call("0102001", fields, {
      subId: req.subId,
    });
    const seq = outcome === "SUCCESS" && body ? toText(body.seq) : null;
    // 성공 코드인데 접수번호가 없으면 취소·대조를 할 수 없다 — 요청이 반영됐는지 모르는 것으로 본다.
    if (outcome === "SUCCESS" && seq === null) {
      const m = { ...meta, error: "invalid_response" };
      this.log("warn", m, { subId: req.subId });
      return { outcome: "AMBIGUOUS", meta: m, seq: null };
    }
    return { outcome, meta, seq };
  }

  async queryPayoutResults(
    req: NicePayoutResultsQuery,
  ): Promise<NicePayoutResultsResult> {
    const fields: Record<string, string> = { settlmntDt: req.settlmntDt };
    if (req.subId) fields.subId = req.subId;
    const { outcome, meta, body } = await this.call(
      "0101002",
      fields,
      req.subId ? { subId: req.subId } : {},
    );
    if (outcome !== "SUCCESS" || !body) {
      return {
        outcome,
        meta,
        totCnt: null,
        succCnt: null,
        failCnt: null,
        remainAmt: null,
        rows: [],
      };
    }
    const rawDetail = body.detail;
    const rows: NicePayoutResultRow[] = [];
    if (Array.isArray(rawDetail)) {
      for (const item of rawDetail) {
        if (!isRecord(item)) continue;
        const subId = toText(item.subId);
        const statusNm = toText(item.statusNm);
        if (subId === null || statusNm === null) continue;
        // 계좌번호(accntNo)·사업자번호(subCoNo)는 읽지 않는다 — 기록·로그 어디에도 남기지 않기 위해서다.
        rows.push({
          seq: toText(item.seq),
          subId,
          statusNm,
          settlmntAmt: toNumber(item.settlmntAmt),
          errReason: toText(item.errReason)?.slice(0, 200) ?? null,
        });
      }
    }
    return {
      outcome,
      meta,
      totCnt: toNumber(body.totCnt),
      succCnt: toNumber(body.succCnt),
      failCnt: toNumber(body.failCnt),
      remainAmt: toNumber(body.remainAmt),
      rows,
    };
  }

  async upsertSubMall(req: NiceSubMallRequest): Promise<NiceSubMallResult> {
    const { outcome, meta } = await this.call(
      "0105001",
      {
        subId: req.subId,
        subNm: req.subNm,
        subCoNo: req.subCoNo,
        bankCd: req.bankCd,
        accntNo: req.accntNo,
        accntNm: req.accntNm,
        reqType: String(req.reqType),
      },
      { subId: req.subId },
      [req.subCoNo, req.accntNo],
    );
    return { outcome, meta };
  }

  /**
   * 공통 전문 호출. 예외를 던지지 않고 모든 실패를 outcome 으로 돌려준다.
   * @param sensitive resMsg 에 되돌아올 경우 가릴 값(계좌번호·사업자번호 등)
   */
  private async call(
    sid: NicePayoutSid,
    fields: Record<string, string>,
    logCtx: Record<string, string> = {},
    sensitive: string[] = [],
  ): Promise<CallResult> {
    const startedAt = Date.now();
    const meta = (
      partial: Partial<NicePayoutCallMeta>,
    ): NicePayoutCallMeta => ({
      sid,
      resCode: null,
      resMsg: null,
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      error: null,
      ...partial,
    });

    if (!this.isConfigured()) {
      const m = meta({ error: "not_configured" });
      this.log("warn", m, logCtx);
      return { outcome: "CONFIG", meta: m, body: null };
    }

    const trDtm = buildPayoutTrDtm(this.now());
    const payload = {
      header: { sid, trDtm, gubun: "S", resCode: "", resMsg: "" },
      body: {
        mid: this.mid,
        encKey: buildPayoutEncKey(sid, this.mid, trDtm, this.merchantKey),
        ...fields,
      },
    };

    let status: number;
    let data: unknown;
    try {
      const res = await this.http.post(this.apiUrl, payload);
      status = res.status;
      data = res.data;
    } catch (err) {
      const m = meta({ error: this.transportError(err) });
      this.log("warn", m, logCtx);
      return { outcome: "AMBIGUOUS", meta: m, body: null };
    }

    if (status < 200 || status >= 300) {
      const m = meta({ httpStatus: status, error: "invalid_response" });
      this.log("warn", m, logCtx);
      return { outcome: "AMBIGUOUS", meta: m, body: null };
    }

    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    const header = isRecord(data) ? data.header : undefined;
    const resCode =
      isRecord(header) && typeof header.resCode === "string"
        ? header.resCode
        : null;
    if (!isRecord(data) || !isRecord(header) || resCode === null) {
      const m = meta({ httpStatus: status, error: "invalid_response" });
      this.log("warn", m, logCtx);
      return { outcome: "AMBIGUOUS", meta: m, body: null };
    }

    const resMsg =
      typeof header.resMsg === "string"
        ? this.redact(header.resMsg, sensitive)
        : null;
    const outcome = classifyPayoutResCode(resCode);
    const m = meta({ httpStatus: status, resCode, resMsg });
    this.log(outcome === "SUCCESS" ? "log" : "warn", m, logCtx);
    return {
      outcome,
      meta: m,
      body: isRecord(data.body) ? data.body : null,
    };
  }

  private transportError(err: unknown): string {
    const e = err as { code?: unknown; message?: unknown };
    const code = typeof e?.code === "string" ? e.code : "";
    const msg = typeof e?.message === "string" ? e.message : "";
    if (
      code === "ECONNABORTED" ||
      code === "ETIMEDOUT" ||
      /timeout/i.test(msg)
    ) {
      return "timeout";
    }
    return "network";
  }

  private redact(text: string, sensitive: string[]): string {
    let out = text;
    for (const s of [...sensitive, this.merchantKey]) {
      if (s) out = out.split(s).join("***");
    }
    return out;
  }

  private log(
    level: "log" | "warn",
    m: NicePayoutCallMeta,
    ctx: Record<string, string>,
  ): void {
    const parts = [`sid=${m.sid}`];
    if (ctx.subId) parts.push(`subId=${ctx.subId}`);
    parts.push(`resCode=${m.resCode ?? "-"}`, `durationMs=${m.durationMs}`);
    if (m.httpStatus !== null) parts.push(`http=${m.httpStatus}`);
    if (m.error) parts.push(`error=${m.error}`);
    this.logger[level](`nice payout ${parts.join(" ")}`);
  }
}
