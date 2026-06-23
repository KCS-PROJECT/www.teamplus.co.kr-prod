import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { PaymentsService } from "./payments.service";

/**
 * Webhook 재처리 서비스
 *
 * 결제 웹훅 실패 시 자동/수동 재시도를 관리합니다.
 * - 자동 재시도: 1분 / 5분 / 15분 간격 (최대 3회)
 * - 수동 재시도: 관리자 API를 통한 개별 재처리
 * - 실패 목록 조회: 상태별 웹훅 필터링
 */
@Injectable()
export class WebhookRetryService {
  private readonly logger = new Logger(WebhookRetryService.name);

  /** 재시도 간격 (초): 1분, 5분, 15분 */
  private readonly RETRY_DELAYS_SEC = [60, 300, 900];

  /** Redis 키 프리픽스 */
  private readonly REDIS_PREFIX = "webhook:retry:";

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * 웹훅 수신 로그 기록
   *
   * completePayment 호출 전에 먼저 웹훅을 로깅하고,
   * 처리 결과에 따라 상태를 업데이트합니다.
   */
  async logWebhook(webhookData: {
    orderNumber: string;
    tid: string;
    resultCode: string;
    amount: number;
    authCode?: string;
    signature?: string;
  }): Promise<string> {
    const webhook = await this.prisma.paymentWebhook.create({
      data: {
        webhookType: "kg_inicis",
        webhookPayload: webhookData as any,
        signature: webhookData.signature ?? null,
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
      },
    });

    this.logger.log(
      `웹훅 로그 기록: webhookId=${webhook.id}, orderNumber=${webhookData.orderNumber}`,
    );

    return webhook.id;
  }

