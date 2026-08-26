import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { instantToKstDateOnly } from "@/common/utils/kst-date.util";
import {
  PaymentRefundService,
  RefundExecutionError,
  RefundExecutionContext,
} from "../services/payment-refund.service";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";
import {
  ApproveRefundRequestDto,
  RejectRefundRequestDto,
  ReprocessRefundRequestDto,
  ReconcileRefundRequestDto,
} from "./dto/decision-refund-request.dto";
import { ListRefundRequestQueryDto } from "./dto/list-refund-request-query.dto";
import {
  REFUND_REQUEST_ACTIVE_STATUSES as ACTIVE_STATUSES,
  REFUND_PG_UNCONFIRMED_CODES,
} from "./refund-request.constants";

/** Team.coachId(owner) 외에 팀 관리자로 인정하는 승인 멤버 역할(N1 알림 라우팅). */
const TEAM_MANAGER_ROLES = ["HEAD_COACH", "COACH", "MANAGER"];

/**
 * 법정 청약철회 기간(전자상거래법 §17①) — 결제일 기준 7일.
 * 이 기간 내 + 이용 개시 전이면 전액 환불 대상이다.
 */
const LEGAL_WITHDRAWAL_DAYS = 7;

/**
 * 환불 요청 접수 상한(결제일 기준, 일).
 *
 * 계속거래 중도해지권(방문판매법 §31)은 청약철회 기간과 별개라 기간 경과만으로
 * 환불 경로를 소실시킬 수 없다. 경과분은 차단 대신 이용분을 공제한 비례 환급
 * 요청으로 접수하고, 무기한 소급 청구만 이 상한으로 막는다.
 */
const REFUND_REQUEST_MAX_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 거절 시 소비자에게 함께 제공하는 이의제기 안내 (전자상거래법 §6 분쟁 기록 3년 보존 취지).
 * 거절이 최종 통보로 읽히지 않도록 응답·알림에 동일 문구를 싣는다.
 */
const REFUND_APPEAL_GUIDE =
  "환불 거절에 이의가 있으시면 고객센터로 재심을 요청할 수 있습니다. 처리 결과에 동의하지 않으실 경우 한국소비자원(1372) 또는 전자거래분쟁조정위원회에 조정을 신청할 수 있습니다.";

/** 활성(대기·처리 중·실패 미해소) 상태 — 목록 정렬 우선순위 계산용. */
const ACTIVE_STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  executing: 1,
  execution_failed: 2,
};

/** 요청 생성 시 스냅샷할 도메인 스코프. */
interface DomainScope {
  sourceType:
    | "CLASS_PREPAID"
    | "CLASS_POSTPAID"
    | "TOURNAMENT"
    | "PICKUP_MATCH";
  classId: string | null;
  tournamentId: string | null;
  teamId: string | null;
  academyId: string | null;
  childId: string | null;
}

/** 응답/알림에 필요한 RefundRequest 필드 select (over-fetch 방지). */
const RESPONSE_SELECT = {
  id: true,
  paymentId: true,
  requesterId: true,
  childId: true,
  status: true,
  sourceType: true,
  classId: true,
  tournamentId: true,
  teamId: true,
  academyId: true,
  requestReason: true,
  requestedAmount: true,
  approvedAmount: true,
  decidedBy: true,
  decidedAt: true,
  decisionReason: true,
  executionStartedAt: true,
  executedAt: true,
  failureStage: true,
  failureCode: true,
  failureReason: true,
  pgRefundSucceededAt: true,
  version: true,
  createdAt: true,
} satisfies Prisma.RefundRequestSelect;

type RefundRequestRow = Prisma.RefundRequestGetPayload<{
  select: typeof RESPONSE_SELECT;
}>;

/** 목록(E2) select — subjectLabel/이름 표기용 최소 필드. */
const LIST_SELECT = {
  id: true,
  status: true,
  sourceType: true,
  classId: true,
  tournamentId: true,
  paymentId: true,
  childId: true,
  requestedAmount: true,
  createdAt: true,
  requester: { select: { firstName: true, lastName: true } },
  child: { select: { firstName: true, lastName: true } },
} satisfies Prisma.RefundRequestSelect;

type RefundListRow = Prisma.RefundRequestGetPayload<{
  select: typeof LIST_SELECT;
}>;

