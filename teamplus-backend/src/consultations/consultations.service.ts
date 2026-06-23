import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ConsultationStatus } from "@prisma/client";
import { CreateConsultationDto } from "./dto/create-consultation.dto";
import { UpdateConsultationDto } from "./dto/update-consultation.dto";
import { QueryConsultationsDto } from "./dto/query-consultations.dto";

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 신규 상담 생성 (학부모 전용)
   * ChatRoom(DIRECT) + Consultation 레코드를 트랜잭션으로 묶어 생성.
   * 동일 parent/coach/student 조합이 ACTIVE면 기존 반환.
   */
  async createConsultation(parentId: string, dto: CreateConsultationDto) {
    // 코치 존재 확인
    const coach = await this.prisma.user.findUnique({
      where: { id: dto.coachId },
      select: { id: true, userType: true },
    });
    if (!coach) {
      throw new NotFoundException("존재하지 않는 코치입니다.");
    }
    if (coach.userType !== "COACH") {
      throw new BadRequestException("상담 대상은 코치만 가능합니다.");
    }

    if (dto.coachId === parentId) {
      throw new BadRequestException("자기 자신에게 상담을 요청할 수 없습니다.");
    }

    // 자녀 존재 확인 (선택)
    if (dto.studentId) {
      const student = await this.prisma.user.findUnique({
        where: { id: dto.studentId },
        select: { id: true },
      });
      if (!student) {
        throw new NotFoundException("존재하지 않는 자녀입니다.");
      }
    }

    // 기존 ACTIVE 상담 확인 (parent + coach + student 조합)
    const existing = await this.prisma.consultation.findFirst({
      where: {
        parentId,
        coachId: dto.coachId,
        studentId: dto.studentId ?? null,
        status: ConsultationStatus.ACTIVE,
      },
      select: {
        id: true,
        chatRoomId: true,
        category: true,
        status: true,
        createdAt: true,
      },
    });

    if (existing) {
      return { ...existing, isExisting: true };
    }

    // 트랜잭션: ChatRoom + ChatRoomMember 2명 + Consultation 생성
    const result = await this.prisma.$transaction(async (tx) => {
      // 1) ChatRoom 생성 (DIRECT 타입)
      const chatRoom = await tx.chatRoom.create({
        data: {
          type: "DIRECT",
          category: dto.category ?? "GENERAL",
          members: {
            create: [
              { userId: parentId, role: "member" },
              { userId: dto.coachId, role: "member" },
            ],
          },
        },
        select: { id: true },
      });

      // 2) Consultation 레코드 생성
      const consultation = await tx.consultation.create({
        data: {
          parentId,
          coachId: dto.coachId,
          studentId: dto.studentId,
          chatRoomId: chatRoom.id,
          category: dto.category ?? "GENERAL",
          status: ConsultationStatus.ACTIVE,
        },
        select: {
          id: true,
          chatRoomId: true,
          category: true,
          status: true,
          createdAt: true,
        },
      });

      // 3) 첫 메시지 전송 (선택)
      if (dto.firstMessage) {
        await tx.chatMessage.create({
          data: {
            roomId: chatRoom.id,
            senderId: parentId,
            content: dto.firstMessage,
            type: "TEXT",
            readBy: [parentId],
          },
        });

        // 채팅방 마지막 메시지 업데이트
        await tx.chatRoom.update({
          where: { id: chatRoom.id },
          data: {
            lastMessage: dto.firstMessage.slice(0, 100),
            lastMessageAt: new Date(),
          },
        });

        // 코치 안읽은 메시지 수 증가
        await tx.consultation.update({
          where: { id: consultation.id },
          data: { unreadCountForCoach: 1, lastMessageAt: new Date() },
        });
      }

      return consultation;
    });

    this.logger.log(
      `상담 생성: parent=${parentId}, coach=${dto.coachId}, id=${result.id}`,
    );

    return { ...result, isExisting: false };
  }

  /**
   * 내 상담 목록 조회 (역할별 자동 필터)
   */
  async getMyConsultations(
    userId: string,
    role: string,
    query: QueryConsultationsDto,
  ) {
    const { status, category, page = 1, pageSize = 20 } = query;

    // 역할에 따라 조회 조건 분기
    const isAdmin = ["ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR"].includes(
      role?.toUpperCase(),
    );
    const isCoach = role?.toUpperCase() === "COACH";

    const where: Record<string, unknown> = {};

    if (isAdmin) {
      // 관리자는 전체 조회
    } else if (isCoach) {
      where.coachId = userId;
    } else {
      // PARENT, TEEN 등
      where.parentId = userId;
    }

    if (status) where.status = status;
    if (category) where.category = category;

    const [items, total] = await Promise.all([
      this.prisma.consultation.findMany({
        where,
        orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          category: true,
          status: true,
          lastMessageAt: true,
          unreadCountForParent: true,
          unreadCountForCoach: true,
          createdAt: true,
          chatRoomId: true,
          parent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          coach: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.consultation.count({ where }),
    ]);

    // unreadCount를 역할에 맞게 매핑
    const data = items.map((item) => {
      const unreadCount = isCoach
        ? item.unreadCountForCoach
        : item.unreadCountForParent;

      return {
        id: item.id,
        category: item.category,
        status: item.status,
        lastMessageAt: item.lastMessageAt,
        unreadCount,
        createdAt: item.createdAt,
        chatRoomId: item.chatRoomId,
        parent: {
          id: item.parent.id,
          name:
            `${item.parent.lastName}${item.parent.firstName}`.trim() ||
            "알 수 없음",
        },
        coach: {
          id: item.coach.id,
          name:
            `${item.coach.lastName}${item.coach.firstName}`.trim() ||
            "알 수 없음",
        },
        student: item.student
          ? {
              id: item.student.id,
              name:
                `${item.student.lastName}${item.student.firstName}`.trim() ||
                "알 수 없음",
            }
          : null,
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 상담 상세 조회 (권한 체크 포함)
   */
  async getConsultationById(consultationId: string, userId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        id: true,
        parentId: true,
        coachId: true,
        studentId: true,
        chatRoomId: true,
        category: true,
        status: true,
        lastMessageAt: true,
        unreadCountForParent: true,
        unreadCountForCoach: true,
        createdAt: true,
        closedAt: true,
        parent: {
          select: { id: true, firstName: true, lastName: true },
        },
        coach: {
          select: { id: true, firstName: true, lastName: true },
        },
        student: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!consultation) {
      throw new NotFoundException("상담을 찾을 수 없습니다.");
    }

    // 권한 체크: 본인(parent/coach)만 접근. admin/director는 컨트롤러 @Roles에서 허용됨.
    // 여기서는 parent/coach 본인인지만 확인 (admin/director는 어차피 통과)
    const isParticipant =
      consultation.parentId === userId || consultation.coachId === userId;

    // 사용자가 관리자인지 확인
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });

    const isAdmin = ["ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR"].includes(
      user?.userType?.toUpperCase() ?? "",
    );

    if (!isParticipant && !isAdmin) {
      throw new ForbiddenException("해당 상담에 접근할 권한이 없습니다.");
    }

    return {
      id: consultation.id,
      chatRoomId: consultation.chatRoomId,
      category: consultation.category,
      status: consultation.status,
      lastMessageAt: consultation.lastMessageAt,
      unreadCountForParent: consultation.unreadCountForParent,
      unreadCountForCoach: consultation.unreadCountForCoach,
      createdAt: consultation.createdAt,
      closedAt: consultation.closedAt,
      parent: {
        id: consultation.parent.id,
        name:
          `${consultation.parent.lastName}${consultation.parent.firstName}`.trim() ||
          "알 수 없음",
      },
      coach: {
        id: consultation.coach.id,
        name:
          `${consultation.coach.lastName}${consultation.coach.firstName}`.trim() ||
          "알 수 없음",
      },
      student: consultation.student
        ? {
            id: consultation.student.id,
            name:
              `${consultation.student.lastName}${consultation.student.firstName}`.trim() ||
              "알 수 없음",
          }
        : null,
    };
  }

  /**
   * 상담 정보 수정 (category/status 변경)
   */
  async updateConsultation(
    consultationId: string,
    dto: UpdateConsultationDto,
    userId: string,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { id: true, parentId: true, coachId: true, status: true },
    });

    if (!consultation) {
      throw new NotFoundException("상담을 찾을 수 없습니다.");
    }

    if (consultation.parentId !== userId && consultation.coachId !== userId) {
      throw new ForbiddenException("해당 상담을 수정할 권한이 없습니다.");
    }

    if (consultation.status === ConsultationStatus.CLOSED) {
      throw new BadRequestException("종료된 상담은 수정할 수 없습니다.");
    }

    const updated = await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        ...(dto.category && { category: dto.category }),
        ...(dto.status && {
          status: dto.status,
          ...(dto.status === ConsultationStatus.CLOSED && {
            closedAt: new Date(),
          }),
        }),
      },
      select: {
        id: true,
        category: true,
        status: true,
        updatedAt: true,
      },
    });

    return { message: "상담 정보가 수정되었습니다.", data: updated };
  }

  /**
   * 상담 종료 (parent/coach 본인만)
   */
  async closeConsultation(consultationId: string, userId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { id: true, parentId: true, coachId: true, status: true },
    });

    if (!consultation) {
      throw new NotFoundException("상담을 찾을 수 없습니다.");
    }

    if (consultation.parentId !== userId && consultation.coachId !== userId) {
      throw new ForbiddenException("해당 상담을 종료할 권한이 없습니다.");
    }

    if (consultation.status === ConsultationStatus.CLOSED) {
      throw new BadRequestException("이미 종료된 상담입니다.");
    }

    const closed = await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        status: ConsultationStatus.CLOSED,
        closedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        closedAt: true,
      },
    });

    this.logger.log(`상담 종료: id=${consultationId}, closedBy=${userId}`);

    return { message: "상담이 종료되었습니다.", data: closed };
  }

  /**
   * 읽음 처리 (unreadCount 초기화)
   */
  async markAsRead(consultationId: string, userId: string, _role: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { id: true, parentId: true, coachId: true },
    });

    if (!consultation) {
      throw new NotFoundException("상담을 찾을 수 없습니다.");
    }

    if (consultation.parentId !== userId && consultation.coachId !== userId) {
      throw new ForbiddenException("해당 상담에 접근할 권한이 없습니다.");
    }

    const isCoach = consultation.coachId === userId;

    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: isCoach ? { unreadCountForCoach: 0 } : { unreadCountForParent: 0 },
    });

    return { message: "읽음 처리되었습니다." };
  }

  /**
   * 클럽 상담 통계 (DIRECTOR/ADMIN 전용)
   */
  async getClubStats(_actorId: string, role: string) {
    const isAdmin = ["ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR"].includes(
      role?.toUpperCase(),
    );

    if (!isAdmin) {
      throw new ForbiddenException("통계 조회 권한이 없습니다.");
    }

    const [total, active, closed, archived] = await Promise.all([
      this.prisma.consultation.count(),
      this.prisma.consultation.count({
        where: { status: ConsultationStatus.ACTIVE },
      }),
      this.prisma.consultation.count({
        where: { status: ConsultationStatus.CLOSED },
      }),
      this.prisma.consultation.count({
        where: { status: ConsultationStatus.ARCHIVED },
      }),
    ]);

    // 카테고리별 분포
    const categoryStats = await this.prisma.consultation.groupBy({
      by: ["category"],
      _count: { id: true },
    });

    const categoryDistribution = categoryStats.reduce(
      (acc, stat) => {
        acc[stat.category] = stat._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      total,
      active,
      closed,
      archived,
      categoryDistribution,
    };
  }
}
