import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { JoinTeamDto } from "./dto/join-team.dto";
import {
  ApproveMemberDto,
  MemberApprovalStatus,
} from "./dto/approve-member.dto";
import { BulkApproveMembersDto } from "./dto/bulk-approve.dto";
// Phase 2.5 (2026-04-29) — 옛 TeamsService 흡수: 로스터 관리 DTO
import { AddRosterMemberDto, UpdateRosterMemberDto } from "./dto/roster.dto";

/**
 * Phase 4 (2026-04-29) — Team 응답 헬퍼 (Phase 2.5에서 승계)
 * 프론트엔드 E·F 단계 완료 전까지 teamId 필드 유지
 *
 * [수정 2026-04-30] _count.members → _count.roster + memberCount 별칭 매핑.
 *   FE TeamListCard 가 `team._count?.roster ?? team.memberCount ?? 0` 형태로 둘 다 받음.
 */
function toTeamResponse<
  T extends {
    id: string;
    name: string;
    _count?: { members?: number; groups?: number };
  },
>(team: T) {
  const memberCount = team._count?.members ?? 0;
  const groupCount = team._count?.groups ?? 0;
  return {
    ...team,
    teamName: team.name,
    teamId: team.id,
    team: { id: team.id, teamName: team.name },
    memberCount,
    _count: {
      roster: memberCount,
      groups: groupCount,
    },
  };
}

/**
 * 04c 감독 팀 관리 카드용 추가 메타데이터.
 * - pendingApplications: 승인 대기 중인 가입 신청 수 (TeamMember.approvalStatus='pending')
 * - nextEvent: 다음 예정된 팀 이벤트 (가장 가까운 미래 startAt)
 */
type TeamCardMeta = {
  pendingApplications: number;
  nextEvent: {
    id: string;
    title: string;
    eventType: string; // clinic|trial|tournament|friendly|meeting
    startAt: string;
    endAt: string;
    location: string | null;
    isUrgent: boolean; // 24시간 이내 시작
  } | null;
};

