import { Injectable, NotFoundException } from "@nestjs/common";
import { BlogStatus, Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { sanitizeBlogHtml, sanitizeStrict } from "@/common/utils/sanitize.util";
import { CreateBlogDto } from "./dto/create-blog.dto";
import { UpdateBlogDto } from "./dto/update-blog.dto";
import { QueryBlogDto } from "./dto/query-blog.dto";

/**
 * 목록(카드)에 노출하는 필드 — content 제외로 페이로드 축소 + N+1 방지.
 */
const BLOG_LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  category: true,
  coverImageUrl: true,
  status: true,
  pinned: true,
  viewCount: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BlogPostSelect;

/**
 * 상세 조회 필드 — 목록 필드 + content/authorId.
 */
const BLOG_DETAIL_SELECT = {
  ...BLOG_LIST_SELECT,
  content: true,
  authorId: true,
} satisfies Prisma.BlogPostSelect;

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 공개 (비로그인) ====================

  /**
   * 공개 목록 — 발행(PUBLISHED)·미삭제만, 고정글 우선 후 발행 최신순.
   */
  async findPublicList(query: QueryBlogDto) {
    const { page, pageSize, skip } = this.resolvePaging(query, 12);

    const where: Prisma.BlogPostWhereInput = {
      status: BlogStatus.PUBLISHED,
      deletedAt: null,
    };
    if (query.category) {
      where.category = query.category;
    }

    const [items, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        // 등록일자(createdAt) 내림차순 — 고정글 우선. 관리 목록과 정렬 기준 통일.
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
        select: BLOG_LIST_SELECT,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * 공개 상세 (slug) — 발행·미삭제만. 조회수는 fire-and-forget 증가.
   */
  async findPublicBySlug(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: BlogStatus.PUBLISHED, deletedAt: null },
      select: BLOG_DETAIL_SELECT,
    });

    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    // 조회수 증가는 응답을 막지 않는다(실패 무시).
    void this.prisma.blogPost
      .update({
        where: { id: post.id },
        data: { viewCount: { increment: 1 } },
        select: { id: true },
      })
      .catch(() => undefined);

    return post;
  }

  // ==================== 관리자 (SYSTEM/OPER) ====================

  /**
   * 관리자 목록 — 미삭제 전체(임시저장 포함), status/category/search 필터, 고정 우선 후 최신순.
   */
  async findAdminList(query: QueryBlogDto) {
    const { page, pageSize, skip } = this.resolvePaging(query, 20);

    const where: Prisma.BlogPostWhereInput = { deletedAt: null };
    if (query.status) {
      where.status = query.status;
    }
    if (query.category) {
      where.category = query.category;
    }
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
        select: BLOG_LIST_SELECT,
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * 관리자 상세 (id) — 편집용. 임시저장 포함, 미삭제만.
   */
  async findAdminById(id: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      select: BLOG_DETAIL_SELECT,
    });

    if (!post) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    return post;
  }

  /**
   * 생성 — content 살균, slug 자동 생성. PUBLISHED 로 생성 시 publishedAt 세팅.
   */
  async create(dto: CreateBlogDto, authorId?: string) {
    const status = dto.status ?? BlogStatus.DRAFT;
    const slug = await this.generateUniqueSlug(dto.title);

    const created = await this.prisma.blogPost.create({
      data: {
        slug,
        title: sanitizeStrict(dto.title),
        summary: sanitizeStrict(dto.summary),
        content: sanitizeBlogHtml(dto.content),
        category: dto.category ?? undefined,
        coverImageUrl: dto.coverImageUrl?.trim() || null,
        status,
        pinned: dto.pinned ?? undefined,
        publishedAt: status === BlogStatus.PUBLISHED ? new Date() : null,
        authorId: authorId ?? null,
      },
      select: BLOG_DETAIL_SELECT,
    });

    return created;
  }

  /**
   * 수정 — 부분 업데이트. 최초 PUBLISHED 전환 시 publishedAt 세팅(재발행 시 원본 유지).
   */
  async update(id: string, dto: UpdateBlogDto) {
    const existing = await this.prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, publishedAt: true },
    });

    if (!existing) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    const data: Prisma.BlogPostUpdateInput = {};
    if (dto.title !== undefined) data.title = sanitizeStrict(dto.title);
    if (dto.summary !== undefined) data.summary = sanitizeStrict(dto.summary);
    if (dto.content !== undefined) data.content = sanitizeBlogHtml(dto.content);
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.coverImageUrl !== undefined) {
      data.coverImageUrl = dto.coverImageUrl?.trim() || null;
    }
    if (dto.pinned !== undefined) data.pinned = dto.pinned;
    if (dto.status !== undefined) {
      data.status = dto.status;
      // 최초 발행 시각만 기록(이미 발행된 적 있으면 유지).
      if (dto.status === BlogStatus.PUBLISHED && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    return this.prisma.blogPost.update({
      where: { id },
      data,
      select: BLOG_DETAIL_SELECT,
    });
  }

  /**
   * 발행 토글 — DRAFT ⇄ PUBLISHED. 최초 발행 시 publishedAt 세팅.
   */
  async togglePublish(id: string) {
    const existing = await this.prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, publishedAt: true },
    });

    if (!existing) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    const nextStatus =
      existing.status === BlogStatus.PUBLISHED
        ? BlogStatus.DRAFT
        : BlogStatus.PUBLISHED;

    const data: Prisma.BlogPostUpdateInput = { status: nextStatus };
    if (nextStatus === BlogStatus.PUBLISHED && !existing.publishedAt) {
      data.publishedAt = new Date();
    }

    return this.prisma.blogPost.update({
      where: { id },
      data,
      select: { id: true, status: true, publishedAt: true },
    });
  }

  /**
   * soft delete (deletedAt=now) — 없으면 404.
   */
  async remove(id: string) {
    const existing = await this.prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException("게시글을 찾을 수 없습니다.");
    }

    await this.prisma.blogPost.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });

    return { success: true };
  }

  // ==================== 내부 헬퍼 ====================

  private resolvePaging(query: QueryBlogDto, defaultSize: number) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0
        ? Math.min(query.pageSize, 100)
        : defaultSize;
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  /**
   * 제목 기반 ASCII slug + 짧은 고유 접미사. 순수 한글 제목은 접미사만 사용(URL 인코딩 이슈 회피).
   * 충돌 시 최대 5회 재시도, 그래도 충돌하면 타임스탬프 fallback.
   */
  private async generateUniqueSlug(title: string): Promise<string> {
    const base = title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "") // 비 ASCII 제거(한글 등)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    for (let i = 0; i < 5; i++) {
      const suffix = randomBytes(4).toString("hex"); // 8자
      const slug = base ? `${base}-${suffix}` : suffix;
      const exists = await this.prisma.blogPost.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!exists) return slug;
    }

    return `${base || "post"}-${Date.now().toString(36)}`;
  }
}
