import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateCodeGroupDto,
  UpdateCodeGroupDto,
  CreateCommonCodeDto,
  UpdateCommonCodeDto,
} from "./dto/common-code.dto";

@Injectable()
export class CommonCodesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== CodeGroup CRUD ====================

  async findAllGroups(search?: string) {
    const where: Prisma.CommonCodeGroupWhereInput = {};
    if (search) {
      where.OR = [
        { groupCode: { contains: search, mode: "insensitive" } },
        { groupName: { contains: search } },
      ];
    }

    return this.prisma.commonCodeGroup.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { codes: true } },
      },
    });
  }

  async findOneGroup(id: string) {
    const group = await this.prisma.commonCodeGroup.findUnique({
      where: { id },
      include: {
        _count: { select: { codes: true } },
      },
    });
    if (!group) {
      throw new NotFoundException("코드 그룹을 찾을 수 없습니다.");
    }
    return group;
  }

  async createGroup(userId: string, dto: CreateCodeGroupDto) {
    const existing = await this.prisma.commonCodeGroup.findUnique({
      where: { groupCode: dto.groupCode },
    });
    if (existing) {
      throw new ConflictException(
        `이미 존재하는 그룹 코드입니다: ${dto.groupCode}`,
      );
    }

    return this.prisma.commonCodeGroup.create({
      data: {
        groupCode: dto.groupCode,
        groupName: dto.groupName,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: userId,
      },
      include: {
        _count: { select: { codes: true } },
      },
    });
  }

  async updateGroup(userId: string, id: string, dto: UpdateCodeGroupDto) {
    await this.findOneGroup(id);

    return this.prisma.commonCodeGroup.update({
      where: { id },
      data: {
        ...(dto.groupName !== undefined && { groupName: dto.groupName }),
        ...(dto.description !== undefined && {
          description: dto.description || null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        updatedById: userId,
      },
      include: {
        _count: { select: { codes: true } },
      },
    });
  }

  async removeGroup(id: string) {
    const group = await this.prisma.commonCodeGroup.findUnique({
      where: { id },
      include: { _count: { select: { codes: true } } },
    });
    if (!group) {
      throw new NotFoundException("코드 그룹을 찾을 수 없습니다.");
    }

    // 그룹 내 코드 전부 삭제 후 그룹 삭제
    await this.prisma.$transaction([
      this.prisma.commonCode.deleteMany({ where: { groupId: id } }),
      this.prisma.commonCodeGroup.delete({ where: { id } }),
    ]);

    return { message: `코드 그룹 "${group.groupName}"이 삭제되었습니다.` };
  }

  // ==================== CommonCode CRUD ====================

  async findAllCodes(groupId?: string, parentId?: string, search?: string) {
    const where: Prisma.CommonCodeWhereInput = {};
    if (groupId) where.groupId = groupId;
    if (parentId !== undefined) {
      where.parentId = parentId === "null" ? null : parentId;
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search } },
      ];
    }

    return this.prisma.commonCode.findMany({
      where,
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    });
  }

  async findOneCode(id: string) {
    const code = await this.prisma.commonCode.findUnique({
      where: { id },
      include: {
        children: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!code) {
      throw new NotFoundException("코드를 찾을 수 없습니다.");
    }
    return code;
  }

  async createCode(userId: string, dto: CreateCommonCodeDto) {
    // 그룹 존재 확인
    const group = await this.prisma.commonCodeGroup.findUnique({
      where: { id: dto.groupId },
    });
    if (!group) {
      throw new NotFoundException("코드 그룹을 찾을 수 없습니다.");
    }

    // 그룹 내 코드 중복 확인
    const existing = await this.prisma.commonCode.findUnique({
      where: { groupId_code: { groupId: dto.groupId, code: dto.code } },
    });
    if (existing) {
      throw new ConflictException(
        `이미 존재하는 코드입니다: ${dto.code} (그룹: ${group.groupCode})`,
      );
    }

    // 레벨 자동 계산
    let level = dto.level ?? 1;
    if (dto.parentId) {
      const parent = await this.prisma.commonCode.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException("상위 코드를 찾을 수 없습니다.");
      }
      level = parent.level + 1;
      if (level > 4) {
        throw new BadRequestException(
          "최대 4단계(세부)까지만 생성할 수 있습니다.",
        );
      }
    }

    return this.prisma.commonCode.create({
      data: {
        groupId: dto.groupId,
        parentId: dto.parentId ?? null,
        level,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        value1: dto.value1 ?? null,
        value2: dto.value2 ?? null,
        value3: dto.value3 ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        createdById: userId,
      },
    });
  }

  async updateCode(userId: string, id: string, dto: UpdateCommonCodeDto) {
    const code = await this.findOneCode(id);

    // 코드값 변경 시 중복 체크
    if (dto.code && dto.code !== code.code) {
      const existing = await this.prisma.commonCode.findUnique({
        where: {
          groupId_code: { groupId: code.groupId, code: dto.code },
        },
      });
      if (existing) {
        throw new ConflictException(`이미 존재하는 코드입니다: ${dto.code}`);
      }
    }

    return this.prisma.commonCode.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && {
          description: dto.description || null,
        }),
        ...(dto.value1 !== undefined && { value1: dto.value1 || null }),
        ...(dto.value2 !== undefined && { value2: dto.value2 || null }),
        ...(dto.value3 !== undefined && { value3: dto.value3 || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        updatedById: userId,
      },
    });
  }

  async removeCode(id: string) {
    const code = await this.prisma.commonCode.findUnique({
      where: { id },
      include: { _count: { select: { children: true } } },
    });
    if (!code) {
      throw new NotFoundException("코드를 찾을 수 없습니다.");
    }

    // 하위 코드가 있으면 재귀 삭제
    if (code._count.children > 0) {
      await this.deleteCodeRecursive(id);
    } else {
      await this.prisma.commonCode.delete({ where: { id } });
    }

    return { message: `코드 "${code.code} (${code.name})"이 삭제되었습니다.` };
  }

  private async deleteCodeRecursive(parentId: string) {
    const children = await this.prisma.commonCode.findMany({
      where: { parentId },
      select: { id: true },
    });

    for (const child of children) {
      await this.deleteCodeRecursive(child.id);
    }

    await this.prisma.commonCode.delete({ where: { id: parentId } });
  }
}
