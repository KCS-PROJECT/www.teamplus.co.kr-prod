import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { CreateSkillEvaluationDto } from "./dto/create-skill-evaluation.dto";

/**
 * 기술평가 조회 요청자 컨텍스트 (소유권/클럽 스코프 검증용).
 */
export interface EvalActor {
  id: string;
  userType?: string;
}

@Injectable()
export class SkillEvaluationsService {
  private readonly logger = new Logger(SkillEvaluationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * [2026-06-10 SECURITY] 학생 기술평가 조회 권한 검증 (IDOR 차단).
   *   본인 / 부모-자녀 / 조직 관리자 / 같은 클럽 코치만 타 학생 평가·등급 조회 가능.
   *   기존엔 검증이 없어 임의 userId 로 타 학생 리포트·등급 열람 가능했음.
   */
  private async assertCanViewEvaluation(
    requester: EvalActor | undefined,
    targetUserId: string,
  ): Promise<void> {
    if (!requester?.id) {
      throw new ForbiddenException("기술 평가를 조회할 권한이 없습니다.");
    }
    if (requester.id === targetUserId) return;
    if (
      isAdminRole(requester.userType) ||
      requester.userType === "DIRECTOR" ||
      requester.userType === "ACADEMY_DIRECTOR"
    ) {
      return;
    }

    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: requester.id, childId: targetUserId },
      },
      select: { id: true },
    });
    if (parentChild) return;

    if (requester.userType === "COACH") {
      const memberTeam = await this.prisma.teamMember.findFirst({
        where: {
          userId: targetUserId,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
        select: { teamId: true },
      });
      if (memberTeam?.teamId) {
        const [owner, approvedCoach] = await Promise.all([
          this.prisma.team.findFirst({
            where: { id: memberTeam.teamId, coachId: requester.id },
            select: { id: true },
          }),
          this.prisma.teamMember.findFirst({
            where: {
              userId: requester.id,
              teamId: memberTeam.teamId,
              approvalStatus: "approved",
              leftAt: null,
              roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
            },
            select: { id: true },
          }),
        ]);
        if (owner || approvedCoach) return;
      }
    }

    throw new ForbiddenException(
      "해당 학생의 기술 평가를 조회할 권한이 없습니다.",
    );
  }

  /**
   * 최신 기술 평가 조회 (학생 본인 - 가장 최근 published 평가)
   * managementService.getSkillReport() → GET /reports/skill/latest 를 위한 로직
   */
  async getLatestEvaluation(userId: string, requester?: EvalActor) {
    // [2026-06-10 SECURITY] 본인 외 조회 시 소유권/클럽 스코프 검증 (requester 전달 시).
    if (requester) {
      await this.assertCanViewEvaluation(requester, userId);
    }
    // 먼저 userId로 ClubMember 조회
    // roleInTeam: PLAYER 명시 — 기술 평가는 선수(PLAYER)만 대상, 학부모(PARENT) 제외
    const member = await this.prisma.teamMember.findFirst({
      where: { userId, roleInTeam: "PLAYER", approvalStatus: "approved" },
      orderBy: { joinedAt: "desc" },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException("클럽 회원 정보를 찾을 수 없습니다.");
    }

    const evaluation = await this.prisma.skillEvaluation.findFirst({
      where: { memberId: member.id, status: "published" },
      orderBy: { evaluationDate: "desc" },
      select: {
        id: true,
        evaluationDate: true,
        overallScore: true,
        coachComment: true,
        improvementAreas: true,
        status: true,
        member: {
          select: {
            team: {
              select: {
                coachId: true,
                coaches: {
                  select: {
                    user: { select: { firstName: true, lastName: true } },
                  },
                  take: 1,
                },
              },
            },
          },
        },
        dimensions: {
          select: {
            dimensionName: true,
            score: true,
            comment: true,
            previousScore: true,
            improvement: true,
          },
        },
      },
    });

    if (!evaluation) {
      throw new NotFoundException("기술 평가 리포트가 없습니다.");
    }

    // 프론트가 기대하는 RadarChart 데이터 형식으로 변환
    const skillData: Record<string, number> = {};
    const DIMENSION_MAP: Record<string, string> = {
      스케이팅: "skating",
      퍽핸들링: "puckHandling",
      패싱: "passing",
      슛팅: "shooting",
      게임운영: "gameManagement",
    };
    for (const dim of evaluation.dimensions) {
      const key = DIMENSION_MAP[dim.dimensionName] ?? dim.dimensionName;
      skillData[key] = Math.round((dim.score / 100) * 5 * 10) / 10; // 100점 → 5점 스케일 변환
    }

    const coach = evaluation.member?.team?.coaches?.[0];
    const coachName = coach?.user
      ? `${coach.user.lastName}${coach.user.firstName}`
      : "코치";

    // 팀 평균 계산 — 같은 클럽의 다른 회원들의 최신 published 평가 dimensions 평균
    const memberClub = await this.prisma.teamMember.findUnique({
      where: { id: member.id },
      select: { teamId: true },
    });

    const teamAvgMap: Record<string, number> = {};
    if (memberClub?.teamId) {
      // roleInTeam: PLAYER 명시 — 팀 평균은 선수끼리만 비교, 학부모(PARENT) 제외
      const teamMembers = await this.prisma.teamMember.findMany({
        where: {
          teamId: memberClub.teamId,
          id: { not: member.id },
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
        select: { id: true },
      });

      if (teamMembers.length > 0) {
        const teamEvals = await this.prisma.skillEvaluation.findMany({
          where: {
            memberId: { in: teamMembers.map((m) => m.id) },
            status: "published",
          },
          orderBy: { evaluationDate: "desc" },
          distinct: ["memberId"],
          select: {
            dimensions: { select: { dimensionName: true, score: true } },
          },
        });

        const dimTotals: Record<string, { total: number; count: number }> = {};
        for (const ev of teamEvals) {
          for (const dim of ev.dimensions) {
            const key = DIMENSION_MAP[dim.dimensionName] ?? dim.dimensionName;
            if (!dimTotals[key]) dimTotals[key] = { total: 0, count: 0 };
            dimTotals[key].total += dim.score;
            dimTotals[key].count += 1;
          }
        }
        for (const [key, val] of Object.entries(dimTotals)) {
          teamAvgMap[key] = Math.round(val.total / val.count);
        }
      }
    }

    // dimensions에 teamAvg 추가
    const dimensionsWithTeamAvg = evaluation.dimensions.map((dim) => {
      const key = DIMENSION_MAP[dim.dimensionName] ?? dim.dimensionName;
      return {
        ...dim,
        teamAvg: teamAvgMap[key] ?? 0,
      };
    });

    return {
      skillData,
      coachInfo: {
        name: coachName,
        role: "Coach",
        evaluationDate: evaluation.evaluationDate
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "."),
      },
      comment: {
        content: evaluation.coachComment ?? "",
        date: evaluation.evaluationDate
          .toISOString()
          .slice(0, 16)
          .replace("T", " "),
      },
      overallScore: evaluation.overallScore,
      improvementAreas: evaluation.improvementAreas,
      dimensions: dimensionsWithTeamAvg,
      teamAvg: teamAvgMap,
    };
  }

  /**
   * 평가 상세 조회
   */
  async getEvaluationById(
    id: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const evaluation = await this.prisma.skillEvaluation.findUnique({
      where: { id },
      select: {
        id: true,
        evaluationDate: true,
        overallScore: true,
        coachComment: true,
        improvementAreas: true,
        status: true,
        coachId: true,
        member: {
          select: { userId: true, team: { select: { coachId: true } } },
        },
        dimensions: {
          select: {
            id: true,
            dimensionName: true,
            score: true,
            comment: true,
            previousScore: true,
            improvement: true,
          },
        },
      },
    });

    if (!evaluation) {
      throw new NotFoundException("기술 평가를 찾을 수 없습니다.");
    }

    // 권한 확인: 본인, 코치(작성자), 관리자만 열람 가능
    const isOwner = evaluation.member.userId === requesterId;
    const isCoach = evaluation.coachId === requesterId;
    const isAdmin = ["ADMIN", "DIRECTOR"].includes(requesterRole);

    if (!isOwner && !isCoach && !isAdmin) {
      throw new ForbiddenException("열람 권한이 없습니다.");
    }

    // draft는 코치/관리자만 열람
    if (evaluation.status === "draft" && isOwner && !isCoach && !isAdmin) {
      throw new ForbiddenException("공개되지 않은 평가입니다.");
    }

    return evaluation;
  }

  /**
   * 평가 생성 (COACH만)
   */
  async createEvaluation(dto: CreateSkillEvaluationDto, coachId: string) {
    // 멤버 존재 확인
    const member = await this.prisma.teamMember.findUnique({
      where: { id: dto.memberId },
      select: { id: true, team: { select: { coachId: true } } },
    });

    if (!member) {
      throw new NotFoundException("클럽 멤버를 찾을 수 없습니다.");
    }

    // 해당 클럽의 코치인지 확인
    if (member.team.coachId !== coachId) {
      throw new ForbiddenException(
        "해당 클럽의 코치만 평가를 작성할 수 있습니다.",
      );
    }

    const evaluationDate = new Date(dto.evaluationDate);
    if (isNaN(evaluationDate.getTime())) {
      throw new BadRequestException("유효하지 않은 날짜 형식입니다.");
    }

    return this.prisma.skillEvaluation.create({
      data: {
        memberId: dto.memberId,
        coachId,
        classId: dto.classId,
        evaluationDate,
        overallScore: dto.overallScore,
        coachComment: dto.coachComment,
        improvementAreas: dto.improvementAreas,
        status: "draft",
        dimensions: dto.dimensions
          ? {
              create: dto.dimensions.map((dim) => ({
                dimensionName: dim.dimensionName,
                score: dim.score,
                comment: dim.comment,
              })),
            }
          : undefined,
      },
      select: {
        id: true,
        evaluationDate: true,
        overallScore: true,
        status: true,
        dimensions: {
          select: { dimensionName: true, score: true },
        },
      },
    });
  }

  /**
   * 평가 공개 처리 (COACH만)
   */
  async publishEvaluation(id: string, coachId: string) {
    const evaluation = await this.prisma.skillEvaluation.findUnique({
      where: { id },
      select: { coachId: true, status: true },
    });

    if (!evaluation) {
      throw new NotFoundException("기술 평가를 찾을 수 없습니다.");
    }

    if (evaluation.coachId !== coachId) {
      throw new ForbiddenException("본인이 작성한 평가만 공개할 수 있습니다.");
    }

    if (evaluation.status === "published") {
      return { message: "이미 공개된 평가입니다." };
    }

    await this.prisma.skillEvaluation.update({
      where: { id },
      data: { status: "published" },
    });

    return { message: "평가가 공개되었습니다." };
  }

  /**
   * 선수 등급 조회 (childId = User ID)
   * - 해당 멤버의 모든 published SkillEvaluation 평균 overallScore 계산
   * - 같은 클럽 전체 멤버의 평균 점수들과 비교하여 percentile 산출
   * - percentile >= 80 → grade 1, >= 50 → grade 2, else → grade 3
   */
  async getPlayerGrade(childId: string, requester?: EvalActor) {
    // [2026-06-10 SECURITY] 본인 외 조회 시 소유권/클럽 스코프 검증 (requester 전달 시).
    if (requester) {
      await this.assertCanViewEvaluation(requester, childId);
    }
    // 1. childId(User ID)로 ClubMember 조회
    // roleInTeam: PLAYER 명시 — 선수 등급 조회는 선수(PLAYER)만 대상, 학부모(PARENT) 제외
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId: childId,
        roleInTeam: "PLAYER",
        approvalStatus: "approved",
      },
      orderBy: { joinedAt: "desc" },
      select: { id: true, teamId: true },
    });

    if (!member) {
      throw new NotFoundException("클럽 회원 정보를 찾을 수 없습니다.");
    }

    // 2. 해당 멤버의 모든 published 평가 조회
    const myEvaluations = await this.prisma.skillEvaluation.findMany({
      where: { memberId: member.id, status: "published" },
      select: { overallScore: true },
    });

    if (myEvaluations.length === 0) {
      throw new NotFoundException("공개된 기술 평가가 없습니다.");
    }

    // 3. 내 평균 점수 계산
    const totalScore =
      myEvaluations.reduce((sum, e) => sum + e.overallScore, 0) /
      myEvaluations.length;

    // 4. 같은 클럽의 모든 선수(PLAYER) 멤버 조회 — 퍼센타일 비교 대상은 선수만
    // roleInTeam: PLAYER 명시 — 학부모(PARENT)를 비교 대상에서 제외
    const clubMembers = await this.prisma.teamMember.findMany({
      where: {
        teamId: member.teamId,
        roleInTeam: "PLAYER",
        approvalStatus: "approved",
      },
      select: { id: true },
    });

    // 5. 각 멤버별 평균 overallScore 계산 — 벌크 조회로 N+1 제거
    const memberIds = clubMembers.map((cm) => cm.id);
    const allEvals = await this.prisma.skillEvaluation.findMany({
      where: { memberId: { in: memberIds }, status: "published" },
      select: { memberId: true, overallScore: true },
    });

    // memberId별 점수 누적
    const scoresByMember = new Map<string, number[]>();
    for (const ev of allEvals) {
      const arr = scoresByMember.get(ev.memberId) ?? [];
      arr.push(ev.overallScore);
      scoresByMember.set(ev.memberId, arr);
    }

    const memberAverages: number[] = [];
    for (const scores of scoresByMember.values()) {
      if (scores.length > 0) {
        const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        memberAverages.push(avg);
      }
    }

    // 6. percentile 산출: 나보다 점수가 낮은 멤버 비율
    const belowCount = memberAverages.filter((avg) => avg < totalScore).length;
    const percentile =
      memberAverages.length > 1
        ? Math.round((belowCount / (memberAverages.length - 1)) * 100)
        : 50; // 평가 대상이 본인뿐이면 중간값

    // 7. 등급 결정
    let grade: number;
    if (percentile >= 80) {
      grade = 1; // 상위 20%
    } else if (percentile >= 50) {
      grade = 2; // 상위 50%
    } else {
      grade = 3; // 하위 50%
    }

    return {
      grade,
      totalScore: Math.round(totalScore * 10) / 10,
      percentile,
      evaluationCount: myEvaluations.length,
    };
  }

  /**
   * 회원별 평가 이력 조회 (COACH/ADMIN)
   */
  async getMemberEvaluations(
    memberId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { id: true, team: { select: { coachId: true } } },
    });

    if (!member) {
      throw new NotFoundException("클럽 멤버를 찾을 수 없습니다.");
    }

    const isCoach = member.team.coachId === requesterId;
    const isAdmin = ["ADMIN", "DIRECTOR"].includes(requesterRole);

    if (!isCoach && !isAdmin) {
      throw new ForbiddenException("열람 권한이 없습니다.");
    }

    return this.prisma.skillEvaluation.findMany({
      where: { memberId },
      orderBy: { evaluationDate: "desc" },
      select: {
        id: true,
        evaluationDate: true,
        overallScore: true,
        status: true,
        dimensions: {
          select: { dimensionName: true, score: true },
        },
      },
    });
  }

  // ==================== 통계 ====================

  /**
   * 클럽 전체 기술 평가 통계
   * - 전체 평균 점수, 평가 수
   * - 축별 평균 점수
   * - 최근 30일 추이 (일별 평가 수 + 평균 점수)
   */
  async getClubStats() {
    // 전체 published 평가 집계
    const aggregate = await this.prisma.skillEvaluation.aggregate({
      where: { status: "published" },
      _count: { id: true },
      _avg: { overallScore: true },
    });

    // 축별 평균 점수
    const dimensionAggregates = await this.prisma.skillDimension.groupBy({
      by: ["dimensionName"],
      _avg: { score: true },
      _count: { id: true },
      where: {
        evaluation: { status: "published" },
      },
    });

    const dimensionAverages: Record<string, number> = {};
    for (const dim of dimensionAggregates) {
      dimensionAverages[dim.dimensionName] =
        Math.round((dim._avg.score ?? 0) * 10) / 10;
    }

    // 최근 30일 추이
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentEvaluations = await this.prisma.skillEvaluation.findMany({
      where: {
        status: "published",
        evaluationDate: { gte: thirtyDaysAgo },
      },
      select: {
        evaluationDate: true,
        overallScore: true,
      },
      orderBy: { evaluationDate: "asc" },
    });

    // 일별 집계
    const dailyMap = new Map<string, { count: number; totalScore: number }>();
    for (const ev of recentEvaluations) {
      const dateKey = ev.evaluationDate.toISOString().slice(0, 10);
      const entry = dailyMap.get(dateKey) || { count: 0, totalScore: 0 };
      entry.count++;
      entry.totalScore += ev.overallScore;
      dailyMap.set(dateKey, entry);
    }

    const recentTrend = Array.from(dailyMap.entries()).map(
      ([date, { count, totalScore }]) => ({
        date,
        count,
        avgScore: Math.round((totalScore / count) * 10) / 10,
      }),
    );

    return {
      totalEvaluations: aggregate._count.id,
      averageOverallScore:
        Math.round((aggregate._avg.overallScore ?? 0) * 10) / 10,
      dimensionAverages,
      recentTrend,
    };
  }

  /**
   * 코치별 기술 평가 통계
   */
  async getCoachStats(coachId: string) {
    // 코치 확인
    const coachEvaluations = await this.prisma.skillEvaluation.aggregate({
      where: { coachId, status: "published" },
      _count: { id: true },
      _avg: { overallScore: true },
    });

    if (coachEvaluations._count.id === 0) {
      throw new NotFoundException("해당 코치의 평가 기록이 없습니다.");
    }

    // 코치가 작성한 평가의 축별 평균 점수
    const dimensionAggregates = await this.prisma.skillDimension.groupBy({
      by: ["dimensionName"],
      _avg: { score: true },
      _count: { id: true },
      where: {
        evaluation: { coachId, status: "published" },
      },
    });

    const dimensionAverages: Record<string, number> = {};
    for (const dim of dimensionAggregates) {
      dimensionAverages[dim.dimensionName] =
        Math.round((dim._avg.score ?? 0) * 10) / 10;
    }

    // 최근 30일 추이
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentEvaluations = await this.prisma.skillEvaluation.findMany({
      where: {
        coachId,
        status: "published",
        evaluationDate: { gte: thirtyDaysAgo },
      },
      select: {
        evaluationDate: true,
        overallScore: true,
      },
      orderBy: { evaluationDate: "asc" },
    });

    const dailyMap = new Map<string, { count: number; totalScore: number }>();
    for (const ev of recentEvaluations) {
      const dateKey = ev.evaluationDate.toISOString().slice(0, 10);
      const entry = dailyMap.get(dateKey) || { count: 0, totalScore: 0 };
      entry.count++;
      entry.totalScore += ev.overallScore;
      dailyMap.set(dateKey, entry);
    }

    const recentTrend = Array.from(dailyMap.entries()).map(
      ([date, { count, totalScore }]) => ({
        date,
        count,
        avgScore: Math.round((totalScore / count) * 10) / 10,
      }),
    );

    return {
      coachId,
      totalEvaluations: coachEvaluations._count.id,
      averageOverallScore:
        Math.round((coachEvaluations._avg.overallScore ?? 0) * 10) / 10,
      dimensionAverages,
      recentTrend,
    };
  }

  /**
   * 기술 평가 삭제
   * 소유권 확인: 코치는 본인 작성 평가만 삭제, ADMIN/DIRECTOR는 모두 삭제 가능
   */
  async deleteEvaluation(id: string, actorId: string, actorRole: string) {
    const evaluation = await this.prisma.skillEvaluation.findUnique({
      where: { id },
      select: { id: true, coachId: true },
    });

    if (!evaluation) {
      throw new NotFoundException("기술 평가를 찾을 수 없습니다.");
    }

    const isAdmin = ["ADMIN", "DIRECTOR"].includes(actorRole);
    const isOwner = evaluation.coachId === actorId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException("본인이 작성한 평가만 삭제할 수 있습니다.");
    }

    // 관련 SkillDimension은 onDelete: Cascade로 자동 삭제
    await this.prisma.skillEvaluation.delete({
      where: { id },
    });

    this.logger.log(
      `기술 평가 삭제: evaluationId=${id}, actorId=${actorId}, role=${actorRole}`,
    );

    return { message: "기술 평가가 삭제되었습니다." };
  }
}
