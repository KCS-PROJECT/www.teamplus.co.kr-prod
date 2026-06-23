import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { ExchangeRewardDto } from "./dto/exchange-reward.dto";

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 쿠폰 생성 (ADMIN)
   */
  async createCoupon(dto: CreateCouponDto) {
    // 쿠폰 코드 중복 확인
    const existing = await this.prisma.coupon.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("이미 존재하는 쿠폰 코드입니다.");
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        discountType: dto.discountType as any,
        discountValue: dto.discountValue,
        minOrderAmount: dto.minOrderAmount,
        maxDiscountAmount: dto.maxDiscountAmount,
        usageLimit: dto.usageLimit,
        usagePerUser: dto.usagePerUser ?? 1,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isActive: dto.isActive ?? true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        discountType: true,
        discountValue: true,
        startDate: true,
        endDate: true,
        isActive: true,
        createdAt: true,
      },
    });

    return {
      message: "쿠폰이 생성되었습니다.",
      coupon,
    };
  }

  /**
   * 쿠폰 목록 조회 (ADMIN)
   */
  async getCoupons() {
    return this.prisma.coupon.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        discountType: true,
        discountValue: true,
        usageLimit: true,
        usedCount: true,
        startDate: true,
        endDate: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * 내 쿠폰 목록 조회
   */
  async getMyCoupons(userId: string) {
    return this.prisma.userCoupon.findMany({
      where: { userId },
      select: {
        id: true,
        isUsed: true,
        usedAt: true,
        issuedAt: true,
        coupon: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            discountType: true,
            discountValue: true,
            startDate: true,
            endDate: true,
          },
        },
      },
      orderBy: [{ isUsed: "asc" }, { issuedAt: "desc" }],
    });
  }

  /**
   * 스티커판 완료 → 쿠폰 교환
   */
  async exchangeReward(dto: ExchangeRewardDto, userId: string) {
    const board = await this.prisma.stickerBoard.findUnique({
      where: { id: dto.boardId },
      select: {
        id: true,
        childId: true,
        isCompleted: true,
        rewardId: true,
        rewardName: true,
        isActive: true,
      },
    });

    if (!board) {
      throw new NotFoundException("스티커판을 찾을 수 없습니다.");
    }

    if (!board.isCompleted) {
      throw new BadRequestException("아직 완료되지 않은 스티커판입니다.");
    }

    if (!board.rewardId) {
      throw new BadRequestException(
        "이 스티커판에는 연결된 보상 쿠폰이 없습니다.",
      );
    }

    // 쿠폰 존재 및 유효성 확인
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: board.rewardId },
      select: {
        id: true,
        name: true,
        isActive: true,
        usageLimit: true,
        usedCount: true,
        endDate: true,
      },
    });

    if (!coupon || !coupon.isActive) {
      throw new NotFoundException(
        "보상 쿠폰을 찾을 수 없거나 비활성 상태입니다.",
      );
    }

    if (coupon.endDate < new Date()) {
      throw new BadRequestException("보상 쿠폰이 만료되었습니다.");
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new ConflictException("보상 쿠폰의 사용 한도가 초과되었습니다.");
    }

    // 이미 교환했는지 확인
    const existingUserCoupon = await this.prisma.userCoupon.findUnique({
      where: {
        userId_couponId: { userId, couponId: coupon.id },
      },
      select: { id: true },
    });

    if (existingUserCoupon) {
      throw new ConflictException("이미 이 보상 쿠폰을 교환하셨습니다.");
    }

    // 트랜잭션: UserCoupon 생성 + Coupon usedCount 증가
    const userCoupon = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userCoupon.create({
        data: {
          userId,
          couponId: coupon.id,
        },
        select: {
          id: true,
          issuedAt: true,
          coupon: {
            select: {
              id: true,
              name: true,
              discountType: true,
              discountValue: true,
            },
          },
        },
      });

      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });

      return created;
    });

    return {
      message: "보상 쿠폰이 발급되었습니다.",
      userCoupon,
    };
  }

  /**
   * 쿠폰 사용 처리
   */
  async useCoupon(userCouponId: string, userId: string) {
    const userCoupon = await this.prisma.userCoupon.findUnique({
      where: { id: userCouponId },
      select: {
        id: true,
        userId: true,
        isUsed: true,
        coupon: {
          select: { id: true, name: true, endDate: true },
        },
      },
    });

    if (!userCoupon) {
      throw new NotFoundException("쿠폰을 찾을 수 없습니다.");
    }

    if (userCoupon.userId !== userId) {
      throw new ForbiddenException("본인의 쿠폰만 사용할 수 있습니다.");
    }

    if (userCoupon.isUsed) {
      throw new ConflictException("이미 사용된 쿠폰입니다.");
    }

    if (userCoupon.coupon.endDate < new Date()) {
      throw new BadRequestException("만료된 쿠폰입니다.");
    }

    const updated = await this.prisma.userCoupon.update({
      where: { id: userCouponId },
      data: {
        isUsed: true,
        usedAt: new Date(),
      },
      select: {
        id: true,
        isUsed: true,
        usedAt: true,
        coupon: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      message: "쿠폰이 사용 처리되었습니다.",
      userCoupon: updated,
    };
  }
}
