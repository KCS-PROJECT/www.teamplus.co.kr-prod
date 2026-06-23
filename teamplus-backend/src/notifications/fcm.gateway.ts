import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as admin from "firebase-admin";

export interface FcmMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export interface FcmGatewaySendResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
  messageId?: string;
}

/**
 * Firebase Cloud Messaging 저수준 게이트웨이
 *
 * 자격증명 우선순위:
 *   1) FIREBASE_SERVICE_ACCOUNT_JSON (서비스 계정 JSON 통문자열)
 *   2) firebase.config 개별 env (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY) — FcmService와 동일 출처
 * 둘 다 없으면 경고 로그만 출력하고 발송을 건너뜁니다.
 *
 * 메서드:
 * - sendToDevice()   : 단일 토큰 발송
 * - sendMulticast()  : 다중 토큰 일괄 발송 (최대 500개)
 * - sendToTopic()    : FCM 토픽 구독 발송
 */
@Injectable()
export class FcmGateway implements OnModuleInit {
  private readonly logger = new Logger(FcmGateway.name);
  private messaging: admin.messaging.Messaging | null = null;
  private isInitialized = false;

  private static readonly APP_NAME = "teamplus-fcm-gateway";

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const resolved = this.resolveCredential();

    if (!resolved) {
      this.logger.warn(
        "Firebase 자격증명이 없습니다. FCM 게이트웨이 발송이 비활성화됩니다. " +
          "(FIREBASE_SERVICE_ACCOUNT_JSON 또는 " +
          "FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY 확인)",
      );
      return;
    }

    try {
      const existingApp = admin.apps.find(
        (a) => a?.name === FcmGateway.APP_NAME,
      );
      const app = existingApp
        ? existingApp
        : admin.initializeApp(
            { credential: resolved.credential },
            FcmGateway.APP_NAME,
          );

      this.messaging = admin.messaging(app);
      this.isInitialized = true;

      this.logger.log(
        `FcmGateway 초기화 완료 (projectId: ${resolved.projectId}, ` +
          `source: ${resolved.source})`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`FcmGateway 초기화 실패: ${err.message}`);
    }
  }

  /**
   * Firebase 자격증명 해석 — JSON 통문자열 우선, 없으면 개별 env 폴백.
   * FcmService와 동일한 firebase.config 네임스페이스를 사용해 단일 출처를 유지한다.
   */
  private resolveCredential(): {
    credential: admin.credential.Credential;
    projectId: string;
    source: string;
  } | null {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson);
        return {
          credential: admin.credential.cert(sa),
          projectId: sa.project_id ?? "unknown",
          source: "FIREBASE_SERVICE_ACCOUNT_JSON",
        };
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `FIREBASE_SERVICE_ACCOUNT_JSON 파싱 실패: ${err.message}`,
        );
        return null;
      }
    }

    const projectId = this.configService.get<string>("firebase.projectId");
    const clientEmail = this.configService.get<string>("firebase.clientEmail");
    const privateKey = this.configService.get<string>("firebase.privateKey");
    if (projectId && clientEmail && privateKey) {
      return {
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
        source: "firebase.config (개별 env)",
      };
    }

    return null;
  }

  isReady(): boolean {
    return this.isInitialized && this.messaging !== null;
  }

  /**
   * 단일 FCM 토큰 발송
   */
  async sendToDevice(
    token: string,
    message: FcmMessage,
  ): Promise<FcmGatewaySendResult> {
    if (!this.isReady()) {
      this.logger.debug("FcmGateway 미초기화 — sendToDevice 건너뜀");
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    try {
      const messageId = await this.messaging!.send({
        token,
        notification: { title: message.title, body: message.body },
        ...(message.data && { data: message.data }),
        android: {
          priority: "high",
          notification: { sound: "default", channelId: "teamplus_default" },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
      });

      return { successCount: 1, failureCount: 0, invalidTokens: [], messageId };
    } catch (error) {
      const err = error as admin.FirebaseError;
      if (this.isInvalidTokenError(err.code)) {
        return { successCount: 0, failureCount: 1, invalidTokens: [token] };
      }
      this.logger.error(`sendToDevice 실패 (token=${token}): ${err.message}`);
      return { successCount: 0, failureCount: 1, invalidTokens: [] };
    }
  }

  /**
   * 다중 FCM 토큰 일괄 발송 (최대 500개)
   */
  async sendMulticast(
    tokens: string[],
    message: FcmMessage,
  ): Promise<FcmGatewaySendResult> {
    if (!this.isReady()) {
      this.logger.debug("FcmGateway 미초기화 — sendMulticast 건너뜀");
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const multicastMessage: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title: message.title, body: message.body },
      ...(message.data && { data: message.data }),
      android: {
        priority: "high",
        notification: { sound: "default", channelId: "teamplus_default" },
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
    };

    try {
      const response =
        await this.messaging!.sendEachForMulticast(multicastMessage);

      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          if (this.isInvalidTokenError(resp.error.code)) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`sendMulticast 실패: ${err.message}`);
      return {
        successCount: 0,
        failureCount: tokens.length,
        invalidTokens: [],
      };
    }
  }

  /**
   * FCM 토픽 구독 대상에 발송
   *
   * @param topic 토픽 이름 (예: 'club_123_all', 'role_COACH')
   */
  async sendToTopic(
    topic: string,
    message: FcmMessage,
  ): Promise<FcmGatewaySendResult> {
    if (!this.isReady()) {
      this.logger.debug("FcmGateway 미초기화 — sendToTopic 건너뜀");
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    try {
      const messageId = await this.messaging!.send({
        topic,
        notification: { title: message.title, body: message.body },
        ...(message.data && { data: message.data }),
        android: {
          priority: "high",
          notification: { sound: "default", channelId: "teamplus_default" },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
      });

      this.logger.log(
        `sendToTopic 발송: topic=${topic}, messageId=${messageId}`,
      );

      return {
        successCount: 1,
        failureCount: 0,
        invalidTokens: [],
        messageId,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`sendToTopic 실패 (topic=${topic}): ${err.message}`);
      return { successCount: 0, failureCount: 1, invalidTokens: [] };
    }
  }

  private isInvalidTokenError(code: string): boolean {
    return [
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/invalid-argument",
    ].includes(code);
  }
}