@Injectable()
export class RefundRequestService {
  private readonly logger = new Logger(RefundRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly refundService: PaymentRefundService,
    private readonly resourceAccess: ResourceAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  // ──────────────────────────────────────────────────────────────
  //  E1. 요청 생성 (PARENT)
  // ──────────────────────────────────────────────────────────────
  async create(
    dto: CreateRefundRequestDto,
    user: JwtUserPayload,
  ): Promise<RefundRequestRow> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      select: {
        id: true,
        userId: true,
        paymentStatus: true,
        amount: true,
        completedAt: true,
        createdAt: true,
      },
    });
    if (!payment) {
      throw new NotFoundException("결제 기록을 찾을 수 없습니다.");
    }
    // 소유권 — 본인 결제만.
    if (payment.userId !== user.id) {
      throw new ForbiddenException("본인 결제만 환불 요청할 수 있습니다.");
    }
    // 완료된 결제만.
    if (payment.paymentStatus !== "completed") {
      throw new BadRequestException("완료된 결제만 환불을 요청할 수 있습니다.");
    }
    // 요청 접수 상한 — 기간 경과분도 비례 환급으로 접수하되 무기한 소급만 차단한다.
    const paidAt = payment.completedAt ?? payment.createdAt;
    const elapsedDays = (Date.now() - paidAt.getTime()) / DAY_MS;
    if (elapsedDays > REFUND_REQUEST_MAX_DAYS) {
      throw new BadRequestException(
        `환불 요청 가능 기간(결제일로부터 ${REFUND_REQUEST_MAX_DAYS}일)이 지났습니다. 고객센터로 문의해주세요.`,
      );
    }

    // 도메인 판별 (fail-closed) — 지원하지 않는 결제(쇼핑 등)는 422.
    const domain = await this.resolveDomainScope(payment.id);
    if (!domain) {
      throw new UnprocessableEntityException(
        "환불 요청을 지원하지 않는 결제입니다.",
      );
    }

    // 요청 금액은 서버가 산정한다(클라이언트 입력 없음).
    //   법정 청약철회 기간 내 + 이용 개시 전 → 전액,
    //   그 외(기간 경과·이용 개시분) → 이용분을 공제한 비례 환급액.
    const quote = await this.refundService.computeRefundQuote(payment.id);
    const withinWithdrawal = elapsedDays <= LEGAL_WITHDRAWAL_DAYS;
    const requestedAmount =
      withinWithdrawal && !quote.started
        ? Number(payment.amount)
        : quote.refundableAmount;
    if (requestedAmount <= 0) {
      throw new BadRequestException(
        `환불 가능 잔액이 없습니다. (${quote.calculationNote})`,
      );
    }

    try {
      const created = await this.prisma.refundRequest.create({
        data: {
          paymentId: payment.id,
          requesterId: user.id,
          childId: domain.childId,
          sourceType: domain.sourceType,
          classId: domain.classId,
          tournamentId: domain.tournamentId,
          teamId: domain.teamId,
          academyId: domain.academyId,
          status: "pending",
          requestReason: dto.reason,
          requestedAmount,
        },
        select: RESPONSE_SELECT,
      });

      // N1: 요청 → 소속 감독/아카데미.
      await this.notifyRequestCreated(created);
      return created;
    } catch (err) {
      // 활성 중복 요청(partial unique index 위반) → 409.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("이미 처리 중인 환불 요청이 있습니다.");
      }
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  E2. 관리자 목록
  // ──────────────────────────────────────────────────────────────
  async list(query: ListRefundRequestQueryDto, user: JwtUserPayload) {
    const permission = await this.buildPermissionWhere(user);
    const baseAnd: Prisma.RefundRequestWhereInput[] = [permission];
    if (query.teamId) baseAnd.push({ teamId: query.teamId });
    if (query.academyId) baseAnd.push({ academyId: query.academyId });
    if (query.scope === "team") baseAnd.push({ teamId: { not: null } });
    if (query.scope === "academy") baseAnd.push({ academyId: { not: null } });

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const statusFilter =
      query.status && query.status !== "all" ? query.status : null;

    // [R6-Major1] embedded pendingCount 는 baseAnd(teamId/academyId/scope 필터 + permission)를
    //   동일 적용 — teamId=A 필터 목록이면 A 범위만 집계(E8 pending-count 엔드포인트와 일치).
    const pendingCount = await this.prisma.refundRequest.count({
      where: { AND: [...baseAnd, { status: "pending" }] },
    });

    // [Major 4] 명시 분리 계약: activeItems(전체 활성) + historyItems(이력 페이지) + pagination(이력 전용).
    //   단일 status 필터 시 activeItems=[], 해당 상태를 historyItems+pagination 으로 반환.
    if (statusFilter) {
      const where: Prisma.RefundRequestWhereInput = {
        AND: [...baseAnd, { status: statusFilter }],
      };
      const [total, pageRows] = await Promise.all([
        this.prisma.refundRequest.count({ where }),
        this.prisma.refundRequest.findMany({
          where,
          select: LIST_SELECT,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return {
        activeItems: [],
        historyItems: await this.buildListItems(pageRows),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
        pendingCount,
      };
    }

    // 필터 없음/all: 활성(pending·executing·execution_failed) 전체 + 이력(나머지) 페이지네이션 분리.
    const activeWhere: Prisma.RefundRequestWhereInput = {
      AND: [...baseAnd, { status: { in: ACTIVE_STATUSES } }],
    };
    const historyWhere: Prisma.RefundRequestWhereInput = {
      AND: [...baseAnd, { status: { notIn: ACTIVE_STATUSES } }],
    };
    const [activeRows, historyTotal, historyRows] = await Promise.all([
      this.prisma.refundRequest.findMany({
        where: activeWhere,
        select: LIST_SELECT,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.refundRequest.count({ where: historyWhere }),
      this.prisma.refundRequest.findMany({
        where: historyWhere,
        select: LIST_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    // 활성 우선순위 정렬(pending·executing·execution_failed) → createdAt desc.
    const sortedActiveRows = [...activeRows].sort((a, b) => {
      const pa = ACTIVE_STATUS_PRIORITY[a.status] ?? 99;
      const pb = ACTIVE_STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return {
      activeItems: await this.buildListItems(sortedActiveRows),
      historyItems: await this.buildListItems(historyRows),
      pagination: {
        page,
        limit,
        total: historyTotal, // 이력 전용 기준(활성은 activeItems 로 전량 노출).
        totalPages: Math.ceil(historyTotal / limit) || 1,
      },
      pendingCount,
    };
  }

  /** 목록 아이템 매핑 — subjectLabel 배치 조회(N+1 방지) 후 DTO 형태로 변환. */
  private async buildListItems(rows: RefundListRow[]) {
    const subjectLabels = await this.loadSubjectLabels(rows);
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      sourceType: r.sourceType,
      subjectLabel:
        (r.classId ? subjectLabels.classes.get(r.classId) : undefined) ??
        (r.tournamentId
          ? subjectLabels.tournaments.get(r.tournamentId)
          : undefined) ??
        "-",
      requesterName: this.fullName(r.requester),
      childName: r.child ? this.fullName(r.child) : null,
      amount: r.requestedAmount,
      createdAt: r.createdAt,
      waitingMinutes: Math.max(
        0,
        Math.floor((now - r.createdAt.getTime()) / 60000),
      ),
      riskFlags: {
        used: false, // 이용 개시 정밀 판단은 상세(E3)에서 — 목록은 후불/대회 표식만.
        postpaid: r.sourceType === "CLASS_POSTPAID",
        tournament: r.sourceType === "TOURNAMENT",
      },
    }));
  }

  // ──────────────────────────────────────────────────────────────
  //  E3. 상세
  // ──────────────────────────────────────────────────────────────
  async detail(requestId: string, user: JwtUserPayload) {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: {
        ...RESPONSE_SELECT,
        requester: {
          select: { firstName: true, lastName: true, phone: true },
        },
        child: { select: { firstName: true, lastName: true } },
        decider: { select: { firstName: true, lastName: true } },
        payment: {
          select: {
            orderNumber: true,
            amount: true,
            paymentMethod: true,
            tid: true,
            paymentStatus: true,
            completedAt: true,
            createdAt: true,
            product: { select: { productName: true } },
          },
        },
      },
    });
    if (!rr) {
      throw new NotFoundException("환불 요청을 찾을 수 없습니다.");
    }

    // 스코프 재검증 (ADMIN 통과, 범위 밖 403).
    await this.assertCanManage(rr, user);

    const subjectLabels = await this.loadSubjectLabels([rr]);
    const subjectLabel =
      (rr.classId ? subjectLabels.classes.get(rr.classId) : undefined) ??
      (rr.tournamentId
        ? subjectLabels.tournaments.get(rr.tournamentId)
        : undefined) ??
      "-";

    // 사용현황(판단자료) — 원본 미존재(sourceOk=false)·subject 미해석·예외 시 judgmentDataOk=false
    //   강제(프론트 fail-closed — 판단자료 없으면 승인 CTA 닫힘).
    let usage: unknown = null;
    let judgmentDataOk = true;
    const subjectResolved = subjectLabel !== "-";
    try {
      const computed = await this.computeUsage(rr);
      usage = computed;
      judgmentDataOk = computed.sourceOk && subjectResolved;
    } catch (err) {
      judgmentDataOk = false;
      this.logger.warn(
        `사용현황 조회 실패 — judgmentDataOk=false: requestId=${requestId}, error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // 기존 환불 이력.
    const refundLogs = await this.prisma.refundLog.findMany({
      where: { paymentId: rr.paymentId },
      select: {
        id: true,
        refundAmount: true,
        refundReason: true,
        processedAt: true,
        actorId: true,
      },
      orderBy: { processedAt: "desc" },
    });

    return {
      id: rr.id,
      status: rr.status,
      sourceType: rr.sourceType,
      subjectLabel,
      version: rr.version,
      // [Major 6] 프론트 URL 컨텍스트 대조용 소속 스코프.
      scope: {
        sourceType: rr.sourceType,
        teamId: rr.teamId,
        academyId: rr.academyId,
      },
      payment: {
        orderNumber: rr.payment?.orderNumber ?? null,
        amount: rr.payment?.amount ?? rr.requestedAmount,
        paymentMethod: rr.payment?.paymentMethod ?? null,
        tid: this.maskTid(rr.payment?.tid ?? null),
        currentStatus: rr.payment?.paymentStatus ?? null,
        completedAt: rr.payment?.completedAt ?? null,
        product: rr.payment?.product?.productName ?? subjectLabel,
      },
      request: {
        requesterName: this.fullName(rr.requester),
        requesterPhone: rr.requester?.phone ?? null,
        childName: rr.child ? this.fullName(rr.child) : null,
        requestReason: rr.requestReason,
        requestedAmount: rr.requestedAmount,
        createdAt: rr.createdAt,
      },
      usage,
      judgmentDataOk,
      snapshotVsCurrent: {
        requestedStatusAtCreate: "completed",
        requestedAmount: rr.requestedAmount,
        currentPaymentStatus: rr.payment?.paymentStatus ?? null,
      },
      decision: {
        decidedBy: rr.decidedBy,
        decidedByName: rr.decider ? this.fullName(rr.decider) : null,
        decidedAt: rr.decidedAt,
        decisionReason: rr.decisionReason,
        failureStage: rr.failureStage,
        failureCode: rr.failureCode,
        failureReason: rr.failureReason,
      },
      // 거절 건은 이의제기 경로를 함께 노출한다 — 거절이 최종 통보로 읽히지 않게.
      appealGuide: rr.status === "rejected" ? REFUND_APPEAL_GUIDE : null,
      history: refundLogs,
    };
  }

  // ──────────────────────────────────────────────────────────────
  //  E4. 승인 = 실행
  // ──────────────────────────────────────────────────────────────
  async approve(
    requestId: string,
    dto: ApproveRefundRequestDto,
    user: JwtUserPayload,
  ): Promise<RefundRequestRow> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: RESPONSE_SELECT,
    });
    if (!rr) {
      throw new NotFoundException("환불 요청을 찾을 수 없습니다.");
    }
    await this.assertCanManage(rr, user);
    // DIRECT(관리자 직접 환불 시스템 원장)는 승인 대상이 아니다(reprocess 만 허용).
    if (rr.sourceType === "DIRECT") {
      throw new BadRequestException("직접 환불 요청은 승인 대상이 아닙니다.");
    }

    // CAS 선점: pending + version → executing. idempotencyKey 저장(PG 멱등).
    const idempotencyKey = `rr:${requestId}`;
    const cas = await this.prisma.refundRequest.updateMany({
      where: { id: requestId, status: "pending", version: dto.version },
      data: {
        status: "executing",
        executionStartedAt: new Date(),
        decidedBy: user.id,
        decidedAt: new Date(),
        decisionReason: dto.memo ?? null,
        idempotencyKey,
        version: { increment: 1 },
      },
    });
    if (cas.count === 0) {
      throw new ConflictException("다른 담당자가 이미 처리했습니다.");
    }
    const expectedVersion = dto.version + 1;

    // 결제 단위 멱등·완료 재검증은 cancelPayment 의 Payment CAS(completed→refund_processing)가
    //   단일 초크포인트로 담당한다. 실패 시 RefundExecutionError('PG','PAYMENT_NOT_AVAILABLE') →
    //   아래 catch 에서 execution_failed(200) 전이(동시 실행 loser 자기치유).
    const ctx: RefundExecutionContext = {
      refundRequestId: requestId,
      actorId: user.id,
      expectedVersion,
      idempotencyKey,
      creditPolicy: await this.resolveCreditPolicy(rr.paymentId),
    };
    await this.recordDecisionAudit(rr, user, "approved", dto.memo ?? null);

    try {
      await this.runExecution(
        rr,
        user,
        ctx,
        `환불 승인 실행 — ${dto.memo ?? rr.requestReason}`,
      );
      await this.notifyDecision(rr, "executed");
    } catch (err) {
      if (err instanceof RefundExecutionError) {
        await this.markExecutionFailed(
          requestId,
          expectedVersion,
          err.stage,
          err.code,
          err.message,
          err.pgRefundSucceededAt,
        );
        return this.reload(requestId);
      }
      throw err;
    }
    return this.reload(requestId);
  }

  // ──────────────────────────────────────────────────────────────
  //  E5. 거절
  // ──────────────────────────────────────────────────────────────
  async reject(
    requestId: string,
    dto: RejectRefundRequestDto,
    user: JwtUserPayload,
  ): Promise<RefundRequestRow & { appealGuide: string }> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: RESPONSE_SELECT,
    });
    if (!rr) {
      throw new NotFoundException("환불 요청을 찾을 수 없습니다.");
    }
    await this.assertCanManage(rr, user);
    // DIRECT(관리자 직접 환불 시스템 원장)는 거절 대상이 아니다.
    if (rr.sourceType === "DIRECT") {
      throw new BadRequestException("직접 환불 요청은 거절 대상이 아닙니다.");
    }
    // 실행 실패 건은 이체가 발생하지 않은 것이 확정된 경우만 거절로 종결한다.
    if (rr.status === "execution_failed") {
      await this.assertFailureRejectable(rr);
    }

    // CAS 는 version 만으로도 경합을 막지만, 거절 가능 실패 유형 조건을 where 에 함께 실어
    //   사전 검사와 갱신 사이의 상태 변화에도 이체 발생 건이 거절되지 않게 한다.
    const cas = await this.prisma.refundRequest.updateMany({
      where: {
        id: requestId,
        version: dto.version,
        OR: [
          { status: "pending" },
          {
            status: "execution_failed",
            failureStage: "PG",
            failureCode: { notIn: REFUND_PG_UNCONFIRMED_CODES },
          },
        ],
      },
      data: {
        status: "rejected",
        decidedBy: user.id,
        decidedAt: new Date(),
        decisionReason: dto.decisionReason,
        version: { increment: 1 },
      },
    });
    if (cas.count === 0) {
      throw new ConflictException("다른 담당자가 이미 처리했습니다.");
    }

    // 거절 결정 감사 기록 — 분쟁 기록 보존(전자상거래법 §6). 실패해도 거절은 유효.
    await this.recordDecisionAudit(rr, user, "rejected", dto.decisionReason);

    // N2: 결정 → 학부모. (재정 변화 없음) 이의제기 경로를 함께 안내한다.
    await this.notifyDecision(rr, "rejected");
    const reloaded = await this.reload(requestId);
    return { ...reloaded, appealGuide: REFUND_APPEAL_GUIDE };
  }

  /**
   * 실행 실패(execution_failed) 건의 거절 가능 여부 검증.
   *
   * PG 가 취소를 명확히 거절한 실패(stage=PG · 미확정 코드 아님)만 거절로 종결할 수 있다.
   *  - DB_AFTER_PG: PG 취소는 성공하고 DB 반영만 실패 → 거절하면 환불금은 나갔는데 결제가
   *    completed 로 남는다. 재처리(DB 보상)로만 해소한다.
   *  - 미확정 코드(KG/토스): 취소 여부 자체를 모른다 → reconcile 로만 해소한다.
   * 위 두 경우가 아니어도 Payment 가 completed 로 복원되지 않았다면(복원 실패 잔존) 거절을 막는다.
   */
  private async assertFailureRejectable(rr: RefundRequestRow): Promise<void> {
    if (
      rr.failureStage !== "PG" ||
      REFUND_PG_UNCONFIRMED_CODES.includes(rr.failureCode ?? "")
    ) {
      throw new BadRequestException(
        "PG 취소 결과가 확정되지 않은 실패는 거절할 수 없습니다. 재처리 또는 운영자 확인이 필요합니다.",
      );
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: rr.paymentId },
      select: { paymentStatus: true },
    });
    if (payment?.paymentStatus !== "completed") {
      this.logger.warn(
        `[reject-blocked] 결제 미복원 상태에서 거절 시도 — requestId=${rr.id}, paymentStatus=${payment?.paymentStatus ?? "none"}`,
      );
      throw new ConflictException(
        "결제가 정상 복원되지 않아 거절할 수 없습니다. 운영자 확인이 필요합니다.",
      );
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  E6. 재처리 (execution_failed 전용)
  // ──────────────────────────────────────────────────────────────
  async reprocess(
    requestId: string,
    dto: ReprocessRefundRequestDto,
    user: JwtUserPayload,
  ): Promise<RefundRequestRow> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      // pgFirstAttemptedAt: 토스 멱등키 유효기간(14일) 만료 가드 기준 시각.
      select: { ...RESPONSE_SELECT, pgFirstAttemptedAt: true },
    });
    if (!rr) {
      throw new NotFoundException("환불 요청을 찾을 수 없습니다.");
    }
    await this.assertCanManage(rr, user);

    // 재처리 허용 = execution_failed OR stale executing(프로세스 크래시로 executing 잔존).
    //   active partial unique index 가 executing 을 포함해 신규 요청을 영구 차단하므로
    //   executionStartedAt 이 STALE_EXECUTING_MS 이전이면 회복 대상으로 인정한다.
    const STALE_EXECUTING_MS = 10 * 60 * 1000;
    const isFailed = rr.status === "execution_failed";
    const isStaleExecuting =
      rr.status === "executing" &&
      !!rr.executionStartedAt &&
      rr.executionStartedAt.getTime() < Date.now() - STALE_EXECUTING_MS;
    if (!isFailed && !isStaleExecuting) {
      throw new BadRequestException("재처리할 수 없는 상태입니다.");
    }

    const hasSelfPgEvidence =
      rr.failureStage === "DB_AFTER_PG" && !!rr.pgRefundSucceededAt;

    // [Major 1] KG 결과 미확정(KG_UNCONFIRMED)은 자동 PG 재호출 금지 — 자기 증거 없으면 격리(수동 확인).
    //   TOSS_UNCONFIRMED 는 여기서 막지 않는다 — 토스는 멱등키 재시도가 공식 보장되므로, 아래
    //   refund_processing 분기에서 resumeProcessing(같은 idempotencyKey)으로 PG 를 재호출해 원 결과를
    //   반환받아 해소한다. 단 아래 유효기간·본문충돌 가드를 통과한 경우에만.
    if (rr.failureCode === "KG_UNCONFIRMED" && !hasSelfPgEvidence) {
      throw new ConflictException(
        "PG 결과 미확정 — 자동 재처리할 수 없습니다. 운영자 수동 확인이 필요합니다.",
      );
    }

    // [토스 멱등 계약] 본문 충돌(422 CONFLICT)은 같은 키 자동 재시도로 해소 불가 → 항상 reconcile 로.
    if (rr.failureCode === "TOSS_IDEMPOTENCY_CONFLICT" && !hasSelfPgEvidence) {
      throw new ConflictException(
        "토스 멱등 요청 본문 충돌 — 자동 재처리할 수 없습니다. 결제 조회 후 reconcile 가 필요합니다.",
      );
    }
    // [토스 멱등 유효기간 — 14일(공식 15일에 1일 마진)] 만료된 키로 같은-키 자동 재호출은 이중 취소
    //   위험(만료 키는 중복 방지 근거가 아님) → PG 0회 + 409, reconcile(결제 조회 기반)로 전환.
    //   pgFirstAttemptedAt null(레거시/미기록)도 보수적으로 만료 처리(재정 안전 우선).
    if (rr.failureCode === "TOSS_UNCONFIRMED" && !hasSelfPgEvidence) {
      const TOSS_IDEMPOTENCY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
      const firstAt = rr.pgFirstAttemptedAt?.getTime();
      const expired =
        firstAt === undefined ||
        Date.now() - firstAt > TOSS_IDEMPOTENCY_WINDOW_MS;
      if (expired) {
        throw new ConflictException(
          "토스 멱등 보장 기간이 만료되었습니다 — 결제 조회 후 reconcile 가 필요합니다.",
        );
      }
    }

    // CAS: 현재 상태(execution_failed | executing) + version → executing 재선점. idempotencyKey 저장.
    const idempotencyKey = `rr:${requestId}`;
    const cas = await this.prisma.refundRequest.updateMany({
      where: { id: requestId, status: rr.status, version: dto.version },
      data: {
        status: "executing",
        executionStartedAt: new Date(),
        idempotencyKey,
        version: { increment: 1 },
      },
    });
    if (cas.count === 0) {
      throw new ConflictException("다른 담당자가 이미 처리했습니다.");
    }
    const expectedVersion = dto.version + 1;
    const ctx: RefundExecutionContext = {
      refundRequestId: requestId,
      actorId: user.id,
      expectedVersion,
      idempotencyKey,
      creditPolicy: await this.resolveCreditPolicy(rr.paymentId),
    };

    // [C-3] 분기: 자기 PG 성공 증거(DB_AFTER_PG) 우선 → PG 재호출 없이 DB 보상만.
    //   증거 없으면 Payment 상태로 판단(refunded=별도종결 / refund_processing·completed=재개·재실행).
    const payment = await this.prisma.payment.findUnique({
      where: { id: rr.paymentId },
      select: { paymentStatus: true },
    });
    const pstatus = payment?.paymentStatus;

    try {
      if (hasSelfPgEvidence) {
        // 자기 PG 성공분 — 재호출 금지, DB 보상만(applyRefundDbOnly 내부 증거·금액·fence 강제).
        await this.refundService.applyRefundDbOnly(
          rr.paymentId,
          `환불 재처리(보상) — ${rr.requestReason}`,
          rr.requestedAmount,
          ctx,
        );
        await this.notifyDecision(rr, "executed");
      } else if (pstatus === "refunded" || pstatus === "partially_refunded") {
        // 증거 없이 이미 환불됨 → 별도 환불(admin/trusted)로 종결. executed 오인 금지 → canceled.
        await this.reconcileToCanceled(
          requestId,
          expectedVersion,
          "별도 환불로 종결되었습니다.",
        );
        // 재정·알림 변화 없음(별도 경로가 이미 처리).
      } else if (pstatus === "refund_processing") {
        // 이전 실행자 미완/크래시 — 동일 idempotencyKey 로 PG 재개.
        //   토스=멱등 재호출 안전 · KG=cancelPayment 에서 KG_UNCONFIRMED 로 격리(자동 재호출 금지).
        await this.runExecution(
          rr,
          user,
          ctx,
          `환불 재처리 — ${rr.requestReason}`,
          true, // resumeProcessing
        );
        await this.notifyDecision(rr, "executed");
      } else if (pstatus === "completed") {
        // 전체 재실행 — cancelPayment 의 결제 단위 CAS(completed→refund_processing)부터.
        await this.runExecution(
          rr,
          user,
          ctx,
          `환불 재처리 — ${rr.requestReason}`,
        );
        await this.notifyDecision(rr, "executed");
      } else {
        // 알 수 없는/재처리 불가 상태.
        await this.markExecutionFailed(
          requestId,
          expectedVersion,
          "PG",
          "PAYMENT_NOT_AVAILABLE",
          "재처리할 수 없는 결제 상태입니다.",
          null,
        );
        throw new ConflictException("재처리할 수 없는 결제 상태입니다.");
      }
    } catch (err) {
      if (err instanceof RefundExecutionError) {
        await this.markExecutionFailed(
          requestId,
          expectedVersion,
          err.stage,
          err.code,
          err.message,
          err.pgRefundSucceededAt,
        );
        return this.reload(requestId);
      }
      throw err;
    }

    return this.reload(requestId);
  }

  // ──────────────────────────────────────────────────────────────
  //  E9. KG_UNCONFIRMED 수동 해소 (reconcile) — ADMIN/SYSTEM/OPER 전용
  // ──────────────────────────────────────────────────────────────
  async reconcile(
    requestId: string,
    dto: ReconcileRefundRequestDto,
    user: JwtUserPayload,
  ): Promise<RefundRequestRow> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: RESPONSE_SELECT,
    });
    if (!rr) {
      throw new NotFoundException("환불 요청을 찾을 수 없습니다.");
    }
    await this.assertCanManage(rr, user); // DIRECT 포함 — isAdminRole 통과.

    // 대상: execution_failed && PG 미확정/불변조건 위반 코드.
    //   KG_UNCONFIRMED + TOSS_UNCONFIRMED(만료 포함) + TOSS_IDEMPOTENCY_CONFLICT(422 본문충돌).
    //   토스 만료·본문충돌 등 reprocess 자동 해소 불가 건의 운영자 확정 경로(admin 전용).
    const RECONCILABLE_CODES = REFUND_PG_UNCONFIRMED_CODES;
    if (
      rr.status !== "execution_failed" ||
      !RECONCILABLE_CODES.includes(rr.failureCode ?? "")
    ) {
      throw new BadRequestException(
        "PG 미확정(KG/토스) 실패 건만 수동 해소할 수 있습니다.",
      );
    }

    const now = new Date();
    if (dto.outcome === "CONFIRMED_CANCELLED") {
      // 취소 성공 확인 → 자기 증거(DB_AFTER_PG) 기록 + executing 선점(version CAS).
      const cas = await this.prisma.refundRequest.updateMany({
        where: {
          id: requestId,
          status: "execution_failed",
          failureCode: { in: RECONCILABLE_CODES },
          version: dto.version,
        },
        data: {
          status: "executing",
          failureStage: "DB_AFTER_PG",
          pgRefundSucceededAt: now,
          executionStartedAt: now,
          decidedBy: user.id,
          decidedAt: now,
          decisionReason: dto.memo,
          version: { increment: 1 },
        },
      });
      if (cas.count === 0) {
        throw new ConflictException("다른 담당자가 이미 처리했습니다.");
      }
      const expectedVersion = dto.version + 1;
      const ctx: RefundExecutionContext = {
        refundRequestId: requestId,
        actorId: user.id,
        expectedVersion,
        idempotencyKey: `rr:${requestId}`,
      };
      try {
        // PG 는 이미 취소 확인됨 → DB-only 반영(Payment refund_processing→refunded).
        await this.refundService.applyRefundDbOnly(
          rr.paymentId,
          `KG 확인 보상 — ${dto.memo}`,
          rr.requestedAmount,
          ctx,
        );
        await this.notifyDecision(rr, "executed");
      } catch (err) {
        if (err instanceof RefundExecutionError) {
          await this.markExecutionFailed(
            requestId,
            expectedVersion,
            err.stage,
            err.code,
            err.message,
            err.pgRefundSucceededAt,
          );
          return this.reload(requestId);
        }
        throw err;
      }
      return this.reload(requestId);
    }

    // CONFIRMED_NOT_CANCELLED → 미취소 확인 → 원장 전이 + Payment 복원을 **단일 $transaction** 으로.
    //   [Critical] 어느 count 든 1 아니면 전체 rollback + 409 — 로그만 남기고 200 반환 금지(불일치 차단).
    await this.prisma.$transaction(async (tx) => {
      const cas = await tx.refundRequest.updateMany({
        where: {
          id: requestId,
          status: "execution_failed",
          failureCode: { in: RECONCILABLE_CODES },
          version: dto.version,
        },
        data: {
          failureStage: "PG",
          failureCode: "PG_CONFIRMED_NOT_CANCELLED",
          failureReason: "운영 확인: 취소되지 않음 — 재실행 허용",
          pgRefundSucceededAt: null,
          decidedBy: user.id,
          decidedAt: now,
          decisionReason: dto.memo,
          version: { increment: 1 },
        },
      });
      if (cas.count !== 1) {
        throw new ConflictException("다른 담당자가 이미 처리했습니다.");
      }
      // Payment refund_processing → completed 복원(재실행 가능). count!==1 → 전체 rollback.
      const restore = await tx.payment.updateMany({
        where: { id: rr.paymentId, paymentStatus: "refund_processing" },
        data: { paymentStatus: "completed" },
      });
      if (restore.count !== 1) {
        this.logger.error(
          `[RECOVERY_NEEDED] KG 미취소 확인 후 결제 복원 실패 — paymentId=${rr.paymentId}, 원장 전이 rollback(수동 확인 필요).`,
        );
        throw new ConflictException(
          "결제 상태 복원에 실패했습니다. 운영자 수동 확인이 필요합니다.",
        );
      }
    });
    return this.reload(requestId);
  }

  // ──────────────────────────────────────────────────────────────
  //  E7. 내 요청 (PARENT)
  // ──────────────────────────────────────────────────────────────
  async listMy(user: JwtUserPayload) {
    const rows = await this.prisma.refundRequest.findMany({
      where: { requesterId: user.id },
      select: {
        id: true,
        paymentId: true,
        status: true,
        sourceType: true,
        requestedAmount: true,
        decisionReason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { items: rows };
  }

  // ──────────────────────────────────────────────────────────────
  //  E8. 대기 건수
  // ──────────────────────────────────────────────────────────────
  async pendingCount(query: ListRefundRequestQueryDto, user: JwtUserPayload) {
    const permission = await this.buildPermissionWhere(user);
    const and: Prisma.RefundRequestWhereInput[] = [
      permission,
      { status: "pending" },
    ];
    if (query.teamId) and.push({ teamId: query.teamId });
    if (query.academyId) and.push({ academyId: query.academyId });
    if (query.scope === "team") and.push({ teamId: { not: null } });
    if (query.scope === "academy") and.push({ academyId: { not: null } });
    const count = await this.prisma.refundRequest.count({
      where: { AND: and },
    });
    return { count };
  }

  // ──────────────────────────────────────────────────────────────
  //  N3. 미응답 리마인더 (RefundReminderService 위임 — SLA 자동처리 아님, 재알림만)
  // ──────────────────────────────────────────────────────────────
  async remindPending(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const pending = await this.prisma.refundRequest.findMany({
      where: { status: "pending", createdAt: { lt: cutoff } },
      select: {
        id: true,
        teamId: true,
        academyId: true,
        sourceType: true,
        paymentId: true,
      },
    });
    if (pending.length === 0) return 0;

    // 중복 알림 방지 — 최근 24h 내 refund_request_reminder 수신자 제외.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.notification.findMany({
      where: {
        notificationType: "refund_request_reminder",
        createdAt: { gte: dayAgo },
      },
      select: { userId: true },
    });
    const recentlyNotified = new Set(recent.map((n) => n.userId));

    let sent = 0;
    for (const rr of pending) {
      const { userIds, linkUrl } = await this.resolveRequestRecipients(rr);
      const targets = userIds.filter((id) => !recentlyNotified.has(id));
      if (targets.length === 0) continue;
      await this.notifications.notifyUsers(targets, {
        notificationType: "refund_request_reminder",
        title: "환불 요청 미처리 알림",
        message: "처리 대기 중인 환불 요청이 있습니다. 확인 후 처리해주세요.",
        linkUrl,
      });
      sent += targets.length;
    }
    return sent;
  }

  // ──────────────────────────────────────────────────────────────
  //  N4. 처리기한 초과 에스컬레이션
  // ──────────────────────────────────────────────────────────────
  /**
   * 승인 대기가 처리기한(영업일 기준 3일 상당)을 넘긴 요청을 운영자에게 올리고
   * 소비자에게 지연 사실을 알린다.
   *
   * 대금 환급은 청약철회 통지 후 3영업일 내가 원칙이라(전자상거래법 §18) 감독
   * 미처리로 요청이 무기한 방치되면 그 자체가 위반이 된다. 금전 이동을 자동
   * 실행하지는 않고(오환불 위험) 운영자 개입 경로만 강제한다.
   */
  async escalateStalePending(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * DAY_MS);
    const stale = await this.prisma.refundRequest.findMany({
      where: { status: "pending", createdAt: { lt: cutoff } },
      select: { id: true, requesterId: true, createdAt: true },
    });
    if (stale.length === 0) return 0;

    // 중복 에스컬레이션 방지 — 최근 24h 내 동일 타입 수신자 제외.
    const dayAgo = new Date(Date.now() - DAY_MS);
    const recent = await this.prisma.notification.findMany({
      where: {
        notificationType: "refund_request_escalated",
        createdAt: { gte: dayAgo },
      },
      select: { userId: true },
    });
    const recentlyNotified = new Set(recent.map((n) => n.userId));

    const operators = await this.prisma.user.findMany({
      where: { userType: { in: ["ADMIN", "SYSTEM", "OPER"] }, deletedAt: null },
      select: { id: true },
    });
    const operatorIds = operators
      .map((o) => o.id)
      .filter((id) => !recentlyNotified.has(id));

    if (operatorIds.length > 0) {
      await this.notifications.notifyUsers(operatorIds, {
        notificationType: "refund_request_escalated",
        title: "환불 요청 처리기한 초과",
        message: `${olderThanDays}일 이상 미처리된 환불 요청이 ${stale.length}건 있습니다. 즉시 확인이 필요합니다.`,
        linkUrl: "/director-payments/refunds",
      });
    }

    // 소비자 지연 안내 — 요청자별 1건.
    const requesterIds = Array.from(
      new Set(stale.map((r) => r.requesterId)),
    ).filter((id) => !recentlyNotified.has(id));
    if (requesterIds.length > 0) {
      await this.notifications.notifyUsers(requesterIds, {
        notificationType: "refund_request_escalated",
        title: "환불 처리 지연 안내",
        message:
          "요청하신 환불 처리가 지연되고 있습니다. 운영자에게 전달되었으며 확인 후 신속히 처리해드리겠습니다.",
        linkUrl: "/payment/history",
      });
    }

    this.logger.warn(
      `[REFUND_SLA_BREACH] ${olderThanDays}일 초과 미처리 환불 요청 ${stale.length}건 — 운영자 ${operatorIds.length}명 에스컬레이션`,
    );
    return stale.length;
  }

  // ══════════════════════════════════════════════════════════════
  //  내부 헬퍼
  // ══════════════════════════════════════════════════════════════

  /** 도메인 판별 + 스코프 스냅샷 (fail-closed). */
  private async resolveDomainScope(
    paymentId: string,
  ): Promise<DomainScope | null> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { paymentId },
      select: { classId: true, childId: true },
    });
    if (enrollment) {
      const cls = await this.prisma.class.findUnique({
        where: { id: enrollment.classId },
        select: { teamId: true, academyId: true },
      });
      return {
        sourceType: "CLASS_PREPAID",
        classId: enrollment.classId,
        tournamentId: null,
        teamId: cls?.teamId ?? null,
        academyId: cls?.academyId ?? null,
        childId: enrollment.childId,
      };
    }

    const line = await this.prisma.monthlyPostpaidBillingLine.findFirst({
      where: { paymentId },
      select: { userId: true, billing: { select: { classId: true } } },
    });
    if (line) {
      const cls = await this.prisma.class.findUnique({
        where: { id: line.billing.classId },
        select: { teamId: true, academyId: true },
      });
      return {
        sourceType: "CLASS_POSTPAID",
        classId: line.billing.classId,
        tournamentId: null,
        teamId: cls?.teamId ?? null,
        academyId: cls?.academyId ?? null,
        childId: line.userId,
      };
    }

    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { paymentId },
      select: { tournamentId: true, childId: true },
    });
    if (reg) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: reg.tournamentId },
        select: { teamId: true },
      });
      return {
        sourceType: "TOURNAMENT",
        classId: null,
        tournamentId: reg.tournamentId,
        teamId: tournament?.teamId ?? null,
        academyId: null,
        childId: reg.childId,
      };
    }

    // 픽업매치 참가비 — 관리 주체가 팀/아카데미가 아니라 주최자(PickupMatch.managerId)라
    //   스코프 스냅샷 컬럼이 없다. 승인 권한·알림 라우팅은 결제 → 신청 → 매치로 역참조한다.
    const applicant = await this.prisma.pickupMatchApplicant.findFirst({
      where: { paymentId },
      select: { id: true },
    });
    if (applicant) {
      return {
        sourceType: "PICKUP_MATCH",
        classId: null,
        tournamentId: null,
        teamId: null,
        academyId: null,
        childId: null, // 픽업매치는 신청자 본인 참가 — 자녀 컨텍스트 없음.
      };
    }

    return null; // 쇼핑 등 — 지원하지 않음(422).
  }

  /** 픽업매치 결제의 주최자 User.id — 승인 권한·알림 라우팅 SoT(스냅샷 컬럼 부재 대체). */
  private async resolvePickupManagerId(
    paymentId: string,
  ): Promise<string | null> {
    const applicant = await this.prisma.pickupMatchApplicant.findFirst({
      where: { paymentId },
      select: { match: { select: { managerId: true } } },
    });
    return applicant?.match?.managerId ?? null;
  }

  /** 역할별 소속 범위 필터(SoT = 저장된 team_id/academy_id 스냅샷). */
  private async buildPermissionWhere(
    user: JwtUserPayload,
  ): Promise<Prisma.RefundRequestWhereInput> {
    if (isAdminRole(user.userType)) return {};

    // [Critical] DIRECT(관리자 직접 실행 원장)는 비-ADMIN 목록에 미노출 — teamId 스냅샷이 있어도 제외.
    const notDirect: Prisma.RefundRequestWhereInput = {
      sourceType: { not: "DIRECT" },
    };

    // 픽업매치 요청은 스코프 스냅샷이 없어 결제 → 신청 → 매치 주최자로 역참조한다.
    const ownPickup: Prisma.RefundRequestWhereInput = {
      sourceType: "PICKUP_MATCH",
      payment: {
        pickupMatchApplicants: { some: { match: { managerId: user.id } } },
      },
    };

    if (user.userType === "ACADEMY_DIRECTOR") {
      const academies = await this.prisma.academy.findMany({
        where: { directorId: user.id },
        select: { id: true },
      });
      return {
        AND: [
          notDirect,
          {
            OR: [{ academyId: { in: academies.map((a) => a.id) } }, ownPickup],
          },
        ],
      };
    }

    if (user.userType === "DIRECTOR") {
      const teamIds = await this.resourceAccess.resolveManageableTeamIds(user);
      return {
        AND: [notDirect, { OR: [{ teamId: { in: teamIds } }, ownPickup] }],
      };
    }

    if (user.userType === "COACH") {
      const [teamIds, coachAcademies] = await Promise.all([
        this.resourceAccess.resolveManageableTeamIds(user),
        this.prisma.academyCoach.findMany({
          where: { userId: user.id, isActive: true },
          select: { academyId: true },
        }),
      ]);
      return {
        AND: [
          notDirect,
          {
            OR: [
              { teamId: { in: teamIds } },
              { academyId: { in: coachAcademies.map((a) => a.academyId) } },
              ownPickup,
            ],
          },
        ],
      };
    }

    // 기타 역할 — 접근 불가(방어). 매칭 불가 sentinel.
    return { id: "__no_access__" };
  }

  /** 상세/승인/거절/재처리 스코프 재검증 — sourceType별 자원 관리 권한 단언. */
  private async assertCanManage(
    rr: {
      sourceType: string;
      paymentId?: string;
      classId: string | null;
      tournamentId: string | null;
      teamId: string | null;
      academyId: string | null;
    },
    user: JwtUserPayload,
  ): Promise<void> {
    if (isAdminRole(user.userType)) return;

    // [Critical] DIRECT(직접 실행 원장)는 ADMIN/SYSTEM/OPER 전용 — 스냅샷 teamId 가 있어도 비-ADMIN 차단.
    if (rr.sourceType === "DIRECT") {
      throw new ForbiddenException(
        "관리자 직접 환불 내역은 관리자만 조회·재처리할 수 있습니다.",
      );
    }

    // 픽업매치는 팀/아카데미 스냅샷이 없으므로 주최자만 관리 가능.
    if (rr.sourceType === "PICKUP_MATCH") {
      const managerId = rr.paymentId
        ? await this.resolvePickupManagerId(rr.paymentId)
        : null;
      if (managerId && managerId === user.id) return;
      throw new ForbiddenException(
        "해당 매치의 주최자만 환불 요청을 처리할 수 있습니다.",
      );
    }

    // 원본 레코드 정밀 검증 우선. 단 m2: 원본 미존재(NotFound)면 예외로 끝내지 말고
    //   teamId/academyId 스냅샷 폴백으로 강등한다(SPEC: 스냅샷=승인 재검증 SoT).
    //   권한 부족(Forbidden)은 그대로 전파(403).
    if (rr.sourceType === "TOURNAMENT" && rr.tournamentId) {
      try {
        await this.resourceAccess.assertManageableTournament(
          rr.tournamentId,
          user,
        );
        return;
      } catch (err) {
        if (!(err instanceof NotFoundException)) throw err;
        // 원본 대회 소실 → 스냅샷 폴백.
      }
    } else if (rr.classId) {
      try {
        await this.resourceAccess.assertManageableClass(rr.classId, user);
        return;
      } catch (err) {
        if (!(err instanceof NotFoundException)) throw err;
        // 원본 수업 소실 → 스냅샷 폴백.
      }
    }

    // 스냅샷 폴백(원본 미존재 또는 스냅샷만 존재).
    if (rr.teamId) {
      await this.resourceAccess.assertTeamManager(rr.teamId, user);
      return;
    }
    if (rr.academyId) {
      await this.resourceAccess.assertAcademyManager(rr.academyId, user);
      return;
    }
    throw new ForbiddenException("이 환불 요청을 관리할 권한이 없습니다.");
  }

  /**
   * 크레딧 처리 정책 결정 — 이용 개시 후 환불은 수강 종료이므로 잔여 회차를 회수한다.
   * 산정 실패 시에는 기존 동작(복원)을 유지해 환불 자체가 막히지 않게 한다.
   */
  private async resolveCreditPolicy(
    paymentId: string,
  ): Promise<"restore" | "forfeit"> {
    try {
      const quote = await this.refundService.computeRefundQuote(paymentId);
      return quote.started ? "forfeit" : "restore";
    } catch (err) {
      this.logger.warn(
        `크레딧 정책 판정 실패 — restore 폴백: paymentId=${paymentId}, error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return "restore";
    }
  }

  /** cancelPayment(trusted) 위임 — RefundRequest→executed 는 동일 트랜잭션(fencing)에서 전이된다. */
  private async runExecution(
    rr: RefundRequestRow,
    user: JwtUserPayload,
    ctx: RefundExecutionContext,
    reason: string,
    resumeProcessing = false,
  ): Promise<void> {
    await this.refundService.cancelPayment(
      rr.paymentId,
      reason,
      // 실행액 = 요청 시 서버가 산정해 스냅샷한 금액. 부분환불 요청이 승인 단계에서
      //   전액으로 부풀지 않도록 명시 전달한다(applyRefundDbOnly 재처리 경로와 동일 기준).
      rr.requestedAmount,
      undefined,
      undefined,
      undefined,
      { trusted: true, userType: user.userType, id: user.id },
      resumeProcessing ? { ...ctx, resumeProcessing: true } : ctx,
    );
  }

  /**
   * execution_failed 전이 (CAS — executing + version fencing).
   * [Major 4] count 0 = 선점 상실(fencing loser) — 경고 로그 후 false 반환(호출측은 알림/성공 중단).
   */
  private async markExecutionFailed(
    requestId: string,
    expectedVersion: number,
    stage: "PG" | "DB_AFTER_PG",
    code: string,
    reason: string,
    pgRefundSucceededAt: Date | null,
  ): Promise<boolean> {
    const upd = await this.prisma.refundRequest.updateMany({
      where: {
        id: requestId,
        status: "executing",
        version: expectedVersion,
      },
      data: {
        status: "execution_failed",
        failureStage: stage,
        failureCode: code,
        failureReason: reason,
        pgRefundSucceededAt,
        version: { increment: 1 },
      },
    });
    if (upd.count !== 1) {
      this.logger.warn(
        `[fencing-loser] markExecutionFailed no-op — requestId=${requestId}, expectedVersion=${expectedVersion}(선점 상실).`,
      );
      return false;
    }
    return true;
  }

  /**
   * executing → canceled 정합화 (version fencing). 별도 환불로 종결된 요청의 active index 해제.
   * [Major 4] count 0 = 선점 상실 — 경고 로그 후 false 반환.
   */
  private async reconcileToCanceled(
    requestId: string,
    expectedVersion: number,
    reason: string,
  ): Promise<boolean> {
    const upd = await this.prisma.refundRequest.updateMany({
      where: {
        id: requestId,
        status: "executing",
        version: expectedVersion,
      },
      data: {
        status: "canceled",
        decidedAt: new Date(),
        decisionReason: reason,
        version: { increment: 1 },
      },
    });
    if (upd.count !== 1) {
      this.logger.warn(
        `[fencing-loser] reconcileToCanceled no-op — requestId=${requestId}, expectedVersion=${expectedVersion}(선점 상실).`,
      );
      return false;
    }
    return true;
  }

  private async reload(requestId: string): Promise<RefundRequestRow> {
    const rr = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      select: RESPONSE_SELECT,
    });
    if (!rr) {
      throw new NotFoundException("환불 요청을 찾을 수 없습니다.");
    }
    return rr;
  }

  /**
   * 사용현황(판단자료) — sourceType별. `sourceOk`=원본 레코드 존재 여부(false면 상위에서
   * judgmentDataOk=false 강제 — 판단자료 없으면 승인 CTA 닫힘). 예외 시에도 상위 catch 로 false.
   */
  private async computeUsage(rr: {
    sourceType: string;
    paymentId: string;
    tournamentId: string | null;
  }): Promise<{ sourceOk: boolean; [k: string]: unknown }> {
    if (rr.sourceType === "CLASS_PREPAID") {
      const payment = await this.prisma.payment.findUnique({
        where: { id: rr.paymentId },
        select: { completedAt: true, createdAt: true },
      });
      const paidDayUtc = instantToKstDateOnly(
        payment?.completedAt ?? payment?.createdAt ?? new Date(),
      );
      const enrollments = await this.prisma.enrollment.findMany({
        where: { paymentId: rr.paymentId },
        select: { classId: true, childId: true },
      });
      // 배치 집계(N+1 제거): 결제일 이후 present 출석을 1쿼리로 조회 후 (childId,classId) 매칭.
      const childIds = [...new Set(enrollments.map((e) => e.childId))];
      const classIds = [...new Set(enrollments.map((e) => e.classId))];
      const attendances = childIds.length
        ? await this.prisma.classAttendance.findMany({
            where: {
              memberId: { in: childIds },
              attendanceStatus: "present",
              schedule: {
                classId: { in: classIds },
                scheduledDate: { gte: paidDayUtc },
              },
            },
            select: { memberId: true, schedule: { select: { classId: true } } },
          })
        : [];
      const pairKey = (child: string, cls: string) => `${child}::${cls}`;
      const enrollPairs = new Set(
        enrollments.map((e) => pairKey(e.childId, e.classId)),
      );
      const counts = new Map<string, number>();
      for (const a of attendances) {
        const k = pairKey(a.memberId, a.schedule.classId);
        if (enrollPairs.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      let usedCount = 0;
      const perClass: { classId: string; count: number }[] = [];
      for (const e of enrollments) {
        const c = counts.get(pairKey(e.childId, e.classId)) ?? 0;
        usedCount += c;
        perClass.push({ classId: e.classId, count: c });
      }
      return {
        kind: "CLASS_PREPAID",
        sourceOk: enrollments.length > 0,
        usedCount,
        perClass,
      };
    }

    if (rr.sourceType === "CLASS_POSTPAID") {
      const line = await this.prisma.monthlyPostpaidBillingLine.findFirst({
        where: { paymentId: rr.paymentId },
        select: { attendanceCount: true, amount: true },
      });
      return {
        kind: "CLASS_POSTPAID",
        sourceOk: !!line,
        attendanceCount: line?.attendanceCount ?? null,
        amount: line?.amount ?? null,
      };
    }

    // TOURNAMENT
    const reg = await this.prisma.tournamentRegistration.findFirst({
      where: { paymentId: rr.paymentId },
      select: { gamesCount: true, calculatedFee: true },
    });
    return {
      kind: "TOURNAMENT",
      sourceOk: !!reg,
      gamesCount: reg?.gamesCount ?? null,
      calculatedFee: reg?.calculatedFee ? Number(reg.calculatedFee) : null,
    };
  }

  /** subjectLabel 배치 로딩(N+1 방지). */
  private async loadSubjectLabels(
    rows: { classId: string | null; tournamentId: string | null }[],
  ): Promise<{
    classes: Map<string, string>;
    tournaments: Map<string, string>;
  }> {
    const classIds = [
      ...new Set(rows.map((r) => r.classId).filter((v): v is string => !!v)),
    ];
    const tournamentIds = [
      ...new Set(
        rows.map((r) => r.tournamentId).filter((v): v is string => !!v),
      ),
    ];

    const [classes, tournaments] = await Promise.all([
      classIds.length
        ? this.prisma.class.findMany({
            where: { id: { in: classIds } },
            select: { id: true, className: true },
          })
        : Promise.resolve([]),
      tournamentIds.length
        ? this.prisma.tournament.findMany({
            where: { id: { in: tournamentIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      classes: new Map(classes.map((c) => [c.id, c.className])),
      tournaments: new Map(tournaments.map((t) => [t.id, t.name])),
    };
  }

  /** N1: 요청 생성 → 소속 감독/아카데미. */
  private async notifyRequestCreated(rr: RefundRequestRow): Promise<void> {
    try {
      const { userIds, linkUrl } = await this.resolveRequestRecipients(rr);
      if (userIds.length === 0) return;
      await this.notifications.notifyUsers(userIds, {
        notificationType: "refund_request_created",
        title: "새 환불 요청",
        message: "환불 요청이 접수되었습니다. 확인 후 처리해주세요.",
        linkUrl,
      });
    } catch (err) {
      // 알림 실패가 요청 생성을 롤백하지 않도록 격리.
      this.logger.warn(
        `N1 환불 요청 알림 실패: requestId=${rr.id}, error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * 환불 결정 감사 기록 (전자상거래법 §6 — 분쟁 기록 3년 보존).
   * 승인·거절 주체와 사유를 RefundRequest 컬럼과 별도로 AuditLog 에 남긴다.
   * 기록 실패가 결정 자체를 되돌리지 않도록 격리한다.
   */
  private async recordDecisionAudit(
    rr: RefundRequestRow,
    user: JwtUserPayload,
    outcome: "approved" | "rejected",
    reason: string | null,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: `refund_request.${outcome}`,
          resource: `RefundRequest:${rr.id}`,
          newValue: {
            paymentId: rr.paymentId,
            requesterId: rr.requesterId,
            sourceType: rr.sourceType,
            requestedAmount: rr.requestedAmount,
            outcome,
            reason,
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `환불 결정 감사 기록 실패: requestId=${rr.id}, error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** N2: 결정 → 요청 학부모. */
  private async notifyDecision(
    rr: RefundRequestRow,
    outcome: "executed" | "rejected",
  ): Promise<void> {
    try {
      await this.notifications.createNotification({
        userId: rr.requesterId,
        notificationType: "refund_request_decided",
        title: outcome === "executed" ? "환불 완료" : "환불 요청 거절",
        message:
          outcome === "executed"
            ? "요청하신 환불이 완료되었습니다."
            : `요청하신 환불이 거절되었습니다. 자세한 사유를 확인해주세요. ${REFUND_APPEAL_GUIDE}`,
        linkUrl: "/payment/history",
      });
    } catch (err) {
      this.logger.warn(
        `N2 환불 결정 알림 실패: requestId=${rr.id}, error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** N1/N3 수신자 라우팅 — 팀=owner+관리멤버 / 아카데미=directorId / 픽업=주최자. */
  private async resolveRequestRecipients(rr: {
    id: string;
    teamId: string | null;
    academyId: string | null;
    sourceType?: string;
    paymentId?: string;
  }): Promise<{ userIds: string[]; linkUrl: string }> {
    if (rr.sourceType === "PICKUP_MATCH" && rr.paymentId) {
      const managerId = await this.resolvePickupManagerId(rr.paymentId);
      return {
        userIds: managerId ? [managerId] : [],
        linkUrl: `/director-payments/refunds/${rr.id}`,
      };
    }
    if (rr.academyId) {
      const academy = await this.prisma.academy.findUnique({
        where: { id: rr.academyId },
        select: { directorId: true },
      });
      return {
        userIds: academy ? [academy.directorId] : [],
        linkUrl: `/academy/${rr.academyId}/refunds/${rr.id}`,
      };
    }
    if (rr.teamId) {
      const [team, managers] = await Promise.all([
        this.prisma.team.findUnique({
          where: { id: rr.teamId },
          select: { coachId: true },
        }),
        this.prisma.teamMember.findMany({
          where: {
            teamId: rr.teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: TEAM_MANAGER_ROLES },
          },
          select: { userId: true },
        }),
      ]);
      const ids = new Set<string>();
      if (team?.coachId) ids.add(team.coachId);
      for (const m of managers) ids.add(m.userId);
      return {
        userIds: Array.from(ids),
        linkUrl: `/director-payments/refunds/${rr.id}`,
      };
    }
    return {
      userIds: [],
      linkUrl: `/director-payments/refunds/${rr.id}`,
    };
  }

  private fullName(
    u: { firstName: string; lastName: string } | null | undefined,
  ): string {
    if (!u) return "-";
    return `${u.lastName}${u.firstName}`.trim() || "-";
  }

  private maskTid(tid: string | null): string | null {
    if (!tid) return null;
    return tid.length > 8 ? `${tid.slice(0, 8)}***` : `${tid}***`;
  }
}
