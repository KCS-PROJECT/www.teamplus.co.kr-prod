import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { CreateWaitlistDto } from "./dto/create-waitlist.dto";
import { WaitlistResponseDto } from "./dto/waitlist-response.dto";

/** 대기 상태 상수 */
const WaitlistStatus = {
  WAITING: "WAITING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

/** child 관계 공통 select — N+1 방지 (include 중첩 대체) */
const CHILD_WITH_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  childProfile: {
    select: { birthDate: true, currentLevel: true },
  },
} as const;

/** waitlist select 결과 타입 */
type WaitlistWithRelations = {
  id: string;
  classId: string;
  scheduleId: string | null;
  userId: string;
  childId: string | null;
  position: number;
  status: string;
  notifiedAt: Date | null;
  confirmedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  class: { id: string; className: string };
  child: {
    id: string;
    firstName: string;
    lastName: string;
    childProfile: { birthDate: Date; currentLevel: number } | null;
  } | null;
};

/**
 * Waitlist 서비스
 *
 * 수업 정원 초과 시 대기자 순번 관리 및 자동 승격 처리
 *
 * 주요 흐름:
 * 1. 학부모/학생이 정원 초과 수업에 대기 등록
 * 2. 취소 또는 빈 자리 발생 시 가장 낮은 position의 대기자 자동 승격
 * 3. 승격 시 알림 발송 + expiresAt(24시간) 설정
 * 4. 24시간 내 미확인 시 EXPIRED 처리 후 다음 대기자로 이동
 */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  // 승격 후 확인 대기 시간 (24시간)
  private readonly CONFIRM_EXPIRY_HOURS = 24;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 대기자 등록
   */
  async createWaitlist(
    userId: string,
    dto: CreateWaitlistDto,
  ): Promise<WaitlistResponseDto> {
    this.logger.log(`대기자 등록: userId=${userId}, classId=${dto.classId}`);

    // 수업 존재 확인
    const classInfo = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: { id: true, className: true, isActive: true },
    });

    if (!classInfo || !classInfo.isActive) {
      throw new NotFoundException("수업 정보를 찾을 수 없습니다.");
    }

    // 자녀 ID 결정 (학부모가 자녀 대신 등록하는 경우)
    const targetChildId = dto.childId ?? null;

    // 중복 대기 확인
    const existing = await this.prisma.waitlist.findFirst({
      where: {
        classId: dto.classId,
        userId,
        childId: targetChildId,
        status: { in: [WaitlistStatus.WAITING, WaitlistStatus.CONFIRMED] },
      },
    });

    if (existing) {
      throw new ConflictException("이미 대기 중인 수업입니다.");
    }

    // 현재 해당 수업 마지막 position 조회
    const lastWaitlist = await this.prisma.waitlist.findFirst({
      where: {
        classId: dto.classId,
        status: WaitlistStatus.WAITING,
      },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const nextPosition = (lastWaitlist?.position ?? 0) + 1;

    const waitlist = await this.prisma.waitlist.create({
      data: {
        classId: dto.classId,
        scheduleId: dto.scheduleId ?? null,
        userId,
        childId: targetChildId,
        position: nextPosition,
        status: WaitlistStatus.WAITING,
      },
      select: {
        id: true,
        classId: true,
        scheduleId: true,
        userId: true,
        childId: true,
        position: true,
        status: true,
        notifiedAt: true,
        confirmedAt: true,
        expiresAt: true,
        createdAt: true,
        class: { select: { id: true, className: true } },
        child: { select: CHILD_WITH_PROFILE_SELECT },
      },
    });

    this.logger.log(
      `대기자 등록 완료: waitlistId=${waitlist.id}, position=${nextPosition}`,
    );

    return this.mapToResponse(waitlist);
  }

  /**
   * 수업별 대기자 목록 조회 (코치/관리자용)
   */
  async getWaitlistByClass(
    classId: string,
    _requesterId: string,
  ): Promise<WaitlistResponseDto[]> {
    this.logger.log(`수업별 대기자 목록 조회: classId=${classId}`);

    const classInfo = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!classInfo) {
      throw new NotFoundException("수업 정보를 찾을 수 없습니다.");
    }

    const waitlists = await this.prisma.waitlist.findMany({
      where: {
        classId,
        status: { in: [WaitlistStatus.WAITING, WaitlistStatus.CONFIRMED] },
      },
      select: {
        id: true,
        classId: true,
        scheduleId: true,
        userId: true,
        childId: true,
        position: true,
        status: true,
        notifiedAt: true,
        confirmedAt: true,
        expiresAt: true,
        createdAt: true,
        class: { select: { id: true, className: true } },
        child: { select: CHILD_WITH_PROFILE_SELECT },
      },
      orderBy: { position: "asc" },
    });

    return waitlists.map((w) => this.mapToResponse(w));
  }

  /**
   * 내 대기 목록 조회
   */
  async getMyWaitlists(userId: string): Promise<WaitlistResponseDto[]> {
    this.logger.log(`내 대기 목록 조회: userId=${userId}`);

    const waitlists = await this.prisma.waitlist.findMany({
      where: {
        userId,
        status: { in: [WaitlistStatus.WAITING, WaitlistStatus.CONFIRMED] },
      },
      select: {
        id: true,
        classId: true,
        scheduleId: true,
        userId: true,
        childId: true,
        position: true,
        status: true,
        notifiedAt: true,
        confirmedAt: true,
        expiresAt: true,
        createdAt: true,
        class: { select: { id: true, className: true } },
        child: { select: CHILD_WITH_PROFILE_SELECT },
      },
      orderBy: { createdAt: "desc" },
    });

    return waitlists.map((w) => this.mapToResponse(w));
  }

  /**
   * 대기 취소
   */
  async cancelWaitlist(userId: string, waitlistId: string): Promise<void> {
    this.logger.log(`대기 취소: userId=${userId}, waitlistId=${waitlistId}`);

    const waitlist = await this.prisma.waitlist.findUnique({
      where: { id: waitlistId },
    });

    if (!waitlist) {
      throw new NotFoundException("대기 정보를 찾을 수 없습니다.");
    }

    // 본인 확인
    if (waitlist.userId !== userId) {
      throw new ForbiddenException("본인의 대기만 취소할 수 있습니다.");
    }

    if (
      waitlist.status === WaitlistStatus.CANCELLED ||
      waitlist.status === WaitlistStatus.EXPIRED
    ) {
      throw new BadRequestException("이미 취소/만료된 대기입니다.");
    }

    await this.prisma.waitlist.update({
      where: { id: waitlistId },
      data: { status: WaitlistStatus.CANCELLED },
    });

    this.logger.log(`대기 취소 완료: waitlistId=${waitlistId}`);

    // 취소 후 다음 대기자 승격 여부는 별도 비즈니스 판단 (수업 취소/자리 확보 시)
  }

  /**
   * 대기자 확정 (승격 후 사용자 확인)
   *
   * 승격 알림을 받은 대기자가 24시간 내 확정 요청을 보내는 엔드포인트
   */
  async confirmWaitlist(
    userId: string,
    waitlistId: string,
  ): Promise<WaitlistResponseDto> {
    this.logger.log(`대기자 확정: userId=${userId}, waitlistId=${waitlistId}`);

    const waitlist = await this.prisma.waitlist.findUnique({
      where: { id: waitlistId },
      select: {
        id: true,
        classId: true,
        scheduleId: true,
        userId: true,
        childId: true,
        position: true,
        status: true,
        notifiedAt: true,
        confirmedAt: true,
        expiresAt: true,
        createdAt: true,
        class: { select: { id: true, className: true } },
        child: { select: CHILD_WITH_PROFILE_SELECT },
      },
    });

    if (!waitlist) {
      throw new NotFoundException("대기 정보를 찾을 수 없습니다.");
    }

    if (waitlist.userId !== userId) {
      throw new ForbiddenException("본인의 대기만 확정할 수 있습니다.");
    }

    if (waitlist.status !== WaitlistStatus.CONFIRMED) {
      throw new BadRequestException("승격된 대기만 확정할 수 있습니다.");
    }

    // 응답 기한 초과 확인
    if (waitlist.expiresAt && new Date() > waitlist.expiresAt) {
      await this.prisma.waitlist.update({
        where: { id: waitlistId },
        data: { status: WaitlistStatus.EXPIRED },
      });
      // 다음 대기자 승격
      await this.promoteNextWaitlist(waitlist.classId);
      throw new BadRequestException(
        "확인 기한이 만료되었습니다. 다음 대기자에게 기회가 이동됩니다.",
      );
    }

    const updated = await this.prisma.waitlist.update({
      where: { id: waitlistId },
      data: { confirmedAt: new Date() },
      select: {
        id: true,
        classId: true,
        scheduleId: true,
        userId: true,
        childId: true,
        position: true,
        status: true,
        notifiedAt: true,
        confirmedAt: true,
        expiresAt: true,
        createdAt: true,
        class: { select: { id: true, className: true } },
        child: { select: CHILD_WITH_PROFILE_SELECT },
      },
    });

    this.logger.log(`대기자 확정 완료: waitlistId=${waitlistId}`);

    return this.mapToResponse(updated);
  }

  /**
   * 다음 대기자 자동 승격 (내부 호출용)
   *
   * ClassRegistration CANCELLED 발생 시 또는 만료 처리 시 호출
   * - WAITING 상태 대기자 중 position 가장 낮은 사람을 CONFIRMED로 변경
   * - expiresAt 24시간 설정 + 알림 발송
   */
  async promoteNextWaitlist(classId: string): Promise<void> {
    this.logger.log(`다음 대기자 승격 시도: classId=${classId}`);

    // WAITING 상태 대기자 중 position이 가장 낮은 사람 조회
    const nextWaiting = await this.prisma.waitlist.findFirst({
      where: {
        classId,
        status: WaitlistStatus.WAITING,
      },
      orderBy: { position: "asc" },
      include: {
        user: { select: { id: true } },
        class: { select: { id: true, className: true } },
      },
    });

    if (!nextWaiting) {
      this.logger.log(`대기자 없음: classId=${classId}`);
      return;
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.CONFIRM_EXPIRY_HOURS);

    await this.prisma.waitlist.update({
      where: { id: nextWaiting.id },
      data: {
        status: WaitlistStatus.CONFIRMED,
        notifiedAt: new Date(),
        expiresAt,
      },
    });

    this.logger.log(
      `대기자 승격 완료: waitlistId=${nextWaiting.id}, userId=${nextWaiting.userId}, position=${nextWaiting.position}`,
    );

    // 알림 발송 (24시간 내 확인 요청)
    const className = nextWaiting.class?.className || "수업";
    this.notificationsService
      .createNotification({
        userId: nextWaiting.userId,
        notificationType: "waitlist_promoted",
        title: "대기 순번이 도래했습니다",
        message: `${className} 수업에 자리가 생겼습니다. 24시간 내에 확정 신청을 해주세요.`,
      })
      .catch((err) =>
        this.logger.warn(
          `대기자 승격 알림 발송 실패: userId=${nextWaiting.userId}, error=${err.message}`,
        ),
      );
  }

  /**
   * 만료된 CONFIRMED 대기자 처리 (15분마다 자동 실행)
   *
   * expiresAt이 지난 CONFIRMED 상태를 EXPIRED로 변경 후 다음 대기자 승격
   */
  @Cron("0 */15 * * * *")
  async processExpiredWaitlists(): Promise<void> {
    this.logger.log("만료된 대기자 처리 시작");

    const expiredList = await this.prisma.waitlist.findMany({
      where: {
        status: WaitlistStatus.CONFIRMED,
        expiresAt: { lt: new Date() },
      },
      select: { id: true, classId: true },
    });

    if (expiredList.length === 0) return;

    // [2026-05-14 N+1 해소] 만료 처리 일괄 updateMany + 승격은 unique classId 별 1회.
    //   기존: for...of 안에서 update + promoteNextWaitlist 각각 await → N+1 쿼리
    //   변경: updateMany 1회 + 중복 제거된 classId 에 대해 Promise.all 로 병렬 승격
    const ids = expiredList.map((e) => e.id);
    await this.prisma.waitlist.updateMany({
      where: { id: { in: ids } },
      data: { status: WaitlistStatus.EXPIRED },
    });
    this.logger.log(`만료 처리 일괄 update: ${ids.length}건`);

    const uniqueClassIds = Array.from(
      new Set(expiredList.map((e) => e.classId)),
    );
    await Promise.all(
      uniqueClassIds.map((classId) =>
        this.promoteNextWaitlist(classId).catch((err) => {
          this.logger.warn(
            `승격 실패 classId=${classId}: ${err instanceof Error ? err.message : err}`,
          );
        }),
      ),
    );

    this.logger.log(`만료 처리 완료: ${expiredList.length}건`);
  }

  // ================ Helper Methods ================

  private mapToResponse(waitlist: WaitlistWithRelations): WaitlistResponseDto {
    const child = waitlist.child;
    const childName =
      child && (child.lastName || child.firstName)
        ? `${child.lastName}${child.firstName}`.trim()
        : undefined;

    return {
      id: waitlist.id,
      classId: waitlist.classId,
      className: waitlist.class?.className || "알 수 없음",
      scheduleId: waitlist.scheduleId ?? undefined,
      userId: waitlist.userId,
      childId: waitlist.childId ?? undefined,
      childName,
      position: waitlist.position,
      status: waitlist.status,
      notifiedAt: waitlist.notifiedAt ?? undefined,
      confirmedAt: waitlist.confirmedAt ?? undefined,
      expiresAt: waitlist.expiresAt ?? undefined,
      createdAt: waitlist.createdAt,
    };
  }
}
