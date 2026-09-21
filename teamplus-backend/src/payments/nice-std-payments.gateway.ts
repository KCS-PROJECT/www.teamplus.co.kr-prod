import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import axios, { AxiosError, AxiosInstance } from "axios";
import * as iconv from "iconv-lite";
import {
  NiceApproveAmbiguousError,
  NiceCancelAmbiguousError,
} from "./nice-payments.gateway";
import { kstCompactToInstant } from "../common/utils/kst-date.util";

// ──────────────────────────────────────────────────────────────────────────
// 고정 엔드포인트 / 결과 코드
//   규격 SoT: docs/Reference/NICEPAY_STD_PAYMENT_API.md
// ──────────────────────────────────────────────────────────────────────────

/** 취소·부분취소 (고정 URL). */
export const NICE_STD_CANCEL_URL =
  "https://pg-api.nicepay.co.kr/webapi/cancel_process.jsp";

/** 거래조회 (고정 URL). 경로 철자 `inquery` 는 나이스 원문 그대로다. */
export const NICE_STD_INQUIRY_URL =
  "https://webapi.nicepay.co.kr/webapi/inquery/trans_status.jsp";

/**
 * 매출전표(영수증) 조회 (고정 URL). 승인 응답에는 영수증 URL 필드가 없어 거래번호로 조합한다.
 *  `type=0` 일반 영수증(카드·계좌이체 공통) · `innerWin=Y` 팝업 표시.
 *  나이스가 먼저 본인확인(구매자명+결제금액 / 이메일 / 카드번호 중 하나)을 거친 뒤 영수증을 보여준다.
 *  가상계좌는 입금 완료 후에만 조회된다.
 */
export const NICE_STD_RECEIPT_URL =
  "https://npg.nicepay.co.kr/issue/IssueLoader.do";

export function buildNiceStdReceiptUrl(tid: string): string {
  return `${NICE_STD_RECEIPT_URL}?type=0&innerWin=Y&TID=${encodeURIComponent(tid)}`;
}

/**
 * 승인·망취소 URL 로 허용하는 호스트.
 * 이 두 URL 은 인증 응답 본문에서 오므로, 허용 목록이 없으면 위조된 인증 응답이
 * 승인 요청(= MerchantKey 로 서명된 전문)을 임의 서버로 보내게 된다.
 */
export const NICE_STD_APPROVE_HOSTS: readonly string[] = [
  "dc1-api.nicepay.co.kr",
  "dc2-api.nicepay.co.kr",
];

/** 결제통보(노티) 발신 IP — 통보에는 서명 필드가 없어 IP 가 1차 신뢰 근거다. */
export const NICE_STD_NOTIFY_IPS: readonly string[] = [
  "121.133.126.10",
  "121.133.126.11",
  "211.33.136.39",
];

export const NICE_STD_AUTH_OK = "0000";
export const NICE_STD_INQUIRY_OK = "0000";
export const NICE_STD_APPROVE_CARD_OK = "3001";
export const NICE_STD_APPROVE_BANK_OK = "4000";
export const NICE_STD_NETCANCEL_OK = "2001";

/**
 * 이미 승인된 거래 — 재승인이 아니라 캡처 완료로 취급한다.
 * `1673`(기취소 거래 재승인 불가)은 여기 넣지 않는다. 이미 취소된 TID 라 대금이 들어오지 않으며,
 * 캡처로 취급하면 미수금 거래에 후처리가 실행된다.
 */
export const NICE_STD_APPROVE_ALREADY_CODES: readonly string[] = [
  "1682", // 동일한 승인 성공건 존재
];

/** 기취소 거래 재승인 불가 — 결제창을 다시 여는 것 말고는 해소 수단이 없다. */
export const NICE_STD_APPROVE_REVOKED_CODE = "1673";

export const NICE_STD_CANCEL_OK_CODES: readonly string[] = [
  "2001", // 취소 성공
  "2211", // 환불 성공
];

/**
 * 취소 결과 미확정 — 자동 재호출 금지, 격리 대상.
 * `2013`·`2015` 도 성공이 아니다. 응답이 어느 금액이 언제 취소됐는지 말해주지 않아
 * 성공으로 확정하면 부분취소 잔액·환불 시점이 근거 없이 기록된다.
 */
export const NICE_STD_CANCEL_UNCONFIRMED_CODES: readonly string[] = [
  "2002", // 취소 진행중
  "2212", // 환불 진행중
  "2056", // 취소 시 카드사 타임아웃(재취소 요망)
  "2013", // 취소 완료 거래
  "2015", // 취소 실패(기취소 성공)
];

/** EUC-KR byte 한도 (규격 §1.3). */
const MAX_BYTES = {
  MOID: 64,
  GOODS_NAME: 40,
  BUYER_NAME: 30,
  BUYER_TEL: 20,
  CANCEL_MSG: 100,
} as const;

