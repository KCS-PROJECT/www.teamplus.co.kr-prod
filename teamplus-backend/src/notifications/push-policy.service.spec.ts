import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/prisma/prisma.service";
import {
  PushPolicyService,
  categoryOfNotificationType,
  isWithinQuietHoursKST,
} from "./push-policy.service";

describe("PushPolicyService", () => {
  let service: PushPolicyService;

  const prismaMock = {
    userNotificationPreference: {
      findMany: jest.fn(),
    },
    // 광고성 발송 시 마케팅 수신동의(User.marketingConsent) 조회
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  /** 기본 preference 행 (전 항목 허용) */
  const basePref = (userId: string, overrides: Record<string, unknown> = {}) => ({
    userId,
    pushEnabled: true,
    categories: { class: true, payment: true, notice: true, system: true },
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushPolicyService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PushPolicyService>(PushPolicyService);
  });

  describe("② pushEnabled", () => {
    it("pushEnabled=false 사용자를 suppressed(push_disabled) 로 분리", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([
        basePref("opt-out", { pushEnabled: false }),
      ]);

      const result = await service.filterRecipients(["opt-out", "opt-in"], {
        notificationType: "payment_success",
      });

      expect(result.allowed).toEqual(["opt-in"]);
      expect(result.suppressed).toEqual([
        { userId: "opt-out", reason: "push_disabled" },
      ]);
    });

    it("preference 행이 없는 사용자(기본값)는 허용", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([]);

      const result = await service.filterRecipients(["u1", "u2"]);

      expect(result.allowed.sort()).toEqual(["u1", "u2"]);
      expect(result.suppressed).toEqual([]);
    });

    it("중복·빈 값 입력을 정리한다", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([]);

      const result = await service.filterRecipients(["u1", "u1", "", "u2"]);

      expect(result.allowed.sort()).toEqual(["u1", "u2"]);
      expect(
        prismaMock.userNotificationPreference.findMany.mock.calls[0][0].where
          .userId.in,
      ).toEqual(["u1", "u2"]);
    });

    it("빈 입력이면 DB 조회 없이 빈 결과", async () => {
      const result = await service.filterRecipients([]);

      expect(result).toEqual({ allowed: [], suppressed: [] });
      expect(
        prismaMock.userNotificationPreference.findMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe("③ categories (B6)", () => {
    it("categories.payment=false 사용자는 결제 알림에서 억제", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([
        basePref("u1", {
          categories: { class: true, payment: false, notice: true, system: true },
        }),
      ]);

      const result = await service.filterRecipients(["u1"], {
        notificationType: "payment_success",
      });

      expect(result.allowed).toEqual([]);
      expect(result.suppressed).toEqual([
        { userId: "u1", reason: "category_disabled" },
      ]);
    });

    it("같은 사용자라도 다른 카테고리 알림은 허용", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([
        basePref("u1", {
          categories: { class: true, payment: false, notice: true, system: true },
        }),
      ]);

      const result = await service.filterRecipients(["u1"], {
        notificationType: "class_created",
      });

      expect(result.allowed).toEqual(["u1"]);
    });

    it("미분류 타입(chat_message 등)은 카테고리 필터를 통과 (보수 정책)", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([
        basePref("u1", {
          categories: {
            class: false,
            payment: false,
            notice: false,
            system: false,
          },
        }),
      ]);

      const result = await service.filterRecipients(["u1"], {
        notificationType: "chat_message",
      });

      expect(result.allowed).toEqual(["u1"]);
    });
  });

  describe("② 마케팅 수신동의 (§50① · PIPA §22④)", () => {
    it("광고성 발송은 marketingConsent=false 사용자를 marketing_not_consented 로 제외", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([
        basePref("consented"),
        basePref("not-consented"),
      ]);
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: "consented", marketingConsent: true },
        { id: "not-consented", marketingConsent: false },
      ]);

      const result = await service.filterRecipients(
        ["consented", "not-consented"],
        { notificationType: "admin_push_marketing" },
      );

      expect(result.allowed).toEqual(["consented"]);
      expect(result.suppressed).toEqual([
        { userId: "not-consented", reason: "marketing_not_consented" },
      ]);
    });

    it("preference 행이 없어도 광고성은 동의 없으면 제외 (기본 허용 우회 차단)", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: "u1", marketingConsent: false },
      ]);

      const result = await service.filterRecipients(["u1"], {
        notificationType: "marketing",
      });

      expect(result.allowed).toEqual([]);
      expect(result.suppressed).toEqual([
        { userId: "u1", reason: "marketing_not_consented" },
      ]);
    });

    it("isMarketing=true 만 넘겨도(타입 미지정) 동의 게이트가 적용된다", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: "u1", marketingConsent: false },
      ]);

      const result = await service.filterRecipients(["u1"], {
        isMarketing: true,
      });

      expect(result.suppressed).toEqual([
        { userId: "u1", reason: "marketing_not_consented" },
      ]);
    });

    it("정보성 발송은 동의 조회를 하지 않는다 (쿼리 비용 회귀 방지)", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([]);

      const result = await service.filterRecipients(["u1"], {
        notificationType: "payment_success",
      });

      expect(result.allowed).toEqual(["u1"]);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it("동의했더라도 categories.marketing=false 면 카테고리 필터로 제외", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([
        basePref("u1", {
          categories: { notice: true, marketing: false },
        }),
      ]);
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: "u1", marketingConsent: true },
      ]);

      const result = await service.filterRecipients(["u1"], {
        notificationType: "promotion",
      });

      expect(result.suppressed).toEqual([
        { userId: "u1", reason: "category_disabled" },
      ]);
    });
  });

  describe("④ quietHours (B6)", () => {
    it("방해금지 시간대 사용자는 suppressed(quiet_hours) — 인앱은 게이트 밖", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([
        basePref("u1", {
          quietHoursEnabled: true,
          quietHoursStart: "00:00",
          quietHoursEnd: "23:59", // 사실상 항상 참 — 시간 의존 제거
        }),
      ]);

      const result = await service.filterRecipients(["u1"], {
        notificationType: "class_created",
      });

      expect(result.suppressed).toEqual([
        { userId: "u1", reason: "quiet_hours" },
      ]);
    });

    it("quietHoursEnabled=false 면 시간대와 무관하게 허용", async () => {
      prismaMock.userNotificationPreference.findMany.mockResolvedValue([
        basePref("u1", {
          quietHoursEnabled: false,
          quietHoursStart: "00:00",
          quietHoursEnd: "23:59",
        }),
      ]);

      const result = await service.filterRecipients(["u1"]);

      expect(result.allowed).toEqual(["u1"]);
    });
  });
});

