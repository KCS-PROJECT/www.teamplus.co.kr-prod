import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { isAdminRole } from "@/auth/constants/chldiv.constants";

/** Team.coachId(owner) 외에 팀 관리자로 인정하는 승인 멤버 역할(TeamMember.roleInTeam) */
const TEAM_MANAGER_ROLES = ["HEAD_COACH", "COACH", "MANAGER"];

/** 팀 도메인 관리가 허용되는 userType — 도메인 분리(설계 v4.0 §5-3).
 *  소속 레코드(TeamMember 등)가 있어도 역할이 다르면 차단한다
 *  (예: ACADEMY_DIRECTOR 가 승인 TeamMember 로 등록돼 있어도 팀 자원 관리 불가). */
const TEAM_DOMAIN_USER_TYPES = ["DIRECTOR", "COACH"];

/** Academy(오픈클래스) 도메인 관리가 허용되는 userType */
const ACADEMY_DOMAIN_USER_TYPES = ["ACADEMY_DIRECTOR", "COACH"];

/**
 * ResourceAccessService — 관리자 전용 API 의 리소스 소속 검증 단일 진입점.
 *
 * 역할(@Roles) 검사만으로는 "어느 팀/오픈클래스/대회의 관리자인지"를 구분하지 못해
 * 임의 classId/tournamentId 로 타 조직 데이터를 조회·정산하는 IDOR 이 가능했다.
 * 정산·결제·출석 관리 계열 엔드포인트는 역할 검사 후 반드시 이 서비스로
 * 요청자-리소스 소속을 단언한다.
 *
 * classes.service 의 assertClassAccessForManager(수업 상세 조회 겸용, PARENT 통과)와 달리
 * 이 서비스는 관리자 전용 엔드포인트 용도라 비관리 역할을 통과시키지 않는다.
 * 관리자급(ADMIN/SYSTEM/OPER — RolesGuard 자동 통과 기준과 동일)만 무조건 통과하며,
 * 도메인별 역할 게이트(팀=DIRECTOR/COACH, Academy=ACADEMY_DIRECTOR/COACH)를 소속 검사
 * 이전에 적용한다 — 소속 레코드만으로 타 도메인을 넘나드는 우회 차단.
 */