// ──────────────────────────────────────────────────────────────────────────
// 타입
// ──────────────────────────────────────────────────────────────────────────

/** 인증 응답 — ReturnURL 로 form POST 된다 (규격 §2.3). 값은 전부 문자열. */
export interface NiceStdAuthResult {
  AuthResultCode?: string;
  AuthResultMsg?: string;
  AuthToken?: string;
  /** 승인 요청의 `TID` 로 쓰는 거래 ID. */
  TxTid?: string;
  PayMethod?: string;
  MID?: string;
  Moid?: string;
  Amt?: string;
  Signature?: string;
  NextAppURL?: string;
  NetCancelURL?: string;
  ReqReserved?: string;
  [key: string]: string | undefined;
}

export type NiceStdAuthVerifyFailure =
  | "auth_failed"
  | "invalid_signature"
  | "mid_mismatch"
  | "amount_mismatch"
  | "no_tid"
  | "bad_next_url";

export type NiceStdAuthVerifyResult =
  | { ok: true }
  | { ok: false; reason: NiceStdAuthVerifyFailure };

export interface NiceStdPayRequest {
  /** 결제창 form 의 `action` — 인증 응답을 받을 우리 서버 절대 URL. */
  actionUrl: string;
  fields: Record<string, string>;
}

export interface NiceStdApproveResult {
  /** `already_approved` 는 재승인 없이 후처리만 하라는 뜻이다. */
  status: "approved" | "already_approved";
  resultCode: string;
  resultMsg: string;
  tid: string;
  amount: number;
  authCode?: string;
  /** 원문 `YYMMDDHHMISS`(KST). */
  authDate?: string;
  payMethod?: string;
  approvedAt?: Date;
  raw: Record<string, string>;
}

export interface NiceStdCancelResult {
  status: "cancelled";
  resultCode: string;
  resultMsg: string;
  tid: string;
  cancelAmount: number;
  /** 부분취소 후 잔액. 응답에 없으면 0. */
  remainAmount: number;
  /** `YYYYMMDD` */
  cancelDate?: string;
  /** `HHmmss` */
  cancelTime?: string;
  cancelNum?: string;
  raw: Record<string, string>;
}

export interface NiceStdTransactionStatus {
  status: "approved" | "cancelled" | "none";
  authCode?: string;
  /** 원문 `YYMMDDHHMISS`(KST). */
  authDate?: string;
  raw: Record<string, string>;
}

/**
 * 구모듈 승인 결과 미확정.
 *
 * 신모듈과 달리 망취소가 주문번호가 아니라 **인증 응답값**(`NetCancelURL`·`TID`·`AuthToken`)
 * 으로 이뤄지므로, 호출부가 망취소를 호출할 수 있도록 그 세 값을 함께 싣는다.
 */
export class NiceStdApproveAmbiguousError extends NiceApproveAmbiguousError {
  readonly tid: string;
  readonly authToken: string;
  readonly netCancelUrl: string;

  constructor(
    message: string,
    params: {
      orderNumber: string;
      tid: string;
      authToken: string;
      netCancelUrl: string;
    },
  ) {
    super(message, params.orderNumber);
    this.name = "NiceStdApproveAmbiguousError";
    this.tid = params.tid;
    this.authToken = params.authToken;
    this.netCancelUrl = params.netCancelUrl;
  }
}

/** 응답 본문을 해석하지 못한 경우 — transport 모호성과 동일 취급한다. */
class NiceStdResponseParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NiceStdResponseParseError";
  }
}

// ──────────────────────────────────────────────────────────────────────────
// EUC-KR form 인코딩
//   구모듈은 요청 본문 인코딩이 EUC-KR 고정이다(규격 §1.2). UTF-8 로 보내면
//   한글 필드가 깨진 채 승인·취소가 성사돼 되돌릴 수 없다.
// ──────────────────────────────────────────────────────────────────────────

function eucKrByteLength(value: string): number {
  return iconv.encode(value, "euc-kr").length;
}

/** EUC-KR byte 한도로 절단 — 코드포인트 단위로 끊어 한글이 반 바이트로 잘리지 않게 한다. */
function truncateEucKr(value: string, maxBytes: number): string {
  let used = 0;
  let out = "";
  for (const ch of value) {
    const size = eucKrByteLength(ch);
    if (used + size > maxBytes) break;
    used += size;
    out += ch;
  }
  return out;
}

