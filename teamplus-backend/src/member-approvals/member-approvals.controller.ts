import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
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
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { MemberApprovalsService } from "./member-approvals.service";
import { RejectMemberDto } from "./dto/approve-member.dto";
import { BulkApproveDto, BulkRejectDto } from "./dto/bulk-action.dto";
import {
  QueryApprovalDto,
  QueryApprovalLogDto,
} from "./dto/query-approval.dto";

@ApiTags("Member Approvals")
@Controller("api/v1/member-approvals")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class MemberApprovalsController {
  constructor(
    private readonly memberApprovalsService: MemberApprovalsService,
  ) {}

  /**
   * 대기 중(pending) 회원 목록 조회
   */
  @Get("pending")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "대기 중 회원 목록",
    description:
      "승인 대기 중인 회원 목록을 조회합니다. clubId로 필터 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "대기 중 회원 목록 조회 성공" })
  async getPending(@Query() query: QueryApprovalDto) {
    return this.memberApprovalsService.getPending(query);
  }

  /**
   * 승인된(approved) 회원 목록 조회
   */
  @Get("approved")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "승인된 회원 목록",
    description: "승인된 회원 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "승인된 회원 목록 조회 성공" })
  async getApproved(@Query() query: QueryApprovalDto) {
    return this.memberApprovalsService.getApproved(query);
  }

  /**
   * 거절된(rejected) 회원 목록 조회
   */
  @Get("rejected")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "거절된 회원 목록",
    description: "거절된 회원 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "거절된 회원 목록 조회 성공" })
  async getRejected(@Query() query: QueryApprovalDto) {
    return this.memberApprovalsService.getRejected(query);
  }

  /**
   * 개별 승인
   */
  @Post(":id/approve")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 개별 승인",
    description: "대기 중인 회원을 승인합니다.",
  })
  @ApiResponse({ status: 200, description: "회원 승인 성공" })
  @ApiResponse({ status: 404, description: "회원을 찾을 수 없습니다." })
  @ApiResponse({ status: 409, description: "이미 승인된 회원입니다." })
  async approve(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    return this.memberApprovalsService.approve(
      id,
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 개별 거절 (reason 필수)
   */
  @Post(":id/reject")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 개별 거절",
    description: "대기 중인 회원을 거절합니다. 사유는 필수입니다.",
  })
  @ApiResponse({ status: 200, description: "회원 거절 성공" })
  @ApiResponse({ status: 404, description: "회원을 찾을 수 없습니다." })
  @ApiResponse({ status: 409, description: "이미 거절된 회원입니다." })
  async reject(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: RejectMemberDto,
  ) {
    return this.memberApprovalsService.reject(
      id,
      req.user.id,
      req.user.userType,
      dto.reason,
    );
  }

  /**
   * 학부모 자녀 재신청 (rejected → pending)
   */
  @Post(":id/reapply")
  @Roles("PARENT")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 가입 재신청",
    description:
      "거절된 자녀(approvalStatus=rejected)를 다시 pending 으로 전환합니다. 본인 자녀에 대해서만 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "재신청 성공" })
  @ApiResponse({ status: 403, description: "본인 자녀가 아닙니다." })
  @ApiResponse({ status: 404, description: "회원을 찾을 수 없습니다." })
  @ApiResponse({
    status: 409,
    description: "거절된 자녀만 재신청할 수 있습니다.",
  })
  async reapply(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    return this.memberApprovalsService.reapply(id, req.user.id);
  }

  /**
   * 일괄 승인 (ids 배열)
   */
  @Post("bulk-approve")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 일괄 승인",
    description: "여러 대기 중 회원을 한 번에 승인합니다.",
  })
  @ApiResponse({ status: 200, description: "일괄 승인 성공" })
  @ApiResponse({
    status: 400,
    description: "일부 회원이 존재하지 않거나 상태가 올바르지 않습니다.",
  })
  async bulkApprove(
    @Request() req: AuthenticatedRequest,
    @Body() dto: BulkApproveDto,
  ) {
    return this.memberApprovalsService.bulkApprove(
      dto.ids,
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 일괄 거절 (ids 배열 + reason)
   */
  @Post("bulk-reject")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 일괄 거절",
    description: "여러 대기 중 회원을 한 번에 거절합니다. 사유는 필수입니다.",
  })
  @ApiResponse({ status: 200, description: "일괄 거절 성공" })
  @ApiResponse({
    status: 400,
    description: "일부 회원이 존재하지 않거나 상태가 올바르지 않습니다.",
  })
  async bulkReject(
    @Request() req: AuthenticatedRequest,
    @Body() dto: BulkRejectDto,
  ) {
    return this.memberApprovalsService.bulkReject(
      dto.ids,
      req.user.id,
      req.user.userType,
      dto.reason,
    );
  }

  /**
   * 승인 이력 로그 조회
   */
  @Get("logs")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "승인 이력 로그",
    description:
      "회원 승인/거절 이력 로그를 조회합니다. memberId, clubId로 필터 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "로그 조회 성공" })
  async getLogs(@Query() query: QueryApprovalLogDto) {
    return this.memberApprovalsService.getLogs(query);
  }
}