  /**
   * 웹훅 처리 시도
   *
   * completePayment를 호출하고, 성공/실패에 따라 웹훅 상태를 업데이트합니다.
   * 실패 시 자동 재시도를 스케줄링합니다.
   */
  async processWebhook(webhookId: string): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const webhook = await this.prisma.paymentWebhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      throw new NotFoundException("웹훅 기록을 찾을 수 없습니다.");
    }

    const payload = webhook.webhookPayload as any;

    try {
      // completePayment 호출
      const result = await this.paymentsService.completePayment({
        orderNumber: payload.orderNumber,
        tid: payload.tid,
        resultCode: payload.resultCode,
        amount: payload.amount,
        authCode: payload.authCode,
        signature: payload.signature,
      });

      // 성공 시 상태 업데이트
      await this.prisma.paymentWebhook.update({
        where: { id: webhookId },
        data: {
          status: "success",
          verified: true,
          paymentId: result.id,
          completedAt: new Date(),
          lastError: null,
        },
      });

      this.logger.log(
        `웹훅 처리 성공: webhookId=${webhookId}, paymentId=${result.id}`,
      );

      return { success: true, result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 실패 시 상태 업데이트 및 재시도 스케줄링
      const updatedWebhook = await this.prisma.paymentWebhook.update({
        where: { id: webhookId },
        data: {
          lastError: errorMessage,
          errorMessage: errorMessage,
          retryCount: { increment: 1 },
        },
      });

      // 재시도 가능 여부 확인 (멱등성 오류는 재시도하지 않음)
      const isIdempotentError =
        errorMessage.includes("이미 처리된 결제") ||
        errorMessage.includes("결제 기록을 찾을 수 없습니다");

      if (isIdempotentError) {
        // 멱등성 오류: 재시도 불필요, 상태를 완료 처리
        await this.prisma.paymentWebhook.update({
          where: { id: webhookId },
          data: {
            status: errorMessage.includes("이미 처리된 결제")
              ? "success"
              : "failed",
            completedAt: new Date(),
          },
        });

        this.logger.warn(
          `웹훅 멱등성 오류 (재시도 불필요): webhookId=${webhookId}, error=${errorMessage}`,
        );

        return { success: false, error: errorMessage };
      }

      if (updatedWebhook.retryCount < updatedWebhook.maxRetries) {
        // 재시도 스케줄링
        await this.scheduleRetry(webhookId, updatedWebhook.retryCount);
      } else {
        // 최대 재시도 초과 → failed
        await this.prisma.paymentWebhook.update({
          where: { id: webhookId },
          data: {
            status: "failed",
            completedAt: new Date(),
          },
        });

        this.logger.error(
          `웹훅 최대 재시도 초과: webhookId=${webhookId}, retryCount=${updatedWebhook.retryCount}`,
        );
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * 재시도 스케줄링 (Redis 기반)
   *
   * retryCount에 따라 다른 지연 시간 적용:
   * - 1차: 60초 (1분)
   * - 2차: 300초 (5분)
   * - 3차: 900초 (15분)
   */
  private async scheduleRetry(
    webhookId: string,
    currentRetryCount: number,
  ): Promise<void> {
    const delayIndex = Math.min(
      currentRetryCount,
      this.RETRY_DELAYS_SEC.length - 1,
    );
    const delaySec = this.RETRY_DELAYS_SEC[delayIndex];

    const nextRetryAt = new Date(Date.now() + delaySec * 1000);

    // DB에 다음 재시도 시각 기록
    await this.prisma.paymentWebhook.update({
      where: { id: webhookId },
      data: {
        status: "retrying",
        nextRetryAt,
      },
    });

    // Redis에 재시도 키 설정 (TTL = 지연 시간 + 여유분 60초)
    const redisKey = `${this.REDIS_PREFIX}${webhookId}`;
    await this.redisService.set(
      redisKey,
      JSON.stringify({ webhookId, scheduledAt: new Date().toISOString() }),
      delaySec + 60,
    );

    this.logger.log(
      `웹훅 재시도 스케줄링: webhookId=${webhookId}, ` +
        `retryCount=${currentRetryCount + 1}, delaySec=${delaySec}, ` +
        `nextRetryAt=${nextRetryAt.toISOString()}`,
    );
  }

  /**
   * Cron: 재시도 대기 중인 웹훅 처리
   *
   * 매 30초마다 nextRetryAt이 지난 retrying 상태 웹훅을 처리합니다.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processRetryQueue(): Promise<void> {
    let webhooksToRetry;
    try {
      const now = new Date();
      webhooksToRetry = await this.prisma.paymentWebhook.findMany({
        where: {
          status: "retrying",
          nextRetryAt: { lte: now },
          retryCount: { lt: 3 },
        },
        take: 10,
        orderBy: { nextRetryAt: "asc" },
      });
    } catch {
      // DB 연결 실패 시 조용히 스킵 (30초 후 재시도)
      return;
    }

    if (webhooksToRetry.length === 0) {
      return;
    }

    this.logger.log(`웹훅 재시도 큐 처리: ${webhooksToRetry.length}건 대기 중`);

    for (const webhook of webhooksToRetry) {
      try {
        await this.processWebhook(webhook.id);
      } catch (error) {
        this.logger.error(
          `웹훅 재시도 처리 실패: webhookId=${webhook.id}, error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * 관리자: 실패한 웹훅 목록 조회
   */
  async getFailedWebhooks(params: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { status = "failed", page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWebhookWhereInput = {};
    if (status) {
      where.status = status;
    }

    const [webhooks, total] = await Promise.all([
      this.prisma.paymentWebhook.findMany({
        where,
        select: {
          id: true,
          paymentId: true,
          webhookType: true,
          webhookPayload: true,
          status: true,
          retryCount: true,
          maxRetries: true,
          lastError: true,
          verified: true,
          processedAt: true,
          completedAt: true,
          nextRetryAt: true,
        },
        orderBy: { processedAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.paymentWebhook.count({ where }),
    ]);

    return {
      data: webhooks.map((w) => ({
        id: w.id,
        paymentId: w.paymentId,
        webhookType: w.webhookType,
        orderNumber: (w.webhookPayload as any)?.orderNumber ?? null,
        status: w.status,
        retryCount: w.retryCount,
        maxRetries: w.maxRetries,
        lastError: w.lastError,
        verified: w.verified,
        processedAt: w.processedAt,
        completedAt: w.completedAt,
        nextRetryAt: w.nextRetryAt,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 관리자: 특정 웹훅 수동 재시도
   *
   * 최대 재시도 횟수를 초과한 경우에도 관리자가 수동으로 재시도할 수 있습니다.
   */
  async retryWebhook(webhookId: string): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const webhook = await this.prisma.paymentWebhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      throw new NotFoundException("웹훅 기록을 찾을 수 없습니다.");
    }

    if (webhook.status === "success") {
      throw new BadRequestException("이미 성공 처리된 웹훅입니다.");
    }

    // 수동 재시도 시 retryCount 리셋하지 않고 기록 유지
    this.logger.log(
      `관리자 웹훅 수동 재시도: webhookId=${webhookId}, ` +
        `currentRetryCount=${webhook.retryCount}`,
    );

    // 상태를 pending으로 리셋하여 processWebhook이 처리할 수 있게 함
    await this.prisma.paymentWebhook.update({
      where: { id: webhookId },
      data: {
        status: "pending",
        nextRetryAt: null,
      },
    });

    return this.processWebhook(webhookId);
  }

  /**
   * 웹훅 통계 조회
   */
  async getWebhookStats() {
    const statsByStatus = await this.prisma.paymentWebhook.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const countMap = new Map(statsByStatus.map((s) => [s.status, s._count.id]));

    return {
      total: statsByStatus.reduce((acc, s) => acc + s._count.id, 0),
      pending: countMap.get("pending") ?? 0,
      success: countMap.get("success") ?? 0,
      failed: countMap.get("failed") ?? 0,
      retrying: countMap.get("retrying") ?? 0,
    };
  }
}
