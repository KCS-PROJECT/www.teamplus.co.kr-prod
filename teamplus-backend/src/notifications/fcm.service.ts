import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * FCM 푸시 알림 발송 결과
 */
export interface FcmSendResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

/**
 * FCM 푸시 알림 데이터 페이로드
 */
export interface FcmDataPayload {
  [key: string]: string;
}

/**
 * Firebase Cloud Messaging 서비스
 *
 * firebase-admin SDK를 사용한 실제 FCM 푸시 발송을 담당합니다.
 * 환경변수가 설정되지 않으면 발송을 건너뛰고 로그만 남깁니다.
 *
 * 주요 기능:
 * - 단일/다중 사용자 푸시 발송
 * - 발송 실패 시 3회 재시도 (exponential backoff)
 * - 만료/무효 토큰 자동 정리
 * - PushNotificationLog 기록
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private messaging: any = null;
  private isInitialized = false;

  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly INITIAL_RETRY_DELAY_MS = 1000;
  private static readonly FCM_BATCH_SIZE = 500;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.initializeFirebase();
  }

  /**
   * Firebase Admin SDK 초기화
   *
   * 환경변수(FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)가
   * 모두 설정되어 있어야 초기화됩니다. 누락 시 발송 기능이 비활성화됩니다.
   */
  private async initializeFirebase(): Promise<void> {
    const projectId = this.configService.get<string>("firebase.projectId");
    const clientEmail = this.configService.get<string>("firebase.clientEmail");
    const privateKey = this.configService.get<string>("firebase.privateKey");

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        "Firebase 환경변수가 설정되지 않았습니다. FCM 푸시 발송이 비활성화됩니다. " +
          "(FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY 확인)",
      );
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require("firebase-admin");

      // default 앱이 없을 때만 생성한다.
      // FcmGateway가 named 앱('teamplus-fcm-gateway')을 먼저 초기화하면
      // admin.apps.length > 0 이 되는데, 이때 default 앱 생성을 건너뛰면
      // 아래 admin.messaging()(=default 앱 조회)이 "default app does not exist"로
      // 실패한다. 반드시 default 앱 존재 여부로 판단해야 초기화 순서와 무관해진다.
      const hasDefaultApp = admin.apps.some(
        (a: { name?: string } | null) => a?.name === "[DEFAULT]",
      );
      if (!hasDefaultApp) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      }

      this.messaging = admin.messaging();
      this.isInitialized = true;

      this.logger.log(
        `Firebase Admin SDK 초기화 완료 (projectId: ${projectId})`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Firebase Admin SDK 초기화 실패: ${err.message}. ` +
          "firebase-admin 패키지가 설치되어 있는지 확인하세요. " +
          "(npm install firebase-admin)",
      );
    }
  }

  /**
   * FCM 초기화 여부 확인
   */
  isReady(): boolean {
    return this.isInitialized && this.messaging !== null;
  }

  /**
   * 특정 사용자에게 푸시 알림 발송
   *
   * UserDevice 테이블에서 해당 사용자의 활성 FCM 토큰을 조회하고
   * 각 디바이스에 푸시를 발송합니다.
   *
   * @param userId 대상 사용자 ID
   * @param title 알림 제목
   * @param message 알림 본문
   * @param data 추가 데이터 (key-value, 선택)
   * @returns 발송 결과
   */
  async sendPushNotification(
    userId: string,
    title: string,
    message: string,
    data?: FcmDataPayload,
  ): Promise<FcmSendResult> {
    if (!this.isReady()) {
      this.logger.debug(
        `FCM 미초기화 상태 — 푸시 발송 건너뜀 (userId: ${userId})`,
      );
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    // 사용자의 활성 디바이스 토큰 조회
    const devices = await this.prisma.userDevice.findMany({
      where: {
        userId,
        isActive: true,
        fcmToken: { not: "" },
      },
      select: {
        id: true,
        fcmToken: true,
        platform: true,
      },
    });

    if (devices.length === 0) {
      this.logger.debug(
        `활성 FCM 토큰 없음 — 푸시 발송 건너뜀 (userId: ${userId})`,
      );
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    // 동일 fcmToken 중복 제거(안전망) — 정책 적용 전 잔존 데이터로 같은 토큰이
    // 여러 active row 에 걸쳐 있어도 한 기기에 1회만 발송.
    const tokens = Array.from(
      new Set(devices.map((d) => d.fcmToken).filter((t): t is string => !!t)),
    );

    this.logger.log(
      `FCM 푸시 발송 시작: userId=${userId}, 디바이스=${tokens.length}대`,
    );

    const result = await this.sendToTokensWithRetry(
      tokens,
      title,
      message,
      data,
    );

    // 무효 토큰 비활성화
    if (result.invalidTokens.length > 0) {
      await this.deactivateInvalidTokens(result.invalidTokens);
    }

    return result;
  }

  /**
   * 여러 사용자에게 푸시 알림 일괄 발송
   *
   * @param userIds 대상 사용자 ID 배열
   * @param title 알림 제목
   * @param message 알림 본문
   * @param data 추가 데이터 (key-value, 선택)
   * @returns 발송 결과
   */
  async sendPushToUsers(
    userIds: string[],
    title: string,
    message: string,
    data?: FcmDataPayload,
  ): Promise<FcmSendResult> {
    if (!this.isReady()) {
      this.logger.debug("FCM 미초기화 상태 — 일괄 푸시 발송 건너뜀");
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const devices = await this.prisma.userDevice.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        fcmToken: { not: "" },
      },
      select: {
        id: true,
        fcmToken: true,
      },
    });

    const tokens = Array.from(
      new Set(devices.map((d) => d.fcmToken).filter((t): t is string => !!t)),
    );

    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const result = await this.sendToTokensWithRetry(
      tokens,
      title,
      message,
      data,
    );

    if (result.invalidTokens.length > 0) {
      await this.deactivateInvalidTokens(result.invalidTokens);
    }

    return result;
  }

  /**
   * 토큰 목록에 직접 FCM 발송 (관리자 Push 등에서 사용)
   *
   * @param tokens FCM 토큰 배열
   * @param title 알림 제목
   * @param body 알림 본문
   * @param data 추가 데이터 (선택)
   * @returns 발송 결과
   */
  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: FcmDataPayload,
  ): Promise<FcmSendResult> {
    if (!this.isReady()) {
      this.logger.debug("FCM 미초기화 상태 — 토큰 직접 발송 건너뜀");
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    return this.sendToTokensWithRetry(tokens, title, body, data);
  }

  /**
   * FCM 토큰 목록에 발송 + 3회 재시도 (exponential backoff)
   *
   * FCM sendEachForMulticast는 최대 500개 토큰을 허용하므로
   * 500개 단위로 분할하여 발송합니다.
   */
  private async sendToTokensWithRetry(
    tokens: string[],
    title: string,
    body: string,
    data?: FcmDataPayload,
  ): Promise<FcmSendResult> {
    const totalResult: FcmSendResult = {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
    };

    // 500개 단위로 분할
    const chunks = this.chunkArray(tokens, FcmService.FCM_BATCH_SIZE);

    for (const chunk of chunks) {
      const chunkResult = await this.sendChunkWithRetry(
        chunk,
        title,
        body,
        data,
      );
      totalResult.successCount += chunkResult.successCount;
      totalResult.failureCount += chunkResult.failureCount;
      totalResult.invalidTokens.push(...chunkResult.invalidTokens);
    }

    this.logger.log(
      `FCM 발송 완료: 성공=${totalResult.successCount}, 실패=${totalResult.failureCount}, ` +
        `무효토큰=${totalResult.invalidTokens.length}`,
    );

    return totalResult;
  }

  /**
   * 단일 청크(최대 500개 토큰) 발송 + 재시도
   */
  private async sendChunkWithRetry(
    tokens: string[],
    title: string,
    body: string,
    data?: FcmDataPayload,
    attempt: number = 1,
  ): Promise<FcmSendResult> {
    try {
      const fcmMessage: any = {
        tokens,
        notification: {
          title,
          body,
        },
        android: {
          priority: "high" as const,
          notification: {
            sound: "default",
            channelId: "teamplus_default",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      };

      if (data && Object.keys(data).length > 0) {
        fcmMessage.data = data;
      }

      const response = await this.messaging.sendEachForMulticast(fcmMessage);

      const result: FcmSendResult = {
        successCount: response.successCount || 0,
        failureCount: response.failureCount || 0,
        invalidTokens: [],
      };

      // 실패 응답에서 무효 토큰 추출
      if (response.responses) {
        const retryableTokens: string[] = [];

        response.responses.forEach((resp: any, idx: number) => {
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            if (this.isTokenInvalidError(errorCode)) {
              result.invalidTokens.push(tokens[idx]);
            } else if (
              this.isRetryableError(errorCode) &&
              attempt < FcmService.MAX_RETRY_ATTEMPTS
            ) {
              retryableTokens.push(tokens[idx]);
            }
          }
        });

        // 재시도 가능한 토큰이 있고 재시도 횟수가 남아 있으면 재시도
        if (retryableTokens.length > 0) {
          const delay =
            FcmService.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          this.logger.warn(
            `FCM 재시도 (${attempt}/${FcmService.MAX_RETRY_ATTEMPTS}): ` +
              `${retryableTokens.length}개 토큰, ${delay}ms 후 재시도`,
          );
          await this.sleep(delay);

          const retryResult = await this.sendChunkWithRetry(
            retryableTokens,
            title,
            body,
            data,
            attempt + 1,
          );

          // 재시도 결과 반영: 이전 실패 수에서 재시도 대상 수를 빼고, 재시도 결과를 합산
          result.successCount += retryResult.successCount;
          result.failureCount =
            result.failureCount -
            retryableTokens.length +
            retryResult.failureCount;
          result.invalidTokens.push(...retryResult.invalidTokens);
        }
      }

      return result;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `FCM 발송 오류 (시도 ${attempt}/${FcmService.MAX_RETRY_ATTEMPTS}): ${err.message}`,
      );

      if (attempt < FcmService.MAX_RETRY_ATTEMPTS) {
        const delay =
          FcmService.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(`FCM 전체 재시도: ${delay}ms 후 재시도`);
        await this.sleep(delay);
        return this.sendChunkWithRetry(tokens, title, body, data, attempt + 1);
      }

      // 모든 재시도 실패
      return {
        successCount: 0,
        failureCount: tokens.length,
        invalidTokens: [],
      };
    }
  }

  /**
   * 무효/만료 토큰인지 판별
   *
   * messaging/registration-token-not-registered: 토큰이 더 이상 유효하지 않음
   * messaging/invalid-registration-token: 토큰 형식이 잘못됨
   */
  private isTokenInvalidError(errorCode: string): boolean {
    return [
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/invalid-argument",
    ].includes(errorCode);
  }

  /**
   * 재시도 가능한 오류인지 판별
   *
   * messaging/internal-error: Firebase 내부 오류
   * messaging/server-unavailable: 서버 일시 불가
   * messaging/quota-exceeded: 할당량 초과 (잠시 후 재시도)
   */
  private isRetryableError(errorCode: string): boolean {
    return [
      "messaging/internal-error",
      "messaging/server-unavailable",
      "messaging/quota-exceeded",
    ].includes(errorCode);
  }

  /**
   * 무효 토큰 비활성화
   *
   * UserDevice 테이블에서 해당 FCM 토큰을 isActive=false로 업데이트합니다.
   */
  private async deactivateInvalidTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;

    try {
      const result = await this.prisma.userDevice.updateMany({
        where: {
          fcmToken: { in: tokens },
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      this.logger.log(`무효 FCM 토큰 비활성화: ${result.count}개 디바이스`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`FCM 토큰 비활성화 실패: ${err.message}`);
    }
  }

  /**
   * PushNotificationLog 기록
   *
   * 관리자 Push 발송 등 대규모 발송 이력을 기록합니다.
   */
  async createPushLog(params: {
    title: string;
    body: string;
    targetType: string;
    targetValue?: string;
    sentBy: string;
    totalCount: number;
    successCount: number;
    failCount: number;
    status: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    const log = await this.prisma.pushNotificationLog.create({
      data: {
        title: params.title,
        body: params.body,
        targetType: params.targetType,
        targetValue: params.targetValue || null,
        sentBy: params.sentBy,
        totalCount: params.totalCount,
        successCount: params.successCount,
        failCount: params.failCount,
        status: params.status,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });

    return log.id;
  }

  /**
   * 배열을 지정된 크기로 분할
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Sleep 유틸리티
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
