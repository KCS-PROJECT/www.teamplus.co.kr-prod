import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuditAction } from "@/common/decorators";
import { EnrollmentsService } from "./enrollments.service";
import {
  CreateEnrollmentDto,
  ApproveEnrollmentDto,
  RejectEnrollmentDto,
  EnrollmentListResponseDto,
  EnrollmentSingleResponseDto,
  PendingEnrollmentListResponseDto,
} from "./dto";

/**
 * Enrollments Controller
 *
 * 수강신청 관리 API
 *
 * 지원하는 두 가지 방식:
 * 1. 학부모 직접 신청 (parent_direct) - 기본 방식
 * 2. 자녀 요청 → 학부모 승인 (child_request) - 14세 이상 자녀
 *
 * 공통 규칙:
 * - 결제는 항상 학부모만 가능
 * - 72시간 내 미결제/미승인 시 자동 만료
 */
@ApiTags("Enrollments")
@ApiBearerAuth()
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
@Controller("api/v1/enrollments")
export class EnrollmentsController {
  private readonly logger = new Logger(EnrollmentsController.name);

  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  // ================ 공통 엔드포인트 ================

  /**
   * 수강신청 생성
   *
   * 두 가지 방식 지원:
   * - parent_direct: 학부모가 직접 수강신청
   * - child_request: 자녀가 수강 요청 (학부모 승인 필요)
   */
  @Post()
  @ApiOperation({
    summary: "수강신청 생성",
    description:
      "학부모 직접 신청 또는 자녀 요청 방식으로 수강신청을 생성합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "수강신청 생성 성공",
    type: EnrollmentSingleResponseDto,
  })
  @ApiResponse({ status: 400, description: "유효하지 않은 요청" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 409, description: "이미 신청 중인 수업" })
  async createEnrollment(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateEnrollmentDto,
  ): Promise<EnrollmentSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(`수강신청 생성 요청: userId=${userId}`);

    const enrollment = await this.enrollmentsService.createEnrollment(
      userId,
      dto,
    );

