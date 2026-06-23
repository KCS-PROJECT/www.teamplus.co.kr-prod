import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { SettlementsService } from "./settlements.service";
import { QuerySettlementDto } from "./dto/query-settlement.dto";
import {
  ApproveSettlementDto,
  RejectSettlementDto,
} from "./dto/approve-settlement.dto";
import { PayoutSettlementDto } from "./dto/payout-settlement.dto";

@ApiTags("Settlements")
@Controller("api/v1/settlements")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class SettlementsController {
  private readonly logger = new Logger(SettlementsController.name);

  constructor(private readonly settlementsService: SettlementsService) {}

  /**
   * 전체 정산 목록 조회 (ADMIN, DIRECTOR)
   */
  @Get()
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "정산 목록 조회",
    description:
      "전체 정산 목록을 조회합니다. 기간 필터, 상태 필터, 페이징을 지원합니다.",
  })
  @ApiResponse({ status: 200, description: "정산 목록 조회 성공" })
  async getSettlements(@Query() query: QuerySettlementDto) {
    return this.settlementsService.getSettlements(query);
  }

  /**
   * 코치 자신 수업 관련 정산 조회
   */
  @Get("my")
  @Roles("COACH")
  @ApiOperation({
    summary: "내 정산 조회 (코치)",
    description: "코치 자신이 소속된 클럽의 정산 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "내 정산 목록 조회 성공" })
  async getMySettlements(
    @Request() req: { user: { id: string } },
    @Query() query: QuerySettlementDto,
  ) {
    return this.settlementsService.getMySettlements(req.user.id, query);
  }

  /**
   * 정산 상세 조회 (SettlementDetail include)
   */
  @Get(":id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "정산 상세 조회",
    description:
      "정산 상세 정보를 조회합니다. 상세 내역(details)과 매니저 정보가 포함됩니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "정산 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async getSettlementById(
    @Request() req: { user: { id: string; userType?: string } },
    @Param("id") id: string,
  ) {
    return this.settlementsService.getSettlementById(id, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 정산 거래 상세 내역 (페이징)
   */
  @Get(":id/details")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "정산 거래 상세 내역 조회",
    description: "정산에 포함된 거래 상세 내역을 페이징으로 조회합니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiResponse({ status: 200, description: "거래 상세 내역 조회 성공" })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async getSettlementDetails(
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;

    return this.settlementsService.getSettlementDetails(
      id,
      pageNum,
      pageSizeNum,
    );
  }

  /**
   * 관리자 정산 승인 (status: pending → approved)
   * ADMIN 또는 DIRECTOR가 재정 검토 후 지급 승인
   */
  @Post(":id/approve")
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "정산 승인 (관리자)",
    description:
      "ADMIN 또는 DIRECTOR가 정산을 승인합니다. status가 pending → approved로 전환됩니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "정산 승인 성공" })
  @ApiResponse({
    status: 400,
    description: "승인 대기(pending) 상태인 정산만 승인할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async adminApproveSettlement(
    @Param("id") id: string,
    @Body() _dto: ApproveSettlementDto,
    @Request() req: { user: { id: string } },
  ) {
    this.logger.log(
      `관리자 정산 승인 요청: settlementId=${id}, adminId=${req.user.id}`,
    );
    return this.settlementsService.adminApproveSettlement(id, req.user.id);
  }

  /**
   * 정산 지급 실행 (status: approved → paid + SettlementTransaction 기록)
   */
  @Post(":id/payout")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "정산 지급",
    description:
      "ADMIN이 정산을 지급합니다. status가 approved → paid로 전환되고 SettlementTransaction이 기록됩니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "정산 지급 성공" })
  @ApiResponse({
    status: 400,
    description: "승인(approved) 상태인 정산만 지급할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async payoutSettlement(
    @Param("id") id: string,
    @Body() dto: PayoutSettlementDto,
    @Request() req: { user: { id: string } },
  ) {
    this.logger.log(
      `정산 지급 요청: settlementId=${id}, adminId=${req.user.id}`,
    );
    return this.settlementsService.payoutSettlement(id, req.user.id, dto.note);
  }

  /**
   * 감독 승인 (managerApprovalStatus → APPROVED)
   */
  @Patch(":id/approve")
  @Roles("DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "정산 승인",
    description: "감독이 정산을 승인합니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "정산 승인 성공" })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  @ApiResponse({ status: 400, description: "이미 승인된 정산입니다." })
  async approveSettlement(
    @Param("id") id: string,
    @Request() req: { user: { id: string } },
  ) {
    this.logger.log(
      `정산 승인 요청: settlementId=${id}, managerId=${req.user.id}`,
    );
    return this.settlementsService.approveSettlement(id, req.user.id);
  }

  /**
   * 감독 거절 (managerApprovalStatus → REJECTED, 사유 필수)
   */
  @Patch(":id/reject")
  @Roles("DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "정산 반려",
    description: "감독이 정산을 반려합니다. 사유를 입력해야 합니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "정산 반려 성공" })
  @ApiResponse({ status: 400, description: "반려 사유를 입력해주세요." })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async rejectSettlement(
    @Param("id") id: string,
    @Body() dto: RejectSettlementDto,
    @Request() req: { user: { id: string } },
  ) {
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException("반려 사유를 입력해주세요.");
    }

    this.logger.log(
      `정산 반려 요청: settlementId=${id}, managerId=${req.user.id}, reason=${dto.reason}`,
    );
    return this.settlementsService.rejectSettlement(
      id,
      req.user.id,
      dto.reason,
    );
  }
}
