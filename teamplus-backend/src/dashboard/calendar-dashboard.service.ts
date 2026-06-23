import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { resolveScheduleTime } from "@/common/utils/schedule-time.util";
import { scheduleEligibleClassFilter } from "@/common/billing/schedule-eligibility.util";

/**
 * CalendarDashboardService
 *
 * 통합 캘린더 API: 팀 훈련(Class/Training), 개인 레슨(LessonPackage), 대회(Tournament)를
 * 하나의 API로 병합하여 날짜순으로 반환합니다.
 *
 * 색상 코드 규칙 (기획서 기준):
 * - red: 팀 훈련 (REGULAR_TRAINING, GAME, FUN, CAMP, PICKUP)
 * - green: 개인 레슨 (lesson, regular_class, group_class)
 * - blue: 대회 (tournament)
 */

export interface CalendarEvent {
  id: string;
  type: "training" | "lesson" | "tournament";
  color: "red" | "green" | "blue";
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  teamId: string | null;
  name: string | null;
  /** 부가 정보 */
  meta?: Record<string, unknown>;
}

/** 훈련 전용 trainingType 값 (training.service.ts TRAINING_TYPES 참조) */
const TRAINING_TYPES = [
  "REGULAR_TRAINING",
  "GAME",
  "FUN",
  "CAMP",
  "PICKUP",
] as const;

/**
 * 레슨 계열 trainingType — classes 도메인 SoT (2026-05-11 정리).
 * 학부모용 통합 캘린더의 "오픈클래스 레슨" 카테고리 필터에 사용.
 * 옛 값(regular_class/group_class)은 더 이상 신규 저장되지 않으나
 * 과거 데이터 호환을 위해 인식 키로 보존.
 */
const LESSON_TYPES = [
  "lesson",
  // 하위 호환 (deprecated, 2026-05-11)
  "regular_class",
  "group_class",
] as const;

@Injectable()
export class CalendarDashboardService {
  private readonly logger = new Logger(CalendarDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/v1/dashboard/calendar
   *
   * @param userId   현재 로그인 사용자 ID
   * @param userType UserType — PARENT/CHILD/TEEN 은 enrollment paid 기반 격리, 코치/감독은 owner 기반
   * @param month    월 (YYYY-MM 형식, 예: "2026-04")
   * @param teamId   특정 클럽 필터 (선택)
   *
   * 2026-05-14: 정책 변경 — 오픈클래스는 "소속(AcademyMember)" 이 아닌 "수강(Enrollment paid)" 개념.
   *   - 학부모/학생: 자녀/본인의 결제 완료 수업만 노출. owner(team/academy) 필터 미적용.
   *   - 코치/감독: 본인 팀(TeamMember/CoachProfile/Team.coachId) + 학원(AcademyCoach/Academy.directorId) 의 수업.
   */
  async getCalendarEvents(
    userId: string,
    userType: string,
    month: string,
    teamId?: string,
  ): Promise<{ events: CalendarEvent[] }> {
    const { monthStart, monthEnd } = this.parseMonthRange(month);

    const isStudentSide =
      userType === "PARENT" || userType === "CHILD" || userType === "TEEN";

    // 학부모/학생: enrollment paid 격리용 자녀/본인 ID 집합 산출.
    let enrollmentUserIds: string[] | null = null;
    if (isStudentSide) {
      const ids = new Set<string>();
      if (userType === "CHILD" || userType === "TEEN") ids.add(userId);
      if (userType === "PARENT") {
        const pc = await this.prisma.parentChild.findMany({
          where: { parentId: userId },
          select: { childId: true },
        });
        pc.forEach((p) => ids.add(p.childId));
      }
      enrollmentUserIds = Array.from(ids);
      // 자녀 없는 학부모/단독 가입 — 빈 결과
      if (enrollmentUserIds.length === 0) return { events: [] };
    }

    // 코치/감독: owner ID 조회. 학부모/학생은 owner 무관 — 빈 배열.
    const { teamIds, academyIds } = isStudentSide
      ? { teamIds: [] as string[], academyIds: [] as string[] }
      : await this.resolveOwnerIds(userId, teamId);

    if (!isStudentSide && teamIds.length === 0 && academyIds.length === 0) {
      return { events: [] };
    }

    // 3개 소스 병렬 조회 — 대회는 학원 무관(팀 단위) 이므로 teamIds 만 전달.
    //   학부모/학생은 enrollmentUserIds 로 결제 수업 격리, 코치/감독은 owner 격리.
    const [trainingEvents, lessonEvents, tournamentEvents] = await Promise.all([
      this.fetchTrainingEvents(
        teamIds,
        academyIds,
        enrollmentUserIds,
        monthStart,
        monthEnd,
      ),
      this.fetchLessonEvents(
        teamIds,
        academyIds,
        enrollmentUserIds,
        monthStart,
        monthEnd,
      ),
      this.fetchTournamentEvents(
        teamIds,
        enrollmentUserIds,
        userId,
        monthStart,
        monthEnd,
      ),
    ]);

    // 전체 이벤트 날짜순 정렬
    const events = [
      ...trainingEvents,
      ...lessonEvents,
      ...tournamentEvents,
    ].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      // 같은 날이면 시작 시간순
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });

