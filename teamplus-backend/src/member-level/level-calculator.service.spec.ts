import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { LevelCalculatorService } from "./level-calculator.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("LevelCalculatorService", () => {
  let service: LevelCalculatorService;

  const mockPrismaService = {
    clubMember: { findMany: jest.fn() },
    playerSkillLevel: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    memberLevelHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    classAttendance: { count: jest.fn() },
    playerAward: { findMany: jest.fn() },
    skillEvaluation: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LevelCalculatorService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<LevelCalculatorService>(LevelCalculatorService);
    jest.clearAllMocks();
  });

  // ── calculateScore: 가중 합산 정확성 ──────────────────────────────────────

  describe("calculateScore", () => {
    it("출석률 0.4 + 대회참여 0.4 + 코치평가 0.2 가중 합산을 계산한다", async () => {
      // 출석률 80%, 대회점수 60, 코치평가 70
      // composite = 80*0.4 + 60*0.4 + 70*0.2 = 32 + 24 + 14 = 70
      mockPrismaService.classAttendance.count
        .mockResolvedValueOnce(8) // attended
        .mockResolvedValueOnce(10); // total
      mockPrismaService.playerAward.findMany.mockResolvedValue([
        { awardType: "attendance" },
        { awardType: "attendance" },
      ]); // avg points = 40
      mockPrismaService.skillEvaluation.findFirst.mockResolvedValue({
        overallScore: 70,
      });

      const result = await service.calculateScore("member-1", "user-1");

      expect(result.attendance).toBeCloseTo(80, 1);
      expect(result.tournament).toBeCloseTo(40, 1);
      expect(result.coach).toBe(70);
      // composite = 80*0.4 + 40*0.4 + 70*0.2 = 32 + 16 + 14 = 62
      expect(result.composite).toBeCloseTo(62, 1);
    });

    it("출석 기록이 없으면 출석률 기본값 50을 사용한다", async () => {
      mockPrismaService.classAttendance.count.mockResolvedValue(0);
      mockPrismaService.playerAward.findMany.mockResolvedValue([]);
      mockPrismaService.skillEvaluation.findFirst.mockResolvedValue(null);

      const result = await service.calculateScore("member-1", "user-1");

      expect(result.attendance).toBe(50);
      expect(result.tournament).toBe(0);
      expect(result.coach).toBe(50);
      // composite = 50*0.4 + 0*0.4 + 50*0.2 = 20 + 0 + 10 = 30
      expect(result.composite).toBeCloseTo(30, 1);
    });
  });

  // ── 레벨 구간 매핑 ────────────────────────────────────────────────────────

  describe("scoreToTier (레벨 구간 매핑)", () => {
    it("점수 0~39 는 tier 1 (하위) 로 매핑된다", async () => {
      mockPrismaService.classAttendance.count.mockResolvedValue(0);
      mockPrismaService.playerAward.findMany.mockResolvedValue([]);
      mockPrismaService.skillEvaluation.findFirst.mockResolvedValue({
        overallScore: 0,
      });
      mockPrismaService.playerSkillLevel.findUnique.mockResolvedValue(null);
      mockPrismaService.memberLevelHistory.create.mockResolvedValue({});

      // attendance=50, tournament=0, coach=0 → composite = 20+0+0 = 20 → tier 1
      await service.calculateAndStorePending("member-1", "user-1", "2025-2026");

      const createCall =
        mockPrismaService.memberLevelHistory.create.mock.calls[0][0];
      expect(createCall.data.newLevel).toBe(1);
      expect(createCall.data.newName).toBe("하위");
    });

    it("점수 40~69 는 tier 2 (중위) 로 매핑된다", async () => {
      // attendance=100%, tournament=60, coach=60 → composite = 40+24+12 = 76 → tier 3
      // 중위 테스트: attendance=50, tournament=50, coach=40
      // composite = 50*0.4 + 50*0.4 + 40*0.2 = 20+20+8 = 48 → tier 2
      mockPrismaService.classAttendance.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(10);
      mockPrismaService.playerAward.findMany.mockResolvedValue([
        { awardType: "attendance" }, // 40점
        { awardType: "attendance" }, // 40점
        { awardType: "sportsmanship" }, // 50점  → avg ~43.3
      ]);
      mockPrismaService.skillEvaluation.findFirst.mockResolvedValue({
        overallScore: 40,
      });
      mockPrismaService.playerSkillLevel.findUnique.mockResolvedValue(null);
      mockPrismaService.memberLevelHistory.create.mockResolvedValue({});

      await service.calculateAndStorePending("member-1", "user-1", "2025-2026");

      const createCall =
        mockPrismaService.memberLevelHistory.create.mock.calls[0][0];
      // attendance=50, tournament≈43.3, coach=40 → composite ≈ 20+17.3+8 ≈ 45.3 → tier 2
      expect(createCall.data.newLevel).toBe(2);
    });

    it("점수 70 이상은 tier 3 (상위) 로 매핑된다", async () => {
      // attendance=100%, tournament=100, coach=100 → composite = 40+40+20 = 100 → tier 3
      mockPrismaService.classAttendance.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(10);
      mockPrismaService.playerAward.findMany.mockResolvedValue([
        { awardType: "mvp" }, // 100점
      ]);
      mockPrismaService.skillEvaluation.findFirst.mockResolvedValue({
        overallScore: 100,
      });
      mockPrismaService.playerSkillLevel.findUnique.mockResolvedValue(null);
      mockPrismaService.memberLevelHistory.create.mockResolvedValue({});

      await service.calculateAndStorePending("member-1", "user-1", "2025-2026");

      const createCall =
        mockPrismaService.memberLevelHistory.create.mock.calls[0][0];
      expect(createCall.data.newLevel).toBe(3);
      expect(createCall.data.newName).toBe("상위");
    });
  });

  // ── approveLevel ──────────────────────────────────────────────────────────

  describe("approveLevel", () => {
    it("이력이 없으면 NotFoundException을 던진다", async () => {
      mockPrismaService.memberLevelHistory.findUnique.mockResolvedValue(null);

      await expect(
        service.approveLevel("history-1", "approver-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("PENDING_APPROVAL이 아닌 이력은 ForbiddenException을 던진다", async () => {
      mockPrismaService.memberLevelHistory.findUnique.mockResolvedValue({
        id: "history-1",
        status: "APPROVED",
      });

      await expect(
        service.approveLevel("history-1", "approver-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("정상 승인 시 $transaction으로 playerSkillLevel upsert와 이력 update를 수행한다", async () => {
      mockPrismaService.memberLevelHistory.findUnique.mockResolvedValue({
        id: "history-1",
        userId: "user-1",
        newLevel: 2,
        newName: "중위",
        season: "2025-2026",
        status: "PENDING_APPROVAL",
        reason: "score=48:att=50",
      });
      mockPrismaService.$transaction.mockResolvedValue([{}, {}]);

      await service.approveLevel("history-1", "approver-1");

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ── overrideLevel ─────────────────────────────────────────────────────────

  describe("overrideLevel", () => {
    it("등급이 1~3 범위를 벗어나면 ForbiddenException을 던진다", async () => {
      await expect(
        service.overrideLevel("history-1", "admin-1", 4),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.overrideLevel("history-1", "admin-1", 0),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
