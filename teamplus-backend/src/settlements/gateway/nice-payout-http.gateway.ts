import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { buildPayoutEncKey, buildPayoutTrDtm } from "./nice-payout-crypto.util";
import {
  NiceBalanceResult,
  NicePayoutCallMeta,
  NicePayoutGateway,
  NicePayoutOutcome,
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
    let remainAmt: number | null = null;
    if (outcome === "SUCCESS" && body) {
      const raw = body.remainAmt;
      const n =
        typeof raw === "number"
          ? raw
          : typeof raw === "string" && raw.trim() !== ""
            ? Number(raw)
            : NaN;
      remainAmt = Number.isFinite(n) ? n : null;
    }
    return { outcome, meta, remainAmt };
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
