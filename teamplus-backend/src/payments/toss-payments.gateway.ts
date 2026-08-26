import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import axios, { AxiosError, AxiosInstance } from "axios";

/**
 * 토스 취소 결과 미확정(transport 모호성) — timeout·응답 유실·connection reset/refused·5xx.
 * 토스가 취소를 처리했으나 응답만 유실됐을 수 있어 **Payment 복원 금지·격리** 대상이다.
 * KG 와 달리 토스는 멱등 키(Idempotency-Key) 재시도가 공식 보장되므로, 해소는
 * **같은 멱등키로 reprocess 재호출**(원 결과 반환)로 처리한다.
 * (정상 수신된 명확한 거절 응답 4xx 바디는 이 에러가 아니라 BadRequestException 으로 던진다.)
 */
export class TossCancelAmbiguousError extends Error {
  /**
   * TRANSPORT = timeout·응답 유실·conn reset/refused·5xx (결과 미확정)
   * PROCESSING = 409 IDEMPOTENT_REQUEST_PROCESSING (같은 키 이전 요청 처리 중 — 결과 미확정)
   * CONFLICT   = 422 (같은 키에 다른 본문 — 멱등 불변조건 위반, 운영 확인 대상)
   */
  readonly kind: "TRANSPORT" | "PROCESSING" | "CONFLICT";
  constructor(
    message: string,
    kind: "TRANSPORT" | "PROCESSING" | "CONFLICT" = "TRANSPORT",
  ) {
    super(message);
    this.name = "TossCancelAmbiguousError";
    this.kind = kind;
  }
}

/**
 * 토스페이먼츠 게이트웨이 클라이언트 (2026-05-13 신규)
 *
 * 주요 기능:
 * - 결제 승인 (paymentKey + orderId + amount)
 * - 결제 조회 / 취소
 * - 웹훅 서명 검증 (HMAC-SHA256)
 *
 * 보안:
 * - 시크릿키 Basic Auth (Base64(secret:))
 * - 서버사이드 금액 검증 (DB 기록 amount 와 confirm 응답 amount 매칭)
 * - 카드 데이터 서버 저장 절대 금지 — Web SDK 가 토큰화/3DS 위임
 *
 * Reference: https://docs.tosspayments.com/reference
 */
@Injectable()
export class TossPaymentsGateway {
  private readonly logger = new Logger(TossPaymentsGateway.name);
  private readonly httpClient: AxiosInstance;
  private readonly clientKey: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly apiVersion: string;
  private readonly apiBase: string;
  private readonly mid: string;

  constructor(private readonly configService: ConfigService) {
    this.clientKey = this.configService.get<string>("TOSS_CLIENT_KEY", "");
    this.secretKey = this.configService.get<string>("TOSS_SECRET_KEY", "");
    this.webhookSecret = this.configService.get<string>(
      "TOSS_WEBHOOK_SECRET",
      "",
    );
    this.apiVersion = this.configService.get<string>(
      "TOSS_API_VERSION",
      "2024-06-01",
    );
    this.apiBase = this.configService.get<string>(
      "TOSS_API_BASE",
      "https://api.tosspayments.com",
    );
    this.mid = this.configService.get<string>("TOSS_MID", "");

    if (!this.clientKey || !this.secretKey) {
      this.logger.warn(
        "TOSS_CLIENT_KEY 또는 TOSS_SECRET_KEY 미설정 — 토스 결제 비활성.",
      );
    }

    // Basic Auth: Base64(secretKey + ":")
    // ⚠️ TossPayments-Test-Code 헤더는 절대 보내지 말 것 — 이건 "테스트 강제 실패 시나리오 코드"
    //   (예: INVALID_CARD_COMPANY, NOT_AVAILABLE_BANK 등) 를 받는 디버그용 헤더.
    //   값에 API 버전을 넣으면 토스가 "유효하지 않은 테스트 코드입니다" 로 거절. 운영/일반 테스트엔 불필요.
    const auth = Buffer.from(`${this.secretKey}:`).toString("base64");
    this.httpClient = axios.create({
      baseURL: this.apiBase,
      timeout: 15000,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });

    // mId 를 함께 남긴다 — 환경별 .env 가 분리돼 있어, 어느 상점으로 붙어 있는지 확인할
    //   다른 수단이 없다. 결제 tid 와 대조하면 상점 불일치를 즉시 판별할 수 있다.
    this.logger.log(
      `토스페이먼츠 게이트웨이 초기화 (api=${this.apiBase}, version=${this.apiVersion}, mid=${this.mid || "미설정"}, key=${this.clientKey.slice(0, 12)}***)`,
    );
  }

