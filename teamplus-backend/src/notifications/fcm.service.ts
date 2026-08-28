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

// iOS 앱 아이콘 뱃지 = 웹 알림함(벨/목록)이 '표시하는' 미읽음 수와 일치해야 한다.
// 웹 notification-mapper.isNotificationVisible 이 숨기는 유형/나이를 뱃지 집계에서도
// 제외하지 않으면, 열어도 볼 수 없는 유령 뱃지가 남아 클리어되지 않는다.
// SoT: teamplus-web/src/lib/notification-mapper.ts
//   (HIDDEN_NOTIFICATION_TYPES · NOTIFICATION_RECENCY_DAYS=21). 값 변경 시 동기화 필요.
// [2026-07-20] 벨 카운트(notifications.service.getUnreadCount)도 같은 기준을 쓰도록
//   모듈 레벨로 승격 — 뱃지/벨/알림함 3자 정합의 단일 SoT.
export const VISIBLE_UNREAD_HIDDEN_TYPES = [
  "trip_waitlist_promoted",
  "account_dormant",
  "rsvp_reminder",
  "tournament_created",
];
export const VISIBLE_UNREAD_RECENCY_DAYS = 21;

/**
 * 알림함이 '표시하는' 범위 where 절 — 숨김 유형·21일 초과 제외(웹 정합).
 * 읽음 여부는 포함하지 않는다 — 전체/미읽음 양쪽 집계에서 공용으로 쓰기 위함
 * (탭 배지·통계 칩은 전체 건수도 같은 범위로 세야 목록과 숫자가 맞는다).
 */
export function visibleNotificationWhere(): {
  notificationType: { notIn: string[] };
  createdAt: { gte: Date };
} {
  return {
    notificationType: { notIn: VISIBLE_UNREAD_HIDDEN_TYPES },
    createdAt: {
      gte: new Date(
        Date.now() - VISIBLE_UNREAD_RECENCY_DAYS * 24 * 60 * 60 * 1000,
      ),
    },
  };
}