async function loadTeamCardMeta(
  prisma: PrismaService,
  teamIds: string[],
): Promise<Map<string, TeamCardMeta>> {
  const result = new Map<string, TeamCardMeta>();
  if (teamIds.length === 0) return result;

  const now = new Date();
  const urgentThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [pendingCounts, nextEvents] = await Promise.all([
    prisma.teamMember.groupBy({
      by: ["teamId"],
      where: {
        teamId: { in: teamIds },
        approvalStatus: "pending",
        leftAt: null,
      },
      _count: { _all: true },
    }),
    prisma.teamEvent.findMany({
      where: {
        teamId: { in: teamIds },
        startAt: { gte: now },
        status: { in: ["published", "draft"] },
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        teamId: true,
        title: true,
        eventType: true,
        startAt: true,
        endAt: true,
        team: { select: { location: true, homeArena: true } },
      },
    }),
  ]);

  const pendingMap = new Map(
    pendingCounts.map((p) => [p.teamId, p._count._all] as const),
  );

  // 팀별 첫 번째(가장 가까운) 이벤트만 선택
  const eventMap = new Map<string, (typeof nextEvents)[number]>();
  for (const ev of nextEvents) {
    if (!eventMap.has(ev.teamId)) eventMap.set(ev.teamId, ev);
  }

  for (const teamId of teamIds) {
    const ev = eventMap.get(teamId);
    result.set(teamId, {
      pendingApplications: pendingMap.get(teamId) ?? 0,
      nextEvent: ev
        ? {
            id: ev.id,
            title: ev.title,
            eventType: ev.eventType,
            startAt: ev.startAt.toISOString(),
            endAt: ev.endAt.toISOString(),
            location: ev.team?.homeArena ?? ev.team?.location ?? null,
            isUrgent: ev.startAt < urgentThreshold,
          }
        : null,
    });
  }

  return result;
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 새 팀 생성 (감독만 생성 가능)
   */
  async createTeam(userId: string, createTeamDto: CreateTeamDto) {
    // 감독 프로필 및 사용자 이름 확인
    const [coachProfile, coachUser] = await Promise.all([
      this.prisma.coachProfile.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    if (!coachProfile) {
      throw new ForbiddenException("감독 프로필이 필요합니다.");
    }

    // 팀 초대 코드 생성 (예: "ACE-hockey")
    const teamCode = this.generateTeamCode();

    // [추가 2026-05-23 사용자 정책 옵션 C] venueId 지정 시 venue.name 으로 location/homeArena sync.
    let createLocation: string | null = createTeamDto.location ?? null;
    let createHomeArena: string | null = null;
    if (createTeamDto.venueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: createTeamDto.venueId },
        select: { name: true },
      });
      if (venue) {
        createLocation = venue.name;
        createHomeArena = venue.name;
      }
    }

    const club = await this.prisma.team.create({
      data: {
        teamCode,
        name: createTeamDto.clubName,
        coachId: userId,
        phone: createTeamDto.phoneNumber,
        location: createLocation,
        homeArena: createHomeArena,
        venueId: createTeamDto.venueId || null,
      },
    });

    // 감독을 클럽 회원으로 추가 (자동 승인)
    // [T02-D 2026-05-15] roleInTeam='HEAD_COACH' 명시 — getManageableTeams /
    //   getManagedTeams 필터(roleInTeam ∈ HEAD_COACH/COACH/MANAGER)에 매칭되도록.
    //   누락 시 본인이 생성한 팀이 "내 관리 팀 목록"에서 빠져 1개만 표시되는 버그 유발.
    await this.prisma.teamMember.create({
      data: {
        userId,
        teamId: club.id,
        playerName: coachUser
          ? `${coachUser.lastName}${coachUser.firstName}`
          : "",
        playerAge: 0,
        approvalStatus: "approved",
        roleInTeam: "HEAD_COACH",
      },
    });

    return {
      id: club.id,
      clubCode: club.teamCode,
      clubName: club.name,
      phoneNumber: club.phone,
      location: club.location,
      createdAt: club.createdAt,
    };
  }

  /**
   * 팀 초대 코드로 팀 조회
   */
  async getTeamByCode(teamCode: string) {
    const club = await this.prisma.team.findUnique({
      where: { teamCode: teamCode },
      include: {
        members: {
          where: { approvalStatus: "approved" },
          select: {
            id: true,
            playerName: true,
            playerAge: true,
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    return club;
  }

  /**
   * 팀 가입 신청 (학부모 또는 선수)
   */
  async joinTeam(userId: string, joinTeamDto: JoinTeamDto) {
    // 팀 확인
    const club = await this.prisma.team.findUnique({
      where: { teamCode: joinTeamDto.teamCode },
    });

    if (!club) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    // 중복 가입 확인
    const existingMember = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId: club.id,
        },
      },
    });

    if (existingMember) {
      if (existingMember.approvalStatus === "approved") {
        throw new ConflictException("이미 가입된 팀입니다.");
      }
      throw new ConflictException("가입 신청이 대기 중입니다.");
    }

    // 선수 나이 검증
    if (joinTeamDto.playerAge < 0 || joinTeamDto.playerAge > 120) {
      throw new BadRequestException("올바른 선수 나이를 입력해주세요.");
    }

    // 팀 회원 추가 (대기 상태)
    const member = await this.prisma.teamMember.create({
      data: {
        userId,
        teamId: club.id,
        playerName: joinTeamDto.playerName,
        playerAge: joinTeamDto.playerAge,
        approvalStatus: "pending",
      },
    });

    // 가입 신청(pending) 시 해당 팀 감독/코치 전원에게 가입 승인 요청 알림 (fire-and-forget)
    void this.notificationsService.notifyTeamManagers(club.id, {
      notificationType: "membership_requested",
      title: "가입 승인 요청",
      message: `${member.playerName} 님이 ${club.name} 팀 가입을 신청했습니다.`,
      linkUrl: "/approval",
    });

    return {
      id: member.id,
      teamId: club.id,
      clubName: club.name,
      playerName: member.playerName,
      status: "pending",
      createdAt: member.joinedAt,
    };
  }

  /**
   * 팀 관리 권한 검증 — 다음 2가지 경로 중 하나 만족 시 통과:
   *  1) teams.coach_id == userId (팀이 직접 가리키는 코치 — DIRECTOR 자기 팀, owner)
   *  2) team_members.role_in_team IN (HEAD_COACH, COACH, MANAGER) AND approval_status='approved'
   *
   * [보안 수정 2026-05-21] CoachProfile 경로 제거.
   *   가입 흐름(`auth.service.ts`)에서 코치 회원가입 시 CoachProfile 이
   *   TeamMember(approval_status='pending') 와 함께 자동 생성됨. 따라서 CoachProfile
   *   단독으로 권한을 부여하면 pending 코치가 모든 mutation(수정/삭제/승인 등)을
   *   우회하는 보안 결함 발생. → CoachProfile 은 "코치 프로필 정보" 일 뿐
   *   권한의 증거가 아니므로 의존 제거.
   *
   *   실제 사례: 'emoney01@kci.co.kr' 코치가 pending 상태인데 CoachProfile 만으로
   *   팀 자체 삭제까지 통과되던 결함을 사용자 보고로 발견 (2026-05-21).
   *
   * `failureMessage` 미지정 시 기본 메시지(회원 승인 컨텍스트) 사용. 다른
   * 도메인(수업·일정·상품·코치 관리 등)에서 호출 시 액션별 한국어 메시지를
   * 명시 전달하여 사용자에게 정확한 안내를 노출한다.
   */
  async assertTeamManagerPermission(
    userId: string,
    teamId: string,
    failureMessage = "이 팀의 감독/코치만 회원을 승인할 수 있습니다.",
  ): Promise<void> {
    const [ownedTeam, approvedMember] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, coachId: userId },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      }),
    ]);

    if (!ownedTeam && !approvedMember) {
      throw new ForbiddenException(failureMessage);
    }
  }

  /**
   * 호출자가 팀의 매니저(감독/코치) 또는 슈퍼관리자(ADMIN/SYSTEM/OPER)인지 boolean 판정.
   * getTeamMembers 의 민감 PII 노출 제어(IDOR 방지)에 사용 — throw 대신 boolean 반환.
   * 기준은 assertTeamManagerPermission 과 동일(Team.coachId ∪ approved 매니저 TeamMember) + 슈퍼관리자.
   */
  private async isTeamManagerOrAdmin(
    userId: string,
    teamId: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    if (
      user &&
      ["ADMIN", "SYSTEM", "OPER"].includes(user.userType as string)
    ) {
      return true;
    }
    const [ownedTeam, approvedManager] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, coachId: userId },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      }),
    ]);
    return !!(ownedTeam || approvedManager);
  }

  /**
   * 감독이 회원 승인/거절 (RBAC: 감독/코치 — 3가지 경로 중 하나)
   */
  async approveMember(
    coachId: string,
    teamId: string,
    memberId: string,
    approveMemberDto: ApproveMemberDto,
  ) {
    // 팀 소유자 확인 (감독인지 확인)
    const club = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!club) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.assertTeamManagerPermission(coachId, teamId);

    // 회원 확인
    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.teamId !== teamId) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    if (member.approvalStatus === "approved") {
      throw new ConflictException("이미 승인된 회원입니다.");
    }

    // 승인/거절 처리
    if (approveMemberDto.status === MemberApprovalStatus.APPROVED) {
      const approvedMember = await this.prisma.teamMember.update({
        where: { id: memberId },
        data: { approvalStatus: "approved" },
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
      });

      return {
        id: approvedMember.id,
        playerName: approvedMember.playerName,
        status: "approved",
        approvedAt: new Date(),
      };
    } else {
      // 거절 시 회원 삭제
      await this.prisma.teamMember.delete({
        where: { id: memberId },
      });

      return {
        id: memberId,
        status: "rejected",
      };
    }
  }

  /**
   * 팀 조회 (ID로) - 캐싱 적용 (10분)
   *
   * @param callerUserId    호출자 userId — 응답에 `myApprovalStatus` 합성용 (2026-05-21).
   * @param callerUserType  호출자 userType — 매니저 역할(COACH/DIRECTOR/ACADEMY_DIRECTOR)이
   *   본인 권한 없는 팀 조회 시 ForbiddenException 트리거 (정보 누출 방어, 2026-05-21).
   *   ADMIN/SYSTEM/OPER 은 무조건 통과, PARENT/TEEN/CHILD 는 별도 정책 (호환성 유지).
   */
  async getTeam(
    teamId: string,
    callerUserId?: string,
    callerUserType?: string,
  ) {
    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.team;
    const ttl = redisConfig.cacheTTL.clubInfo;
    const cacheKey = `${keyPrefix}info:${teamId}`;

    // 캐시 확인 — base 응답만 캐시. myApprovalStatus 는 캐시 후 합성.
    const cachedClub = await this.redisService.get<any>(cacheKey);
    if (cachedClub) {
      const myApprovalStatus = await this.resolveCallerApprovalStatus(
        teamId,
        cachedClub.coachId,
        callerUserId,
      );
      this.assertTeamDetailViewable(callerUserType, myApprovalStatus);
      return { ...cachedClub, myApprovalStatus };
    }

    // 캐시 미스 - DB 조회
    const club = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        coach: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        members: {
          select: {
            id: true,
            playerName: true,
            playerAge: true,
            approvalStatus: true,
            joinedAt: true,
          },
        },
        // 활성 하위 그룹 — 그룹 현황 섹션
        groups: {
          where: { isActive: true },
          select: { id: true, name: true, ageGroup: true },
          orderBy: { createdAt: "asc" },
        },
        // 최근 수상 10건 (타임라인 데이터)
        teamAwards: {
          select: {
            id: true,
            awardName: true,
            awardType: true,
            awardedAt: true,
            description: true,
            season: true,
          },
          orderBy: { awardedAt: "desc" },
          take: 10,
        },
        // [추가 2026-05-23] 홈 링크장 venue 마스터 관계 — VenuePicker 로 선택된 정확한 이름·주소 사용.
        //   기존: legacy `teams.home_arena` text 필드만 사용 → VenuePicker 갱신 시 sync 안 되어
        //         화면에 옛 값 표시. 본 관계로 정합성 보장. 프론트 fallback: venue.name → homeArena.
        //   관계명: `homeVenue` (schema.prisma:465 — Venue.TeamHomeVenue 양방향).
        homeVenue: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        _count: {
          select: {
            // FE TeamDetail._count.roster — 승인된 멤버 수
            members: { where: { approvalStatus: "approved" } },
            homeMatches: true,
            awayMatches: true,
            // FE TeamDetail._count.groups — 활성 그룹 수
            groups: { where: { isActive: true } },
          },
        },
      },
    });

    if (!club) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    const coachName = club.coach
      ? `${club.coach.lastName ?? ""}${club.coach.firstName ?? ""}`.trim()
      : "";

    // FE TeamDetail.club nested 형식 호환
    const clubNested = {
      id: club.id,
      clubName: club.name,
      location: club.location,
      coachId: club.coachId,
      coaches: club.coach
        ? [
            {
              id: club.coachId ?? "",
              userId: club.coach.id,
              createdAt: club.createdAt,
              user: {
                id: club.coach.id,
                firstName: club.coach.firstName,
                lastName: club.coach.lastName,
                email: club.coach.email,
              },
            },
          ]
        : [],
    };

    const result = {
      ...club,
      // 평탄화 응답 호환 (Phase 4 이전 동작 유지)
      clubCode: club.teamCode,
      clubName: club.name,
      coachName,
      // FE TeamDetail._count 호환 — members → roster 별칭 매핑
      _count: {
        roster: club._count.members,
        homeMatches: club._count.homeMatches,
        awayMatches: club._count.awayMatches,
        groups: club._count.groups,
      },
      // FE TeamDetail.club nested 호환
      club: clubNested,
      // FE TeamDetail.coaches 단순 배열 (마이페이지/대시보드용 호환)
      coaches: clubNested.coaches,
      // [추가 2026-05-23] FE TeamDetail.venue 호환 — Prisma 관계명 homeVenue 를 venue 로 alias.
      //  legacy homeArena 텍스트와 sync 안 될 때 화면이 venue.name 을 우선 표시 가능.
      venue: club.homeVenue ?? null,
    };

    // 캐시 저장 — base 응답만 (myApprovalStatus 제외)
    await this.redisService.set(cacheKey, result, ttl);

    // 호출자 본인의 멤버십 상태 합성 (캐시 후처리)
    const myApprovalStatus = await this.resolveCallerApprovalStatus(
      teamId,
      club.coachId,
      callerUserId,
    );

    this.assertTeamDetailViewable(callerUserType, myApprovalStatus);

    return { ...result, myApprovalStatus };
  }

  /**
   * 팀 상세 조회 권한 검증 (2026-05-21 추가).
   *
   * 정보 누출 방어 — 매니저 역할 사용자가 본인 권한 없는 팀의 회원 명단/일정 등을
   * 직접 API 호출로 조회하지 못하도록 차단한다.
   *
   * 정책:
   *  - ADMIN / SYSTEM / OPER          → 항상 통과 (시스템 관리자)
   *  - COACH / DIRECTOR / ACADEMY_DIRECTOR
   *    → myApprovalStatus === 'approved' 일 때만 (owner 또는 approved 멤버)
   *  - PARENT / TEEN / CHILD          → 통과 (자녀 소속 / 학생 본인 소속 등 — 별도 정책)
   *  - 인증되지 않은 호출 (callerUserType undefined) → 통과 (JwtAuthGuard 가 이미 차단)
   *
   * 프론트 `isTeamManagerOf` 와 동일한 정책. 백엔드는 직접 API 호출 케이스까지 차단.
   */
  private assertTeamDetailViewable(
    callerUserType: string | undefined,
    myApprovalStatus: "approved" | "pending" | null,
  ): void {
    if (!callerUserType) return;
    const upper = callerUserType.toUpperCase();
    // ADMIN/SYSTEM/OPER 은 무조건 통과
    if (upper === "ADMIN" || upper === "SYSTEM" || upper === "OPER") return;
    // 매니저 역할은 approved 멤버만
    if (
      upper === "COACH" ||
      upper === "DIRECTOR" ||
      upper === "ACADEMY_DIRECTOR"
    ) {
      if (myApprovalStatus !== "approved") {
        throw new ForbiddenException("이 팀에 대한 권한이 없습니다.");
      }
      return;
    }
    // PARENT/TEEN/CHILD — 호환성 유지 (자녀 소속 팀 조회 등 별도 정책)
  }

  /**
   * 호출자의 팀 멤버십 상태 해석.
   *
   * [보안 수정 2026-05-21] CoachProfile 단독 'approved' 부여 제거.
   *   가입 흐름(`auth.service.ts:277-289`)에서 코치 회원가입 시 CoachProfile 이
   *   `TeamMember(approvalStatus='pending')` 과 함께 자동 생성되므로, CoachProfile 만으로
   *   'approved' 판정하면 pending 코치가 모든 권한을 우회하게 되는 결함이 있었다.
   *   → CoachProfile 은 "코치 프로필 정보" 일 뿐 권한의 증거가 아니므로 의존 제거.
   *
   * 정책 (백엔드 `assertTeamManagerPermission` 과 동일):
   *   1) team.coachId === callerUserId   → 'approved' (owner — 본인이 만든 팀)
   *   2) TeamMember(userId, teamId, roleInTeam in [HEAD_COACH, COACH, MANAGER], leftAt: null)
   *       → approvalStatus 그대로 ('approved' | 'pending')
   *   3) 위 모두 없음                    → null (관리 권한 없음 — 단순 조회자)
   *
   * 프론트 `isTeamManagerOf(user, team)` 가 'approved' 만 통과시키므로,
   * pending 코치는 수정 UI 와 진입 모두 차단된다.
   */
  private async resolveCallerApprovalStatus(
    teamId: string,
    teamCoachId: string | null | undefined,
    callerUserId: string | undefined,
  ): Promise<"approved" | "pending" | null> {
    if (!callerUserId) return null;
    if (teamCoachId && teamCoachId === callerUserId) return "approved";

    const teamMember = await this.prisma.teamMember.findFirst({
      where: {
        userId: callerUserId,
        teamId,
        leftAt: null,
        roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
      },
      select: { approvalStatus: true },
    });

    if (teamMember) {
      return teamMember.approvalStatus === "pending" ? "pending" : "approved";
    }
    return null;
  }

  /**
   * 사용자가 속한 팀 목록 조회
   */
  async getUserTeams(userId: string) {
    // [추가 2026-05-23] logoUrl/homeArena/venueId select 추가 — 팀 목록 카드 로고/홈경기장 표시.
    const members = await this.prisma.teamMember.findMany({
      where: {
        userId,
        approvalStatus: "approved",
      },
      include: {
        team: {
          select: {
            id: true,
            teamCode: true,
            name: true,
            location: true,
            logoUrl: true,
            homeArena: true,
            venueId: true,
            createdAt: true,
          },
        },
      },
    });

    return members.map((member) => ({
      ...member.team,
      joinedAt: member.joinedAt,
    }));
  }

  /**
   * 팀 정보 업데이트 (감독만)
   */
  async updateTeam(
    coachId: string,
    teamId: string,
    updateData: Partial<CreateTeamDto>,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.assertTeamManagerPermission(coachId, teamId);

    // [2026-06-01] 팀 코드 변경 처리 — 가입 시 미설정(null) 정책에 따라 팀 관리에서 입력·변경.
    //   · undefined: 미변경 / 빈 문자열: 해제(null) / 값: 중복 검증 후 설정.
    if (updateData.teamCode !== undefined) {
      const trimmedCode = updateData.teamCode.trim();
      if (trimmedCode) {
        const duplicate = await this.prisma.team.findFirst({
          where: { teamCode: trimmedCode, id: { not: teamId } },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException(
            `이미 사용 중인 팀 코드입니다: ${trimmedCode}`,
          );
        }
      }
    }

    // [추가 2026-05-23 사용자 정책 옵션 C] venueId 명시 변경 시 venue.name 으로 location/homeArena
    //  자동 sync — legacy 텍스트 컬럼과 venue 마스터 정합성 보장. 스키마 변경 없는 단기 해결.
    //  · venueId !== undefined && venueId 값 있음 → venue.name 으로 둘 다 갱신
    //  · venueId === undefined (미변경) → updateData.location 만 그대로 적용 (legacy 호환)
    //  · venueId 가 빈 값(해제) → location 은 updateData.location 그대로, homeArena 미변경
    let syncedLocation: string | null | undefined = updateData.location;
    let syncedHomeArena: string | null | undefined = undefined;
    if (updateData.venueId !== undefined && updateData.venueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: updateData.venueId },
        select: { name: true },
      });
      if (venue) {
        syncedLocation = venue.name;
        syncedHomeArena = venue.name;
      }
    }

    // [추가 2026-05-23] 신규 폼 필드 매핑 — slogan/description/foundingDate/division/colors/homeArena
    //   기존: CreateTeamDto 에 정의되지 않아 prisma data 매핑도 누락 → DB 미저장 (사용자 보고).
    //   조치: 모든 polled 필드를 undefined(미변경) / 빈값(해제) / 유효값(저장) 3분기로 처리.
    //   venueId 가 있으면 위에서 homeArena/location 을 venue.name 으로 sync — 사용자 입력값보다 우선.
    const updatedClub = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        name: updateData.clubName,
        // 팀 코드 — undefined 면 미변경, 빈 값이면 해제(null), 값이면 trim 후 설정 (중복은 위에서 검증)
        teamCode:
          updateData.teamCode === undefined
            ? undefined
            : updateData.teamCode.trim() || null,
        phone: updateData.phoneNumber,
        location: syncedLocation,
        // homeArena — venue sync 가 우선, 그 외엔 사용자 입력값 적용.
        homeArena:
          syncedHomeArena !== undefined
            ? syncedHomeArena
            : updateData.homeArena === undefined
              ? undefined
              : updateData.homeArena || null,
        // 슬로건 / 팀 소개 — 빈 값이면 NULL 처리
        slogan:
          updateData.slogan === undefined
            ? undefined
            : updateData.slogan || null,
        description:
          updateData.description === undefined
            ? undefined
            : updateData.description || null,
        // 창단일 — ISO date string → Date 변환. 빈 값이면 NULL.
        foundingDate:
          updateData.foundingDate === undefined
            ? undefined
            : updateData.foundingDate
              ? new Date(updateData.foundingDate)
              : null,
        // 부문 (U8/U9/...)
        division:
          updateData.division === undefined
            ? undefined
            : updateData.division || null,
        // 컬러 — HEX 정규식 통과한 값만 도착. 빈 값이면 NULL.
        primaryColor:
          updateData.primaryColor === undefined
            ? undefined
            : updateData.primaryColor || null,
        secondaryColor:
          updateData.secondaryColor === undefined
            ? undefined
            : updateData.secondaryColor || null,
        // 홈 링크장 — undefined 면 미변경, 빈 값이면 해제(null) (2026-05-22)
        venueId:
          updateData.venueId === undefined
            ? undefined
            : updateData.venueId || null,
        // 팀 로고 — undefined 면 미변경, 빈 값이면 해제(null) (2026-05-23)
        //   클라이언트는 POST /files/upload?category=IMAGE&refType=team_logo&refId=<teamId>
        //   결과의 `url` 을 그대로 전달.
        logoUrl:
          updateData.logoUrl === undefined
            ? undefined
            : updateData.logoUrl || null,
      },
    });

    // 캐시 무효화
    await this.invalidateTeamCache(teamId);

    return updatedClub;
  }

  /**
   * 팀 초대 코드 재생성 (감독만)
   */
  async regenerateTeamCode(coachId: string, teamId: string) {
    // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 → assertTeamManagerPermission 통일.
    await this.assertTeamManagerPermission(
      coachId,
      teamId,
      "이 팀의 감독/코치만 초대 코드를 재생성할 수 있습니다.",
    );

    const newTeamCode = this.generateTeamCode();

    const updatedClub = await this.prisma.team.update({
      where: { id: teamId },
      data: { teamCode: newTeamCode },
    });

    return {
      id: updatedClub.id,
      teamCode: updatedClub.teamCode,
      regeneratedAt: new Date(),
    };
  }

  /**
   * 대기 중인 회원 목록 조회 (감독용)
   */
  async getPendingMembers(coachId: string, teamId: string) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.assertTeamManagerPermission(coachId, teamId);

    const pendingMembers = await this.prisma.teamMember.findMany({
      where: {
        teamId: teamId,
        approvalStatus: "pending",
      },
      select: {
        id: true,
        playerName: true,
        playerAge: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return pendingMembers;
  }

  /**
   * 여러 회원 일괄 승인 (감독용)
   */
  async bulkApproveMembers(
    coachId: string,
    teamId: string,
    bulkApproveDto: BulkApproveMembersDto,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.assertTeamManagerPermission(coachId, teamId);

    const { memberIds } = bulkApproveDto;

    // 회원들이 모두 pending 상태이고 해당 팀에 속하는지 확인
    const members = await this.prisma.teamMember.findMany({
      where: {
        id: { in: memberIds },
        teamId: teamId,
        approvalStatus: "pending",
      },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    });

    if (members.length !== memberIds.length) {
      throw new BadRequestException(
        "일부 회원이 존재하지 않거나 이미 승인되었습니다.",
      );
    }

    // 일괄 승인 처리
    await this.prisma.teamMember.updateMany({
      where: {
        id: { in: memberIds },
      },
      data: {
        approvalStatus: "approved",
      },
    });

    // 승인된 회원 목록 반환
    const approvedMembers = members.map((member) => ({
      id: member.id,
      playerName: member.playerName,
      status: "approved",
    }));

    return {
      approvedCount: members.length,
      approvedMembers,
    };
  }

  /**
   * Private: 팀 초대 코드 생성
   * 형식: "ACE-hockey" (3-4글자-선택적단어)
   */
  private generateTeamCode(): string {
    const adjectives = ["ACE", "PRO", "VIP", "ELITE", "STAR", "PEAK", "APEX"];
    const sports = ["hockey", "ice", "chill", "frost", "freeze", "glacier"];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const sport = sports[Math.floor(Math.random() * sports.length)];

    return `${adj}-${sport}`;
  }

  /**
   * Private: 팀 정보 캐시 무효화
   */
  private async invalidateTeamCache(teamId: string) {
    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.team;
    const cacheKey = `${keyPrefix}info:${teamId}`;

    await this.redisService.del(cacheKey);
  }

  /**
   * 감독/코치가 관리하는 팀 목록 조회.
   * - DIRECTOR: Team.coachId = userId (팀 owner) 기준
   * - COACH/ACADEMY_DIRECTOR: CoachProfile.teamId 기준
   * - ADMIN: 두 경로 합집합 (보통 프로필 없이도 운영 계정이 owner인 경우 대응)
   * 두 경로를 모두 조회 후 teamId 기준 중복 제거한다.
   */
  async getManagedTeams(userId: string) {
    // [수정 2026-05-11] SoT 일원화 — TeamMember(approved, role ∈ {HEAD_COACH, COACH, MANAGER}) 만으로 결정.
    //  기존엔 coachProfile.team + Team.coachId(직접 FK) + TeamMember 의 합집합이라
    //  Team.coachId 가 historical 로 잘못 박혀 있는 케이스에서 본인이 실제 가입(TeamMember)
    //  하지 않은 팀의 수업/일정까지 노출되는 문제가 있었다.
    //  (예: 임감독이 타이탄스 coachFK 로 잘못 박혀 있어 타이탄스 수업이 일정에 노출)
    //  사용자 요청: "본인이 소속된 팀 수업만 보이게" → TeamMember 가입 자격을 단일 SoT 로 사용.
    const memberTeams = await this.prisma.teamMember.findMany({
      where: {
        userId,
        approvalStatus: "approved",
        leftAt: null,
        roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
      },
      select: {
        team: {
          include: {
            members: { select: { id: true, approvalStatus: true } },
          },
        },
      },
    });

    // [추가 2026-05-23] logoUrl 필드 추가 — 팀 목록 카드에서 로고 표시 정상화.
    //   기존: include 로 DB 에서는 가져왔지만 응답 매핑에서 누락 → frontend 가 logo 표시 못함.
    type TeamWithMembers = {
      id: string;
      teamCode: string;
      name: string;
      location: string | null;
      phone: string | null;
      logoUrl: string | null;
      createdAt: Date;
      members: { id: string; approvalStatus: string }[];
    };

    const teamMap = new Map<string, TeamWithMembers>();
    for (const m of memberTeams) {
      if (m.team) teamMap.set(m.team.id, m.team as TeamWithMembers);
    }

    if (teamMap.size === 0) {
      return [];
    }

    return Array.from(teamMap.values()).map((club) => {
      const approvedCount = club.members.filter(
        (m) => m.approvalStatus === "approved",
      ).length;
      const pendingCount = club.members.filter(
        (m) => m.approvalStatus === "pending",
      ).length;
      return {
        id: club.id,
        clubCode: club.teamCode,
        clubName: club.name,
        location: club.location,
        phone: club.phone,
        logoUrl: club.logoUrl,
        memberCount: approvedCount,
        pendingCount,
        createdAt: club.createdAt,
      };
    });
  }

  /**
   * 팀 전체 회원 목록 조회 (상태 필터 지원)
   */
  async getTeamMembers(teamId: string, status?: string, viewerId?: string) {
    const club = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!club) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    // 민감 PII(연락처·학부모정보) 노출 여부 — 팀 매니저(감독/코치) 또는 ADMIN 에게만 (IDOR 방지).
    // 멤버 명단·이름·이메일·생년월일은 기존대로 노출하되, phone/childParents 는 권한자에게만 내려준다.
    // (이 엔드포인트는 학생 랭킹·팀 상세 등 비매니저 화면에서도 사용되므로 전면 차단 대신 필드 마스킹.)
    const canViewPII = viewerId
      ? await this.isTeamManagerOrAdmin(viewerId, teamId)
      : false;

    // [2026-06-18] 회원 승인 내역·선수 관리 정합 — 팀을 떠났거나(leftAt) 탈퇴/삭제된(User.status=WITHDRAWN)
    //   회원은 제외. (자녀 삭제 시 User 는 soft delete=WITHDRAWN 되지만 TeamMember 가 남아 '유령' 표시되던 문제)
    const whereClause: any = {
      teamId: teamId,
      leftAt: null,
      user: { status: { not: "WITHDRAWN" } },
    };
    if (status && status !== "all") {
      whereClause.approvalStatus = status;
    }

    const members = await this.prisma.teamMember.findMany({
      where: whereClause,
      select: {
        id: true,
        userId: true,
        playerName: true,
        playerAge: true,
        playerLevel: true,
        approvalStatus: true,
        rejectionReason: true,
        roleInTeam: true,
        joinedAt: true,
        // B2 fix (2026-05-14): 처리 일시(승인/거절 시점) 표시를 위해 updatedAt 노출.
        // TeamMember 모델에 processedAt 컬럼이 없으므로 status 변경 시 자동 갱신되는 updatedAt 을 사용.
        updatedAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            userType: true,
            // 출생연도 표기용 — TEEN/CHILD 회원가입 시 저장된 생년월일 (없으면 null → FE 나이 폴백)
            birthDate: true,
            // [2026-06-17] 자녀(CHILD/TEEN) 의 정확한 생년월일 SoT — ChildProfile.birthDate.
            //   User.birthDate 는 가입 시점 값이라 자녀 정보 수정 후 동기화 누락으로 stale 가능.
            //   아래 flatten 에서 childProfile.birthDate 우선(폴백 user.birthDate)으로 보정.
            childProfile: { select: { birthDate: true } },
            // [추가 2026-05-28] 학생(TEEN/CHILD) 의 주 보호자(학부모) 정보 — director-members
            //   "선수 관리" 페이지 카드에서 학부모 연락처 노출용. 다른 컨텍스트(COACH/MANAGER) 에서는
            //   빈 배열로 무시되므로 backward-compatible.
            childParents: {
              where: { isPrimary: true },
              select: {
                parent: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
              take: 1,
            },
          },
        },
        // Phase 2 (2026-04-29) — TeamRoster 폐기. TeamGroupMember 의 group.team(=Club) 으로 대체
        // group.id 추가: 대회 참가대상 선택 UI 가 멤버별 소속 하위그룹(groupIds) 으로 그룹칩 구성.
        teamGroupMembers: {
          where: { status: "active" },
          select: {
            group: {
              select: {
                id: true,
                team: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    // [신규 2026-05-15 — T01/T06 협업] 결제 상태 필드(`paymentStatus`/`hasUnpaidBalance`) 부착.
    //   명단 관리(F) 그룹 배치 차단 UI 가 활용. 본 팀(teamId) 의 수업에 한정하여
    //   회원별 최근 Enrollment 의 결제 상태를 집계한다.
    //   - completed (Payment.completed 또는 Enrollment.status='paid') 만 paid 로 인정
    //   - 어느 enrollment 도 paid 가 아니지만 pending/active 가 존재하면 'pending'
    //   - 모두 만료/취소/inactive 이거나 enrollment 자체가 없으면 unpaid 기본값 false
    //     (즉, 활성 미결제만 hasUnpaidBalance=true)
    const teamClasses = await this.prisma.class.findMany({
      where: { teamId },
      select: { id: true },
    });
    const teamClassIds = teamClasses.map((c) => c.id);

    type PaymentStatus = "paid" | "unpaid" | "pending";
    const paymentByUser = new Map<string, PaymentStatus>();

    if (teamClassIds.length > 0) {
      const memberUserIds = members.map((m) => m.userId);

      // childId 기준 enrollment 와 userId 기준 ClassRegistration 양쪽 모두 확인.
      // - PLAYER/CHILD: TeamMember.userId === Enrollment.childId 와 동일 (자녀 user.id)
      // - 일부 케이스(레거시): TeamMember.userId 가 PARENT.id 일 수 있어 ClassRegistration 도 확인
      const [enrollments, registrations] = await Promise.all([
        this.prisma.enrollment.findMany({
          where: {
            classId: { in: teamClassIds },
            childId: { in: memberUserIds },
          },
          orderBy: { updatedAt: "desc" },
          select: {
            childId: true,
            status: true,
            payment: { select: { paymentStatus: true } },
          },
        }),
        this.prisma.classRegistration.findMany({
          where: {
            classId: { in: teamClassIds },
            userId: { in: memberUserIds },
          },
          select: { userId: true, status: true },
        }),
      ]);

      const computeStatus = (userId: string): PaymentStatus => {
        let hasPaid = false;
        let hasPending = false;
        let hasActiveUnpaid = false;

        for (const e of enrollments) {
          if (e.childId !== userId) continue;
          const paid =
            e.payment?.paymentStatus === "completed" || e.status === "paid";
          if (paid) {
            hasPaid = true;
            continue;
          }
          // pending / awaiting payment 상태
          if (e.status === "pending" || e.status === "awaiting_payment") {
            hasPending = true;
          } else if (
            e.status !== "cancelled" &&
            e.status !== "expired" &&
            e.status !== "refunded"
          ) {
            hasActiveUnpaid = true;
          }
        }

        for (const r of registrations) {
          if (r.userId !== userId) continue;
          // active 인데 위 enrollments 에 paid 가 없다면 미결제 상태로 간주
          if (r.status === "active" && !hasPaid) {
            hasActiveUnpaid = true;
          }
        }

        if (hasPaid) return "paid";
        if (hasActiveUnpaid || hasPending)
          return hasPending ? "pending" : "unpaid";
        return "paid"; // 결제 의무 없음 (수업 등록 자체가 없거나 모두 취소) → 차단 대상 아님
      };

      for (const m of members) {
        paymentByUser.set(m.userId, computeStatus(m.userId));
      }
    } else {
      // 팀에 수업이 없으면 결제 의무 없음 — 전원 paid 로 표시 (배치 차단 미적용)
      for (const m of members) {
        paymentByUser.set(m.userId, "paid");
      }
    }

    // teamName 평탄화 (콤마 구분) + paymentStatus / hasUnpaidBalance 부착
    const flattened = members.map((m) => {
      const ps: PaymentStatus = paymentByUser.get(m.userId) ?? "paid";
      const u = (m as any).user;
      // [2026-06-17] 자녀(CHILD/TEEN) 생년월일 SoT = ChildProfile.birthDate.
      //   User.birthDate 는 자녀 정보 수정 후 미동기화로 stale 가능 → childProfile 우선, 폴백 user.
      const birthDate = u?.childProfile?.birthDate ?? u?.birthDate ?? null;
      // 민감 PII 마스킹 — 비권한자(비매니저·비ADMIN)에게는 연락처·학부모정보 제거(IDOR 방지).
      const safeUser = u ? { ...u, birthDate } : u;
      if (safeUser && !canViewPII) {
        delete (safeUser as Record<string, unknown>).phone;
        delete (safeUser as Record<string, unknown>).childParents;
      }
      return {
        ...m,
        // user.birthDate 도 보정값으로 덮어씀 — director-members 등 user.birthDate 직접 소비처 정합.
        user: safeUser,
        // 출생연도(20XX) — 대회 참가 인원 표기용. birthDate 없으면 null (FE 에서 playerAge 폴백)
        birthYear: birthDate ? new Date(birthDate).getFullYear() : null,
        // 전체 생년월일(ISO) — 회원 승인/거절 내역에서 "YYYY.MM.DD" 표기용. 없으면 null.
        birthDate: birthDate ? new Date(birthDate).toISOString() : null,
        // 소속 하위그룹 id 목록 — 대회 참가대상 선택 UI 의 그룹칩 → 멤버 매핑용.
        //   (userId 는 위 select 로 이미 포함됨 = selectedParticipantIds 값으로 사용.)
        groupIds: Array.from(
          new Set(
            ((m as any).teamGroupMembers ?? [])
              .map((tgm: any) => tgm.group?.id)
              .filter((id: any): id is string => Boolean(id)),
          ),
        ) as string[],
        teamName: Array.from(
          new Set(
            ((m as any).teamGroupMembers ?? [])
              .map((tgm: any) => tgm.group?.team?.name)
              .filter((n: any): n is string => Boolean(n)),
          ),
        ).join(", "),
        paymentStatus: ps,
        // hasUnpaidBalance: paid 가 아닌 모든 상태(unpaid/pending) 를 차단 대상으로 표시.
        // FE 측은 둘 중 하나만 사용하면 된다 — 양립 지원.
        hasUnpaidBalance: ps !== "paid",
      };
    });

    return {
      total: flattened.length,
      members: flattened,
    };
  }

  /**
   * 회원 삭제 (감독만)
   */
  async deleteMember(coachUserId: string, teamId: string, memberId: string) {
    // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 → assertTeamManagerPermission 통일.
    //  pending coach 가 본인 신청 팀의 회원을 삭제할 수 있던 결함 차단.
    await this.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 팀의 감독만 회원을 삭제할 수 있습니다.",
    );

    // 회원 확인
    const member = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.teamId !== teamId) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }

    // 회원 삭제
    await this.prisma.teamMember.delete({
      where: { id: memberId },
    });

    // 캐시 무효화
    await this.invalidateTeamCache(teamId);

    return {
      message: "회원이 삭제되었습니다.",
      deletedMemberId: memberId,
    };
  }

  /**
   * 팀 출석 통계 조회
   *
   * [2026-05-15 보안 수정] teamId 격리 누수 차단 — 기존엔 coachProfile 만 검증해서
   *   DIRECTOR(teams.coachId=self, coachProfile 미보유) 가 403 으로 막힘 →
   *   프론트엔드 fallback 으로 mock 통계가 그대로 노출되는 경로가 존재.
   *   assertTeamManagerPermission 으로 3-path 화이트리스트(coachProfile /
   *   teams.coachId / teamMember) 통합 검증 → 다른 팀 데이터 누수 차단.
   */
  async getTeamAttendanceStatistics(
    coachUserId: string,
    teamId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    // teamId 단일 격리 가드 — 감독/코치/매니저 화이트리스트
    await this.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 팀의 감독/코치만 통계를 볼 수 있습니다.",
    );

    // 기본 날짜 범위 설정 (최근 30일)
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const actualStartDate = startDate || defaultStartDate;
    const actualEndDate = endDate || now;

    // 팀의 수업 목록 조회
    const classes = await this.prisma.class.findMany({
      where: { teamId: teamId },
      select: { id: true },
    });

    const classIds = classes.map((c) => c.id);

    // 해당 기간의 스케줄 조회
    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        classId: { in: classIds },
        scheduledDate: {
          gte: actualStartDate,
          lte: actualEndDate,
        },
        isCancelled: false,
      },
      include: {
        attendances: true,
      },
    });

    // 통계 계산
    let totalAttendances = 0;
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;

    schedules.forEach((schedule) => {
      schedule.attendances.forEach((attendance) => {
        totalAttendances++;
        if (attendance.attendanceStatus === "present") {
          presentCount++;
        } else if (attendance.attendanceStatus === "absent") {
          absentCount++;
        } else if (attendance.attendanceStatus === "late") {
          lateCount++;
        }
      });
    });

    const attendanceRate =
      totalAttendances > 0
        ? (((presentCount + lateCount) / totalAttendances) * 100).toFixed(1)
        : "0.0";

    // 회원별 통계
    const members = await this.prisma.teamMember.findMany({
      where: {
        teamId: teamId,
        approvalStatus: "approved",
      },
      select: {
        id: true,
        playerName: true,
        userId: true,
      },
    });

    // N+1 방지: 모든 회원 출석 기록을 단일 쿼리로 조회 후 메모리에서 집계
    const allMemberAttendances = await this.prisma.classAttendance.findMany({
      where: {
        memberId: { in: members.map((m) => m.userId) },
        schedule: {
          classId: { in: classIds },
          scheduledDate: {
            gte: actualStartDate,
            lte: actualEndDate,
          },
        },
      },
      select: {
        memberId: true,
        attendanceStatus: true,
      },
    });

    const attendanceMap = new Map<string, { total: number; present: number }>();
    for (const member of members) {
      attendanceMap.set(member.userId, { total: 0, present: 0 });
    }
    for (const att of allMemberAttendances) {
      const stats = attendanceMap.get(att.memberId);
      if (stats) {
        stats.total++;
        if (
          att.attendanceStatus === "present" ||
          att.attendanceStatus === "late"
        ) {
          stats.present++;
        }
      }
    }

    const memberStats = members.map((member) => {
      const stats = attendanceMap.get(member.userId) ?? {
        total: 0,
        present: 0,
      };
      return {
        memberId: member.id,
        playerName: member.playerName,
        totalSessions: stats.total,
        attendedSessions: stats.present,
        attendanceRate:
          stats.total > 0
            ? ((stats.present / stats.total) * 100).toFixed(1)
            : "0.0",
      };
    });

    return {
      period: {
        startDate: actualStartDate,
        endDate: actualEndDate,
      },
      summary: {
        totalSessions: schedules.length,
        totalAttendances,
        presentCount,
        absentCount,
        lateCount,
        averageAttendanceRate: attendanceRate,
      },
      memberStatistics: memberStats,
    };
  }

  /**
   * 팀 전체 크레딧 조회
   */
  async getTeamCredits(coachUserId: string, teamId: string) {
    // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 → assertTeamManagerPermission 통일.
    //  pending coach 가 본인 신청 팀의 크레딧 정보를 조회할 수 있던 결함 차단.
    await this.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 팀의 감독만 크레딧을 볼 수 있습니다.",
    );

    // 팀 회원 조회
    const members = await this.prisma.teamMember.findMany({
      where: {
        teamId: teamId,
        approvalStatus: "approved",
      },
      select: {
        id: true,
        playerName: true,
        userId: true,
      },
    });

    // 2026-04-27 (N-9): 수업권은 User × Class 단위 → ClubMember.userId 들로 조회
    const userIds = members.map((m) => m.userId);
    const allCredits = await this.prisma.memberCredit.findMany({
      where: {
        userId: { in: userIds },
        expiresAt: { gte: new Date() },
      },
      select: {
        id: true,
        userId: true,
        classId: true,
        totalSessions: true,
        usedSessions: true,
        expiresAt: true,
        issuedDate: true,
      },
    });

    // userId 기준으로 수업권 그룹핑
    const creditsByUserId = new Map<string, typeof allCredits>();
    for (const credit of allCredits) {
      const existing = creditsByUserId.get(credit.userId) ?? [];
      existing.push(credit);
      creditsByUserId.set(credit.userId, existing);
    }

    const memberCredits = members.map((member) => {
      const credits = creditsByUserId.get(member.userId) ?? [];
      const totalSessions = credits.reduce(
        (sum, c) => sum + c.totalSessions,
        0,
      );
      const usedSessions = credits.reduce((sum, c) => sum + c.usedSessions, 0);
      const remainingSessions = totalSessions - usedSessions;

      return {
        memberId: member.id,
        playerName: member.playerName,
        totalSessions,
        usedSessions,
        remainingSessions,
        creditDetails: credits,
      };
    });

    // 전체 합계
    const totalSummary = {
      totalSessions: memberCredits.reduce((sum, m) => sum + m.totalSessions, 0),
      usedSessions: memberCredits.reduce((sum, m) => sum + m.usedSessions, 0),
      remainingSessions: memberCredits.reduce(
        (sum, m) => sum + m.remainingSessions,
        0,
      ),
    };

    return {
      summary: totalSummary,
      members: memberCredits,
    };
  }

  /**
   * 팀 탈퇴 (본인)
   *
   * DIRECTOR는 탈퇴 불가 (팀에 최소 1명의 감독 필요).
   * TeamMember 레코드를 삭제하고 캐시를 무효화합니다.
   */
  async leaveTeam(userId: string, teamId: string) {
    // 1. 회원 확인
    const member = await this.prisma.teamMember.findUnique({
      where: {
        userId_teamId: { userId, teamId: teamId },
      },
      include: {
        user: {
          select: { id: true, userType: true },
        },
      },
    });

    if (!member) {
      throw new NotFoundException("해당 팀의 회원 정보를 찾을 수 없습니다.");
    }

    // 2. DIRECTOR 탈퇴 제한: 팀 owner(team.coachId === userId) 인 경우만 탈퇴 불가.
    //    [보안 수정 2026-05-21] CoachProfile 만 보는 기존 로직은 가입 시 CoachProfile 이
    //    pending TeamMember 와 함께 자동 생성되는 결함으로 인해 pending coach 가 가입 취소
    //    조차 못 하는 부작용이 있었음. → owner 인 경우만 차단.
    const ownedTeam = await this.prisma.team.findFirst({
      where: { id: teamId, coachId: userId },
      select: { id: true },
    });

    if (ownedTeam) {
      throw new ForbiddenException(
        "감독은 팀을 탈퇴할 수 없습니다. 다른 감독을 지정한 후 시도해주세요.",
      );
    }

    // 3. 회원 삭제
    await this.prisma.teamMember.delete({
      where: {
        userId_teamId: { userId, teamId: teamId },
      },
    });

    // 4. 캐시 무효화
    await this.invalidateTeamCache(teamId);

    return {
      success: true,
      message: "팀에서 탈퇴했습니다.",
    };
  }

  /**
   * 특정 팀에서 내 회원 정보 조회
   */
  async getMyMembership(userId: string, teamId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: teamId,
      },
      select: {
        id: true,
        userId: true,
        playerName: true,
        playerAge: true,
        approvalStatus: true,
        joinedAt: true,
      },
    });

    if (!member) {
      throw new NotFoundException("회원 정보를 찾을 수 없습니다.");
    }

    return member;
  }

  /**
   * 팀 결제 시점 설정 (DIRECTOR만)
   */
  async updateBillingTiming(
    directorId: string,
    teamId: string,
    billingTiming: "PREPAID" | "POSTPAID",
  ) {
    // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 → assertTeamManagerPermission 통일.
    await this.assertTeamManagerPermission(
      directorId,
      teamId,
      "이 팀의 감독만 결제 시점을 변경할 수 있습니다.",
    );

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: { defaultBillingTiming: billingTiming },
      select: { id: true, name: true, defaultBillingTiming: true },
    });

    await this.invalidateTeamCache(teamId);

    return updated;
  }

  /**
   * 공개 팀 목록 조회 (비로그인 사용자 포함 누구나 접근 가능)
   */
  async getPublicTeams(search?: string, limit = 20, offset = 0) {
    const where: Prisma.TeamWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { location: { contains: search } },
      ];
    }

    const [clubs, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        select: {
          id: true,
          teamCode: true,
          name: true,
          shortName: true,
          division: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          isActive: true,
          location: true,
          phone: true,
          createdAt: true,
          coach: {
            select: { firstName: true, lastName: true },
          },
          _count: {
            select: {
              members: { where: { approvalStatus: "approved" } },
              groups: { where: { isActive: true } },
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
      clubs: clubs.map((club) => ({
        id: club.id,
        // 신 표준 필드
        name: club.name,
        shortName: club.shortName,
        division: club.division,
        logoUrl: club.logoUrl,
        primaryColor: club.primaryColor,
        secondaryColor: club.secondaryColor,
        isActive: club.isActive,
        teamCode: club.teamCode,
        // 옛 alias (호환)
        clubCode: club.teamCode,
        clubName: club.name,
        location: club.location,
        phone: club.phone,
        coachName: club.coach
          ? `${club.coach.lastName}${club.coach.firstName}`
          : "",
        createdAt: club.createdAt,
        // 평탄화 카운트 (호환)
        memberCount: club._count.members,
        // FE alias-aware nested 카운트 (admin TeamRow 인터페이스 호환)
        _count: {
          roster: club._count.members,
          groups: club._count.groups,
        },
      })),
    };
  }

  /**
   * 팀 코드 검증 (공개 API)
   *
   * 설계서 §4.5: 학부모가 자녀 등록 시 팀 코드를 입력할 때 onBlur 실시간 검증용.
   * 비로그인 상태에서도 호출 가능하므로 민감 정보는 반환하지 않는다.
   *
   * @returns 일치 시 { valid: true, name }, 미일치 시 { valid: false }
   */
  async checkTeamCode(
    code: string,
  ): Promise<{ valid: boolean; name?: string }> {
    const club = await this.prisma.team.findUnique({
      where: { teamCode: code },
      select: { name: true },
    });
    return club ? { valid: true, name: club.name } : { valid: false };
  }

  // ========================================================================
  // Phase 2.5 (2026-04-29) — 옛 TeamsService 흡수 메서드
  // teamId == clubs.id (Phase 2 통합). roster = team_group_members 단일화.
  // ========================================================================

  /** 팀 관리 권한 검증 */
  private async assertCanManageTeam(
    userId: string,
    teamId: string,
  ): Promise<void> {
    // [보안 수정 2026-05-21] CoachProfile 단독 권한 부여 제거 — owner 또는 approved 멤버만.
    const [user, club, approvedMember] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { userType: true },
      }),
      this.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, coachId: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: { id: true },
      }),
    ]);

    if (!club) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    if (
      user?.userType === "ADMIN" ||
      user?.userType === "SYSTEM" ||
      user?.userType === "OPER"
    )
      return;
    if (club.coachId === userId) return;
    if (approvedMember) return;

    throw new ForbiddenException("이 팀을 관리할 권한이 없습니다.");
  }

  /**
   * 팀의 선수 명단
   *
   * 2026-05-07: TeamGroupMember 기반 → TeamMember 기반으로 변경.
   *   기존 구현은 그룹에 배정된 회원만 나와서, 팀에 가입했지만 아직 그룹 미배정인 학생이 누락되는 문제가 있었음.
   *   이제는 approved + active TeamMember 전체를 노출하고, TeamGroupMember 정보(포지션/등번호/주장 등)는
   *   존재하면 함께 매핑한다. roleInTeam 이 COACH/HEAD_COACH/MANAGER/PARENT 인 회원은 별도 섹션에서 다루므로 제외.
   */
  async getTeamRoster(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true },
    });
    if (!team) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    const teamMembers = await this.prisma.teamMember.findMany({
      where: {
        teamId,
        approvalStatus: "approved",
        leftAt: null,
        // 선수만 — 코치/매니저/학부모는 별도 섹션
        OR: [{ roleInTeam: null }, { roleInTeam: "PLAYER" }],
      },
      select: {
        id: true,
        playerName: true,
        playerAge: true,
        playerLevel: true,
        joinedAt: true,
        approvalStatus: true,
        roleInTeam: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userType: true,
            phone: true,
          },
        },
        teamGroupMembers: {
          where: { leftAt: null, group: { teamId, isActive: true } },
          select: {
            id: true,
            position: true,
            jerseyNumber: true,
            isCaptain: true,
            isAltCaptain: true,
            status: true,
            joinedAt: true,
            group: { select: { id: true, name: true, ageGroup: true } },
          },
          orderBy: [{ joinedAt: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ joinedAt: "asc" }],
    });

    const roster = teamMembers
      .map((tm) => {
        const grp = tm.teamGroupMembers[0]; // 가장 최근 그룹 정보 (있으면)
        return {
          // 그룹 배정된 경우 TeamGroupMember.id, 아니면 sentinel ("unassigned:<TeamMember.id>")
          id: grp?.id ?? `unassigned:${tm.id}`,
          teamId,
          memberId: tm.id,
          isGrouped: Boolean(grp),
          position: grp?.position ?? null,
          jerseyNumber: grp?.jerseyNumber ?? null,
          isCaptain: grp?.isCaptain ?? false,
          isAltCaptain: grp?.isAltCaptain ?? false,
          status: grp?.status ?? "active",
          joinedAt: grp?.joinedAt ?? tm.joinedAt,
          groupId: grp?.group.id ?? null,
          groupName: grp?.group.name ?? null,
          ageGroup: grp?.group.ageGroup ?? null,
          member: {
            id: tm.id,
            playerName: tm.playerName,
            playerAge: tm.playerAge,
            playerLevel: tm.playerLevel,
            approvalStatus: tm.approvalStatus,
            firstName: tm.user.firstName,
            lastName: tm.user.lastName,
            user: {
              id: tm.user.id,
              firstName: tm.user.firstName,
              lastName: tm.user.lastName,
              email: tm.user.email,
              userType: tm.user.userType,
              phone: tm.user.phone,
            },
          },
        };
      })
      // 등번호 있는 멤버 → 등번호 오름차순, 미할당 → 가입일 오름차순
      .sort((a, b) => {
        if (a.jerseyNumber != null && b.jerseyNumber != null) {
          return a.jerseyNumber - b.jerseyNumber;
        }
        if (a.jerseyNumber != null) return -1;
        if (b.jerseyNumber != null) return 1;
        return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
      });

    return {
      teamId: team.id,
      teamName: team.name,
      total: roster.length,
      roster,
    };
  }

  /**
   * 로스터 추가 후보 — 어느 그룹에도 속하지 않은 ClubMember(approved)
   */
  async getAvailableTeamMembers(
    teamId: string,
    options: { search?: string; limit?: number; offset?: number } = {},
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    const { search, limit, offset } = options;
    const take = Math.min(limit ?? 50, 100);
    const skip = offset ?? 0;

    const existingMembers = await this.prisma.teamGroupMember.findMany({
      where: { group: { teamId }, leftAt: null },
      select: { memberId: true },
    });
    const existingIds = existingMembers.map((m) => m.memberId);

    // [T02-A 2026-05-15] 선수 추가 후보는 TEEN/CHILD(학생) only — 감독/코치/부모 제외
    const candidates = await this.prisma.teamMember.findMany({
      where: {
        teamId: teamId,
        approvalStatus: "approved",
        leftAt: null,
        user: {
          userType: { in: ["TEEN", "CHILD"] },
        },
        ...(existingIds.length > 0 ? { id: { notIn: existingIds } } : {}),
        ...(search
          ? {
              playerName: { contains: search, mode: "insensitive" as const },
            }
          : {}),
      },
      orderBy: { playerName: "asc" },
      take,
      skip,
      select: {
        id: true,
        playerName: true,
        playerAge: true,
        playerLevel: true,
        roleInTeam: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            gender: true,
            userType: true,
          },
        },
      },
    });

    return {
      total: candidates.length,
      members: candidates.map((c: any) => ({
        memberId: c.id,
        playerName: c.playerName,
        playerAge: c.playerAge,
        playerLevel: c.playerLevel,
        roleInTeam: c.roleInTeam,
        gender: c.user.gender,
        firstName: c.user.firstName,
        lastName: c.user.lastName,
        userType: c.user.userType,
      })),
    };
  }

  /**
   * 로스터에 회원 추가 — "기본" 그룹 자동 생성 후 등록
   */
  async addTeamRosterMember(
    userId: string,
    teamId: string,
    dto: AddRosterMemberDto,
  ) {
    await this.assertCanManageTeam(userId, teamId);

    const member = await this.prisma.teamMember.findUnique({
      where: { id: dto.memberId },
      select: { id: true, teamId: true, approvalStatus: true },
    });
    if (!member) {
      throw new NotFoundException("회원을 찾을 수 없습니다.");
    }
    if (member.teamId !== teamId) {
      throw new BadRequestException("해당 팀 소속의 회원이 아닙니다.");
    }
    if (member.approvalStatus !== "approved") {
      throw new BadRequestException(
        "승인된 회원만 로스터에 추가할 수 있습니다.",
      );
    }

    if (dto.jerseyNumber !== undefined) {
      const dup = await this.prisma.teamGroupMember.findFirst({
        where: {
          group: { teamId },
          jerseyNumber: dto.jerseyNumber,
          leftAt: null,
        },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          `등번호 ${dto.jerseyNumber} 가 이미 사용 중입니다.`,
        );
      }
    }

    let defaultGroup = await this.prisma.teamGroup.findFirst({
      where: { teamId, name: "기본" },
      select: { id: true },
    });
    if (!defaultGroup) {
      defaultGroup = await this.prisma.teamGroup.create({
        data: { teamId, name: "기본", isActive: true },
        select: { id: true },
      });
    }

    const existing = await this.prisma.teamGroupMember.findUnique({
      where: {
        groupId_memberId: {
          groupId: defaultGroup.id,
          memberId: dto.memberId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("이미 로스터에 등록된 회원입니다.");
    }

    const created = await this.prisma.teamGroupMember.create({
      data: {
        groupId: defaultGroup.id,
        memberId: dto.memberId,
        position: dto.position,
        jerseyNumber: dto.jerseyNumber,
        isCaptain: dto.isCaptain ?? false,
        isAltCaptain: dto.isAltCaptain ?? false,
        status: "active",
      },
      select: {
        id: true,
        position: true,
        jerseyNumber: true,
        isCaptain: true,
        isAltCaptain: true,
        status: true,
        joinedAt: true,
      },
    });

    return { ...created, teamId, memberId: dto.memberId };
  }

  async updateTeamRosterMember(
    userId: string,
    teamId: string,
    rosterId: string,
    dto: UpdateRosterMemberDto,
  ) {
    await this.assertCanManageTeam(userId, teamId);

    const target = await this.prisma.teamGroupMember.findUnique({
      where: { id: rosterId },
      select: { id: true, group: { select: { teamId: true } } },
    });
    if (!target || target.group.teamId !== teamId) {
      throw new NotFoundException("로스터 항목을 찾을 수 없습니다.");
    }

    if (dto.jerseyNumber !== undefined) {
      const dup = await this.prisma.teamGroupMember.findFirst({
        where: {
          group: { teamId },
          jerseyNumber: dto.jerseyNumber,
          leftAt: null,
          NOT: { id: rosterId },
        },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          `등번호 ${dto.jerseyNumber} 가 이미 사용 중입니다.`,
        );
      }
    }

    return this.prisma.teamGroupMember.update({
      where: { id: rosterId },
      data: {
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.jerseyNumber !== undefined
          ? { jerseyNumber: dto.jerseyNumber }
          : {}),
        ...(dto.isCaptain !== undefined ? { isCaptain: dto.isCaptain } : {}),
        ...(dto.isAltCaptain !== undefined
          ? { isAltCaptain: dto.isAltCaptain }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      select: {
        id: true,
        position: true,
        jerseyNumber: true,
        isCaptain: true,
        isAltCaptain: true,
        status: true,
        joinedAt: true,
        leftAt: true,
      },
    });
  }

  async removeTeamRosterMember(
    userId: string,
    teamId: string,
    rosterId: string,
  ) {
    await this.assertCanManageTeam(userId, teamId);

    const target = await this.prisma.teamGroupMember.findUnique({
      where: { id: rosterId },
      select: { id: true, group: { select: { teamId: true } } },
    });
    if (!target || target.group.teamId !== teamId) {
      throw new NotFoundException("로스터 항목을 찾을 수 없습니다.");
    }

    await this.prisma.teamGroupMember.update({
      where: { id: rosterId },
      data: { leftAt: new Date(), status: "active" },
    });

    return { success: true };
  }

  /**
   * 팀의 경기 일정 — HockeyMatch.homeTeamId/awayTeamId 컬럼 기반
   */
  async getTeamMatches(teamId: string, limit = 50) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    return this.prisma.hockeyMatch.findMany({
      where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      orderBy: { scheduledAt: "desc" },
      take: limit,
      select: {
        id: true,
        scheduledAt: true,
        startedAt: true,
        endedAt: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        round: true,
        venue: { select: { id: true, name: true, address: true } },
      },
    });
  }

  /**
   * 학부모용 팀 목록 — ParentChild → ClubMember → Club
   *
   * 응답:
   *  - myChildTeams: 자녀가 승인된 소속 팀 (자녀가 있을 때만 채워짐)
   *  - myParentTeams: 학부모 본인이 가입 승인된 팀 (회원가입 시 teamCode 로 자동 가입된 PARENT 멤버십)
   *      → 프론트는 myChildTeams 비어있을 때 폴백으로 사용
   *  - clubTeams: 호환용 빈 배열
   */
  async getParentVisibleTeams(parentUserId: string) {
    const TEAM_SELECT = {
      id: true,
      name: true,
      shortName: true,
      division: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    };

    const [parentChildren, ownMemberships] = await Promise.all([
      this.prisma.parentChild.findMany({
        where: { parentId: parentUserId },
        select: {
          child: {
            select: {
              teamMembers: {
                where: { approvalStatus: "approved", leftAt: null },
                select: {
                  teamId: true,
                  team: { select: TEAM_SELECT },
                },
              },
            },
          },
        },
      }),
      this.prisma.teamMember.findMany({
        where: {
          userId: parentUserId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: "PARENT",
        },
        select: {
          teamId: true,
          team: { select: TEAM_SELECT },
        },
      }),
    ]);

    const childTeamMap = new Map<string, ReturnType<typeof toTeamResponse>>();
    for (const pc of parentChildren) {
      for (const cm of (pc.child as any).teamMembers) {
        if (cm.team && !childTeamMap.has(cm.teamId)) {
          childTeamMap.set(cm.teamId, toTeamResponse(cm.team));
        }
      }
    }

    const parentTeamMap = new Map<string, ReturnType<typeof toTeamResponse>>();
    for (const m of ownMemberships) {
      if (m.team && !parentTeamMap.has(m.teamId)) {
        parentTeamMap.set(m.teamId, toTeamResponse(m.team));
      }
    }

    return {
      myChildTeams: Array.from(childTeamMap.values()),
      myParentTeams: Array.from(parentTeamMap.values()),
      clubTeams: [] as Array<unknown>,
    };
  }

  /**
   * 사용자가 관리 가능한 팀 목록 — userType 별 분기
   *
   * @param userId      사용자 ID
   * @param options     조회 옵션
   *   - includePending: true 면 본인의 TeamMember 가 'pending' 인 팀도 함께 반환.
   *     코치 가입 직후 감독 승인 대기 중인 팀을 본인이 확인할 수 있도록 사용 (2026-05-21 추가).
   *     기본값 false → 기존 동작 유지 (approved 만).
   *
   * 응답 항목에 `myApprovalStatus: 'approved' | 'pending'` 필드가 포함됨.
   * (ADMIN/SYSTEM/OPER 분기는 본인 멤버십이 아닌 모든 팀을 보므로 'approved' 로 고정.)
   */
  async getManageableTeams(
    userId: string,
    options?: { includePending?: boolean },
  ) {
    // [수정 2026-04-30] _count.members(approved) + _count.groups(active) 추가 — 팀 카드 "N명 소속" 표시
    // [수정 2026-05-07] teamCode 추가 — 홈 hero 카드 "팀명(팀코드)" 표시용
    // [수정 2026-05-09] 04c 카드 메타: genderType / season{Wins,Losses,Draws} / recentAttendanceRate
    const TEAM_SELECT = {
      id: true,
      teamCode: true,
      name: true,
      shortName: true,
      division: true,
      logoUrl: true,
      primaryColor: true,
      secondaryColor: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      genderType: true,
      seasonWins: true,
      seasonLosses: true,
      seasonDraws: true,
      recentAttendanceRate: true,
      _count: {
        select: {
          members: { where: { approvalStatus: "approved" } },
          groups: { where: { isActive: true } },
        },
      },
    };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });

    // 04c 카드 메타(pending/nextEvent)는 모든 분기에서 동일 헬퍼로 합성
    const enrich = async <R extends { id: string }>(
      rows: R[],
    ): Promise<(R & TeamCardMeta)[]> => {
      const meta = await loadTeamCardMeta(
        this.prisma,
        rows.map((r) => r.id),
      );
      return rows.map((r) => ({
        ...r,
        ...(meta.get(r.id) ?? { pendingApplications: 0, nextEvent: null }),
      }));
    };

    if (
      user?.userType === "ADMIN" ||
      user?.userType === "SYSTEM" ||
      user?.userType === "OPER"
    ) {
      const all = await this.prisma.team.findMany({
        where: { isActive: true },
        select: TEAM_SELECT,
        orderBy: [{ name: "asc" }],
      });
      const enriched = await enrich(all.map(toTeamResponse));
      // ADMIN/SYSTEM/OPER 는 모든 팀을 보는 관리자 시점 — 본인 멤버십과 무관하게 'approved' 처리
      return enriched.map((t) => ({
        ...t,
        myApprovalStatus: "approved" as const,
      }));
    }

    if (
      user?.userType === "DIRECTOR" ||
      user?.userType === "COACH" ||
      user?.userType === "ACADEMY_DIRECTOR"
    ) {
      // [수정 2026-05-21] includePending 옵션 — 본인의 'pending' 멤버십도 함께 조회.
      //  코치 가입 직후 감독 승인 대기 상태의 팀을 본인 대시보드/팀 메뉴에서 인지할 수 있도록.
      const memberships = await this.prisma.teamMember.findMany({
        where: {
          userId,
          approvalStatus: options?.includePending
            ? { in: ["approved", "pending"] }
            : "approved",
          leftAt: null,
          roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
        },
        select: {
          approvalStatus: true,
          team: { select: TEAM_SELECT },
        },
      });

      // teamId → 본인 approvalStatus 매핑 (응답 카드에 합성)
      const statusByTeam = new Map<string, "approved" | "pending">();
      memberships.forEach((m) => {
        if (m.team) {
          statusByTeam.set(
            m.team.id,
            m.approvalStatus === "pending" ? "pending" : "approved",
          );
        }
      });

      const teams = memberships
        .map((m) => m.team)
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map(toTeamResponse);
      const enriched = await enrich(teams);
      return enriched.map((t) => ({
        ...t,
        myApprovalStatus: statusByTeam.get(t.id) ?? "approved",
      }));
    }

    if (user?.userType === "TEEN" || user?.userType === "CHILD") {
      const memberships = await this.prisma.teamMember.findMany({
        where: { userId, approvalStatus: "approved", leftAt: null },
        select: { team: { select: TEAM_SELECT } },
      });
      return enrich(
        memberships
          .map((m) => m.team)
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map(toTeamResponse),
      );
    }

    // PARENT — getParentVisibleTeams 과 동일 로직 (myChildTeams 만 펼쳐 반환)
    const result = await this.getParentVisibleTeams(userId);
    return result.myChildTeams;
  }
}
