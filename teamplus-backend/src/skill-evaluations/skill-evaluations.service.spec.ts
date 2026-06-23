import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { SkillEvaluationsService } from "./skill-evaluations.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("SkillEvaluationsService", () => {
  let service: SkillEvaluationsService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    skillEvaluation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    skillDimension: {
      groupBy: jest.fn(),
    },
    clubMember: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof mockPrisma) => Promise<unknown>) =>
      cb(mockPrisma),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillEvaluationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SkillEvaluationsService>(SkillEvaluationsService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== createEvaluation ====================

  describe("createEvaluation", () => {
    const coachId = "coach-1";
    const dto = {
      memberId: "member-1",
      evaluationDate: "2026-04-10",
      overallScore: 85,
      coachComment: "잘하고 있습니다.",
      improvementAreas: "슛팅 정확도 향상 필요",
      dimensions: [
        { dimensionName: "스케이팅", score: 80 },
        { dimensionName: "슛팅", score: 70, comment: "힘이 좋음" },
      ],
    };

    it("정상적으로 평가를 생성한다 (5축 점수 포함)", async () => {
      mockPrisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1",
        team: { coachId: "coach-1" },
      });
      mockPrisma.skillEvaluation.create.mockResolvedValue({
        id: "eval-1",
        evaluationDate: new Date("2026-04-10"),
        overallScore: 85,
        status: "draft",
        dimensions: [
          { dimensionName: "스케이팅", score: 80 },
          { dimensionName: "슛팅", score: 70 },
        ],
      });

      const result = await service.createEvaluation(dto as any, coachId);

      expect(result.id).toBe("eval-1");
      expect(result.status).toBe("draft");
      expect(mockPrisma.skillEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberId: "member-1",
            coachId: "coach-1",
            overallScore: 85,
            status: "draft",
          }),
        }),
      );
    });

    it("존재하지 않는 멤버 ID로 생성 시 NotFoundException", async () => {
      mockPrisma.clubMember.findUnique.mockResolvedValue(null);

      await expect(
        service.createEvaluation(dto as any, coachId),
      ).rejects.toThrow(NotFoundException);
    });

    it("해당 클럽의 코치가 아니면 ForbiddenException", async () => {
      mockPrisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1",
        team: { coachId: "other-coach" },
      });

      await expect(
        service.createEvaluation(dto as any, coachId),
      ).rejects.toThrow(ForbiddenException);
    });

    it("유효하지 않은 날짜 형식이면 BadRequestException", async () => {
      mockPrisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1",
        team: { coachId: "coach-1" },
      });

      const badDto = { ...dto, evaluationDate: "invalid-date" };

      await expect(
        service.createEvaluation(badDto as any, coachId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== getEvaluationById ====================

  describe("getEvaluationById", () => {
    const evalId = "eval-1";

    const mockEvaluation = {
      id: "eval-1",
      evaluationDate: new Date("2026-04-10"),
      overallScore: 85,
      coachComment: "잘하고 있습니다.",
      improvementAreas: "슛팅",
      status: "published",
      coachId: "coach-1",
      member: { userId: "user-1", team: { coachId: "coach-1" } },
      dimensions: [{ id: "dim-1", dimensionName: "스케이팅", score: 80 }],
    };

    it("본인(member) 조회 시 정상 반환", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue(mockEvaluation);

      const result = await service.getEvaluationById(evalId, "user-1", "TEEN");

      expect(result.id).toBe("eval-1");
      expect(result.overallScore).toBe(85);
    });

    it("코치(작성자) 조회 시 정상 반환", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue(mockEvaluation);

      const result = await service.getEvaluationById(
        evalId,
        "coach-1",
        "COACH",
      );

      expect(result.id).toBe("eval-1");
    });

    it("ADMIN 역할 조회 시 정상 반환", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue(mockEvaluation);

      const result = await service.getEvaluationById(
        evalId,
        "admin-1",
        "ADMIN",
      );

      expect(result.id).toBe("eval-1");
    });

    it("존재하지 않는 ID이면 NotFoundException", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue(null);

      await expect(
        service.getEvaluationById("not-exist", "user-1", "TEEN"),
      ).rejects.toThrow(NotFoundException);
    });

    it("권한 없는 사용자 조회 시 ForbiddenException", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue(mockEvaluation);

      await expect(
        service.getEvaluationById(evalId, "stranger-1", "PARENT"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== getMemberEvaluations ====================

  describe("getMemberEvaluations", () => {
    const memberId = "member-1";

    it("코치가 회원별 평가 목록을 조회한다", async () => {
      mockPrisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1",
        team: { coachId: "coach-1" },
      });
      mockPrisma.skillEvaluation.findMany.mockResolvedValue([
        {
          id: "eval-1",
          evaluationDate: new Date(),
          overallScore: 80,
          status: "published",
          dimensions: [],
        },
        {
          id: "eval-2",
          evaluationDate: new Date(),
          overallScore: 90,
          status: "draft",
          dimensions: [],
        },
      ]);

      const result = await service.getMemberEvaluations(
        memberId,
        "coach-1",
        "COACH",
      );

      expect(result).toHaveLength(2);
      expect(mockPrisma.skillEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { memberId },
          orderBy: { evaluationDate: "desc" },
        }),
      );
    });

    it("ADMIN 역할은 조회 권한이 있다", async () => {
      mockPrisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1",
        team: { coachId: "other-coach" },
      });
      mockPrisma.skillEvaluation.findMany.mockResolvedValue([]);

      const result = await service.getMemberEvaluations(
        memberId,
        "admin-1",
        "ADMIN",
      );

      expect(result).toEqual([]);
    });

    it("존재하지 않는 멤버이면 NotFoundException", async () => {
      mockPrisma.clubMember.findUnique.mockResolvedValue(null);

      await expect(
        service.getMemberEvaluations("not-exist", "coach-1", "COACH"),
      ).rejects.toThrow(NotFoundException);
    });

    it("권한 없는 사용자 조회 시 ForbiddenException", async () => {
      mockPrisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1",
        team: { coachId: "other-coach" },
      });

      await expect(
        service.getMemberEvaluations(memberId, "stranger-1", "PARENT"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== publishEvaluation ====================

  describe("publishEvaluation", () => {
    const evalId = "eval-1";
    const coachId = "coach-1";

    it("정상적으로 draft -> published 전환", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue({
        coachId: "coach-1",
        status: "draft",
      });
      mockPrisma.skillEvaluation.update.mockResolvedValue({
        id: evalId,
        status: "published",
      });

      const result = await service.publishEvaluation(evalId, coachId);

      expect(result.message).toBe("평가가 공개되었습니다.");
      expect(mockPrisma.skillEvaluation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: evalId },
          data: { status: "published" },
        }),
      );
    });

    it("이미 published 상태이면 '이미 공개' 메시지 반환", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue({
        coachId: "coach-1",
        status: "published",
      });

      const result = await service.publishEvaluation(evalId, coachId);

      expect(result.message).toBe("이미 공개된 평가입니다.");
      expect(mockPrisma.skillEvaluation.update).not.toHaveBeenCalled();
    });

    it("존재하지 않는 평가이면 NotFoundException", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue(null);

      await expect(
        service.publishEvaluation("not-exist", coachId),
      ).rejects.toThrow(NotFoundException);
    });

    it("본인이 작성하지 않은 평가이면 ForbiddenException", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue({
        coachId: "other-coach",
        status: "draft",
      });

      await expect(service.publishEvaluation(evalId, coachId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ==================== getClubStats ====================

  describe("getClubStats", () => {
    it("전체 통계를 정상 반환한다 (평균 점수, 평가 수, 축별 평균, 추이)", async () => {
      mockPrisma.skillEvaluation.aggregate.mockResolvedValue({
        _count: { id: 25 },
        _avg: { overallScore: 78.5 },
      });
      mockPrisma.skillDimension.groupBy.mockResolvedValue([
        {
          dimensionName: "스케이팅",
          _avg: { score: 82.3 },
          _count: { id: 25 },
        },
        { dimensionName: "슛팅", _avg: { score: 70.1 }, _count: { id: 25 } },
      ]);
      mockPrisma.skillEvaluation.findMany.mockResolvedValue([
        { evaluationDate: new Date("2026-04-01"), overallScore: 80 },
        { evaluationDate: new Date("2026-04-01"), overallScore: 90 },
        { evaluationDate: new Date("2026-04-02"), overallScore: 75 },
      ]);

      const result = await service.getClubStats();

      expect(result.totalEvaluations).toBe(25);
      expect(result.averageOverallScore).toBe(78.5);
      expect(result.dimensionAverages["스케이팅"]).toBe(82.3);
      expect(result.dimensionAverages["슛팅"]).toBe(70.1);
      expect(result.recentTrend).toHaveLength(2);
      expect(result.recentTrend[0].date).toBe("2026-04-01");
      expect(result.recentTrend[0].count).toBe(2);
      expect(result.recentTrend[0].avgScore).toBe(85);
    });

    it("평가가 없을 때 0 기본값 반환", async () => {
      mockPrisma.skillEvaluation.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _avg: { overallScore: null },
      });
      mockPrisma.skillDimension.groupBy.mockResolvedValue([]);
      mockPrisma.skillEvaluation.findMany.mockResolvedValue([]);

      const result = await service.getClubStats();

      expect(result.totalEvaluations).toBe(0);
      expect(result.averageOverallScore).toBe(0);
      expect(result.dimensionAverages).toEqual({});
      expect(result.recentTrend).toEqual([]);
    });
  });

  // ==================== getCoachStats ====================

  describe("getCoachStats", () => {
    const coachId = "coach-1";

    it("코치별 통계를 정상 반환한다", async () => {
      mockPrisma.skillEvaluation.aggregate.mockResolvedValue({
        _count: { id: 10 },
        _avg: { overallScore: 82.0 },
      });
      mockPrisma.skillDimension.groupBy.mockResolvedValue([
        { dimensionName: "패싱", _avg: { score: 85.0 }, _count: { id: 10 } },
      ]);
      mockPrisma.skillEvaluation.findMany.mockResolvedValue([
        { evaluationDate: new Date("2026-04-05"), overallScore: 82 },
      ]);

      const result = await service.getCoachStats(coachId);

      expect(result.coachId).toBe(coachId);
      expect(result.totalEvaluations).toBe(10);
      expect(result.averageOverallScore).toBe(82);
      expect(result.dimensionAverages["패싱"]).toBe(85);
      expect(result.recentTrend).toHaveLength(1);
    });

    it("해당 코치의 평가 기록이 없으면 NotFoundException", async () => {
      mockPrisma.skillEvaluation.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _avg: { overallScore: null },
      });

      await expect(service.getCoachStats(coachId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== deleteEvaluation ====================

  describe("deleteEvaluation", () => {
    const evalId = "eval-1";

    it("작성자(코치)가 정상적으로 삭제한다", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue({
        id: "eval-1",
        coachId: "coach-1",
      });
      mockPrisma.skillEvaluation.delete.mockResolvedValue({ id: "eval-1" });

      const result = await service.deleteEvaluation(evalId, "coach-1", "COACH");

      expect(result.message).toBe("기술 평가가 삭제되었습니다.");
      expect(mockPrisma.skillEvaluation.delete).toHaveBeenCalledWith({
        where: { id: evalId },
      });
    });

    it("ADMIN 역할은 타인 작성 평가도 삭제 가능", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue({
        id: "eval-1",
        coachId: "other-coach",
      });
      mockPrisma.skillEvaluation.delete.mockResolvedValue({ id: "eval-1" });

      const result = await service.deleteEvaluation(evalId, "admin-1", "ADMIN");

      expect(result.message).toBe("기술 평가가 삭제되었습니다.");
    });

    it("DIRECTOR 역할은 타인 작성 평가도 삭제 가능", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue({
        id: "eval-1",
        coachId: "other-coach",
      });
      mockPrisma.skillEvaluation.delete.mockResolvedValue({ id: "eval-1" });

      const result = await service.deleteEvaluation(
        evalId,
        "director-1",
        "DIRECTOR",
      );

      expect(result.message).toBe("기술 평가가 삭제되었습니다.");
    });

    it("존재하지 않는 평가이면 NotFoundException", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteEvaluation("not-exist", "coach-1", "COACH"),
      ).rejects.toThrow(NotFoundException);
    });

    it("소유권 없는 사용자(비관리자)가 삭제 시 ForbiddenException", async () => {
      mockPrisma.skillEvaluation.findUnique.mockResolvedValue({
        id: "eval-1",
        coachId: "coach-1",
      });

      await expect(
        service.deleteEvaluation(evalId, "stranger-1", "COACH"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== getLatestEvaluation ====================

  describe("getLatestEvaluation", () => {
    const userId = "user-1";

    it("최신 published 평가를 RadarChart 형식으로 반환한다", async () => {
      mockPrisma.clubMember.findFirst.mockResolvedValue({ id: "member-1" });
      mockPrisma.skillEvaluation.findFirst.mockResolvedValue({
        id: "eval-1",
        evaluationDate: new Date("2026-04-10T10:00:00Z"),
        overallScore: 85,
        coachComment: "훌륭합니다.",
        improvementAreas: "슛팅",
        status: "published",
        member: {
          team: {
            coachId: "coach-1",
            coaches: [{ user: { firstName: "민수", lastName: "김" } }],
          },
        },
        dimensions: [
          {
            dimensionName: "스케이팅",
            score: 80,
            comment: null,
            previousScore: 70,
            improvement: 10,
          },
          {
            dimensionName: "슛팅",
            score: 60,
            comment: null,
            previousScore: 50,
            improvement: 10,
          },
        ],
      });

      const result = await service.getLatestEvaluation(userId);

      expect(result.skillData.skating).toBe(4);
      expect(result.skillData.shooting).toBe(3);
      expect(result.coachInfo.name).toBe("김민수");
      expect(result.coachInfo.evaluationDate).toBe("2026.04.10");
      expect(result.comment.content).toBe("훌륭합니다.");
      expect(result.overallScore).toBe(85);
    });

    it("클럽 회원이 아닌 경우 NotFoundException", async () => {
      mockPrisma.clubMember.findFirst.mockResolvedValue(null);

      await expect(service.getLatestEvaluation(userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("published 평가가 없으면 NotFoundException", async () => {
      mockPrisma.clubMember.findFirst.mockResolvedValue({ id: "member-1" });
      mockPrisma.skillEvaluation.findFirst.mockResolvedValue(null);

      await expect(service.getLatestEvaluation(userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== getPlayerGrade ====================

  describe("getPlayerGrade", () => {
    const childId = "child-1";

    it("상위 20% 이상이면 grade 1 반환", async () => {
      mockPrisma.clubMember.findFirst.mockResolvedValue({
        id: "member-1",
        teamId: "club-1",
      });
      // 본인 평가: 평균 95
      mockPrisma.skillEvaluation.findMany
        .mockResolvedValueOnce([{ overallScore: 95 }])
        // 다른 멤버들 평가 (loop 순회)
        .mockResolvedValueOnce([{ overallScore: 95 }]) // member-1 (본인)
        .mockResolvedValueOnce([{ overallScore: 60 }]) // member-2
        .mockResolvedValueOnce([{ overallScore: 50 }]) // member-3
        .mockResolvedValueOnce([{ overallScore: 40 }]) // member-4
        .mockResolvedValueOnce([{ overallScore: 30 }]); // member-5
      mockPrisma.clubMember.findMany.mockResolvedValue([
        { id: "member-1" },
        { id: "member-2" },
        { id: "member-3" },
        { id: "member-4" },
        { id: "member-5" },
      ]);

      const result = await service.getPlayerGrade(childId);

      expect(result.grade).toBe(1);
      expect(result.totalScore).toBe(95);
      expect(result.percentile).toBe(100);
      expect(result.evaluationCount).toBe(1);
    });

    it("클럽 회원이 아닌 경우 NotFoundException", async () => {
      mockPrisma.clubMember.findFirst.mockResolvedValue(null);

      await expect(service.getPlayerGrade(childId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("공개된 평가가 없으면 NotFoundException", async () => {
      mockPrisma.clubMember.findFirst.mockResolvedValue({
        id: "member-1",
        teamId: "club-1",
      });
      mockPrisma.skillEvaluation.findMany.mockResolvedValue([]);

      await expect(service.getPlayerGrade(childId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
