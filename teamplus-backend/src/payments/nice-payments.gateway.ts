import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import axios, { AxiosError, AxiosInstance } from "axios";

/** 나이스페이 정상 처리 코드 — 인증(authResultCode)·승인/취소(resultCode) 공통. */
export const NICE_RESULT_OK = "0000";

/**
 * 나이스 **승인** 결과 미확정 — timeout·응답 유실·connection reset/refused·5xx.
 *
 * 토스와 결정적으로 다른 점: 나이스는 멱등 키(Idempotency-Key) 재시도를 제공하지 않는다.
 * 대신 매뉴얼이 **망취소(netCancel)** 를 지정된 해소 수단으로 못박고 있다.
 *   "승인 API 호출시 read-timeout이 발생한다면 망취소를 진행 해주세요."
 * 따라서 이 에러를 받은 호출부는 **반드시 netCancel(orderId) 을 시도**해야 한다.
 * 망취소 유효기간은 1시간이며, 초과 시 실패한다.
 *
 * Reference: /api/payment-window-server.md#예외처리 · /api/cancel.md#망취소
 */
export class NiceApproveAmbiguousError extends Error {
  /** 망취소 요청에 필요한 상점 주문번호. */
  readonly orderId: string;
  constructor(message: string, orderId: string) {
    super(message);
    this.name = "NiceApproveAmbiguousError";
    this.orderId = orderId;
  }
}

/**
 * 나이스 **취소** 결과 미확정(transport 모호성) — timeout·응답 유실·conn reset/refused·5xx.
 *
 * 나이스가 취소를 처리했으나 응답만 유실됐을 수 있어 **Payment 복원 금지·격리** 대상이다.
 * 토스와 달리 멱등 재호출로 원 결과를 되받을 수단이 없으므로, 해소는
 * **거래조회(getPaymentByOrderId)로 status 확인** 후 운영 판단으로 처리한다.
 * (정상 수신된 명확한 거절 응답은 이 에러가 아니라 BadRequestException 으로 던진다.)
 */
export class NiceCancelAmbiguousError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NiceCancelAmbiguousError";
  }
}

/**
 * 나이스페이먼츠 게이트웨이 클라이언트 (2026-08-27 신규 — 골격)
 *
 * 주요 기능:
 * - 인증 결과(returnUrl POST) 위변조 검증
 * - 결제 승인 (tid + amount)
 * - 거래 조회 (tid / orderId)
 * - 취소·부분취소 / 망취소
 * - 웹훅 위변조 검증
 *
 * 토스와의 구조적 차이 (이 클래스가 존재하는 이유):
 * - 승인 대상 키가 `paymentKey` 가 아니라 `tid` 이고, 승인 엔드포인트가 경로에 tid 를 담는다.
 * - Basic Auth 가 `base64(secretKey:)` 가 아니라 **`base64(clientId:secretKey)`** 다.
 * - 위변조 검증이 HMAC 헤더가 아니라 **본문 필드의 SHA-256 해시 체인**이다(규칙이 API마다 다름).
 * - 멱등 키가 없고, 그 자리를 **망취소(1시간)** 가 대신한다.
 *
 * 보안:
 * - clientKey 만 브라우저 노출, secretKey 는 서버 .env 전용 — 로그에도 남기지 않는다.
 * - 서버사이드 금액 검증 필수 (DB 기록 amount 와 승인 응답 amount 매칭 — 호출부 책임)
 * - 카드 데이터 서버 저장 절대 금지 — 결제창이 토큰화/3DS 를 위임받는다.
 *
 * ⚠️ 승인 모델은 **클라이언트 키 타입으로 결정**된다. 이 게이트웨이는 Server 승인 모델
 *   (결제창 인증 → 서버가 승인 API 호출) 전용이므로, 가맹점관리자에서 **Server 승인용
 *   클라이언트 키**를 발급받아야 한다. Client 승인 키를 넣으면 결제창이 자동 승인해버려
 *   이 클래스의 approve() 가 이중 승인 실패로 떨어진다.
 *
 * Reference: https://github.com/nicepayments/nicepay-manual
 */
@Injectable()
export class NicePaymentsGateway {
  private readonly logger = new Logger(NicePaymentsGateway.name);
  private readonly httpClient: AxiosInstance;
  private readonly clientKey: string;
  private readonly secretKey: string;
  private readonly apiBase: string;

