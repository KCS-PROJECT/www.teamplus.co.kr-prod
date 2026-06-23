import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { PaymentsService } from "@/payments/payments.service";
import { CreatePickupMatchDto } from "./dto/create-pickup-match.dto";
import { ApplyPickupMatchDto } from "./dto/apply-pickup-match.dto";
import { UpdatePickupMatchDto } from "./dto/update-pickup-match.dto";
import { BulkRejectApplicantsDto } from "./dto/bulk-reject-applicants.dto";

/**
 * 관리자/감독 역할 — 매니저가 아니더라도 모든 매치 관리 가능.
 */
const MATCH_ADMIN_ROLES = new Set(["ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR"]);

/**
 * DailyViewLog 엔티티 타입 (pickup_match 전용).
 *
 * 공유 ViewCounterService는 타입 union이 좁혀져 있어 새 엔티티를 추가하려면
 * 다른 모듈 파일을 수정해야 함. 본 모듈 경계 내에서 동일 패턴(KST 1일 1회)을
 * 재현하기 위해 내부 헬퍼로 구현.
 */
const DAILY_VIEW_ENTITY_TYPE = "pickup_match" as const;

@Injectable()
export class PickupMatchesService {
  private readonly logger = new Logger(PickupMatchesService.name);

  constructor(
    private prisma: PrismaService,
    private paymentsService: PaymentsService,
    /**
     * NotificationsService는 optional 주입.
     *
     * PickupMatchesModule에서 NotificationsModule을 imports 하면 주입되며,
     * 없어도 알림 발송만 스킵하고 핵심 로직은 정상 동작한다.
     */
    @Optional() private notifications?: NotificationsService,
  ) {}

  /**
   * 주최자(매니저) 본인 또는 관리자/감독 역할인지 확인.
   *
   * @param matchManagerId 매치의 주최자 ID
   * @param actorId 현재 요청한 사용자 ID
   * @param userType 현재 요청한 사용자의 역할 (ADMIN/DIRECTOR/.../COACH/...)
   */
  private isAuthorizedManager(
    matchManagerId: string,
    actorId: string,
    userType?: string,
  ): boolean {
    if (matchManagerId === actorId) {
      return true;
    }
    if (userType && MATCH_ADMIN_ROLES.has(userType.toUpperCase())) {
      return true;
    }
    return false;
  }

