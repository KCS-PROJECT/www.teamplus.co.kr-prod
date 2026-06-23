import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";
import {
  CreateTmsPostDto,
  CreateTmsCommentDto,
} from "./dto/create-tms-post.dto";
import { UpdateTmsPostDto } from "./dto/update-tms-post.dto";

@Injectable()
export class TmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewCounter: ViewCounterService,
  ) {}

  /** 목록 조회 (검색, 필터, 페이지네이션) */
  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    platform?: string;
    category?: string;
    status?: string;
    priority?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { content: { contains: query.search, mode: "insensitive" } },
        { authorName: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.platform) where.platform = query.platform;
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;

    const [data, total] = await Promise.all([
      this.prisma.tmsPost.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          attachments: { orderBy: { displayOrder: "asc" } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.tmsPost.count({ where }),
    ]);

    // 통계 (전체 활성 게시글 기준)
    const stats = await this.prisma.tmsPost.groupBy({
      by: ["status"],
      where: { isActive: true },
      _count: true,
    });

    const statusCounts: Record<string, number> = {};
    stats.forEach((s) => {
      statusCounts[s.status] = s._count;
    });

    return {
      data: data.map((post) => ({
        ...post,
        commentCount: post._count.comments,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        todo: statusCounts["todo"] || 0,
        in_progress: statusCounts["in_progress"] || 0,
        review: statusCounts["review"] || 0,
        done: statusCounts["done"] || 0,
        rejected: statusCounts["rejected"] || 0,
      },
    };
  }

  /** 상세 조회 (1일 1회 viewCount 증가) */
  async findOne(id: string, userId?: string) {
    const post = await this.prisma.tmsPost.findUnique({
      where: { id },
      include: {
        attachments: { orderBy: { displayOrder: "asc" } },
        comments: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!post || !post.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    // 1일 1회 viewCount 증가 (비동기, 에러 무시)
    const shouldIncrement = await this.viewCounter.tryIncrement({
      entityType: "tms_post",
      entityId: id,
      userId,
    });
    if (shouldIncrement) {
      this.prisma.tmsPost
        .update({ where: { id }, data: { viewCount: { increment: 1 } } })
        .catch(() => {});
    }

    return post;
  }

  /** 게시글 생성 */
  async create(dto: CreateTmsPostDto) {
    const post = await this.prisma.tmsPost.create({
      data: {
        title: dto.title,
        content: dto.content,
        platform: dto.platform || "web",
        category: dto.category || "bug",
        priority: dto.priority || "medium",
        authorName: dto.authorName,
        authorEmail: dto.authorEmail,
        assignee: dto.assignee,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
      include: {
        attachments: true,
      },
    });

    // 첨부파일 연결 (업로드된 파일 ID가 있으면)
    if (dto.attachmentIds && dto.attachmentIds.length > 0) {
      await this.prisma.tmsAttachment.updateMany({
        where: { id: { in: dto.attachmentIds } },
        data: { postId: post.id },
      });
    }

    return this.findOne(post.id);
  }

  /** 게시글 수정 */
  async update(id: string, dto: UpdateTmsPostDto) {
    const existing = await this.prisma.tmsPost.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    return this.prisma.tmsPost.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.platform !== undefined && { platform: dto.platform }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.authorName !== undefined && { authorName: dto.authorName }),
        ...(dto.authorEmail !== undefined && { authorEmail: dto.authorEmail }),
        ...(dto.assignee !== undefined && { assignee: dto.assignee }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
      },
      include: {
        attachments: { orderBy: { displayOrder: "asc" } },
        _count: { select: { comments: true } },
      },
    });
  }

  /** 게시글 삭제 (소프트 삭제) */
  async remove(id: string) {
    const existing = await this.prisma.tmsPost.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    await this.prisma.tmsPost.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: "게시글이 삭제되었습니다." };
  }

  /** 상태 변경 (빠른 상태 전환) */
  async updateStatus(id: string, status: string) {
    const existing = await this.prisma.tmsPost.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    return this.prisma.tmsPost.update({
      where: { id },
      data: { status },
      include: {
        attachments: { orderBy: { displayOrder: "asc" } },
        _count: { select: { comments: true } },
      },
    });
  }

  /** 댓글 추가 */
  async addComment(postId: string, dto: CreateTmsCommentDto) {
    const post = await this.prisma.tmsPost.findUnique({
      where: { id: postId },
    });
    if (!post || !post.isActive) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    return this.prisma.tmsComment.create({
      data: {
        postId,
        authorName: dto.authorName,
        content: dto.content,
      },
    });
  }

  /** 이미지 업로드 처리 */
  async uploadFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("파일이 없습니다.");
    }

    // 10MB 제한
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException("파일 크기는 10MB를 초과할 수 없습니다.");
    }

    // 허용 타입
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        "허용되지 않는 파일 형식입니다. (JPEG, PNG, GIF, WebP, PDF만 가능)",
      );
    }

    // multer originalname latin1 → UTF-8 복원
    const decodedName = Buffer.from(file.originalname, "latin1").toString(
      "utf8",
    );

    // file.path: "./uploads/tms/2026/20260319/..." → "/uploads/tms/2026/20260319/..."
    const normalizedPath = file.path
      .replace(/\\/g, "/")
      .replace(/^\.\//, "/")
      .replace(/^(?!\/)/, "/");

    // TmsAttachment 레코드 생성 (postId null — 나중에 게시글 생성 시 연결)
    const attachment = await this.prisma.tmsAttachment.create({
      data: {
        fileUrl: normalizedPath,
        fileName: decodedName,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    });

    return {
      id: attachment.id,
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
    };
  }
}
