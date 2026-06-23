import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { Public } from "@/auth/public.decorator";
import { PickupMatchesService } from "./pickup-matches.service";
import { CreatePickupMatchDto } from "./dto/create-pickup-match.dto";
import { ApplyPickupMatchDto } from "./dto/apply-pickup-match.dto";
import { UpdateApplicantStatusDto } from "./dto/update-applicant-status.dto";
import { UpdatePickupMatchDto } from "./dto/update-pickup-match.dto";
import { BulkRejectApplicantsDto } from "./dto/bulk-reject-applicants.dto";
import { CancelMatchDto } from "./dto/cancel-match.dto";
import { OptionalJwtAuthGuard } from "./guards/optional-jwt-auth.guard";
import {
  AuthenticatedRequest,
  JwtUserPayload,
} from "@/common/interfaces/authenticated-request.interface";

/**
 * 비로그인 허용 요청 타입 (OptionalJwtAuthGuard 사용).
 *
 * - `user`는 토큰이 유효한 경우에만 존재
 * - 토큰이 없거나 만료/무효이면 `undefined`
 */
interface OptionalAuthRequest {
  user?: JwtUserPayload;
}

/**
 * PickupMatchesController
 *
 * 아이스하키 픽업 매치 CRUD + 신청자 관리 엔드포인트.
 *
 * URL 베이스: /api/v1/matches
 *
 * 권한 매트릭스:
 * - 조회 (list / detail / roster): 전체 공개 (로그인 불필요)
 * - 조회수 증가 (POST /:id/view): 인증 optional (비로그인 허용, 로그인 사용자만 카운트 증가)
 * - 매치 생성/수정: ADMIN, DIRECTOR, ACADEMY_DIRECTOR, COACH
 * - 매치 취소/환불: 주최자(매니저) 또는 ADMIN/DIRECTOR/ACADEMY_DIRECTOR
 * - 신청자 조회/승인/거절/일괄거절: 주최자 또는 ADMIN/DIRECTOR/ACADEMY_DIRECTOR
 * - 참가 신청 / 취소 / 내 신청 조회: 모든 인증 사용자 (parent/teen/child 포함)
 */
@ApiTags("Pickup Matches")
@Controller("api/v1/matches")
export class PickupMatchesController {
  constructor(private readonly service: PickupMatchesService) {}

  // ==================== 공개 조회 ====================

  /** 매치 목록 조회 (인증 불필요) */
  @Get()
  @Public()
  @ApiOperation({
    summary: "매치 목록 조회",
    description:
      "필터(상태/날짜/레벨/성별)와 페이지네이션으로 매치 목록을 반환합니다. 인증이 필요하지 않습니다.",
  })
  @ApiQuery({ name: "status", required: false, example: "recruiting" })
  @ApiQuery({ name: "date", required: false, example: "2026-05-01" })
  @ApiQuery({ name: "level", required: false, example: "중급" })
  @ApiQuery({ name: "gender", required: false, example: "혼성" })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({ name: "limit", required: false, example: 20 })
  @ApiResponse({ status: 200, description: "매치 목록 조회 성공" })
  findAll(
    @Query("status") status?: string,
    @Query("date") date?: string,
    @Query("level") level?: string,
    @Query("gender") gender?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.findAll({
      status,
      date,
      level,
      gender,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /** 내가 신청한 매치 목록 */
  @Get("my")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "COACH",
    "PARENT",
    "TEEN",
    "CHILD",
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: "내 신청 매치 목록",
    description: "로그인한 사용자가 신청한 매치 목록을 반환합니다.",
  })
  @ApiResponse({ status: 200, description: "내 신청 매치 조회 성공" })
  @ApiResponse({ status: 401, description: "인증이 필요합니다." })
  getMyMatches(@Request() req: AuthenticatedRequest) {
    return this.service.getMyAppliedMatches(req.user.id);
  }

  /** 매치 상세 조회 (인증 불필요) */
  @Get(":id")
  @Public()
  @ApiOperation({ summary: "매치 상세 조회" })
  @ApiParam({ name: "id", description: "매치 ID (cuid)" })
  @ApiResponse({ status: 200, description: "매치 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "매치를 찾을 수 없습니다." })
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  /** 매치 참여 명단 조회 (인증 불필요) */
  @Get(":id/roster")
  @Public()
  @ApiOperation({
    summary: "매치 참여 명단 조회",
    description: "확정 참가자와 대기 목록을 함께 반환합니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiResponse({ status: 200, description: "참여 명단 조회 성공" })
  getRoster(@Param("id") id: string) {
    return this.service.getRoster(id);
  }

  /**
   * 매치 조회수 증가 (비로그인·로그인 모두 허용).
   *
   * - 비로그인 호출: 증가 없이 현재 viewCount만 반환
   * - 로그인 호출: 1일 1회(KST 기준)만 증가 (DailyViewLog UNIQUE로 중복 차단)
   * - 이 엔드포인트는 매치 상세 진입 시 프론트가 호출하여 정확한 트래킹 수행
   */
  @Post(":id/view")
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "매치 조회수 증가",
    description:
      "1일 1회(KST 기준) 조회수를 증가시킵니다. 비로그인도 호출 가능하지만 이 경우 카운트는 증가하지 않고 현재 값만 반환됩니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiResponse({
    status: 200,
    description: "조회수 증가 처리 결과",
    schema: {
      example: { viewCount: 42, incremented: true },
    },
  })
  @ApiResponse({ status: 404, description: "매치를 찾을 수 없습니다." })
  incrementView(@Param("id") id: string, @Request() req: OptionalAuthRequest) {
    return this.service.incrementViewCount(id, req.user?.id ?? null);
  }

  // ==================== 매니저 전용 (관리자/감독/코치) ====================

  /**
   * 매치 생성 (관리자/감독/아카데미원장/코치 전용)
   *
   * 학부모/학생(parent/teen/child)은 생성 불가 — 403 반환.
   */
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "매치 생성",
    description:
      "관리자/감독/아카데미원장/코치만 새로운 픽업 매치를 생성할 수 있습니다.",
  })
  @ApiResponse({ status: 201, description: "매치 생성 성공" })
  @ApiResponse({ status: 400, description: "입력값 검증 실패" })
  @ApiResponse({ status: 401, description: "인증이 필요합니다." })
  @ApiResponse({
    status: 403,
    description: "권한이 없습니다 (관리자/감독/코치 전용).",
  })
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreatePickupMatchDto,
  ) {
    return this.service.create(req.user.id, dto);
  }

