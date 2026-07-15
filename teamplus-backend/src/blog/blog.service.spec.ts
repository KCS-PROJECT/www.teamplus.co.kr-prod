import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { BlogStatus } from "@prisma/client";
import { BlogService } from "./blog.service";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateBlogDto } from "./dto/create-blog.dto";

describe("BlogService", () => {
  let service: BlogService;

  const mockPrisma = {
    blogPost: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BlogService>(BlogService);
    jest.clearAllMocks();
  });

  describe("create", () => {
    const baseDto: CreateBlogDto = {
      title: "봄 시즌 오픈",
      summary: "요약",
      content: "<p>안녕하세요</p><script>alert('xss')</script>",
      status: BlogStatus.PUBLISHED,
    };

    it("본문의 위험한 태그를 살균하고 slug 를 생성한다", async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null); // slug 미충돌
      mockPrisma.blogPost.create.mockImplementation(({ data }) => ({
        id: "blog-1",
        ...data,
      }));

      await service.create(baseDto, "admin-1");

      const createArg = mockPrisma.blogPost.create.mock.calls[0][0];
      // script 태그 제거, p 태그 유지
      expect(createArg.data.content).toBe("<p>안녕하세요</p>");
      expect(createArg.data.content).not.toContain("script");
      // slug 자동 생성됨(비어있지 않음)
      expect(typeof createArg.data.slug).toBe("string");
      expect(createArg.data.slug.length).toBeGreaterThan(0);
      expect(createArg.data.authorId).toBe("admin-1");
    });

    it("PUBLISHED 로 생성 시 publishedAt 을 세팅한다", async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      mockPrisma.blogPost.create.mockImplementation(({ data }) => ({
        id: "blog-1",
        ...data,
      }));

      await service.create(baseDto, "admin-1");

      const createArg = mockPrisma.blogPost.create.mock.calls[0][0];
      expect(createArg.data.publishedAt).toBeInstanceOf(Date);
      expect(createArg.data.status).toBe(BlogStatus.PUBLISHED);
    });

    it("DRAFT 로 생성 시 publishedAt 은 null 이다", async () => {
      mockPrisma.blogPost.findUnique.mockResolvedValue(null);
      mockPrisma.blogPost.create.mockImplementation(({ data }) => ({
        id: "blog-1",
        ...data,
      }));

      await service.create({ ...baseDto, status: BlogStatus.DRAFT }, "admin-1");

      const createArg = mockPrisma.blogPost.create.mock.calls[0][0];
      expect(createArg.data.publishedAt).toBeNull();
    });
  });

  describe("findPublicBySlug", () => {
    it("없으면 NotFoundException 을 던진다", async () => {
      mockPrisma.blogPost.findFirst.mockResolvedValue(null);

      await expect(service.findPublicBySlug("missing")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("발행글이면 반환하고 조회수를 증가시킨다", async () => {
      mockPrisma.blogPost.findFirst.mockResolvedValue({
        id: "blog-1",
        slug: "hello-abcd1234",
        title: "제목",
      });
      mockPrisma.blogPost.update.mockResolvedValue({ id: "blog-1" });

      const result = await service.findPublicBySlug("hello-abcd1234");

      expect(result.id).toBe("blog-1");
      expect(mockPrisma.blogPost.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "blog-1" },
          data: { viewCount: { increment: 1 } },
        }),
      );
    });
  });

  describe("findPublicList", () => {
    it("PUBLISHED·미삭제만 조회한다", async () => {
      mockPrisma.blogPost.findMany.mockResolvedValue([]);
      mockPrisma.blogPost.count.mockResolvedValue(0);

      await service.findPublicList({});

      const findArg = mockPrisma.blogPost.findMany.mock.calls[0][0];
      expect(findArg.where).toEqual({
        status: BlogStatus.PUBLISHED,
        deletedAt: null,
      });
    });
  });

  describe("update", () => {
    it("최초 PUBLISHED 전환 시 publishedAt 을 세팅한다", async () => {
      mockPrisma.blogPost.findFirst.mockResolvedValue({
        id: "blog-1",
        status: BlogStatus.DRAFT,
        publishedAt: null,
      });
      mockPrisma.blogPost.update.mockResolvedValue({ id: "blog-1" });

      await service.update("blog-1", { status: BlogStatus.PUBLISHED });

      const updateArg = mockPrisma.blogPost.update.mock.calls[0][0];
      expect(updateArg.data.publishedAt).toBeInstanceOf(Date);
    });

    it("이미 발행된 글 재발행 시 publishedAt 을 덮어쓰지 않는다", async () => {
      const original = new Date("2026-01-01T00:00:00Z");
      mockPrisma.blogPost.findFirst.mockResolvedValue({
        id: "blog-1",
        status: BlogStatus.DRAFT,
        publishedAt: original,
      });
      mockPrisma.blogPost.update.mockResolvedValue({ id: "blog-1" });

      await service.update("blog-1", { status: BlogStatus.PUBLISHED });

      const updateArg = mockPrisma.blogPost.update.mock.calls[0][0];
      expect(updateArg.data.publishedAt).toBeUndefined();
    });
  });

  describe("remove", () => {
    it("없으면 NotFoundException 을 던진다", async () => {
      mockPrisma.blogPost.findFirst.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("soft delete 로 deletedAt 을 세팅한다", async () => {
      mockPrisma.blogPost.findFirst.mockResolvedValue({ id: "blog-1" });
      mockPrisma.blogPost.update.mockResolvedValue({ id: "blog-1" });

      const result = await service.remove("blog-1");

      expect(result).toEqual({ success: true });
      const updateArg = mockPrisma.blogPost.update.mock.calls[0][0];
      expect(updateArg.data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
