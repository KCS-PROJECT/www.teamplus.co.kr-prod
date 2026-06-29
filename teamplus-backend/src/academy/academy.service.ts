import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateAcademyDto } from "./dto/create-academy.dto";
import { UpdateAcademyDto } from "./dto/update-academy.dto";
import { JoinAcademyDto } from "./dto/join-academy.dto";
import { ApproveMemberDto } from "./dto/approve-member.dto";
import { AddCoachDto } from "./dto/add-coach.dto";
import { BroadcastNoticeDto } from "./dto/broadcast-notice.dto";
import {
  GetClassesSummaryQueryDto,
  SearchAcademyStudentsQueryDto,
  GetClassStudentsQueryDto,
  GetAcademyStudentsQueryDto,
} from "./dto/academy-students.dto";
import {
  resolveViewerBirthYears,
  buildBirthYearWhere,
  type ViewerLike,
} from "@/common/utils/viewer-birth-years.util";
import { sanitizeStrict } from "@/common/utils/sanitize.util";

@Injectable()
export class AcademyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 아카데미 고유 코드 생성 (ACAD-XXXXXX, 6자리 랜덤 영숫자)
   * 중복 시 재생성
   */
  private async generateAcademyCode(): Promise<string> {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code: string;
    let exists: boolean;

    do {
      const randomPart = Array.from({ length: 6 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length)),
      ).join("");
      code = `ACAD-${randomPart}`;
      const existing = await this.prisma.academy.findUnique({
        where: { code },
      });
      exists = !!existing;
    } while (exists);

    return code;
  }

  /**
   * 아카데미 생성
   */
  async createAcademy(userId: string, dto: CreateAcademyDto) {
    // 감독 1인당 오픈클래스 1개 정책 — 가입 시 1개 자동 생성되므로 추가 생성 차단.
    const existing = await this.prisma.academy.findFirst({
      where: { directorId: userId, isActive: true },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("이미 운영 중인 오픈클래스가 있습니다.");
    }

    const code = await this.generateAcademyCode();

    const academy = await this.prisma.academy.create({
      data: {
        directorId: userId,
        name: sanitizeStrict(dto.name),
        code,
        description: dto.description ? sanitizeStrict(dto.description) : null,
        region: dto.region ? sanitizeStrict(dto.region) : null,
        contactPhone: dto.contactPhone ?? null,
        contactEmail: dto.contactEmail ?? null,
        imageUrl: dto.imageUrl ?? null,
      },
    });

    return academy;
  }

  /**
   * 내가 관리하는 아카데미 목록
   */
  async getMyAcademies(userId: string) {
    const academies = await this.prisma.academy.findMany({
      where: {
        directorId: userId,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        region: true,
        imageUrl: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            members: true,
            coaches: true,
            classes: true,
          },
        },
      },
    });

    return { data: academies };
  }

  /**
   * 아카데미 상세 조회
   */
  async getAcademyDetail(academyId: string) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      include: {
        director: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        coaches: {
          where: { isActive: true },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            coaches: true,
            classes: true,
          },
        },
      },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    return academy;
  }

  /**
   * 아카데미 수정
   */
  async updateAcademy(
    userId: string,
    academyId: string,
    dto: UpdateAcademyDto,
  ) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== userId) {
      throw new ForbiddenException(
        "아카데미 감독만 정보를 수정할 수 있습니다.",
      );
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = sanitizeStrict(dto.name);
    if (dto.description !== undefined)
      updateData.description = dto.description
        ? sanitizeStrict(dto.description)
        : null;
    if (dto.region !== undefined)
      updateData.region = dto.region ? sanitizeStrict(dto.region) : null;
    if (dto.contactPhone !== undefined)
      updateData.contactPhone = dto.contactPhone ?? null;
    if (dto.contactEmail !== undefined)
      updateData.contactEmail = dto.contactEmail ?? null;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl ?? null;

    const updated = await this.prisma.academy.update({
      where: { id: academyId },
      data: updateData,
    });

    return updated;
  }

  /**
   * 아카데미 비활성화 (소프트 삭제)
   */
  async deleteAcademy(userId: string, academyId: string) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== userId) {
      throw new ForbiddenException("아카데미 감독만 삭제할 수 있습니다.");
    }

    await this.prisma.academy.update({
      where: { id: academyId },
      data: { isActive: false },
    });

    return { message: "아카데미가 비활성화되었습니다." };
  }

  /**
   * 아카데미 가입 신청 (코드 기반)
   */
  async joinAcademy(userId: string, dto: JoinAcademyDto) {
    const academy = await this.prisma.academy.findUnique({
      where: { code: dto.academyCode },
    });

    if (!academy) {
      throw new NotFoundException("해당 코드의 아카데미를 찾을 수 없습니다.");
    }

    if (!academy.isActive) {
      throw new NotFoundException("비활성화된 아카데미입니다.");
    }

    // 중복 가입 확인
    const existingMember = dto.childId
      ? await this.prisma.academyMember.findUnique({
          where: {
            academyId_userId_childId: {
              academyId: academy.id,
              userId,
              childId: dto.childId,
            },
          },
        })
      : await this.prisma.academyMember.findFirst({
          where: {
            academyId: academy.id,
            userId,
            childId: null,
          },
        });

    if (existingMember) {
      if (existingMember.status === "ACTIVE") {
        throw new ConflictException("이미 가입된 아카데미입니다.");
      }
      if (existingMember.status === "PENDING") {
        throw new ConflictException("이미 가입 신청 중입니다.");
      }
      // INACTIVE/BLOCKED 상태: 기존 레코드를 PENDING으로 재활성화
      if (
        existingMember.status === "INACTIVE" ||
        existingMember.status === "BLOCKED"
      ) {
        const reactivated = await this.prisma.academyMember.update({
          where: { id: existingMember.id },
          data: { status: "PENDING", leftAt: null },
        });
        return {
          message: "아카데미 가입 신청이 완료되었습니다.",
          data: reactivated,
        };
      }
    }

    const member = await this.prisma.academyMember.create({
      data: {
        academyId: academy.id,
        userId,
        childId: dto.childId ?? null,
        status: "PENDING",
      },
    });

    return {
      message: "아카데미 가입 신청이 완료되었습니다.",
      data: member,
    };
  }

  /**
   * 멤버 승인/거절
   */
  async approveMember(
    userId: string,
    academyId: string,
    memberId: string,
    dto: ApproveMemberDto,
  ) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== userId) {
      throw new ForbiddenException(
        "아카데미 감독만 멤버를 승인/거절할 수 있습니다.",
      );
    }

    const member = await this.prisma.academyMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.academyId !== academyId) {
      throw new NotFoundException("해당 멤버를 찾을 수 없습니다.");
    }

    const updated = await this.prisma.academyMember.update({
      where: { id: memberId },
      data: {
        status: dto.status,
        ...(dto.status === "ACTIVE" ? { joinedAt: new Date() } : {}),
      },
    });

    return updated;
  }

  /**
   * 멤버 목록 조회 (페이지네이션 + status 필터)
   */
  async getMembers(
    academyId: string,
    status?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { academyId };
    if (status) where.status = status;

    const [members, total] = await Promise.all([
      this.prisma.academyMember.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              userType: true,
            },
          },
          child: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.academyMember.count({ where }),
    ]);

    return {
      data: members,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 멤버 제거 (감독만)
   */
  async removeMember(userId: string, academyId: string, memberId: string) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== userId) {
      throw new ForbiddenException(
        "아카데미 감독만 멤버를 제거할 수 있습니다.",
      );
    }

    const member = await this.prisma.academyMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.academyId !== academyId) {
      throw new NotFoundException("해당 멤버를 찾을 수 없습니다.");
    }

    await this.prisma.academyMember.delete({ where: { id: memberId } });

    return { message: "멤버가 제거되었습니다." };
  }

  /**
   * 코치 추가
   */
  async addCoach(userId: string, academyId: string, dto: AddCoachDto) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== userId) {
      throw new ForbiddenException(
        "아카데미 감독만 코치를 추가할 수 있습니다.",
      );
    }

    // 코치 대상 사용자의 역할 검증
    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, userType: true },
    });

    if (!targetUser) {
      throw new NotFoundException("대상 사용자를 찾을 수 없습니다.");
    }

    const allowedCoachTypes = [
      "COACH",
      "DIRECTOR",
      "ACADEMY_DIRECTOR",
      "ADMIN",
    ];
    if (!allowedCoachTypes.includes(targetUser.userType)) {
      throw new BadRequestException(
        "코치 또는 감독 역할의 사용자만 코치로 등록할 수 있습니다.",
      );
    }

    // 중복 확인
    const existingCoach = await this.prisma.academyCoach.findUnique({
      where: {
        academyId_userId: {
          academyId,
          userId: dto.userId,
        },
      },
    });

    if (existingCoach) {
      throw new ConflictException("이미 등록된 코치입니다.");
    }

    const coach = await this.prisma.academyCoach.create({
      data: {
        academyId,
        userId: dto.userId,
        role: dto.role ?? "ASSISTANT_COACH",
      },
    });

    return coach;
  }

  /**
   * 코치 제거
   */
  async removeCoach(userId: string, academyId: string, coachId: string) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== userId) {
      throw new ForbiddenException(
        "아카데미 감독만 코치를 제거할 수 있습니다.",
      );
    }

    const coach = await this.prisma.academyCoach.findUnique({
      where: { id: coachId },
    });

    if (!coach || coach.academyId !== academyId) {
      throw new NotFoundException("해당 코치를 찾을 수 없습니다.");
    }

    await this.prisma.academyCoach.delete({ where: { id: coachId } });

    return { message: "코치가 제거되었습니다." };
  }

  /**
   * 코치 목록 조회
   */
  async getCoaches(academyId: string) {
    const coaches = await this.prisma.academyCoach.findMany({
      where: { academyId, isActive: true },
      orderBy: { joinedAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return { data: coaches };
  }

  /**
   * 아카데미 수업 목록
   */
  async getAcademyClasses(academyId: string, viewer?: ViewerLike) {
    // [수정 2026-05-20] 응답 스키마를 ClassesService.getClubClasses 와 동일한 평탄화된 ClassItem
    //  형태로 통일. 기존엔 select 가 최소 필드 + `_count.enrollments`(결제 흐름) 만 응답해
    //  frontend(classes-manage/page.tsx) 매퍼에서 studentCount/maxStudents 가 항상 0/capacity 로
    //  떨어지고, 코치·장소·가격 등이 빈 칸으로 표시되는 버그가 있었음.
    //
    //  카운트 SoT 통일: ClassRegistration { status: 'active' } — 수업상세(getClass.currentEnrollment)와 동일.
    //
    //  ⚠️ 추후 getClubClasses 와 공통 select/mapper 헬퍼로 묶을 여지 있음 (DRY).
    // 연령 노출 필터 — PARENT(자녀 합집합)·CHILD·TEEN 뷰어는 본인/자녀 출생연도가
    //   targetBirthYears 에 포함된(또는 전 연령 대상) 오픈클래스만 조회. 그 외 역할/비로그인은 전체.
    const birthYears = await resolveViewerBirthYears(this.prisma, viewer);
    const ageWhere = buildBirthYearWhere(birthYears);
    const classes = await this.prisma.class.findMany({
      where: {
        academyId,
        isActive: true,
        ...(ageWhere ? { AND: [ageWhere] } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        className: true,
        trainingType: true,
        instructorName: true,
        capacity: true,
        startTime: true,
        endTime: true,
        ageMin: true,
        ageMax: true,
        targetBirthYears: true,
        isActive: true,
        approvalStatus: true,
        category: true,
        classDays: true,
        coachId: true,
        teamId: true,
        academyId: true,
        levelRequired: true,
        description: true,
        createdAt: true,
        coach: {
          select: { id: true, firstName: true, lastName: true, userType: true },
        },
        venue: { select: { id: true, name: true, address: true } },
        products: {
          select: {
            id: true,
            productName: true,
            price: true,
            feeType: true,
            durationDays: true,
            sessionsPerMonth: true,
            sessionsPerWeek: true,
          },
        },
        schedules: {
          where: { isCancelled: false },
          // [2026-06-10] 회차별 실제 시각(startTime/endTime "HH:mm") — 카드 시간 표시용.
          select: { scheduledDate: true, startTime: true, endTime: true },
          orderBy: { scheduledDate: "asc" },
        },
        _count: {
          select: {
            registrations: { where: { status: "active" } },
            waitlists: true,
          },
        },
        // 2026-06-05: 요일별 시간·장소 규칙 (ClassDaySchedule) — venue는 id/name만 선택해 응답 최소화
        dayScheduleEntries: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            venueId: true,
            venue: { select: { id: true, name: true } },
          },
        },
      },
    });

    const result = classes.map((c) => {
      const days = Array.isArray(c.classDays)
        ? (c.classDays as string[]).join(", ")
        : "";
      const st = c.startTime
        ? new Date(c.startTime).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "";
      const et = c.endTime
        ? new Date(c.endTime).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "";
      const coachName = c.coach
        ? `${c.coach.lastName ?? ""}${c.coach.firstName ?? ""}`.trim() ||
          c.instructorName
        : c.instructorName;

      // [2026-06-10] 오픈클래스 카드 시간 — 회차별 실제 시각(첫 회차 startTime/endTime) 우선.
      //   Class.startTime/endTime 은 오픈클래스에서 회차 시각이 아니므로(등록/회차판정용) 부적합.
      const firstSched = c.schedules?.[0];
      const scheduleTime = firstSched?.startTime
        ? firstSched.endTime
          ? `${firstSched.startTime} - ${firstSched.endTime}`
          : firstSched.startTime
        : "";

      const singleProduct = c.products?.find(
        (p) => p.feeType === "PER_SESSION",
      );
      const monthlyProduct = c.products?.find(
        (p) => p.feeType === "MONTHLY_FIXED",
      );

      return {
        id: c.id,
        className: c.className,
        trainingType: c.trainingType,
        teamId: c.teamId,
        academyId: c.academyId,
        dayOfWeek: days,
        time: scheduleTime || (st && et ? `${st} - ${et}` : ""),
        startTime: c.startTime,
        endTime: c.endTime,
        location: c.venue?.name ?? "",
        venueAddress: c.venue?.address ?? "",
        studentCount: c._count.registrations,
        maxStudents: c.capacity,
        level: c.levelRequired,
        category: c.category,
        ageMin: c.ageMin,
        ageMax: c.ageMax,
        targetBirthYears: c.targetBirthYears,
        status: c.isActive ? "ACTIVE" : "INACTIVE",
        approvalStatus: c.approvalStatus,
        coach: coachName,
        coachId: c.coachId ?? c.coach?.id ?? null,
        coachUserType: c.coach?.userType ?? null,
        firstScheduleDate:
          c.schedules && c.schedules.length > 0
            ? c.schedules[0].scheduledDate.toISOString()
            : null,
        lastScheduleDate:
          c.schedules && c.schedules.length > 0
            ? c.schedules[c.schedules.length - 1].scheduledDate.toISOString()
            : null,
        // [2026-06-09] 오픈클래스 날짜별 일정(ISO) 전체 — 관리 목록 카드에 실제 일정 날짜 표시.
        scheduledDates: (c.schedules ?? []).map((s) =>
          s.scheduledDate.toISOString(),
        ),
        isActive: c.isActive,
        description: c.description,
        singlePrice:
          typeof singleProduct?.price === "number" ? singleProduct.price : null,
        singlePriceLabel: (() => {
          if (
            singleProduct &&
            typeof singleProduct.price === "number" &&
            singleProduct.price > 0
          ) {
            return "krw";
          }
          return "tbd";
        })(),
        monthlyPrice:
          typeof monthlyProduct?.price === "number"
            ? monthlyProduct.price
            : null,
        monthlyPriceLabel: (() => {
          if (
            monthlyProduct &&
            typeof monthlyProduct.price === "number" &&
            monthlyProduct.price > 0
          ) {
            return "krw";
          }
          return "tbd";
        })(),
        packageWeeks: monthlyProduct?.durationDays
          ? Math.max(1, Math.round(monthlyProduct.durationDays / 7))
          : null,
        packageTotalSessions: monthlyProduct?.sessionsPerMonth ?? null,
        packageSessionsPerWeek: monthlyProduct?.sessionsPerWeek ?? null,
        waitlistCount: c._count.waitlists,
        createdAt: c.createdAt,
        // 2026-06-05: 요일별 시간·장소 규칙 — getClass 와 동일 DOW_ORDER 정렬.
        //   없으면 [] — 기존 단일 startTime/endTime/venueId 경로로 폴백 표시.
        daySchedules: (() => {
          const DOW_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
          return (c.dayScheduleEntries ?? [])
            .slice()
            .sort(
              (a, b) =>
                DOW_ORDER.indexOf(a.dayOfWeek) - DOW_ORDER.indexOf(b.dayOfWeek),
            )
            .map((ds) => ({
              dayOfWeek: ds.dayOfWeek,
              startTime: ds.startTime,
              endTime: ds.endTime,
              venueId: ds.venueId ?? null,
              venueName: ds.venue?.name ?? null,
            }));
        })(),
      };
    });

    return { data: result };
  }

  /**
   * 공개 아카데미 목록 (검색 + 지역 필터 + 페이지네이션)
   */
  async getPublicAcademies(
    search?: string,
    region?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (region) where.region = region;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [academies, total] = await Promise.all([
      this.prisma.academy.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          region: true,
          imageUrl: true,
          createdAt: true,
          _count: {
            select: {
              members: true,
              coaches: true,
              classes: true,
            },
          },
        },
      }),
      this.prisma.academy.count({ where }),
    ]);

    return {
      data: academies,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 공개 아카데미 상세
   */
  async getPublicAcademyDetail(academyId: string) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        region: true,
        contactPhone: true,
        contactEmail: true,
        imageUrl: true,
        createdAt: true,
        director: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        coaches: {
          where: { isActive: true },
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            coaches: true,
            classes: true,
          },
        },
      },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    return academy;
  }

  /**
   * 아카데미 브로드캐스트 공지 발송
   * 감독이 활성 수강생 전원에게 알림 발송
   */
  async broadcastNotice(
    userId: string,
    academyId: string,
    dto: BroadcastNoticeDto,
  ) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== userId) {
      throw new ForbiddenException(
        "아카데미 감독만 공지를 발송할 수 있습니다.",
      );
    }

    // 활성 멤버의 userId 목록 조회
    const activeMembers = await this.prisma.academyMember.findMany({
      where: { academyId, status: "ACTIVE" },
      select: { userId: true },
    });

    if (activeMembers.length === 0) {
      return { message: "활성 수강생이 없습니다.", sentCount: 0 };
    }

    // 중복 제거 (한 학부모가 여러 자녀로 가입한 경우)
    const uniqueUserIds = [...new Set(activeMembers.map((m) => m.userId))];

    // 알림 일괄 생성
    const notifications = uniqueUserIds.map((memberId) => ({
      userId: memberId,
      notificationType: "academy_notice",
      title: sanitizeStrict(dto.title),
      message: sanitizeStrict(dto.message),
    }));

    await this.prisma.notification.createMany({
      data: notifications,
    });

    return {
      message: "공지가 발송되었습니다.",
      sentCount: uniqueUserIds.length,
    };
  }

  /**
   * 학원 소유권 검증 헬퍼.
   * ADMIN은 모든 학원에 접근 가능. ACADEMY_DIRECTOR는 자신의 학원만.
   */
  private async assertAcademyAccess(
    academyId: string,
    userId: string,
    userType: string,
  ): Promise<void> {
    if (userType === "ADMIN") return;

    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { id: true, directorId: true },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== userId) {
      throw new ForbiddenException("해당 아카데미에 접근 권한이 없습니다.");
    }
  }

  /**
   * 학원 수업 카드 리스트 (활성 수업만, 수업별 수강생 수 카운트)
   * SPEC v3 2026-05-18 — 수업 카드 IA 재활성화. /academy/{id}?tab=students 기본 모드 + /classes/{id} 진입점 데이터 소스.
   * 활성 판정: isActive=true (Class.endTime 회차 시각이라 부적합 → isActive SoT, 다른 모듈 일관)
   * N+1 방지: 단일 findMany + _count 활용
   */
  async getClassesSummary(
    academyId: string,
    userId: string,
    userType: string,
    opts: GetClassesSummaryQueryDto,
  ) {
    await this.assertAcademyAccess(academyId, userId, userType);

    const { status = "active", sort = "recent", page = 1, limit = 20 } = opts;
    const skip = (page - 1) * limit;

    // status 필터: isActive 기반 판정 (SPEC v3 — endTime 회차 시각이라 부적합)
    // active(기본): isActive=true, ended: isActive=false, all: 필터 없음
    const statusWhere: any = {};
    if (status === "active") {
      statusWhere.isActive = true;
    } else if (status === "ended") {
      statusWhere.isActive = false;
    }

    // 정렬 기준
    let orderBy: any;
    if (sort === "name") {
      orderBy = { className: "asc" };
    } else if (sort === "recent") {
      orderBy = { createdAt: "desc" };
    } else {
      // enrollment_count — Prisma 집계 정렬은 관계 _count 직접 지원 안 함
      // createdAt desc 로 fallback 후 JS 정렬
      orderBy = { createdAt: "desc" };
    }

    const [classes, uniqueStudentRows] = await Promise.all([
      this.prisma.class.findMany({
        where: { academyId, ...statusWhere },
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          className: true,
          trainingType: true,
          classDays: true,
          startTime: true,
          endTime: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              enrollments: {
                where: { status: "paid" },
              },
            },
          },
        },
      }),
      // uniqueStudentCount: distinct childId 중 paid 상태
      this.prisma.enrollment.findMany({
        where: {
          class: { academyId },
          status: "paid",
        },
        distinct: ["childId"],
        select: { childId: true },
      }),
    ]);

    // pendingCount를 별도 집계 (pending 계열 상태)
    const pendingCountMap = await this.prisma.enrollment.groupBy({
      by: ["classId"],
      where: {
        class: { academyId },
        status: { in: ["pending", "pending_approval", "approved"] },
      },
      _count: { id: true },
    });
    const pendingByClassId = new Map(
      pendingCountMap.map((r) => [r.classId, r._count.id]),
    );

    // 전체 카운트 (status 필터 적용)
    const totalCount = await this.prisma.class.count({
      where: { academyId, ...statusWhere },
    });

    // 전체 active/ended 카운트 (summary용, status 필터 무관, isActive SoT)
    const [activeClassCount, endedClassCount] = await Promise.all([
      this.prisma.class.count({
        where: { academyId, isActive: true },
      }),
      this.prisma.class.count({
        where: { academyId, isActive: false },
      }),
    ]);

    // 수업 카드 데이터 가공
    let classCards = classes.map((c) => ({
      id: c.id,
      className: c.className,
      trainingType: c.trainingType ?? null,
      scheduleSummary: this.buildScheduleSummary(c.classDays),
      durationMinutes: this.calcDurationMinutes(c.startTime, c.endTime),
      startDate: c.startTime.toISOString().split("T")[0],
      endDate: c.endTime.toISOString().split("T")[0],
      status: c.isActive ? "active" : "ended",
      enrollmentCount: c._count.enrollments,
      pendingCount: pendingByClassId.get(c.id) ?? 0,
    }));

    // enrollment_count 정렬은 JS 단에서 처리
    if (sort === "enrollment_count") {
      classCards = classCards.sort(
        (a, b) => b.enrollmentCount - a.enrollmentCount,
      );
    }

    return {
      success: true,
      data: {
        summary: {
          uniqueStudentCount: uniqueStudentRows.length,
          totalClassCount: activeClassCount + endedClassCount,
          activeClassCount,
          endedClassCount,
        },
        classes: classCards,
        pagination: {
          total: totalCount,
          page,
          limit,
        },
      },
    };
  }

  /**
   * classDays JSON → 간단한 일정 요약 문자열
   */
  private buildScheduleSummary(classDays: unknown): string {
    if (!classDays || !Array.isArray(classDays)) return "";
    const dayMap: Record<string, string> = {
      MON: "월",
      TUE: "화",
      WED: "수",
      THU: "목",
      FRI: "금",
      SAT: "토",
      SUN: "일",
    };
    const days = (classDays as string[]).map((d) => dayMap[d] ?? d).join("·");
    return days ? `매주 ${days}` : "";
  }

  /**
   * startTime ~ endTime 간격을 분으로 반환
   */
  private calcDurationMinutes(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }

  /**
   * 학원 수강생 단일 리스트 (활성 수업의 paid enrollment 학생 unique)
   * SPEC v2 2026-05-18 — 학생 단위 unique 리스트 + 검색 + 정렬 + 페이지네이션 통합
   * N+1 방지: 단일 findMany + JS Map 그룹화 + 단일 count
   */
  async getAcademyStudents(
    academyId: string,
    userId: string,
    userType: string,
    opts: GetAcademyStudentsQueryDto,
  ) {
    await this.assertAcademyAccess(academyId, userId, userType);

    const { q, sort = "recent", page = 1, limit = 20 } = opts;

    const nameFilter =
      q && q.trim()
        ? {
            OR: [
              {
                child: {
                  OR: [
                    {
                      firstName: {
                        contains: q.trim(),
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      lastName: {
                        contains: q.trim(),
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              },
              {
                requester: {
                  OR: [
                    {
                      firstName: {
                        contains: q.trim(),
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      lastName: {
                        contains: q.trim(),
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {};

    // [수정 2026-05-18] 활성 수업 판정 — `endTime: { gte: now }` 제거.
    //   Class.endTime 은 매 회차 종료 시각(DateTime)이라 정기 수업도 첫 회차 후
    //   비활성으로 잘못 분류됨. 다른 모듈과 동일하게 `isActive: true` SoT 사용.
    //   ClassSchedule 별도 모델이 실제 회차 관리를 담당하므로 isActive 로 운영
    //   상태만 판정.
    const [enrollments, activeClassCount] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          class: {
            academyId,
            isActive: true,
          },
          status: "paid",
          ...nameFilter,
        },
        select: {
          childId: true,
          paidAt: true,
          child: { select: { id: true, firstName: true, lastName: true } },
          requester: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          class: {
            select: { id: true, className: true, trainingType: true },
          },
        },
      }),
      this.prisma.class.count({
        where: {
          academyId,
          isActive: true,
        },
      }),
    ]);

    const childMap = new Map<
      string,
      {
        childId: string;
        childName: string;
        parentId: string;
        parentName: string;
        parentPhone: string | null;
        enrolledClasses: {
          classId: string;
          className: string;
          status: string;
          trainingType: string | null;
        }[];
        lastPaidAt: Date | null;
      }
    >();

    for (const en of enrollments) {
      const existing = childMap.get(en.childId);
      const classEntry = {
        classId: en.class.id,
        className: en.class.className,
        status: "paid",
        trainingType: en.class.trainingType ?? null,
      };
      const paidAt = en.paidAt ?? null;

      if (existing) {
        const alreadyIn = existing.enrolledClasses.some(
          (c) => c.classId === en.class.id,
        );
        if (!alreadyIn) existing.enrolledClasses.push(classEntry);
        if (paidAt && (!existing.lastPaidAt || paidAt > existing.lastPaidAt)) {
          existing.lastPaidAt = paidAt;
        }
      } else {
        childMap.set(en.childId, {
          childId: en.child.id,
          childName: `${en.child.lastName ?? ""}${en.child.firstName ?? ""}`,
          parentId: en.requester.id,
          parentName: `${en.requester.lastName ?? ""}${en.requester.firstName ?? ""}`,
          parentPhone: en.requester.phone ?? null,
          enrolledClasses: [classEntry],
          lastPaidAt: paidAt,
        });
      }
    }

    const results = Array.from(childMap.values());

    if (sort === "recent") {
      results.sort((a, b) => {
        const ta = a.lastPaidAt?.getTime() ?? 0;
        const tb = b.lastPaidAt?.getTime() ?? 0;
        return tb - ta;
      });
    } else if (sort === "name") {
      results.sort((a, b) => a.childName.localeCompare(b.childName, "ko"));
    }

    const total = results.length;
    const paginated = results.slice((page - 1) * limit, page * limit);

    const serialized = paginated.map((r) => ({
      ...r,
      lastPaidAt: r.lastPaidAt?.toISOString() ?? null,
    }));

    return {
      success: true,
      data: {
        summary: {
          uniqueStudentCount: total,
          activeClassCount,
        },
        results: serialized,
        pagination: { total, page, limit },
      },
    };
  }

  /**
   * 학원 내 학생 통합 검색
   * 빈 검색어 → 빈 results 반환
   * @deprecated 2026-05-18 SPEC v2 — 학생 단위 단일 리스트 endpoint(`GET /students`) 로 통합.
   *   Frontend 마이그레이션 완료 후 제거 예정. 새 코드는 `getAcademyStudents` 사용.
   */
  async searchStudents(
    academyId: string,
    userId: string,
    userType: string,
    opts: SearchAcademyStudentsQueryDto,
  ) {
    await this.assertAcademyAccess(academyId, userId, userType);

    const { q, page = 1, limit = 20 } = opts;

    // 빈 검색어는 빈 결과 반환
    if (!q || q.trim() === "") {
      return {
        success: true,
        data: {
          results: [],
          pagination: { total: 0, page, limit },
        },
      };
    }

    const searchTerm = q.trim();

    // 해당 학원 수업의 enrollment 조회 (child + 학부모 이름 검색)
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        class: { academyId },
        status: { in: ["paid", "pending", "pending_approval", "approved"] },
        OR: [
          {
            child: {
              OR: [
                { firstName: { contains: searchTerm, mode: "insensitive" } },
                { lastName: { contains: searchTerm, mode: "insensitive" } },
              ],
            },
          },
          {
            requester: {
              OR: [
                { firstName: { contains: searchTerm, mode: "insensitive" } },
                { lastName: { contains: searchTerm, mode: "insensitive" } },
              ],
            },
          },
        ],
      },
      select: {
        childId: true,
        classId: true,
        status: true,
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        requester: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        class: {
          select: {
            id: true,
            className: true,
          },
        },
      },
    });

    // 자녀 단위 그룹화
    const childMap = new Map<
      string,
      {
        childId: string;
        childName: string;
        parentId: string;
        parentName: string;
        parentPhone: string | null;
        enrolledClasses: {
          classId: string;
          className: string;
          status: string;
        }[];
      }
    >();

    for (const en of enrollments) {
      const existing = childMap.get(en.childId);
      const classEntry = {
        classId: en.class.id,
        className: en.class.className,
        status: en.status,
      };

      if (existing) {
        const alreadyIn = existing.enrolledClasses.some(
          (c) => c.classId === en.class.id,
        );
        if (!alreadyIn) {
          existing.enrolledClasses.push(classEntry);
        }
      } else {
        childMap.set(en.childId, {
          childId: en.child.id,
          childName: `${en.child.lastName}${en.child.firstName}`,
          parentId: en.requester.id,
          parentName: `${en.requester.lastName}${en.requester.firstName}`,
          parentPhone: en.requester.phone ?? null,
          enrolledClasses: [classEntry],
        });
      }
    }

    const results = Array.from(childMap.values());
    const total = results.length;
    const paginated = results.slice((page - 1) * limit, page * limit);

    return {
      success: true,
      data: {
        results: paginated,
        pagination: { total, page, limit },
      },
    };
  }

  /**
   * 특정 수업의 수강생 목록 (Detail 화면)
   * classId가 academyId 소속인지 검증 필수 (403 방지)
   */
  async getClassStudents(
    academyId: string,
    classId: string,
    userId: string,
    userType: string,
    opts: GetClassStudentsQueryDto,
  ) {
    await this.assertAcademyAccess(academyId, userId, userType);

    // classId가 이 academyId 소속인지 검증
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        className: true,
        classDays: true,
        startTime: true,
        endTime: true,
        academyId: true,
        _count: {
          select: {
            enrollments: { where: { status: "paid" } },
          },
        },
      },
    });

    if (!classRecord || classRecord.academyId !== academyId) {
      throw new ForbiddenException("해당 수업에 접근 권한이 없습니다.");
    }

    const { status = "all", sort = "recent", q, page = 1, limit = 20 } = opts;
    const skip = (page - 1) * limit;

    // status 필터
    const statusWhere: any = {};
    if (status === "paid") {
      statusWhere.status = "paid";
    } else if (status === "pending") {
      statusWhere.status = { in: ["pending", "pending_approval", "approved"] };
    }

    // 검색어 필터
    const searchWhere: any = {};
    if (q && q.trim() !== "") {
      searchWhere.child = {
        OR: [
          { firstName: { contains: q.trim(), mode: "insensitive" } },
          { lastName: { contains: q.trim(), mode: "insensitive" } },
        ],
      };
    }

    // 정렬
    let orderBy: any;
    if (sort === "oldest") {
      orderBy = { paidAt: "asc" };
    } else if (sort === "name") {
      orderBy = { child: { firstName: "asc" } };
    } else {
      orderBy = { paidAt: "desc" };
    }

    const [enrollments, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { classId, ...statusWhere, ...searchWhere },
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          paidAt: true,
          requestedAt: true,
          child: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          requester: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.enrollment.count({
        where: { classId, ...statusWhere, ...searchWhere },
      }),
    ]);

    // pendingCount for classInfo
    const pendingCount = await this.prisma.enrollment.count({
      where: {
        classId,
        status: { in: ["pending", "pending_approval", "approved"] },
      },
    });

    const students = enrollments.map((en) => ({
      enrollmentId: en.id,
      childId: en.child.id,
      childName: `${en.child.lastName}${en.child.firstName}`,
      parentId: en.requester.id,
      parentName: `${en.requester.lastName}${en.requester.firstName}`,
      parentPhone: en.requester.phone ?? null,
      status: en.status,
      paidAt: en.paidAt ?? null,
      requestedAt: en.requestedAt,
    }));

    return {
      success: true,
      data: {
        classInfo: {
          id: classRecord.id,
          className: classRecord.className,
          scheduleSummary: this.buildScheduleSummary(classRecord.classDays),
          durationMinutes: this.calcDurationMinutes(
            classRecord.startTime,
            classRecord.endTime,
          ),
          enrollmentCount: classRecord._count.enrollments,
          pendingCount,
        },
        students,
        pagination: { total, page, limit },
      },
    };
  }
}
