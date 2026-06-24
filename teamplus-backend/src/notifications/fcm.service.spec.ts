import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { FcmService } from "./fcm.service";

/**
 * FcmService 핵심 로직 단위 테스트 (push 앱아이콘 뱃지 카운트 정상화)
 *
 * Firebase messaging(`sendEachForMulticast`) 을 mock 하여 발송 페이로드를 캡처하고,
 * PrismaService(`notification.count`/`groupBy`, `userDevice.findMany`) 를 mock 하여
 * 네트워크/DB 없이 다음을 검증한다.
 *  (a) badge omit 가드 — undefined/NaN/음수 → aps.badge 미포함, ≥0 → 포함
 *  (b) sendPushToUsers — 사용자별 unread 가 다르면 distinct badge 수만큼 발송 +
 *      각 토큰이 소유자 badge 로 매핑(크로스유저 누출 0)
 *  (c) countUnread 실패(prisma reject) → 해당 발송 badge omit
 *  (d) setBadge:false → groupBy 미호출 + badge omit 1회 발송
 *  (e) 진동 페이로드 보존(channelId v2·priority max·defaultVibrateTimings·sound default)
 */
describe("FcmService", () => {
  let service: FcmService;
  let mockSendEachForMulticast: jest.Mock;

  const mockConfigService = { get: jest.fn().mockReturnValue(undefined) };

  const prismaMock = {
    notification: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    userDevice: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  /** sendEachForMulticast 가 캡처한 호출들에서 각 토큰 → badge 매핑을 구성 */
  function tokenBadgeMap(): Map<string, number | undefined> {
    const map = new Map<string, number | undefined>();
    for (const call of mockSendEachForMulticast.mock.calls) {
      const msg = call[0];
      const badge = msg.apns.payload.aps.badge;
      for (const t of msg.tokens) map.set(t, badge);
    }
    return map;
  }

  /** 단일 발송(첫 호출)의 aps 페이로드 */
  function firstAps(): { sound: string; badge?: number } {
    return mockSendEachForMulticast.mock.calls[0][0].apns.payload.aps;
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSendEachForMulticast = jest.fn((msg: any) =>
      Promise.resolve({
        successCount: msg.tokens.length,
        failureCount: 0,
        responses: msg.tokens.map(() => ({ success: true })),
      }),
    );

    prismaMock.userDevice.updateMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FcmService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<FcmService>(FcmService);

    // Firebase 초기화 우회 — 네트워크 없이 messaging mock 주입.
    (service as any).isInitialized = true;
    (service as any).messaging = {
      sendEachForMulticast: mockSendEachForMulticast,
    };
  });

  // ── (a) badge omit 가드 ────────────────────────────────────────────────────
  describe("badge omit 가드 (sendChunkWithRetry)", () => {
    it("sendToTokens(사용자 컨텍스트 없음) → aps.badge 미포함, sound 유지", async () => {
      await service.sendToTokens(["admin-token"], "공지", "내용");

      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
      const aps = firstAps();
      expect(aps).not.toHaveProperty("badge");
      expect(aps.sound).toBe("default");
    });

    it("unread=3 → aps.badge=3 포함 (sendPushNotification)", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { id: "d1", fcmToken: "tok-1", platform: "ios" },
      ]);
      prismaMock.notification.count.mockResolvedValue(3);

      await service.sendPushNotification("user-1", "제목", "본문");

      expect(firstAps().badge).toBe(3);
    });

    it("unread=0 → aps.badge=0 포함 (경계값 — 뱃지 클리어)", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { id: "d1", fcmToken: "tok-1", platform: "ios" },
      ]);
      prismaMock.notification.count.mockResolvedValue(0);

      await service.sendPushNotification("user-1", "제목", "본문");

      const aps = firstAps();
      expect(aps).toHaveProperty("badge", 0);
    });

    it("badge 음수 → aps.badge 미포함", async () => {
      await (service as any).sendChunkWithRetry(
        ["tok"],
        "t",
        "b",
        undefined,
        -1,
      );
      expect(firstAps()).not.toHaveProperty("badge");
    });

    it("badge NaN → aps.badge 미포함", async () => {
      await (service as any).sendChunkWithRetry(
        ["tok"],
        "t",
        "b",
        undefined,
        Number.NaN,
      );
      expect(firstAps()).not.toHaveProperty("badge");
    });
  });

  // ── (b) sendPushToUsers 사용자별 정확성 ─────────────────────────────────────
  describe("sendPushToUsers (per-user badge)", () => {
    it("서로 다른 unread → distinct badge 수만큼 발송 + 소유자 badge 매핑(누출 0)", async () => {
      // A=3, B=1, C=0(groupBy 결과 없음 → 0)
      prismaMock.userDevice.findMany.mockResolvedValue([
        { userId: "A", fcmToken: "tA" },
        { userId: "B", fcmToken: "tB" },
        { userId: "C", fcmToken: "tC" },
      ]);
      prismaMock.notification.groupBy.mockResolvedValue([
        { userId: "A", _count: { _all: 3 } },
        { userId: "B", _count: { _all: 1 } },
      ]);

      const result = await service.sendPushToUsers(
        ["A", "B", "C"],
        "제목",
        "본문",
      );

      // distinct badge = {3,1,0} → 3회 발송
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(3);

      const map = tokenBadgeMap();
      expect(map.get("tA")).toBe(3);
      expect(map.get("tB")).toBe(1);
      expect(map.get("tC")).toBe(0);

      // 크로스유저 누출 0: 각 토큰은 정확히 자기 소유자 badge 로만 발송
      expect(result.successCount).toBe(3);
    });

    it("같은 unread 사용자는 한 번에 묶여 발송(FCM 호출 최소화)", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { userId: "A", fcmToken: "tA" },
        { userId: "B", fcmToken: "tB" },
      ]);
      prismaMock.notification.groupBy.mockResolvedValue([
        { userId: "A", _count: { _all: 2 } },
        { userId: "B", _count: { _all: 2 } },
      ]);

      await service.sendPushToUsers(["A", "B"], "제목", "본문");

      // badge=2 동일 → 1회 발송, 두 토큰 함께
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
      const sentTokens = mockSendEachForMulticast.mock.calls[0][0].tokens;
      expect(sentTokens.sort()).toEqual(["tA", "tB"]);
      expect(firstAps().badge).toBe(2);
    });

    it("동일 토큰 중복 row 는 1회만 발송(dedupe)", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { userId: "A", fcmToken: "dup" },
        { userId: "A", fcmToken: "dup" },
      ]);
      prismaMock.notification.groupBy.mockResolvedValue([
        { userId: "A", _count: { _all: 5 } },
      ]);

      await service.sendPushToUsers(["A"], "제목", "본문");

      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
      expect(mockSendEachForMulticast.mock.calls[0][0].tokens).toEqual(["dup"]);
      expect(firstAps().badge).toBe(5);
    });
  });

  // ── (c) countUnread 실패 → badge omit ───────────────────────────────────────
  describe("countUnread 실패 처리", () => {
    it("notification.count reject → 해당 발송 badge omit(발송은 계속)", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { id: "d1", fcmToken: "tok-1", platform: "ios" },
      ]);
      prismaMock.notification.count.mockRejectedValue(new Error("DB down"));

      const result = await service.sendPushNotification("user-1", "제목", "본문");

      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
      expect(firstAps()).not.toHaveProperty("badge");
      expect(result.successCount).toBe(1);
    });
  });

  // ── (d) setBadge:false ──────────────────────────────────────────────────────
  describe("sendPushToUsers options.setBadge=false (chat)", () => {
    it("groupBy 미호출 + badge omit 으로 전 토큰 1회 발송", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { userId: "A", fcmToken: "tA" },
        { userId: "B", fcmToken: "tB" },
      ]);

      await service.sendPushToUsers(["A", "B"], "발신자", "메시지", undefined, {
        setBadge: false,
      });

      expect(prismaMock.notification.groupBy).not.toHaveBeenCalled();
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
      const msg = mockSendEachForMulticast.mock.calls[0][0];
      expect(msg.tokens.sort()).toEqual(["tA", "tB"]);
      expect(msg.apns.payload.aps).not.toHaveProperty("badge");
    });

    it("setBadge 기본값(미전달)은 per-user groupBy 동작 유지", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { userId: "A", fcmToken: "tA" },
      ]);
      prismaMock.notification.groupBy.mockResolvedValue([
        { userId: "A", _count: { _all: 4 } },
      ]);

      await service.sendPushToUsers(["A"], "제목", "본문");

      expect(prismaMock.notification.groupBy).toHaveBeenCalledTimes(1);
      expect(firstAps().badge).toBe(4);
    });
  });

  // ── (e) 진동/우선순위 페이로드 보존 ─────────────────────────────────────────
  describe("진동 수정 페이로드 보존", () => {
    it("android.notification 채널 v2·priority max·defaultVibrateTimings·sound 와 apns sound 유지", async () => {
      await service.sendToTokens(["tok"], "제목", "본문");

      const msg = mockSendEachForMulticast.mock.calls[0][0];
      expect(msg.android.priority).toBe("high");
      expect(msg.android.notification).toMatchObject({
        sound: "default",
        channelId: "teamplus_default_v2",
        priority: "max",
        defaultVibrateTimings: true,
      });
      expect(msg.apns.payload.aps.sound).toBe("default");
    });
  });
});
