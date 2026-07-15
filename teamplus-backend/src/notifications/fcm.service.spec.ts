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

  // ── (d-2) 뱃지 집계 실패 격리 (배치 유실 방지) ──────────────────────────────
  describe("sendPushToUsers 뱃지 groupBy 실패 격리", () => {
    it("groupBy 가 throw 하면 배치를 드랍하지 않고 badge omit 으로 전원 발송", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { userId: "A", fcmToken: "tA" },
        { userId: "B", fcmToken: "tB" },
      ]);
      prismaMock.notification.groupBy.mockRejectedValue(new Error("DB down"));

      const result = await service.sendPushToUsers(["A", "B"], "제목", "본문");

      // 배치가 유실되지 않고 1회 발송됨
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
      const msg = mockSendEachForMulticast.mock.calls[0][0];
      expect(msg.tokens.sort()).toEqual(["tA", "tB"]);
      // badge 는 0(클리어) 이 아니라 omit — 기존 뱃지 유지
      expect(msg.apns.payload.aps).not.toHaveProperty("badge");
      expect(result.successCount).toBe(2);
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

  // ── (f) B2: FCM 에러 분류 안전화 ───────────────────────────────────────────
  describe("FCM 에러 분류 안전화 (B2)", () => {
    /** userId=A 소유 디바이스 n대 + unread 0 세팅 (badge 그룹 1개 → 발송 1회) */
    function seedDevices(n: number) {
      prismaMock.userDevice.findMany.mockResolvedValue(
        Array.from({ length: n }, (_, i) => ({
          userId: "A",
          fcmToken: `tok-${i}`,
        })),
      );
      prismaMock.notification.groupBy.mockResolvedValue([]);
    }

    it("청크 전원 invalid-argument(페이로드 결함) → 비활성화 0건 + 재시도 없음", async () => {
      seedDevices(5);
      mockSendEachForMulticast.mockImplementation((msg: any) =>
        Promise.resolve({
          successCount: 0,
          failureCount: msg.tokens.length,
          responses: msg.tokens.map(() => ({
            success: false,
            error: { code: "messaging/invalid-argument" },
          })),
        }),
      );

      const result = await service.sendPushToUsers(["A"], "제목", "본문");

      expect(result.invalidTokens).toEqual([]);
      expect(prismaMock.userDevice.updateMany).not.toHaveBeenCalled();
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
      expect(result.failureCount).toBe(5);
    });

    it("not-registered 2건 + invalid-argument 1건 + 성공 혼재 → 정확히 2건만 비활성화", async () => {
      seedDevices(5);
      const codes = [
        "messaging/registration-token-not-registered",
        "messaging/registration-token-not-registered",
        "messaging/invalid-argument",
        null,
        null,
      ];
      mockSendEachForMulticast.mockImplementation((msg: any) =>
        Promise.resolve({
          successCount: 2,
          failureCount: 3,
          responses: msg.tokens.map((_: string, idx: number) =>
            codes[idx]
              ? { success: false, error: { code: codes[idx] } }
              : { success: true },
          ),
        }),
      );

      const result = await service.sendPushToUsers(["A"], "제목", "본문");

      expect(result.invalidTokens.sort()).toEqual(["tok-0", "tok-1"]);
      expect(prismaMock.userDevice.updateMany).toHaveBeenCalledTimes(1);
      expect(
        prismaMock.userDevice.updateMany.mock.calls[0][0].where.fcmToken.in.sort(),
      ).toEqual(["tok-0", "tok-1"]);
    });

    it("invalid-argument 는 더 이상 무효 토큰으로 분류하지 않는다", () => {
      expect(
        (service as any).isTokenInvalidError("messaging/invalid-argument"),
      ).toBe(false);
      expect(
        (service as any).isTokenInvalidError(
          "messaging/registration-token-not-registered",
        ),
      ).toBe(true);
      expect(
        (service as any).isTokenInvalidError(
          "messaging/invalid-registration-token",
        ),
      ).toBe(true);
    });

    it("대량 비활성화 회로차단기: 무효 비율 상한 초과 시 비활성화 차단", async () => {
      seedDevices(30);
      mockSendEachForMulticast.mockImplementation((msg: any) =>
        Promise.resolve({
          successCount: 0,
          failureCount: msg.tokens.length,
          responses: msg.tokens.map(() => ({
            success: false,
            error: { code: "messaging/registration-token-not-registered" },
          })),
        }),
      );

      const result = await service.sendPushToUsers(["A"], "제목", "본문");

      // 30/30 = 100% > 상한 → 비활성화 차단 (무효 토큰 자체는 보고)
      expect(result.invalidTokens).toHaveLength(30);
      expect(prismaMock.userDevice.updateMany).not.toHaveBeenCalled();
    });

    it("소량(임계 미만)은 비율 100% 여도 기존대로 비활성화 (1기기 만료 케이스 보존)", async () => {
      prismaMock.userDevice.findMany.mockResolvedValue([
        { id: "d1", fcmToken: "dead-tok", platform: "ios" },
      ]);
      prismaMock.notification.count.mockResolvedValue(0);
      mockSendEachForMulticast.mockImplementation((msg: any) =>
        Promise.resolve({
          successCount: 0,
          failureCount: msg.tokens.length,
          responses: msg.tokens.map(() => ({
            success: false,
            error: { code: "messaging/registration-token-not-registered" },
          })),
        }),
      );

      await service.sendPushNotification("user-1", "제목", "본문");

      expect(prismaMock.userDevice.updateMany).toHaveBeenCalledTimes(1);
      expect(
        prismaMock.userDevice.updateMany.mock.calls[0][0].where.fcmToken.in,
      ).toEqual(["dead-tok"]);
    });
  });

  // ── (g) 발송 전 payload 정규화 ─────────────────────────────────────────────
  describe("발송 전 data payload 정규화", () => {
    it("non-string 값은 문자열로 강제, null/undefined 키는 제거", async () => {
      await service.sendToTokens(["tok"], "제목", "본문", {
        count: 5,
        flag: true,
        nullKey: null,
        undefKey: undefined,
        ok: "x",
      } as any);

      const msg = mockSendEachForMulticast.mock.calls[0][0];
      expect(msg.data).toEqual({ count: "5", flag: "true", ok: "x" });
      for (const v of Object.values(msg.data)) {
        expect(typeof v).toBe("string");
      }
    });

    it("정규화 후 빈 객체면 data 필드 자체를 생략", async () => {
      await service.sendToTokens(["tok"], "제목", "본문", {
        nullKey: null,
      } as any);

      const msg = mockSendEachForMulticast.mock.calls[0][0];
      expect(msg).not.toHaveProperty("data");
    });
  });
});
