import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTeamGroupDto } from "./dto/create-team-group.dto";
import { UpdateTeamGroupDto } from "./dto/update-team-group.dto";
import { sanitizeStrict } from "../common/utils/sanitize.util";

@Injectable()
export class TeamGroupsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 팀의 그룹 목록 — 멤버 카운트 포함.
   */
  async listByTeam(teamId: string) {
    await this.assertTeamExists(teamId);

    return this.prisma.teamGroup.findMany({
      where: { teamId, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        ageGroup: true,
        isActive: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
    });
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
        user: { select: { gender: true, userType: true } },
      },
    });

    return members.map((m) => ({
      memberId: m.id,
      playerName: m.playerName,
      gender: m.user?.gender ?? null,
      playerAge: m.playerAge,
      roleInTeam: m.roleInTeam ?? null,
      userType: m.user?.userType ?? null,
    }));
  }

  /**
   * 그룹 생성 — 감독/코치만 호출.
   * memberIds 가 있으면 한 트랜잭션으로 멤버 함께 등록.
   */
  async create(teamId: string, createdId: string, dto: CreateTeamGroupDto) {
    const team = await this.assertTeamExists(teamId);

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

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.teamGroup.create({
        data: {
          teamId,
          name: dto.name,
          ageGroup: dto.ageGroup ? sanitizeStrict(dto.ageGroup) : null,
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
  }

  /**
   * 그룹 수정 — name/ageGroup. memberIds 는 별도 endpoint 권장 (현재는 대체 reset).
   */
  async update(groupId: string, dto: UpdateTeamGroupDto) {
    await this.assertGroupExists(groupId);

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.teamGroup.update({
        where: { id: groupId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
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
  }

  /**
   * 그룹 삭제 (cascade — 멤버도 함께 삭제).
   */
  async delete(groupId: string) {
    await this.assertGroupExists(groupId);
    await this.prisma.teamGroup.delete({ where: { id: groupId } });
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
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException("그룹을 찾을 수 없습니다.");
    }
    return group;
  }
}
