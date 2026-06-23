import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  CreateMainPopupDto,
  UpdateMainPopupDto,
} from "./dto/create-main-popup.dto";

@Injectable()
export class MainPopupsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 활성 팝업 목록 조회 (공개 API)
   * - isActive: true
   * - startAt <= now <= endAt
   * - userType이 지정된 경우 targetRolesJson에 포함된 것만 필터
   */
  async getActive(userType?: string) {
    const now = new Date();

    const popups = await this.prisma.appBanner.findMany({
      where: {
        isActive: true,
        startAt: { lte: now },
        endAt: { gte: now },
      },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        linkUrl: true,
        linkType: true,
        targetRolesJson: true,
        sortOrder: true,
        isActive: true,
        startAt: true,
        endAt: true,
        createdAt: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    if (!userType) {
      return popups;
    }

    // targetRolesJson 기반 필터링
    return popups.filter((popup) => {
      try {
        const roles = popup.targetRolesJson as string[];
        if (!Array.isArray(roles) || roles.length === 0) {
          return true; // 역할 미지정이면 전체 대상
        }
        return roles.includes(userType);
      } catch {
        return true;
      }
    });
  }

  /**
   * 관리자: 전체 팝업 목록 조회 (상태 필터 포함)
   */
  async findAll(isActive?: boolean) {
    const where: Record<string, unknown> = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    return this.prisma.appBanner.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
  }

  /**
   * 관리자: 팝업 생성
   */
  async create(dto: CreateMainPopupDto) {
    if (new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException("종료일시는 시작일시보다 이후여야 합니다.");
    }

    return this.prisma.appBanner.create({
      data: {
        title: dto.title,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl ?? null,
        linkType: dto.linkType.toLowerCase(),
        targetRolesJson: dto.targetRoles,
        sortOrder: dto.sortOrder ?? 0,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        isActive: true,
      },
    });
  }

  /**
   * 관리자: 팝업 수정
   */
  async update(id: string, dto: UpdateMainPopupDto) {
    const existing = await this.prisma.appBanner.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("팝업을 찾을 수 없습니다.");
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;

    if (startAt && endAt && endAt <= startAt) {
      throw new BadRequestException("종료일시는 시작일시보다 이후여야 합니다.");
    }

    const data: Record<string, unknown> = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.linkUrl !== undefined) data.linkUrl = dto.linkUrl;
    if (dto.linkType !== undefined) data.linkType = dto.linkType.toLowerCase();
    if (dto.targetRoles !== undefined) data.targetRolesJson = dto.targetRoles;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.startAt !== undefined) data.startAt = new Date(dto.startAt);
    if (dto.endAt !== undefined) data.endAt = new Date(dto.endAt);

    return this.prisma.appBanner.update({
      where: { id },
      data,
    });
  }

  /**
   * 관리자: 팝업 활성/비활성 토글
   */
  async toggle(id: string, isActive: boolean) {
    const existing = await this.prisma.appBanner.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("팝업을 찾을 수 없습니다.");
    }

    return this.prisma.appBanner.update({
      where: { id },
      data: { isActive },
    });
  }

  /**
   * 관리자: 팝업 삭제
   */
  async remove(id: string) {
    const existing = await this.prisma.appBanner.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("팝업을 찾을 수 없습니다.");
    }

    return this.prisma.appBanner.delete({ where: { id } });
  }
}
