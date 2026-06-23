import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

export interface CreateCoachProfileDto {
  firstName: string;
  lastName: string;
  teamId?: string;
}

export interface UpdateCoachProfileDto {
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class CoachProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 감독 프로필 생성
   * firstName/lastName은 User 테이블에 저장됨
   */
  async createCoachProfile(userId: string, createDto: CreateCoachProfileDto) {
    const existingProfile = await this.prisma.coachProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      throw new BadRequestException("이미 감독 프로필이 존재합니다.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    if (user.userType !== "COACH" && user.userType !== "DIRECTOR") {
      throw new ForbiddenException(
        "코치/감독 사용자만 프로필을 생성할 수 있습니다.",
      );
    }

    // 클럽 존재 확인 (clubId가 있을 때만)
    if (createDto.teamId) {
      const club = await this.prisma.team.findUnique({
        where: { id: createDto.teamId },
      });
      if (!club) {
        throw new NotFoundException("클럽을 찾을 수 없습니다.");
      }
    }

    const [updatedUser, profile] = await this.prisma.$transaction(
      async (tx) => {
        const u = await tx.user.update({
          where: { id: userId },
          data: {
            firstName: createDto.firstName,
            lastName: createDto.lastName,
          },
        });
        const p = await tx.coachProfile.create({
          data: {
            userId,
            teamId: createDto.teamId ?? null,
          },
        });
        return [u, p];
      },
    );

    return {
      id: profile.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      teamId: profile.teamId,
      createdAt: profile.createdAt,
    };
  }

  /**
   * 감독 프로필 조회
   */
  async getCoachProfile(userId: string) {
    const profile = await this.prisma.coachProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
        team: {
          select: {
            id: true,
            teamCode: true,
            name: true,
            location: true,
            phone: true,
            coach: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException("감독 프로필을 찾을 수 없습니다.");
    }

    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      avatarUrl: profile.user.avatarUrl ?? null,
      teamId: profile.teamId,
      club: profile.team
        ? {
            id: profile.team.id,
            teamCode: profile.team.teamCode,
            name: profile.team.name,
            coachName: profile.team.coach
              ? `${profile.team.coach.lastName}${profile.team.coach.firstName}`.trim()
              : "",
            location: profile.team.location,
            phone: profile.team.phone,
          }
        : null,
      createdAt: profile.createdAt,
    };
  }

  /**
   * 감독 프로필 수정 (User 이름 업데이트)
   */
  async updateCoachProfile(userId: string, updateDto: UpdateCoachProfileDto) {
    const profile = await this.prisma.coachProfile.findUnique({
      where: { userId },
      include: {
        team: { select: { id: true, teamCode: true, name: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException("감독 프로필을 찾을 수 없습니다.");
    }

    const updateData: { firstName?: string; lastName?: string } = {};
    if (updateDto.firstName) updateData.firstName = updateDto.firstName;
    if (updateDto.lastName) updateData.lastName = updateDto.lastName;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return {
      id: profile.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      name: profile.team?.name ?? "",
      updatedAt: new Date(),
    };
  }

  /**
   * 감독의 클럽 조회
   */
  async getCoachClub(userId: string) {
    const profile = await this.prisma.coachProfile.findUnique({
      where: { userId },
      include: {
        team: {
          select: {
            id: true,
            teamCode: true,
            name: true,
            phone: true,
            location: true,
            createdAt: true,
            coach: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException("감독 프로필을 찾을 수 없습니다.");
    }

    if (!profile.team) {
      throw new NotFoundException("소속 클럽 정보가 없습니다.");
    }

    return {
      ...profile.team,
      coachName: profile.team.coach
        ? `${profile.team.coach.lastName}${profile.team.coach.firstName}`.trim()
        : "",
    };
  }

  /**
   * 감독의 클럽 멤버 통계
   */
  async getClubStatistics(userId: string) {
    const profile = await this.prisma.coachProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException("감독 프로필을 찾을 수 없습니다.");
    }

    const totalMembers = await this.prisma.teamMember.count({
      where: { teamId: profile.teamId ?? undefined },
    });

    const approvedMembers = await this.prisma.teamMember.count({
      where: {
        teamId: profile.teamId ?? undefined,
        approvalStatus: "approved",
      },
    });

    const pendingMembers = await this.prisma.teamMember.count({
      where: { teamId: profile.teamId ?? undefined, approvalStatus: "pending" },
    });

    return {
      teamId: profile.teamId,
      totalMembers,
      approvedMembers,
      pendingMembers,
      approvalRate:
        totalMembers > 0
          ? ((approvedMembers / totalMembers) * 100).toFixed(1)
          : "0",
    };
  }

  /**
   * 감독의 클래스 목록 조회
   */
  async getCoachClasses(userId: string) {
    const profile = await this.prisma.coachProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException("감독 프로필을 찾을 수 없습니다.");
    }

    const classes = await this.prisma.class.findMany({
      where: { teamId: profile.teamId ?? undefined },
      select: {
        id: true,
        className: true,
        instructorName: true,
        capacity: true,
        startTime: true,
        endTime: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { startTime: "asc" },
    });

    return classes;
  }
}