  constructor(private readonly configService: ConfigService) {
    // 키 이름은 payment-provider.constant.ts 의 nice.requiredEnv 와 반드시 일치해야 한다.
    //   불일치 시 어드민 결제사 선택 화면이 "키 미설정" 으로 남아 전환이 막힌다.
    this.clientKey = this.configService.get<string>("NICE_CLIENT_KEY", "");
    this.secretKey = this.configService.get<string>("NICE_SECRET_KEY", "");
    // 샌드박스: https://sandbox-api.nicepay.co.kr — 운영 전환 시 도메인과 KEY 를 함께 바꿔야 한다.
    //   (샌드박스 응답은 실제 결제 응답이 아니며 임의 값이 섞인다.)
    this.apiBase = this.configService.get<string>(
      "NICE_API_BASE",
      "https://api.nicepay.co.kr",
    );

    if (!this.clientKey || !this.secretKey) {
      this.logger.warn(
        "NICE_CLIENT_KEY 또는 NICE_SECRET_KEY 미설정 — 나이스페이 결제 비활성.",
      );
    }

    // Basic Auth: Base64(clientId + ":" + secretKey)
    //   토스(`secretKey:`)와 형태가 달라 그대로 베끼면 401 이 난다.
    const auth = Buffer.from(`${this.clientKey}:${this.secretKey}`).toString(
      "base64",
    );
    this.httpClient = axios.create({
      baseURL: this.apiBase,
      timeout: 15000,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json;charset=utf-8",
      },
    });

