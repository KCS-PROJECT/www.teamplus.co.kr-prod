import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateGalleryDto } from "./dto/create-gallery.dto";
import { UpdateGalleryDto } from "./dto/update-gallery.dto";
import { PhotoItemDto } from "./dto/add-photo.dto";

/**
 * 관리자/감독 역할 -- 소유자가 아니더라도 모든 갤러리를 관리할 수 있는 역할.
 */
const GALLERY_ADMIN_ROLES = new Set(["ADMIN", "DIRECTOR"]);

@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== Gallery CRUD ====================

  /**
   * 갤러리(앨범) 생성.
   *
   * coachId는 요청자의 userId로 자동 설정된다.
   */
  async createGallery(dto: CreateGalleryDto, userId: string) {
    const gallery = await this.prisma.gallery.create({
      data: {
        title: dto.title,
        description: dto.description,
        teamId: dto.teamId,
        coachId: userId,
        coverPhotoUrl: dto.coverPhotoUrl,
        category: dto.category ?? "OTHER",
        visibility: dto.visibility ?? "CLUB_ONLY",
        sortOrder: dto.sortOrder ?? 0,
      },
      select: {
        id: true,
        title: true,
        description: true,
        teamId: true,
        coachId: true,
        coverPhotoUrl: true,
        category: true,
        visibility: true,
        sortOrder: true,
        createdAt: true,
      },
    });

    this.logger.log(
      `갤러리 생성 완료: id=${gallery.id}, title="${gallery.title}", userId=${userId}`,
    );

    return gallery;
  }

  /**
   * 갤러리 목록 조회 (페이징).
   *
   * - teamId 필터: 해당 클럽의 갤러리만
   * - category 필터: 특정 카테고리만
   * - visibility 필터: PUBLIC / CLUB_ONLY 등
   * - 기본 정렬: sortOrder ASC, createdAt DESC
   */
  async getGalleries(query: {
    teamId?: string;
    category?: string;
    visibility?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.GalleryWhereInput = {};

    if (query.teamId) {
      where.teamId = query.teamId;
    }

    if (query.category) {
      where.category = query.category as Prisma.EnumGalleryCategoryFilter;
    }

    if (query.visibility) {
      where.visibility = query.visibility as Prisma.EnumGalleryVisibilityFilter;
    }

    const [items, total] = await Promise.all([
      this.prisma.gallery.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          description: true,
          teamId: true,
          coachId: true,
          coverPhotoUrl: true,
          category: true,
          visibility: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { photos: true } },
          team: { select: { id: true, name: true } },
          coach: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.gallery.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 갤러리 상세 조회 (사진 포함).
   *
   * photos를 sortOrder ASC로 정렬하여 반환.
   */
  async getGalleryById(id: string) {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        teamId: true,
        coachId: true,
        coverPhotoUrl: true,
        category: true,
        visibility: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        team: { select: { id: true, name: true } },
        coach: { select: { id: true, firstName: true, lastName: true } },
        photos: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            photoUrl: true,
            thumbnailUrl: true,
            caption: true,
            takenAt: true,
            sortOrder: true,
            uploaderId: true,
            createdAt: true,
            uploader: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!gallery) {
      throw new NotFoundException("갤러리를 찾을 수 없습니다.");
    }

    return gallery;
  }

  /**
   * 갤러리 수정.
   *
   * - ADMIN / DIRECTOR: 모든 갤러리 수정 가능
   * - COACH: 본인이 생성한 갤러리만 수정 가능
   */
  async updateGallery(
    id: string,
    dto: UpdateGalleryDto,
    actor: { id: string; userType: string },
  ) {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id },
      select: { id: true, coachId: true },
    });

    if (!gallery) {
      throw new NotFoundException("갤러리를 찾을 수 없습니다.");
    }

    if (
      !GALLERY_ADMIN_ROLES.has(actor.userType.toUpperCase()) &&
      gallery.coachId !== actor.id
    ) {
      throw new ForbiddenException(
        "본인이 생성한 갤러리만 수정할 수 있습니다.",
      );
    }

    const updated = await this.prisma.gallery.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.coverPhotoUrl !== undefined && {
          coverPhotoUrl: dto.coverPhotoUrl,
        }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.teamId !== undefined && { teamId: dto.teamId }),
      },
      select: {
        id: true,
        title: true,
        description: true,
        teamId: true,
        coachId: true,
        coverPhotoUrl: true,
        category: true,
        visibility: true,
        sortOrder: true,
        updatedAt: true,
      },
    });

    this.logger.log(`갤러리 수정 완료: id=${id}, actor=${actor.id}`);

    return updated;
  }

  /**
   * 갤러리 삭제.
   *
   * Prisma onDelete: Cascade에 의해 연결된 GalleryPhoto도 함께 삭제된다.
   */
  async deleteGallery(id: string, actor: { id: string; userType: string }) {
    const gallery = await this.prisma.gallery.findUnique({
      where: { id },
      select: { id: true, coachId: true, title: true },
    });

    if (!gallery) {
      throw new NotFoundException("갤러리를 찾을 수 없습니다.");
    }

    if (
      !GALLERY_ADMIN_ROLES.has(actor.userType.toUpperCase()) &&
      gallery.coachId !== actor.id
    ) {
      throw new ForbiddenException(
        "본인이 생성한 갤러리만 삭제할 수 있습니다.",
      );
    }

    await this.prisma.gallery.delete({ where: { id } });

    this.logger.log(
      `갤러리 삭제 완료: id=${id}, title="${gallery.title}", actor=${actor.id}`,
    );

    return { deleted: true, id };
  }

  // ==================== Photo Management ====================

  /**
   * 갤러리에 사진 추가 (단일).
   */
  async addPhotos(
    galleryId: string,
    photos: PhotoItemDto[],
    uploaderId: string,
  ) {
    // 갤러리 존재 확인
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
      select: { id: true },
    });

    if (!gallery) {
      throw new NotFoundException("갤러리를 찾을 수 없습니다.");
    }

    const created = await this.prisma.galleryPhoto.createMany({
      data: photos.map((photo, index) => ({
        galleryId,
        uploaderId,
        photoUrl: photo.photoUrl,
        thumbnailUrl: photo.thumbnailUrl,
        caption: photo.caption,
        takenAt: photo.takenAt ? new Date(photo.takenAt) : null,
        sortOrder: photo.sortOrder ?? index,
      })),
    });

    this.logger.log(
      `사진 추가 완료: galleryId=${galleryId}, count=${created.count}, uploaderId=${uploaderId}`,
    );

    return { galleryId, addedCount: created.count };
  }

  /**
   * 갤러리에서 사진 개별 삭제.
   *
   * - ADMIN / DIRECTOR: 모든 사진 삭제 가능
   * - COACH: 본인이 업로드한 사진 또는 본인 갤러리의 사진만 삭제 가능
   */
  async removePhoto(
    galleryId: string,
    photoId: string,
    actor: { id: string; userType: string },
  ) {
    const photo = await this.prisma.galleryPhoto.findFirst({
      where: { id: photoId, galleryId },
      select: {
        id: true,
        uploaderId: true,
        gallery: { select: { coachId: true } },
      },
    });

    if (!photo) {
      throw new NotFoundException("해당 갤러리에서 사진을 찾을 수 없습니다.");
    }

    const isAdmin = GALLERY_ADMIN_ROLES.has(actor.userType.toUpperCase());
    const isUploader = photo.uploaderId === actor.id;
    const isGalleryOwner = photo.gallery.coachId === actor.id;

    if (!isAdmin && !isUploader && !isGalleryOwner) {
      throw new ForbiddenException("이 사진을 삭제할 권한이 없습니다.");
    }

    await this.prisma.galleryPhoto.delete({ where: { id: photoId } });

    this.logger.log(
      `사진 삭제 완료: photoId=${photoId}, galleryId=${galleryId}, actor=${actor.id}`,
    );

    return { deleted: true, photoId };
  }

  /**
   * 다중 사진 일괄 추가.
   *
   * addPhotos 메서드를 재사용.
   */
  async bulkAddPhotos(
    galleryId: string,
    photos: PhotoItemDto[],
    uploaderId: string,
  ) {
    return this.addPhotos(galleryId, photos, uploaderId);
  }

  /**
   * 앨범(Gallery)에 속한 사진 목록 조회 (페이징).
   *
   * - galleryId 로 필터
   * - 정렬: 최신 생성순 (createdAt DESC)
   * - N+1 방지: select 로 필요한 필드만 명시
   */
  async getAlbumPhotos(
    galleryId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    data: {
      id: string;
      galleryId: string;
      photoUrl: string;
      thumbnailUrl: string;
      caption: string | null;
      takenAt: Date | null;
      sortOrder: number;
      uploaderId: string;
      createdAt: Date;
      uploader: { id: string; firstName: string; lastName: string };
    }[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const skip = (page - 1) * pageSize;

    // 갤러리 존재 여부 확인
    const gallery = await this.prisma.gallery.findUnique({
      where: { id: galleryId },
      select: { id: true },
    });

    if (!gallery) {
      throw new NotFoundException("갤러리를 찾을 수 없습니다.");
    }

    const [data, total] = await Promise.all([
      this.prisma.galleryPhoto.findMany({
        where: { galleryId },
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          galleryId: true,
          photoUrl: true,
          thumbnailUrl: true,
          caption: true,
          takenAt: true,
          sortOrder: true,
          uploaderId: true,
          createdAt: true,
          uploader: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.galleryPhoto.count({ where: { galleryId } }),
    ]);

    return { data, total, page, pageSize };
  }
}
