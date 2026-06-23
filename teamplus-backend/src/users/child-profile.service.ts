import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { calculateKoreanAge } from "@/common/utils/age.util";

export interface CreateChildProfileDto {
  firstName: string;
  lastName: string;
  birthDate: Date;
}

export interface UpdateChildProfileDto {
  firstName?: string;
  lastName?: string;
  birthDate?: Date;
}

@Injectable()
export class ChildProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 자녀 프로필 생성
   * firstName/lastName은 User 테이블에 저장됨
   */
  async createChildProfile(userId: string, createDto: CreateChildProfileDto) {
    const existingProfile = await this.prisma.childProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      throw new BadRequestException("이미 자녀 프로필이 존재합니다.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    if (user.userType !== "CHILD") {
      throw new ForbiddenException(
        "자녀 사용자만 프로필을 생성할 수 있습니다.",
      );
    }

    const birthDate = new Date(createDto.birthDate);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();

    if (age < 0 || age > 20) {
      throw new BadRequestException("자녀 나이는 0~20세여야 합니다.");
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
        const p = await tx.childProfile.create({
          data: {
            userId,
            birthDate,
          },
        });
        return [u, p];
      },
    );

    return {
      id: profile.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      birthDate: profile.birthDate,
      createdAt: profile.createdAt,
    };
  }

  /**
   * 자녀 프로필 조회
   */
  async getChildProfile(userId: string) {
    const profile = await this.prisma.childProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
    }

    const age = calculateKoreanAge(profile.birthDate);

    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      birthDate: profile.birthDate,
      age,
      createdAt: profile.createdAt,
    };
  }

  /**
   * 자녀 프로필 수정
   */
  async updateChildProfile(userId: string, updateDto: UpdateChildProfileDto) {
    const profile = await this.prisma.childProfile.findUnique({
      where: { userId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!profile) {
      throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
    }

    if (updateDto.birthDate) {
      const birthDate = new Date(updateDto.birthDate);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();

      if (age < 0 || age > 20) {
        throw new BadRequestException("자녀 나이는 0~20세여야 합니다.");
      }
    }

    // User 이름 업데이트
    const userUpdateData: { firstName?: string; lastName?: string } = {};
    if (updateDto.firstName) userUpdateData.firstName = updateDto.firstName;
    if (updateDto.lastName) userUpdateData.lastName = updateDto.lastName;

    const [updatedUser, updatedProfile] = await this.prisma.$transaction(
      async (tx) => {
        const u =
          Object.keys(userUpdateData).length > 0
            ? await tx.user.update({
                where: { id: userId },
                data: userUpdateData,
              })
            : ((await tx.user.findUnique({
                where: { id: userId },
                select: { firstName: true, lastName: true },
              })) as any);

        const p = await tx.childProfile.update({
          where: { userId },
          data: {
            birthDate: updateDto.birthDate || profile.birthDate,
          },
        });
        return [u, p];
      },
    );

    const age = calculateKoreanAge(updatedProfile.birthDate);

    return {
      id: updatedProfile.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      birthDate: updatedProfile.birthDate,
      age,
      updatedAt: new Date(),
    };
  }

  /**
   * 자녀의 클럽 목록 조회
   */
  async getChildClubs(userId: string) {
    const profile = await this.prisma.childProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
    }

    const clubs = await this.prisma.teamMember.findMany({
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
            coach: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });

    return clubs.map((member) => ({
      teamId: member.team.id,
      teamCode: member.team.teamCode,
      name: member.team.name,
      coachName: member.team.coach
        ? `${member.team.coach.lastName}${member.team.coach.firstName}`.trim()
        : "",
      location: member.team.location,
      playerName: member.playerName,
      playerAge: member.playerAge,
      joinedAt: member.joinedAt,
    }));
  }

  // calculateAge → @/common/utils/age.util 의 calculateKoreanAge 로 통합 (중복 제거)
}
