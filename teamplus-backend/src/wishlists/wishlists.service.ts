import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { AddWishlistDto, WishlistTargetType } from "./dto/add-wishlist.dto";
import { QueryWishlistDto } from "./dto/query-wishlist.dto";

/**
 * WishlistsService
 *
 * 통합 찜(Wishlist) 관리 서비스.
 * - polymorphic 방식: userId + targetType + targetId
 * - PRODUCT 타입은 기존 ShopWishlist과 dual-write 유지 (30일 grace period)
 * - N+1 방지를 위해 targetType별 batch enrichment 적용
 */
@Injectable()
export class WishlistsService {
  private readonly logger = new Logger(WishlistsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 찜 추가 (upsert)
   * - 이미 존재하면 no-op (멱등성 보장)
   * - PRODUCT 타입: ShopWishlist dual-write ($transaction 원자적 처리)
   */
  async addToWishlist(userId: string, dto: AddWishlistDto) {
    // 대상 리소스 존재 여부 검증
    await this.validateTarget(dto.targetType, dto.targetId);

    return this.prisma.$transaction(async (tx) => {
      const wishlist = await tx.wishlist.upsert({
        where: {
          userId_targetType_targetId: {
            userId,
            targetType: dto.targetType,
            targetId: dto.targetId,
          },
        },
        create: {
          userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
        update: {}, // 이미 존재하면 no-op
      });

      // Dual-write: PRODUCT 타입은 레거시 ShopWishlist에도 기록
      if (dto.targetType === WishlistTargetType.PRODUCT) {
        try {
          await tx.shopWishlist.upsert({
            where: {
              userId_productId: {
                userId,
                productId: dto.targetId,
              },
            },
            create: {
              userId,
              productId: dto.targetId,
            },
            update: {},
          });
        } catch (e) {
          // ShopWishlist 스키마 호환성 문제 시 로그만 남기고 진행
          this.logger.warn(
            `ShopWishlist dual-write skipped: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      return wishlist;
    });
  }

  /**
   * 찜 삭제
   * - PRODUCT 타입: ShopWishlist도 함께 삭제 (dual-write)
   */
  async removeFromWishlist(
    userId: string,
    targetType: WishlistTargetType,
    targetId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 통합 Wishlist 삭제
      const deleted = await tx.wishlist.deleteMany({
        where: { userId, targetType, targetId },
      });

      if (deleted.count === 0) {
        throw new NotFoundException("해당 찜 항목을 찾을 수 없습니다.");
      }

      // Dual-write: PRODUCT 타입은 레거시 ShopWishlist도 삭제
      if (targetType === WishlistTargetType.PRODUCT) {
        try {
          await tx.shopWishlist.deleteMany({
            where: { userId, productId: targetId },
          });
        } catch (e) {
          this.logger.warn(
            `ShopWishlist dual-write delete skipped: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      return { success: true, message: "찜이 해제되었습니다." };
    });
  }

  /**
   * 내 찜 목록 조회 (enrichment 포함)
   * - targetType별 batch 조회로 N+1 방지
   * - 삭제된 대상은 target: null 반환
   */
  async getMyWishlists(userId: string, query: QueryWishlistDto) {
    const { type, page = 1, pageSize = 20 } = query;

    const where = {
      userId,
      ...(type && { targetType: type }),
    };

    const [wishlists, total] = await Promise.all([
      this.prisma.wishlist.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          createdAt: true,
        },
      }),
      this.prisma.wishlist.count({ where }),
    ]);

    // targetType별 ID 그룹핑
    const idsByType = this.groupIdsByType(wishlists);

    // 각 타입별 batch 조회 (N+1 방지)
    const enrichmentMaps = await this.batchEnrichment(idsByType);

    // 결과 매핑
    const items = wishlists.map((w) => ({
      id: w.id,
      type: w.targetType,
      target: enrichmentMaps[w.targetType]?.get(w.targetId) ?? null,
      createdAt: w.createdAt,
    }));

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 타입별 찜 개수 조회
   */
  async getCount(userId: string) {
    const counts = await this.prisma.wishlist.groupBy({
      by: ["targetType"],
      where: { userId },
      _count: { id: true },
    });

    const result: Record<string, number> = {};
    for (const item of counts) {
      result[item.targetType.toLowerCase()] = item._count.id;
    }

    // 모든 타입을 포함하되, 없는 타입은 0으로 설정
    const allTypes = Object.values(WishlistTargetType);
    for (const t of allTypes) {
      const key = t.toLowerCase();
      if (!(key in result)) {
        result[key] = 0;
      }
    }

    return result;
  }

  /**
   * 특정 대상의 찜 여부 확인 (UI 하트 아이콘용)
   */
  async isWishlisted(
    userId: string,
    targetType: WishlistTargetType,
    targetId: string,
  ): Promise<{ wishlisted: boolean }> {
    const count = await this.prisma.wishlist.count({
      where: { userId, targetType, targetId },
    });

    return { wishlisted: count > 0 };
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  /**
   * 대상 리소스 존재 여부 검증
   * - 존재하지 않는 리소스에 찜을 추가하면 BadRequest 반환
   * - OTHER 타입은 검증 skip
   */
  private async validateTarget(
    targetType: WishlistTargetType,
    targetId: string,
  ): Promise<void> {
    let exists = false;

    switch (targetType) {
      case WishlistTargetType.PRODUCT:
        exists =
          (await this.prisma.shopProduct.count({ where: { id: targetId } })) >
          0;
        break;
      case WishlistTargetType.CLUB:
        exists =
          (await this.prisma.team.count({ where: { id: targetId } })) > 0;
        break;
      case WishlistTargetType.ACADEMY:
        exists =
          (await this.prisma.academy.count({ where: { id: targetId } })) > 0;
        break;
      case WishlistTargetType.COACH:
        exists =
          (await this.prisma.user.count({
            where: { id: targetId, userType: "COACH" },
          })) > 0;
        break;
      case WishlistTargetType.CLASS:
        exists =
          (await this.prisma.class.count({ where: { id: targetId } })) > 0;
        break;
      case WishlistTargetType.TOURNAMENT:
        exists =
          (await this.prisma.tournament.count({ where: { id: targetId } })) > 0;
        break;
      case WishlistTargetType.VENUE:
        exists =
          (await this.prisma.venue.count({ where: { id: targetId } })) > 0;
        break;
      case WishlistTargetType.OTHER:
        // OTHER 타입은 외부 리소스일 수 있으므로 검증 skip
        exists = true;
        break;
    }

    if (!exists) {
      throw new BadRequestException(
        `대상 리소스를 찾을 수 없습니다. (type: ${targetType}, id: ${targetId})`,
      );
    }
  }

  /**
   * wishlists를 targetType별 ID 배열로 그룹핑
   */
  private groupIdsByType(
    wishlists: Array<{ targetType: string; targetId: string }>,
  ): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    for (const w of wishlists) {
      if (!groups[w.targetType]) {
        groups[w.targetType] = [];
      }
      groups[w.targetType].push(w.targetId);
    }
    return groups;
  }

  /**
   * targetType별 batch enrichment 조회
   * - Promise.all로 병렬 조회 (N+1 방지)
   * - 각 타입별로 필요한 필드만 select
   */
  private async batchEnrichment(
    idsByType: Record<string, string[]>,
  ): Promise<Record<string, Map<string, unknown>>> {
    const result: Record<string, Map<string, unknown>> = {};

    const tasks: Array<Promise<void>> = [];

    if (idsByType[WishlistTargetType.PRODUCT]?.length) {
      tasks.push(
        this.prisma.shopProduct
          .findMany({
            where: { id: { in: idsByType[WishlistTargetType.PRODUCT] } },
            select: {
              id: true,
              name: true,
              price: true,
              salePrice: true,
              isActive: true,
              images: {
                where: { isMain: true },
                select: { imageUrl: true },
                take: 1,
              },
            },
          })
          .then((items) => {
            result[WishlistTargetType.PRODUCT] = new Map(
              items.map((i) => [
                i.id,
                {
                  id: i.id,
                  name: i.name,
                  price: i.price,
                  salePrice: i.salePrice,
                  isActive: i.isActive,
                  thumbnailUrl: i.images[0]?.imageUrl ?? null,
                },
              ]),
            );
          }),
      );
    }

    if (idsByType[WishlistTargetType.CLUB]?.length) {
      tasks.push(
        this.prisma.team
          .findMany({
            where: { id: { in: idsByType[WishlistTargetType.CLUB] } },
            select: {
              id: true,
              name: true,
              location: true,
            },
          })
          .then((items) => {
            result[WishlistTargetType.CLUB] = new Map(
              items.map((i) => [i.id, i]),
            );
          }),
      );
    }

    if (idsByType[WishlistTargetType.ACADEMY]?.length) {
      tasks.push(
        this.prisma.academy
          .findMany({
            where: { id: { in: idsByType[WishlistTargetType.ACADEMY] } },
            select: {
              id: true,
              name: true,
              imageUrl: true,
              region: true,
            },
          })
          .then((items) => {
            result[WishlistTargetType.ACADEMY] = new Map(
              items.map((i) => [i.id, i]),
            );
          }),
      );
    }

    if (idsByType[WishlistTargetType.COACH]?.length) {
      tasks.push(
        this.prisma.user
          .findMany({
            where: { id: { in: idsByType[WishlistTargetType.COACH] } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userType: true,
            },
          })
          .then((items) => {
            result[WishlistTargetType.COACH] = new Map(
              items.map((i) => [
                i.id,
                {
                  id: i.id,
                  name: `${i.lastName}${i.firstName}`,
                  userType: i.userType,
                },
              ]),
            );
          }),
      );
    }

    if (idsByType[WishlistTargetType.CLASS]?.length) {
      tasks.push(
        this.prisma.class
          .findMany({
            where: { id: { in: idsByType[WishlistTargetType.CLASS] } },
            select: {
              id: true,
              className: true,
              description: true,
              capacity: true,
              startTime: true,
              endTime: true,
              isActive: true,
            },
          })
          .then((items) => {
            result[WishlistTargetType.CLASS] = new Map(
              items.map((i) => [i.id, i]),
            );
          }),
      );
    }

    if (idsByType[WishlistTargetType.TOURNAMENT]?.length) {
      tasks.push(
        this.prisma.tournament
          .findMany({
            where: { id: { in: idsByType[WishlistTargetType.TOURNAMENT] } },
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              status: true,
            },
          })
          .then((items) => {
            result[WishlistTargetType.TOURNAMENT] = new Map(
              items.map((i) => [i.id, i]),
            );
          }),
      );
    }

    if (idsByType[WishlistTargetType.VENUE]?.length) {
      tasks.push(
        this.prisma.venue
          .findMany({
            where: { id: { in: idsByType[WishlistTargetType.VENUE] } },
            select: {
              id: true,
              name: true,
              address: true,
            },
          })
          .then((items) => {
            result[WishlistTargetType.VENUE] = new Map(
              items.map((i) => [i.id, i]),
            );
          }),
      );
    }

    await Promise.all(tasks);

    return result;
  }
}