describe("categoryOfNotificationType (설정 카테고리 매핑)", () => {
  it.each([
    ["payment_success", "payment"],
    ["postpaid_billing", "payment"],
    ["class_created", "class"],
    ["enrollment_approved", "class"],
    ["child_attendance", "class"],
    ["rsvp_reminder", "class"],
    ["membership_approved", "notice"],
    ["tournament_created", "notice"],
    ["credit_expiry", "notice"],
    ["team_notice_created", "notice"],
    ["system", "system"],
    ["dormant_warning", "system"],
  ])("%s → %s", (type, expected) => {
    expect(categoryOfNotificationType(type)).toBe(expected);
  });

  it.each(["chat_message", "admin_push", "unknown"])(
    "미분류 %s → null (필터 통과)",
    (type) => {
      expect(categoryOfNotificationType(type)).toBeNull();
    },
  );

  // 과거 회귀: marketing 계열이 null 로 떨어져 '마케팅 정보 수신' OFF 가 무력화됐다 (§50⑥)
  it.each([
    "marketing",
    "promotion",
    "advertisement",
    "event_promotion",
    "academy_promotion",
    "admin_push_marketing",
  ])("광고성 %s → marketing (필터 적용)", (type) => {
    expect(categoryOfNotificationType(type)).toBe("marketing");
  });
});

describe("isWithinQuietHoursKST", () => {
  /** KST 시각으로 Date 생성 (UTC = KST - 9h) */
  const kst = (hours: number, minutes = 0) =>
    new Date(Date.UTC(2026, 0, 15, (hours - 9 + 24) % 24, minutes));

  it("일반 구간(13:00~15:00): 내부 true, 외부 false", () => {
    expect(isWithinQuietHoursKST("13:00", "15:00", kst(14))).toBe(true);
    expect(isWithinQuietHoursKST("13:00", "15:00", kst(16))).toBe(false);
    expect(isWithinQuietHoursKST("13:00", "15:00", kst(12, 59))).toBe(false);
  });

  it("자정 걸침(22:00~08:00): 밤·새벽 true, 낮 false", () => {
    expect(isWithinQuietHoursKST("22:00", "08:00", kst(23))).toBe(true);
    expect(isWithinQuietHoursKST("22:00", "08:00", kst(3))).toBe(true);
    expect(isWithinQuietHoursKST("22:00", "08:00", kst(12))).toBe(false);
  });

  it("경계값: 시작 시각 포함, 종료 시각 미포함", () => {
    expect(isWithinQuietHoursKST("22:00", "08:00", kst(22, 0))).toBe(true);
    expect(isWithinQuietHoursKST("22:00", "08:00", kst(8, 0))).toBe(false);
  });

  it("형식 오류·null·동일 시각은 false (푸시 전면 차단 방지)", () => {
    expect(isWithinQuietHoursKST(null, "08:00", kst(23))).toBe(false);
    expect(isWithinQuietHoursKST("25:00", "08:00", kst(23))).toBe(false);
    expect(isWithinQuietHoursKST("abc", "08:00", kst(23))).toBe(false);
    expect(isWithinQuietHoursKST("10:00", "10:00", kst(10))).toBe(false);
  });
});