  /**
   * 매치 수정 (주최자 또는 ADMIN/DIRECTOR/ACADEMY_DIRECTOR 전용).
   *
   * - 취소된 매치 수정 불가 (400)
   * - 이미 시작된 매치 수정 불가 (400)
   * - maxParticipants를 현재 승인 인원 수 이하로 낮추면 400
   * - COACH는 본인이 주최한 매치만 수정 가능 (service 레이어에서 강제)
   */
  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "매치 수정",
    description:
      "주최자(매니저) 또는 ADMIN/DIRECTOR/ACADEMY_DIRECTOR가 매치 정보를 수정합니다. 취소된 매치 또는 이미 시작된 매치는 수정할 수 없습니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiBody({ type: UpdatePickupMatchDto })
  @ApiResponse({ status: 200, description: "매치 수정 성공" })
  @ApiResponse({
    status: 400,
    description: "취소된 매치 / 이미 시작된 매치 / 모집 인원 축소 불가",
  })
  @ApiResponse({ status: 403, description: "본인 매치가 아니거나 권한 없음" })
  @ApiResponse({ status: 404, description: "매치를 찾을 수 없습니다." })
  update(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdatePickupMatchDto,
  ) {
    return this.service.update(
      id,
      { id: req.user.id, userType: req.user.userType },
      dto,
    );
  }

  /** 신청자 목록 조회 (주최자 또는 ADMIN/DIRECTOR) */
  @Get(":id/applicants")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "신청자 목록 조회",
    description:
      "주최자(매니저) 또는 ADMIN/DIRECTOR만 조회 가능합니다. 코치는 본인이 주최한 매치만 조회 가능합니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiResponse({ status: 200, description: "신청자 목록 조회 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  getApplicants(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    return this.service.getApplicants(id, req.user.id, req.user.userType);
  }

