import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CreateTeamGroupDto } from "./dto/create-team-group.dto";
import { UpdateTeamGroupDto } from "./dto/update-team-group.dto";
import { sanitizeStrict } from "../common/utils/sanitize.util";

@Injectable()
export class TeamGroupsService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  /**
   * 팀 상세 캐시 무효화 — TeamsService.getTeam 이 그룹 목록·그룹 수를 함께 10분 캐시하므로
   * 그룹을 생성/수정/삭제하면 같은 키를 지워야 팀 상세에 즉시 반영된다.
   */
  private async invalidateTeamCache(teamId: string) {
    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.team;
    await this.redisService.del(`${keyPrefix}info:${teamId}`);
  }

  /**
   * 팀의 그룹 목록 — 멤버 카운트 포함.
   */
  async listByTeam(teamId: string) {
    await this.assertTeamExists(teamId);

    const groups = await this.prisma.teamGroup.findMany({
      where: { teamId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        coachMemberId: true,
        coachMember: { select: { playerName: true } },
        isActive: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    });

    return groups.map(({ coachMember, ...g }) => ({
      ...g,
      coachName: coachMember?.playerName ?? null,
    }));
  }

  /**
   * 그룹 상세 + 멤버(이름/성별/나이) — DB 실데이터.
   */
  async findById(groupId: string) {
    const group = await this.prisma.teamGroup.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        teamId: true,
        name: true,
        ageGroup: true,
        coachMemberId: true,
        coachMember: { select: { playerName: true } },
        isActive: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
        members: {
          orderBy: { joinedAt: "asc" },
          select: {
            id: true,
            joinedAt: true,
            member: {
              select: {
                id: true,
                playerName: true,
                playerAge: true,
                // 생년월일 SoT: 자녀는 ChildProfile.birthDate(updateChild 갱신 대상),
                //   user.birthDate 는 가입 시 복사본이라 폴백으로만 사용.
                user: {
                  select: {
                    gender: true,
                    birthDate: true,
                    childProfile: { select: { birthDate: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException("그룹을 찾을 수 없습니다.");
    }

    return {
      id: group.id,
      teamId: group.teamId,
      teamName: group.team.name,
      name: group.name,
      ageGroup: group.ageGroup,
      coachMemberId: group.coachMemberId,
      coachName: group.coachMember?.playerName ?? null,
      isActive: group.isActive,
      createdAt: group.createdAt,
      members: group.members.map((gm) => ({
        groupMemberId: gm.id,
        memberId: gm.member.id,
        playerName: gm.member.playerName,
        gender: gm.member.user.gender,
        playerAge: gm.member.playerAge,
        // ChildProfile 우선(자녀 SoT) → user.birthDate 폴백 → null
        birthDate:
          gm.member.user.childProfile?.birthDate ??
          gm.member.user.birthDate ??
          null,
        joinedAt: gm.joinedAt,
      })),
    };
  }

  /**
   * 그룹 생성 후보 회원 목록 — 본 팀(TeamMember)에 approved/탈퇴 안 함.
   * 이름/성별/나이 + 역할(roleInTeam, userType) 포함.
   * [T02-A 2026-05-15] 후보는 TEEN/CHILD(학생) only — 감독/코치/부모 제외.
   */
  async listEligibleMembers(teamId: string) {
    await this.assertTeamExists(teamId);

    const members = await this.prisma.teamMember.findMany({
      where: {
        teamId,
        approvalStatus: "approved",
        leftAt: null,
        user: {
          userType: { in: ["TEEN", "CHILD"] },
        },
      },
      orderBy: { joinedAt: "asc" },
      select: {
        id: true,
        playerName: true,
        playerAge: true,
        roleInTeam: true,
        user: {
          select: {
            gender: true,
            userType: true,
            birthDate: true,
            childProfile: { select: { birthDate: true } },
          },
        },
      },
    });

    return members.map((m) => ({
      memberId: m.id,
      playerName: m.playerName,
      gender: m.user?.gender ?? null,
      playerAge: m.playerAge,
      roleInTeam: m.roleInTeam ?? null,
      userType: m.user?.userType ?? null,
      // ChildProfile 우선(자녀 SoT) → user.birthDate 폴백 → null (findById 와 동일 규칙)
      birthDate:
        m.user?.childProfile?.birthDate ?? m.user?.birthDate ?? null,
    }));
  }

  /**
   * 담당코치 후보 목록 — 팀 소속 approved 코치 (HEAD_COACH/COACH).
   */
  async listCoachCandidates(teamId: string) {
    await this.assertTeamExists(teamId);

    const coaches = await this.prisma.teamMember.findMany({
      where: {
        teamId,
        approvalStatus: "approved",
        leftAt: null,
        roleInTeam: { in: ["HEAD_COACH", "COACH"] },
      },
      orderBy: { joinedAt: "asc" },
      select: { id: true, playerName: true, roleInTeam: true },
    });

    return coaches.map((c) => ({
      memberId: c.id,
      name: c.playerName,
      roleInTeam: c.roleInTeam,
    }));
  }

  /**
   * 그룹 생성 — 감독/코치만 호출.
   * memberIds 가 있으면 한 트랜잭션으로 멤버 함께 등록.
   */
  async create(teamId: string, createdId: string, dto: CreateTeamGroupDto) {
    const team = await this.assertTeamExists(teamId);

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("하위그룹 이름을 입력해주세요.");
    }
    this.assertNameNotReserved(name);
    await this.assertGroupNameAvailable(teamId, name);

    const coachMemberId = await this.resolveCoachMemberId(
      teamId,
      dto.coachMemberId,
    );

    // memberIds 검증 — 모두 같은 club 소속이어야 함
    if (dto.memberIds && dto.memberIds.length > 0) {
      const validMembers = await this.prisma.teamMember.findMany({
        where: {
          id: { in: dto.memberIds },
          teamId: team.teamId,
          approvalStatus: "approved",
        },
        select: { id: true },
      });

      if (validMembers.length !== dto.memberIds.length) {
        throw new ForbiddenException(
          "선택한 회원 중 해당 클럽 소속이 아니거나 승인되지 않은 회원이 있습니다.",
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const group = await tx.teamGroup.create({
        data: {
          teamId,
          name,
          ageGroup: dto.ageGroup ? sanitizeStrict(dto.ageGroup) : null,
          coachMemberId: coachMemberId ?? null,
          createdId,
        },
      });

      if (dto.memberIds && dto.memberIds.length > 0) {
        await tx.teamGroupMember.createMany({
          data: dto.memberIds.map((memberId) => ({
            groupId: group.id,
            memberId,
          })),
        });
      }

      return tx.teamGroup.findUnique({
        where: { id: group.id },
        include: {
          _count: { select: { members: true } },
        },
      });
    });

    await this.invalidateTeamCache(teamId);

    return created;
  }

  /**
   * 그룹 수정 — name/ageGroup. memberIds 는 별도 endpoint 권장 (현재는 대체 reset).
   */
  async update(groupId: string, dto: UpdateTeamGroupDto) {
    const current = await this.assertGroupExists(groupId);

    // 이름 변경 시에만 검증 — 자기 이름 그대로 저장(no-op)은 통과.
    let nextName: string | undefined;
    if (dto.name !== undefined) {
      nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException("하위그룹 이름을 입력해주세요.");
      }
      if (nextName !== current.name) {
        this.assertNameNotReserved(nextName);
        await this.assertGroupNameAvailable(current.teamId, nextName, groupId);
      }
    }

    // 변경 없음(현재 값 그대로 재전송)은 검증 생략 — 역할 변경 등으로 후보에서
    // 빠진 기존 지정을 유지한 채 다른 필드만 수정하는 경우를 막지 않는다.
    const coachUnchanged =
      dto.coachMemberId !== undefined &&
      dto.coachMemberId.trim() === (current.coachMemberId ?? "");
    const coachMemberId = coachUnchanged
      ? undefined
      : await this.resolveCoachMemberId(current.teamId, dto.coachMemberId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const group = await tx.teamGroup.update({
        where: { id: groupId },
        data: {
          ...(nextName !== undefined ? { name: nextName } : {}),
          ...(coachMemberId !== undefined ? { coachMemberId } : {}),
          ...(dto.ageGroup !== undefined
            ? { ageGroup: dto.ageGroup ? sanitizeStrict(dto.ageGroup) : null }
            : {}),
        },
      });

      // memberIds 가 있으면 멤버 전체 교체
      if (dto.memberIds) {
        await tx.teamGroupMember.deleteMany({ where: { groupId } });
        if (dto.memberIds.length > 0) {
          await tx.teamGroupMember.createMany({
            data: dto.memberIds.map((memberId) => ({
              groupId,
              memberId,
            })),
          });
        }
      }

      return group;
    });

    await this.invalidateTeamCache(current.teamId);

    return updated;
  }

  /**
   * 그룹 삭제 (cascade — 멤버도 함께 삭제).
   */
  async delete(groupId: string) {
    const current = await this.assertGroupExists(groupId);
    await this.prisma.teamGroup.delete({ where: { id: groupId } });
    await this.invalidateTeamCache(current.teamId);
    return { success: true };
  }

  // ── helpers ──
  // Phase 2 (2026-04-29) — Team 모델 폐기, teamId 는 이제 clubs.id 를 가리킴
  private async assertTeamExists(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }
    // listEligibleMembers 는 team.teamId 를 사용하지만, 이제 teamId 자체가 teamId 이므로 동일 값
    return { id: team.id, teamId: team.id };
  }

  private async assertGroupExists(groupId: string) {
    const group = await this.prisma.teamGroup.findUnique({
      where: { id: groupId },
      select: { id: true, teamId: true, name: true, coachMemberId: true },
    });
    if (!group) {
      throw new NotFoundException("그룹을 찾을 수 없습니다.");
    }
    return group;
  }

  /** coachMemberId 정규화 — undefined=미변경, ""=지정 해제(null), 그 외=팀 코치 검증 통과 값. */
  private async resolveCoachMemberId(
    teamId: string,
    coachMemberId: string | undefined,
  ): Promise<string | null | undefined> {
    if (coachMemberId === undefined) return undefined;
    const trimmed = coachMemberId.trim();
    if (!trimmed) return null;

    const coach = await this.prisma.teamMember.findFirst({
      where: {
        id: trimmed,
        teamId,
        approvalStatus: "approved",
        leftAt: null,
        roleInTeam: { in: ["HEAD_COACH", "COACH"] },
      },
      select: { id: true },
    });
    if (!coach) {
      throw new BadRequestException(
        "담당코치는 해당 팀의 코치만 지정할 수 있습니다.",
      );
    }
    return trimmed;
  }

  /// "기본" 은 로스터 자동 편성이 이름으로 찾는 시스템 예약 그룹 (teams.service · admin.service).
  private assertNameNotReserved(name: string) {
    if (name === "기본") {
      throw new BadRequestException(
        "'기본'은 시스템 예약 이름이라 사용할 수 없습니다.",
      );
    }
  }

  private async assertGroupNameAvailable(
    teamId: string,
    name: string,
    excludeGroupId?: string,
  ) {
    const dup = await this.prisma.teamGroup.findFirst({
      where: {
        teamId,
        name,
        isActive: true,
        ...(excludeGroupId ? { id: { not: excludeGroupId } } : {}),
      },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException("이미 같은 이름의 하위그룹이 있습니다.");
    }
  }
}
