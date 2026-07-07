import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import {
  kstTodayUtcMidnight,
  addUtcDays,
} from "@/common/utils/kst-date.util";

@Injectable()
export class DirectorDashboardService {
  private readonly logger = new Logger(DirectorDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 감독 대시보드 통계
   */
  async getDirectorDashboard(directorId: string) {
    // W2: Redis 캐시 (TTL 30s)
    const cacheKey = `dashboard:director:${directorId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      // scheduledDate(@db.Date)는 UTC 자정 규약 — 이 컬럼 경계·in-memory 비교는 KST 달력일의
      // UTC 자정을 쓴다. today(서버-로컬)는 A군 컬럼(startDate·scheduledAt) 계산에 계속 사용.
      const sdToday = kstTodayUtcMidnight();
      const sdTomorrow = addUtcDays(sdToday, 1);
      const sdYesterday = addUtcDays(sdToday, -1);
      const sdWeekStart = addUtcDays(sdToday, -sdToday.getUTCDay());
      const sdWeekEnd = addUtcDays(sdWeekStart, 7);
      const sdPrevWeekStart = addUtcDays(sdWeekStart, -7);
      const sdPrevWeekCutoff = sdWeekStart < sdToday ? sdWeekStart : sdToday;
      const sdMonthStart = new Date(
        Date.UTC(sdToday.getUTCFullYear(), sdToday.getUTCMonth(), 1),
      );
      const sdMonthEnd = new Date(
        Date.UTC(sdToday.getUTCFullYear(), sdToday.getUTCMonth() + 1, 0),
      );
      const sdMonthEndNext = new Date(
        Date.UTC(sdToday.getUTCFullYear(), sdToday.getUTCMonth() + 1, 1),
      );

      // === W1 Step 1: director + managedTeams + managedClubs 병렬 ===
      // 감독의 관리 팀은 TeamRoster(HEAD_COACH ClubMember) 기반 단일 진실원 (2026-04-29)
      // managedClubs (Club.coachId) 는 호환성 유지용으로 함께 보존.
      const [director, managedTeamsRaw, managedClubs] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: directorId },
          select: { firstName: true, lastName: true, email: true, avatarUrl: true },
        }),
        // Phase 2 (2026-04-29) — TeamRoster 폐기, TeamGroupMember 단일화. teamId = clubs.id
        this.prisma.teamGroupMember.findMany({
          where: {
            status: "active",
            member: {
              userId: directorId,
              roleInTeam: { in: ["HEAD_COACH", "COACH"] },
            },
          },
          select: {
            group: {
              select: { teamId: true },
            },
          },
        }),
        this.prisma.team.findMany({
          where: { coachId: directorId },
          select: { id: true },
        }),
      ]);
      // 폴백 문자열에 "님" 포함 금지 — UI(AppBar)에서 "{name}님" 자동 부착.
      const directorName =
        director?.lastName || director?.firstName
          ? `${director?.lastName ?? ""}${director?.firstName ?? ""}`.trim()
          : director?.email?.split("@")[0] || "감독";
      // Phase 2 (2026-04-29) — Team 폐기 후 teamId == teamId 이므로 단일 ID 집합
      const managedClubIds = Array.from(
        new Set([
          ...managedClubs.map((c) => c.id),
          ...managedTeamsRaw.map((tgm) => tgm.group.teamId),
        ]),
      );
      const managedTeamIds = managedClubIds;

      // === W1 Step 2: 나머지 15개 쿼리 모두 단일 Promise.all ===
      const [
        totalMembers,
        todayPresent,
        todayAbsent,
        todayTotal,
        yesterdayPresent,
        yesterdayTotal,
        weekSchedules,
        completedSchedules,
        prevWeekSchedules,
        prevWeekCompleted,
        monthSchedules,
        teamCoachRosters,
        upcomingClassSchedules,
        _unusedMatches,
        pendingEnrollments,
        // [추가 2026-04-30] 홈 "수업 현황" 섹션 — 최근 등록된 수업 5건
        recentClassesRaw,
        // W6
        latestNotices,
      ] = await Promise.all([
        this.prisma.teamMember.count({
          where: { approvalStatus: "approved" },
        }),
        // 오늘 출석 count 3개 (findMany + filter 대체)
        this.prisma.classAttendance.count({
          where: {
            schedule: { scheduledDate: { gte: sdToday, lt: sdTomorrow } },
            attendanceStatus: { in: ["present", "late"] },
          },
        }),
        this.prisma.classAttendance.count({
          where: {
            schedule: { scheduledDate: { gte: sdToday, lt: sdTomorrow } },
            attendanceStatus: "absent",
          },
        }),
        this.prisma.classAttendance.count({
          where: {
            schedule: { scheduledDate: { gte: sdToday, lt: sdTomorrow } },
          },
        }),
        this.prisma.classAttendance.count({
          where: {
            schedule: { scheduledDate: { gte: sdYesterday, lt: sdToday } },
            attendanceStatus: { in: ["present", "late"] },
          },
        }),
        this.prisma.classAttendance.count({
          where: {
            schedule: { scheduledDate: { gte: sdYesterday, lt: sdToday } },
          },
        }),
        this.prisma.classSchedule.count({
          where: {
            scheduledDate: { gte: sdWeekStart, lt: sdWeekEnd },
            isCancelled: false,
          },
        }),
        this.prisma.classSchedule.count({
          where: {
            scheduledDate: { gte: sdWeekStart, lt: sdToday },
            isCancelled: false,
          },
        }),
        this.prisma.classSchedule.count({
          where: {
            scheduledDate: { gte: sdPrevWeekStart, lt: sdWeekStart },
            isCancelled: false,
          },
        }),
        this.prisma.classSchedule.count({
          where: {
            scheduledDate: { gte: sdPrevWeekStart, lt: sdPrevWeekCutoff },
            isCancelled: false,
          },
        }),
        this.prisma.classSchedule.findMany({
          where: {
            scheduledDate: { gte: sdMonthStart, lt: sdMonthEndNext },
            isCancelled: false,
          },
          select: { scheduledDate: true },
        }),
        // [수정 2026-04-29] 코치 목록은 감독 관리 팀(TeamRoster)에 소속된
        // ClubMember(roleInTeam IN COACH/HEAD_COACH) 기준. 본인 제외.
        // 기존 CoachProfile.teamId 기반은 같은 클럽의 다른 팀 코치까지
        // 노출되는 문제가 있어 TeamRoster 단일 진실원으로 교체.
        // Phase 2 (2026-04-29) — TeamRoster 폐기 후 TeamGroupMember 단일화.
        // group.teamId(= clubs.id) 가 managedTeamIds(= managedClubIds) 안에 있는 코치 멤버.
        managedTeamIds.length > 0
          ? this.prisma.teamGroupMember.findMany({
              where: {
                status: "active",
                group: { teamId: { in: managedTeamIds } },
                member: {
                  userId: { not: directorId },
                  roleInTeam: { in: ["HEAD_COACH", "COACH"] },
                },
              },
              orderBy: { joinedAt: "desc" },
              take: 5,
              select: {
                id: true,
                group: {
                  select: {
                    teamId: true,
                    team: { select: { name: true } },
                  },
                },
                member: {
                  select: {
                    userId: true,
                    roleInTeam: true,
                    user: {
                      select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatarUrl: true,
                      },
                    },
                  },
                },
              },
            })
          : Promise.resolve([] as Array<never>),
        // [수정 2026-04-30] 홈 "대회/경기 현황" 섹션 — 최근 등록된 대회/경기 (실제 DB).
        // 사용자 요청 — class schedule 대신 tournament + pickupMatch 노출.
        this.prisma.tournament.findMany({
          where: { status: { in: ["scheduled", "ongoing"] } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            name: true,
            startDate: true,
            createdAt: true,
            team: { select: { name: true, location: true } },
          },
        }),
        this.prisma.pickupMatch.findMany({
          where: { status: { in: ["recruiting", "closing_soon", "closed"] } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            rinkName: true,
            createdAt: true,
          },
        }),
        this.prisma.enrollment.findMany({
          where: { status: "pending" },
          orderBy: { requestedAt: "desc" },
          take: 10,
          select: {
            id: true,
            requestedAt: true,
            child: { select: { firstName: true, lastName: true } },
            class: {
              select: {
                className: true,
                team: { select: { name: true } },
              },
            },
          },
        }),
        // [추가 2026-04-30] 최근 등록 수업 — 홈 "수업 현황" 섹션 데이터
        // [수정 2026-05-15] 본인 팀이 ClassTeamVisibility 에 등록된 오픈클래스도 함께 노출
        //   (수업목록 /classes 의 openClassWhere 와 정합화).
        managedClubIds.length > 0
          ? this.prisma.class.findMany({
              where: {
                isActive: true,
                OR: [
                  { teamId: { in: managedClubIds } },
                  {
                    academyId: { not: null },
                    teamVisibilities: {
                      some: { teamId: { in: managedClubIds } },
                    },
                  },
                ],
              },
              orderBy: { createdAt: "desc" },
              take: 5,
              select: {
                id: true,
                className: true,
                instructorName: true,
                category: true,
                trainingType: true,
                capacity: true,
                startTime: true,
                endTime: true,
                createdAt: true,
                team: { select: { name: true } },
                // 요일별 기본 일정 — 카드 요일 패턴 표시용 (대표 startTime 표시 대체)
                dayScheduleEntries: {
                  select: { dayOfWeek: true, startTime: true, endTime: true },
                },
                // 다음 회차 (비취소·오늘 이후) — 기본 일정 없는 수업의 날짜(+회차 시간) 표시용
                schedules: {
                  where: {
                    isCancelled: false,
                    scheduledDate: { gte: kstTodayUtcMidnight() },
                  },
                  orderBy: { scheduledDate: "asc" },
                  take: 1,
                  select: {
                    scheduledDate: true,
                    startTime: true,
                    endTime: true,
                  },
                },
              },
            })
          : Promise.resolve([] as Array<never>),
        // W6: 프론트 NoticeSection 중복 API 제거
        // targetType: null(미지정), "all", "director"만 감독에게 노출
        this.prisma.systemNotice.findMany({
          where: {
            isActive: true,
            OR: [
              { targetType: null },
              { targetType: "all" },
              { targetType: "director" },
            ],
          },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            title: true,
            targetType: true,
            createdAt: true,
            pinned: true,
          },
        }),
      ]);

      // === 파생 데이터 계산 ===
      const presentMembers = todayPresent;
      const absentMembers = todayAbsent;
      const attendanceRate =
        todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0;
      const yesterdayRate =
        yesterdayTotal > 0
          ? Math.round((yesterdayPresent / yesterdayTotal) * 100)
          : 0;
      const attendanceChange = attendanceRate - yesterdayRate;
      const trainingRate =
        weekSchedules > 0
          ? Math.round((completedSchedules / weekSchedules) * 100)
          : 0;
      const prevWeekRate =
        prevWeekSchedules > 0
          ? Math.round((prevWeekCompleted / prevWeekSchedules) * 100)
          : 0;
      const trainingChange = trainingRate - prevWeekRate;

      const weeklyTraining: {
        week: number;
        total: number;
        completed: number;
        rate: number;
      }[] = [];
      for (let w = 0; w < 4; w++) {
        const wStart = new Date(sdMonthStart);
        wStart.setDate(wStart.getDate() + w * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wEnd.getDate() + 7);
        if (wStart > sdMonthEnd) break;
        const actualEnd =
          wEnd > sdMonthEnd ? new Date(sdMonthEnd.getTime() + 86400000) : wEnd;

        const weekData = monthSchedules.filter(
          (s) => s.scheduledDate >= wStart && s.scheduledDate < actualEnd,
        );
        const total = weekData.length;
        const cutoff = actualEnd > sdToday ? sdToday : actualEnd;
        const completed = weekData.filter(
          (s) => s.scheduledDate < cutoff,
        ).length;
        weeklyTraining.push({
          week: w + 1,
          total,
          completed,
          rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        });
      }

      // managedClubs/coachProfiles는 W1 Step 1/2에서 이미 병렬 조회됨

      const colorPalette = [
        "bg-primary",
        "bg-blue-500",
        "bg-green-500",
        "bg-amber-500",
        "bg-purple-500",
        "bg-rose-500",
      ];
      // [수정 2026-04-29] 코치 목록 매핑 — TeamRoster 기반
      // 같은 userId 가 여러 팀에 소속된 경우 한 번만 노출 (첫 팀명 표시).
      const seenCoachUserIds = new Set<string>();
      const coaches = (
        teamCoachRosters as Array<{
          id: string;
          team: { name: string } | null;
          member: {
            userId: string;
            roleInTeam: string | null;
            user: {
              firstName: string | null;
              lastName: string | null;
              email: string | null;
            } | null;
          };
        }>
      )
        .filter((tr) => {
          const uid = tr.member.userId;
          if (seenCoachUserIds.has(uid)) return false;
          seenCoachUserIds.add(uid);
          return true;
        })
        .slice(0, 5)
        .map((tr, idx) => {
          const user = tr.member.user;
          const name =
            `${user?.lastName ?? ""}${user?.firstName ?? ""}`.trim() ||
            (user?.email ?? "");
          return {
            id: tr.id,
            name,
            specialty: tr.team?.name ?? "",
            classCount: 0,
            totalSchedules: 0,
            completedSchedules: 0,
            progress: 0,
            color: colorPalette[idx % colorPalette.length],
          };
        });

      // [수정 2026-04-30] 홈 "대회/경기 현황" 섹션 — 최근 등록된 tournament + pickupMatch.
      // 사용자 요청에 따라 실제 DB 기준 노출. createdAt DESC 합쳐 상위 5건.
      const tournamentEvents = (
        upcomingClassSchedules as Array<{
          id: string;
          name: string;
          startDate: Date;
          createdAt: Date;
          team: { name: string | null; location: string | null } | null;
        }>
      ).map((t) => {
        const dDay = Math.ceil(
          (t.startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          id: t.id,
          type: "tournament" as const,
          title: t.name,
          location: t.team?.location || t.team?.name || "장소 미정",
          // startDate 는 `@db.Date`(UTC 자정) → 월/일은 getUTC* 로 추출.
          month: `${t.startDate.getUTCMonth() + 1}월`,
          day: t.startDate.getUTCDate().toString(),
          dDay,
          isPriority: dDay <= 3,
          createdAt: t.createdAt,
        };
      });
      const matchEvents = (
        _unusedMatches as Array<{
          id: string;
          title: string;
          scheduledAt: Date;
          rinkName: string | null;
          createdAt: Date;
        }>
      ).map((m) => {
        const dDay = Math.ceil(
          (m.scheduledAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          id: m.id,
          type: "match" as const,
          title: m.title,
          location: m.rinkName || "장소 미정",
          month: `${m.scheduledAt.getMonth() + 1}월`,
          day: m.scheduledAt.getDate().toString(),
          dDay,
          isPriority: dDay <= 3,
          createdAt: m.createdAt,
        };
      });
      const events = [...tournamentEvents, ...matchEvents]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5)
        .map(({ createdAt: _c, ...rest }) => rest);

      // pendingEnrollments는 W1 Step 2에서 이미 병렬 조회됨
      const pendingEnrollmentItems = pendingEnrollments.map((e) => ({
        id: e.id,
        name:
          `${e.child.lastName ?? ""}${e.child.firstName ?? ""}`.trim() ||
          "이름 없음",
        className: e.class.className,
        teamName: e.class.team?.name ?? "",
        requestedAt: e.requestedAt,
      }));

      // 자녀 팀 가입 신청(TeamMember pending) 도 합산 — /director-approvals 페이지와 일치 보장
      const pendingTeamMembersRaw = await this.prisma.teamMember.findMany({
        where: {
          teamId: { in: Array.from(managedTeamIds) },
          approvalStatus: "pending",
          leftAt: null,
        },
        select: {
          id: true,
          playerName: true,
          joinedAt: true,
          team: { select: { name: true } },
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      });
      const pendingTeamMemberItems = pendingTeamMembersRaw.map((m) => ({
        id: m.id,
        name:
          m.playerName ||
          `${m.user?.lastName ?? ""}${m.user?.firstName ?? ""}`.trim() ||
          "이름 없음",
        className: "팀 가입 신청",
        teamName: m.team?.name ?? "",
        requestedAt: m.joinedAt,
      }));

      const pendingMembers = [
        ...pendingEnrollmentItems,
        ...pendingTeamMemberItems,
      ];

      const result = {
        directorName,
        stats: {
          attendanceRate,
          attendanceChange,
          totalMembers,
          presentMembers,
          absentMembers,
          trainingRate,
          trainingChange,
        },
        weeklyTraining,
        coaches,
        events,
        pendingMembers,
        // [추가 2026-04-29] 단일 엔드포인트 통합 — 프론트의 fetchClubs 폐기를 위해
        // pendingMemberCount 를 함께 반환. (이전엔 /clubs/managed/list 별도 호출 필요)
        pendingMemberCount: pendingMembers.length,
        // [추가 2026-04-30] 홈 "수업 현황" 섹션 — 최근 등록된 수업 목록
        recentClasses: (
          recentClassesRaw as Array<{
            id: string;
            className: string;
            instructorName: string;
            category: string | null;
            trainingType: string | null;
            capacity: number;
            startTime: Date;
            endTime: Date;
            createdAt: Date;
            team: { name: string | null } | null;
            dayScheduleEntries: Array<{
              dayOfWeek: string;
              startTime: string;
              endTime: string;
            }>;
            schedules: Array<{
              scheduledDate: Date;
              startTime: string | null;
              endTime: string | null;
            }>;
          }>
        ).map((c) => ({
          id: c.id,
          className: c.className,
          instructorName: c.instructorName,
          category: c.category,
          trainingType: c.trainingType,
          capacity: c.capacity,
          startTime: c.startTime,
          endTime: c.endTime,
          createdAt: c.createdAt,
          name: c.team?.name ?? "",
          daySchedules: c.dayScheduleEntries ?? [],
          nextSchedule: c.schedules?.[0] ?? null,
        })),
        // W6
        latestNotices,
      };

      // W2: 캐시 저장 (TTL 30s)
      await this.redis.set(cacheKey, result, 30);
      return result;
    } catch (error) {
      this.logger.error(
        "getDirectorDashboard error:",
        error instanceof Error ? error.stack : error,
      );
      return {
        directorName: "감독",
        stats: {
          attendanceRate: 0,
          attendanceChange: 0,
          totalMembers: 0,
          presentMembers: 0,
          absentMembers: 0,
          trainingRate: 0,
          trainingChange: 0,
        },
        weeklyTraining: [],
        coaches: [],
        events: [],
        pendingMembers: [],
        pendingMemberCount: 0,
        recentClasses: [],
        latestNotices: [],
      };
    }
  }
}