  /** 신청자 상태 변경 (주최자 또는 ADMIN/DIRECTOR) */
  @Patch(":id/applicants/:applicantId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "신청자 승인/거절",
    description:
      "주최자 또는 ADMIN/DIRECTOR가 신청자 상태를 변경합니다. status=rejected 인 경우 rejectionReason을 함께 저장합니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiParam({ name: "applicantId", description: "신청자 ID" })
  @ApiBody({ type: UpdateApplicantStatusDto })
  @ApiResponse({ status: 200, description: "신청자 상태 변경 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  updateApplicantStatus(
    @Param("id") id: string,
    @Param("applicantId") applicantId: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateApplicantStatusDto,
  ) {
    return this.service.updateApplicantStatus(
      id,
      applicantId,
      req.user.id,
      dto.status,
      req.user.userType,
      dto.rejectionReason,
    );
  }

  /**
   * 신청자 일괄 거절.
   *
   * - pending 상태 신청자만 처리 (approved/rejected는 skip → skippedCount로 반환)
   * - 본 매치 소속이 아닌 applicantId는 무시 (skippedCount에 합산)
   * - 트랜잭션 원자성 보장
   */
  @Post(":id/applicants/bulk-reject")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "신청자 일괄 거절",
    description:
      "여러 신청자를 한 번에 거절합니다. 본 매치 소속 + pending 상태만 처리되며, 나머지는 skip으로 집계됩니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiBody({ type: BulkRejectApplicantsDto })
  @ApiResponse({
    status: 200,
    description: "일괄 거절 처리 결과",
    schema: {
      example: {
        matchId: "clxxx",
        rejectedCount: 3,
        skippedCount: 1,
        reason: "레벨 미달로 인한 거절",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "이미 취소된 매치 / 입력값 검증 실패",
  })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "매치를 찾을 수 없습니다." })
  bulkRejectApplicants(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: BulkRejectApplicantsDto,
  ) {
    return this.service.bulkRejectApplicants(
      id,
      { id: req.user.id, userType: req.user.userType },
      dto,
    );
  }

  /**
   * 매치 취소 + 환불 처리 (신규 권장 엔드포인트).
   *
   * - 취소 사유 기록, 환불 대상 신청자의 paymentStatus를 refunded로 전환
   * - paymentId가 있는 신청자: PaymentsService.cancelPayment()로 PG 환불 호출
   * - PG 환불 성공 → refunded, 실패 → refund_failed (수동 재처리 대상)
   */
  @Post(":id/cancel")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "매치 취소 (사유 포함 + 환불 처리)",
    description:
      "주최자 또는 ADMIN/DIRECTOR가 매치를 취소합니다. paymentId가 있는 신청자는 KG이니시스 PG 환불이 자동 처리되며, 전체 승인/대기 신청자에게 알림이 발송됩니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiBody({ type: CancelMatchDto, required: false })
  @ApiResponse({
    status: 200,
    description: "매치 취소 성공",
    schema: {
      example: {
        id: "clxxx",
        status: "cancelled",
        cancelledAt: "2026-04-12T00:00:00.000Z",
        cancelledReason: "빙상장 일정 취소",
        refundedCount: 5,
        notifiedCount: 8,
      },
    },
  })
  @ApiResponse({ status: 400, description: "이미 취소된 매치" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "매치를 찾을 수 없습니다." })
  cancelWithReason(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: CancelMatchDto = {},
  ) {
    return this.service.cancelWithReason(
      id,
      { id: req.user.id, userType: req.user.userType },
      dto.reason,
    );
  }

  /**
   * 매치 취소 (레거시 DELETE 엔드포인트).
   *
   * @deprecated POST `/:id/cancel` 사용 권장 (사유 포함 + 환불 처리 지원).
   *             이 엔드포인트는 하위 호환을 위해 유지되며, 내부적으로 동일한
   *             cancelWithReason 로직을 호출합니다.
   */
  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "[Deprecated] 매치 취소",
    description:
      "레거시 엔드포인트입니다. 환불 처리까지 포함하려면 `POST /:id/cancel` 을 사용하세요.",
    deprecated: true,
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiQuery({
    name: "reason",
    required: false,
    description: "취소 사유 (선택)",
  })
  @ApiResponse({ status: 200, description: "매치 취소 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  cancel(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Query("reason") reason?: string,
  ) {
    return this.service.cancelWithReason(
      id,
      { id: req.user.id, userType: req.user.userType },
      reason,
    );
  }

  // ==================== 일반 인증 사용자 ====================

  /** 매치 참가 신청 (모든 인증 사용자) */
  @Post(":id/apply")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "COACH",
    "PARENT",
    "TEEN",
    "CHILD",
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: "매치 참가 신청",
    description:
      "로그인한 모든 사용자(parent/teen/child 포함)가 신청 가능합니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiResponse({ status: 201, description: "참가 신청 성공" })
  @ApiResponse({ status: 409, description: "이미 신청한 매치입니다." })
  apply(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: ApplyPickupMatchDto,
  ) {
    return this.service.apply(id, req.user.id, dto);
  }

  /** 참가 취소 (본인) */
  @Delete(":id/leave")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "COACH",
    "PARENT",
    "TEEN",
    "CHILD",
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: "참가 신청 취소",
    description: "본인의 참가 신청을 취소합니다.",
  })
  @ApiParam({ name: "id", description: "매치 ID" })
  @ApiResponse({ status: 200, description: "취소 성공" })
  @ApiResponse({ status: 404, description: "참가 신청 내역이 없습니다." })
  leave(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    return this.service.leave(id, req.user.id);
  }
}