@Injectable()
export class ResourceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** 수업(팀/오픈클래스) 관리 권한 단언 — 수업 미존재 시 404, 권한 없음 403 */
  async assertManageableClass(
    classId: string,
    requester: JwtUserPayload,
  ): Promise<{ id: string; teamId: string | null; academyId: string | null }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true, academyId: true },
    });
    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    await this.assertManageableClassRecord(cls, requester);
    return cls;
  }

  /** 이미 조회한 수업 레코드에 대한 관리 권한 단언 (중복 조회 방지용) */
  async assertManageableClassRecord(
    cls: { teamId: string | null; academyId: string | null },
    requester: JwtUserPayload,
  ): Promise<void> {
    if (isAdminRole(requester.userType)) return;
    if (cls.teamId) {
      await this.assertTeamManager(cls.teamId, requester);
      return;
    }
    if (cls.academyId) {
      await this.assertAcademyManager(cls.academyId, requester);
      return;
    }
    // 팀도 오픈클래스도 아닌 수업 — 관리 주체 불명, ADMIN 외 차단
    throw new ForbiddenException("이 수업을 관리할 권한이 없습니다.");
  }

  /** 팀 관리자(owner 또는 승인 HEAD_COACH/COACH/MANAGER) 단언.
   *  역할 게이트 선행 — DIRECTOR/COACH 외 역할은 소속 레코드가 있어도 차단. */
  async assertTeamManager(
    teamId: string,
    requester: JwtUserPayload,
  ): Promise<void> {
    if (isAdminRole(requester.userType)) return;
    if (!TEAM_DOMAIN_USER_TYPES.includes(requester.userType)) {
      throw new ForbiddenException("이 팀을 관리할 권한이 없습니다.");
    }
    if (await this.isTeamManagerMember(teamId, requester)) return;
    throw new ForbiddenException("이 팀을 관리할 권한이 없습니다.");
  }

  /** 소속(멤버십) 판정만 수행 — 역할 게이트·관리자급 통과는 호출측 책임 */
  private async isTeamManagerMember(
    teamId: string,
    requester: JwtUserPayload,
  ): Promise<boolean> {
    const [ownedTeam, approvedMember] = await Promise.all([
      this.prisma.team.findFirst({
        where: { id: teamId, coachId: requester.id },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId: requester.id,
          teamId,
          approvalStatus: "approved",
          leftAt: null,
          roleInTeam: { in: TEAM_MANAGER_ROLES },
        },
        select: { id: true },
      }),
    ]);
    return Boolean(ownedTeam || approvedMember);
  }

  /** 오픈클래스(Academy) 관리자(director 또는 active AcademyCoach) 단언.
   *  역할 게이트 선행 — ACADEMY_DIRECTOR/COACH 외 역할은 소속 레코드가 있어도 차단. */
  async assertAcademyManager(
    academyId: string,
    requester: JwtUserPayload,
  ): Promise<void> {
    if (isAdminRole(requester.userType)) return;
    if (!ACADEMY_DOMAIN_USER_TYPES.includes(requester.userType)) {
      throw new ForbiddenException("이 오픈클래스를 관리할 권한이 없습니다.");
    }
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { directorId: true },
    });
    if (academy?.directorId === requester.id) return;

    const academyCoach = await this.prisma.academyCoach.findUnique({
      where: { academyId_userId: { academyId, userId: requester.id } },
      select: { isActive: true },
    });
    if (academyCoach?.isActive) return;
    throw new ForbiddenException("이 오픈클래스를 관리할 권한이 없습니다.");
  }

  /**
   * 정산 확정(쓰기) 권한 단언 — 조회용 assertManageableClass 보다 엄격하다.
   * 오픈클래스는 Academy.directorId(감독)만 통과하고, 조회는 가능한 active AcademyCoach(보조
   * 코치)는 실제 청구·결제를 만드는 쓰기 경로에서 차단한다(설계 v4 §5-5 결정 4).
   * 팀 수업은 조회와 동일한 팀 관리자 기준. 관리자급은 무조건 통과.
   */
  async assertClassSettlementWriter(
    classId: string,
    requester: JwtUserPayload,
  ): Promise<{ id: string; teamId: string | null; academyId: string | null }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true, academyId: true },
    });
    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    if (isAdminRole(requester.userType)) return cls;
    if (cls.teamId) {
      await this.assertTeamManager(cls.teamId, requester);
      return cls;
    }
    if (cls.academyId) {
      await this.assertAcademyDirector(cls.academyId, requester);
      return cls;
    }
    // 팀도 오픈클래스도 아닌 수업 — 관리 주체 불명, ADMIN 외 차단
    throw new ForbiddenException("이 수업의 정산을 확정할 권한이 없습니다.");
  }

  /** 오픈클래스 정산 확정 전용 — Academy.directorId 만 통과(보조 코치 차단).
   *  조회용 assertAcademyManager(active 코치 허용)와 의도적으로 분리한다. */
  private async assertAcademyDirector(
    academyId: string,
    requester: JwtUserPayload,
  ): Promise<void> {
    if (isAdminRole(requester.userType)) return;
    if (!ACADEMY_DOMAIN_USER_TYPES.includes(requester.userType)) {
      throw new ForbiddenException(
        "이 오픈클래스의 정산을 확정할 권한이 없습니다.",
      );
    }
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { directorId: true },
    });
    if (academy?.directorId === requester.id) return;
    throw new ForbiddenException(
      "이 오픈클래스의 정산을 확정할 권한이 없습니다.",
    );
  }

  /** 경기(HockeyMatch) 관리 권한 단언 — 경기 미존재 시 404, 권한 없음 403.
   *  - 대회 소속 경기: 대회 관리 규칙 재사용 (주최 팀 관리자, teamId=null 대회는 관리자급)
   *  - 독립 경기(tournamentId=null): home/away(레거시 club 필드 포함) 팀 중 하나의 관리자
   *  - 소속 팀이 전혀 없는 독립 경기: 관리자급 전용 */
  async assertManageableMatch(
    matchId: string,
    requester: JwtUserPayload,
  ): Promise<{ id: string; tournamentId: string | null }> {
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        tournamentId: true,
        homeTeamId: true,
        awayTeamId: true,
        homeClubId: true,
        awayClubId: true,
        tournament: { select: { teamId: true } },
      },
    });
    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }
    await this.assertManageableMatchRecord(match, requester);
    return { id: match.id, tournamentId: match.tournamentId };
  }

  /** 이미 확보한 경기(또는 생성 요청 DTO) 정보에 대한 관리 권한 단언.
   *  createMatch 처럼 아직 경기가 없는 시점에는 DTO 값으로 레코드 형태를 구성해 호출한다. */
  async assertManageableMatchRecord(
    match: {
      tournamentId: string | null;
      tournament?: { teamId: string | null } | null;
      homeTeamId?: string | null;
      awayTeamId?: string | null;
      homeClubId?: string | null;
      awayClubId?: string | null;
    },
    requester: JwtUserPayload,
  ): Promise<void> {
    if (isAdminRole(requester.userType)) return;
    if (match.tournamentId) {
      await this.assertManageableTournamentRecord(
        { teamId: match.tournament?.teamId ?? null },
        requester,
      );
      return;
    }
    if (!TEAM_DOMAIN_USER_TYPES.includes(requester.userType)) {
      throw new ForbiddenException("이 경기를 관리할 권한이 없습니다.");
    }
    const candidateTeamIds = [
      ...new Set(
        [
          match.homeTeamId,
          match.awayTeamId,
          match.homeClubId,
          match.awayClubId,
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    if (candidateTeamIds.length === 0) {
      throw new ForbiddenException(
        "소속 팀이 지정되지 않은 경기는 관리자만 관리할 수 있습니다.",
      );
    }
    for (const teamId of candidateTeamIds) {
      if (await this.isTeamManagerMember(teamId, requester)) return;
    }
    throw new ForbiddenException("이 경기를 관리할 권한이 없습니다.");
  }

  /** 대회 관리 권한 단언 — 대회 미존재 시 404, 권한 없음 403 */
  async assertManageableTournament(
    tournamentId: string,
    requester: JwtUserPayload,
  ): Promise<{ id: string; teamId: string | null }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, teamId: true },
    });
    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }
    await this.assertManageableTournamentRecord(tournament, requester);
    return tournament;
  }

  /** 이미 조회한 대회 레코드에 대한 관리 권한 단언.
   *  teamId=null 대회는 관리 주체(생성자 컬럼)가 없어 ADMIN 전용 (설계 v4.0 확정). */
  async assertManageableTournamentRecord(
    tournament: { teamId: string | null },
    requester: JwtUserPayload,
  ): Promise<void> {
    if (isAdminRole(requester.userType)) return;
    if (!tournament.teamId) {
      throw new ForbiddenException(
        "주최 팀이 지정되지 않은 대회는 관리자만 관리할 수 있습니다.",
      );
    }
    await this.assertTeamManager(tournament.teamId, requester);
  }
}
