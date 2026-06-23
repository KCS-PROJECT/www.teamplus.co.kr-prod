import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { resolveScheduleTime } from "@/common/utils/schedule-time.util";

@Injectable()
export class CoachDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 코치 대시보드 통계
   */
  async getCoachDashboard(coachId: string) {
    // W2: Redis 캐시 (TTL 60s)
    const cacheKey = `dashboard:coach:${coachId}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // W1: coachUser + clubs 병렬 조회 (Step 1)
    const [coachUser, clubs] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: coachId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.team.findMany({
        // 권한 일관화 — Club.coachId(소유주) OR CoachProfile.userId(소속 코치)
        // OR TeamMember(roleInTeam IN HEAD_COACH/COACH/MANAGER, approved) 셋 다 인정.
        // 마지막 경로는 teams.service.ts:getManagedTeams 와 동일 — 일관성 유지.
        where: {
          OR: [
            { coachId },
            { coaches: { some: { userId: coachId } } },
            {
              members: {
                some: {
                  userId: coachId,
                  approvalStatus: "approved",
                  leftAt: null,
                  roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          location: true,
          members: {
            select: {
              id: true,
              approvalStatus: true,
            },
          },
        },
      }),
    ]);
    // 폴백 문자열에 "님" 포함 금지 — UI(AppBar)에서 "{name}님" 자동 부착하므로 중복 방지.
    const coachName = coachUser
      ? `${coachUser.lastName ?? ""}${coachUser.firstName ?? ""}`.trim() ||
        "코치"
      : "코치";

    const activeMembers = clubs.reduce(
      (sum, club) =>
        sum +
        club.members.filter((m) => m.approvalStatus === "approved").length,
      0,
    );
    const pendingMemberCount = clubs.reduce(
      (sum, club) =>
        sum + club.members.filter((m) => m.approvalStatus === "pending").length,
      0,
    );

    // W1: 7개 쿼리 단일 Promise.all 통합 (Step 2)
    const clubIds = clubs.map((c) => c.id);

    const attendanceWhere = {
      schedule: {
        class: { teamId: { in: clubIds } },
        scheduledDate: { gte: monthStart, lte: monthEnd },
      },
    };

    // P2037 대응: 기존 9개 Promise.all 로 병렬 실행하던 쿼리를
    // `$transaction([...])` 로 묶어 단일 Prisma 커넥션으로 직렬 실행.
    // 외부 PostgreSQL 의 전역 커넥션 슬롯(DB 서버 max_connections) 이 제한적이라
    // 동시 요청이 많을 때 "Too many database connections opened (P2037)" 발생.
    // getRecentActivities 는 내부에서 또 여러 쿼리를 호출하므로 별도로 분리.
    const [batchResult, recentActivities] = await Promise.all([
      this.prisma.$transaction([
        this.prisma.class.findMany({
          // [수정 2026-05-15] 본인 팀이 ClassTeamVisibility 에 등록된 오픈클래스도 함께 노출.
          //   기존 `teamId: { in: clubIds }` 만으로는 teamId=null 오픈클래스가 코치 홈에서
          //   누락 — 수업목록(/classes) 의 openClassWhere 와 정합화.
          where: {
            isActive: true,
            OR: [
              { teamId: { in: clubIds } },
              {
                academyId: { not: null },
                teamVisibilities: { some: { teamId: { in: clubIds } } },
              },
            ],
          },
          select: {
            id: true,
            className: true,
            startTime: true,
            endTime: true,
            teamId: true,
            capacity: true,
            schedules: {
              where: {
                scheduledDate: { gte: today, lte: weekLater },
                isCancelled: false,
              },
              select: {
                id: true,
                scheduledDate: true,
                startTime: true, // 표시 시각 SoT (text "HH:mm") — 입력 그대로
                endTime: true,
                attendances: {
                  where: {
                    attendanceStatus: { in: ["present", "late"] },
                  },
                  select: { id: true },
                },
              },
              orderBy: { scheduledDate: "asc" },
            },
            enrollments: {
              where: { status: "paid" },
              select: {
                id: true,
                child: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        }),
        // 월간 출석 present/late count (findMany + JS filter 대체)
        this.prisma.classAttendance.count({
          where: {
            ...attendanceWhere,
            attendanceStatus: { in: ["present", "late"] },
          },
        }),
        this.prisma.classAttendance.count({ where: attendanceWhere }),
        // 이번 달 신규 회원
        this.prisma.teamMember.count({
          where: {
            teamId: { in: clubIds },
            approvalStatus: "approved",
            joinedAt: { gte: monthStart, lte: monthEnd },
          },
        }),
        // 수강신청 대기
        this.prisma.enrollment.findMany({
          where: {
            class: { teamId: { in: clubIds } },
            status: "pending",
          },
          select: {
            id: true,
            child: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            class: {
              select: {
                className: true,
                startTime: true,
                endTime: true,
              },
            },
          },
          take: 5,
          orderBy: { requestedAt: "desc" },
        }),
        // 월간 결제
        this.prisma.payment.findMany({
          where: {
            user: {
              teamMembers: { some: { teamId: { in: clubIds } } },
            },
            paymentStatus: "completed",
            createdAt: { gte: monthStart, lte: monthEnd },
          },
          select: { amount: true },
        }),
        // 대기 결제
        this.prisma.payment.count({
          where: {
            user: {
              teamMembers: { some: { teamId: { in: clubIds } } },
            },
            paymentStatus: "pending",
          },
        }),
        // W6: 프론트 NoticeSection 중복 API 제거
        // targetType: null(미지정), "all", "coach"만 코치에게 노출
        this.prisma.systemNotice.findMany({
          where: {
            isActive: true,
            OR: [
              { targetType: null },
              { targetType: "all" },
              { targetType: "coach" },
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
      ]),
      // 최근 활동 — 내부 쿼리가 포함되므로 $transaction 밖에서 병렬 실행 (총 2 커넥션)
      this.getRecentActivities(coachId, 5),
    ]);

    const [
      classes,
      monthPresent,
      monthTotal,
      newMembers,
      pendingEnrollments,
      monthPayments,
      pendingPayments,
      latestNotices,
    ] = batchResult;

    const monthlyAttendance =
      monthTotal > 0 ? Math.round((monthPresent / monthTotal) * 100) : 0;
    const monthRevenue = monthPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    // 클럽 이름 매핑
    const clubMap = new Map(clubs.map((c) => [c.id, c]));

    // 오늘 스케줄 추출 및 프론트엔드 포맷 변환
    // scheduledDate: 수업 시작 시각 ISO — 프론트 attendance-window 헬퍼에서 사용
    const todayScheduleItems: {
      time: string;
      scheduledDate: string;
      title: string;
      location: string;
      attendees: number;
      status: "completed" | "current" | "upcoming";
    }[] = [];

    let nextClassTime = "-";
    let nextClassDetail: {
      time: string;
      title: string;
      students: { name: string }[];
      totalStudents: number;
    } | null = null;

    for (const cls of classes) {
      // 2026-04-28: cls.startTime/endTime 은 시즌 시작/종료 일자(00:00)라 시:분 추출 불가 →
      // schedule 단위 시각으로 timeStr 을 동적 계산. (이전: cls 기반 timeStr 한 번 계산 후 재사용)
      for (const schedule of cls.schedules) {
        const schedDate = new Date(schedule.scheduledDate);
        if (schedDate < today || schedDate >= tomorrow) continue;

        // 2026-04-28: 시각 추출은 schedule.scheduledDate(정확한 수업 시각)에서.
        // Class.startTime/endTime 은 시즌 시작/종료 일자(00:00)라 시:분 추출이 불가능 →
        // 기존 로직은 모든 수업의 scheduledDate 응답을 today 00:00 으로 잘못 반환했고,
        // 프론트의 출석 윈도우 판정(getAttendanceWindowState)이 항상 closed 로 평가되어
        // 코치 대시보드에 "예정된 수업이 없습니다" 가 잘못 표시되던 버그 수정.
        const classStart = schedDate;
        // 종료 시각은 시작 +120분 가정 (학부모/코치 출석 윈도우 상한과 일치).
        const classEnd = new Date(schedDate.getTime() + 120 * 60_000);

        let status: "completed" | "current" | "upcoming" = "upcoming";
        if (now >= classEnd) status = "completed";
        else if (now >= classStart) status = "current";

        const club = cls.teamId ? clubMap.get(cls.teamId) : undefined;

        // 시각 표시 — class_schedules.start_time(text) 우선, 폴백 Class.startTime(UTC 추출).
        //   "입력 그대로의 값" SoT. 상태 판정(classStart/classEnd)은 scheduledDate 기반 유지(별도 이슈).
        const startLabel = resolveScheduleTime(schedule.startTime, cls.startTime);
        const endLabel = resolveScheduleTime(schedule.endTime, cls.endTime);
        const startHHMM = startLabel ?? "00:00";
        const scheduleTimeStr = startLabel
          ? endLabel
            ? `${startLabel} - ${endLabel}`
            : startLabel
          : "-";

        todayScheduleItems.push({
          time: scheduleTimeStr,
          scheduledDate: classStart.toISOString(),
          title: cls.className,
          location: club?.location || club?.name || "링크",
          attendees: schedule.attendances.length,
          status,
        });

        // 학생 목록 생성 헬퍼
        const buildStudents = () =>
          cls.enrollments.slice(0, 3).map((e) => ({
            name:
              `${e.child?.lastName ?? ""}${e.child?.firstName ?? ""}`.trim() ||
              "학생",
            badgeIcon: "star",
            badgeColor: "text-blue-600 dark:text-blue-400",
          }));

        // 다음 수업 시간 (upcoming 중 가장 빠른 것) — schedule 단위 시각 사용
        if (status === "upcoming" && nextClassTime === "-") {
          nextClassTime = startHHMM;
          nextClassDetail = {
            time: scheduleTimeStr,
            title: cls.className,
            students: buildStudents(),
            totalStudents: cls.enrollments.length,
          };
        }
        // current도 nextClassDetail 후보
        if (status === "current" && !nextClassDetail) {
          nextClassTime = startHHMM;
          nextClassDetail = {
            time: scheduleTimeStr,
            title: cls.className,
            students: buildStudents(),
            totalStudents: cls.enrollments.length,
          };
        }
      }
    }

    // 시간순 정렬
    todayScheduleItems.sort((a, b) => a.time.localeCompare(b.time));

    const todaySchedules = todayScheduleItems.length;
    const weekSchedules = classes.reduce(
      (sum, cls) => sum + cls.schedules.length,
      0,
    );

    // 월간 출석률 / 신규 회원 / 수강신청 / 결제 / 최근 활동 —
    // 모두 Step 2 Promise.all에서 이미 병렬 조회됨. 아래는 파생 매핑만 수행.

    const pendingMembers = pendingEnrollments.map((e) => {
      const name =
        `${e.child?.lastName ?? ""}${e.child?.firstName ?? ""}`.trim() ||
        "회원";
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      const dayOfWeek = days[new Date(e.class.startTime).getDay()];
      return {
        id: e.id,
        name,
        className: e.class.className,
        schedule: dayOfWeek ? `${dayOfWeek}요일` : "미정",
      };
    });

    // 결제 / 최근 활동도 Step 2 Promise.all에서 이미 조회됨.

    const result = {
      coachName,
      name: coachName,
      stats: {
        todayClasses: todaySchedules,
        nextClassTime,
        pendingApprovals: pendingMemberCount + pendingEnrollments.length,
        monthlyAttendance,
        attendanceTrend: "+0%",
        totalMembers: activeMembers,
        newMembers,
        attendanceCount: monthPresent,
        attendanceTotal: monthTotal,
      },
      schedules: todayScheduleItems,
      pendingMembers,
      nextClassDetail,
      // 기존 호환 필드 유지
      clubs: {
        total: clubs.length,
        activeMembers,
        pendingMembers: pendingMemberCount,
      },
      classes: {
        total: classes.length,
        todaySchedules,
        weekSchedules,
      },
      attendance: {
        todayPresent: monthPresent,
        todayAbsent: monthTotal - monthPresent,
        weekPresentRate: String(monthlyAttendance),
      },
      payments: {
        monthRevenue,
        monthPayments: monthPayments.length,
        pendingPayments,
      },
      recentActivities,
      // W6
      latestNotices,
    };

    // W2: 캐시 저장 (TTL 60s)
    await this.redis.set(cacheKey, result, 60);
    return result;
  }

  /**
   * 최근 활동 조회
   */
  async getRecentActivities(userId: string, limit: number = 10) {
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { userId },
          {
            resource: {
              contains: userId,
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return auditLogs.map((log) => ({
      id: log.id,
      type: log.action,
      message: this.formatActivityMessage(log.action, log.resource),
      userId: log.userId,
      createdAt: log.createdAt,
    }));
  }

  /**
   * 활동 메시지 포맷팅
   */
  private formatActivityMessage(action: string, _resource: string): string {
    const actionMap: Record<string, string> = {
      login: "로그인",
      logout: "로그아웃",
      attendance: "출석 체크",
      payment: "결제 완료",
      member_approved: "회원 승인",
      class_created: "수업 생성",
      schedule_cancelled: "일정 취소",
    };

    return actionMap[action] || action;
  }

  /**
   * 미결제 학부모 조회
   *
   * 코치가 담당하는 수업 중 지정 월 기준으로 ClassRegistration.active 이면서
   * 해당 월 paid Enrollment 가 없는 사용자를 반환합니다.
   *
   * @param coachUserId 코치 User.id
   * @param month 조회 월 (YYYY-MM 형식, 예: "2026-06")
   */
  async getUnpaidMembers(coachUserId: string, month: string) {
    const [yearStr, monthStr] = month.split("-");
    const targetYear = Number(yearStr);
    const targetMonth = Number(monthStr); // 1-based

    if (!targetYear || !targetMonth || targetMonth < 1 || targetMonth > 12) {
      return { month, count: 0, members: [] };
    }

    // 코치가 담당하는 팀 조회
    const managedTeams = await this.prisma.team.findMany({
      where: {
        OR: [
          { coachId: coachUserId },
          { coaches: { some: { userId: coachUserId } } },
          {
            members: {
              some: {
                userId: coachUserId,
                approvalStatus: "approved",
                leftAt: null,
                roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    const teamIds = managedTeams.map((t) => t.id);

    if (teamIds.length === 0) {
      return { month, count: 0, members: [] };
    }

    // 코치 담당 수업의 active ClassRegistration 조회
    // N+1 방지: userId/classId 로 먼저 조회 후 User/Class 별도 조회
    const activeRegistrations = await this.prisma.classRegistration.findMany({
      where: {
        status: "active",
        class: {
          teamId: { in: teamIds },
          isActive: true,
        },
      },
      select: {
        userId: true,
        classId: true,
      },
    });

    if (activeRegistrations.length === 0) {
      return { month, count: 0, members: [] };
    }

    // 등록된 userId/classId 집합으로 User, Class, ParentChild 조회
    const uniqueUserIds = [
      ...new Set(activeRegistrations.map((r) => r.userId)),
    ];
    const uniqueClassIds = [
      ...new Set(activeRegistrations.map((r) => r.classId)),
    ];

    const [users, classes] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: uniqueUserIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          childParents: {
            where: { isPrimary: true },
            select: {
              parent: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            take: 1,
          },
        },
      }),
      this.prisma.class.findMany({
        where: { id: { in: uniqueClassIds } },
        select: { id: true, className: true },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const classMap = new Map(classes.map((c) => [c.id, c]));

    // 해당 월 paid Enrollment 집합 구성 (childId+classId 키)
    const billingPeriodStart = new Date(targetYear, targetMonth - 1, 1);
    const billingPeriodEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const paidEnrollments = await this.prisma.enrollment.findMany({
      where: {
        status: "paid",
        paidAt: {
          gte: billingPeriodStart,
          lte: billingPeriodEnd,
        },
        class: { teamId: { in: teamIds } },
      },
      select: {
        childId: true,
        classId: true,
      },
    });

    const paidSet = new Set(
      paidEnrollments.map((e) => `${e.childId}::${e.classId}`),
    );

    // 미결제 필터링
    const unpaidMembers = activeRegistrations
      .filter((reg) => !paidSet.has(`${reg.userId}::${reg.classId}`))
      .map((reg) => {
        const child = userMap.get(reg.userId);
        const cls = classMap.get(reg.classId);
        const primaryParent = child?.childParents?.[0]?.parent;

        return {
          id: `${reg.userId}::${reg.classId}`,
          userId: reg.userId,
          parentName: primaryParent
            ? `${primaryParent.lastName ?? ""}${primaryParent.firstName ?? ""}`.trim()
            : "미연결",
          childName: child
            ? `${child.lastName ?? ""}${child.firstName ?? ""}`.trim()
            : reg.userId,
          classId: reg.classId,
          className: cls?.className ?? "알 수 없음",
          billingPeriod: month,
        };
      });

    return {
      month,
      count: unpaidMembers.length,
      members: unpaidMembers,
    };
  }
}
