import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateReviewDto, ToggleVisibilityDto } from "./dto/update-review.dto";

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 수업 리뷰 작성
   */
  async createReview(userId: string, dto: CreateReviewDto) {
    const cls = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: { id: true, className: true, instructorName: true },
    });
    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    const existing = await this.prisma.classReview.findUnique({
      where: { userId_classId: { userId, classId: dto.classId } },
    });
    if (existing) {
      throw new ConflictException("이미 해당 수업에 리뷰를 작성하셨습니다.");
    }

    const images = dto.images?.slice(0, 5) ?? [];

    return this.prisma.classReview.create({
      data: {
        userId,
        classId: dto.classId,
        rating: dto.rating,
        content: dto.content,
        images,
      },
      select: {
        id: true,
        rating: true,
        content: true,
        images: true,
        isVisible: true,
        createdAt: true,
        class: {
          select: { id: true, className: true, instructorName: true },
        },
      },
    });
  }

  /**
   * 전체 리뷰 목록 조회 (관리자용 - 페이지네이션 포함)
   */
  async getAllReviews(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.prisma.classReview.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          rating: true,
          content: true,
          images: true,
          isVisible: true,
          createdAt: true,
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          class: {
            select: { id: true, className: true, instructorName: true },
          },
        },
      }),
      this.prisma.classReview.count(),
    ]);

    const mapped = reviews.map((r) => {
      const userName =
        r.user.lastName || r.user.firstName
          ? `${r.user.lastName}${r.user.firstName}`.trim()
          : r.user.email;
      return {
        id: r.id,
        userName,
        className: r.class.className,
        instructorName: r.class.instructorName,
        rating: r.rating,
        content: r.content,
        images: r.images,
        isVisible: r.isVisible,
        createdAt: r.createdAt,
      };
    });

    return {
      data: mapped,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 수업별 공개 리뷰 목록 조회
   */
  async getReviewsByClass(classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });
    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    const [reviews, total] = await Promise.all([
      this.prisma.classReview.findMany({
        where: { classId, isVisible: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          rating: true,
          content: true,
          images: true,
          createdAt: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.classReview.count({ where: { classId, isVisible: true } }),
    ]);

    const avg =
      total > 0
        ? await this.prisma.classReview
            .aggregate({
              where: { classId, isVisible: true },
              _avg: { rating: true },
            })
            .then((r) => r._avg.rating ?? 0)
        : 0;

    return {
      reviews: reviews.map((r) => {
        return {
          id: r.id,
          userName:
            r.user.lastName || r.user.firstName
              ? `${r.user.lastName}${r.user.firstName}`.trim()
              : "익명",
          rating: r.rating,
          content: r.content,
          images: r.images,
          createdAt: r.createdAt,
        };
      }),
      total,
      averageRating: Math.round(avg * 10) / 10,
    };
  }

  /**
   * 내가 작성한 리뷰 목록
   */
  async getMyReviews(userId: string) {
    return this.prisma.classReview.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        rating: true,
        content: true,
        images: true,
        isVisible: true,
        createdAt: true,
        updatedAt: true,
        class: {
          select: { id: true, className: true, instructorName: true },
        },
      },
    });
  }

  /**
   * 리뷰 수정 (본인만)
   */
  async updateReview(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.classReview.findUnique({
      where: { id: reviewId },
      select: { userId: true },
    });
    if (!review) {
      throw new NotFoundException("리뷰를 찾을 수 없습니다.");
    }
    if (review.userId !== userId) {
      throw new ForbiddenException("본인이 작성한 리뷰만 수정할 수 있습니다.");
    }

    return this.prisma.classReview.update({
      where: { id: reviewId },
      data: {
        ...(dto.rating !== undefined && { rating: dto.rating }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.images !== undefined && { images: dto.images.slice(0, 5) }),
      },
      select: {
        id: true,
        rating: true,
        content: true,
        images: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 리뷰 공개/비공개 토글 (관리자용)
   */
  async toggleVisibility(reviewId: string, dto: ToggleVisibilityDto) {
    const review = await this.prisma.classReview.findUnique({
      where: { id: reviewId },
      select: { id: true, isVisible: true },
    });
    if (!review) {
      throw new NotFoundException("리뷰를 찾을 수 없습니다.");
    }

    const newVisibility = dto.isVisible ?? !review.isVisible;

    return this.prisma.classReview.update({
      where: { id: reviewId },
      data: { isVisible: newVisibility },
      select: { id: true, isVisible: true },
    });
  }

  /**
   * 리뷰 삭제 (본인 또는 관리자)
   */
  async deleteReview(
    userId: string,
    reviewId: string,
    isAdmin: boolean = false,
  ) {
    const review = await this.prisma.classReview.findUnique({
      where: { id: reviewId },
      select: { userId: true },
    });
    if (!review) {
      throw new NotFoundException("리뷰를 찾을 수 없습니다.");
    }
    if (!isAdmin && review.userId !== userId) {
      throw new ForbiddenException("본인이 작성한 리뷰만 삭제할 수 있습니다.");
    }

    await this.prisma.classReview.delete({ where: { id: reviewId } });
    return { message: "리뷰가 삭제되었습니다." };
  }
}