    this.logger.debug(
      `캘린더 조회: userId=${userId}, month=${month}, events=${events.length}건 (training=${trainingEvents.length}, lesson=${lessonEvents.length}, tournament=${tournamentEvents.length})`,
    );

    return { events };
  }

  // ─── 팀 훈련 (Class + ClassSchedule) ─────────────────────────

  private async fetchTrainingEvents(
    teamIds: string[],
    academyIds: string[],
    enrollmentUserIds: string[] | null,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<CalendarEvent[]> {
    // 2026-05-14: 학부모/학생은 enrollment paid 만으로 격리, 코치/감독은 owner OR 필터.
    const ownerFilters =
      enrollmentUserIds === null
        ? this.buildOwnerOrFilters(teamIds, academyIds)
        : null;
    if (ownerFilters && ownerFilters.length === 0) return [];

    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        isCancelled: false,
        scheduledDate: { gte: monthStart, lte: monthEnd },
        class: {
          AND: [
            ...(ownerFilters ? [{ OR: ownerFilters }] : []),
            // [Phase B] 일정 노출 자격 — 공통 SoT (선불 paid OR 후불 approved).
            ...(enrollmentUserIds
              ? [scheduleEligibleClassFilter(enrollmentUserIds)]
              : []),
          ],
          isActive: true,
          trainingType: { in: [...TRAINING_TYPES] },
        },
      },
      select: {
        id: true,
        scheduledDate: true,
        startTime: true, // 표시 시각 SoT (text "HH:mm") — 입력 그대로
        endTime: true,
        class: {
          select: {
            id: true,
            className: true,
            trainingType: true,
            instructorName: true,
            startTime: true,
            endTime: true,
            teamId: true,
            academyId: true,
            team: { select: { name: true } },
            academy: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return schedules.map((schedule) => {
      const ownerName =
        schedule.class.team?.name ?? schedule.class.academy?.name ?? "";
      return {
        id: schedule.id,
        type: "training" as const,
        color: "red" as const,
        title: schedule.class.className,
        date: this.formatDate(schedule.scheduledDate),
        startTime: resolveScheduleTime(schedule.startTime, schedule.class.startTime),
        endTime: resolveScheduleTime(schedule.endTime, schedule.class.endTime),
        venue: ownerName,
        teamId: schedule.class.teamId,
        name: ownerName,
        meta: {
          classId: schedule.class.id,
          trainingType: schedule.class.trainingType,
          instructorName: schedule.class.instructorName,
          academyId: schedule.class.academyId,
        },
      };
    });
  }

  // ─── 개인 레슨 (Class with lesson trainingType) ──────────────

  private async fetchLessonEvents(
    teamIds: string[],
    academyIds: string[],
    enrollmentUserIds: string[] | null,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<CalendarEvent[]> {
    // 2026-05-14: 오픈클래스 'lesson' 핵심 — 학부모/학생은 enrollment paid 만으로 격리.
    const ownerFilters =
      enrollmentUserIds === null
        ? this.buildOwnerOrFilters(teamIds, academyIds)
        : null;
    if (ownerFilters && ownerFilters.length === 0) return [];

    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        isCancelled: false,
        scheduledDate: { gte: monthStart, lte: monthEnd },
        class: {
          AND: [
            ...(ownerFilters ? [{ OR: ownerFilters }] : []),
            // [Phase B] 일정 노출 자격 — 공통 SoT (선불 paid OR 후불 approved).
            ...(enrollmentUserIds
              ? [scheduleEligibleClassFilter(enrollmentUserIds)]
              : []),
          ],
          isActive: true,
          trainingType: { in: [...LESSON_TYPES] },
        },
      },
      select: {
        id: true,
        scheduledDate: true,
        startTime: true, // 표시 시각 SoT (text "HH:mm") — 입력 그대로
        endTime: true,
        class: {
          select: {
            id: true,
            className: true,
            trainingType: true,
            instructorName: true,
            startTime: true,
            endTime: true,
            teamId: true,
            academyId: true,
            team: { select: { name: true } },
            academy: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return schedules.map((schedule) => {
      const ownerName =
        schedule.class.team?.name ?? schedule.class.academy?.name ?? "";
      return {
        id: schedule.id,
        type: "lesson" as const,
        color: "green" as const,
        title: schedule.class.className,
        date: this.formatDate(schedule.scheduledDate),
        startTime: resolveScheduleTime(schedule.startTime, schedule.class.startTime),
        endTime: resolveScheduleTime(schedule.endTime, schedule.class.endTime),
        venue: ownerName,
        teamId: schedule.class.teamId,
        name: ownerName,
        meta: {
          classId: schedule.class.id,
          trainingType: schedule.class.trainingType,
          instructorName: schedule.class.instructorName,
          academyId: schedule.class.academyId,
        },
      };
    });
  }

  /**
   * 2026-05-14: 팀/학원 owner OR 필터 빌더.
   *   teamIds 빈 배열 → 팀 절 생략, academyIds 빈 배열 → 학원 절 생략.
   *   둘 다 빈 배열이면 호출자가 미리 체크하여 빈 결과 반환해야 함.
   *
   * [추가 2026-05-15] ClassTeamVisibility 절 추가 — 코치/감독이 학원에 직접 소속되어
   *   있지 않더라도, 본인 팀이 오픈클래스 visibility 에 등록되어 있으면 캘린더에
   *   오픈클래스 일정이 노출되도록 한다. 수업목록(/classes) 노출 정책과 정합화.
   *   ex) 임감독(블리자드 소유) ← 오분글 감독이 블리자드 팀을 visibility 추가한
   *       오픈클래스 → 캘린더에도 표시.
   */
  private buildOwnerOrFilters(teamIds: string[], academyIds: string[]) {
    const filters: Array<{
      teamId?: { in: string[] };
      academyId?: { in: string[] };
      teamVisibilities?: { some: { teamId: { in: string[] } } };
    }> = [];
    if (teamIds.length > 0) {
      filters.push({ teamId: { in: teamIds } });
      // 오픈클래스(teamId=null) — 본인 팀이 ClassTeamVisibility 에 등록된 것.
      filters.push({ teamVisibilities: { some: { teamId: { in: teamIds } } } });
    }
    if (academyIds.length > 0) filters.push({ academyId: { in: academyIds } });
    return filters;
  }

  // ─── 대회 (Tournament) ───────────────────────────────────────

  private async fetchTournamentEvents(
    teamIds: string[],
    enrollmentUserIds: string[] | null,
    viewerUserId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<CalendarEvent[]> {
    // [수정 2026-05-15] 대회 결제 로직 — 수업과 동일.
    //  · 학부모/학생(enrollmentUserIds 존재): 본인/자녀가 selectedParticipantIds 포함 +
    //    (a) 무료 대회(feePerGame 없음/0) 또는
    //    (b) TournamentRegistration.paymentStatus="PAID" 인 대회만 노출.
    //  · 코치/감독(enrollmentUserIds === null): teamId 매칭 또는 teamId=null 전체 대회 노출.
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: { not: "cancelled" },
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
        // [수정 2026-06-15] 1차 팀 필터는 코치/감독(enrollmentUserIds===null)에만 적용.
        //   학부모/학생은 본인이 TeamMember 가 아니어서 teamIds 가 비는 경우가 많아,
        //   teamId 가 있는 팀 대회(자녀가 결제·선택된 대회 포함)가 통째로 누락되던 버그.
        //   학부모/학생은 팀 절을 생략하고, 아래 2차(selectedParticipantIds/eligibleGroup
        //   + PAID) 필터로 본인/자녀 참가 대회만 정확히 노출한다.
        ...(enrollmentUserIds === null
          ? { OR: [{ teamId: { in: teamIds } }, { teamId: null }] }
          : {}),
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        teamId: true,
        feePerGame: true,
        selectedParticipantIds: true,
        team: {
          select: { name: true },
        },
        rink: {
          select: { name: true, location: true },
        },
      },
      orderBy: { startDate: "asc" },
    });

    // 학부모/학생 필터 — 2차 in-memory (selectedParticipantIds JSON · paid 매칭).
    let visibleTournaments = tournaments;
    if (enrollmentUserIds !== null) {
      const memberSet = new Set(enrollmentUserIds);
      const paidRegs = await this.prisma.tournamentRegistration.findMany({
        where: {
          paymentStatus: "PAID",
          OR: [
            { userId: viewerUserId },
            { userId: { in: enrollmentUserIds } },
            { childId: { in: enrollmentUserIds } },
          ],
          tournamentId: { in: tournaments.map((t) => t.id) },
        },
        select: { tournamentId: true },
      });
      const paidTournamentIds = new Set(paidRegs.map((r) => r.tournamentId));

      // [재설계 2026-06-16] selectedParticipantIds(선수 명단 스냅샷) 단독 SoT.
      //   그룹 분기(byGroup/eligibleGroupIds)는 제거 — 명단이 자격을 단독으로 결정한다.
      visibleTournaments = tournaments.filter((t) => {
        // [2026-06-15] 결제완료(PAID)한 대회는 자격/선택 무관 무조건 노출.
        //   selectedParticipantIds 가 비어 결제가 허용된 경우나 출생연도 자격과
        //   무관하게, 이미 결제한 본인/자녀에게는 일정(달력)에 반드시 보여야 한다.
        if (paidTournamentIds.has(t.id)) return true;
        // 미결제 대회: selectedParticipantIds 직접 매칭 + 무료 대회만 노출(유료 미결제는 숨김).
        const list = Array.isArray(t.selectedParticipantIds)
          ? (t.selectedParticipantIds as unknown as string[])
          : [];
        const byParticipant = list.some((id) => memberSet.has(id));
        if (!byParticipant) return false;
        // 무료 대회만 결제 없이 노출 (유료 미결제는 숨김).
        const fee = t.feePerGame ? Number(t.feePerGame) : 0;
        return fee <= 0;
      });
    }

    // [수정 2026-05-15] 대회는 시작일에만 단일 이벤트 노출 — 사용자 명시.
    //  이전엔 startDate~endDate 기간 내 모든 날짜에 이벤트를 깔아 캘린더 도배.
    //  startDate 가 조회 월 범위(monthStart~monthEnd) 에 들어올 때만 매핑.
    const events: CalendarEvent[] = [];

    for (const tournament of visibleTournaments) {
      const startDt = tournament.startDate;
      if (startDt < monthStart || startDt > monthEnd) continue;

      events.push({
        id: `${tournament.id}`,
        type: "tournament" as const,
        color: "blue" as const,
        title: tournament.name,
        date: this.formatDate(startDt),
        startTime: null,
        endTime: null,
        venue: tournament.rink?.name ?? tournament.rink?.location ?? null,
        teamId: tournament.teamId,
        name: tournament.team?.name ?? null,
        meta: {
          tournamentId: tournament.id,
          status: tournament.status,
          startDate: this.formatDate(tournament.startDate),
          endDate: this.formatDate(tournament.endDate),
        },
      });
    }

    // [2026-06-05 4단계] 노출 대상 대회의 개별 경기일정(HockeyMatch)을 달력 이벤트로 추가.
    //   결제(또는 무료 참가)한 대회의 "N경기 vs 상대팀"을 경기 날짜/시간에 표시한다.
    const visibleIds = visibleTournaments.map((t) => t.id);
    if (visibleIds.length > 0) {
      const matches = await this.prisma.hockeyMatch.findMany({
        where: {
          tournamentId: { in: visibleIds },
          status: { not: "cancelled" },
          scheduledAt: { gte: monthStart, lte: monthEnd },
        },
        select: {
          id: true,
          tournamentId: true,
          scheduledAt: true,
          opponentName: true,
          matchOrder: true,
          awayTeam: { select: { name: true } },
          venue: { select: { name: true } },
          rink: { select: { name: true } },
        },
        orderBy: { scheduledAt: "asc" },
      });
      const byId = new Map(visibleTournaments.map((t) => [t.id, t]));
      for (const m of matches) {
        const t = m.tournamentId ? byId.get(m.tournamentId) : undefined;
        if (!t) continue;
        const opponent = m.awayTeam?.name ?? m.opponentName ?? "상대팀 미정";
        const order = m.matchOrder ? `${m.matchOrder}경기 ` : "";
        events.push({
          id: `match-${m.id}`,
          type: "tournament" as const,
          color: "blue" as const,
          title: `${t.name} ${order}vs ${opponent}`,
          date: this.formatDate(m.scheduledAt),
          startTime: this.formatTime(m.scheduledAt),
          endTime: null,
          venue: m.venue?.name ?? m.rink?.name ?? null,
          teamId: t.teamId,
          name: t.team?.name ?? null,
          meta: {
            tournamentId: t.id,
            matchId: m.id,
            opponentName: opponent,
          },
        });
      }
    }

    return events;
  }

  // ─── 유틸리티 ────────────────────────────────────────────────

  /**
   * 2026-05-14: 사용자 소속 owner(팀+학원) ID 목록 조회.
   *   기존 resolveClubIds 를 확장해 학원(AcademyMember/AcademyCoach/Academy.directorId)
   *   소속도 함께 조회. 학원 수업 일정이 학부모/자녀/코치/감독 캘린더에 노출되도록.
   *
   *   teamId 파라미터가 주어지면 단일 팀만(학원 미조회 — 명시적 팀 필터링 의도).
   */
  private async resolveOwnerIds(
    userId: string,
    teamId?: string,
  ): Promise<{ teamIds: string[]; academyIds: string[] }> {
    if (teamId) {
      return { teamIds: [teamId], academyIds: [] };
    }

    // 팀: 회원/코치/감독
    const memberClubs = await this.prisma.teamMember.findMany({
      where: { userId, approvalStatus: "approved" },
      select: { teamId: true },
    });
    const coachClubs = await this.prisma.coachProfile.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const directorClubs = await this.prisma.team.findMany({
      where: { coachId: userId },
      select: { id: true },
    });

    // 학원: 멤버/코치/감독.
    //   AcademyMember.status: PENDING|ACTIVE|INACTIVE|BLOCKED — ACTIVE 만 노출.
    //   본인 명의(userId) 또는 자녀 보유(childId) 둘 다 본인의 학원으로 인정.
    const memberAcademies = await this.prisma.academyMember.findMany({
      where: {
        OR: [{ userId }, { childId: userId }],
        status: "ACTIVE",
      },
      select: { academyId: true },
    });
    const coachAcademies = await this.prisma.academyCoach.findMany({
      where: { userId, isActive: true },
      select: { academyId: true },
    });
    const directorAcademies = await this.prisma.academy.findMany({
      where: { directorId: userId },
      select: { id: true },
    });

    // PARENT — 자녀의 팀/학원 멤버십도 포함
    const parentChildren = await this.prisma.parentChild.findMany({
      where: { parentId: userId },
      select: { childId: true },
    });
    const childIds = parentChildren.map((pc) => pc.childId);

    let childrenClubs: { teamId: string }[] = [];
    let childrenAcademies: { academyId: string }[] = [];
    if (childIds.length > 0) {
      [childrenClubs, childrenAcademies] = await Promise.all([
        this.prisma.teamMember.findMany({
          where: { userId: { in: childIds }, approvalStatus: "approved" },
          select: { teamId: true },
        }),
        // 자녀가 직접 가입한 학원(userId) + 학부모가 자녀를 위해 등록한 학원(childId)
        this.prisma.academyMember.findMany({
          where: {
            OR: [{ userId: { in: childIds } }, { childId: { in: childIds } }],
            status: "ACTIVE",
          },
          select: { academyId: true },
        }),
      ]);
    }

    const teamIdSet = new Set<string>();
    memberClubs.forEach((m) => teamIdSet.add(m.teamId));
    coachClubs.forEach((c) => {
      if (c.teamId) teamIdSet.add(c.teamId);
    });
    directorClubs.forEach((d) => teamIdSet.add(d.id));
    childrenClubs.forEach((c) => teamIdSet.add(c.teamId));

    const academyIdSet = new Set<string>();
    memberAcademies.forEach((m) => academyIdSet.add(m.academyId));
    coachAcademies.forEach((c) => academyIdSet.add(c.academyId));
    directorAcademies.forEach((a) => academyIdSet.add(a.id));
    childrenAcademies.forEach((c) => academyIdSet.add(c.academyId));

    return {
      teamIds: [...teamIdSet],
      academyIds: [...academyIdSet],
    };
  }

  private parseMonthRange(month: string): {
    monthStart: Date;
    monthEnd: Date;
  } {
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;

    // 해당 월 첫날 00:00:00 ~ 마지막날 23:59:59
    const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

    return { monthStart, monthEnd };
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private formatTime(date: Date): string {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
}
