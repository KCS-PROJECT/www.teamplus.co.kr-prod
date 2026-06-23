import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { resolveScheduleTime } from "@/common/utils/schedule-time.util";
import { scheduleEligibleClassFilter } from "@/common/billing/schedule-eligibility.util";
import { resolveScopedChildUserIds } from "@/common/utils/team-scope.util";

export interface CalendarEvent {
  type: "TEAM_TRAINING" | "PERSONAL_LESSON" | "TOURNAMENT";
  color: string;
  title: string;
  refId: string;
  refType: "class_schedule" | "tournament" | "hockey_match";
  timeStart: string;
  timeEnd: string;
  /** 표시 시각 SoT (text "HH:mm") — ClassSchedule.start_time 우선, 입력 그대로. timeStart(ISO)는 호환 유지. */
  displayStart?: string | null;
  displayEnd?: string | null;
}

export interface CalendarDay {
  date: string;
  events: CalendarEvent[];
}

export interface CalendarHistoryMonth {
  month: number;
  classCount: number;
  tournamentCount: number;
  total: number;
}

/**
 * 레슨 계열 trainingType — classes 도메인 SoT (2026-05-11 정리).
 * 옛 값(academy_lesson/game_lesson/camp)은 더 이상 신규 저장되지 않으나,
 * 과거 데이터 호환을 위해 인식 키로 보존.
 */
const LESSON_TRAINING_TYPES = new Set([
  "lesson",
  // 하위 호환 (deprecated, 2026-05-11)
  "academy_lesson",
  "game_lesson",
]);

