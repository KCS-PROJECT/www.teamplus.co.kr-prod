import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";
import { CreateAcademyPromotionDto } from "./dto/create-academy-promotion.dto";
import {
  sanitizeStrict,
  sanitizeExtendedHtml,
} from "@/common/utils/sanitize.util";

@Injectable()
export class AcademyPromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewCounter: ViewCounterService,
  ) {}

  /**
   * 아카데미 홍보 목록 조회 (공개)
   */
  async getPromotions(
    page: number = 1,
    limit: number = 10,
    lessonType?: string,
    teamId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (lessonType) where.lessonType = lessonType;
    if (teamId) where.teamId = teamId;

    const [promotions, total] = await Promise.all([
      this.prisma.academyPromotion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          coachId: true,
          teamId: true,
          title: true,
          content: true,
          imageUrl: true,
          lessonType: true,
          scheduleInfo: true,
          priceInfo: true,
          capacity: true,
          venueInfo: true,
          contactPhone: true,
          isActive: true,
          startDate: true,
          endDate: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
          coach: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.academyPromotion.count({ where }),
    ]);

    return {
      data: promotions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 아카데미 홍보 상세 조회 (1일 1회 viewCount 증가)
   */
  async getPromotion(promotionId: string, userId?: string) {
    const promotion = await this.prisma.academyPromotion.findUnique({
      where: { id: promotionId },
      include: {
        coach: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        team: {
          select: { id: true, name: true },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundException("아카데미 홍보 게시물을 찾을 수 없습니다.");
    }

    // 1일 1회 조회수 증가: tryIncrement 성공 시에만 increment 수행
    const shouldIncrement = await this.viewCounter.tryIncrement({
      entityType: "academy_promotion",
      entityId: promotionId,
      userId,
    });

    if (shouldIncrement) {
      this.prisma.academyPromotion
        .update({
          where: { id: promotionId },
          data: { viewCount: { increment: 1 } },
        })
        .catch(() => {
          // viewCount 업데이트 실패는 조회 흐름을 막지 않음
        });
    }

    return promotion;
  }

  /**
   * 아카데미 홍보 등록 (COACH, DIRECTOR만)
   */
  async createPromotion(coachId: string, createDto: CreateAcademyPromotionDto) {
    const promotion = await this.prisma.academyPromotion.create({
      data: {
        coachId,
        teamId: createDto.teamId ?? null,
        title: sanitizeStrict(createDto.title),
        content: sanitizeExtendedHtml(createDto.content),
        lessonType: createDto.lessonType,
        imageUrl: createDto.imageUrl ?? null,
        scheduleInfo: createDto.scheduleInfo ?? null,
        priceInfo: createDto.priceInfo ?? null,
        capacity: createDto.capacity ?? null,
        venueInfo: createDto.venueInfo ?? null,
        contactPhone: createDto.contactPhone ?? null,
        isActive: createDto.isActive !== false,
        startDate: createDto.startDate ? new Date(createDto.startDate) : null,
        endDate: createDto.endDate ? new Date(createDto.endDate) : null,
      },
    });

    return promotion;
  }

  /**
   * 아카데미 홍보 수정 (작성자 본인만)
   */
  async updatePromotion(
    userId: string,
    promotionId: string,
    updateDto: Partial<CreateAcademyPromotionDto>,
  ) {
    const promotion = await this.prisma.academyPromotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion) {
      throw new NotFoundException("아카데미 홍보 게시물을 찾을 수 없습니다.");
    }

    if (promotion.coachId !== userId) {
      throw new ForbiddenException(
        "본인이 등록한 홍보 게시물만 수정할 수 있습니다.",
      );
    }

    const updateData: any = {};
    if (updateDto.title !== undefined)
      updateData.title = sanitizeStrict(updateDto.title);
    if (updateDto.content !== undefined)
      updateData.content = sanitizeExtendedHtml(updateDto.content);
    if (updateDto.lessonType !== undefined)
      updateData.lessonType = updateDto.lessonType;
    if (updateDto.teamId !== undefined)
      updateData.teamId = updateDto.teamId ?? null;
    if (updateDto.imageUrl !== undefined)
      updateData.imageUrl = updateDto.imageUrl ?? null;
    if (updateDto.scheduleInfo !== undefined)
      updateData.scheduleInfo = updateDto.scheduleInfo ?? null;
    if (updateDto.priceInfo !== undefined)
      updateData.priceInfo = updateDto.priceInfo ?? null;
    if (updateDto.capacity !== undefined)
      updateData.capacity = updateDto.capacity ?? null;
    if (updateDto.venueInfo !== undefined)
      updateData.venueInfo = updateDto.venueInfo ?? null;
    if (updateDto.contactPhone !== undefined)
      updateData.contactPhone = updateDto.contactPhone ?? null;
    if (updateDto.isActive !== undefined)
      updateData.isActive = updateDto.isActive;
    if (updateDto.startDate !== undefined)
      updateData.startDate = updateDto.startDate
        ? new Date(updateDto.startDate)
        : null;
    if (updateDto.endDate !== undefined)
      updateData.endDate = updateDto.endDate
        ? new Date(updateDto.endDate)
        : null;

    const updated = await this.prisma.academyPromotion.update({
      where: { id: promotionId },
      data: updateData,
    });

    return updated;
  }

  /**
   * 아카데미 홍보 삭제 (작성자 본인 또는 ADMIN)
   */
  async deletePromotion(userId: string, userType: string, promotionId: string) {
    const promotion = await this.prisma.academyPromotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion) {
      throw new NotFoundException("아카데미 홍보 게시물을 찾을 수 없습니다.");
    }

    const isAdmin = userType === "ADMIN";
    if (!isAdmin && promotion.coachId !== userId) {
      throw new ForbiddenException(
        "본인이 등록한 홍보 게시물만 삭제할 수 있습니다.",
      );
    }

    await this.prisma.academyPromotion.delete({ where: { id: promotionId } });

    return { message: "아카데미 홍보 게시물이 삭제되었습니다." };
  }
}
