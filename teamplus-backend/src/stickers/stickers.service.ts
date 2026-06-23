import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateStickerBoardDto } from "./dto/create-sticker-board.dto";
import { AwardStickerDto } from "./dto/award-sticker.dto";

@Injectable()
export class StickersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 스티커판 생성 + goalCount개의 빈 슬롯 일괄 생성
   */
  async createBoard(dto: CreateStickerBoardDto, _creatorId: string) {
    // 아이 존재 확인
    const child = await this.prisma.user.findUnique({
      where: { id: dto.childId },
      select: { id: true, userType: true },
    });
    if (!child) {
      throw new NotFoundException("아이를 찾을 수 없습니다.");
    }

    // 클럽 존재 확인
    const club = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
      select: { id: true },
    });
    if (!club) {
      throw new NotFoundException("클럽을 찾을 수 없습니다.");
    }

    // 트랜잭션: 스티커판 + 빈 슬롯 일괄 생성
    const board = await this.prisma.$transaction(async (tx) => {
      const newBoard = await tx.stickerBoard.create({
        data: {
          childId: dto.childId,
          teamId: dto.teamId,
          title: dto.title ?? "칭찬 스티커판",
          goalCount: dto.goalCount,
          rewardName: dto.rewardName,
        },
        select: {
          id: true,
          childId: true,
          teamId: true,
          title: true,
          goalCount: true,
          rewardName: true,
          isCompleted: true,
          createdAt: true,
        },
      });

      // goalCount개의 빈 슬롯 생성
      const slotData = Array.from({ length: dto.goalCount }, (_, i) => ({
        boardId: newBoard.id,
        slotNumber: i + 1,
      }));

      await tx.stickerSlot.createMany({ data: slotData });

      return newBoard;
    });

    return {
      message: "스티커판이 생성되었습니다.",
      board,
    };
  }

  /**
   * 아이의 스티커판 목록 조회
   */
  async getBoardsByChild(childId: string) {
    const boards = await this.prisma.stickerBoard.findMany({
      where: { childId, isActive: true },
      select: {
        id: true,
        title: true,
        goalCount: true,
        rewardName: true,
        isCompleted: true,
        completedAt: true,
        createdAt: true,
        _count: {
          select: {
            slots: true,
          },
        },
        slots: {
          where: { isEarned: true },
          select: { id: true },
        },
      },
      orderBy: [{ isCompleted: "asc" }, { createdAt: "desc" }],
    });

    return boards.map((board) => ({
      id: board.id,
      title: board.title,
      goalCount: board.goalCount,
      rewardName: board.rewardName,
      isCompleted: board.isCompleted,
      completedAt: board.completedAt,
      createdAt: board.createdAt,
      earnedCount: board.slots.length,
      totalSlots: board._count.slots,
    }));
  }

  /**
   * 스티커판 상세 + 슬롯 조회
   */
  async getBoardDetail(boardId: string) {
    const board = await this.prisma.stickerBoard.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        childId: true,
        teamId: true,
        title: true,
        goalCount: true,
        rewardName: true,
        isCompleted: true,
        completedAt: true,
        createdAt: true,
        child: {
          select: { id: true, firstName: true, lastName: true },
        },
        team: {
          select: { id: true, name: true },
        },
        slots: {
          select: {
            id: true,
            slotNumber: true,
            stickerType: true,
            isEarned: true,
            earnedAt: true,
            earnedReason: true,
            awardedBy: true,
          },
          orderBy: { slotNumber: "asc" },
        },
      },
    });

    if (!board) {
      throw new NotFoundException("스티커판을 찾을 수 없습니다.");
    }

    return board;
  }

  /**
   * 스티커 부여 - 다음 빈 슬롯에 채움, 마지막이면 자동 완료
   */
  async awardSticker(boardId: string, dto: AwardStickerDto, awarderId: string) {
    const board = await this.prisma.stickerBoard.findUnique({
      where: { id: boardId },
      select: { id: true, goalCount: true, isCompleted: true, isActive: true },
    });

    if (!board) {
      throw new NotFoundException("스티커판을 찾을 수 없습니다.");
    }

    if (!board.isActive) {
      throw new NotFoundException("비활성화된 스티커판입니다.");
    }

    if (board.isCompleted) {
      throw new ConflictException("이미 완료된 스티커판입니다.");
    }

    // 다음 빈 슬롯 찾기 (slotNumber 오름차순)
    const nextSlot = await this.prisma.stickerSlot.findFirst({
      where: { boardId, isEarned: false },
      orderBy: { slotNumber: "asc" },
      select: { id: true, slotNumber: true },
    });

    if (!nextSlot) {
      throw new ConflictException("모든 슬롯이 이미 채워져 있습니다.");
    }

    // 마지막 슬롯인지 확인
    const remainingEmpty = await this.prisma.stickerSlot.count({
      where: { boardId, isEarned: false },
    });
    const isLastSlot = remainingEmpty === 1;

    // 트랜잭션: 슬롯 채움 + (마지막이면) 보드 완료 처리
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedSlot = await tx.stickerSlot.update({
        where: { id: nextSlot.id },
        data: {
          stickerType: dto.stickerType,
          isEarned: true,
          earnedAt: new Date(),
          earnedReason: dto.earnedReason,
          awardedBy: awarderId,
        },
        select: {
          id: true,
          slotNumber: true,
          stickerType: true,
          isEarned: true,
          earnedAt: true,
          earnedReason: true,
        },
      });

      let boardCompleted = false;
      if (isLastSlot) {
        await tx.stickerBoard.update({
          where: { id: boardId },
          data: {
            isCompleted: true,
            completedAt: new Date(),
          },
        });
        boardCompleted = true;
      }

      return { slot: updatedSlot, boardCompleted };
    });

    return {
      message: result.boardCompleted
        ? "스티커판이 완성되었습니다! 보상을 받을 수 있습니다."
        : "스티커가 부여되었습니다.",
      slot: result.slot,
      boardCompleted: result.boardCompleted,
    };
  }

  /**
   * 스티커판 전체 초기화
   */
  async resetBoard(boardId: string) {
    const board = await this.prisma.stickerBoard.findUnique({
      where: { id: boardId },
      select: { id: true, isActive: true },
    });

    if (!board) {
      throw new NotFoundException("스티커판을 찾을 수 없습니다.");
    }

    await this.prisma.$transaction(async (tx) => {
      // 모든 슬롯 초기화
      await tx.stickerSlot.updateMany({
        where: { boardId },
        data: {
          stickerType: null,
          isEarned: false,
          earnedAt: null,
          earnedReason: null,
          awardedBy: null,
        },
      });

      // 보드 완료 상태 초기화
      await tx.stickerBoard.update({
        where: { id: boardId },
        data: {
          isCompleted: false,
          completedAt: null,
        },
      });
    });

    return { message: "스티커판이 초기화되었습니다." };
  }
}