    // 어느 상점(clientId)으로 붙어 있는지 남긴다 — 환경별 .env 가 분리돼 있어
    //   샌드박스/운영 오접속을 식별할 다른 수단이 없다. secretKey 는 절대 남기지 않는다.
    this.logger.log(
      `나이스페이먼츠 게이트웨이 초기화 (api=${this.apiBase}, clientId=${
        this.clientKey ? `${this.clientKey.slice(0, 8)}***` : "미설정"
      })`,
    );
  }

  /** [공개] 결제창 JS SDK 초기화용 클라이언트키 */
  getClientKey(): string {
    return this.clientKey;
  }

  /** 결제 키가 모두 설정됐는지 — 컨트롤러가 503 대신 명시적 사유를 주기 위해 사용. */
  isConfigured(): boolean {
    return Boolean(this.clientKey && this.secretKey);
  }

  // ────────────────────────────────────────────────────────────────────────
  // 위변조 검증
  // ────────────────────────────────────────────────────────────────────────

  /**
   * 결제창 인증 결과(returnUrl POST) 위변조 검증.
   *  생성규칙: hex(sha256(authToken + clientId + amount + SecretKey))
   *
   *  ⚠️ 승인 API 계열과 해시 재료가 다르다(authToken/clientId 기반). 규칙을 공유하지 말 것.
   *  ⚠️ authResultCode === '0000' 인 경우에만 signature 가 내려온다.
   */
  verifyAuthSignature(params: {
    authToken: string;
    clientId: string;
    amount: number | string;
    signature: string;
  }): boolean {
    const { authToken, clientId, amount, signature } = params;
    if (!this.secretKey || !signature) return false;
    // clientId 는 응답값을 그대로 쓰지 않고 우리 설정값과 먼저 대조한다 —
    //   공격자가 clientId 와 signature 를 함께 바꿔 오면 해시만으로는 통과하기 때문이다.
    if (clientId !== this.clientKey) {
      this.logger.error(
        `[NICE_AUTH] clientId 불일치 — 응답=${clientId?.slice(0, 8)}*** 설정=${this.clientKey.slice(0, 8)}***`,
      );
      return false;
    }
    const expected = this.sign(authToken, clientId, String(amount));
    return this.safeEqualHex(expected, signature);
  }

  /**
   * 승인·취소·망취소 응답 및 웹훅 공통 위변조 검증.
   *  생성규칙: hex(sha256(tid + amount + ediDate + SecretKey))
   *
   *  signature 는 "유효한 거래건에 한하여" 응답되므로, 실패 응답에는 없을 수 있다.
   *  호출부는 resultCode 를 먼저 보고, 성공 건에 대해서만 이 검증을 요구해야 한다.
   */
  verifyResultSignature(params: {
    tid: string;
    amount: number | string;
    ediDate: string;
    signature: string;
  }): boolean {
    const { tid, amount, ediDate, signature } = params;
    if (!this.secretKey || !signature) return false;
    const expected = this.sign(tid, String(amount), ediDate);
    return this.safeEqualHex(expected, signature);
  }

  /**
   * 웹훅 위변조 검증 — 응답 signature 와 동일 규칙.
   *
   *  ⚠️ 토스와 달리 서명이 **헤더가 아니라 body 필드**에 있다. raw body HMAC 이 아니므로
   *    컨트롤러에서 rawBody 를 보존할 필요가 없다.
   *  ⚠️ 검증 성공 후 응답은 반드시 HTTP 200 + body 에 문자열 `OK` — 없으면 나이스가
   *    전송 실패로 간주해 재전송 큐에 쌓는다.
   */
  verifyWebhookSignature(body: {
    tid?: string;
    amount?: number | string;
    ediDate?: string;
    signature?: string;
  }): boolean {
    if (!body?.tid || body.amount == null || !body.ediDate || !body.signature) {
      return false;
    }
    return this.verifyResultSignature({
      tid: body.tid,
      amount: body.amount,
      ediDate: body.ediDate,
      signature: body.signature,
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // 결제 승인
  // ────────────────────────────────────────────────────────────────────────

  /**
   * 결제 승인 — POST /v1/payments/{tid}
   *
   * 흐름:
   *  1) 결제창 인증 완료 → returnUrl 로 authResultCode/authToken/tid/orderId/amount/signature POST
   *  2) 호출부가 verifyAuthSignature() 통과 + DB 기록 금액 일치 확인
   *  3) 이 메서드 호출 → 실제 승인 발생 (호출하지 않으면 결제는 발생하지 않는다)
   *  4) resultCode === '0000' && status === 'paid' && amount 일치 검증 후 DB 갱신
   *
   * read-timeout 등 결과 미확정 시 NiceApproveAmbiguousError 를 던진다 —
   *   호출부는 반드시 netCancel(orderId) 로 해소해야 한다.
   */
  async approve(params: {
    tid: string;
    /** 인증 단계에서 확인된 금액. 여기에 사용자 입력을 그대로 흘리면 안 된다. */
    amount: number;
    /** 망취소 대상 식별용 — 승인 실패/미확정 시 사용. */
    orderId: string;
  }): Promise<NicePaymentResponse> {
    this.assertConfigured();
    const { tid, amount, orderId } = params;
    if (!tid || !amount || !orderId) {
      throw new BadRequestException("tid · amount · orderId 는 필수입니다.");
    }

    const ediDate = this.ediDate();
    try {
      const res = await this.httpClient.post<NicePaymentResponse>(
        `/v1/payments/${encodeURIComponent(tid)}`,
        {
          amount,
          ediDate,
          // 요청 signData 는 응답 signature 와 재료가 같다: tid + amount + ediDate + SecretKey
          signData: this.sign(tid, String(amount), ediDate),
          returnCharSet: "utf-8",
        },
      );
      const data = res.data;
      if (data?.resultCode !== NICE_RESULT_OK) {
        // 정상 수신된 명확한 거절 — 망취소 대상이 아니다(승인 자체가 발생하지 않음).
        this.logger.error(
          `나이스 결제 승인 거절: orderId=${orderId} code=${data?.resultCode} msg=${data?.resultMsg}`,
        );
        throw new BadRequestException(
          `${data?.resultMsg ?? "나이스 결제 승인에 실패했습니다."} (${
            data?.resultCode ?? "NICE_APPROVE_FAILED"
          })`,
        );
      }
      this.logger.log(
        `나이스 결제 승인 성공: orderId=${orderId} tid=${tid.slice(0, 12)}*** amount=${data.amount}`,
      );
      return data;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (this.isAmbiguousTransport(err)) {
        const ax = err as AxiosError;
        this.logger.error(
          `[NICE_UNCONFIRMED] 승인 결과 미확정(transport): orderId=${orderId}, tid=${tid.slice(
            0,
            12,
          )}***, code=${ax.code}, status=${ax.response?.status ?? "none"} — 망취소 필요`,
        );
        throw new NiceApproveAmbiguousError(
          "나이스 승인 결과가 확인되지 않았습니다(응답 유실/타임아웃).",
          orderId,
        );
      }
      const ax = err as AxiosError<{ resultMsg?: string; resultCode?: string }>;
      const msg =
        ax.response?.data?.resultMsg ?? "나이스 결제 승인에 실패했습니다.";
      const code = ax.response?.data?.resultCode;
      this.logger.error(`나이스 결제 승인 실패: ${code ?? "none"} ${msg}`);
      throw new BadRequestException(code ? `${msg} (${code})` : msg);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 조회
  // ────────────────────────────────────────────────────────────────────────

  /** 거래 조회 (tid) — GET /v1/payments/{tid} */
  async getPaymentByTid(tid: string): Promise<NicePaymentResponse> {
    this.assertConfigured();
    const res = await this.httpClient.get<NicePaymentResponse>(
      `/v1/payments/${encodeURIComponent(tid)}`,
    );
    return res.data;
  }

  /**
   * 거래 조회 (orderId) — GET /v1/payments/find/{orderId}
   *  결과 미확정 해소의 1차 수단. orderId 가 unique 해야 정상 동작한다
   *  (우리 orderNumber 는 UUID 라 조건 충족).
   */
  async getPaymentByOrderId(orderId: string): Promise<NicePaymentResponse> {
    this.assertConfigured();
    const res = await this.httpClient.get<NicePaymentResponse>(
      `/v1/payments/find/${encodeURIComponent(orderId)}`,
    );
    return res.data;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 취소 / 망취소
  // ────────────────────────────────────────────────────────────────────────

  /**
   * 결제 취소 — POST /v1/payments/{tid}/cancel
   *  cancelAmt 미지정 시 전액 취소.
   *
   *  ⚠️ 부분취소는 **중복된 orderId 로 재호출 불가**다. 토스의 멱등 키처럼 같은 값으로
   *    재시도하면 원 결과를 돌려주는 동작이 아니라 거절된다. 부분취소를 여러 번 하려면
   *    호출마다 서로 다른 orderId 를 만들어 넘겨야 한다(환불요청 ID 등).
   *  ⚠️ 샌드박스에서는 부분취소가 지원되지 않는다 — 전액취소로만 검증 가능하다.
   */
  async cancel(params: {
    tid: string;
    /** 이 취소 건의 상점 주문번호. 부분취소 시 매 호출 고유해야 한다. */
    orderId: string;
    reason: string;
    /** 미지정 시 전액취소. */
    cancelAmt?: number;
    taxFreeAmt?: number;
    /** 현금성 거래(가상계좌 등) 환불 계좌. */
    refundAccount?: string;
    refundBankCode?: string;
    refundHolder?: string;
  }): Promise<NicePaymentResponse> {
    this.assertConfigured();
    const { tid, orderId, reason, cancelAmt, taxFreeAmt } = params;
    if (!tid || !orderId || !reason) {
      throw new BadRequestException("tid · orderId · reason 은 필수입니다.");
    }

    const ediDate = this.ediDate();
    try {
      const res = await this.httpClient.post<NicePaymentResponse>(
        `/v1/payments/${encodeURIComponent(tid)}/cancel`,
        {
          reason,
          orderId,
          ...(cancelAmt != null ? { cancelAmt } : {}),
          ...(taxFreeAmt != null ? { taxFreeAmt } : {}),
          ...(params.refundAccount
            ? {
                refundAccount: params.refundAccount,
                refundBankCode: params.refundBankCode,
                refundHolder: params.refundHolder,
              }
            : {}),
          ediDate,
          // 취소 요청 signData 는 amount 가 빠진다: tid + ediDate + SecretKey
          //   승인(tid+amount+ediDate)과 재료가 달라 공유하면 서명 오류가 난다.
          signData: this.sign(tid, ediDate),
          returnCharSet: "utf-8",
        },
      );
      const data = res.data;
      if (data?.resultCode !== NICE_RESULT_OK) {
        this.logger.error(
          `나이스 결제 취소 거절: orderId=${orderId} code=${data?.resultCode} msg=${data?.resultMsg}`,
        );
        throw new BadRequestException(
          `${data?.resultMsg ?? "나이스 결제 취소에 실패했습니다."} (${
            data?.resultCode ?? "NICE_CANCEL_FAILED"
          })`,
        );
      }
      this.logger.log(
        `나이스 결제 취소 성공: tid=${tid.slice(0, 12)}*** cancelledTid=${
          data.cancelledTid ?? "none"
        } reason=${reason}`,
      );
      return data;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // 토스와 동일하게 transport 모호성(취소 처리 여부 불명)과 명확한 거절을 구분한다.
      //   모호 → NiceCancelAmbiguousError(격리, Payment 복원 금지).
      if (this.isAmbiguousTransport(err)) {
        const ax = err as AxiosError;
        this.logger.error(
          `[NICE_UNCONFIRMED] 취소 결과 미확정(transport): tid=${tid.slice(
            0,
            12,
          )}***, code=${ax.code}, status=${ax.response?.status ?? "none"}`,
        );
        throw new NiceCancelAmbiguousError(
          "나이스 취소 결과가 확인되지 않았습니다(응답 유실/타임아웃).",
        );
      }
      const ax = err as AxiosError<{ resultMsg?: string; resultCode?: string }>;
      const msg =
        ax.response?.data?.resultMsg ?? "나이스 결제 취소에 실패했습니다.";
      const code = ax.response?.data?.resultCode;
      throw new BadRequestException(code ? `${msg} (${code})` : msg);
    }
  }

  /**
   * 망취소 — POST /v1/payments/netcancel
   *
   *  승인 요청은 나갔는데 응답 수신에 실패한 거래를 되돌린다. 일반 취소와 달리
   *  tid 가 아니라 **orderId** 로 지정한다(tid 를 못 받았을 수 있으므로).
   *
   *  ⚠️ 유효기간 1시간. 초과 건은 실패하므로, 승인 미확정은 즉시 처리해야 한다.
   *  ⚠️ 정상 거래의 취소에는 쓰지 말 것 — 그건 cancel() 이다.
   */
  async netCancel(params: {
    orderId: string;
    mallReserved?: string;
  }): Promise<NicePaymentResponse> {
    this.assertConfigured();
    const { orderId, mallReserved } = params;
    if (!orderId) {
      throw new BadRequestException("orderId 는 필수입니다.");
    }

    const ediDate = this.ediDate();
    try {
      const res = await this.httpClient.post<NicePaymentResponse>(
        "/v1/payments/netcancel",
        {
          orderId,
          ...(mallReserved ? { mallReserved } : {}),
          ediDate,
          // 망취소 signData 만 orderId 기반이다: orderId + ediDate + SecretKey
          signData: this.sign(orderId, ediDate),
          returnCharSet: "utf-8",
        },
      );
      const data = res.data;
      if (data?.resultCode !== NICE_RESULT_OK) {
        // 망취소 실패는 삼켜서는 안 된다 — 미승인/미취소 거래가 그대로 남는다.
        this.logger.error(
          `[NICE_NETCANCEL_FAILED] orderId=${orderId} code=${data?.resultCode} msg=${data?.resultMsg}`,
        );
        throw new BadRequestException(
          `${data?.resultMsg ?? "나이스 망취소에 실패했습니다."} (${
            data?.resultCode ?? "NICE_NETCANCEL_FAILED"
          })`,
        );
      }
      this.logger.log(`나이스 망취소 성공: orderId=${orderId}`);
      return data;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const ax = err as AxiosError<{ resultMsg?: string; resultCode?: string }>;
      this.logger.error(
        `[NICE_NETCANCEL_FAILED] orderId=${orderId} code=${ax.code ?? "none"} status=${
          ax.response?.status ?? "none"
        } msg=${ax.response?.data?.resultMsg ?? ax.message}`,
      );
      throw new BadRequestException(
        ax.response?.data?.resultMsg ?? "나이스 망취소에 실패했습니다.",
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 내부 유틸
  // ────────────────────────────────────────────────────────────────────────

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException(
        "나이스페이 결제 키가 설정되지 않았습니다.",
      );
    }
  }

  /**
   * 전문생성일시 — ISO 8601.
   *  UTC(Z) 표기로 보낸다. 프로젝트 시간 규약상 백엔드는 KST 벽시계 변환을 하지 않으며,
   *  toLocale*String 은 tz:guard 가 빌드를 실패시킨다.
   */
  private ediDate(): string {
    return new Date().toISOString();
  }

  /** hex(sha256(...parts + SecretKey)) — 나이스 위변조 검증 해시의 단일 구현. */
  private sign(...parts: string[]): string {
    return crypto
      .createHash("sha256")
      .update(parts.join("") + this.secretKey, "utf8")
      .digest("hex");
  }

  /** 타이밍 어택 방지 hex 비교. 길이가 다르면 timingSafeEqual 이 던지므로 감싼다. */
  private safeEqualHex(expected: string, actual: string): boolean {
    try {
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(actual.toLowerCase(), "utf8");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /** timeout·응답 유실·conn reset/refused·5xx — 결과를 알 수 없는 transport 실패. */
  private isAmbiguousTransport(err: unknown): boolean {
    const ax = err as AxiosError;
    const status = ax.response?.status;
    const isTimeout = ax.code === "ECONNABORTED" || ax.code === "ETIMEDOUT";
    const isConnErr = ax.code === "ECONNRESET" || ax.code === "ECONNREFUSED";
    const noResponse = !!ax.request && !ax.response;
    const is5xx = typeof status === "number" && status >= 500;
    return isTimeout || isConnErr || noResponse || is5xx;
  }
}

/**
 * 결제창 인증 결과 — returnUrl 로 POST(application/x-www-form-urlencoded) 된다.
 *  ⚠️ form POST 이므로 amount 가 문자열로 도착한다. 숫자 비교 전 변환 필수.
 *
 * Reference: /api/payment-window-server.md#응답-명세-server-승인-모델
 */
export interface NiceAuthResult {
  /** '0000' 인 경우에만 승인 API 호출. 그 외는 인증 실패. */
  authResultCode: string;
  authResultMsg?: string;
  /** 인증 성공 시에만 리턴 — 승인 API 의 경로 파라미터. */
  tid?: string;
  clientId: string;
  orderId: string;
  amount: string | number;
  mallReserved?: string;
  authToken?: string;
  /** 인증 성공 시에만 리턴 — hex(sha256(authToken + clientId + amount + SecretKey)) */
  signature?: string;
}

/**
 * 승인·조회·취소·망취소·웹훅 공통 응답 — 주요 필드만 (전체는 공식 매뉴얼 참고).
 *  Reference: /api/payment-window-server.md#응답-명세
 */
export interface NicePaymentResponse {
  /** '0000' : 성공 / 그 외 실패 */
  resultCode: string;
  resultMsg: string;
  tid: string;
  /** 취소 요청건에만 응답 — 부분취소 시 tid 와 다른 값. */
  cancelledTid?: string;
  orderId: string;
  /** 응답전문생성일시 ISO 8601 — signature 검증 재료. */
  ediDate?: string;
  /** 유효 거래건에만 응답 — hex(sha256(tid + amount + ediDate + SecretKey)) */
  signature?: string;
  /** 'paid' | 'ready' | 'failed' | 'cancelled' | 'partialCancelled' | 'expired' */
  status: string;
  /** 결제완료가 아니면 '0' 문자열이 올 수 있다. */
  paidAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  /** 'card' | 'vbank' | 'bank' | 'naverpay' | 'kakaopay' | 'payco' | 'ssgpay' | 'samsungpay' */
  payMethod: string;
  amount: number;
  /** 취소 가능 잔액 — 부분취소 누계 차감 후 금액. */
  balanceAmt: number;
  goodsName: string;
  mallReserved?: string;
  useEscrow?: boolean;
  /** 'KRW' | 'USD' | 'CNY' */
  currency?: string;
  /** 'pc' | 'mobile' */
  channel?: string;
  approveNo?: string;
  buyerName?: string;
  buyerTel?: string;
  buyerEmail?: string;
  issuedCashReceipt?: boolean;
  /** 매출전표 확인 URL */
  receiptUrl?: string;
  mallUserId?: string;
  coupon?: { couponAmt?: number };
  card?: {
    cardCode?: string;
    cardName?: string;
    /** 가운데 마스킹된 번호 — 그대로도 저장 금지. */
    cardNum?: string;
    cardQuota?: string;
    isInterestFree?: boolean;
    /** 'credit' | 'check' */
    cardType?: string;
    canPartCancel?: string;
    acquCardCode?: string;
    acquCardName?: string;
  };
  bank?: { bankCode?: string; bankName?: string };
  vbank?: {
    vbankCode?: string;
    vbankName?: string;
    vbankNumber?: string;
    vbankExpDate?: string;
    vbankHolder?: string;
  };
  cancels?: Array<{
    tid?: string;
    amount?: number;
    cancelledAt?: string;
    reason?: string;
    receiptUrl?: string;
  }>;
}