const EVENT_COLORS = {
  TEAM_TRAINING: "#DC2626",
  PERSONAL_LESSON: "#16A34A",
  TOURNAMENT: "#0284C7",
} as const;

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 해당 월의 통합 이벤트 조회
   * 소속 클럽 기준 필터 + PARENT인 경우 자녀 클럽 포함
   */
  async getMonthlyCalendar(
    userId: string,
    userType: string,
    month: string,
    childId?: string,
  ): Promise<CalendarDay[]> {
    const { start, end } = this.parseMonthRange(month);

    // 2026-05-14: 정책 — 오픈클래스는 "수강" 개념. 학부모/학생은 enrollment paid 격리만.
    //   PARENT/CHILD/TEEN 은 자녀/본인의 결제 완료 수업만 노출 (학원 가입 무관).
    //   COACH/DIRECTOR/ADMIN 은 본인 owner(팀/학원) 의 수업.
    // childId 지정 시(학부모 자녀 선택) 해당 자녀 enrollment 로만 좁힘.
    const restrictByRegistration =
      userType === "PARENT" || userType === "CHILD" || userType === "TEEN";

    let registrationUserIds: string[] | null = null;
    if (restrictByRegistration) {
      registrationUserIds =
        userType === "PARENT"
          ? await resolveScopedChildUserIds(this.prisma, userId, childId)
          : [userId];
    }

    // 코치/감독만 owner ID 조회 — 학부모/학생은 enrollment paid 가 격리 보장.
    const { teamIds, academyIds } = restrictByRegistration
      ? { teamIds: [] as string[], academyIds: [] as string[] }
      : await this.getUserOwnerIds(userId, userType);

    const [schedules, tournaments] = await Promise.all([
      this.fetchClassSchedules(
        teamIds,
        academyIds,
        start,
        end,
        registrationUserIds,
      ),
      // [2026-06-15] 학부모/학생은 자녀/본인의 결제완료(PAID)·명시선택 대회를 노출
      //   (registrationUserIds 전달), 코치/감독은 teamIds 기준.
      this.fetchTournaments(teamIds, start, end, registrationUserIds),
    ]);

    // [2026-06-15] 노출 대회의 실제 경기일정(HockeyMatch)을 각 경기 날짜/시간에 표시.
    const matches = await this.fetchTournamentMatches(
      tournaments.map((t) => t.id),
      start,
      end,
    );

    return this.groupByDate(schedules, tournaments, matches, start, end);
  }

  /**
   * 연간 월별 이벤트 집계
   */
  async getYearlyHistory(
    userId: string,
    userType: string,
    year: string,
    childId?: string,
  ): Promise<CalendarHistoryMonth[]> {
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new BadRequestException("유효하지 않은 연도입니다.");
    }

    const yearStart = new Date(yearNum, 0, 1);
    const yearEnd = new Date(yearNum + 1, 0, 1);

    // 2026-05-14: 학부모/학생은 enrollment paid 격리, 코치/감독은 owner 격리.
    // childId 지정 시(학부모 자녀 선택) 해당 자녀 enrollment 로만 좁힘.
    const restrictByRegistration =
      userType === "PARENT" || userType === "CHILD" || userType === "TEEN";

    let registrationUserIds: string[] | null = null;
    if (restrictByRegistration) {
      registrationUserIds =
        userType === "PARENT"
          ? await resolveScopedChildUserIds(this.prisma, userId, childId)
          : [userId];
    }

    const { teamIds, academyIds } = restrictByRegistration
      ? { teamIds: [] as string[], academyIds: [] as string[] }
      : await this.getUserOwnerIds(userId, userType);

    // 2026-05-14: 학부모/학생은 enrollment paid 격리 / 코치/감독은 owner 격리.
    const useOwnerFilter = registrationUserIds === null;
    const ownerFilters: Array<{
      teamId?: { in: string[] };
      academyId?: { in: string[] };
    }> = [];
    if (useOwnerFilter) {
      if (teamIds.length > 0) ownerFilters.push({ teamId: { in: teamIds } });
      if (academyIds.length > 0)
        ownerFilters.push({ academyId: { in: academyIds } });
    }

    const skipSchedules =
      (registrationUserIds && registrationUserIds.length === 0) ||
      (useOwnerFilter && ownerFilters.length === 0);

    const [schedules, tournaments] = await Promise.all([
      skipSchedules
        ? Promise.resolve([] as { scheduledDate: Date }[])
        : this.prisma.classSchedule.findMany({
            where: {
              scheduledDate: { gte: yearStart, lt: yearEnd },
              isCancelled: false,
              class: {
                AND: [
                  ...(useOwnerFilter ? [{ OR: ownerFilters }] : []),
                  // [Phase B] 일정 노출 자격 — 공통 SoT (선불 paid OR 후불 approved).
                  ...(registrationUserIds
                    ? [scheduleEligibleClassFilter(registrationUserIds)]
                    : []),
                ],
              },
            },
            select: { scheduledDate: true },
          }),
      // 대회는 팀 단위 운영 — 학원 무관.
      teamIds.length === 0
        ? Promise.resolve([] as { startDate: Date; endDate: Date }[])
        : this.prisma.tournament.findMany({
            where: {
              startDate: { lt: yearEnd },
              endDate: { gte: yearStart },
              teamId: { in: teamIds },
              status: { not: "cancelled" },
            },
            select: { startDate: true, endDate: true },
          }),
    ]);

    const result: CalendarHistoryMonth[] = [];
    for (let m = 1; m <= 12; m++) {
      const mStart = new Date(yearNum, m - 1, 1);
      const mEnd = new Date(yearNum, m, 1);

      const classCount = schedules.filter((s) => {
        const d = s.scheduledDate;
        return d >= mStart && d < mEnd;
      }).length;

      const tournamentCount = tournaments.filter((t) => {
        return t.startDate < mEnd && t.endDate >= mStart;
      }).length;

      result.push({
        month: m,
        classCount,
        tournamentCount,
        total: classCount + tournamentCount,
      });
    }

    return result;
  }

  // ──────────── Private helpers ────────────

  private parseMonthRange(month: string): { start: Date; end: Date } {
    const match = month.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new BadRequestException("month 형식은 YYYY-MM 이어야 합니다.");
    }
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    if (m < 0 || m > 11)
      throw new BadRequestException("유효하지 않은 월입니다.");
    return {
      start: new Date(y, m, 1),
      end: new Date(y, m + 1, 1),
    };
  }

  /**
   * 2026-05-14: 학원 호환 — 사용자 소속 owner(팀+학원) ID 분리 반환.
   *   기존 getUserClubIds 를 확장. PARENT 는 자녀의 팀·학원 멤버십도 포함.
   *   학원: AcademyMember(status='ACTIVE') + AcademyCoach(isActive=true) + Academy.directorId.
   *   본인 명의(userId) 또는 자녀 보유(childId) AcademyMember 둘 다 인정.
   */
  private async getUserOwnerIds(
    userId: string,
    userType: string,
  ): Promise<{ teamIds: string[]; academyIds: string[] }> {
    const teamIdSet = new Set<string>();
    const academyIdSet = new Set<string>();

    // 본인 TeamMember
    const ownMemberships = await this.prisma.teamMember.findMany({
      where: { userId, approvalStatus: "approved" },
      select: { teamId: true },
    });
    ownMemberships.forEach((m) => teamIdSet.add(m.teamId));

    // 본인 학원 — 멤버/코치/감독
    const [ownAcademyMembers, ownAcademyCoaches, ownAcademyDirected] =
      await Promise.all([
        this.prisma.academyMember.findMany({
          where: {
            OR: [{ userId }, { childId: userId }],
            status: "ACTIVE",
          },
          select: { academyId: true },
        }),
        this.prisma.academyCoach.findMany({
          where: { userId, isActive: true },
          select: { academyId: true },
        }),
        this.prisma.academy.findMany({
          where: { directorId: userId },
          select: { id: true },
        }),
      ]);
    ownAcademyMembers.forEach((m) => academyIdSet.add(m.academyId));
    ownAcademyCoaches.forEach((c) => academyIdSet.add(c.academyId));
    ownAcademyDirected.forEach((a) => academyIdSet.add(a.id));

    // PARENT — 자녀의 팀·학원 멤버십도 포함
    if (userType === "PARENT") {
      const parentChildren = await this.prisma.parentChild.findMany({
        where: { parentId: userId },
        select: { childId: true },
      });
      if (parentChildren.length > 0) {
        const childIds = parentChildren.map((pc) => pc.childId);
        const [childMemberships, childAcademyMembers] = await Promise.all([
          this.prisma.teamMember.findMany({
            where: { userId: { in: childIds }, approvalStatus: "approved" },
            select: { teamId: true },
          }),
          this.prisma.academyMember.findMany({
            where: {
              OR: [{ userId: { in: childIds } }, { childId: { in: childIds } }],
              status: "ACTIVE",
            },
            select: { academyId: true },
          }),
        ]);
        childMemberships.forEach((m) => teamIdSet.add(m.teamId));
        childAcademyMembers.forEach((m) => academyIdSet.add(m.academyId));
      }
    }

    return {
      teamIds: Array.from(teamIdSet),
      academyIds: Array.from(academyIdSet),
    };
  }

  private async fetchClassSchedules(
    teamIds: string[],
    academyIds: string[],
    start: Date,
    end: Date,
    /**
     * [추가 2026-05-13] 등록 학생 user id 집합 — PARENT/CHILD/TEEN 시 자녀/본인의
     *  ClassRegistration(active) 이 있는 수업만 노출. null = 학부모/학생 제한 없음(코치/감독/관리자).
     *  empty array = 자녀 없음 → 결과 빈 배열.
     */
    registrationUserIds: string[] | null = null,
  ) {
    if (registrationUserIds && registrationUserIds.length === 0) return [];
    // 코치/감독 분기: owner 필요. 학부모/학생 분기: enrollment paid 만으로 격리되므로 owner 불필요.
    if (
      registrationUserIds === null &&
      teamIds.length === 0 &&
      academyIds.length === 0
    ) {
      return [];
    }

    // 코치/감독용 owner OR 필터 (학부모/학생은 사용 안 함).
    const ownerFilters: Array<{
      teamId?: { in: string[] };
      academyId?: { in: string[] };
    }> = [];
    if (teamIds.length > 0) ownerFilters.push({ teamId: { in: teamIds } });
    if (academyIds.length > 0)
      ownerFilters.push({ academyId: { in: academyIds } });

    // 2026-05-14: 정책 변경 — 오픈클래스는 "소속" 이 아닌 "수강" 개념.
    //   - 학부모/학생(registrationUserIds 있음): enrollment paid 격리만 사용, owner 필터 생략.
    //     자녀가 어느 학원/팀에 가입했든 무관하게, 결제한 수업이면 모두 노출.
    //   - 코치/감독(registrationUserIds null): owner 필터 적용 — 본인 팀/학원 수업만.
    const useOwnerFilter = registrationUserIds === null;

    return this.prisma.classSchedule.findMany({
      where: {
        scheduledDate: { gte: start, lt: end },
        isCancelled: false,
        class: {
          AND: [
            ...(useOwnerFilter ? [{ OR: ownerFilters }] : []),
            // [Phase B] 일정 노출 자격 — 공통 SoT (선불 paid OR 후불 approved).
            //  코치 자동배치(Enrollment 없음)·선불 미결제는 제외.
            ...(registrationUserIds
              ? [scheduleEligibleClassFilter(registrationUserIds)]
              : []),
          ],
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
            startTime: true,
            endTime: true,
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });
  }

  private async fetchTournaments(
    clubIds: string[],
    start: Date,
    end: Date,
    registrationUserIds: string[] | null,
  ) {
    // [2026-06-15] 학부모/학생(registrationUserIds 존재): 자녀/본인이 결제완료(PAID)했거나
    //   selectedParticipantIds 에 포함된 대회를 노출. 팀 멤버십 무관 — 결제/명시선택 기준.
    //   (학부모는 본인이 팀 멤버가 아니어서 teamIds 가 비어 대회가 통째 누락되던 버그 수정)
    if (registrationUserIds !== null) {
      if (registrationUserIds.length === 0) return [];
      const idSet = new Set(registrationUserIds);
      const paidRegs = await this.prisma.tournamentRegistration.findMany({
        where: {
          paymentStatus: "PAID",
          OR: [
            { childId: { in: registrationUserIds } },
            { userId: { in: registrationUserIds } },
          ],
        },
        select: { tournamentId: true },
      });
      const paidTids = new Set(paidRegs.map((r) => r.tournamentId));
      const rows = await this.prisma.tournament.findMany({
        where: {
          startDate: { lt: end },
          endDate: { gte: start },
          status: { not: "cancelled" },
        },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          selectedParticipantIds: true,
        },
        orderBy: { startDate: "asc" },
      });
      return rows
        .filter((t) => {
          if (paidTids.has(t.id)) return true;
          const list = Array.isArray(t.selectedParticipantIds)
            ? (t.selectedParticipantIds as unknown as string[])
            : [];
          return list.some((x) => idSet.has(x));
        })
        .map(({ id, name, startDate, endDate }) => ({
          id,
          name,
          startDate,
          endDate,
        }));
    }
    // 코치/감독: 본인 관리 팀 대회
    if (clubIds.length === 0) return [];
    return this.prisma.tournament.findMany({
      where: {
        startDate: { lt: end },
        endDate: { gte: start },
        teamId: { in: clubIds },
        status: { not: "cancelled" },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
      },
      orderBy: { startDate: "asc" },
    });
  }

  /**
   * [2026-06-15] 노출 대회들의 실제 경기일정(HockeyMatch) 조회 — 달력에 경기 날짜/시간 표시.
   */
  private async fetchTournamentMatches(
    tournamentIds: string[],
    start: Date,
    end: Date,
  ) {
    if (tournamentIds.length === 0) return [];
    return this.prisma.hockeyMatch.findMany({
      where: {
        tournamentId: { in: tournamentIds },
        status: { not: "cancelled" },
        scheduledAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        tournamentId: true,
        scheduledAt: true,
        opponentName: true,
        matchOrder: true,
        awayTeam: { select: { name: true } },
        tournament: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });
  }

  private groupByDate(
    schedules: Awaited<ReturnType<typeof this.fetchClassSchedules>>,
    tournaments: Awaited<ReturnType<typeof this.fetchTournaments>>,
    matches: Awaited<ReturnType<typeof this.fetchTournamentMatches>>,
    start: Date,
    _end: Date,
  ): CalendarDay[] {
    const dayMap = new Map<string, CalendarEvent[]>();

    for (const s of schedules) {
      const dateKey = this.toDateKey(s.scheduledDate);
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);

      const isLesson = LESSON_TRAINING_TYPES.has(s.class.trainingType ?? "");
      const type = isLesson ? "PERSONAL_LESSON" : "TEAM_TRAINING";

      dayMap.get(dateKey)!.push({
        type,
        color: EVENT_COLORS[type],
        title: s.class.className,
        refId: s.id,
        refType: "class_schedule",
        timeStart: s.class.startTime.toISOString(),
        timeEnd: s.class.endTime.toISOString(),
        // 표시 시각 — ClassSchedule.start_time(text) 우선, 폴백 Class.startTime(UTC 추출).
        //   프론트는 이 값을 그대로 노출(입력값 "HH:mm"과 일치).
        displayStart: resolveScheduleTime(s.startTime, s.class.startTime),
        displayEnd: resolveScheduleTime(s.endTime, s.class.endTime),
      });
    }

    // [2026-06-15] 대회 경기일정(HockeyMatch) — 각 경기 날짜/시간에 이벤트 추가.
    const pad = (n: number) => String(n).padStart(2, "0");
    const matchedTournamentIds = new Set<string>();
    for (const m of matches) {
      if (m.tournamentId) matchedTournamentIds.add(m.tournamentId);
      const dateKey = this.toDateKey(m.scheduledAt);
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
      const opponent = m.awayTeam?.name ?? m.opponentName ?? "상대팀 미정";
      const order = m.matchOrder ? `${m.matchOrder}경기 ` : "";
      const hhmm = `${pad(m.scheduledAt.getHours())}:${pad(m.scheduledAt.getMinutes())}`;
      dayMap.get(dateKey)!.push({
        type: "TOURNAMENT",
        color: EVENT_COLORS.TOURNAMENT,
        title: `${m.tournament?.name ?? "대회"} ${order}vs ${opponent}`.trim(),
        refId: m.id,
        refType: "hockey_match",
        timeStart: m.scheduledAt.toISOString(),
        timeEnd: m.scheduledAt.toISOString(),
        displayStart: hhmm,
        displayEnd: hhmm,
      });
    }

    for (const t of tournaments) {
      // [2026-06-15] 경기일정(HockeyMatch)이 있는 대회는 위 경기 이벤트로 대체 — 시작일 단일 이벤트 생략.
      //   경기일정이 아직 없는 대회만 시작일에 1회 노출(폴백).
      if (matchedTournamentIds.has(t.id)) continue;
      const eventDate = t.startDate >= start ? t.startDate : start;
      const dateKey = this.toDateKey(eventDate);
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);

      dayMap.get(dateKey)!.push({
        type: "TOURNAMENT",
        color: EVENT_COLORS.TOURNAMENT,
        title: t.name,
        refId: t.id,
        refType: "tournament",
        timeStart: t.startDate.toISOString(),
        timeEnd: t.endDate.toISOString(),
      });
    }

    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, events]) => ({ date, events }));
  }

  private toDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}
