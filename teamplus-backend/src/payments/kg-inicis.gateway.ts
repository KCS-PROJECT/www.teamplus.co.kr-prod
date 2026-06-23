import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import axios, { AxiosInstance } from "axios";
import { getKgPaymethod } from "./constants/payment-method.constant";

/**
 * KG이니시스 결제 게이트웨이 클라이언트
 *
 * 주요 기능:
 * - 결제 요청 생성 (모바일/PC)
 * - 결제 승인 처리
 * - 결제 취소 (전액/부분)
 * - 웹훅 서명 검증
 *
 * 보안:
 * - 서버사이드 금액 검증
 * - HMAC-SHA256 웹훅 서명
 * - 중복 결제 방지
 */
@Injectable()
export class KgInicisGateway {
  private readonly logger = new Logger(KgInicisGateway.name);
  private readonly httpClient: AxiosInstance;
  private readonly config: any;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get("payment");

    // HTTP 클라이언트 초기화
    this.httpClient = axios.create({
      timeout: this.config.inicis.timeout,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    });

    this.logger.log(
      `KG이니시스 게이트웨이 초기화 완료 (모드: ${this.config.inicis.mode}, 상점ID: ${this.config.inicis.storeId})`,
    );
  }

  /**
   * 결제 요청 URL 생성
   *
   * @param orderNumber - 주문번호 (유니크)
   * @param amount - 결제 금액
   * @param productName - 상품명
   * @param buyerName - 구매자 이름
   * @param buyerEmail - 구매자 이메일
   * @param buyerPhone - 구매자 전화번호
   * @param paymentMethod - 결제 수단 UI값 (card, easy, vbank, trans, phone) — 내부에서 KG 공식 paymethod로 변환
   * @param quota - 할부 개월 수 (0: 일시불)
   * @returns 결제 페이지 URL
   */
  async createPaymentRequest(params: {
    orderNumber: string;
    amount: number;
    productName: string;
    buyerName?: string;
    buyerEmail?: string;
    buyerPhone?: string;
    paymentMethod?: string;
    quota?: number;
  }): Promise<string> {
    const {
      orderNumber,
      amount,
      productName,
      buyerName = "고객",
      buyerEmail = "customer@teamplus.com",
      buyerPhone = "010-0000-0000",
      paymentMethod = "card",
      quota = 0,
    } = params;

    this.logger.log(
      `결제 요청 생성: 주문번호=${orderNumber}, 금액=${amount}, 상품=${productName}`,
    );

    // 프론트 UI값 → KG이니시스 공식 paymethod 변환.
    // [리팩토링 2026-05-18] 인라인 매핑 제거 → 단일 상수
    //   src/payments/constants/payment-method.constant.ts (PAYMENT_METHODS) 참조.
    //   미정의 코드는 안전 fallback "Card" (라우팅 사고 방지).
    const kgPaymethod = getKgPaymethod(paymentMethod);

    // 결제 데이터 서명 생성
    const timestamp = Date.now().toString();
    const signature = this.generateSignature({
      orderNumber,
      amount: amount.toString(),
      timestamp,
    });

    // 결제 모드에 따른 엔드포인트 선택
    const endpoints = this.config.endpoints[this.config.inicis.mode];
    const baseUrl = endpoints.mobile;

    // 결제 요청 파라미터
    const paymentParams = new URLSearchParams({
      version: this.config.inicis.apiVersion,
      mid: this.config.inicis.storeId,
      oid: orderNumber,
      price: amount.toString(),
      currency: this.config.options.currency,
      goodname: productName,
      buyername: buyerName,
      buyeremail: buyerEmail,
      buyertel: buyerPhone,
      paymethod: kgPaymethod,
      quotabase: quota > 0 ? quota.toString() : this.config.options.quotabase,
      returnUrl: this.config.webhook.returnUrl,
      closeUrl: this.config.webhook.webhookUrl,
      timestamp,
      signature,
      charset: "UTF-8",
    });

    const paymentUrl = `${baseUrl}?${paymentParams.toString()}`;

    this.logger.debug(`결제 URL 생성 완료: ${paymentUrl.substring(0, 100)}...`);

    return paymentUrl;
  }

  /**
   * 결제 승인 처리
   *
   * KG이니시스로부터 받은 승인 데이터를 검증하고 최종 승인 요청을 보냅니다.
   *
   * @param tid - KG이니시스 거래 ID
   * @param authCode - 승인번호
   * @param amount - 결제 금액
   * @param orderNumber - 주문번호
   * @returns 승인 결과
   */
  async approvePayment(params: {
    tid: string;
    authCode: string;
    amount: number;
    orderNumber: string;
  }): Promise<{
    success: boolean;
    tid: string;
    authCode: string;
    authDate: string;
    cardCode?: string;
    cardName?: string;
    quota?: number;
    message?: string;
  }> {
    const { tid, authCode, amount, orderNumber } = params;

    this.logger.log(
      `결제 승인 요청: TID=${tid}, 승인번호=${authCode}, 주문번호=${orderNumber}`,
    );

    try {
      // 결제 모드에 따른 엔드포인트 선택
      const endpoints = this.config.endpoints[this.config.inicis.mode];
      const approvalUrl = endpoints.approval;

      // 승인 요청 데이터
      const approvalData: Record<string, string> = {
        mid: this.config.inicis.storeId,
        tid,
        authCode,
        oid: orderNumber,
        price: amount.toString(),
        timestamp: Date.now().toString(),
      };

      // 서명 생성
      approvalData.signature = this.generateSignature({
        tid,
        authCode,
        amount: amount.toString(),
        timestamp: approvalData.timestamp,
      });

      // 승인 요청
      const response = await this.httpClient.post(
        approvalUrl,
        new URLSearchParams(approvalData as any).toString(),
      );

      const result = response.data;

      // 응답 코드 확인 (0000: 성공)
      if (result.resultCode === "0000") {
        this.logger.log(`결제 승인 성공: TID=${tid}, 승인번호=${authCode}`);

        return {
          success: true,
          tid: result.tid,
          authCode: result.authCode,
          authDate: result.authDate,
          cardCode: result.cardCode,
          cardName: result.cardName,
          quota: result.quota ? parseInt(result.quota, 10) : 0,
          message: result.resultMsg || "정상처리",
        };
      } else {
        this.logger.warn(
          `결제 승인 실패: TID=${tid}, 코드=${result.resultCode}, 메시지=${result.resultMsg}`,
        );

        return {
          success: false,
          tid: result.tid,
          authCode: authCode,
          authDate: "",
          message: result.resultMsg || "승인 실패",
        };
      }
    } catch (error) {
      this.logger.error(
        `결제 승인 중 오류 발생: ${error.message}`,
        error.stack,
      );

      throw new InternalServerErrorException(
        "결제 승인 처리 중 오류가 발생했습니다.",
      );
    }
  }

  /**
   * 결제 취소 처리
   *
   * 전액 또는 부분 취소를 처리합니다.
   *
   * @param tid - KG이니시스 거래 ID
   * @param cancelAmount - 취소 금액 (미입력 시 전액)
   * @param cancelReason - 취소 사유
   * @param totalAmount - 원 결제 금액
   * @returns 취소 결과
   */
  async cancelPayment(params: {
    tid: string;
    cancelAmount?: number;
    cancelReason: string;
    totalAmount: number;
    refundBankCode?: string;
    refundAccount?: string;
    refundAccountHolder?: string;
  }): Promise<{
    success: boolean;
    tid: string;
    cancelledAmount: number;
    remainingAmount: number;
    message?: string;
  }> {
    const {
      tid,
      cancelAmount,
      cancelReason,
      totalAmount,
      refundBankCode,
      refundAccount,
      refundAccountHolder,
    } = params;

    const finalCancelAmount = cancelAmount || totalAmount;

    this.logger.log(
      `결제 취소 요청: TID=${tid}, 취소금액=${finalCancelAmount}, 사유=${cancelReason}`,
    );

    // 취소 금액 검증
    if (finalCancelAmount > totalAmount) {
      throw new BadRequestException(
        "취소 금액이 결제 금액을 초과할 수 없습니다.",
      );
    }

    try {
      // 결제 모드에 따른 엔드포인트 선택
      const endpoints = this.config.endpoints[this.config.inicis.mode];
      const cancelUrl = endpoints.cancel;

      // 취소 요청 데이터
      const cancelData: any = {
        mid: this.config.inicis.storeId,
        tid,
        cancelAmount: finalCancelAmount.toString(),
        cancelReason,
        timestamp: Date.now().toString(),
      };

      // 가상계좌 환불 정보 (선택적)
      if (refundBankCode && refundAccount && refundAccountHolder) {
        cancelData.refundBankCode = refundBankCode;
        cancelData.refundAccount = refundAccount;
        cancelData.refundAccountHolder = refundAccountHolder;
      }

      // 서명 생성
      cancelData.signature = this.generateSignature({
        tid,
        cancelAmount: finalCancelAmount.toString(),
        timestamp: cancelData.timestamp,
      });

      // 취소 요청
      const response = await this.httpClient.post(
        cancelUrl,
        new URLSearchParams(cancelData).toString(),
      );

      const result = response.data;

      // 응답 코드 확인 (0000: 성공)
      if (result.resultCode === "0000") {
        this.logger.log(
          `결제 취소 성공: TID=${tid}, 취소금액=${finalCancelAmount}`,
        );

        return {
          success: true,
          tid: result.tid,
          cancelledAmount: finalCancelAmount,
          remainingAmount: totalAmount - finalCancelAmount,
          message: result.resultMsg || "정상처리",
        };
      } else {
        this.logger.warn(
          `결제 취소 실패: TID=${tid}, 코드=${result.resultCode}, 메시지=${result.resultMsg}`,
        );

        return {
          success: false,
          tid: result.tid,
          cancelledAmount: 0,
          remainingAmount: totalAmount,
          message: result.resultMsg || "취소 실패",
        };
      }
    } catch (error) {
      this.logger.error(
        `결제 취소 중 오류 발생: ${error.message}`,
        error.stack,
      );

      throw new InternalServerErrorException(
        "결제 취소 처리 중 오류가 발생했습니다.",
      );
    }
  }

  /**
   * 웹훅 서명 검증
   *
   * KG이니시스로부터 받은 웹훅 데이터의 무결성을 검증합니다.
   *
   * @param data - 웹훅 데이터
   * @param signature - 서명 값
   * @returns 검증 결과
   */
  verifyWebhookSignature(
    data: {
      orderNumber: string;
      tid: string;
      amount: number;
      resultCode: string;
    },
    signature: string,
  ): boolean {
    if (!this.config.webhook.verifySignature) {
      const env = (process.env.NODE_ENV ?? "").toLowerCase();
      if (env === "production" || env === "staging") {
        // 운영/스테이징 환경에서는 서명 검증 비활성화 절대 불가 — PCI DSS 위반 방지
        this.logger.error(
          `[SECURITY] 웹훅 서명 검증이 비활성화되어 있습니다. NODE_ENV=${env} 에서는 허용되지 않습니다.`,
        );
        return false;
      }
      this.logger.warn(
        "웹훅 서명 검증이 비활성화되어 있습니다. (개발 환경 한정)",
      );
      return true;
    }

    // 검증용 서명 생성
    const expectedSignature = this.generateWebhookSignature(data);

    const isValid = signature === expectedSignature;

    if (!isValid) {
      this.logger.error(
        `웹훅 서명 검증 실패: 예상=${expectedSignature}, 실제=${signature}`,
      );
    } else {
      this.logger.debug("웹훅 서명 검증 성공");
    }

    return isValid;
  }

  /**
   * 결제 데이터 서명 생성 (HMAC-SHA256)
   *
   * @param data - 서명할 데이터
   * @returns HMAC-SHA256 서명
   */
  private generateSignature(data: Record<string, string>): string {
    // 데이터를 키 순서대로 정렬하여 문자열 생성
    const sortedKeys = Object.keys(data).sort();
    const signatureData = sortedKeys
      .map((key) => `${key}=${data[key]}`)
      .join("&");

    // HMAC-SHA256 서명 생성
    const signature = crypto
      .createHmac("sha256", this.config.inicis.merchantKey)
      .update(signatureData)
      .digest("hex");

    this.logger.debug(`서명 생성: 데이터=${signatureData}, 서명=${signature}`);

    return signature;
  }

  /**
   * 웹훅 서명 생성 (HMAC-SHA256)
   *
   * @param data - 웹훅 데이터
   * @returns HMAC-SHA256 서명
   */
  private generateWebhookSignature(data: {
    orderNumber: string;
    tid: string;
    amount: number;
    resultCode: string;
  }): string {
    const signatureData = `${data.orderNumber}|${data.tid}|${data.amount}|${data.resultCode}`;

    const signature = crypto
      .createHmac("sha256", this.config.security.signatureKey)
      .update(signatureData)
      .digest("hex");

    return signature;
  }

  /**
   * IP 화이트리스트 검증
   *
   * 프로덕션 환경에서 웹훅 요청이 허용된 IP에서 왔는지 확인합니다.
   *
   * @param requestIp - 요청 IP 주소
   * @returns 검증 결과
   */
  verifyIpWhitelist(requestIp: string): boolean {
    // [2026-06-10 SECURITY] IP 검증 스킵은 순수 development/test 에서만 허용.
    //   기존: mode!=="production"(staging 포함) 전부 스킵 → 하드코딩 dev 서명키와 결합 시
    //   staging 에서 웹훅 위조로 무료 크레딧 발급 가능했음. staging 은 production 과 동일하게 강제.
    const env = (process.env.NODE_ENV ?? "").toLowerCase();
    const isProductionLike = env === "production" || env === "staging";
    if (!isProductionLike) {
      return true;
    }

    const whitelist = this.config.security.ipWhitelist;

    // 프로덕션에서 화이트리스트 미설정 시 모든 요청 차단 (보안 강화)
    if (!whitelist || whitelist.length === 0) {
      this.logger.error(
        `[CRITICAL] 프로덕션 환경에서 IP 화이트리스트가 설정되지 않았습니다. ` +
          `모든 웹훅 요청을 차단합니다. 환경변수 확인 필요.`,
      );
      return false;
    }

    const isAllowed = whitelist.includes(requestIp);

    if (!isAllowed) {
      this.logger.error(`허용되지 않은 IP에서 웹훅 요청: ${requestIp}`);
    }

    return isAllowed;
  }

  /**
   * 결제 금액 검증
   *
   * 클라이언트에서 보낸 금액과 서버 DB의 금액이 일치하는지 확인합니다.
   *
   * @param requestAmount - 요청 금액
   * @param expectedAmount - 예상 금액 (DB)
   * @returns 검증 결과
   */
  verifyAmount(requestAmount: number, expectedAmount: number): boolean {
    if (requestAmount !== expectedAmount) {
      this.logger.error(
        `결제 금액 불일치: 요청=${requestAmount}, 예상=${expectedAmount}`,
      );
      return false;
    }

    return true;
  }
}
