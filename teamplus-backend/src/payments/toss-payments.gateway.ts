import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import axios, { AxiosInstance } from "axios";

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

    this.logger.log(
      `토스페이먼츠 게이트웨이 초기화 (api=${this.apiBase}, version=${this.apiVersion}, key=${this.clientKey.slice(0, 12)}***)`,
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
  }): Promise<TossPaymentConfirmResponse> {
    const { paymentKey, cancelReason, cancelAmount } = params;
    try {
      const res = await this.httpClient.post<TossPaymentConfirmResponse>(
        `/v1/payments/${paymentKey}/cancel`,
        cancelAmount ? { cancelReason, cancelAmount } : { cancelReason },
      );
      this.logger.log(
        `토스 결제 취소 성공: paymentKey=${paymentKey.slice(0, 12)}*** reason=${cancelReason}`,
      );
      return res.data;
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      const msg =
        error.response?.data?.message ?? "토스 결제 취소에 실패했습니다.";
      throw new BadRequestException(msg);
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
