import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import {
  resolveViewerBirthYears,
  buildBirthYearWhere,
  type ViewerLike,
} from "@/common/utils/viewer-birth-years.util";
import { resolveViewerTeamIds } from "@/common/utils/team-scope.util";
import {
  publicationConditions,
} from "@/common/utils/notice-publication.util";
import { buildClassVisibilityWhere } from "@/classes/utils/class-visibility.util";
import { CLASSES_DOMAIN_TRAINING_TYPES } from "@/common/constants/class-domain.constant";

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
        this.searchNotices(searchTerm, limit, offset, user).then((data) => {
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

    // [2026-08-04] 공개범위 게이트 — 목록(/classes/explore)과 동일 규칙.
    //   기존에는 `isActive` 외에 아무 조건이 없어 (1) 미승인(PENDING) 수업과
    //   (2) 감독 내부 훈련(대문자 trainingType)이 비로그인 검색에 그대로 노출됐다.
    const viewerTeamIds = user
      ? await resolveViewerTeamIds(this.prisma, user.id, user.userType)
      : [];
    const visibilityWhere = buildClassVisibilityWhere(user, viewerTeamIds);

    const where: Prisma.ClassWhereInput = {
      OR: [
        { className: { contains: q } },
        { description: { contains: q } },
        { instructorName: { contains: q } },
      ],
      isActive: true,
      approvalStatus: "APPROVED",
      endedAt: null,
      // 학부모용 결제 수업만 — 대문자 training 도메인(감독 내부 훈련) 배제.
      trainingType: { in: [...CLASSES_DOMAIN_TRAINING_TYPES] },
      AND: [...(ageWhere ? [ageWhere] : []), visibilityWhere],
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

  /**
   * 공지 검색.
   *
   * [Phase 0 · F-EX-05] 이전에는 `isActive` 만 걸어 **팀 공지가 팀 밖으로 전부 노출**됐다.
   *   이 엔드포인트는 `@Public()` + `@SkipThrottle()` 이라 비로그인 사용자가 임의 질의로
   *   타 팀 공지 본문의 존재를 탐침하고 미리보기 100자를 얻을 수 있었다.
   *   이제 열람 팀 스코프 + 게시 기간을 적용한다.
   *     · 비로그인 → 서비스 공지(targetTeamId=null)만
   *     · 로그인   → 서비스 공지 ∪ 본인 열람 가능 팀 공지
   *
   * ⚠️ `where` 는 `findMany` 와 `count` 가 **반드시 같은 객체를 공유**해야 한다.
   *    분기되면 total 만으로 비열람 공지의 존재가 새어나간다.
   */
  private async searchNotices(
    q: string,
    limit: number,
    offset: number,
    viewer?: ViewerLike,
  ) {
    const viewerTeamIds = viewer?.id
      ? await resolveViewerTeamIds(this.prisma, viewer.id, viewer.userType)
      : [];

    // [Phase 2 ③] 팀 공지는 TeamPost 로 이관 — SystemNotice 검색은 서비스 공지 전용으로
    //   축소하고, 열람 팀 스코프의 TeamPost 팀 공지를 병합한다. 결과 클릭은 기존처럼
    //   /notice/{id} 로 가더라도 이관 마커 리다이렉트가 /community-notice/{id} 로 안내한다.
    const where: Prisma.SystemNoticeWhereInput = {
      OR: [{ title: { contains: q } }, { content: { contains: q } }],
      isActive: true,
      AND: [{ targetTeamId: null }, ...publicationConditions()],
    };
    const now = new Date();
    const teamWhere: Prisma.TeamPostWhereInput | null =
      viewerTeamIds.length > 0
        ? {
            OR: [{ title: { contains: q } }, { content: { contains: q } }],
            teamId: { in: viewerTeamIds },
            postType: "announcement",
            isActive: true,
            AND: [
              { OR: [{ startAt: null }, { startAt: { lte: now } }] },
              { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
            ],
          }
        : null;

    // [Codex P2-R1-H06] 두 소스에 각각 skip/take 를 걸면 서비스 결과가 limit 이상일 때
    //   팀 공지가 첫 페이지에서 전멸하고, 2페이지부터는 양쪽 offset 이 중복 적용되어
    //   결과가 누락된다 — **각 소스는 (offset+limit)건까지 수집 → 공통 정렬키로 전역
    //   병합 → 단일 slice** 로 페이지를 만든다.
    // [Codex P2-R2 H06] createdAt 동률(대량 시드·같은 밀리초 생성)이 있으면 DB 수집과
    //   메모리 병합의 상대 순서가 실행마다 달라져 페이지 경계에서 행이 중복/누락된다 —
    //   DB 조회와 병합 모두 `createdAt DESC, id DESC` 안정 정렬로 통일한다.
    const fetchSpan = offset + limit;
    const stableOrder = [
      { createdAt: "desc" as const },
      { id: "desc" as const },
    ];
    const [items, total, teamItems, teamTotal] = await Promise.all([
      this.prisma.systemNotice.findMany({
        where,
        select: {
          id: true,
          title: true,
          content: true,
          targetType: true,
          createdAt: true,
        },
        take: fetchSpan,
        orderBy: stableOrder,
      }),
      this.prisma.systemNotice.count({ where }),
      teamWhere
        ? this.prisma.teamPost.findMany({
            where: teamWhere,
            select: { id: true, title: true, content: true, createdAt: true },
            take: fetchSpan,
            orderBy: stableOrder,
          })
        : Promise.resolve([]),
      teamWhere
        ? this.prisma.teamPost.count({ where: teamWhere })
        : Promise.resolve(0),
    ]);

    const merged = [
      ...items.map((notice) => ({
        type: "notice" as const,
        id: notice.id,
        title: notice.title,
        description: notice.content.slice(0, 100),
        targetType: notice.targetType,
        createdAt: notice.createdAt,
      })),
      ...teamItems.map((post) => ({
        type: "notice" as const,
        id: post.id,
        title: post.title,
        description: post.content.slice(0, 100),
        targetType: "team",
        createdAt: post.createdAt,
      })),
    ].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id),
    );

    return {
      total: total + teamTotal,
      items: merged.slice(offset, offset + limit),
    };
  }
}
