import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { GalleryService } from "./gallery.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("GalleryService", () => {
  let service: GalleryService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    gallery: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    galleryPhoto: {
      createMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GalleryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GalleryService>(GalleryService);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ==================== createGallery ====================

  describe("createGallery", () => {
    it("정상적으로 갤러리를 생성한다", async () => {
      const dto = {
        title: "2026 봄 시즌",
        description: "봄 시즌 사진 모음",
        teamId: "club-1",
      };
      mockPrisma.gallery.create.mockResolvedValue({
        id: "g-1",
        title: "2026 봄 시즌",
        description: "봄 시즌 사진 모음",
        teamId: "club-1",
        coachId: "coach-1",
        coverPhotoUrl: null,
        category: "OTHER",
        visibility: "CLUB_ONLY",
        sortOrder: 0,
        createdAt: new Date(),
      });

      const result = await service.createGallery(dto as any, "coach-1");

      expect(result.id).toBe("g-1");
      expect(result.coachId).toBe("coach-1");
      expect(mockPrisma.gallery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "2026 봄 시즌",
            coachId: "coach-1",
            category: "OTHER",
            visibility: "CLUB_ONLY",
          }),
        }),
      );
    });

    it("카테고리와 공개범위를 지정하면 해당 값으로 생성한다", async () => {
      const dto = {
        title: "대회 사진",
        teamId: "club-1",
        category: "MATCH",
        visibility: "PUBLIC",
      };
      mockPrisma.gallery.create.mockResolvedValue({
        id: "g-2",
        ...dto,
        coachId: "coach-1",
      });

      await service.createGallery(dto as any, "coach-1");

      expect(mockPrisma.gallery.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: "MATCH",
            visibility: "PUBLIC",
          }),
        }),
      );
    });
  });

  // ==================== addPhotos ====================

  describe("addPhotos", () => {
    it("다중 사진을 정상적으로 추가한다", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue({ id: "g-1" });
      mockPrisma.galleryPhoto.createMany.mockResolvedValue({ count: 3 });

      const photos = [
        { photoUrl: "https://cdn/p1.jpg" },
        { photoUrl: "https://cdn/p2.jpg" },
        { photoUrl: "https://cdn/p3.jpg" },
      ];

      const result = await service.addPhotos(
        "g-1",
        photos as any,
        "uploader-1",
      );

      expect(result.addedCount).toBe(3);
      expect(result.galleryId).toBe("g-1");
      expect(mockPrisma.galleryPhoto.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              galleryId: "g-1",
              uploaderId: "uploader-1",
              photoUrl: "https://cdn/p1.jpg",
            }),
          ]),
        }),
      );
    });

    it("존재하지 않는 갤러리에 사진 추가 시 NotFoundException", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue(null);

      await expect(
        service.addPhotos("not-exist", [{ photoUrl: "url" }] as any, "u-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("sortOrder를 명시하지 않으면 index 기반으로 자동 설정한다", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue({ id: "g-1" });
      mockPrisma.galleryPhoto.createMany.mockResolvedValue({ count: 2 });

      const photos = [
        { photoUrl: "https://cdn/a.jpg" },
        { photoUrl: "https://cdn/b.jpg" },
      ];

      await service.addPhotos("g-1", photos as any, "u-1");

      const createManyArgs =
        mockPrisma.galleryPhoto.createMany.mock.calls[0][0];
      expect(createManyArgs.data[0].sortOrder).toBe(0);
      expect(createManyArgs.data[1].sortOrder).toBe(1);
    });
  });

  // ==================== removePhoto ====================

  describe("removePhoto", () => {
    it("업로더 본인이 사진을 삭제할 수 있다", async () => {
      mockPrisma.galleryPhoto.findFirst.mockResolvedValue({
        id: "p-1",
        uploaderId: "coach-1",
        gallery: { coachId: "other-coach" },
      });
      mockPrisma.galleryPhoto.delete.mockResolvedValue({});

      const result = await service.removePhoto("g-1", "p-1", {
        id: "coach-1",
        userType: "COACH",
      });

      expect(result.deleted).toBe(true);
      expect(result.photoId).toBe("p-1");
    });

    it("갤러리 소유자(coachId)가 사진을 삭제할 수 있다", async () => {
      mockPrisma.galleryPhoto.findFirst.mockResolvedValue({
        id: "p-1",
        uploaderId: "another-user",
        gallery: { coachId: "gallery-owner" },
      });
      mockPrisma.galleryPhoto.delete.mockResolvedValue({});

      const result = await service.removePhoto("g-1", "p-1", {
        id: "gallery-owner",
        userType: "COACH",
      });

      expect(result.deleted).toBe(true);
    });

    it("ADMIN은 모든 사진을 삭제할 수 있다", async () => {
      mockPrisma.galleryPhoto.findFirst.mockResolvedValue({
        id: "p-1",
        uploaderId: "another-user",
        gallery: { coachId: "another-coach" },
      });
      mockPrisma.galleryPhoto.delete.mockResolvedValue({});

      const result = await service.removePhoto("g-1", "p-1", {
        id: "admin-1",
        userType: "ADMIN",
      });

      expect(result.deleted).toBe(true);
    });

    it("비소유자이며 비관리자이면 ForbiddenException", async () => {
      mockPrisma.galleryPhoto.findFirst.mockResolvedValue({
        id: "p-1",
        uploaderId: "another-user",
        gallery: { coachId: "another-coach" },
      });

      await expect(
        service.removePhoto("g-1", "p-1", {
          id: "stranger",
          userType: "PARENT",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("존재하지 않는 사진이면 NotFoundException", async () => {
      mockPrisma.galleryPhoto.findFirst.mockResolvedValue(null);

      await expect(
        service.removePhoto("g-1", "not-exist", {
          id: "coach-1",
          userType: "COACH",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== deleteGallery ====================

  describe("deleteGallery", () => {
    it("소유자가 갤러리를 삭제한다 (cascade)", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue({
        id: "g-1",
        coachId: "coach-1",
        title: "Test Gallery",
      });
      mockPrisma.gallery.delete.mockResolvedValue({});

      const result = await service.deleteGallery("g-1", {
        id: "coach-1",
        userType: "COACH",
      });

      expect(result.deleted).toBe(true);
      expect(result.id).toBe("g-1");
      expect(mockPrisma.gallery.delete).toHaveBeenCalledWith({
        where: { id: "g-1" },
      });
    });

    it("ADMIN은 다른 사람의 갤러리도 삭제할 수 있다", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue({
        id: "g-1",
        coachId: "other-coach",
        title: "Other Gallery",
      });
      mockPrisma.gallery.delete.mockResolvedValue({});

      const result = await service.deleteGallery("g-1", {
        id: "admin-1",
        userType: "ADMIN",
      });

      expect(result.deleted).toBe(true);
    });

    it("비소유자이며 비관리자이면 ForbiddenException", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue({
        id: "g-1",
        coachId: "other-coach",
        title: "Other Gallery",
      });

      await expect(
        service.deleteGallery("g-1", {
          id: "stranger",
          userType: "PARENT",
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("존재하지 않는 갤러리면 NotFoundException", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteGallery("not-exist", {
          id: "coach-1",
          userType: "COACH",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== getGalleryById ====================

  describe("getGalleryById", () => {
    it("존재하는 갤러리 상세를 반환한다", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue({
        id: "g-1",
        title: "Test Gallery",
        photos: [],
        team: { id: "club-1", name: "Test Club" },
        coach: { id: "coach-1", firstName: "코치", lastName: "김" },
      });

      const result = await service.getGalleryById("g-1");

      expect(result.id).toBe("g-1");
    });

    it("존재하지 않는 갤러리면 NotFoundException", async () => {
      mockPrisma.gallery.findUnique.mockResolvedValue(null);

      await expect(service.getGalleryById("not-exist")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
