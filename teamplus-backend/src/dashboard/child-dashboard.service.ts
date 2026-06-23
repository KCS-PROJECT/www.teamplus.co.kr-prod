import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";

/**
 * ChildDashboardService
 * W3: teen/child 페이지의 3단계 waterfall (/clubs/my/list → /clubs/{id} → /attendance)
 *     을 단일 엔드포인트로 통합. HTTP RTT 3→1, 예상 TTFB -300ms.
 */
@Injectable()
export class ChildDashboardService {
  private readonly logger = new Logger(ChildDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 학생(child/teen) 홈 대시보드 데이터
   * - 첫 번째 승인된 클럽 멤버십
   * - 해당 클럽의 오늘~7일 스케줄
   * - 멤버의 지난 7일 출석 기록
   */
  async getChildHome(userId: string, userType?: "CHILD" | "TEEN") {
    // targetType: null(미지정), "all", 그리고 본인 역할만 노출
    // PARENT/ADMIN이 child-home을 호출한 경우 userType이 undefined → role-specific 공지 제외 (child/teen 공지 격리)
    const noticeTargetTypeFilter: Array<{ targetType: string | null }> = [
      { targetType: null },
      { targetType: "all" },
    ];
    if (userType === "TEEN") {
      noticeTargetTypeFilter.push({ targetType: "teen" });
    } else if (userType === "CHILD") {
      noticeTargetTypeFilter.push({ targetType: "child" });
    }

    // W2: Redis 캐시 (TTL 60s) — userType을 키에 포함하여 역할별 캐시 분리
    const cacheKey = `dashboard:child-home:${userId}:${userType ?? "child"}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 6);

      // Step 1: 멤버십 + 클럽 + 코치 + 오늘/주간 스케줄 (심층 include, 단일 SQL JOIN)
      const membership = await this.prisma.teamMember.findFirst({
        where: { userId, approvalStatus: "approved" },
        orderBy: { joinedAt: "desc" },
        select: {
          id: true,
          team: {
            select: {
              id: true,
              name: true,
              coaches: {
                take: 1,
                select: {
                  user: {
                    select: { firstName: true, lastName: true, avatarUrl: true },
                  },
                },
              },
              classes: {
                where: { isActive: true },
                select: {
                  id: true,
                  className: true,
                  startTime: true,
                  endTime: true,
                  instructorName: true,
                  schedules: {
                    where: {
                      scheduledDate: { gte: today, lt: tomorrow },
                      isCancelled: false,
                    },
                    orderBy: { scheduledDate: "asc" },
                    take: 1,
                    select: {
                      id: true,
                      scheduledDate: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!membership) {
        // 멤버십 없어도 공지는 제공 (회원 승인 대기 화면에서도 공지 노출)
        const latestNoticesOnly = await this.prisma.systemNotice.findMany({
          where: {
            isActive: true,
            OR: noticeTargetTypeFilter,
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
        });
        const empty = {
          name: null,
          coachName: null,
          todayClass: null,
          weekRecords: [],
          streakCount: 0,
          latestNotices: latestNoticesOnly,
          // 2026-04-28 (2차 통합): student 대시보드용 4개 필드 (멤버십 없을 때 빈 값)
          creditSummary: {
            totalRemaining: 0,
            expiringWithin30Days: 0,
            usedThisMonth: 0,
          },
          attendanceTrend: [],
          upcomingSchedules: [],
          // 2026-04-29 (3차 보강): student 대시보드 — rank/recentBadges 빈 폴백
          rank: 0,
          recentBadges: [],
        };
        await this.redis.set(cacheKey, empty, 60);
        return empty;
      }

      // 2026-04-28 (2차 통합): student 대시보드 보강용 시간 범위
      const nowDate = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
      const thirtyDaysLater = new Date(today);
      thirtyDaysLater.setDate(today.getDate() + 30);
      // 6개월 출석 추이 시작일
      const sixMonthsStart = new Date(
        today.getFullYear(),
        today.getMonth() - 5,
        1,
      );
      // 다가오는 일정 — 오늘 ~ 30일 후
      const upcomingEnd = new Date(today);
      upcomingEnd.setDate(today.getDate() + 30);
      // 2026-04-29 (3차 보강): 클럽 내 30일 출석 랭킹 산출용
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const teamId = membership.team?.id ?? null;

      // Step 2: 지난 7일 출석 + 최신 공지 + (2차 통합) creditSummary/attendanceTrend/upcomingSchedules
      //         + (3차 보강 2026-04-29) recentBadges / peerAttendanceGroups 병렬 조회
      const [
        attendances,
        latestNotices,
        memberCredits,
        sixMonthAttendances,
        monthCreditDeductions,
        upcomingSchedulesData,
        recentBadgesData,
        peerAttendanceGroups,
      ] = await Promise.all([
        this.prisma.classAttendance.findMany({
          where: {
            // 2026-04-27 (N-9): ClassAttendance.memberId 는 User.id. 자녀 본인 ID 사용.
            memberId: userId,
            schedule: {
              scheduledDate: { gte: sevenDaysAgo, lt: tomorrow },
            },
          },
          select: {
            attendanceStatus: true,
            schedule: { select: { scheduledDate: true } },
          },
          orderBy: { schedule: { scheduledDate: "desc" } },
        }),
        this.prisma.systemNotice.findMany({
          where: {
            isActive: true,
            OR: noticeTargetTypeFilter,
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
        // 2-A.1 본인 수업권 (만료 + 사용량)
        // PR-D Hotfix #4 (v1.0): classId 추가 — upcomingSchedules 자녀별 canCheckIn 산출용
        this.prisma.memberCredit.findMany({
          where: { userId },
          select: {
            classId: true,
            totalSessions: true,
            usedSessions: true,
            expiresAt: true,
          },
        }),
        // 2-A.2 6개월 출석 추이용
        this.prisma.classAttendance.findMany({
          where: {
            memberId: userId,
            schedule: {
              scheduledDate: { gte: sixMonthsStart, lt: tomorrow },
            },
          },
          select: {
            attendanceStatus: true,
            schedule: { select: { scheduledDate: true } },
          },
        }),
        // 2-A.3 이번 달 사용 수업권 차감 트랜잭션
        // CreditTransaction.memberCredit relation + type 값 'deducted' (스키마 enum 정확 일치)
        this.prisma.creditTransaction.findMany({
          where: {
            memberCredit: { userId },
            type: "deducted",
            createdAt: { gte: monthStart, lte: monthEnd },
          },
          select: { amount: true },
        }),
        // 2-A.4 본인 등록 수업의 다가오는 일정 (오늘 ~ 30일).
        //  [수정 2026-05-13] Enrollment paid 기준 — 결제 완료한 수업만 캘린더에 노출.
        this.prisma.classSchedule.findMany({
          where: {
            isCancelled: false,
            scheduledDate: { gte: today, lte: upcomingEnd },
            class: {
              enrollments: {
                some: { childId: userId, status: "paid" },
              },
            },
          },
          select: {
            id: true,
            scheduledDate: true,
            class: {
              select: {
                id: true,
                className: true,
                trainingType: true,
                startTime: true,
                endTime: true,
              },
            },
            attendances: {
              where: { memberId: userId },
              select: { attendanceStatus: true },
              take: 1,
            },
          },
          orderBy: { scheduledDate: "asc" },
          take: 50,
        }),
        // 2-A.5 최근 획득 뱃지 4개 (학생 대시보드 멤버십 탭)
        this.prisma.childBadge.findMany({
          where: { childId: userId },
          orderBy: [{ displayOrder: "asc" }, { earnedAt: "desc" }],
          take: 4,
          select: {
            badge: {
              select: { name: true, iconUrl: true, rarity: true },
            },
          },
        }),
        // 2-A.6 같은 클럽(Team) 학생들의 30일 출석 카운트 — 본인 랭킹 산출용
        // teamId 가 있을 때만 의미 있는 결과 (없으면 빈 배열로 폴백)
        teamId
          ? this.prisma.classAttendance.groupBy({
              by: ["memberId"],
              where: {
                attendanceStatus: { in: ["present", "late"] },
                schedule: {
                  scheduledDate: { gte: thirtyDaysAgo, lt: tomorrow },
                },
                member: {
                  userType: { in: ["CHILD", "TEEN"] },
                  teamMembers: {
                    some: { teamId, approvalStatus: "approved" },
                  },
                },
              },
              _count: { _all: true },
            })
          : Promise.resolve(
              [] as Array<{
                memberId: string;
                _count: { _all: number };
              }>,
            ),
      ]);

      // 파생 데이터 계산
      const coach = membership.team?.coaches?.[0]?.user;
      const coachName = coach
        ? `${coach.lastName ?? ""}${coach.firstName ?? ""}`.trim() || null
        : null;

      // 오늘 수업 — 가장 가까운 class.schedules[0]
      let todayClass: {
        title: string;
        startTime: string;
        endTime: string;
        coach: string;
      } | null = null;
      for (const cls of membership.team?.classes ?? []) {
        if (cls.schedules.length > 0) {
          const startH = String(cls.startTime.getHours()).padStart(2, "0");
          const startM = String(cls.startTime.getMinutes()).padStart(2, "0");
          const endH = String(cls.endTime.getHours()).padStart(2, "0");
          const endM = String(cls.endTime.getMinutes()).padStart(2, "0");
          todayClass = {
            title: cls.className,
            startTime: `${startH}:${startM}`,
            endTime: `${endH}:${endM}`,
            coach: cls.instructorName || coachName || "코치",
          };
          break;
        }
      }

      // 주간 출석 기록 (최근 7일)
      const weekRecords = attendances.map((a) => ({
        date: a.schedule.scheduledDate.toISOString(),
        status: a.attendanceStatus,
      }));

      // 연속 출석 스트릭 계산
      let streakCount = 0;
      const sorted = [...attendances]
        .filter(
          (a) =>
            a.attendanceStatus === "present" || a.attendanceStatus === "late",
        )
        .map((a) => {
          const d = new Date(a.schedule.scheduledDate);
          d.setHours(0, 0, 0, 0);
          return d;
        })
        .sort((a, b) => b.getTime() - a.getTime());

      if (sorted.length > 0) {
        let prev = new Date(today);
        for (const d of sorted) {
          const diffDays = Math.round(
            (prev.getTime() - d.getTime()) / 86400000,
          );
          if (diffDays <= 1) {
            streakCount++;
            prev = d;
          } else {
            break;
          }
        }
      }

      // 2026-04-28 (2차 통합) — 학부모 대시보드 응답 패턴과 동일한 구조로 derive
      // 본인(userId) 1인 기준이라 학부모의 자녀 N명 집계 로직을 단순화한다.

      // ① 수업권 요약 (학부모 creditSummary 와 동일 구조)
      const creditSummary = {
        totalRemaining: memberCredits
          .filter((mc) => mc.expiresAt >= nowDate)
          .reduce(
            (sum, mc) => sum + Math.max(0, mc.totalSessions - mc.usedSessions),
            0,
          ),
        expiringWithin30Days: memberCredits
          .filter(
            (mc) => mc.expiresAt >= nowDate && mc.expiresAt <= thirtyDaysLater,
          )
          .reduce(
            (sum, mc) => sum + Math.max(0, mc.totalSessions - mc.usedSessions),
            0,
          ),
        usedThisMonth: monthCreditDeductions.reduce(
          (sum, t) => sum + t.amount,
          0,
        ),
      };

      // ② 출석 추이 6개월 (학부모 attendanceTrend 와 동일 구조)
      const attendanceTrend = Array.from({ length: 6 }, (_, i) => {
        const mStart = new Date(
          today.getFullYear(),
          today.getMonth() - (5 - i),
          1,
        );
        const mEnd = new Date(
          today.getFullYear(),
          today.getMonth() - (5 - i) + 1,
          0,
          23,
          59,
          59,
        );
        const monthAtts = sixMonthAttendances.filter(
          (a) =>
            a.schedule.scheduledDate >= mStart &&
            a.schedule.scheduledDate <= mEnd,
        );
        const present = monthAtts.filter(
          (a) =>
            a.attendanceStatus === "present" || a.attendanceStatus === "late",
        ).length;
        const total = monthAtts.length;
        return {
          month: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, "0")}`,
          rate: total > 0 ? Math.round((present / total) * 100) : 0,
          present,
          total,
        };
      });

      // ③ 다가오는 일정 (학부모 upcomingSchedules 와 동일 구조, 본인 1인 기준)
      // PR-D Hotfix #4 (v1.0): canCheckIn 플래그 — 만료 안 된 수업권 중 잔량 > 0 일 때 true
      const nowDateForCheck = new Date();
      const upcomingSchedules = upcomingSchedulesData.map((s) => ({
        scheduleId: s.id,
        classId: s.class.id,
        className: s.class.className,
        scheduledDate: s.scheduledDate,
        trainingType: s.class.trainingType,
        // 본인 출석 상태 (없으면 null = 미체크)
        attendanceStatus: s.attendances[0]?.attendanceStatus ?? null,
        // PR-D Hotfix #4: 본인 출석 가능 여부 — false 면 프론트가 "결제 필요" 분기 표시
        canCheckIn: memberCredits.some(
          (mc) =>
            mc.classId === s.class.id &&
            mc.expiresAt >= nowDateForCheck &&
            mc.usedSessions < mc.totalSessions,
        ),
      }));

      // ④ 최근 획득 뱃지 — Badge.iconUrl 이 짧은 문자열이면 emoji 로 사용,
      //    그 외(URL/null)는 rarity 별 기본 emoji 폴백
      const RARITY_EMOJI: Record<string, string> = {
        legendary: "🏆",
        epic: "🥇",
        rare: "🥈",
        uncommon: "🥉",
        common: "🎖️",
      };
      const recentBadges = recentBadgesData.map((cb) => {
        const icon = cb.badge.iconUrl;
        const isEmojiLike =
          !!icon && icon.length <= 4 && !icon.startsWith("http");
        return {
          emoji: isEmojiLike ? icon! : (RARITY_EMOJI[cb.badge.rarity] ?? "🎖️"),
          name: cb.badge.name,
        };
      });

      // ⑤ 클럽(Team) 내 30일 출석 랭킹 — 본인보다 카운트가 많은 학생 수 + 1
      //    같은 카운트는 동률 처리(상위 그룹과 같은 등수 부여하지 않고 단순 비교)
      // Prisma 5 의 groupBy `_count` 결과는 union 으로 wide 하므로 narrowing 필요.
      const peerCount = (g: (typeof peerAttendanceGroups)[number]): number => {
        const c = g._count as { _all?: number } | undefined;
        return c?._all ?? 0;
      };
      const myCount = peerCount(
        peerAttendanceGroups.find((g) => g.memberId === userId) ?? {
          memberId: "",
          _count: { _all: 0 },
        },
      );
      const rank =
        peerAttendanceGroups.length > 0
          ? peerAttendanceGroups.filter((g) => peerCount(g) > myCount).length +
            1
          : 0;

      const result = {
        name: membership.team?.name ?? null,
        coachName,
        todayClass,
        weekRecords,
        streakCount,
        // W6: NoticeSection 중복 API 제거
        latestNotices,
        // 2026-04-28 (2차 통합): student 대시보드 보강
        creditSummary,
        attendanceTrend,
        upcomingSchedules,
        // 2026-04-29 (3차 보강): student 대시보드 — rank/recentBadges 통합
        rank,
        recentBadges,
      };

      // W2: 캐시 저장
      await this.redis.set(cacheKey, result, 60);
      return result;
    } catch (error) {
      this.logger.error(
        `getChildHome error for ${userId}:`,
        error instanceof Error ? error.stack : error,
      );
      return {
        name: null,
        coachName: null,
        todayClass: null,
        weekRecords: [],
        streakCount: 0,
        latestNotices: [],
        // 2026-04-28 (2차 통합): student 대시보드용 빈 폴백
        creditSummary: {
          totalRemaining: 0,
          expiringWithin30Days: 0,
          usedThisMonth: 0,
        },
        attendanceTrend: [],
        upcomingSchedules: [],
        // 2026-04-29 (3차 보강): student 대시보드 — rank/recentBadges 빈 폴백
        rank: 0,
        recentBadges: [],
      };
    }
  }
}