function percentEncodeEucKr(value: string): string {
  const bytes = iconv.encode(value, "euc-kr");
  let out = "";
  for (const byte of bytes) {
    const isUnreserved =
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      byte === 0x2d || // -
      byte === 0x2e || // .
      byte === 0x5f; // _
    if (isUnreserved) {
      out += String.fromCharCode(byte);
    } else if (byte === 0x20) {
      out += "+";
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

function buildEucKrForm(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(
      ([key, value]) =>
        `${percentEncodeEucKr(key)}=${percentEncodeEucKr(value ?? "")}`,
    )
    .join("&");
}

function percentDecodeToBytes(token: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === "+") {
      bytes.push(0x20);
      continue;
    }
    if (ch === "%" && i + 2 < token.length) {
      const hex = token.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(token.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}

/** 응답 금액은 12자리 좌측 0 채움 문자열(`000000001004`) 로 온다(규격 §3.2). */
function toAmountNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 응답 필드는 사전 고지 없이 추가될 수 있으므로(규격 §1.2) 모르는 키도 그대로 담는다. */
function normalizeResponse(data: unknown): Record<string, string> {
  let source: unknown = data;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      throw new NiceStdResponseParseError("나이스 응답을 해석하지 못했습니다.");
    }
  }
  if (!source || typeof source !== "object") {
    throw new NiceStdResponseParseError("나이스 응답이 비어 있습니다.");
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    if (value == null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  if (!out.ResultCode) {
    throw new NiceStdResponseParseError(
      "나이스 응답에 ResultCode 가 없습니다.",
    );
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────

/**
 * 나이스페이먼츠 **구모듈(인증결제·표준결제 웹표준 v3)** 게이트웨이.
 *
 * 신모듈(`NicePaymentsGateway`)과 역할·에러 타입 규약은 같고 프로토콜만 다르다.
 * - 자격: Client/Secret 키가 아니라 **MID + MerchantKey**. 인증 헤더가 없고 매 요청
 *   본문의 `SignData` 가 인증을 겸한다.
 * - 승인·망취소 URL 은 인증 응답이 실어 준다(`dc1`/`dc2` 중 하나).
 * - 요청 본문 EUC-KR form, 응답은 `CharSet=utf-8` + `EdiType=JSON`.
 * - 성공 코드가 단계별로 다르다(인증 0000 · 승인 3001/4000 · 취소 2001/2211).
 *
 * 보안:
 * - `MerchantKey` 는 서버 전용 비밀 — 로그·응답 어디에도 남기지 않는다.
 * - 카드 데이터는 서버에 저장하지 않는다. 결제창이 카드 입력을 전담한다.
 * - 승인 금액 검증(DB 금액 대조)은 호출부 책임이다. 이 클래스는 인증 응답 금액만 본다.
 *
 * 규격 SoT: `docs/Reference/NICEPAY_STD_PAYMENT_API.md`
 */
@Injectable()
export class NiceStdPaymentsGateway {
  private readonly logger = new Logger(NiceStdPaymentsGateway.name);
  private readonly httpClient: AxiosInstance;
  private readonly mid: string;
  private readonly merchantKey: string;
  private readonly returnUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.mid = this.configService.get<string>("NICE_STD_MID", "");
    this.merchantKey = this.configService.get<string>(
      "NICE_STD_MERCHANT_KEY",
      "",
    );
    // 클라이언트가 보낸 값을 쓰지 않는다 — `SignData` 가 ReturnURL 을 덮지 않아 탈취 경로가 된다.
    this.returnUrl = this.configService.get<string>("NICE_STD_RETURN_URL", "");

    if (!this.mid || !this.merchantKey || !this.returnUrl) {
      this.logger.warn(
        "NICE_STD_MID · NICE_STD_MERCHANT_KEY · NICE_STD_RETURN_URL 미설정 — 나이스 구모듈 결제 비활성.",
      );
    }

    this.httpClient = axios.create({
      // 개발자센터 권고 Read timeout 30초.
      timeout: 30000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=euc-kr",
      },
    });

    this.logger.log(
      `나이스 구모듈 게이트웨이 초기화 (mid=${this.maskMid(this.mid)})`,
    );
  }

  isConfigured(): boolean {
    return Boolean(this.mid && this.merchantKey && this.returnUrl);
  }

  getMid(): string {
    return this.mid;
  }

  getReturnUrl(): string {
    return this.returnUrl;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 결제창 요청
  // ────────────────────────────────────────────────────────────────────────

  /**
   * 결제창(`goPay`) hidden form 필드 생성.
   * 금액·MID·SignData 는 전부 서버가 만든다 — 프론트는 받은 값을 그대로 제출만 한다.
   */
  buildPayRequest(params: {
    orderNumber: string;
    amount: number;
    goodsName: string;
    payMethod: "CARD" | "BANK";
    buyerName?: string;
    buyerTel?: string;
    /** 앱 WebView 전용 — 제휴사 앱 인증 후 복귀할 가맹점 앱 스킴. */
    wapUrl?: string;
    /** 앱 WebView 전용 — ISP 취소 시 복귀 스킴. */
    ispCancelUrl?: string;
  }): NiceStdPayRequest {
    this.assertConfigured();
    const { orderNumber, amount, goodsName, payMethod } = params;

    if (!orderNumber) {
      throw new BadRequestException("주문번호는 필수입니다.");
    }
    if (eucKrByteLength(orderNumber) > MAX_BYTES.MOID) {
      throw new BadRequestException(
        `주문번호가 ${MAX_BYTES.MOID}바이트를 초과합니다.`,
      );
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException("결제 금액이 올바르지 않습니다.");
    }
    if (payMethod !== "CARD" && payMethod !== "BANK") {
      throw new BadRequestException("지원하지 않는 결제수단입니다.");
    }

    const ediDate = this.ediDate();
    const amt = String(amount);
    const fields: Record<string, string> = {
      GoodsName: truncateEucKr(goodsName ?? "", MAX_BYTES.GOODS_NAME),
      Amt: amt,
      MID: this.mid,
      EdiDate: ediDate,
      Moid: orderNumber,
      SignData: this.sign(ediDate, this.mid, amt),
      PayMethod: payMethod,
      ReturnURL: this.returnUrl,
      // 인증 응답을 UTF-8 로 받기 위한 지정(미지정 시 EUC-KR).
      CharSet: "utf-8",
    };

    if (params.buyerName) {
      fields.BuyerName = truncateEucKr(params.buyerName, MAX_BYTES.BUYER_NAME);
    }
    if (params.buyerTel) {
      const digits = params.buyerTel.replace(/\D/g, "");
      if (digits) fields.BuyerTel = digits.slice(0, MAX_BYTES.BUYER_TEL);
    }
    if (params.wapUrl) fields.WapUrl = params.wapUrl;
    if (params.ispCancelUrl) fields.IspCancelUrl = params.ispCancelUrl;

    return { actionUrl: this.returnUrl, fields };
  }

  // ────────────────────────────────────────────────────────────────────────
  // 인증 응답 검증
  // ────────────────────────────────────────────────────────────────────────

  /**
   * ReturnURL 로 POST 된 인증 응답 검증.
   * 실패 사유는 규격이 요구하는 검증 순서대로 첫 항목만 돌려준다.
   */
  verifyAuthResult(
    body: NiceStdAuthResult,
    expectedAmount: number,
  ): NiceStdAuthVerifyResult {
    if (!this.isConfigured()) return { ok: false, reason: "auth_failed" };
    if (!body || body.AuthResultCode !== NICE_STD_AUTH_OK) {
      return { ok: false, reason: "auth_failed" };
    }
    // MID 는 응답값이 아니라 설정값과 대조한다 — 응답 MID 를 믿으면 서명 재료까지 함께 위조된다.
    if (body.MID !== this.mid) {
      this.logger.error(
        `[NICESTD_AUTH] MID 불일치 — 응답=${this.maskMid(body.MID)} 설정=${this.maskMid(this.mid)}`,
      );
      return { ok: false, reason: "mid_mismatch" };
    }
    const amt = body.Amt ?? "";
    if (!amt || Number(amt) !== expectedAmount) {
      this.logger.error(
        `[NICESTD_AUTH] 금액 불일치 — 응답=${amt} 기대=${expectedAmount}`,
      );
      return { ok: false, reason: "amount_mismatch" };
    }
    const expectedSignature = this.sign(body.AuthToken ?? "", this.mid, amt);
    if (!this.safeEqualHex(expectedSignature, body.Signature ?? "")) {
      this.logger.error("[NICESTD_AUTH] 인증 응답 서명 불일치");
      return { ok: false, reason: "invalid_signature" };
    }
    if (!body.TxTid) {
      return { ok: false, reason: "no_tid" };
    }
    if (
      !this.isAllowedApproveUrl(body.NextAppURL) ||
      !this.isAllowedApproveUrl(body.NetCancelURL)
    ) {
      this.logger.error(
        `[NICESTD_AUTH] 승인/망취소 URL 호스트 비허용 — next=${body.NextAppURL ?? "none"} netCancel=${body.NetCancelURL ?? "none"}`,
      );
      return { ok: false, reason: "bad_next_url" };
    }
    return { ok: true };
  }

  // ────────────────────────────────────────────────────────────────────────
  // 승인 / 망취소
  // ────────────────────────────────────────────────────────────────────────

  /**
   * 승인 — `POST {NextAppURL}`. 이 호출이 성사돼야 결제가 발생한다.
   *
   * 결과가 모호하면(타임아웃·연결 끊김·5xx·응답 파싱 불가) `NiceStdApproveAmbiguousError`
   * 를 던진다. 호출부는 반드시 `netCancel` 로 해소해야 한다.
   */
  async approve(params: {
    nextAppUrl: string;
    netCancelUrl: string;
    tid: string;
    authToken: string;
    amount: number;
    orderNumber: string;
  }): Promise<NiceStdApproveResult> {
    this.assertConfigured();
    const { nextAppUrl, netCancelUrl, tid, authToken, amount, orderNumber } =
      params;
    if (!nextAppUrl || !netCancelUrl || !tid || !authToken || !orderNumber) {
      throw new BadRequestException(
        "승인 요청에 필요한 인증 응답값이 누락되었습니다.",
      );
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException("승인 금액이 올바르지 않습니다.");
    }
    this.assertApproveUrl(nextAppUrl);
    this.assertApproveUrl(netCancelUrl);

    const ediDate = this.ediDate();
    const amt = String(amount);
    let data: Record<string, string>;
    try {
      data = await this.postForm(nextAppUrl, {
        TID: tid,
        AuthToken: authToken,
        MID: this.mid,
        Amt: amt,
        EdiDate: ediDate,
        SignData: this.sign(authToken, this.mid, amt, ediDate),
        CharSet: "utf-8",
        EdiType: "JSON",
      });
    } catch (err) {
      if (this.isAmbiguousTransport(err)) {
        const ax = err as AxiosError;
        this.logger.error(
          `[NICESTD_UNCONFIRMED] 승인 결과 미확정: orderNumber=${orderNumber} tid=${this.maskTid(tid)} code=${ax.code ?? "none"} status=${ax.response?.status ?? "none"} — 망취소 필요`,
        );
        throw new NiceStdApproveAmbiguousError(
          "나이스 승인 결과가 확인되지 않았습니다(응답 유실/타임아웃).",
          { orderNumber, tid, authToken, netCancelUrl },
        );
      }
      const ax = err as AxiosError;
      this.logger.error(
        `[NICESTD] 승인 요청 실패: orderNumber=${orderNumber} ${ax.message ?? "unknown"}`,
      );
      throw new BadRequestException("나이스 결제 승인에 실패했습니다.");
    }

    const resultCode = data.ResultCode;
    const resultMsg = data.ResultMsg ?? "";
    const isSuccess =
      resultCode === NICE_STD_APPROVE_CARD_OK ||
      resultCode === NICE_STD_APPROVE_BANK_OK;

    if (!isSuccess && !NICE_STD_APPROVE_ALREADY_CODES.includes(resultCode)) {
      this.logger.error(
        `[NICESTD] 승인 거절: orderNumber=${orderNumber} code=${resultCode} msg=${resultMsg}`,
      );
      const base = resultMsg || "나이스 결제 승인에 실패했습니다.";
      throw new BadRequestException(
        resultCode === NICE_STD_APPROVE_REVOKED_CODE
          ? `${base} 결제를 다시 시도해주세요. (${resultCode})`
          : `${base} (${resultCode})`,
      );
    }

    const responseTid = data.TID || tid;
    if (isSuccess) {
      const verified = this.verifyAmountSignature(
        responseTid,
        data.Amt ?? "",
        data.Signature,
        "승인",
      );
      if (!verified) {
        // 승인은 성사됐는데 응답을 신뢰할 수 없다 → 망취소로 되돌리도록 모호 에러로 올린다.
        this.logger.error(
          `[NICESTD_UNCONFIRMED] 승인 응답 서명 불일치: orderNumber=${orderNumber} tid=${this.maskTid(responseTid)}`,
        );
        // 검증에 실패한 응답 본문은 어떤 필드도 신뢰하지 않는다 — 망취소 대상 TID 는
        //   인증 단계에서 서명 검증을 통과한 입력 tid(TxTid) 를 쓴다.
        throw new NiceStdApproveAmbiguousError(
          "나이스 승인 응답의 위변조 검증에 실패했습니다.",
          { orderNumber, tid, authToken, netCancelUrl },
        );
      }
    }

    const authDate = data.AuthDate;
    const result: NiceStdApproveResult = {
      status: isSuccess ? "approved" : "already_approved",
      resultCode,
      resultMsg,
      tid: responseTid,
      // 이미 승인된 거래(1682)는 응답에 금액이 없을 수 있어 요청 금액으로 갈음한다.
      //   요청 금액은 호출부가 인증 단계에서 DB 금액과 대조해 통과시킨 값이라 안전하다.
      amount: toAmountNumber(data.Amt) || amount,
      authCode: data.AuthCode,
      authDate,
      payMethod: data.PayMethod,
      approvedAt: authDate ? this.parseAuthDate(authDate) : undefined,
      raw: data,
    };

    this.logger.log(
      `[NICESTD] 승인 ${result.status}: orderNumber=${orderNumber} tid=${this.maskTid(result.tid)} code=${resultCode} amount=${result.amount}`,
    );
    return result;
  }

  /**
   * 망취소 — `POST {NetCancelURL}` + `NetCancel=1`.
   * 실패를 삼키면 승인 여부 불명 거래가 그대로 남으므로 반드시 예외로 올린다.
   * 사용자 요청 안에서 부르는 경로는 `timeoutMs` 로 기본 30초보다 짧게 끊을 수 있다.
   */
  async netCancel(params: {
    netCancelUrl: string;
    tid: string;
    authToken: string;
    amount: number;
    orderNumber: string;
    timeoutMs?: number;
  }): Promise<void> {
    this.assertConfigured();
    const { netCancelUrl, tid, authToken, amount, orderNumber, timeoutMs } =
      params;
    if (!netCancelUrl || !tid || !authToken) {
      throw new BadRequestException("망취소 요청값이 누락되었습니다.");
    }
    this.assertApproveUrl(netCancelUrl);

    const ediDate = this.ediDate();
    const amt = String(amount);
    let data: Record<string, string>;
    try {
      data = await this.postForm(
        netCancelUrl,
        {
          TID: tid,
          AuthToken: authToken,
          MID: this.mid,
          Amt: amt,
          EdiDate: ediDate,
          NetCancel: "1",
          SignData: this.sign(authToken, this.mid, amt, ediDate),
          CharSet: "utf-8",
          EdiType: "JSON",
        },
        timeoutMs,
      );
    } catch (err) {
      const ax = err as AxiosError;
      this.logger.error(
        `[NICESTD_NETCANCEL_FAILED] orderNumber=${orderNumber} tid=${this.maskTid(tid)} code=${ax.code ?? "none"} status=${ax.response?.status ?? "none"}`,
      );
      throw new BadRequestException("나이스 망취소에 실패했습니다.");
    }

    if (data.ResultCode !== NICE_STD_NETCANCEL_OK) {
      this.logger.error(
        `[NICESTD_NETCANCEL_FAILED] orderNumber=${orderNumber} code=${data.ResultCode} msg=${data.ResultMsg ?? ""}`,
      );
      throw new BadRequestException(
        `${data.ResultMsg || "나이스 망취소에 실패했습니다."} (${data.ResultCode})`,
      );
    }
    this.logger.log(
      `[NICESTD] 망취소 성공: orderNumber=${orderNumber} tid=${this.maskTid(tid)}`,
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // 취소
  // ────────────────────────────────────────────────────────────────────────

  /**
   * 취소·부분취소 — 고정 URL `cancel_process.jsp`.
   * `cancelMoid` 는 취소 요청마다 고유해야 하며 취소통보의 `CancelMOID` 로 되돌아온다.
   */
  async cancel(params: {
    tid: string;
    cancelMoid: string;
    amount: number;
    reason: string;
    partial: boolean;
  }): Promise<NiceStdCancelResult> {
    this.assertConfigured();
    const { tid, cancelMoid, amount, reason, partial } = params;
    if (!tid || !cancelMoid || !reason) {
      throw new BadRequestException("tid · cancelMoid · reason 은 필수입니다.");
    }
    if (eucKrByteLength(cancelMoid) > MAX_BYTES.MOID) {
      throw new BadRequestException(
        `취소 주문번호가 ${MAX_BYTES.MOID}바이트를 초과합니다.`,
      );
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException("취소 금액이 올바르지 않습니다.");
    }

    const ediDate = this.ediDate();
    const cancelAmt = String(amount);
    let data: Record<string, string>;
    try {
      data = await this.postForm(NICE_STD_CANCEL_URL, {
        TID: tid,
        MID: this.mid,
        Moid: cancelMoid,
        CancelAmt: cancelAmt,
        CancelMsg: truncateEucKr(reason, MAX_BYTES.CANCEL_MSG),
        PartialCancelCode: partial ? "1" : "0",
        EdiDate: ediDate,
        // 취소 서명만 TID 가 빠지고 CancelAmt 가 들어간다 — 승인 규칙을 공유하면 A101 이 난다.
        SignData: this.sign(this.mid, cancelAmt, ediDate),
        CharSet: "utf-8",
        EdiType: "JSON",
      });
    } catch (err) {
      if (this.isAmbiguousTransport(err)) {
        const ax = err as AxiosError;
        this.logger.error(
          `[NICESTD_UNCONFIRMED] 취소 결과 미확정: tid=${this.maskTid(tid)} moid=${cancelMoid} code=${ax.code ?? "none"} status=${ax.response?.status ?? "none"}`,
        );
        throw new NiceCancelAmbiguousError(
          "나이스 취소 결과가 확인되지 않았습니다(응답 유실/타임아웃).",
        );
      }
      const ax = err as AxiosError;
      this.logger.error(
        `[NICESTD] 취소 요청 실패: tid=${this.maskTid(tid)} ${ax.message ?? "unknown"}`,
      );
      throw new BadRequestException("나이스 결제 취소에 실패했습니다.");
    }

    const resultCode = data.ResultCode;
    const resultMsg = data.ResultMsg ?? "";

    if (NICE_STD_CANCEL_UNCONFIRMED_CODES.includes(resultCode)) {
      // 자동 재호출 금지 — 운영자가 가맹점관리자에서 취소 내역을 확인한 뒤 해소한다.
      this.logger.error(
        `[NICESTD_UNCONFIRMED] 취소 미확정 코드: tid=${this.maskTid(tid)} code=${resultCode} msg=${resultMsg}`,
      );
      throw new NiceCancelAmbiguousError(
        `나이스 취소 결과가 확정되지 않았습니다 — 가맹점관리자에서 취소 내역 확인이 필요합니다. (${resultCode})`,
      );
    }

    if (!NICE_STD_CANCEL_OK_CODES.includes(resultCode)) {
      this.logger.error(
        `[NICESTD] 취소 거절: tid=${this.maskTid(tid)} code=${resultCode} msg=${resultMsg}`,
      );
      throw new BadRequestException(
        `${resultMsg || "나이스 결제 취소에 실패했습니다."} (${resultCode})`,
      );
    }

    const responseTid = data.TID || tid;
    const verified = this.verifyAmountSignature(
      responseTid,
      data.CancelAmt ?? "",
      data.Signature,
      "취소",
    );
    if (!verified) {
      this.logger.error(
        `[NICESTD] 취소 응답 서명 불일치: tid=${this.maskTid(responseTid)}`,
      );
      throw new BadRequestException(
        "나이스 취소 응답의 위변조 검증에 실패했습니다.",
      );
    }

    const result: NiceStdCancelResult = {
      status: "cancelled",
      resultCode,
      resultMsg,
      tid: responseTid,
      cancelAmount: toAmountNumber(data.CancelAmt) || amount,
      remainAmount: toAmountNumber(data.RemainAmt),
      cancelDate: data.CancelDate,
      cancelTime: data.CancelTime,
      cancelNum: data.CancelNum,
      raw: data,
    };

    this.logger.log(
      `[NICESTD] 취소 ${result.status}: tid=${this.maskTid(result.tid)} code=${resultCode} cancelAmt=${result.cancelAmount} remain=${result.remainAmount}`,
    );
    return result;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 거래조회
  // ────────────────────────────────────────────────────────────────────────

  /**
   * 거래조회 — `Status` 0 승인 · 1 취소 · 9 거래 없음. 취소 금액은 주지 않는다.
   * 사용자 요청 안에서 부르는 경로는 `timeoutMs` 로 기본 30초보다 짧게 끊을 수 있다.
   */
  async getTransactionStatus(
    tid: string,
    options?: { timeoutMs?: number },
  ): Promise<NiceStdTransactionStatus> {
    this.assertConfigured();
    if (!tid) throw new BadRequestException("tid 는 필수입니다.");

    const ediDate = this.ediDate();
    const data = await this.postForm(
      NICE_STD_INQUIRY_URL,
      {
        TID: tid,
        MID: this.mid,
        EdiDate: ediDate,
        SignData: this.sign(tid, this.mid, ediDate),
        CharSet: "utf-8",
        EdiType: "JSON",
      },
      options?.timeoutMs,
    );

    if (data.ResultCode !== NICE_STD_INQUIRY_OK) {
      throw new BadRequestException(
        `${data.ResultMsg || "나이스 거래조회에 실패했습니다."} (${data.ResultCode})`,
      );
    }

    const statusMap: Record<string, NiceStdTransactionStatus["status"]> = {
      "0": "approved",
      "1": "cancelled",
      "9": "none",
    };
    const status = statusMap[data.Status ?? ""];
    if (!status) {
      throw new BadRequestException(
        `나이스 거래조회 응답의 거래상태를 해석하지 못했습니다. (${data.Status ?? "none"})`,
      );
    }
    return {
      status,
      authCode: data.AuthCode,
      authDate: data.AuthDate,
      raw: data,
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // 결제통보 (노티)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * 통보 신뢰 판정 — 통보에는 서명 필드가 없다(규격 §7).
   * 발신 IP 허용목록 + MID 일치까지만 본다. `TID`·`MOID`·`Amt` DB 대조는 호출부 책임이다.
   */
  isTrustedNotify(params: { remoteIp: string; mid: string }): boolean {
    const { remoteIp, mid } = params;
    if (!this.isConfigured() || !remoteIp || !mid) return false;
    // Node 가 IPv4 주소를 IPv6 매핑 표기로 주는 환경이 있다.
    const ip = remoteIp.replace(/^::ffff:/i, "");
    if (!NICE_STD_NOTIFY_IPS.includes(ip)) {
      this.logger.warn(`[NICESTD_NOTIFY] 허용되지 않은 발신 IP: ${ip}`);
      return false;
    }
    if (mid !== this.mid) {
      this.logger.warn(
        `[NICESTD_NOTIFY] MID 불일치 — 통보=${this.maskMid(mid)} 설정=${this.maskMid(this.mid)}`,
      );
      return false;
    }
    return true;
  }

  /** 통보 본문 파싱 — EUC-KR urlencoded form. 전역 파서가 UTF-8 전제라 raw 로 받아 직접 디코드한다. */
  parseNotifyBody(raw: Buffer): Record<string, string> {
    const result: Record<string, string> = {};
    if (!raw || raw.length === 0) return result;
    // latin1 은 바이트 ↔ 코드유닛 1:1 이라 percent-decode 전까지 바이트를 보존한다.
    for (const pair of raw.toString("latin1").split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const rawKey = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
      const key = iconv.decode(percentDecodeToBytes(rawKey), "euc-kr");
      if (!key) continue;
      result[key] = iconv.decode(percentDecodeToBytes(rawValue), "euc-kr");
    }
    return result;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 내부 유틸
  // ────────────────────────────────────────────────────────────────────────

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException(
        "나이스 구모듈 결제 설정이 없습니다.",
      );
    }
  }

  private async postForm(
    url: string,
    fields: Record<string, string>,
    timeoutMs?: number,
  ): Promise<Record<string, string>> {
    const res = await this.httpClient.post(
      url,
      buildEucKrForm(fields),
      timeoutMs ? { timeout: timeoutMs } : undefined,
    );
    return normalizeResponse(res.data);
  }

  /** 전문생성일시 `YYYYMMDDHHMISS` (KST). +9h 후 반드시 getUTC* 로 읽는다 — 서버 TZ 무관. */
  private ediDate(): string {
    const k = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    return [
      String(k.getUTCFullYear()),
      p(k.getUTCMonth() + 1),
      p(k.getUTCDate()),
      p(k.getUTCHours()),
      p(k.getUTCMinutes()),
      p(k.getUTCSeconds()),
    ].join("");
  }

  private parseAuthDate(authDate: string): Date | undefined {
    try {
      return kstCompactToInstant(authDate);
    } catch {
      this.logger.warn(`[NICESTD] AuthDate 해석 실패: ${authDate}`);
      return undefined;
    }
  }

  /** hex(sha256(...parts + MerchantKey)) — 재료 순서는 API 마다 다르다(규격 §0). */
  private sign(...parts: string[]): string {
    return crypto
      .createHash("sha256")
      .update(parts.join("") + this.merchantKey, "utf8")
      .digest("hex");
  }

  /**
   * 응답 서명 검증 — `hex(sha256(TID + MID + 금액 + MerchantKey))`.
   * 응답 금액은 12자리 0 채움인데 서명 재료의 표기가 규격에 명시돼 있지 않아,
   * 원문 문자열로 먼저 검증하고 실패하면 숫자 표기로 재검증한다(어느 쪽이 맞았는지 로그).
   */
  private verifyAmountSignature(
    tid: string,
    amountRaw: string,
    signature: string | undefined,
    context: string,
  ): boolean {
    if (!signature || !amountRaw) return false;
    if (this.safeEqualHex(this.sign(tid, this.mid, amountRaw), signature)) {
      this.logger.log(
        `[NICESTD] ${context} 응답 서명 검증 통과 (Amt 표기=원문)`,
      );
      return true;
    }
    const numeric = Number(amountRaw);
    if (Number.isFinite(numeric)) {
      const asNumber = String(numeric);
      if (
        asNumber !== amountRaw &&
        this.safeEqualHex(this.sign(tid, this.mid, asNumber), signature)
      ) {
        this.logger.log(
          `[NICESTD] ${context} 응답 서명 검증 통과 (Amt 표기=숫자)`,
        );
        return true;
      }
    }
    return false;
  }

  private safeEqualHex(expected: string, actual: string): boolean {
    try {
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from((actual ?? "").toLowerCase(), "utf8");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  private isAllowedApproveUrl(url: string | undefined): boolean {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === "https:" &&
        NICE_STD_APPROVE_HOSTS.includes(parsed.hostname)
      );
    } catch {
      return false;
    }
  }

  private assertApproveUrl(url: string): void {
    if (!this.isAllowedApproveUrl(url)) {
      throw new BadRequestException(
        "허용되지 않은 나이스 승인/망취소 URL 입니다.",
      );
    }
  }

  /** timeout·응답 유실·conn reset/refused·5xx·응답 파싱 불가 — 결과를 알 수 없는 실패. */
  private isAmbiguousTransport(err: unknown): boolean {
    if (err instanceof NiceStdResponseParseError) return true;
    const ax = err as AxiosError;
    const status = ax?.response?.status;
    const isTimeout = ax?.code === "ECONNABORTED" || ax?.code === "ETIMEDOUT";
    const isConnErr = ax?.code === "ECONNRESET" || ax?.code === "ECONNREFUSED";
    const noResponse = !!ax?.request && !ax?.response;
    const is5xx = typeof status === "number" && status >= 500;
    return isTimeout || isConnErr || noResponse || is5xx;
  }

  /** MID 는 공개 식별자지만 로그에는 앞 4자만 남긴다. MerchantKey 는 어떤 경로로도 남기지 않는다. */
  private maskMid(mid: string | undefined): string {
    if (!mid) return "미설정";
    return `${mid.slice(0, 4)}***`;
  }

  private maskTid(tid: string): string {
    return tid ? `${tid.slice(0, 12)}***` : "none";
  }
}