    return {
      success: true,
      data: enrollment,
    };
  }

  /**
   * 내 수강신청 목록 조회
   */
  @Get()
  @ApiOperation({
    summary: "내 수강신청 목록 조회",
    description: "내가 신청했거나 내 자녀의 수강신청 목록을 조회합니다.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description:
      "상태 필터 (pending, pending_approval, approved, paid, cancelled 등)",
  })
  @ApiResponse({
    status: 200,
    description: "수강신청 목록 조회 성공",
    type: EnrollmentListResponseDto,
  })
  async getMyEnrollments(
    @Request() req: AuthenticatedRequest,
    @Query("status") status?: string,
  ): Promise<EnrollmentListResponseDto> {
    const userId = req.user.id;
    this.logger.log(`내 수강신청 목록 조회: userId=${userId}`);

    const enrollments = await this.enrollmentsService.getMyEnrollments(
      userId,
      status,
    );

    return {
      success: true,
      data: enrollments,
      total: enrollments.length,
    };
  }

  /**
   * 수강신청 상세 조회
   */
  @Get(":enrollmentId")
  @ApiOperation({
    summary: "수강신청 상세 조회",
    description: "특정 수강신청의 상세 정보를 조회합니다.",
  })
  @ApiParam({ name: "enrollmentId", description: "수강신청 ID" })
  @ApiResponse({
    status: 200,
    description: "수강신청 상세 조회 성공",
    type: EnrollmentSingleResponseDto,
  })
  @ApiResponse({ status: 404, description: "수강신청을 찾을 수 없음" })
  async getEnrollment(
    @Request() req: AuthenticatedRequest,
    @Param("enrollmentId") enrollmentId: string,
  ): Promise<EnrollmentSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(
      `수강신청 상세 조회: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    const enrollment = await this.enrollmentsService.getEnrollment(
      userId,
      enrollmentId,
    );

    return {
      success: true,
      data: enrollment,
    };
  }

  /**
   * 수강신청 취소
   */
  @Delete(":enrollmentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "수강신청 취소",
    description:
      "수강신청을 취소합니다. 결제 완료된 건은 환불 절차가 필요합니다.",
  })
  @ApiParam({ name: "enrollmentId", description: "수강신청 ID" })
  @ApiResponse({ status: 204, description: "수강신청 취소 성공" })
  @ApiResponse({ status: 400, description: "취소 불가 상태" })
  @ApiResponse({ status: 404, description: "수강신청을 찾을 수 없음" })
  async cancelEnrollment(
    @Request() req: AuthenticatedRequest,
    @Param("enrollmentId") enrollmentId: string,
  ): Promise<void> {
    const userId = req.user.id;
    this.logger.log(
      `수강신청 취소: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    await this.enrollmentsService.cancelEnrollment(userId, enrollmentId);
  }

  // ================ 방식2 전용 엔드포인트 (학부모 승인) ================

  /**
   * 승인 대기 목록 조회 (학부모용)
   *
   * 내 자녀들이 요청한 수강신청 중 승인 대기 상태인 것만 조회
   */
  @Get("pending/approvals")
  @ApiOperation({
    summary: "승인 대기 목록 조회 (학부모용)",
    description: "내 자녀들의 수강신청 중 승인 대기 상태인 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "승인 대기 목록 조회 성공",
    type: PendingEnrollmentListResponseDto,
  })
  @ApiResponse({ status: 403, description: "학부모만 조회 가능" })
  async getPendingApprovals(
    @Request() req: AuthenticatedRequest,
  ): Promise<PendingEnrollmentListResponseDto> {
    const userId = req.user.id;
    this.logger.log(`승인 대기 목록 조회: userId=${userId}`);

    const enrollments =
      await this.enrollmentsService.getPendingApprovals(userId);

    return {
      success: true,
      data: enrollments,
      pendingCount: enrollments.length,
    };
  }

  /**
   * 수강신청 승인 (학부모)
   */
  @Post(":enrollmentId/approve")
  @AuditAction({
    action: "enrollment.approve",
    resource: "Enrollment",
    includeKeys: ["enrollmentId"],
  })
  @ApiOperation({
    summary: "수강신청 승인",
    description:
      "자녀의 수강 요청을 승인합니다. 주 보호자만 승인할 수 있습니다.",
  })
  @ApiParam({ name: "enrollmentId", description: "수강신청 ID" })
  @ApiResponse({
    status: 200,
    description: "수강신청 승인 성공",
    type: EnrollmentSingleResponseDto,
  })
  @ApiResponse({ status: 400, description: "승인 대기 상태가 아님 또는 만료" })
  @ApiResponse({ status: 403, description: "주 보호자만 승인 가능" })
  @ApiResponse({ status: 404, description: "수강신청을 찾을 수 없음" })
  async approveEnrollment(
    @Request() req: AuthenticatedRequest,
    @Param("enrollmentId") enrollmentId: string,
    @Body() dto: ApproveEnrollmentDto,
  ): Promise<EnrollmentSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(
      `수강신청 승인: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    const enrollment = await this.enrollmentsService.approveEnrollment(
      userId,
      enrollmentId,
      dto,
    );

    return {
      success: true,
      data: enrollment,
    };
  }

  /**
   * 수강신청 거절 (학부모)
   */
  @Post(":enrollmentId/reject")
  @AuditAction({
    action: "enrollment.reject",
    resource: "Enrollment",
    includeKeys: ["enrollmentId", "reason"],
  })
  @ApiOperation({
    summary: "수강신청 거절",
    description:
      "자녀의 수강 요청을 거절합니다. 주 보호자만 거절할 수 있습니다.",
  })
  @ApiParam({ name: "enrollmentId", description: "수강신청 ID" })
  @ApiResponse({
    status: 200,
    description: "수강신청 거절 성공",
    type: EnrollmentSingleResponseDto,
  })
  @ApiResponse({ status: 400, description: "승인 대기 상태가 아님" })
  @ApiResponse({ status: 403, description: "주 보호자만 거절 가능" })
  @ApiResponse({ status: 404, description: "수강신청을 찾을 수 없음" })
  async rejectEnrollment(
    @Request() req: AuthenticatedRequest,
    @Param("enrollmentId") enrollmentId: string,
    @Body() dto: RejectEnrollmentDto,
  ): Promise<EnrollmentSingleResponseDto> {
    const userId = req.user.id;
    this.logger.log(
      `수강신청 거절: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    const enrollment = await this.enrollmentsService.rejectEnrollment(
      userId,
      enrollmentId,
      dto,
    );

    return {
      success: true,
      data: enrollment,
    };
  }

  // ================ 개발 전용 엔드포인트 ================

  /**
   * [DEV ONLY] 수강신청 강제 결제 완료 처리 (Mock Pay)
   *
   * 결제 모듈을 우회하고 enrollment를 paid 상태로 전환합니다.
   * NODE_ENV=production 에서는 호출 차단됩니다.
   */
  @Post(":enrollmentId/mock-paid")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[DEV] 수강신청 강제 결제 완료 처리",
    description:
      "개발 환경 전용 기능입니다. 실제 결제 없이 수강신청을 paid 상태로 전환하고, ClubMember/ClassRegistration 을 자동 생성합니다. 운영 환경에서는 403으로 차단됩니다.",
  })
  @ApiParam({ name: "enrollmentId", description: "수강신청 ID" })
  @ApiResponse({
    status: 200,
    description: "강제 결제 완료 처리 성공",
    type: EnrollmentSingleResponseDto,
  })
  @ApiResponse({ status: 400, description: "결제 불가 상태" })
  @ApiResponse({
    status: 403,
    description: "운영 환경이거나 본인 신청 건이 아님",
  })
  @ApiResponse({ status: 404, description: "수강신청을 찾을 수 없음" })
  async mockPay(
    @Request() req: AuthenticatedRequest,
    @Param("enrollmentId") enrollmentId: string,
  ): Promise<EnrollmentSingleResponseDto> {
    const userId = req.user.id;
    this.logger.warn(
      `[MOCK PAY] 요청: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    const enrollment = await this.enrollmentsService.mockPay(
      userId,
      enrollmentId,
    );

    return {
      success: true,
      data: enrollment,
    };
  }
}