  /** [공개] Web SDK 초기화용 클라이언트키 */
  getClientKey(): string {
    return this.clientKey;
  }

  /**
   * 결제 승인 — POST /v1/payments/confirm
   *
   * 흐름:
   *  1) Frontend 위젯 결제 완료 → successUrl 로 paymentKey/orderId/amount 쿼리 도착
   *  2) Backend 이 메서드 호출 → 토스 승인 API 호출
   *  3) 응답의 status === 'DONE' && totalAmount === amount 검증 후 DB 갱신
   */
  async confirm(params: {
    paymentKey: string;
    orderId: string;
    amount: number;
  }): Promise<TossPaymentConfirmResponse> {
    if (!this.clientKey || !this.secretKey) {
      throw new InternalServerErrorException(
        "토스 결제 키가 설정되지 않았습니다.",
      );
    }
    const { paymentKey, orderId, amount } = params;
    if (!paymentKey || !orderId || !amount) {
      throw new BadRequestException(
        "paymentKey · orderId · amount 는 필수입니다.",
      );
    }
    try {
      const res = await this.httpClient.post<TossPaymentConfirmResponse>(
        "/v1/payments/confirm",
        { paymentKey, orderId, amount },
      );
      this.logger.log(
        `토스 결제 승인 성공: orderId=${orderId} paymentKey=${paymentKey.slice(0, 12)}*** amount=${amount}`,
      );
      return res.data;
    } catch (err) {
      const error = err as {
        response?: { data?: { message?: string; code?: string } };
      };
      const msg =
        error.response?.data?.message ?? "토스 결제 승인에 실패했습니다.";
      const code = error.response?.data?.code ?? "TOSS_CONFIRM_FAILED";
      this.logger.error(`토스 결제 승인 실패: ${code} ${msg}`);
      throw new BadRequestException(`${msg} (${code})`);
    }
  }

  /** 결제 조회 — GET /v1/payments/{paymentKey} */
  async getPayment(paymentKey: string): Promise<TossPaymentConfirmResponse> {
    const res = await this.httpClient.get<TossPaymentConfirmResponse>(
      `/v1/payments/${paymentKey}`,
    );
    return res.data;
  }

