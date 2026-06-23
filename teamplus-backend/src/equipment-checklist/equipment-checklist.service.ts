import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateChecklistDto } from "./dto/create-checklist.dto";

@Injectable()
export class EquipmentChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 체크리스트 생성 (아이템 일괄 생성)
   */
  async createChecklist(dto: CreateChecklistDto, userId: string) {
    const checklist = await this.prisma.$transaction(async (tx) => {
      const created = await tx.equipmentChecklist.create({
        data: {
          userId,
          classId: dto.classId,
          teamId: dto.teamId,
          title: dto.title ?? "가방 챙기기",
          totalItems: dto.items.length,
          checkedItems: 0,
        },
        select: {
          id: true,
          title: true,
          totalItems: true,
          createdAt: true,
        },
      });

      const itemData = dto.items.map((item, index) => ({
        checklistId: created.id,
        itemName: item.itemName,
        iconName: item.iconName,
        imageUrl: item.imageUrl,
        sortOrder: item.sortOrder ?? index,
      }));

      await tx.checklistItem.createMany({ data: itemData });

      return created;
    });

    return {
      message: "체크리스트가 생성되었습니다.",
      checklist,
    };
  }

  /**
   * 내 체크리스트 목록 조회
   */
  async getMyChecklists(userId: string) {
    return this.prisma.equipmentChecklist.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        totalItems: true,
        checkedItems: true,
        isCompleted: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: [{ isCompleted: "asc" }, { createdAt: "desc" }],
    });
  }

  /**
   * 체크리스트 상세 조회 (아이템 포함)
   */
  async getChecklistDetail(id: string, userId: string) {
    const checklist = await this.prisma.equipmentChecklist.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        title: true,
        totalItems: true,
        checkedItems: true,
        isCompleted: true,
        completedAt: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            itemName: true,
            iconName: true,
            imageUrl: true,
            isChecked: true,
            checkedAt: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!checklist) {
      throw new NotFoundException("체크리스트를 찾을 수 없습니다.");
    }

    if (checklist.userId !== userId) {
      throw new ForbiddenException("본인의 체크리스트만 조회할 수 있습니다.");
    }

    return checklist;
  }

  /**
   * 체크 항목 토글
   */
  async toggleItem(itemId: string, userId: string) {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        isChecked: true,
        checklist: {
          select: { id: true, userId: true, totalItems: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException("항목을 찾을 수 없습니다.");
    }

    if (item.checklist.userId !== userId) {
      throw new ForbiddenException(
        "본인의 체크리스트 항목만 수정할 수 있습니다.",
      );
    }

    const newChecked = !item.isChecked;

    const result = await this.prisma.$transaction(async (tx) => {
      // 항목 토글
      const updatedItem = await tx.checklistItem.update({
        where: { id: itemId },
        data: {
          isChecked: newChecked,
          checkedAt: newChecked ? new Date() : null,
        },
        select: {
          id: true,
          itemName: true,
          isChecked: true,
          checkedAt: true,
        },
      });

      // 체크된 항목 수 재계산
      const checkedCount = await tx.checklistItem.count({
        where: { checklistId: item.checklist.id, isChecked: true },
      });

      const isCompleted = checkedCount === item.checklist.totalItems;

      // 체크리스트 상태 업데이트
      await tx.equipmentChecklist.update({
        where: { id: item.checklist.id },
        data: {
          checkedItems: checkedCount,
          isCompleted,
          completedAt: isCompleted ? new Date() : null,
        },
      });

      return { item: updatedItem, checkedCount, isCompleted };
    });

    return {
      message: result.item.isChecked
        ? "체크되었습니다."
        : "체크가 해제되었습니다.",
      item: result.item,
      checkedItems: result.checkedCount,
      totalItems: item.checklist.totalItems,
      isCompleted: result.isCompleted,
    };
  }

  /**
   * 체크리스트 전체 초기화
   */
  async resetChecklist(id: string, userId: string) {
    const checklist = await this.prisma.equipmentChecklist.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!checklist) {
      throw new NotFoundException("체크리스트를 찾을 수 없습니다.");
    }

    if (checklist.userId !== userId) {
      throw new ForbiddenException("본인의 체크리스트만 초기화할 수 있습니다.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.checklistItem.updateMany({
        where: { checklistId: id },
        data: {
          isChecked: false,
          checkedAt: null,
        },
      });

      await tx.equipmentChecklist.update({
        where: { id },
        data: {
          checkedItems: 0,
          isCompleted: false,
          completedAt: null,
        },
      });
    });

    return { message: "체크리스트가 초기화되었습니다." };
  }

  /**
   * 체크리스트 삭제 (Cascade로 아이템도 함께 삭제)
   */
  async deleteChecklist(id: string, userId: string) {
    const checklist = await this.prisma.equipmentChecklist.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!checklist) {
      throw new NotFoundException("체크리스트를 찾을 수 없습니다.");
    }

    if (checklist.userId !== userId) {
      throw new ForbiddenException("본인의 체크리스트만 삭제할 수 있습니다.");
    }

    await this.prisma.equipmentChecklist.delete({ where: { id } });

    return { message: "체크리스트가 삭제되었습니다." };
  }
}
