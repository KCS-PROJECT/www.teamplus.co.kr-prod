import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { AwardBadgeDto } from "./dto/award-badge.dto";

@Injectable()
export class BadgesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 전체 뱃지 목록 조회 (카테고리/희귀도 필터)
   */
  async getBadges(category?: string, rarity?: string) {
    const where: Record<string, unknown> = { isActive: true };
    if (category) where.category = category;
    if (rarity) where.rarity = rarity;

    return this.prisma.badge.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        iconUrl: true,
        category: true,
        rarity: true,
        pointValue: true,
        criteria: true,
      },
      orderBy: [{ category: "asc" }, { rarity: "asc" }, { name: "asc" }],
    });
  }

  /**
   * 자녀의 획득 뱃지 목록 조회
   */
  async getChildBadges(childId: string) {
    // 자녀 존재 확인
    const child = await this.prisma.user.findUnique({
      where: { id: childId },
      select: { id: true, userType: true },
    });
    if (!child) {
      throw new NotFoundException("자녀를 찾을 수 없습니다.");
    }

    const childBadges = await this.prisma.childBadge.findMany({
      where: { childId },
      orderBy: [{ displayOrder: "asc" }, { earnedAt: "desc" }],
      select: {
        id: true,
        earnedAt: true,
        earnedReason: true,
        isDisplayed: true,
        displayOrder: true,
        badge: {
          select: {
            id: true,
            name: true,
            description: true,
            iconUrl: true,
            category: true,
            rarity: true,
            pointValue: true,
          },
        },
      },
    });

    // 전체 뱃지 수 대비 획득 통계
    const totalBadges = await this.prisma.badge.count({
      where: { isActive: true },
    });

    return {
      badges: childBadges,
      stats: {
        earned: childBadges.length,
        total: totalBadges,
        earnedRate:
          totalBadges > 0
            ? Math.round((childBadges.length / totalBadges) * 100)
            : 0,
      },
    };
  }

  /**
   * 내 뱃지 목록 조회 (학생 본인)
   */
  async getMyBadges(userId: string) {
    return this.getChildBadges(userId);
  }

  /**
   * 뱃지 수여 (ADMIN/COACH만)
   */
  async awardBadge(badgeId: string, dto: AwardBadgeDto, _awarderId: string) {
    // 뱃지 존재 확인
    const badge = await this.prisma.badge.findUnique({
      where: { id: badgeId },
      select: { id: true, name: true, isActive: true },
    });
    if (!badge) {
      throw new NotFoundException("뱃지를 찾을 수 없습니다.");
    }
    if (!badge.isActive) {
      throw new ForbiddenException("비활성화된 뱃지입니다.");
    }

    // 자녀 존재 확인
    const child = await this.prisma.user.findUnique({
      where: { id: dto.childId },
      select: { id: true, userType: true },
    });
    if (!child) {
      throw new NotFoundException("자녀를 찾을 수 없습니다.");
    }

    // 중복 수여 확인
    const existing = await this.prisma.childBadge.findFirst({
      where: { childId: dto.childId, badgeId },
    });
    if (existing) {
      throw new ConflictException("이미 해당 뱃지를 보유하고 있습니다.");
    }

    // 현재 displayOrder 최댓값 조회
    const maxOrder = await this.prisma.childBadge.aggregate({
      where: { childId: dto.childId },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    const childBadge = await this.prisma.childBadge.create({
      data: {
        childId: dto.childId,
        badgeId,
        earnedReason: dto.earnedReason,
        displayOrder: nextOrder,
      },
      select: {
        id: true,
        earnedAt: true,
        earnedReason: true,
        badge: {
          select: { id: true, name: true, iconUrl: true, rarity: true },
        },
      },
    });

    return {
      message: `'${badge.name}' 뱃지가 성공적으로 수여되었습니다.`,
      childBadge,
    };
  }

  /**
   * 뱃지 표시 순서/여부 수정 (자녀 본인)
   */
  async updateBadgeDisplay(
    userId: string,
    childBadgeId: string,
    isDisplayed: boolean,
    displayOrder?: number,
  ) {
    const childBadge = await this.prisma.childBadge.findUnique({
      where: { id: childBadgeId },
      select: { childId: true },
    });
    if (!childBadge) {
      throw new NotFoundException("뱃지를 찾을 수 없습니다.");
    }
    if (childBadge.childId !== userId) {
      throw new ForbiddenException("본인의 뱃지만 수정할 수 있습니다.");
    }

    return this.prisma.childBadge.update({
      where: { id: childBadgeId },
      data: {
        isDisplayed,
        ...(displayOrder !== undefined ? { displayOrder } : {}),
      },
      select: {
        id: true,
        isDisplayed: true,
        displayOrder: true,
      },
    });
  }
}