  /**
   * 결제 취소 — POST /v1/payments/{paymentKey}/cancel
   *  cancelAmount 미지정 시 전액 취소.
   */
  async cancel(params: {
    paymentKey: string;
    cancelReason: string;
    cancelAmount?: number;
    /** 멱등 키 — 동일 키 재요청 시 토스가 원 취소 결과를 반환(이중 취소 방지). */
    idempotencyKey?: string;
  }): Promise<TossPaymentConfirmResponse> {
    const { paymentKey, cancelReason, cancelAmount, idempotencyKey } = params;
    try {
      const res = await this.httpClient.post<TossPaymentConfirmResponse>(
        `/v1/payments/${paymentKey}/cancel`,
        cancelAmount ? { cancelReason, cancelAmount } : { cancelReason },
        idempotencyKey
          ? { headers: { "Idempotency-Key": idempotencyKey } }
          : undefined,
      );
      this.logger.log(
        `토스 결제 취소 성공: paymentKey=${paymentKey.slice(0, 12)}*** reason=${cancelReason}`,
      );
      return res.data;
    } catch (err) {
      // [상태매트릭스 감사] transport 모호성(취소 처리 여부 불명)과 명확한 거절을 구분한다.
      //   모호(timeout·응답 유실·conn reset/refused·5xx) → TossCancelAmbiguousError(격리, 복원 금지).
      //   정상 수신된 명확한 거절(4xx 에러 바디 — ALREADY_CANCELED/NOT_CANCELABLE_* 등) → 확정 실패.
      const ax = err as AxiosError<{ message?: string; code?: string }>;
      const status = ax.response?.status;
      const isTimeout = ax.code === "ECONNABORTED" || ax.code === "ETIMEDOUT";
      const isConnErr = ax.code === "ECONNRESET" || ax.code === "ECONNREFUSED";
      const noResponse = !!ax.request && !ax.response;
      const is5xx = typeof status === "number" && status >= 500;
      if (isTimeout || isConnErr || noResponse || is5xx) {
        this.logger.error(
          `[TOSS_UNCONFIRMED] 취소 결과 미확정(transport): paymentKey=${paymentKey.slice(
            0,
            12,
          )}***, code=${ax.code}, status=${status ?? "none"}`,
        );
        throw new TossCancelAmbiguousError(
          "토스 취소 결과가 확인되지 않았습니다(응답 유실/타임아웃).",
          "TRANSPORT",
        );
      }
      // [멱등 계약] 정상 수신 응답이라도 결과 미확정/불변조건 위반은 확정 실패로 처리하지 않는다.
      //   409 IDEMPOTENT_REQUEST_PROCESSING = 같은 키 이전 요청 처리 중(결과 미확정) → 같은 키 재시도 대상.
      //   [Minor 1] status(409)와 body code 를 함께 판정 — 한쪽만으로 오분류 방지.
      const bodyCode = ax.response?.data?.code;
      if (status === 409 && bodyCode === "IDEMPOTENT_REQUEST_PROCESSING") {
        this.logger.error(
          `[TOSS_UNCONFIRMED] 멱등 요청 처리 중(409): paymentKey=${paymentKey.slice(
            0,
            12,
          )}***, code=${bodyCode}`,
        );
        throw new TossCancelAmbiguousError(
          "토스 멱등 요청이 처리 중입니다(결과 미확정).",
          "PROCESSING",
        );
      }
      //   422 = 같은 키에 다른 본문(멱등 불변조건 위반) → 운영 확인 대상(격리, Payment 복원 금지).
      if (status === 422) {
        this.logger.error(
          `[TOSS_IDEMPOTENCY_CONFLICT] 멱등 본문 불일치(422): paymentKey=${paymentKey.slice(
            0,
            12,
          )}***, code=${bodyCode ?? "none"}`,
        );
        throw new TossCancelAmbiguousError(
          "토스 멱등 요청 본문이 일치하지 않습니다(422).",
          "CONFLICT",
        );
      }
      // 승인 경로와 동일하게 토스 에러 코드를 함께 남긴다 — 메시지만으로는 상점 불일치·권한·
      //   결제수단 제약을 구분할 수 없어 실패 원장 사유가 진단 불가능해진다.
      const msg =
        ax.response?.data?.message ?? "토스 결제 취소에 실패했습니다.";
      const code = ax.response?.data?.code;
      throw new BadRequestException(code ? `${msg} (${code})` : msg);
    }
  }

  /**
   * Webhook 서명 검증 — TOSS_WEBHOOK_SECRET 기반 HMAC-SHA256.
   *  토스 페이먼츠 webhook 헤더(X-TossPayments-Signature 등) 의 base64(HMAC) 와
   *  요청 raw body 의 HMAC-SHA256 결과를 비교한다.
   *
   *  Reference: https://docs.tosspayments.com/reference/using-api/webhook
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn("TOSS_WEBHOOK_SECRET 미설정 — webhook 서명 검증 스킵.");
      return false;
    }
    if (!signatureHeader) return false;
    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody, "utf8")
      .digest("base64");
    try {
      // timingSafeEqual 으로 타이밍 어택 방지
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signatureHeader),
      );
    } catch {
      return false;
    }
  }
}

/**
 * 토스 결제 승인/조회 응답 타입 — 주요 필드만 (전체는 토스 공식 docs 참고).
 *  Reference: https://docs.tosspayments.com/reference#payment
 */
export interface TossPaymentConfirmResponse {
  /** 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'WAITING_FOR_DEPOSIT' | 'IN_PROGRESS' */
  status: string;
  paymentKey: string;
  orderId: string;
  orderName: string;
  method?: string | null;
  totalAmount: number;
  balanceAmount?: number;
  suppliedAmount?: number;
  vat?: number;
  approvedAt?: string;
  requestedAt?: string;
  receipt?: { url?: string };
  card?: {
    issuerCode?: string;
    acquirerCode?: string;
    number?: string;
    installmentPlanMonths?: number;
    cardType?: string;
    ownerType?: string;
  };
  easyPay?: { provider?: string; amount?: number; discountAmount?: number };
}
