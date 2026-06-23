import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

export interface CreateParentProfileDto {
  firstName: string;
  lastName: string;
}

export interface UpdateParentProfileDto {
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class ParentProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 학부모 프로필 생성
   * firstName/lastName은 User 테이블에 저장됨
   */
  async createParentProfile(userId: string, createDto: CreateParentProfileDto) {
    // 기존 프로필 확인
    const existingProfile = await this.prisma.parentProfile.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      throw new BadRequestException("이미 학부모 프로필이 존재합니다.");
    }

    // 사용자 존재 확인
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    if (user.userType !== "PARENT") {
      throw new ForbiddenException(
        "학부모 사용자만 프로필을 생성할 수 있습니다.",
      );
    }

    // User 이름 업데이트 및 ParentProfile 생성
    const [updatedUser, profile] = await this.prisma.$transaction(
      async (tx) => {
        const u = await tx.user.update({
          where: { id: userId },
          data: {
            firstName: createDto.firstName,
            lastName: createDto.lastName,
          },
        });
        const p = await tx.parentProfile.create({
          data: { userId },
        });
        return [u, p];
      },
    );

    return {
      id: profile.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      createdAt: profile.createdAt,
    };
  }

  /**
   * 학부모 프로필 조회
   */
  async getParentProfile(userId: string) {
    const profile = await this.prisma.parentProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException("학부모 프로필을 찾을 수 없습니다.");
    }

    return {
      id: profile.id,
      userId: profile.userId,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      avatarUrl: profile.user.avatarUrl ?? null,
      createdAt: profile.createdAt,
    };
  }

  /**
   * 학부모 프로필 수정 (User 이름 업데이트)
   */
  async updateParentProfile(userId: string, updateDto: UpdateParentProfileDto) {
    const profile = await this.prisma.parentProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    if (!profile) {
      throw new NotFoundException("학부모 프로필을 찾을 수 없습니다.");
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
      updatedAt: new Date(),
    };
  }

  /**
   * 자녀 목록 조회 (ParentChild 테이블 사용)
   */
  async getChildren(userId: string) {
    const profile = await this.prisma.parentProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException("학부모 프로필을 찾을 수 없습니다.");
    }

    const parentChildren = await this.prisma.parentChild.findMany({
      where: { parentId: userId },
      include: {
        child: {
          include: {
            childProfile: true,
          },
        },
      },
    });

    return parentChildren.map((pc) => ({
      id: pc.child.childProfile?.id,
      userId: pc.childId,
      firstName: pc.child.firstName,
      lastName: pc.child.lastName,
      avatarUrl: pc.child.avatarUrl ?? null,
      birthDate: pc.child.childProfile?.birthDate,
      relationship: pc.relationship,
      isPrimary: pc.isPrimary,
      createdAt: pc.child.childProfile?.createdAt,
    }));
  }

  /**
   * 자녀 추가 (ParentChild 테이블 사용)
   *
   * [2026-06-12 SECURITY] 임의 자녀 무단 클레임 방지.
   *   - 검증 수단 없이 childUserId 만으로 부모-자녀 관계를 생성하면
   *     타 가족 아동 데이터 접근으로 이어지는 권한 상승 벡터가 된다.
   *   - 따라서 (a) 이미 다른 부모에 연결된 자녀의 재클레임 차단,
   *     (b) 자녀 생년월일(birthDate, YYYY-MM-DD) 대조를 통과해야만 링크 허용.
   */
  async addChild(userId: string, childUserId: string, birthDate: string) {
    const parentProfile = await this.prisma.parentProfile.findUnique({
      where: { userId },
    });

    if (!parentProfile) {
      throw new NotFoundException("학부모 프로필을 찾을 수 없습니다.");
    }

    const childProfile = await this.prisma.childProfile.findUnique({
      where: { userId: childUserId },
    });

    if (!childProfile) {
      throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
    }

    const existing = await this.prisma.parentChild.findUnique({
      where: { parentId_childId: { parentId: userId, childId: childUserId } },
    });

    if (existing) {
      throw new BadRequestException("이미 추가된 자녀입니다.");
    }

    // (a) 이미 다른 부모에 연결된 자녀는 일방 클레임 불가
    const linkedToOtherParent = await this.prisma.parentChild.findFirst({
      where: { childId: childUserId },
      select: { id: true },
    });
    if (linkedToOtherParent) {
      throw new ForbiddenException(
        "이미 다른 보호자에 연결된 자녀는 추가할 수 없습니다.",
      );
    }

    // (b) 자녀 생년월일 대조 — 자녀 정보를 아는 보호자만 링크 허용
    const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(birthDate ?? "") ||
      toDateOnly(childProfile.birthDate) !== birthDate
    ) {
      throw new ForbiddenException("자녀의 생년월일이 일치하지 않습니다.");
    }

    await this.prisma.parentChild.create({
      data: { parentId: userId, childId: childUserId },
    });

    const children = await this.getChildren(userId);
    return {
      id: parentProfile.id,
      children,
      updatedAt: new Date(),
    };
  }

  /**
   * 자녀 제거 (ParentChild 테이블 사용)
   */
  async removeChild(userId: string, childUserId: string) {
    const parentProfile = await this.prisma.parentProfile.findUnique({
      where: { userId },
    });

    if (!parentProfile) {
      throw new NotFoundException("학부모 프로필을 찾을 수 없습니다.");
    }

    const existing = await this.prisma.parentChild.findUnique({
      where: { parentId_childId: { parentId: userId, childId: childUserId } },
    });

    if (!existing) {
      throw new BadRequestException("해당 자녀를 찾을 수 없습니다.");
    }

    await this.prisma.parentChild.delete({
      where: { parentId_childId: { parentId: userId, childId: childUserId } },
    });

    const children = await this.getChildren(userId);
    return {
      id: parentProfile.id,
      children,
      updatedAt: new Date(),
    };
  }
}
