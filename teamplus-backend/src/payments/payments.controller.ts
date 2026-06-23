import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
  Ip,
  BadRequestException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import {
  SettlementActionResponseDto,
  SettlementResponseDto,
} from "./dto/responses/settlement-response.dto";
import { ConfirmPostpaidBillingDto } from "./dto/confirm-postpaid-billing.dto";
import { PaymentsService } from "./payments.service";
import { WebhookRetryService } from "./webhook-retry.service";
import { RefundDto } from "./dto/refund.dto";
import {
  InitiatePaymentDto,
  PaymentResultDto,
} from "./dto/initiate-payment.dto";
import {
  VerifyPaymentDto,
  VerifyPaymentResponseDto,
} from "./dto/verify-payment.dto";
import {
  PaymentWebhookDto,
  CancelPaymentDto,
  PaymentStatusDto,
} from "./dto/kg-inicis.dto";
import {
  PaymentPreviewQueryDto,
  PaymentPreviewResponseDto,
} from "./dto/payment-preview.dto";
import { KgInicisGateway } from "./kg-inicis.gateway";
import { TossPaymentsGateway } from "./toss-payments.gateway";
import { Public } from "@/auth/public.decorator";
import { RedisService } from "@/redis/redis.service";
import { AuditAction } from "@/common/decorators";
import { Req, Headers } from "@nestjs/common";
import type { Request as ExpressRequest } from "express";
import { PaymentCalculationService } from "./payment-calculation.service";
import { PostpaidSettlementService } from "./postpaid-settlement.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Payments")
@Controller("api/v1/payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly webhookRetryService: WebhookRetryService,
    private readonly kgInicisGateway: KgInicisGateway,
    private readonly tossGateway: TossPaymentsGateway,
    private readonly calculationService: PaymentCalculationService,
    private readonly postpaidSettlementService: PostpaidSettlementService,
    private readonly redisService: RedisService,
  ) {}

  // ────────────────────────────────────────────────────────────────────
  //   토스페이먼츠 (2026-05-13 신규)
  //   KG이니시스와 병행 운영. PAYMENT_PROVIDER 환경변수로 스위칭.
  // ────────────────────────────────────────────────────────────────────

  /**
   * [공개] 토스 결제 위젯 초기화용 클라이언트키 반환.
   *  클라이언트키는 공개 정보(브라우저에 노출 가능), 시크릿키는 절대 노출 금지.
   */
  @Get("toss/client-key")
  @Public()
  @ApiOperation({ summary: "토스페이먼츠 클라이언트키 조회" })
  async getTossClientKey() {
    return { clientKey: this.tossGateway.getClientKey() };
  }

  /**
   * 토스 결제 승인 — Frontend successUrl 콜백 후 호출.
   *  body: { paymentKey, orderId, amount }
   *  멱등성: orderId(= Payment.orderNumber) 중복 confirm 차단.
   */
  @Post("toss/confirm")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "토스 결제 승인",
    description:
      "토스 위젯 결제 완료 후 paymentKey/orderId/amount 로 백엔드가 토스 승인 API를 호출합니다.",
  })
  async confirmTossPayment(
    @Request() req: AuthenticatedRequest,
    @Body() body: { paymentKey: string; orderId: string; amount: number },
  ) {
    const userId = req.user.id;
    return this.paymentsService.confirmTossPayment(userId, body);
  }

  /**
   * [Phase B-3] 후불(모드 A POSTPAID) 정산 초안 조회 — 수업×월 회원별 출석×단가 미리보기(미저장).
   */
  @Get("postpaid/draft")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiOperation({
    summary: "후불 정산 초안 조회",
    description: "수업×월 회원별 출석×단가 미리보기 (감독 검수용, 미저장).",
  })
  async getPostpaidDraft(@Query() query: ConfirmPostpaidBillingDto) {
    return this.postpaidSettlementService.getDraft(
      query.classId,
      query.yearMonth,
    );
  }

  /**
   * [Phase B-3] 후불 정산 확정 — 감독 검수 후 회원별 pending 결제 생성 + 청구 알림. 멱등(재확정 차단).
   */
  @Post("postpaid/confirm")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "후불 정산 확정 (결제 요청)",
    description:
      "감독 검수 후 회원별 pending 결제를 일괄 생성하고 청구 알림을 발송합니다. 이미 확정된 정산은 거부됩니다.",
  })
  async confirmPostpaidSettlement(
    @Request() req: AuthenticatedRequest,
    @Body() body: ConfirmPostpaidBillingDto,
  ) {
    return this.postpaidSettlementService.confirmSettlement(
      body.classId,
      body.yearMonth,
      req.user.id,
    );
  }

  /**
   * [Phase B-5-4] 내 미납 후불 청구 목록 — 학부모가 확정된 후불 결제를 진행.
   */
  @Get("postpaid/my-pending")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT")
  @ApiOperation({
    summary: "내 미납 후불 청구 목록",
    description: "확정된 후불 정산 중 결제 대기(pending) 항목을 반환합니다.",
  })
  async getMyPendingPostpaid(@Request() req: AuthenticatedRequest) {
    return this.postpaidSettlementService.getMyPendingBillings(req.user.id);
  }

  /**
   * 토스 결제 Webhook — 결제 상태 변경 알림.
   *  헤더 X-TossPayments-Signature 의 HMAC-SHA256 (TOSS_WEBHOOK_SECRET) 검증 후 처리.
   */
  @Post("toss/webhook")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "토스 webhook 수신" })
  async tossWebhook(
    @Req() req: ExpressRequest,
    @Headers("x-tosspayments-signature") signature: string,
    @Body()
    body: {
      eventType?: string;
      data?: { paymentKey?: string; orderId?: string; status?: string };
    },
  ) {
    const raw =
      (req as ExpressRequest & { rawBody?: Buffer }).rawBody?.toString(
        "utf8",
      ) ?? JSON.stringify(body);
    const ok = this.tossGateway.verifyWebhookSignature(raw, signature ?? "");
    if (!ok) {
      this.logger.warn(
        `토스 webhook 서명 검증 실패 — 무시 (eventType=${body.eventType})`,
      );
      // 200 OK 로 응답 (토스가 재시도하지 않도록), 단 처리는 하지 않음
      return { received: true, verified: false };
    }
    // 결제 상태 동기화는 service 위임 (실패해도 200 응답 유지하여 토스 재시도 폭주 방지)
    try {
      await this.paymentsService.handleTossWebhook(body);
    } catch (e) {
      this.logger.error(
        `토스 webhook 처리 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return { received: true, verified: true };
  }

  /**
   * 결제 시작 (KG이니시스 결제 페이지 URL 반환)
   */
  @Post("initiate")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "결제 시작",
    description: "KG이니시스 결제를 시작하고 결제 페이지 URL을 반환합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "결제 시작 성공",
    type: PaymentResultDto,
    schema: {
      example: {
        id: "payment-uuid",
        orderNumber: "ORD-1704355200000-abc123",
        amount: 240000,
        paymentStatus: "pending",
        productId: "product-uuid",
        paymentPageUrl: "https://stdpay.inicis.com/stdpay/INIpayMobile.php?...",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "상품을 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 400,
    description: "결제 금액이 상품 가격과 일치하지 않습니다.",
  })
  async initiatePayment(
    @Request() req: AuthenticatedRequest,
    @Body() initiatePaymentDto: InitiatePaymentDto,
  ): Promise<PaymentResultDto> {
    this.logger.log(
      `결제 시작 요청: userId=${req.user.id}, productId=${initiatePaymentDto.productId}`,
    );

    return this.paymentsService.initiatePayment(
      req.user.id,
      initiatePaymentDto.productId,
      initiatePaymentDto.amount,
      {
        paymentMethod: initiatePaymentDto.paymentMethod,
        quota: initiatePaymentDto.quota,
        buyerName: initiatePaymentDto.buyerName,
        buyerEmail: initiatePaymentDto.buyerEmail,
        buyerPhone: initiatePaymentDto.buyerPhone,
        classId: initiatePaymentDto.classId,
        childId: initiatePaymentDto.childId,
      },
    );
  }

  /**
   * 결제 완료 확인 (결제 완료 페이지에서 호출)
   *
   * 프론트의 /payment/complete 페이지 진입 시 호출되어
   * 결제 상태, 영수증, 발급 크레딧을 반환.
   */
  @Post("verify")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "결제 완료 확인",
    description:
      "결제 완료 페이지에서 orderNumber로 결제 상태·영수증·발급 크레딧을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "결제 완료 확인 성공",
    type: VerifyPaymentResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "결제 기록을 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 409,
    description: "결제가 아직 처리 중입니다.",
  })
  async verifyPayment(
    @Request() req: AuthenticatedRequest,
    @Body() dto: VerifyPaymentDto,
  ): Promise<VerifyPaymentResponseDto> {
    return this.paymentsService.verifyPayment(req.user.id, dto.orderNumber);
  }

  /**
   * 결제 완료 처리 (KG이니시스 웹훅)
   *
   * 인증 불필요 (KG이니시스 서버에서 호출)
   * IP 화이트리스트 및 서명 검증으로 보안 유지
   * 웹훅 로깅 + 자동 재시도 포함
   */
  @Post("webhook")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "결제 완료 웹훅",
    description:
      "KG이니시스에서 결제 완료 시 호출하는 웹훅입니다. (IP 화이트리스트 + HMAC-SHA256 서명 검증, 실패 시 자동 재시도)",
  })
  @ApiResponse({
    status: 200,
    description: "결제 처리 성공",
    type: PaymentResultDto,
  })
  @ApiResponse({
    status: 400,
    description: "웹훅 서명이 유효하지 않거나 페이로드 오류.",
  })
  @ApiResponse({
    status: 403,
    description: "IP 주소가 화이트리스트에 없습니다.",
  })
  async completePayment(
    @Body() webhookDto: PaymentWebhookDto,
    @Ip() requestIp: string,
  ): Promise<PaymentResultDto> {
    this.logger.log(
      `결제 웹훅 수신: orderNumber=${webhookDto.orderNumber}, tid=${webhookDto.tid}, IP=${requestIp}`,
    );

    // IP 화이트리스트 검증 (1차 방어)
    if (!this.kgInicisGateway.verifyIpWhitelist(requestIp)) {
      this.logger.error(`허용되지 않은 IP에서 웹훅 요청: ${requestIp}`);
      throw new BadRequestException("허용되지 않은 IP 주소입니다.");
    }

    // [2026-05-13 Phase A-4] HMAC-SHA256 서명 검증 (2차 방어)
    //   IP 만으로는 변조된 payload 를 막을 수 없다. KG이니시스가 헤더로 서명을 전달하는
    //   원본 표준은 verifyWebhookSignature 가 본문 4필드 기반으로 자체 재계산 → 비교.
    //   서명이 비활성화 설정(verifySignature=false) 인 경우 gateway 내부에서 통과 처리.
    if (
      !this.kgInicisGateway.verifyWebhookSignature(
        {
          orderNumber: webhookDto.orderNumber,
          tid: webhookDto.tid,
          amount: webhookDto.amount,
          resultCode: webhookDto.resultCode,
        },
        webhookDto.signature ?? "",
      )
    ) {
      this.logger.error(
        `웹훅 서명 검증 실패: orderNumber=${webhookDto.orderNumber}`,
      );
      throw new BadRequestException("웹훅 서명이 유효하지 않습니다.");
    }

    // [2026-05-13 Phase D-8] orderNumber 24h 멱등성 락 (Toss 패턴 차용).
    //   동일 orderNumber 로 중복 webhook 도착 시 두 번째부터 200 OK 즉시 반환하여
    //   KG이니시스 재시도 흐름을 멈추되, 내부 DB 갱신은 1회만 수행한다.
    //   락 실패(이미 처리됨) 케이스는 첫 번째 호출의 결과를 그대로 200 으로 보고.
    const lockKey = `kginicis:webhook:${webhookDto.orderNumber}`;
    const lockTtl = 24 * 60 * 60;
    const acquired = await this.redisService.setIfNotExists(
      lockKey,
      webhookDto.tid ?? "1",
      lockTtl,
    );
    if (!acquired) {
      this.logger.log(
        `중복 KG 웹훅 차단 (idempotent): orderNumber=${webhookDto.orderNumber}`,
      );
      return {
        id: "duplicate",
        orderNumber: webhookDto.orderNumber,
        amount: webhookDto.amount,
        paymentStatus: "completed",
      };
    }

    // 웹훅 로그 기록
    const webhookId = await this.webhookRetryService.logWebhook({
      orderNumber: webhookDto.orderNumber,
      tid: webhookDto.tid,
      resultCode: webhookDto.resultCode,
      amount: webhookDto.amount,
      authCode: webhookDto.authCode,
      signature: webhookDto.signature,
    });

    // 웹훅 처리 시도 (실패 시 자동 재시도 스케줄링)
    const processResult =
      await this.webhookRetryService.processWebhook(webhookId);

    if (processResult.success && processResult.result) {
      return {
        ...processResult.result,
        tid: processResult.result.tid ?? undefined,
        completedAt: processResult.result.completedAt ?? undefined,
      };
    }

    // 처리 실패 시에도 KG이니시스에는 200 응답 (재시도로 처리 예정)
    // KG이니시스가 중복 웹훅을 보내지 않도록 OK 반환
    this.logger.warn(
      `웹훅 즉시 처리 실패, 재시도 예정: webhookId=${webhookId}, error=${processResult.error}`,
    );

    return {
      id: webhookId,
      orderNumber: webhookDto.orderNumber,
      amount: webhookDto.amount,
      paymentStatus: "pending",
    };
  }

  /**
   * 관리자: 실패한 웹훅 목록 조회
   */
  @Get("admin/webhooks")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @ApiOperation({
    summary: "웹훅 목록 조회 (관리자)",
    description: "결제 웹훅 목록을 상태별로 조회합니다. (관리자 전용)",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "웹훅 상태 (pending|success|failed|retrying)",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "페이지 번호 (기본: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "페이지당 항목 수 (기본: 20)",
  })
  @ApiResponse({
    status: 200,
    description: "웹훅 목록 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "webhook-uuid",
            paymentId: null,
            webhookType: "kg_inicis",
            orderNumber: "ORD-1704355200000-abc123",
            status: "failed",
            retryCount: 3,
            maxRetries: 3,
            lastError: "결제 기록을 찾을 수 없습니다.",
            verified: false,
            processedAt: "2026-03-07T10:00:00Z",
            completedAt: null,
            nextRetryAt: null,
          },
        ],
        pagination: { total: 5, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  async getAdminWebhooks(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.webhookRetryService.getFailedWebhooks({
      status: status || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * 관리자: 웹훅 수동 재시도
   */
  @Post("admin/webhook/:webhookId/retry")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "웹훅 수동 재시도 (관리자)",
    description: "실패한 결제 웹훅을 수동으로 재시도합니다. (관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "웹훅 재시도 결과",
    schema: {
      example: {
        success: true,
        result: {
          id: "payment-uuid",
          orderNumber: "ORD-1704355200000-abc123",
          amount: 240000,
          paymentStatus: "completed",
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "웹훅 기록을 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 400,
    description: "이미 성공 처리된 웹훅입니다.",
  })
  async retryWebhook(@Param("webhookId") webhookId: string) {
    this.logger.log(`관리자 웹훅 수동 재시도: webhookId=${webhookId}`);
    return this.webhookRetryService.retryWebhook(webhookId);
  }

  /**
   * 관리자: 웹훅 통계 조회
   */
  @Get("admin/webhooks/stats")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @ApiOperation({
    summary: "웹훅 통계 조회 (관리자)",
    description: "결제 웹훅 처리 통계를 조회합니다. (관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "웹훅 통계 조회 성공",
    schema: {
      example: {
        total: 100,
        pending: 2,
        success: 90,
        failed: 5,
        retrying: 3,
      },
    },
  })
  async getWebhookStats() {
    return this.webhookRetryService.getWebhookStats();
  }

  /**
   * 결제 취소 (KG이니시스 취소 API 호출)
   */
  @Post(":paymentId/cancel")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "ADMIN")
  @AuditAction({
    action: "payment.cancel",
    resource: "Payment",
    includeKeys: ["paymentId", "cancelReason", "cancelAmount"],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "결제 취소",
    description:
      "KG이니시스를 통해 결제를 취소합니다. (전액 또는 부분 취소 가능)",
  })
  @ApiResponse({
    status: 200,
    description: "결제 취소 성공",
    schema: {
      example: {
        id: "refund-uuid",
        paymentId: "payment-uuid",
        refundAmount: 240000,
        refundReason: "고객 요청",
        paymentStatus: "refunded",
        processedAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "결제 취소 요청이 유효하지 않습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "결제 기록을 찾을 수 없습니다.",
  })
  async cancelPayment(
    @Request() req: AuthenticatedRequest,
    @Param("paymentId") paymentId: string,
    @Body() cancelDto: CancelPaymentDto,
  ) {
    this.logger.log(
      `결제 취소 요청: paymentId=${paymentId}, 사유=${cancelDto.cancelReason}`,
    );

    return this.paymentsService.cancelPayment(
      paymentId,
      cancelDto.cancelReason,
      cancelDto.cancelAmount,
      cancelDto.refundBankCode,
      cancelDto.refundAccount,
      cancelDto.refundAccountHolder,
      { id: req.user.id, userType: req.user.userType },
    );
  }

  /**
   * 결제 상태 조회
   */
  @Get(":paymentId/status")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiOperation({
    summary: "결제 상태 조회",
    description: "특정 결제의 현재 상태를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "결제 상태 조회 성공",
    type: PaymentStatusDto,
  })
  @ApiResponse({
    status: 404,
    description: "결제 기록을 찾을 수 없습니다.",
  })
  async getPaymentStatus(
    @Request() req: AuthenticatedRequest,
    @Param("paymentId") paymentId: string,
  ): Promise<PaymentStatusDto> {
    const payment = await this.paymentsService.getPayment(
      paymentId,
      req.user.id,
      req.user.userType,
    );
    return {
      ...payment,
      paymentMethod: payment.paymentMethod ?? undefined,
      tid: payment.tid ?? undefined,
      completedAt: payment.completedAt ?? undefined,
      product: payment.product ?? undefined,
    };
  }

  /**
   * 내 결제 이력 조회 (alias for user/history)
   * [수정 2026-05-13] 라우트 매칭 우선순위 — `:paymentId` 보다 위에 위치해야
   *   `/payments/my` 가 `:paymentId="my"` 로 잘못 매칭되어 404 떨어지는 문제 차단.
   */
  @Get("my")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "내 결제 이력 조회",
    description: "현재 로그인한 사용자의 결제 이력을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "결제 이력 조회 성공",
  })
  async getMyPayments(
    @Request() req: AuthenticatedRequest,
    @Query("page") _page?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.paymentsService.getUserPayments(req.user.id, parsedLimit);
  }

  /**
   * 결제 상세 조회
   */
  @Get(":paymentId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH")
  @ApiOperation({
    summary: "결제 상세 조회",
    description: "특정 결제의 상세 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "결제 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "결제 기록을 찾을 수 없습니다.",
  })
  async getPayment(
    @Request() req: AuthenticatedRequest,
    @Param("paymentId") paymentId: string,
  ) {
    return this.paymentsService.getPayment(
      paymentId,
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 사용자의 결제 이력 조회
   */
  @Get("user/history")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "ADMIN")
  @ApiOperation({
    summary: "결제 이력 조회",
    description: "사용자의 결제 이력을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "결제 이력 조회 성공",
  })
  async getUserPayments(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.paymentsService.getUserPayments(req.user.id, parsedLimit);
  }

  /**
   * 환불 요청
   */
  @Post(":paymentId/refund")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "환불 요청",
    description: "결제된 금액을 환불 요청합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "환불 요청 성공",
    schema: {
      example: {
        id: "refund-uuid",
        paymentId: "payment-uuid",
        refundAmount: 240000,
        refundReason: "고객 요청",
        paymentStatus: "refunded",
        processedAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "환불할 수 없는 결제입니다.",
  })
  @ApiResponse({
    status: 404,
    description: "결제 기록을 찾을 수 없습니다.",
  })
  async requestRefund(
    @Request() req: AuthenticatedRequest,
    @Param("paymentId") paymentId: string,
    @Body() refundDto: RefundDto,
  ) {
    return this.paymentsService.requestRefund(
      paymentId,
      refundDto.refundReason,
      refundDto.refundAmount,
      { id: req.user.id, userType: req.user.userType },
    );
  }

  /**
   * 환불 이력 조회
   */
  @Get(":paymentId/refunds")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiOperation({
    summary: "환불 이력 조회",
    description: "특정 결제의 환불 이력을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "환불 이력 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "환불 기록이 없습니다.",
  })
  async getRefundLogs(
    @Request() req: AuthenticatedRequest,
    @Param("paymentId") paymentId: string,
  ) {
    return this.paymentsService.getRefundLogs(paymentId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 결제 통계 (전체 또는 사용자별)
   */
  @Get("stats/overview")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "COACH")
  @ApiOperation({
    summary: "결제 통계",
    description: "전체 또는 사용자별 결제 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "결제 통계 조회 성공",
    schema: {
      example: {
        totalPayments: 100,
        completedCount: 95,
        failedCount: 3,
        refundedCount: 2,
        totalRevenue: 22800000,
        totalRefunded: 480000,
        netRevenue: 22320000,
        successRate: "95.0",
      },
    },
  })
  async getPaymentStats(@Query("userId") userId?: string) {
    return this.paymentsService.getPaymentStats(userId);
  }

  /**
   * 기간별 결제 통계
   */
  @Get("stats/date-range")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "COACH")
  @ApiOperation({
    summary: "기간별 결제 통계",
    description: "특정 기간의 결제 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "기간별 결제 통계 조회 성공",
  })
  async getPaymentStatsByDateRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.paymentsService.getPaymentStatsByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * 클럽 결제 이력 조회 (감독용)
   */
  @Get("club/:teamId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "클럽 결제 이력 조회",
    description: "클럽 회원들의 결제 이력을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "클럽 결제 이력 조회 성공",
  })
  async getClubPayments(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.paymentsService.getClubPayments(
      req.user.id,
      teamId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * 회원별 결제 이력 조회
   */
  @Get("member/:memberId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiOperation({
    summary: "회원별 결제 이력 조회",
    description: "특정 회원의 결제 이력을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "회원 결제 이력 조회 성공",
  })
  async getMemberPayments(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.paymentsService.getMemberPayments(memberId, parsedLimit, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 관리자 전체 결제 목록 조회
   */
  @Get("admin/list")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "관리자 전체 결제 목록",
    description:
      "전체 결제 목록을 검색/필터링/페이지네이션으로 조회합니다. (관리자 전용)",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "주문번호 또는 이메일 검색",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description:
      "결제 상태 (pending|completed|failed|refunded|partially_refunded)",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "시작일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "종료일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "페이지 번호 (기본: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "페이지당 항목 수 (기본: 20)",
  })
  @ApiResponse({
    status: 200,
    description: "결제 목록 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "payment-uuid",
            orderNumber: "ORD-1704355200000-abc123",
            amount: 240000,
            paymentStatus: "completed",
            paymentMethod: "card",
            tid: "StdpayIframe001",
            userId: "user-uuid",
            userEmail: "parent@teamplus.com",
            userPhone: "010-1234-5678",
            productName: "월 8회 수강권",
            createdAt: "2026-03-07T10:00:00Z",
            completedAt: "2026-03-07T10:01:00Z",
          },
        ],
        pagination: {
          total: 500,
          page: 1,
          limit: 20,
          totalPages: 25,
        },
      },
    },
  })
  async getAdminPaymentList(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.paymentsService.getAdminPaymentList({
      search,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * 관리자 결제 통계 조회
   */
  @Get("admin/stats")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "관리자 결제 통계",
    description:
      "전체 결제 통계를 조회합니다. 날짜 범위 필터를 지원합니다. (관리자/감독 전용)",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "시작일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "종료일 (YYYY-MM-DD)",
  })
  @ApiResponse({
    status: 200,
    description: "결제 통계 조회 성공",
    schema: {
      example: {
        totalPayments: 500,
        completedCount: 450,
        failedCount: 20,
        refundedCount: 30,
        totalRevenue: 108000000,
        totalRefunded: 7200000,
        netRevenue: 100800000,
        successRate: "90.0",
      },
    },
  })
  async getAdminPaymentStats(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.paymentsService.getAdminPaymentStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  /**
   * 클럽 결제 통계 조회
   */
  @Get("stats/club/:teamId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "클럽 결제 통계",
    description: "클럽의 결제 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "클럽 결제 통계 조회 성공",
  })
  async getClubPaymentStats(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.paymentsService.getClubPaymentStats(
      req.user.id,
      teamId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * 결제 금액 미리보기 (feeType별 금액 계산)
   * GET /api/v1/payments/preview?productId=...&attendanceCount=5
   */
  @Get("preview")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiOperation({
    summary: "결제 금액 미리보기",
    description:
      "수업 상품의 feeType(월정액/횟수제/경기당)과 billingTiming(선결제/후결제)에 따라 예상 결제 금액을 반환합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "결제 금액 미리보기 성공",
    type: PaymentPreviewResponseDto,
    schema: {
      example: {
        feeType: "MONTHLY_FIXED",
        billingTiming: "PREPAID",
        amount: 280000,
        description: "월정액 (주1회 × 70000원 × 4주)",
      },
    },
  })
  @ApiQuery({ name: "productId", required: true, description: "수업 상품 ID" })
  @ApiQuery({
    name: "attendanceCount",
    required: false,
    type: Number,
    description: "실제 출석 횟수 (횟수제 후결제 조회 시)",
  })
  async getPaymentPreview(
    @Query() query: PaymentPreviewQueryDto,
  ): Promise<PaymentPreviewResponseDto> {
    const product = await this.paymentsService.getClassProduct(query.productId);

    const result = this.calculationService.calculatePrepaidFee(product);

    let attendanceCount: number | undefined;
    let finalAmount = result.baseAmount.toNumber();

    if (
      product.billingTiming === "POSTPAID" &&
      query.attendanceCount !== undefined
    ) {
      attendanceCount = query.attendanceCount;
      const perSessionResult = this.calculationService.calculatePerSessionFee(
        { feePerSession: product.feePerSession },
        attendanceCount,
      );
      finalAmount = perSessionResult.toNumber();
    }

    return {
      feeType: result.feeType,
      billingTiming: result.billingTiming,
      amount: finalAmount,
      description: result.description,
      attendanceCount,
    };
  }

  /**
   * 후결제 정산 내역 조회
   * GET /api/v1/payments/postpaid/summary?month=2026-02
   */
  @Get("postpaid/summary")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "후결제 정산 내역 조회",
    description: "특정 월의 후결제 정산 대상 및 금액 내역을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "후결제 정산 내역 조회 성공",
    schema: {
      example: [
        {
          classId: "class-uuid",
          className: "U10 정규 수업",
          userId: "user-uuid",
          userEmail: "parent@teamplus.com",
          attendanceCount: 4,
          amount: 280000,
          month: "2026-02",
          status: "processed",
        },
      ],
    },
  })
  @ApiQuery({
    name: "month",
    required: true,
    description: "조회할 월 (YYYY-MM 형식)",
    example: "2026-02",
  })
  @ApiQuery({
    name: "classId",
    required: false,
    description: "특정 수업 ID로 필터링",
  })
  async getPostpaidSummary(
    @Query("month") month: string,
    @Query("classId") classId?: string,
  ) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException(
        "month는 YYYY-MM 형식으로 입력해주세요. (예: 2026-02)",
      );
    }
    const [year, mon] = month.split("-").map(Number);
    const monthDate = new Date(year, mon - 1, 1);
    return this.postpaidSettlementService.getPostpaidSummary(
      monthDate,
      classId,
    );
  }

  /**
   * 후결제 수동 정산 처리
   * POST /api/v1/payments/postpaid/process
   */
  @Post("postpaid/process")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "후결제 수동 정산",
    description: "특정 월의 후결제를 수동으로 정산합니다. (관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "후결제 정산 처리 성공",
  })
  async processPostpaidSettlement(@Body("month") month: string) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException(
        "month는 YYYY-MM 형식으로 입력해주세요. (예: 2026-02)",
      );
    }
    const [year, mon] = month.split("-").map(Number);
    const monthDate = new Date(year, mon - 1, 1);
    const results =
      await this.postpaidSettlementService.processSettlementForMonth(monthDate);
    return {
      message: `${month} 후결제 정산이 완료되었습니다.`,
      processedCount: results.length,
      results,
    };
  }

  // ==================== 정산 관리 ====================

  /**
   * [신규 2026-05-14] 정산 개요 — admin 정산관리 "수업 결제 정산" 탭.
   *   전체 활성 팀 → 수업 → 학생 결제 상태를 집계하여
   *   팀별 + 전체 합계의 결제완료/미납 금액·인원 통계를 반환한다.
   *   ⚠️ 라우트 매칭: static path 라 `settlements/:id` 와 충돌 없음.
   */
  @Get("admin/settlement-overview")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @ApiOperation({
    summary: "정산 개요 (수업 결제 정산)",
    description:
      "전체 활성 팀의 수업 결제완료/미납 금액·인원을 팀별 + 전체 합계로 집계합니다. (관리자 전용)",
  })
  async getSettlementOverview() {
    return this.paymentsService.getSettlementOverview();
  }

  /**
   * 정산 목록 조회
   */
  @Get("settlements")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @ApiOperation({
    summary: "정산 목록 조회",
    description:
      "정산 목록을 검색/필터/페이지네이션으로 조회합니다. (관리자 전용)",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "클럽명 검색",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "정산 상태 (pending|approved|processing|completed|failed)",
  })
  @ApiQuery({
    name: "month",
    required: false,
    description: "정산 월 (YYYY-MM)",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: "정산 목록 조회 성공",
  })
  async getSettlements(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("month") month?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.paymentsService.getSettlementList({
      search,
      status,
      month,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * 정산 상세 조회
   */
  @Get("settlements/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @ApiOperation({
    summary: "정산 상세 조회",
    description:
      "특정 정산 내역의 상세 정보를 조회합니다. (관리자 전용 · over-fetching 제거 적용)",
  })
  @ApiOkResponse({
    description: "정산 상세 조회 성공",
    type: SettlementResponseDto,
  })
  @ApiResponse({ status: 404, description: "정산 내역을 찾을 수 없습니다." })
  async getSettlementDetail(@Param("id") id: string) {
    return this.paymentsService.getSettlementDetail(id);
  }

  /**
   * 정산 승인 (pending → approved)
   */
  @Patch("settlements/:id/approve")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "정산 승인",
    description:
      "대기 중인 정산을 승인합니다. (관리자 전용, pending → approved)",
  })
  @ApiOkResponse({
    description: "정산 승인 성공",
    type: SettlementActionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "대기 중인 정산만 승인 가능합니다.",
  })
  @ApiResponse({ status: 404, description: "정산 내역을 찾을 수 없습니다." })
  async approveSettlement(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.approveSettlement(id, req.user.id);
  }

  /**
   * 정산 지급 완료 (approved → completed)
   */
  @Patch("settlements/:id/complete")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "정산 지급 완료",
    description:
      "승인된 정산의 지급을 완료 처리합니다. (관리자 전용, approved → completed)",
  })
  @ApiOkResponse({
    description: "정산 지급 완료 성공",
    type: SettlementActionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "승인된 정산만 지급 완료 가능합니다.",
  })
  @ApiResponse({ status: 404, description: "정산 내역을 찾을 수 없습니다." })
  async completeSettlement(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.completeSettlement(id, req.user.id);
  }

  // ==================== feeType별 금액 계산 ====================

  /**
   * feeType별 결제 금액 계산
   */
  @Get("calculate-fee")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiOperation({
    summary: "feeType별 결제 금액 계산",
    description:
      "수업의 feeType(월정액/횟수제/경기당)에 따라 결제 금액을 계산합니다.",
  })
  @ApiQuery({ name: "classId", required: true, description: "수업 ID" })
  @ApiQuery({
    name: "feeType",
    required: true,
    description: "결제 방식 (MONTHLY_FIXED|PER_SESSION|PER_GAME)",
  })
  @ApiQuery({
    name: "attendanceCount",
    required: false,
    type: Number,
    description: "출석 횟수 (횟수제 후결제 시)",
  })
  @ApiResponse({
    status: 200,
    description: "금액 계산 성공",
    schema: {
      example: {
        amount: 280000,
        description: "월정액 (주1회 × 70000원 × 4주)",
      },
    },
  })
  async calculateFee(
    @Query("classId") classId: string,
    @Query("feeType") feeType: string,
    @Query("attendanceCount") attendanceCount?: string,
  ) {
    return this.paymentsService.calculateFee(
      classId,
      feeType,
      attendanceCount ? parseInt(attendanceCount, 10) : undefined,
    );
  }

  // ==================== 영수증 관리 ====================

  /**
   * 영수증 조회
   */
  @Get("receipts/:paymentId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "영수증 조회",
    description: "영수증 ID로 영수증 상세 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "영수증 조회 성공",
    schema: {
      example: {
        id: "receipt-uuid",
        receiptNumber: "20260412-00001",
        paymentId: "payment-uuid",
        issuedAt: "2026-04-12T10:00:00Z",
        taxable: true,
        taxAmount: 21818,
        payment: {
          id: "payment-uuid",
          orderNumber: "ORD-1704355200000-abc123",
          amount: 240000,
          paymentStatus: "completed",
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "영수증을 찾을 수 없습니다.",
  })
  async getReceipt(
    @Param("paymentId") paymentId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.getReceipt(
      paymentId,
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 영수증 다운로드 URL 조회
   */
  @Get("receipts/:paymentId/download")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "영수증 다운로드 URL 조회",
    description:
      "결제(paymentId)의 토스 호스팅 영수증 URL을 반환합니다. 저장된 URL이 없으면 토스 결제조회로 보충합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "영수증 URL 조회 성공",
    schema: {
      example: {
        downloadUrl: "https://dashboard.tosspayments.com/receipt/redirection?...",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "발급된 영수증 URL이 없습니다.",
  })
  async getReceiptDownloadUrl(
    @Param("paymentId") paymentId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.paymentsService.getReceiptDownloadUrl(
      paymentId,
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 영수증 생성 (결제 완료 후 자동 또는 수동 생성)
   */
  @Post(":paymentId/receipt")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("PARENT", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "영수증 생성",
    description:
      "결제에 대한 영수증을 생성합니다. 이미 영수증이 존재하면 기존 영수증을 반환합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "영수증 생성 성공",
    schema: {
      example: {
        id: "receipt-uuid",
        receiptNumber: "20260412-00001",
        paymentId: "payment-uuid",
        issuedAt: "2026-04-12T10:00:00Z",
        taxable: true,
        taxAmount: 21818,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "결제 기록을 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 400,
    description: "완료된 결제에 대해서만 영수증을 발급할 수 있습니다.",
  })
  async createReceipt(@Param("paymentId") paymentId: string) {
    return this.paymentsService.createReceipt(paymentId);
  }
}