/** 뱃지·벨 집계용 '표시되는 미읽음' where 절 — 표시 범위 + isRead=false. */
export function visibleUnreadNotificationWhere(): {
  isRead: false;
  notificationType: { notIn: string[] };
  createdAt: { gte: Date };
} {
  return {
    isRead: false,
    ...visibleNotificationWhere(),
  };
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
  /**
   * 대량 비활성화 회로차단기 — 단일 발송에서 무효 판정 토큰이
   * (대상의 RATIO_CAP 초과 && MIN_COUNT 이상)이면 오분류로 간주하고 비활성화를 차단.
   * 소량 발송(1기기 토큰 만료 등)은 MIN_COUNT 미만이라 영향 없음.
   */
  private static readonly DEACTIVATION_RATIO_CAP = 0.5;
  private static readonly DEACTIVATION_CAP_MIN_COUNT = 20;
  /** FCM data payload 권장 상한(전체 메시지 4KB 제한 대비 여유분) */
  private static readonly DATA_PAYLOAD_WARN_BYTES = 3800;

  // 뱃지 숨김 유형·21일 기준은 모듈 레벨 VISIBLE_UNREAD_* (파일 상단) 로 승격됨.

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

      // default 앱이 없을 때만 생성 — named 앱이 존재해도 admin.messaging()
      // (=default 앱 조회)이 실패하지 않도록 default 앱 존재 여부로 판단한다.
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

    // 모든 토큰이 한 사용자의 것이므로 해당 사용자의 미확인 알림 수를 뱃지로 사용.
    // (push 직전 DB create 가 완료된 상태라 이 카운트에 새 알림이 포함됨)
    const badge = await this.countUnread(userId);

    const result = await this.sendToTokensWithRetry(
      tokens,
      title,
      message,
      data,
      badge,
    );

    // 무효 토큰 비활성화
    if (result.invalidTokens.length > 0) {
      await this.deactivateInvalidTokens(result.invalidTokens, tokens.length);
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
   * @param options.setBadge 기본 true. `false` 이면 unread groupBy 를 건너뛰고
   *   전 토큰을 **badge omit** 으로 1회 발송한다. 채팅처럼 알림센터(notification
   *   테이블)에 적재되지 않아 unread count 가 0 일 수 있는 푸시가 iOS 뱃지를
   *   0 으로 덮어써 클리어시키는 엣지를 방지한다. (chat 전용)
   * @returns 발송 결과
   */
  async sendPushToUsers(
    userIds: string[],
    title: string,
    message: string,
    data?: FcmDataPayload,
    options?: { setBadge?: boolean },
  ): Promise<FcmSendResult> {
    if (!this.isReady()) {
      this.logger.debug("FCM 미초기화 상태 — 일괄 푸시 발송 건너뜀");
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    // userId 까지 조회해야 토큰별 소유자(=뱃지 값)를 판별할 수 있다.
    const devices = await this.prisma.userDevice.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        fcmToken: { not: "" },
      },
      select: {
        userId: true,
        fcmToken: true,
      },
    });

    if (devices.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    // setBadge=false: unread 집계를 건너뛰고 badge omit 으로 전 토큰 1회 발송.
    // (chat 등 알림센터 미적재 푸시 — 잘못된 뱃지 클리어/오설정 방지)
    if (options?.setBadge === false) {
      const tokens = Array.from(
        new Set(
          devices.map((d) => d.fcmToken).filter((t): t is string => !!t),
        ),
      );
      if (tokens.length === 0) {
        return { successCount: 0, failureCount: 0, invalidTokens: [] };
      }
      const result = await this.sendToTokensWithRetry(
        tokens,
        title,
        message,
        data,
        // badge 인자 생략 → aps.badge omit
      );
      if (result.invalidTokens.length > 0) {
        await this.deactivateInvalidTokens(result.invalidTokens, tokens.length);
      }
      return result;
    }

    // 동일 토큰이 여러 active row 에 걸쳐 있어도 한 기기에 1회만 발송하도록 dedupe.
    const seenTokens = new Set<string>();
    const dedupedDevices: Array<{ userId: string; fcmToken: string }> = [];
    for (const d of devices) {
      const token = d.fcmToken;
      if (!token || seenTokens.has(token)) continue;
      seenTokens.add(token);
      dedupedDevices.push({ userId: d.userId, fcmToken: token });
    }

    if (seenTokens.size === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    // 대상 사용자들의 미확인(표시되는) 알림 수를 단 1회 groupBy 로 일괄 계산.
    // 뱃지 계산은 '장식'이므로 실패해도 배치 전체를 드랍하지 않는다 — 집계 실패 시
    // 전원 badge omit(0 으로 클리어하지 않음) 으로 1회 발송해 전달을 보장한다
    // (단건 countUnread 의 NaN→omit 과 동일한 격리 정책).
    const unreadByUser = new Map<string, number>();
    let badgeComputed = true;
    try {
      const grouped = await this.prisma.notification.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds }, ...this.visibleUnreadWhere() },
        _count: { _all: true },
      });
      for (const g of grouped) {
        unreadByUser.set(g.userId, g._count._all);
      }
    } catch (error) {
      const err = error as Error;
      badgeComputed = false;
      this.logger.warn(
        `뱃지 집계 실패 — badge omit 으로 발송 계속 (${err.message})`,
      );
    }

    if (!badgeComputed) {
      const tokens = Array.from(seenTokens);
      const result = await this.sendToTokensWithRetry(
        tokens,
        title,
        message,
        data,
        // badge 인자 생략 → aps.badge omit (기존 뱃지 유지, 0 클리어 방지)
      );
      if (result.invalidTokens.length > 0) {
        await this.deactivateInvalidTokens(result.invalidTokens, tokens.length);
      }
      return result;
    }

    // 토큰을 소유자의 뱃지 값별로 그룹핑(Map<badge, token[]>).
    const tokensByBadge = new Map<number, string[]>();
    for (const d of dedupedDevices) {
      const badge = unreadByUser.get(d.userId) ?? 0;
      const list = tokensByBadge.get(badge);
      if (list) {
        list.push(d.fcmToken);
      } else {
        tokensByBadge.set(badge, [d.fcmToken]);
      }
    }

    // 뱃지 값별로 1회씩 발송 → FCM 호출 수 = distinct 뱃지 수(최소화),
    // 사용자별 뱃지 정확성은 유지.
    const totalResult: FcmSendResult = {
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
    };
    for (const [badge, tokens] of tokensByBadge) {
      const result = await this.sendToTokensWithRetry(
        tokens,
        title,
        message,
        data,
        badge,
      );
      totalResult.successCount += result.successCount;
      totalResult.failureCount += result.failureCount;
      totalResult.invalidTokens.push(...result.invalidTokens);
    }

    if (totalResult.invalidTokens.length > 0) {
      await this.deactivateInvalidTokens(
        totalResult.invalidTokens,
        seenTokens.size,
      );
    }

    return totalResult;
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

    // 사용자 컨텍스트가 없는 임의 토큰 발송(관리자 Push 등) — 뱃지 omit.
    // (특정 사용자에 귀속되지 않아 정확한 unread count 산정 불가)
    return this.sendToTokensWithRetry(tokens, title, body, data);
  }

  /** 뱃지 집계용 '표시되는 미읽음' where 절 — 모듈 레벨 SoT 위임. */
  private visibleUnreadWhere(): {
    isRead: false;
    notificationType: { notIn: string[] };
    createdAt: { gte: Date };
  } {
    return visibleUnreadNotificationWhere();
  }

  /**
   * 특정 사용자의 미확인(isRead=false) 알림 수 — 웹 알림함이 '표시하는' 것만 집계.
   * iOS 앱 아이콘 뱃지 카운트 산정에 사용한다. (Redis 캐시 의존을 피하고 push 직전
   * 최신값을 직접 집계해 정확성을 우선한다)
   */
  private async countUnread(userId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({
        where: { userId, ...this.visibleUnreadWhere() },
      });
    } catch (error) {
      const err = error as Error;
      this.logger.warn(
        `미확인 알림 수 집계 실패 (userId=${userId}): ${err.message} — 뱃지 omit`,
      );
      // 집계 실패 시 NaN 반환 → sendChunkWithRetry 가 뱃지를 omit(잘못된 값 강제 금지)
      return NaN;
    }
  }

  /**
   * 읽음 처리 직후 iOS 앱 아이콘 뱃지를 현재 미읽음 수로 무음 동기화.
   *
   * iOS 뱃지는 `aps.badge` 가 도착할 때만 갱신되므로, 읽음/삭제로 unread 가
   * 줄어도 다음 푸시가 오기 전까지 아이콘 숫자가 그대로 남는다. 이 메서드는
   * 배너·소리 없는 badge-only APNs 메시지로 뱃지만 내린다.
   * - notification 블록 없음 → 화면 표시 0 (Android 는 data-only 로 수신되어 무시)
   * - 실패는 격리 — 읽음 처리(호출부) 흐름에 절대 영향 없음
   */
  async sendBadgeSync(userId: string): Promise<void> {
    if (!this.isReady()) return;
    try {
      const devices = await this.prisma.userDevice.findMany({
        where: { userId, isActive: true, fcmToken: { not: "" } },
        select: { fcmToken: true, platform: true },
      });
      // 뱃지는 iOS 전용 — platform 미기록(레거시) 행은 안전하게 포함.
      const tokens = Array.from(
        new Set(
          devices
            .filter((d) => {
              const p = (d.platform ?? "").toLowerCase();
              return p === "" || p === "ios";
            })
            .map((d) => d.fcmToken)
            .filter((t): t is string => !!t),
        ),
      );
      if (tokens.length === 0) return;

      const badge = await this.countUnread(userId);
      if (!Number.isFinite(badge) || badge < 0) return;

      const response = await this.messaging.sendEachForMulticast({
        tokens,
        apns: {
          headers: { "apns-priority": "10", "apns-push-type": "alert" },
          payload: { aps: { badge } },
        },
        data: { v: "1", type: "badge_sync" },
      });
      this.logger.debug(
        `뱃지 동기화 발송: userId=${userId}, badge=${badge}, ` +
          `성공=${response.successCount}, 실패=${response.failureCount}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`뱃지 동기화 실패 (userId=${userId}): ${err.message}`);
    }
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
    badge?: number,
  ): Promise<FcmSendResult> {
    // 발송 전 정규화 — 호출부가 계약(전부 string)을 어겨도 invalid-argument
    // 자체가 발생하지 않도록 근원 차단.
    const normalizedData = this.normalizeDataPayload(data);

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
        normalizedData,
        badge,
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
   *
   * @param badge iOS 앱 아이콘 뱃지 카운트. 유한한 0 이상 정수일 때만 페이로드에
   *              포함되며, undefined/음수/NaN 이면 `aps.badge` 필드를 **생략**한다.
   *              (과거 하드코딩 `1` 로 항상 "1" 만 표시되던 버그 수정)
   */
  private async sendChunkWithRetry(
    tokens: string[],
    title: string,
    body: string,
    data?: FcmDataPayload,
    badge?: number,
    attempt: number = 1,
  ): Promise<FcmSendResult> {
    try {
      // iOS 뱃지: 유효한 카운트가 주어졌을 때만 설정. 그렇지 않으면 생략하여
      // OS 가 기존 뱃지를 유지/무시하도록 한다(잘못된 "1" 강제 금지).
      const aps: { sound: string; badge?: number } = { sound: "default" };
      if (typeof badge === "number" && Number.isFinite(badge) && badge >= 0) {
        aps.badge = badge;
      }

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
            // 진동이 활성화된 앱 채널(_v2). 구버전 teamplus_default 채널은 진동이
            // 동결되어 _v2 로 버전업. 미존재 채널은 매니페스트 기본 채널로 폴백.
            channelId: "teamplus_default_v2",
            // 진동/우선순위 명시 — pre-O 기기 및 heads-up 보장.
            // (AndroidNotification.priority: 'min'|'low'|'default'|'high'|'max')
            priority: "max" as const,
            // [2026-07-20 진동 미작동 대응] 기기 기본값 위임(defaultVibrateTimings)
            //   대신 앱 채널과 동일한 패턴을 명시 — pre-O(API<26) 기기와 v2 채널
            //   미존재(구버전 앱) 폴백 채널에서도 메시지 레벨 진동이 적용된다.
            //   (Android 8+ 는 채널 설정 우선 — v2 채널은 동일 패턴으로 생성됨:
            //    teamplus-app notification_channels.dart kNotificationVibrationPattern)
            vibrateTimingsMillis: [0, 500, 250, 500],
          },
        },
        apns: {
          payload: {
            aps,
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

      // 페이로드 결함 판정: 전원 실패 + 전원 invalid-argument.
      // 이 조합은 토큰이 아니라 메시지 자체(제목/본문/data 크기·형식) 결함이
      // 확실하므로 토큰 비활성화 0건, 재시도 0회(결정적 실패)로 즉시 중단한다.
      if (response.responses) {
        const invalidArgCount = response.responses.filter(
          (resp: any) =>
            !resp.success &&
            resp.error?.code === "messaging/invalid-argument",
        ).length;

        if (
          result.successCount === 0 &&
          invalidArgCount === tokens.length &&
          tokens.length > 0
        ) {
          this.logger.error(
            `[CRITICAL] FCM 페이로드 결함 의심 — 청크 전원(${tokens.length}건) invalid-argument. ` +
              `title=${title.length}자, dataKeys=[${data ? Object.keys(data).join(",") : ""}], ` +
              `dataSize=${data ? JSON.stringify(data).length : 0}B. ` +
              `토큰 비활성화·재시도 없이 중단합니다.`,
          );
          return result;
        }

        if (invalidArgCount > 0) {
          this.logger.warn(
            `FCM invalid-argument ${invalidArgCount}건(부분 실패) — ` +
              `토큰 비활성화 없이 실패로만 집계 (페이로드/토큰 원인 미확정)`,
          );
        }
      }

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
            badge,
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
        return this.sendChunkWithRetry(
          tokens,
          title,
          body,
          data,
          badge,
          attempt + 1,
        );
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
   * 무효/만료 토큰인지 판별 — 토큰 단위로 확정적인 코드만 포함한다.
   *
   * messaging/registration-token-not-registered: 토큰이 더 이상 유효하지 않음
   * messaging/invalid-registration-token: 토큰 형식이 잘못됨
   *
   * `messaging/invalid-argument` 는 제외 — 이 코드는 payload 결함(값 non-string,
   * 4KB 초과 등)에도 배치 전체에 반환되므로 무효 토큰으로 분류하면 정상 기기가
   * 대량 비활성화된다. 죽은 토큰은 결국 not-registered 로 수렴하므로 정리 기능은
   * 유지된다.
   */
  private isTokenInvalidError(errorCode: string): boolean {
    return [
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
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
   *
   * @param totalTargeted 이번 발송의 전체 대상 토큰 수 — 회로차단기 판정 기준.
   *   무효 판정이 대상의 50%를 넘고 20건 이상이면 분류 오류로 간주하고
   *   비활성화를 차단한다(어떤 분류 버그가 재발해도 대량 구독해지를 물리 차단).
   */
  private async deactivateInvalidTokens(
    tokens: string[],
    totalTargeted?: number,
  ): Promise<void> {
    if (tokens.length === 0) return;

    if (
      typeof totalTargeted === "number" &&
      totalTargeted > 0 &&
      tokens.length >= FcmService.DEACTIVATION_CAP_MIN_COUNT &&
      tokens.length / totalTargeted > FcmService.DEACTIVATION_RATIO_CAP
    ) {
      this.logger.error(
        `[CRITICAL] FCM 토큰 대량 비활성화 차단(회로차단기): ` +
          `무효 판정 ${tokens.length}/${totalTargeted}건 ` +
          `(${Math.round((tokens.length / totalTargeted) * 100)}% > ` +
          `상한 ${FcmService.DEACTIVATION_RATIO_CAP * 100}%). ` +
          `에러 분류 오류 가능성 — 비활성화를 수행하지 않습니다. 수동 확인 필요.`,
      );
      return;
    }

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
   * 발송 전 data payload 정규화 — FCM data 는 값이 전부 string 이어야 한다.
   * 호출부가 계약을 어겨(non-string/null 값) invalid-argument 를 유발하는 것을
   * 근원에서 차단한다. null/undefined 키는 제거, 그 외 값은 문자열로 강제.
   */
  private normalizeDataPayload(
    data?: Record<string, unknown>,
  ): FcmDataPayload | undefined {
    if (!data) return undefined;

    const normalized: FcmDataPayload = {};
    let coerced = false;
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        coerced = true;
        continue;
      }
      if (typeof value === "string") {
        normalized[key] = value;
      } else {
        normalized[key] = String(value);
        coerced = true;
      }
    }

    if (coerced) {
      this.logger.warn(
        `FCM data payload 정규화 수행(비문자열/null 값 감지) — ` +
          `keys=[${Object.keys(data).join(",")}]`,
      );
    }

    const size = JSON.stringify(normalized).length;
    if (size > FcmService.DATA_PAYLOAD_WARN_BYTES) {
      this.logger.error(
        `FCM data payload 크기 초과 위험: ${size}B ` +
          `(권장 상한 ${FcmService.DATA_PAYLOAD_WARN_BYTES}B, FCM 전체 4KB 제한)`,
      );
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
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
