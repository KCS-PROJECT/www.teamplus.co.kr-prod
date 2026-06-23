import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateClassDiaryDto } from "./dto/create-class-diary.dto";
import { UpdateClassDiaryDto } from "./dto/update-class-diary.dto";

@Injectable()
export class ClassDiaryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 수업 일지 작성
   */
  async create(dto: CreateClassDiaryDto, coachId: string) {
    const diary = await this.prisma.classDiary.create({
      data: {
        classId: dto.classId,
        teamId: dto.teamId,
        coachId,
        sessionDate: new Date(dto.sessionDate),
        mainFocus: dto.mainFocus,
        drillDesc: dto.drillDesc,
        intensityLevel: dto.intensityLevel ?? "medium",
        presentCount: dto.presentCount,
        absentCount: dto.absentCount,
        totalCount: dto.totalCount,
        coachNotes: dto.coachNotes,
      },
      select: {
        id: true,
        classId: true,
        teamId: true,
        coachId: true,
        sessionDate: true,
        mainFocus: true,
        drillDesc: true,
        intensityLevel: true,
        presentCount: true,
        absentCount: true,
        totalCount: true,
        coachNotes: true,
        isPublished: true,
        createdAt: true,
      },
    });

    return { message: "수업 일지가 작성되었습니다.", diary };
  }

  /**
   * 수업별 일지 목록 (페이지네이션)
   */
  async getByClass(
    classId: string,
    query: {
      page: number;
      limit: number;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const { page, limit, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { classId };
    if (startDate || endDate) {
      where.sessionDate = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.classDiary.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sessionDate: "desc" },
        select: {
          id: true,
          sessionDate: true,
          mainFocus: true,
          intensityLevel: true,
          presentCount: true,
          absentCount: true,
          totalCount: true,
          isPublished: true,
          createdAt: true,
          coach: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.classDiary.count({ where }),
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
   * 일지 상세
   */
  async getById(id: string) {
    const diary = await this.prisma.classDiary.findUnique({
      where: { id },
      select: {
        id: true,
        classId: true,
        teamId: true,
        coachId: true,
        sessionDate: true,
        mainFocus: true,
        drillDesc: true,
        intensityLevel: true,
        presentCount: true,
        absentCount: true,
        totalCount: true,
        coachNotes: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        coach: {
          select: { id: true, firstName: true, lastName: true },
        },
        class: {
          select: { id: true, className: true },
        },
      },
    });

    if (!diary) {
      throw new NotFoundException("수업 일지를 찾을 수 없습니다.");
    }

    return diary;
  }

  /**
   * 일지 수정
   */
  async update(id: string, dto: UpdateClassDiaryDto) {
    const existing = await this.prisma.classDiary.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("수업 일지를 찾을 수 없습니다.");
    }

    const data: Record<string, unknown> = {};
    if (dto.sessionDate) data.sessionDate = new Date(dto.sessionDate);
    if (dto.mainFocus !== undefined) data.mainFocus = dto.mainFocus;
    if (dto.drillDesc !== undefined) data.drillDesc = dto.drillDesc;
    if (dto.intensityLevel !== undefined)
      data.intensityLevel = dto.intensityLevel;
    if (dto.presentCount !== undefined) data.presentCount = dto.presentCount;
    if (dto.absentCount !== undefined) data.absentCount = dto.absentCount;
    if (dto.totalCount !== undefined) data.totalCount = dto.totalCount;
    if (dto.coachNotes !== undefined) data.coachNotes = dto.coachNotes;

    const diary = await this.prisma.classDiary.update({
      where: { id },
      data,
      select: {
        id: true,
        classId: true,
        teamId: true,
        sessionDate: true,
        mainFocus: true,
        drillDesc: true,
        intensityLevel: true,
        presentCount: true,
        absentCount: true,
        totalCount: true,
        coachNotes: true,
        isPublished: true,
        updatedAt: true,
      },
    });

    return { message: "수업 일지가 수정되었습니다.", diary };
  }

  /**
   * 일지 공개 처리
   */
  async publish(id: string) {
    const existing = await this.prisma.classDiary.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("수업 일지를 찾을 수 없습니다.");
    }

    const diary = await this.prisma.classDiary.update({
      where: { id },
      data: { isPublished: true },
      select: {
        id: true,
        isPublished: true,
        updatedAt: true,
      },
    });

    return { message: "수업 일지가 공개되었습니다.", diary };
  }

  /**
   * 일지 삭제
   */
  async delete(id: string) {
    const existing = await this.prisma.classDiary.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("수업 일지를 찾을 수 없습니다.");
    }

    await this.prisma.classDiary.delete({ where: { id } });

    return { message: "수업 일지가 삭제되었습니다." };
  }
}