  /**
   * 관리 권한 검증 헬퍼 — 매치 존재/취소 상태/권한을 한 번에 확인.
   *
   * - NotFoundException: 매치가 존재하지 않음
   * - BadRequestException: 이미 취소된 매치
   * - ForbiddenException: 주최자도 아니고 ADMIN/DIRECTOR도 아님
   *
   * 반환: 매치 기본 정보 (후속 로직에서 재사용)
   */
  private async assertCanManage(
    matchId: string,
    actor: { id: string; userType?: string },
    options: { allowCancelled?: boolean } = {},
  ) {
    const match = await this.prisma.pickupMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        managerId: true,
        status: true,
        title: true,
        scheduledAt: true,
        maxParticipants: true,
        price: true,
      },
    });

    if (!match) {
      throw new NotFoundException("매치를 찾을 수 없습니다.");
    }
    if (!options.allowCancelled && match.status === "cancelled") {
      throw new BadRequestException("이미 취소된 매치는 관리할 수 없습니다.");
    }
    if (!this.isAuthorizedManager(match.managerId, actor.id, actor.userType)) {
      throw new ForbiddenException(
        "본인이 주최한 매치 또는 관리자만 관리할 수 있습니다.",
      );
    }
    return match;
  }

  async findAll(params: {
    status?: string;
    date?: string;
    level?: string;
    gender?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, date, level, gender } = params;

    // 페이지네이션 파라미터 sanitize: 악의적 큰 값·음수 방어 (Phase 4-C 최적화)
    // - page 최소 1
    // - limit 1~100 clamp (기본 20)
    const safePage = Math.max(
      1,
      Number.isFinite(params.page) ? params.page! : 1,
    );
    const rawLimit = Number.isFinite(params.limit) ? params.limit! : 20;
    const safeLimit = Math.min(100, Math.max(1, rawLimit));
    const skip = (safePage - 1) * safeLimit;

    const where: Prisma.PickupMatchWhereInput = {};

    // 필터 순서는 `@@index([status, scheduledAt])` 복합 인덱스 활용을 위해
    // status → scheduledAt 순으로 지정 (실 쿼리 플래너가 order를 보장하지는 않으나
    // Prisma 생성 SQL에서 일관성 유지).
    if (status) where.status = status;
    if (level) where.level = level;
    if (gender) where.gender = gender;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.scheduledAt = { gte: start, lt: end };
    }

    const [matches, total] = await Promise.all([
      this.prisma.pickupMatch.findMany({
        where,
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          rinkName: true,
          rinkAddress: true,
          price: true,
          level: true,
          levelCode: true,
          gender: true,
          maxParticipants: true,
          status: true,
          isFeatured: true,
          viewCount: true,
          manager: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          _count: {
            select: {
              applicants: {
                where: { status: "approved" },
              },
            },
          },
        },
        skip,
        take: safeLimit,
        orderBy: { scheduledAt: "asc" },
      }),
      this.prisma.pickupMatch.count({ where }),
    ]);

    return {
      total,
      page: safePage,
      limit: safeLimit,
      items: matches.map((m) => ({
        ...m,
        currentParticipants: m._count.applicants,
        _count: undefined,
      })),
    };
  }

  async findOne(id: string) {
    const match = await this.prisma.pickupMatch.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        rinkName: true,
        rinkAddress: true,
        rinkVenueInfo: true,
        price: true,
        level: true,
        levelCode: true,
        gender: true,
        maxParticipants: true,
        homeTeamName: true,
        awayTeamName: true,
        rules: true,
        description: true,
        status: true,
        isFeatured: true,
        viewCount: true,
        cancelledAt: true,
        cancelledReason: true,
        createdAt: true,
        updatedAt: true,
        manager: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        _count: {
          select: {
            applicants: { where: { status: "approved" } },
          },
        },
      },
    });

    if (!match) throw new NotFoundException("매치를 찾을 수 없습니다.");

    return {
      ...match,
      currentParticipants: match._count.applicants,
      _count: undefined,
    };
  }

  async getRoster(id: string) {
    const match = await this.prisma.pickupMatch.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        maxParticipants: true,
        managerId: true,
      },
    });

    if (!match) throw new NotFoundException("매치를 찾을 수 없습니다.");

    const applicants = await this.prisma.pickupMatchApplicant.findMany({
      where: {
        matchId: id,
        status: { in: ["approved", "pending"] },
      },
      select: {
        id: true,
        userId: true,
        position: true,
        level: true,
        status: true,
        appliedAt: true,
        user: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
      orderBy: { appliedAt: "asc" },
    });

    const approvedApplicants = applicants.filter(
      (a) => a.status === "approved",
    );
    const pendingApplicants = applicants.filter((a) => a.status === "pending");

    return {
      matchId: match.id,
      matchTitle: match.title,
      totalSlots: match.maxParticipants,
      currentCount: approvedApplicants.length,
      confirmedPlayers: approvedApplicants.map((a, index) => ({
        id: a.id,
        userId: a.user.id,
        name:
          `${a.user.lastName ?? ""}${a.user.firstName ?? ""}`.trim() || "익명",
        position: a.position ?? "",
        level: a.level ?? "",
        isHost: a.userId === match.managerId,
        order: index + 1,
        appliedAt: a.appliedAt,
      })),
      waitlistPlayers: pendingApplicants.map((a, index) => ({
        id: a.id,
        userId: a.user.id,
        name:
          `${a.user.lastName ?? ""}${a.user.firstName ?? ""}`.trim() || "익명",
        position: a.position ?? "",
        level: a.level ?? "",
        waitNumber: index + 1,
        appliedAt: a.appliedAt,
      })),
    };
  }

  async create(managerId: string, dto: CreatePickupMatchDto) {
    return this.prisma.pickupMatch.create({
      data: {
        managerId,
        title: dto.title,
        scheduledAt: new Date(dto.scheduledAt),
        rinkName: dto.rinkName,
        rinkAddress: dto.rinkAddress,
        rinkVenueInfo: dto.rinkVenueInfo,
        price: dto.price,
        level: dto.level,
        levelCode: dto.levelCode,
        gender: dto.gender ?? "혼성",
        maxParticipants: dto.maxParticipants,
        homeTeamName: dto.homeTeamName,
        awayTeamName: dto.awayTeamName,
        rules: dto.rules ?? [],
        description: dto.description,
      },
      select: { id: true, title: true, scheduledAt: true, status: true },
    });
  }

  /**
   * 매치 수정 (주최자 또는 ADMIN/DIRECTOR/ACADEMY_DIRECTOR 만).
   *
   * 제약:
   * - 취소된 매치 수정 불가 (BadRequest)
   * - 이미 시작된 매치 수정 불가 (BadRequest)
   * - `maxParticipants`는 현재 승인 인원 수 이하로 내릴 수 없음 (BadRequest)
   */
  async update(
    matchId: string,
    actor: { id: string; userType?: string },
    dto: UpdatePickupMatchDto,
  ) {
    const match = await this.assertCanManage(matchId, actor);

    if (match.scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException("이미 시작된 매치는 수정할 수 없습니다.");
    }

    // maxParticipants를 낮추려는 경우 현재 승인 인원 확인
    if (
      dto.maxParticipants !== undefined &&
      dto.maxParticipants < match.maxParticipants
    ) {
      const approvedCount = await this.prisma.pickupMatchApplicant.count({
        where: { matchId, status: "approved" },
      });
      if (dto.maxParticipants < approvedCount) {
        throw new BadRequestException(
          `현재 승인된 참가자(${approvedCount}명)보다 적은 인원으로 변경할 수 없습니다.`,
        );
      }
    }

    const data: Prisma.PickupMatchUpdateInput = {
      updatedBy: { connect: { id: actor.id } },
    };

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.scheduledAt !== undefined)
      data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.rinkName !== undefined) data.rinkName = dto.rinkName;
    if (dto.rinkAddress !== undefined) data.rinkAddress = dto.rinkAddress;
    if (dto.rinkVenueInfo !== undefined) data.rinkVenueInfo = dto.rinkVenueInfo;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.level !== undefined) data.level = dto.level;
    if (dto.levelCode !== undefined) data.levelCode = dto.levelCode;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.maxParticipants !== undefined)
      data.maxParticipants = dto.maxParticipants;
    if (dto.homeTeamName !== undefined) data.homeTeamName = dto.homeTeamName;
    if (dto.awayTeamName !== undefined) data.awayTeamName = dto.awayTeamName;
    if (dto.rules !== undefined) data.rules = dto.rules;
    if (dto.description !== undefined) data.description = dto.description;

    const updated = await this.prisma.pickupMatch.update({
      where: { id: matchId },
      data,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        rinkName: true,
        rinkAddress: true,
        rinkVenueInfo: true,
        price: true,
        level: true,
        levelCode: true,
        gender: true,
        maxParticipants: true,
        homeTeamName: true,
        awayTeamName: true,
        rules: true,
        description: true,
        status: true,
        updatedAt: true,
        updatedByUserId: true,
        manager: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // 승인/대기 신청자 전체에게 변경 알림 fanout (side-effect)
    const notifyTargets = await this.prisma.pickupMatchApplicant.findMany({
      where: {
        matchId,
        status: { in: ["approved", "pending"] },
      },
      select: { userId: true },
    });

    for (const applicant of notifyTargets) {
      // 주최자 본인은 제외
      if (applicant.userId === actor.id) continue;
      this.safeNotify({
        userId: applicant.userId,
        notificationType: "match_updated",
        title: "매치 정보가 변경되었습니다",
        message: `'${updated.title}' 매치 정보가 변경되었습니다. 상세 페이지에서 확인해주세요.`,
      });
    }

    return updated;
  }

  async apply(matchId: string, userId: string, dto: ApplyPickupMatchDto) {
    const match = await this.prisma.pickupMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        title: true,
        managerId: true,
        maxParticipants: true,
        status: true,
        _count: {
          select: { applicants: { where: { status: "approved" } } },
        },
      },
    });

    if (!match) throw new NotFoundException("매치를 찾을 수 없습니다.");
    if (match.status === "closed" || match.status === "cancelled") {
      throw new ForbiddenException("마감된 매치에는 신청할 수 없습니다.");
    }
    if (match._count.applicants >= match.maxParticipants) {
      throw new ForbiddenException("참가 인원이 모두 차서 신청할 수 없습니다.");
    }

    const existing = await this.prisma.pickupMatchApplicant.findUnique({
      where: { matchId_userId: { matchId, userId } },
    });
    if (existing) {
      throw new ConflictException("이미 신청한 매치입니다.");
    }

    const applicant = await this.prisma.pickupMatchApplicant.create({
      data: {
        matchId,
        userId,
        position: dto.position,
        level: dto.level,
        note: dto.note,
      },
      select: {
        id: true,
        matchId: true,
        status: true,
        paymentStatus: true,
        appliedAt: true,
      },
    });

    // 매니저에게 신청 접수 알림 (본인 신청 제외)
    if (match.managerId !== userId) {
      this.safeNotify({
        userId: match.managerId,
        notificationType: "match_applied",
        title: "새로운 매치 신청",
        message: `'${match.title}' 매치에 새 신청자가 도착했습니다.`,
      });
    }

    return applicant;
  }

  async getApplicants(matchId: string, actorId: string, userType?: string) {
    const match = await this.prisma.pickupMatch.findUnique({
      where: { id: matchId },
      select: { managerId: true, maxParticipants: true, status: true },
    });

    if (!match) throw new NotFoundException("매치를 찾을 수 없습니다.");
    if (!this.isAuthorizedManager(match.managerId, actorId, userType)) {
      throw new ForbiddenException(
        "신청자 목록은 주최자 또는 관리자만 조회할 수 있습니다.",
      );
    }

    const applicants = await this.prisma.pickupMatchApplicant.findMany({
      where: { matchId },
      select: {
        id: true,
        position: true,
        level: true,
        paymentStatus: true,
        status: true,
        note: true,
        rejectionReason: true,
        rejectedAt: true,
        refundedAt: true,
        refundAmount: true,
        appliedAt: true,
        user: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
      orderBy: { appliedAt: "asc" },
    });

    const approvedCount = applicants.filter(
      (a) => a.status === "approved",
    ).length;

    return {
      matchId,
      totalSlots: match.maxParticipants,
      approvedCount,
      applicants,
    };
  }

  async updateApplicantStatus(
    matchId: string,
    applicantId: string,
    actorId: string,
    status: "approved" | "rejected",
    userType?: string,
    rejectionReason?: string,
  ) {
    const match = await this.prisma.pickupMatch.findUnique({
      where: { id: matchId },
      select: { managerId: true, title: true, status: true },
    });

    if (!match) throw new NotFoundException("매치를 찾을 수 없습니다.");
    if (match.status === "cancelled") {
      throw new BadRequestException("이미 취소된 매치는 관리할 수 없습니다.");
    }
    if (!this.isAuthorizedManager(match.managerId, actorId, userType)) {
      throw new ForbiddenException(
        "신청 처리는 주최자 또는 관리자만 가능합니다.",
      );
    }

    const applicant = await this.prisma.pickupMatchApplicant.findUnique({
      where: { id: applicantId },
      select: { id: true, matchId: true, userId: true, status: true },
    });

    if (!applicant || applicant.matchId !== matchId) {
      throw new NotFoundException("신청자를 찾을 수 없습니다.");
    }

    const updateData: Prisma.PickupMatchApplicantUpdateInput =
      status === "rejected"
        ? {
            status,
            rejectedAt: new Date(),
            rejectionReason: rejectionReason ?? null,
          }
        : {
            status,
            rejectedAt: null,
            rejectionReason: null,
          };

    const updated = await this.prisma.pickupMatchApplicant.update({
      where: { id: applicantId },
      data: updateData,
      select: {
        id: true,
        status: true,
        rejectionReason: true,
        rejectedAt: true,
        updatedAt: true,
        userId: true,
      },
    });

    // 신청자에게 결과 알림
    this.safeNotify({
      userId: updated.userId,
      notificationType:
        status === "approved" ? "match_approved" : "match_rejected",
      title:
        status === "approved"
          ? "매치 신청이 승인되었습니다"
          : "매치 신청이 거절되었습니다",
      message:
        status === "approved"
          ? `'${match.title}' 매치 참가 신청이 승인되었습니다.`
          : `'${match.title}' 매치 참가 신청이 거절되었습니다.${
              rejectionReason ? ` 사유: ${rejectionReason}` : ""
            }`,
    });

    return {
      id: updated.id,
      status: updated.status,
      rejectionReason: updated.rejectionReason,
      rejectedAt: updated.rejectedAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * 신청자 일괄 거절 (주최자 또는 ADMIN/DIRECTOR 만).
   *
   * 트랜잭션 내에서 처리:
   * 1. 본 매치 소속 + pending 상태 신청자만 필터링
   * 2. 일괄 updateMany로 rejected 전환
   * 3. 각 거절 대상에게 알림 발송
   *
   * @returns { rejectedCount, skippedCount, reason }
   */
  async bulkRejectApplicants(
    matchId: string,
    actor: { id: string; userType?: string },
    dto: BulkRejectApplicantsDto,
  ) {
    const match = await this.assertCanManage(matchId, actor);

    // 트랜잭션: 유효한 신청자만 선별 → 일괄 업데이트
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 요청된 ID 중 본 매치 소속 + 처리 가능한(pending) 상태만 선별
      const eligible = await tx.pickupMatchApplicant.findMany({
        where: {
          id: { in: dto.applicantIds },
          matchId,
          status: "pending",
        },
        select: { id: true, userId: true },
      });

      const eligibleIds = eligible.map((e) => e.id);
      const rejectedAt = new Date();

      if (eligibleIds.length > 0) {
        await tx.pickupMatchApplicant.updateMany({
          where: { id: { in: eligibleIds } },
          data: {
            status: "rejected",
            rejectionReason: dto.rejectionReason,
            rejectedAt,
          },
        });
      }

      return {
        rejectedApplicants: eligible,
        rejectedCount: eligibleIds.length,
        skippedCount: dto.applicantIds.length - eligibleIds.length,
      };
    });

    // 거절된 각 신청자에게 알림 발송 (트랜잭션 외부, side-effect)
    for (const applicant of result.rejectedApplicants) {
      this.safeNotify({
        userId: applicant.userId,
        notificationType: "match_rejected",
        title: "매치 신청이 거절되었습니다",
        message: `'${match.title}' 매치 참가 신청이 거절되었습니다. 사유: ${dto.rejectionReason}`,
      });
    }

    return {
      matchId,
      rejectedCount: result.rejectedCount,
      skippedCount: result.skippedCount,
      reason: dto.rejectionReason,
    };
  }

  /**
   * 매치 취소 (레거시 DELETE /:id 엔드포인트용 — reason 없이 호출).
   *
   * @deprecated 신규 플로우는 `cancelWithReason` 사용 권장.
   */
  async cancel(matchId: string, actorId: string, userType?: string) {
    return this.cancelWithReason(matchId, { id: actorId, userType }, undefined);
  }

  /**
   * 매치 취소 + PG 환불 처리.
   *
   * 1단계 (트랜잭션):
   *   - 매치 상태 → `cancelled` + `cancelledAt` + `cancelledReason` 기록
   *   - 승인(`approved`) + 결제완료(`paid`) 신청자 조회
   *   - paymentId 있는 신청자: `refund_pending` 상태로 전환 (PG 환불 대기)
   *   - paymentId 없는 신청자: `refunded` 상태로 직접 전환 (레거시 데이터 호환)
   *   - 알림 대상 수집
   *
   * 2단계 (트랜잭션 외부 — PG 호출은 외부 API이므로 트랜잭션 안에서 호출 금지):
   *   - paymentId 있는 각 신청자에 대해 PaymentsService.cancelPayment() 호출
   *   - PG 환불 성공 → `refunded` 상태로 업데이트
   *   - PG 환불 실패 → `refund_failed` 상태로 업데이트 (수동 재처리 대상)
   *   - 이미 환불 완료된 건 스킵 (멱등성 보장)
   *
   * 3단계 (알림 fanout):
   *   - 승인·대기 신청자 전체에게 `match_cancelled` 알림
   *
   * @param actor 취소 요청자 (주최자 또는 ADMIN/DIRECTOR/ACADEMY_DIRECTOR)
   * @param reason 취소 사유 (선택)
   */
  async cancelWithReason(
    matchId: string,
    actor: { id: string; userType?: string },
    reason?: string,
  ) {
    // allowCancelled=false → 이미 취소된 매치면 BadRequest
    const match = await this.assertCanManage(matchId, actor);

    const cancelReason = reason ?? "매치 취소에 따른 환불";

    // ── 1단계: 트랜잭션 (DB 상태 변경 + 환불 대상 수집) ──
    // 대량 신청자(수백 명) 환불 + 알림 대상 조회가 포함되므로
    // Prisma 기본 트랜잭션 타임아웃(5초)을 10초로 확장한다 (Phase 4-C 최적화).
    const { updated, pgRefundTargets, legacyRefundedCount, notifyTargets } =
      await this.prisma.$transaction(
        async (tx) => {
          // 1-1. 매치 상태 업데이트
          const updatedMatch = await tx.pickupMatch.update({
            where: { id: matchId },
            data: {
              status: "cancelled",
              cancelledAt: new Date(),
              cancelledReason: reason ?? null,
              updatedBy: { connect: { id: actor.id } },
            },
            select: {
              id: true,
              status: true,
              cancelledAt: true,
              cancelledReason: true,
              price: true,
            },
          });

          // 1-2. 환불 대상 조회: 승인 + 결제완료 신청자
          const refundTargets = await tx.pickupMatchApplicant.findMany({
            where: {
              matchId,
              status: "approved",
              paymentStatus: "paid",
            },
            select: {
              id: true,
              userId: true,
              paymentId: true,
              paymentStatus: true,
            },
          });

          // 1-3. paymentId 유무에 따라 분기 처리
          const withPaymentId = refundTargets.filter((a) => a.paymentId);
          const withoutPaymentId = refundTargets.filter((a) => !a.paymentId);

          // paymentId 있는 건: refund_pending 상태로 전환 (PG 환불 대기)
          if (withPaymentId.length > 0) {
            await tx.pickupMatchApplicant.updateMany({
              where: {
                id: { in: withPaymentId.map((a) => a.id) },
              },
              data: {
                paymentStatus: "refund_pending",
              },
            });
          }

          // paymentId 없는 건 (레거시): 직접 refunded 처리
          if (withoutPaymentId.length > 0) {
            await tx.pickupMatchApplicant.updateMany({
              where: {
                id: { in: withoutPaymentId.map((a) => a.id) },
              },
              data: {
                paymentStatus: "refunded",
                refundedAt: new Date(),
                refundAmount: updatedMatch.price,
              },
            });
          }

          // 1-4. 알림 대상: 승인/대기 상태 전체
          const notifyList = await tx.pickupMatchApplicant.findMany({
            where: { matchId, status: { in: ["approved", "pending"] } },
            select: { userId: true },
          });

          return {
            updated: updatedMatch,
            pgRefundTargets: withPaymentId,
            legacyRefundedCount: withoutPaymentId.length,
            notifyTargets: notifyList,
          };
        },
        { timeout: 10000, maxWait: 5000 },
      );

    // ── 2단계: PG 환불 (트랜잭션 외부 — 외부 API 호출) ──
    let pgRefundedCount = 0;
    let pgRefundFailedCount = 0;

    for (const target of pgRefundTargets) {
      // 멱등성: 이미 환불 완료된 건은 스킵
      if (target.paymentStatus === "refunded") {
        pgRefundedCount++;
        continue;
      }

      try {
        await this.paymentsService.cancelPayment(
          target.paymentId!,
          cancelReason,
          updated.price, // 전액 환불 (참가비 = 매치 price)
          undefined,
          undefined,
          undefined,
          // [2026-06-10 SECURITY] 매치 호스트 권한은 assertCanManage 에서 이미 검증됨.
          //   참가자(타인) 결제를 일괄 환불하는 신뢰된 내부 호출이므로 trusted 로 소유권 검증 우회.
          { trusted: true },
        );

        // PG 환불 성공 → DB 상태 업데이트
        await this.prisma.pickupMatchApplicant.update({
          where: { id: target.id },
          data: {
            paymentStatus: "refunded",
            refundedAt: new Date(),
            refundAmount: updated.price,
          },
        });

        pgRefundedCount++;
        this.logger.log(
          `[PickupMatch] PG 환불 성공: matchId=${matchId}, applicantId=${target.id}, paymentId=${target.paymentId}`,
        );
      } catch (error: unknown) {
        pgRefundFailedCount++;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[PickupMatch] PG 환불 실패: matchId=${matchId}, applicantId=${target.id}, paymentId=${target.paymentId}, error=${message}`,
        );

        // PG 환불 실패 → refund_failed 상태로 업데이트 (수동 재처리 대상)
        await this.prisma.pickupMatchApplicant.update({
          where: { id: target.id },
          data: {
            paymentStatus: "refund_failed",
          },
        });
      }
    }

    if (pgRefundFailedCount > 0) {
      this.logger.warn(
        `[PickupMatch] 매치 취소 환불 완료 — 성공: ${pgRefundedCount}건, 실패: ${pgRefundFailedCount}건 (수동 재처리 필요), matchId=${matchId}`,
      );
    }

    // ── 3단계: 알림 fanout (트랜잭션 외부, side-effect) ──
    for (const applicant of notifyTargets) {
      this.safeNotify({
        userId: applicant.userId,
        notificationType: "match_cancelled",
        title: "매치가 취소되었습니다",
        message: reason
          ? `'${match.title}' 매치가 취소되었습니다. 사유: ${reason}`
          : `'${match.title}' 매치가 취소되었습니다. 자세한 내용은 주최자에게 문의해주세요.`,
      });
    }

    const totalRefundedCount = legacyRefundedCount + pgRefundedCount;

    return {
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt,
      cancelledReason: updated.cancelledReason,
      refundedCount: totalRefundedCount,
      refundFailedCount: pgRefundFailedCount,
      notifiedCount: notifyTargets.length,
    };
  }

  async leave(matchId: string, userId: string) {
    const applicant = await this.prisma.pickupMatchApplicant.findUnique({
      where: { matchId_userId: { matchId, userId } },
      select: { id: true, status: true },
    });

    if (!applicant) throw new NotFoundException("참가 신청 내역이 없습니다.");

    await this.prisma.pickupMatchApplicant.delete({
      where: { matchId_userId: { matchId, userId } },
    });

    // 참가자 감소 시 status 재계산
    const remaining = await this.prisma.pickupMatchApplicant.count({
      where: { matchId, status: "approved" },
    });
    const match = await this.prisma.pickupMatch.findUnique({
      where: { id: matchId },
      select: {
        maxParticipants: true,
        status: true,
        managerId: true,
        title: true,
      },
    });
    if (match && match.status !== "cancelled") {
      const newStatus =
        remaining >= match.maxParticipants
          ? "closed"
          : remaining >= match.maxParticipants * 0.8
            ? "closing_soon"
            : "recruiting";
      if (newStatus !== match.status) {
        await this.prisma.pickupMatch.update({
          where: { id: matchId },
          data: { status: newStatus },
        });
      }

      // 매니저에게 이탈 알림 (본인 이탈 제외)
      if (match.managerId !== userId) {
        this.safeNotify({
          userId: match.managerId,
          notificationType: "match_left",
          title: "매치 신청자 이탈",
          message: `'${match.title}' 매치에서 참가자 1명이 이탈했습니다.`,
        });
      }
    }

    return { message: "참가 신청이 취소되었습니다." };
  }

  async getMyAppliedMatches(userId: string) {
    const applications = await this.prisma.pickupMatchApplicant.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        rejectionReason: true,
        rejectedAt: true,
        refundedAt: true,
        refundAmount: true,
        appliedAt: true,
        match: {
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            rinkName: true,
            price: true,
            level: true,
            status: true,
            cancelledAt: true,
            cancelledReason: true,
          },
        },
      },
      orderBy: { appliedAt: "desc" },
    });

    return applications;
  }

  /**
   * 매치 조회수 증가 — 1일 1회 제한 (DailyViewLog UNIQUE 기반).
   *
   * - `userId`가 없으면(비로그인) 증가 없이 현재 viewCount만 반환
   * - 이미 오늘 조회한 사용자는 중복 증가 없이 현재 viewCount 반환
   * - DailyViewLog UNIQUE(entity_type + entity_id + user_id + viewed_date)로
   *   동시 요청에도 원자적으로 중복 차단
   *
   * @returns `{ viewCount, incremented }`
   */
  async incrementViewCount(
    matchId: string,
    userId: string | null | undefined,
  ): Promise<{ viewCount: number; incremented: boolean }> {
    // 1. 매치 존재 확인 (취소된 매치도 조회는 허용)
    const match = await this.prisma.pickupMatch.findUnique({
      where: { id: matchId },
      select: { id: true, viewCount: true },
    });
    if (!match) throw new NotFoundException("매치를 찾을 수 없습니다.");

    // 2. 비로그인: 현재 값만 반환
    if (!userId) {
      return { viewCount: match.viewCount, incremented: false };
    }

    // 3. 1일 1회 체크 — KST 기준 오늘 날짜
    const viewedDate = this.getKstDateString();

    try {
      // DailyViewLog create 시 UNIQUE 제약 위반(P2002)이면 이미 오늘 조회한 것
      const { viewCount } = await this.prisma.$transaction(async (tx) => {
        await tx.dailyViewLog.create({
          data: {
            entityType: DAILY_VIEW_ENTITY_TYPE,
            entityId: matchId,
            userId,
            viewedDate,
          },
        });
        const updated = await tx.pickupMatch.update({
          where: { id: matchId },
          data: { viewCount: { increment: 1 } },
          select: { viewCount: true },
        });
        return updated;
      });
      return { viewCount, incremented: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // 이미 오늘 조회한 기록 → 현재 값 그대로 반환
        return { viewCount: match.viewCount, incremented: false };
      }
      // 기타 오류는 경고 로그만 남기고 현재 값 반환 (조회 기능 보호)
      this.logger.warn(
        `[PickupMatches] incrementViewCount 실패 matchId=${matchId} userId=${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { viewCount: match.viewCount, incremented: false };
    }
  }

  /**
   * KST(Asia/Seoul) 기준 오늘 날짜를 'YYYY-MM-DD' 형식으로 반환.
   *
   * ViewCounterService와 동일한 규칙을 유지하여
   * 같은 `user_id + viewed_date` 경계가 전 프로젝트에 일관되게 적용되도록 함.
   */
  private getKstDateString(): string {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const year = parts.find((p) => p.type === "year")?.value ?? "1970";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";

    return `${year}-${month}-${day}`;
  }

  /**
   * 알림 발송 헬퍼 — NotificationsService가 주입되지 않았거나
   * 발송에 실패해도 메인 로직에 영향을 주지 않는다.
   */
  private safeNotify(dto: {
    userId: string;
    notificationType: string;
    title: string;
    message: string;
  }): void {
    if (!this.notifications) {
      return;
    }
    this.notifications.createNotification(dto).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[PickupMatches] 알림 발송 실패 userId=${dto.userId} type=${dto.notificationType}: ${message}`,
      );
    });
  }
}
