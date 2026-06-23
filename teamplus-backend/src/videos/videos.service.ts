import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";
import { CreateVideoDto } from "./dto/create-video.dto";
import { UpdateVideoDto } from "./dto/update-video.dto";
import { unlink } from "fs/promises";
import { basename, resolve } from "path";
import { getCategoryDir } from "@/common/upload-paths";

// 안전한 업로드 디렉토리 경로 — UPLOAD_ROOT env 가 적용된 단일 진입점.
const UPLOAD_DIR = getCategoryDir("videos");
const ALLOWED_VIDEO_PREFIX = "/uploads/videos/";

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly viewCounter: ViewCounterService,
  ) {}

  /**
   * 영상 경로 보안 검증 및 안전한 파일 경로 반환
   * Path Traversal 공격 방어
   */
  private validateAndGetSafeVideoPath(videoUrl: string): string | null {
    // 1. uploads/videos로 시작하는지 확인
    if (!videoUrl.startsWith(ALLOWED_VIDEO_PREFIX)) {
      this.logger.warn(`잘못된 영상 경로 시도: ${videoUrl}`);
      return null;
    }

    // 2. 파일명만 추출하여 경로 순회 방지
    const filename = basename(videoUrl);

    // 3. 파일명에 경로 구분자가 없는지 확인
    if (
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("..")
    ) {
      this.logger.warn(`경로 순회 시도 탐지: ${videoUrl}`);
      return null;
    }

    // 4. 안전한 절대 경로 생성
    const safePath = resolve(UPLOAD_DIR, filename);

    // 5. 최종 경로가 업로드 디렉토리 내에 있는지 확인
    if (!safePath.startsWith(UPLOAD_DIR)) {
      this.logger.warn(`경로 순회 공격 차단: ${videoUrl} -> ${safePath}`);
      return null;
    }

    return safePath;
  }

  /**
   * 안전한 영상 파일 삭제
   */
  private async safeDeleteVideoFile(videoUrl: string): Promise<void> {
    const safePath = this.validateAndGetSafeVideoPath(videoUrl);

    if (!safePath) {
      this.logger.warn(`영상 삭제 스킵 (보안 검증 실패): ${videoUrl}`);
      return;
    }

    try {
      await unlink(safePath);
      this.logger.debug(`영상 파일 삭제 완료: ${safePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.warn(`영상 파일이 존재하지 않음: ${safePath}`);
      } else {
        this.logger.error(`영상 파일 삭제 실패: ${safePath}`, error);
      }
    }
  }

  /**
   * 영상 업로드 + DB 레코드 생성
   */
  async uploadVideo(
    userId: string,
    file: Express.Multer.File,
    dto: CreateVideoDto,
  ) {
    if (!file) {
      throw new BadRequestException("영상 파일이 없습니다.");
    }

    const videoUrl = `/uploads/videos/${file.filename}`;

    const video = await this.prisma.video.create({
      data: {
        uploaderId: userId,
        title: dto.title,
        description: dto.description || null,
        videoUrl,
        teamId: dto.teamId || null,
        videoType: dto.videoType || "training",
        tournamentId: dto.tournamentId || null,
        matchId: dto.matchId || null,
        classId: dto.classId || null,
        isPublic: dto.isPublic ?? false,
        duration: dto.duration || null,
        fileSize: file.size,
        mimeType: file.mimetype,
        status: "ready",
      },
      select: {
        id: true,
        title: true,
        description: true,
        videoUrl: true,
        videoType: true,
        duration: true,
        fileSize: true,
        mimeType: true,
        isPublic: true,
        status: true,
        createdAt: true,
        uploader: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      success: true,
      message: "영상이 성공적으로 업로드되었습니다.",
      data: video,
    };
  }

  /**
   * 영상 소유자 정보 조회 (컨트롤러 선제 권한 검증용)
   */
  async findVideoOwner(
    id: string,
  ): Promise<{ id: string; uploaderId: string } | null> {
    return this.prisma.video.findUnique({
      where: { id },
      select: { id: true, uploaderId: true },
    });
  }

  /**
   * 영상 목록 조회 (필터링 + 페이지네이션)
   */
  async getVideos(filters: {
    teamId?: string;
    videoType?: string;
    tournamentId?: string;
    classId?: string;
    memberId?: string;
    uploaderId?: string;
    status?: string;
    isPublic?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (filters.teamId) {
      where.teamId = filters.teamId;
    }
    if (filters.videoType) {
      where.videoType = filters.videoType;
    }
    if (filters.tournamentId) {
      where.tournamentId = filters.tournamentId;
    }
    if (filters.classId) {
      where.classId = filters.classId;
    }
    if (filters.uploaderId) {
      where.uploaderId = filters.uploaderId;
    }
    // memberId: 해당 회원이 소속된 클럽의 영상 필터링 (확장 용도)
    // 현재는 uploaderId 별칭으로도 동작하도록 지원
    if (filters.memberId && !filters.uploaderId) {
      where.uploaderId = filters.memberId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.isPublic !== undefined) {
      where.isPublic = filters.isPublic;
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          videoUrl: true,
          thumbnailUrl: true,
          videoType: true,
          duration: true,
          fileSize: true,
          isPublic: true,
          viewCount: true,
          status: true,
          createdAt: true,
          uploader: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.video.count({ where }),
    ]);

    return {
      data: videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 영상 상세 조회 + 1일 1회 viewCount 증가
   */
  async getVideoById(id: string, userId?: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        videoUrl: true,
        thumbnailUrl: true,
        videoType: true,
        duration: true,
        fileSize: true,
        mimeType: true,
        isPublic: true,
        viewCount: true,
        status: true,
        matchId: true,
        classId: true,
        createdAt: true,
        updatedAt: true,
        uploader: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userType: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        tournament: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!video) {
      throw new NotFoundException("영상을 찾을 수 없습니다.");
    }

    // 1일 1회 viewCount 증가 (비동기, 응답 블로킹 없음)
    const shouldIncrement = await this.viewCounter.tryIncrement({
      entityType: "video",
      entityId: id,
      userId,
    });

    if (shouldIncrement) {
      this.prisma.video
        .update({
          where: { id },
          data: { viewCount: { increment: 1 } },
        })
        .catch((err: unknown) => {
          this.logger.error(`조회수 증가 실패: ${id}`, err);
        });
    }

    return {
      ...video,
      viewCount: shouldIncrement ? video.viewCount + 1 : video.viewCount,
    };
  }

  /**
   * 영상 정보 수정 (본인 또는 ADMIN/DIRECTOR만)
   */
  async updateVideo(
    id: string,
    userId: string,
    userType: string,
    dto: UpdateVideoDto,
  ) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        uploaderId: true,
        videoUrl: true,
      },
    });

    if (!video) {
      throw new NotFoundException("영상을 찾을 수 없습니다.");
    }

    // 본인 또는 관리자/감독만 수정 가능
    if (
      video.uploaderId !== userId &&
      !["ADMIN", "DIRECTOR"].includes(userType)
    ) {
      throw new ForbiddenException("영상을 수정할 권한이 없습니다.");
    }

    const updated = await this.prisma.video.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.videoType !== undefined && { videoType: dto.videoType }),
        ...(dto.tournamentId !== undefined && {
          tournamentId: dto.tournamentId,
        }),
        ...(dto.matchId !== undefined && { matchId: dto.matchId }),
        ...(dto.classId !== undefined && { classId: dto.classId }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.duration !== undefined && { duration: dto.duration }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      select: {
        id: true,
        title: true,
        description: true,
        videoUrl: true,
        videoType: true,
        duration: true,
        isPublic: true,
        status: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: "영상 정보가 수정되었습니다.",
      data: updated,
    };
  }

  /**
   * 영상 삭제 (본인 또는 ADMIN/DIRECTOR만)
   */
  async deleteVideo(id: string, userId: string, userType: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        uploaderId: true,
        videoUrl: true,
      },
    });

    if (!video) {
      throw new NotFoundException("영상을 찾을 수 없습니다.");
    }

    // 본인 또는 관리자/감독만 삭제 가능
    if (
      video.uploaderId !== userId &&
      !["ADMIN", "DIRECTOR"].includes(userType)
    ) {
      throw new ForbiddenException("영상을 삭제할 권한이 없습니다.");
    }

    // DB 레코드 삭제
    await this.prisma.video.delete({ where: { id } });

    // 파일 삭제 (로컬 업로드인 경우만)
    if (video.videoUrl.startsWith(ALLOWED_VIDEO_PREFIX)) {
      await this.safeDeleteVideoFile(video.videoUrl);
    }

    return {
      success: true,
      message: "영상이 삭제되었습니다.",
    };
  }

  /**
   * 내 업로드 영상 목록
   */
  async getMyVideos(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where: { uploaderId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          videoUrl: true,
          thumbnailUrl: true,
          videoType: true,
          duration: true,
          fileSize: true,
          isPublic: true,
          viewCount: true,
          status: true,
          createdAt: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.video.count({ where: { uploaderId: userId } }),
    ]);

    return {
      data: videos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
