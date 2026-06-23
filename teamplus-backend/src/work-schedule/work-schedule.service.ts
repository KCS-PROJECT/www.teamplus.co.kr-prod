import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateWorkScheduleDto } from "./dto/create-work-schedule.dto";
import { CreateSwapRequestDto } from "./dto/create-swap-request.dto";
import { ReviewSwapRequestDto } from "./dto/review-swap-request.dto";

@Injectable()
export class WorkScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 스케줄 생성
   */
  async create(dto: CreateWorkScheduleDto) {
    const schedule = await this.prisma.workSchedule.create({
      data: {
        coachId: dto.coachId,
        teamId: dto.teamId,
        classId: dto.classId,
        scheduleDate: new Date(dto.scheduleDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        title: dto.title,
        location: dto.location,
        notes: dto.notes,
      },
      select: {
        id: true,
        coachId: true,
        teamId: true,
        classId: true,
        scheduleDate: true,
        startTime: true,
        endTime: true,
        title: true,
        location: true,
        status: true,
        notes: true,
        createdAt: true,
      },
    });

    return { message: "스케줄이 생성되었습니다.", schedule };
  }

  /**
   * 클럽 전체 스케줄 조회
   */
  async getClubSchedules(
    teamId: string,
    query: { startDate: string; endDate: string; coachId?: string },
  ) {
    const where: Record<string, unknown> = {
      teamId,
      scheduleDate: {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      },
    };
    if (query.coachId) {
      where.coachId = query.coachId;
    }

    const schedules = await this.prisma.workSchedule.findMany({
      where,
      orderBy: [{ scheduleDate: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        scheduleDate: true,
        startTime: true,
        endTime: true,
        title: true,
        location: true,
        status: true,
        notes: true,
        coach: {
          select: { id: true, firstName: true, lastName: true },
        },
        class: {
          select: { id: true, className: true },
        },
      },
    });

    return schedules;
  }

  /**
   * 내 스케줄 조회
   */
  async getMySchedules(
    coachId: string,
    query: { startDate: string; endDate: string },
  ) {
    const schedules = await this.prisma.workSchedule.findMany({
      where: {
        coachId,
        scheduleDate: {
          gte: new Date(query.startDate),
          lte: new Date(query.endDate),
        },
      },
      orderBy: [{ scheduleDate: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        scheduleDate: true,
        startTime: true,
        endTime: true,
        title: true,
        location: true,
        status: true,
        notes: true,
        team: {
          select: { id: true, name: true },
        },
        class: {
          select: { id: true, className: true },
        },
      },
    });

    return schedules;
  }

  /**
   * 스케줄 수정
   */
  async update(id: string, dto: Partial<CreateWorkScheduleDto>) {
    const existing = await this.prisma.workSchedule.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("스케줄을 찾을 수 없습니다.");
    }

    const data: Record<string, unknown> = {};
    if (dto.coachId !== undefined) data.coachId = dto.coachId;
    if (dto.classId !== undefined) data.classId = dto.classId;
    if (dto.scheduleDate) data.scheduleDate = new Date(dto.scheduleDate);
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.endTime !== undefined) data.endTime = dto.endTime;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const schedule = await this.prisma.workSchedule.update({
      where: { id },
      data,
      select: {
        id: true,
        coachId: true,
        teamId: true,
        classId: true,
        scheduleDate: true,
        startTime: true,
        endTime: true,
        title: true,
        location: true,
        status: true,
        notes: true,
        updatedAt: true,
      },
    });

    return { message: "스케줄이 수정되었습니다.", schedule };
  }

  /**
   * 스케줄 삭제
   */
  async delete(id: string) {
    const existing = await this.prisma.workSchedule.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("스케줄을 찾을 수 없습니다.");
    }

    await this.prisma.workSchedule.delete({ where: { id } });

    return { message: "스케줄이 삭제되었습니다." };
  }

  // ============ Swap Requests ============

  /**
   * 변경 요청 생성
   */
  async createSwapRequest(dto: CreateSwapRequestDto, requesterId: string) {
    const schedule = await this.prisma.workSchedule.findUnique({
      where: { id: dto.scheduleId },
      select: { id: true, coachId: true, status: true },
    });
    if (!schedule) {
      throw new NotFoundException("스케줄을 찾을 수 없습니다.");
    }
    if (schedule.coachId !== requesterId) {
      throw new BadRequestException("본인의 스케줄만 변경 요청할 수 있습니다.");
    }
    if (schedule.status === "cancelled") {
      throw new BadRequestException("취소된 스케줄은 변경 요청할 수 없습니다.");
    }

    const swapRequest = await this.prisma.scheduleSwapRequest.create({
      data: {
        scheduleId: dto.scheduleId,
        requesterId,
        targetCoachId: dto.targetCoachId,
        reason: dto.reason,
      },
      select: {
        id: true,
        scheduleId: true,
        requesterId: true,
        targetCoachId: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    });

    return { message: "변경 요청이 생성되었습니다.", swapRequest };
  }

  /**
   * 클럽별 변경 요청 목록
   */
  async getSwapRequests(teamId: string) {
    const requests = await this.prisma.scheduleSwapRequest.findMany({
      where: {
        schedule: { teamId },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
        respondedAt: true,
        schedule: {
          select: {
            id: true,
            scheduleDate: true,
            startTime: true,
            endTime: true,
            title: true,
          },
        },
        requester: {
          select: { id: true, firstName: true, lastName: true },
        },
        targetCoach: {
          select: { id: true, firstName: true, lastName: true },
        },
        responder: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return requests;
  }

  /**
   * 변경 요청 승인/거부
   */
  async reviewSwapRequest(
    id: string,
    dto: ReviewSwapRequestDto,
    responderId: string,
  ) {
    const request = await this.prisma.scheduleSwapRequest.findUnique({
      where: { id },
      select: { id: true, status: true, scheduleId: true },
    });
    if (!request) {
      throw new NotFoundException("변경 요청을 찾을 수 없습니다.");
    }
    if (request.status !== "pending") {
      throw new BadRequestException("이미 처리된 요청입니다.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.scheduleSwapRequest.update({
        where: { id },
        data: {
          status: dto.status,
          respondedBy: responderId,
          respondedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          respondedAt: true,
        },
      });

      // 승인 시 스케줄 상태를 swapped로 변경
      if (dto.status === "approved") {
        await tx.workSchedule.update({
          where: { id: request.scheduleId },
          data: { status: "swapped" },
        });
      }

      return updated;
    });

    const statusText = dto.status === "approved" ? "승인" : "거부";
    return {
      message: `변경 요청이 ${statusText}되었습니다.`,
      swapRequest: result,
    };
  }
}
