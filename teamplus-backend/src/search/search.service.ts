import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import {
  resolveViewerBirthYears,
  buildBirthYearWhere,
  type ViewerLike,
} from "@/common/utils/viewer-birth-years.util";

type SearchType = "all" | "clubs" | "classes" | "coaches" | "notices";

export type TrendType = "up" | "new" | "stable";

export interface PopularKeyword {
  rank: number;
  keyword: string;
  trend: TrendType;
}

export interface PopularKeywordsResponse {
  keywords: PopularKeyword[];
  updatedAt: string;
}

const STATIC_POPULAR_KEYWORDS: readonly string[] = [
  "스케이팅",
  "아이스하키",
  "초급반",
  "주니어",
  "코치 추천",
] as const;

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /**
   * 인기 검색어 — 회원수 기준 상위 클럽명 + 신규 수업명 + 정적 폴백 키워드를 결합.
   * Public 엔드포인트(`GET /api/v1/search/popular`)에서 사용.
   * Phase 1: 정적 + 동적 단순 결합, 추후 검색 로그 집계 기반으로 고도화.
   */
  async getPopularKeywords(limit = 10): Promise<PopularKeywordsResponse> {
    const result: PopularKeyword[] = [];

    // 1) 회원수 상위 클럽(Team) 3개 (가입 활발 → "up" 트렌드)
    try {
      const topTeams = await this.prisma.team.findMany({
        select: {
          name: true,
          _count: {
            select: { members: { where: { approvalStatus: "approved" } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const sorted = topTeams
        .filter((t) => t.name && t._count.members > 0)
        .sort((a, b) => b._count.members - a._count.members)
        .slice(0, 3);
      sorted.forEach((team, idx) => {
        result.push({
          rank: idx + 1,
          keyword: team.name,
          trend: idx === 0 ? "up" : "stable",
        });
      });
    } catch {
      // 팀 조회 실패 무시 — 정적 폴백으로 진행
    }

    // 2) 최근 신규 활성 수업 2개 (NEW 트렌드)
    try {
      const recentClasses = await this.prisma.class.findMany({
        where: { isActive: true },
        select: { className: true },
        orderBy: { createdAt: "desc" },
        take: 2,
      });
      recentClasses.forEach((cls) => {
        if (cls.className && !result.some((r) => r.keyword === cls.className)) {
          result.push({
            rank: result.length + 1,
            keyword: cls.className,
            trend: "new",
          });
        }
      });
    } catch {
      // 수업 조회 실패 무시
    }

    // 3) 정적 폴백 키워드로 limit 만큼 채움
    for (const k of STATIC_POPULAR_KEYWORDS) {
      if (result.length >= limit) break;
      if (!result.some((r) => r.keyword === k)) {
        result.push({
          rank: result.length + 1,
          keyword: k,
          trend: "stable",
        });
      }
    }

    return {
      keywords: result.slice(0, limit),
      updatedAt: new Date().toISOString(),
    };
  }

  async search(
    q: string,
    type: SearchType = "all",
    limit = 20,
    offset = 0,
    user?: ViewerLike,
  ) {
    const results: Record<string, any> = {};
    const searchTerm = q.trim();

    if (!searchTerm) {
      return { query: q, total: 0, results: {} };
    }

    const tasks: Promise<void>[] = [];

    if (type === "all" || type === "clubs") {
      tasks.push(
        this.searchClubs(searchTerm, limit, offset).then((data) => {
          results.clubs = data;
        }),
      );
    }

    if (type === "all" || type === "classes") {
      tasks.push(
        this.searchClasses(searchTerm, limit, offset, user).then((data) => {
          results.classes = data;
        }),
      );
    }

    if (type === "all" || type === "coaches") {
      tasks.push(
        this.searchCoaches(searchTerm, limit, offset).then((data) => {
          results.coaches = data;
        }),
      );
    }

    if (type === "all" || type === "notices") {
      tasks.push(
        this.searchNotices(searchTerm, limit, offset).then((data) => {
          results.notices = data;
        }),
      );
    }

    await Promise.all(tasks);

    const total = Object.values(results).reduce(
      (sum: number, category: any) => sum + (category?.total ?? 0),
      0,
    );

    return { query: q, total, results };
  }

  private async searchClubs(q: string, limit: number, offset: number) {
    const where = {
      OR: [{ name: { contains: q } }, { location: { contains: q } }],
    };

    const [items, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        select: {
          id: true,
          teamCode: true,
          name: true,
          location: true,
          phone: true,
          createdAt: true,
          coach: { select: { firstName: true, lastName: true } },
          _count: {
            select: {
              members: { where: { approvalStatus: "approved" } },
            },
          },
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.team.count({ where }),
    ]);

    return {
      total,
      items: items.map((club) => ({
        type: "club" as const,
        id: club.id,
        teamCode: club.teamCode,
        title: club.name,
        subtitle: club.location ?? "",
        coachName: club.coach
          ? `${club.coach.lastName}${club.coach.firstName}`.trim()
          : "",
        memberCount: club._count.members,
        createdAt: club.createdAt,
      })),
    };
  }

  private async searchClasses(
    q: string,
    limit: number,
    offset: number,
    user?: ViewerLike,
  ) {
    // 연령 노출 필터 — 로그인한 PARENT/CHILD/TEEN 만 본인/자녀 출생연도 대상 수업으로 제한.
    //   비로그인(@Public) 또는 그 외 역할은 전체 노출(검색은 발견 목적). 결제는 별도 최종 방어선이 차단.
    const birthYears = await resolveViewerBirthYears(this.prisma, user);
    const ageWhere = buildBirthYearWhere(birthYears);
    const where: Prisma.ClassWhereInput = {
      OR: [
        { className: { contains: q } },
        { description: { contains: q } },
        { instructorName: { contains: q } },
      ],
      isActive: true,
      ...(ageWhere ? { AND: [ageWhere] } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.class.findMany({
        where,
        select: {
          id: true,
          className: true,
          description: true,
          instructorName: true,
          capacity: true,
          ageMin: true,
          ageMax: true,
          targetBirthYears: true,
          startTime: true,
          endTime: true,
          createdAt: true,
          team: { select: { name: true, location: true } },
        },
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.class.count({ where }),
    ]);

    return {
      total,
      items: items.map((cls) => ({
        type: "class" as const,
        id: cls.id,
        title: cls.className,
        subtitle: cls.team?.name ?? "",
        description: cls.description,
        location: cls.team?.location,
        instructorName: cls.instructorName,
        capacity: cls.capacity,
        ageMin: cls.ageMin,
        ageMax: cls.ageMax,
        targetBirthYears: cls.targetBirthYears,
        startTime: cls.startTime,
        endTime: cls.endTime,
        createdAt: cls.createdAt,
      })),
    };
  }

  private async searchCoaches(q: string, limit: number, offset: number) {
    const where = {
      userType: "COACH" as const,
      OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }],
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          coachProfile: {
            select: {
              team: { select: { name: true } },
            },
          },
        },
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      total,
      items: items.map((user) => {
        return {
          type: "coach" as const,
          id: user.id,
          title: `${user.lastName}${user.firstName}`.trim(),
          name: user.coachProfile?.team?.name ?? "",
        };
      }),
    };
  }

  private async searchNotices(q: string, limit: number, offset: number) {
    const where = {
      OR: [{ title: { contains: q } }, { content: { contains: q } }],
      isActive: true,
    };

    const [items, total] = await Promise.all([
      this.prisma.systemNotice.findMany({
        where,
        select: {
          id: true,
          title: true,
          content: true,
          targetType: true,
          priority: true,
          createdAt: true,
        },
        take: limit,
        skip: offset,
        orderBy: { priority: "desc" },
      }),
      this.prisma.systemNotice.count({ where }),
    ]);

    return {
      total,
      items: items.map((notice) => ({
        type: "notice" as const,
        id: notice.id,
        title: notice.title,
        description: notice.content.slice(0, 100),
        targetType: notice.targetType,
        createdAt: notice.createdAt,
      })),
    };
  }
}
