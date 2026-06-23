import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { AlimtalkGateway } from "@/notifications/alimtalk.gateway";
import {
  CreateEquipmentInspectionDto,
  UpdateEquipmentInspectionDto,
} from "./dto/equipment-inspection.dto";

/**
 * EquipmentInspectionService — 장비 점검 리포트 CRUD + 이상 발견 시 알림.
 *
 * 흐름:
 *  1. create() → items 트랜잭션 일괄 생성 + condition='critical' 1개 이상이면 status='issue_found'
 *  2. issue_found 인 경우 AlimtalkGateway 가 팀 코치/감독에게 알림톡 발송 (best-effort, 실패해도 점검 기록은 성공)
 *  3. update() 로 status='completed' 변경 + 메모 보강 가능
 *
 * 권한:
 *  - 코치/감독/관리자만 생성/수정/삭제 (Controller @Roles 에서 강제)
 *  - 학부모/학생은 자기 팀의 점검 리포트 조회만 가능 (Controller list 메서드에서 분기)
 */
@Injectable()
export class EquipmentInspectionService {
  private readonly logger = new Logger(EquipmentInspectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(AlimtalkGateway)
    private readonly alimtalkGateway?: AlimtalkGateway,
  ) {}

  async create(inspectorId: string, dto: CreateEquipmentInspectionDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException("점검 항목이 1개 이상 필요합니다.");
    }
    // critical condition + missing issueDetail 검증
    const invalidItem = dto.items.find(
      (it) =>
        it.condition &&
        it.condition !== "good" &&
        it.condition !== "replaced" &&
        (!it.issueDetail || it.issueDetail.trim().length === 0),
    );
    if (invalidItem) {
      throw new BadRequestException(
        `이상이 있는 항목은 issueDetail 이 필수입니다: ${invalidItem.itemName}`,
      );
    }

    const hasCritical = dto.items.some((it) => it.condition === "critical");
    const status = hasCritical ? "issue_found" : "pending";

    const inspection = await this.prisma.$transaction(async (tx) => {
      const created = await tx.equipmentInspection.create({
        data: {
          teamId: dto.teamId,
          inspectorId,
          venueId: dto.venueId ?? null,
          inspectedAt: dto.inspectedAt ? new Date(dto.inspectedAt) : new Date(),
          status,
          notes: dto.notes ?? null,
        },
      });
      await tx.inspectionItem.createMany({
        data: dto.items.map((it, idx) => ({
          inspectionId: created.id,
          category: it.category,
          itemName: it.itemName,
          condition: it.condition ?? "good",
          issueDetail: it.issueDetail ?? null,
          photoUrl: it.photoUrl ?? null,
          needsAction:
            it.needsAction ??
            (it.condition === "critical" || it.condition === "minor_issue"),
          assigneeId: it.assigneeId ?? null,
          sortOrder: it.sortOrder ?? idx,
        })),
      });
      return created;
    });

    // 이상 발견 시 알림톡 (fire-and-forget, 트랜잭션 외부)
    if (hasCritical && this.alimtalkGateway && !inspection.notified) {
      void this.notifyIssue(inspection.id, dto.teamId).catch((err) =>
        this.logger.warn(
          `Alimtalk notify failed: inspectionId=${inspection.id}, err=${err instanceof Error ? err.message : err}`,
        ),
      );
    }

    return this.findOne(inspection.id);
  }

  async findOne(id: string) {
    const row = await this.prisma.equipmentInspection.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        inspector: { select: { id: true, firstName: true } },
        team: { select: { id: true, name: true } },
      },
    });
    if (!row) {
      throw new NotFoundException("점검 리포트를 찾을 수 없습니다.");
    }
    return row;
  }

  async listByTeam(
    teamId: string,
    opts: { status?: string; page?: number; limit?: number },
  ) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit =
      opts.limit && opts.limit > 0 && opts.limit <= 100 ? opts.limit : 20;
    const where: { teamId: string; status?: string } = { teamId };
    if (opts.status) where.status = opts.status;

    const [items, total] = await Promise.all([
      this.prisma.equipmentInspection.findMany({
        where,
        orderBy: { inspectedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          inspector: { select: { id: true, firstName: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.equipmentInspection.count({ where }),
    ]);
    return { total, page, limit, data: items };
  }

  async update(id: string, dto: UpdateEquipmentInspectionDto) {
    await this.findOne(id); // 존재 확인
    return this.prisma.equipmentInspection.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: {
        items: { orderBy: { sortOrder: "asc" } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.equipmentInspection.delete({ where: { id } });
    return { success: true };
  }

  /**
   * critical issue 발견 시 팀 코치/감독에게 알림톡.
   * notified flag 로 중복 발송 차단.
   */
  private async notifyIssue(inspectionId: string, teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true, coachId: true },
    });
    if (!team?.coachId) {
      this.logger.debug(
        `notify skipped — team coach unavailable: teamId=${teamId}`,
      );
      return;
    }
    const coach = await this.prisma.user.findUnique({
      where: { id: team.coachId },
      select: { phone: true, firstName: true },
    });
    if (!coach?.phone) {
      this.logger.debug(
        `notify skipped — coach phone unavailable: coachId=${team.coachId}`,
      );
      return;
    }

    try {
      // Alimtalk 발송 — 템플릿은 EQUIPMENT_ISSUE_001 (DB seed 필요)
      // 미등록 상태에서는 fallback 으로 SMS 전송됨 (AlimtalkGateway 내부 처리)
      await this.alimtalkGateway?.sendAlimtalk({
        templateCode: "EQUIPMENT_ISSUE_001",
        phone: coach.phone,
        templateData: {
          coachName: coach.firstName ?? "코치",
          teamName: team.name,
        },
      });
      await this.prisma.equipmentInspection.update({
        where: { id: inspectionId },
        data: { notified: true },
      });
    } catch (err) {
      this.logger.error(
        `Alimtalk failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
