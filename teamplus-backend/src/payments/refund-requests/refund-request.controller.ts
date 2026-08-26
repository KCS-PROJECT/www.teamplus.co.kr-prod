import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { RefundRequestService } from "./refund-request.service";
import { CreateRefundRequestDto } from "./dto/create-refund-request.dto";
import {
  ApproveRefundRequestDto,
  RejectRefundRequestDto,
  ReprocessRefundRequestDto,
  ReconcileRefundRequestDto,
} from "./dto/decision-refund-request.dto";
import { ListRefundRequestQueryDto } from "./dto/list-refund-request-query.dto";
import {
  RefundRequestResponseDto,
  RefundRequestListResponseDto,
} from "./dto/refund-request-response.dto";

/**
 * 환불 승인제 (Phase 1) — 별도 base path 로 payments/:paymentId 라우트 충돌 회피.
 * static 경로(/my·/pending-count)는 /:requestId 보다 위에 선언(오매칭 차단).
 */
@ApiTags("RefundRequests")
@Controller("api/v1/refund-requests")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class RefundRequestController {
  constructor(private readonly refundRequestService: RefundRequestService) {}

  // E1. 요청 생성 (PARENT)
  @Post()
  @Roles("PARENT")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "환불 요청 생성",
    description:
      "학부모가 본인 결제에 대해 환불 요청(pending)을 생성합니다. PG 환불은 실행되지 않으며 소속 감독/ADMIN 승인 시 실행됩니다.",
  })
  @ApiResponse({ status: 201, type: RefundRequestResponseDto })
  @ApiResponse({ status: 400, description: "완료된 결제만 요청 가능" })
  @ApiResponse({ status: 403, description: "본인 결제 아님" })
  @ApiResponse({ status: 409, description: "이미 처리 중인 환불 요청 존재" })
  @ApiResponse({ status: 422, description: "환불 요청 미지원 결제" })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateRefundRequestDto,
  ) {
    return this.refundRequestService.create(dto, req.user);
  }

  // E7. 내 요청 (PARENT) — static, :requestId 위.
  @Get("my")
  @Roles("PARENT")
  @ApiOperation({
    summary: "내 환불 요청 목록",
    description:
      "본인이 생성한 환불 요청 목록을 반환합니다. 결제 이력의 '환불 요청 중' 배지 표기용.",
  })
  async listMy(@Request() req: AuthenticatedRequest) {
    return this.refundRequestService.listMy(req.user);
  }

  // E8. 대기 건수 — static, :requestId 위.
  @Get("pending-count")
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR", "COACH", "ADMIN")
  @ApiOperation({
    summary: "환불 요청 대기 건수",
    description:
      "관리 범위 내 승인 대기(pending) 건수를 반환합니다. 메뉴·배너·알림 공통 집계.",
  })
  async pendingCount(
    @Query() query: ListRefundRequestQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.refundRequestService.pendingCount(query, req.user);
  }

  // E2. 관리자 목록
  @Get()
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR", "COACH", "ADMIN")
  @ApiOperation({
    summary: "환불 요청 목록 (관리자)",
    description:
      "역할별 소속 범위로 조회. 활성(activeItems, 전량)/이력(historyItems, 페이지) 분리 계약. pagination 은 이력 전용.",
  })
  @ApiResponse({ status: 200, type: RefundRequestListResponseDto })
  async list(
    @Query() query: ListRefundRequestQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.refundRequestService.list(query, req.user);
  }

  // E3. 상세
  @Get(":requestId")
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR", "COACH", "ADMIN")
  @ApiOperation({
    summary: "환불 요청 상세",
    description:
      "결제정보·요청정보·사용현황(판단자료)·이력을 반환합니다. 스코프 재검증(범위 밖 403).",
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: "관리 범위 밖" })
  @ApiResponse({ status: 404, description: "요청 없음" })
  async detail(
    @Param("requestId") requestId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.refundRequestService.detail(requestId, req.user);
  }

  // E4. 승인 = 실행
  @Post(":requestId/approve")
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "환불 승인 및 실행",
    description:
      "CAS 선점(pending→executing) 후 PG 환불 + 도메인 동기화를 동일 트랜잭션으로 실행합니다. 실패 시 execution_failed 로 반환(200).",
  })
  @ApiResponse({ status: 200, type: RefundRequestResponseDto })
  @ApiResponse({ status: 403, description: "관리 범위 밖" })
  @ApiResponse({ status: 409, description: "이미 처리됨 / 동시 처리 / 결제 미완료" })
  async approve(
    @Param("requestId") requestId: string,
    @Body() dto: ApproveRefundRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.refundRequestService.approve(requestId, dto, req.user);
  }

  // E5. 거절
  @Post(":requestId/reject")
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "환불 거절",
    description:
      "CAS 선점(pending→rejected). 거절 사유 필수. 재정 변화 없음. execution_failed 도 대상이나, 이체가 발생하지 않은 것이 확정된 실패(failureStage=PG · PG 미확정 코드 아님 · 결제 completed 복원)만 허용한다.",
  })
  @ApiResponse({ status: 200, type: RefundRequestResponseDto })
  @ApiResponse({ status: 409, description: "이미 처리됨 / 동시 처리" })
  async reject(
    @Param("requestId") requestId: string,
    @Body() dto: RejectRefundRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.refundRequestService.reject(requestId, dto, req.user);
  }

  // E6. 재처리 (execution_failed 전용)
  @Post(":requestId/reprocess")
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "환불 재처리",
    description:
      "execution_failed 전용. failureStage=PG 는 전체 재실행, DB_AFTER_PG 는 PG 재호출 없이 DB 보상만 재적용(멱등).",
  })
  @ApiResponse({ status: 200, type: RefundRequestResponseDto })
  @ApiResponse({ status: 400, description: "재처리 불가 상태" })
  @ApiResponse({ status: 409, description: "이미 처리됨 / 동시 처리" })
  async reprocess(
    @Param("requestId") requestId: string,
    @Body() dto: ReprocessRefundRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.refundRequestService.reprocess(requestId, dto, req.user);
  }

  // E9. PG 미확정 환불 수동 해소 (ADMIN/SYSTEM/OPER 전용) — KG/Toss 공통
  @Post(":requestId/reconcile")
  @Roles("ADMIN", "SYSTEM", "OPER")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "PG 미확정 환불 수동 해소 (KG/Toss)",
    description:
      "운영자가 PG 콘솔에서 취소 결과를 확인한 뒤 CONFIRMED_CANCELLED(DB-only 반영) 또는 CONFIRMED_NOT_CANCELLED(복원·재실행 허용)로 확정합니다. 대상 failureCode = KG_UNCONFIRMED · TOSS_UNCONFIRMED(멱등키 만료 포함) · TOSS_IDEMPOTENCY_CONFLICT(멱등 본문 충돌). 토스 미확정은 14일 이내면 reprocess 자동 해소가 우선이며, 만료·본문충돌 등 자동 해소 불가 건이 이 경로 대상.",
  })
  @ApiResponse({ status: 200, type: RefundRequestResponseDto })
  @ApiResponse({
    status: 400,
    description: "PG 미확정(KG/Toss) 대상 아님",
  })
  @ApiResponse({ status: 409, description: "동시 처리" })
  async reconcile(
    @Param("requestId") requestId: string,
    @Body() dto: ReconcileRefundRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.refundRequestService.reconcile(requestId, dto, req.user);
  }
}
