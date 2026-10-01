import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Response } from "express";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiProduces,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import type { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { SettlementsService } from "./settlements.service";
import { SettlementCloseService } from "./settlement-close.service";
import { QuerySettlementDto } from "./dto/query-settlement.dto";
import { QuerySettlementDetailsDto } from "./dto/query-settlement-details.dto";
import {
  ApproveSettlementDto,
  RejectSettlementDto,
} from "./dto/approve-settlement.dto";
import { PayoutSettlementDto } from "./dto/payout-settlement.dto";
import { TeamSettlementAccountService } from "./team-settlement-account.service";
import { QuerySettlementAccountsDto } from "./dto/query-settlement-accounts.dto";
import { UpdateAccountRegistrationDto } from "./dto/update-account-registration.dto";
import { CloseSettlementDto } from "./dto/close-settlement.dto";
import {
  QueryPayoutFileDto,
  QueryPayoutFilePreviewDto,
} from "./dto/query-payout-file.dto";
import { NICE_XLSX_CONTENT_TYPE } from "./utils/nice-xlsx.util";
import { nowKstParts } from "@/common/utils/kst-date.util";

@ApiTags("Settlements")
@Controller("api/v1/settlements")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class SettlementsController {
  private readonly logger = new Logger(SettlementsController.name);

  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly settlementCloseService: SettlementCloseService,
    private readonly accountService: TeamSettlementAccountService,
  ) {}

  @Get()
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "정산 목록 조회",
    description:
      "관리자는 전체(또는 지정 팀), DIRECTOR/COACH는 본인 관리 팀 범위로 정산 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "정산 목록 조회 성공" })
  async getSettlements(
    @Query() query: QuerySettlementDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.getSettlements(query, req.user);
  }

  /**
   * static path — `:id` 보다 반드시 위에 선언해야 "export" 가 :id 로 매칭되지 않는다.
   */
  @Get("export")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "정산 목록 CSV 다운로드",
    description: "관리자 전용. 계좌번호는 복호화된 평문으로 포함됩니다.",
  })
  @ApiProduces("text/csv")
  @ApiResponse({ status: 200, description: "CSV 파일 다운로드" })
  async exportSettlements(
    @Query() query: QuerySettlementDto,
    @Res() res: Response,
  ) {
    const csvBuffer = await this.settlementsService.exportSettlements(
      query.startDate,
      query.endDate,
      query.month,
    );

    const filename = `settlements_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvBuffer);
  }

  /**
   * static path — `:id` 보다 반드시 위에 선언해야 "close" 가 :id 로 매칭되지 않는다.
   */
  @Post("close")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "월 마감 생성",
    description:
      "정산 원장(ledger)을 팀×결제 단위로 묶어 Settlement/SettlementDetail 을 생성·재계산합니다. " +
      "당월·미래월은 마감할 수 없고, approved/paid 등으로 확정된 팀은 잠겨 드리프트만 보고됩니다.",
  })
  @ApiResponse({ status: 200, description: "월 마감 생성 성공" })
  @ApiResponse({
    status: 400,
    description: "해당 월이 종료된 후에 마감할 수 있습니다.",
  })
  @AuditAction({
    action: "settlement.close",
    resource: "Settlement",
    includeKeys: ["month"],
  })
  async closeSettlement(@Body() dto: CloseSettlementDto) {
    this.logger.log(`정산 마감 요청: month=${dto.month}`);
    return this.settlementCloseService.closeMonth(dto.month);
  }

  /**
   * static path — `:id` 보다 반드시 위에 선언해야 "summary" 가 :id 로 매칭되지 않는다.
   */
  @Get("summary")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "정산 현황 요약",
    description:
      "정산 상태별 건수·순지급액 합계를 조회합니다. month 생략 시 전체 기간을 집계합니다.",
  })
  @ApiQuery({
    name: "month",
    required: false,
    description: "정산월 YYYY-MM (생략 시 전체 기간)",
  })
  @ApiResponse({ status: 200, description: "정산 현황 요약 조회 성공" })
  async getSettlementsSummary(@Query("month") month?: string) {
    return this.settlementsService.getSettlementsSummary(month);
  }

  /**
   * static path — `:id` 보다 반드시 위에 선언해야 "payout-export" 가 :id 로 매칭되지 않는다.
   */
  @Get("payout-export")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "지급 대상 CSV 다운로드",
    description:
      "approved 상태 정산만 포함합니다. 계좌번호는 복호화된 평문입니다.",
  })
  @ApiQuery({ name: "month", required: true, description: "정산월 YYYY-MM" })
  @ApiProduces("text/csv")
  @ApiResponse({ status: 200, description: "CSV 파일 다운로드" })
  async getPayoutExport(@Query("month") month: string, @Res() res: Response) {
    const csvBuffer = await this.settlementsService.getPayoutExport(month);
    const filename = `settlement_payout_${month}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvBuffer);
  }

  @Get("payout-file/preview")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "나이스 지급 엑셀 미리보기",
    description:
      "지급 예정(approved) 정산 중 나이스 지급 엑셀에 들어갈 팀과 빠지는 팀·사유. 계좌번호는 포함하지 않습니다. 지급일은 KST 기준 오늘 이후(오늘이면 10:30 전)·평일·31일 이내.",
  })
  @ApiResponse({ status: 200, description: "미리보기 조회 성공" })
  @ApiResponse({ status: 400, description: "지급일 오류(PAYOUT_DATE_INVALID)" })
  async getPayoutFilePreview(@Query() query: QueryPayoutFilePreviewDto) {
    return this.settlementsService.getPayoutFilePreview(
      query.month,
      query.payDate,
    );
  }

  @Get("payout-file")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "나이스 지급 엑셀 다운로드",
    description:
      "나이스 관리자 지급내역 다량등록 양식(서브ID·지급일·지급액). 미리보기의 fingerprint 와 지금 내용이 다르면 409 PAYOUT_FILE_CHANGED.",
  })
  @ApiProduces(NICE_XLSX_CONTENT_TYPE)
  @ApiResponse({ status: 200, description: "xlsx 파일 다운로드" })
  @ApiResponse({ status: 400, description: "지급일 오류(PAYOUT_DATE_INVALID)" })
  @ApiResponse({
    status: 409,
    description:
      "내용 변경(PAYOUT_FILE_CHANGED) · 대상 없음(PAYOUT_FILE_EMPTY)",
  })
  @AuditAction({
    action: "settlement.payout-file",
    resource: "Settlement",
    includeKeys: ["month", "payDate"],
  })
  async getPayoutFile(
    @Query() query: QueryPayoutFileDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const { buffer, payDateCompact } =
      await this.settlementsService.getPayoutFile(
        query.month,
        query.payDate,
        query.fingerprint,
        req.user.id,
      );
    res.setHeader("Content-Type", NICE_XLSX_CONTENT_TYPE);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nice_payout_${payDateCompact}_${query.month}.xlsx"`,
    );
    res.send(buffer);
  }

  /**
   * static path — `:id` 보다 반드시 위에 선언해야 "accounts" 가 :id 로 매칭되지 않는다.
   */
  @Get("accounts/nice-registration-export")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "나이스 서브ID 등록 엑셀 다운로드",
    description:
      "나이스 관리자 서브ID 다량등록 양식. 나이스에 등록한 적 없는 활성 팀 계좌만 담습니다(최대 500건). 사업자번호·계좌번호는 복호화된 평문입니다.",
  })
  @ApiProduces(NICE_XLSX_CONTENT_TYPE)
  @ApiResponse({ status: 200, description: "xlsx 파일 다운로드" })
  @ApiResponse({
    status: 409,
    description: "등록할 팀 없음(NICE_REGISTRATION_EMPTY)",
  })
  @AuditAction({
    action: "settlement-account.nice-registration-export",
    resource: "TeamSettlementAccount",
  })
  async getNiceRegistrationExport(
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const buffer = await this.accountService.buildNiceRegistrationFile(
      req.user.id,
    );
    const { year, month, day } = nowKstParts();
    res.setHeader("Content-Type", NICE_XLSX_CONTENT_TYPE);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nice_subid_${year}${month}${day}.xlsx"`,
    );
    res.send(buffer);
  }

  @Get("accounts")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "팀 정산 계좌 목록",
    description:
      "관리자 전용. 활성 팀 전체(계좌 미입력 팀 포함)를 계좌 상태와 함께 조회합니다. 사업자번호·계좌번호는 평문입니다.",
  })
  @ApiResponse({ status: 200, description: "계좌 목록 조회 성공" })
  async getSettlementAccounts(@Query() query: QuerySettlementAccountsDto) {
    return this.accountService.listForAdmin(query);
  }

  @Get("payout-modes")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "지급대행 API 사용 단계 선택지",
    description:
      "off·readonly·live 와 선택 가능 여부. 지급대행 키가 없으면 readonly·live 는 선택할 수 없습니다. 현재 값은 앱 설정 payoutApiMode.",
  })
  @ApiResponse({ status: 200, description: "선택지 조회 성공" })
  getPayoutModes() {
    return this.settlementsService.getPayoutModes();
  }

  @Get("balance")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "나이스 지급대행 잔액 조회",
    description:
      "지급대행 모드가 readonly·live 일 때만 호출합니다. off 면 409 PAYOUT_API_OFF, 나이스 오류면 502 NICE_PAYOUT_API_FAILED.",
  })
  @ApiResponse({ status: 200, description: "잔액 조회 성공" })
  @ApiResponse({ status: 409, description: "지급대행 API 미사용(off)" })
  @ApiResponse({ status: 502, description: "나이스 응답 오류" })
  async getPayoutBalance(@Request() req: AuthenticatedRequest) {
    return this.settlementsService.getPayoutBalance(req.user.id);
  }

  @Post("accounts/:teamId/register")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "팀 정산 계좌 나이스 재등록",
    description:
      "지급대행 모드 live 전용. 저장된 계좌로 나이스 서브몰 등록(없으면 신규, 있으면 수정)을 다시 호출하고 결과로 상태를 정합니다. " +
      "23:00~01:00 은 409 SUBMALL_WINDOW_CLOSED, 진행 중이면 409 SUBMALL_REGISTRATION_IN_PROGRESS.",
  })
  @ApiParam({ name: "teamId", description: "팀 ID" })
  @ApiResponse({
    status: 200,
    description: "호출 완료(결과는 status·lastResMsg)",
  })
  @ApiResponse({ status: 404, description: "정산 계좌가 등록되지 않은 팀" })
  @ApiResponse({
    status: 409,
    description: "live 아님 · 등록 불가 시간 · 진행 중",
  })
  @AuditAction({
    action: "settlement-account.nice-register",
    resource: "TeamSettlementAccount",
    includeKeys: ["teamId"],
  })
  async registerSettlementAccount(
    @Param("teamId") teamId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.accountService.registerByAdmin(teamId, req.user.id);
  }

  @Patch("accounts/:teamId/registration")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "팀 정산 계좌 나이스 등록 상태 변경",
    description:
      "수동 운영(off·readonly) 전용. 운영자가 나이스 관리자에 서브몰 등록을 마친 뒤 REGISTERED 로 표시하거나, SUBMITTED 로 해제합니다. " +
      "expectedUpdatedAt 이 현재 계좌와 다르면(그 사이 감독 수정) 409. live 모드에서는 409 PAYOUT_API_LIVE.",
  })
  @ApiParam({ name: "teamId", description: "팀 ID" })
  @ApiResponse({ status: 200, description: "상태 변경 성공" })
  @ApiResponse({ status: 404, description: "정산 계좌가 등록되지 않은 팀" })
  @ApiResponse({ status: 409, description: "계좌 정보가 변경됨 · live 모드" })
  @AuditAction({
    action: "settlement-account.registration",
    resource: "TeamSettlementAccount",
    includeKeys: ["teamId", "status"],
  })
  async updateAccountRegistration(
    @Param("teamId") teamId: string,
    @Body() dto: UpdateAccountRegistrationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.accountService.updateRegistration(teamId, dto, req.user.id);
  }

  @Delete("accounts/:teamId")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "팀 정산 계좌 초기화",
    description:
      "운영자가 사업자번호 변경 등을 확인한 뒤 계좌를 삭제합니다. 감독이 처음부터 다시 입력합니다. 지급 완료 정산은 스냅샷이라 영향 없습니다.",
  })
  @ApiParam({ name: "teamId", description: "팀 ID" })
  @ApiResponse({ status: 200, description: "초기화 성공" })
  @ApiResponse({ status: 404, description: "정산 계좌가 등록되지 않은 팀" })
  @AuditAction({
    action: "settlement-account.reset",
    resource: "TeamSettlementAccount",
    includeKeys: ["teamId"],
  })
  async resetSettlementAccount(
    @Param("teamId") teamId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.accountService.reset(teamId, req.user.id);
  }

  @Get(":id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "정산 상세 조회",
    description:
      "정산 상세 정보를 조회합니다. 관리자급은 계좌번호 평문, 그 외 스코프 통과자는 마스킹되어 응답됩니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "정산 상세 조회 성공" })
  @ApiResponse({
    status: 403,
    description: "정산 정보를 조회할 권한이 없습니다.",
  })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async getSettlementById(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.getSettlementById(id, req.user);
  }

  @Get(":id/details/summary")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "정산 명세 출처별 요약",
    description:
      "정산 명세를 수업·대회별로 묶어 결제·환불 건수와 금액, 수수료, 지급액을 조회합니다. " +
      "코치도 조회할 수 있습니다(건별 명세·CSV 는 불가).",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "출처별 요약 조회 성공" })
  @ApiResponse({
    status: 403,
    description: "정산 상세 내역을 조회할 권한이 없습니다.",
  })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async getSettlementDetailsSummary(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.getSettlementDetailsSummary(id, req.user);
  }

  @Get(":id/details/export")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "정산 명세 CSV 다운로드",
    description:
      "건별 명세 조회와 같은 필터(entryType·q·sourceType·sourceId·productName)로 전체 행을 내려받습니다. 계좌 정보는 포함하지 않습니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiProduces("text/csv")
  @ApiResponse({ status: 200, description: "CSV 파일 다운로드" })
  @ApiResponse({
    status: 403,
    description: "정산 상세 내역을 조회할 권한이 없습니다.",
  })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async exportSettlementDetails(
    @Param("id") id: string,
    @Query() query: QuerySettlementDetailsDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const { buffer, filename } =
      await this.settlementsService.exportSettlementDetails(
        id,
        query,
        req.user,
      );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(":id/details")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "정산 거래 상세 내역 조회",
    description:
      "정산에 포함된 거래 상세 내역을 페이징으로 조회합니다. 구분·검색어·출처로 거를 수 있습니다. 코치는 403.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "거래 상세 내역 조회 성공" })
  @ApiResponse({
    status: 403,
    description: "정산 상세 내역을 조회할 권한이 없습니다.",
  })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  async getSettlementDetails(
    @Param("id") id: string,
    @Query() query: QuerySettlementDetailsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.getSettlementDetails(id, query, req.user);
  }

  @Post(":id/approve")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "정산 승인",
    description:
      "ADMIN이 정산을 승인합니다. status가 pending → approved로 전환됩니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "정산 승인 성공" })
  @ApiResponse({
    status: 400,
    description: "승인 대기(pending) 상태인 정산만 승인할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  @AuditAction({
    action: "settlement.approve",
    resource: "Settlement",
    includeKeys: ["id", "note"],
  })
  async approveSettlement(
    @Param("id") id: string,
    @Body() dto: ApproveSettlementDto,
    @Request() req: AuthenticatedRequest,
  ) {
    this.logger.log(
      `정산 승인 요청: settlementId=${id}, adminId=${req.user.id}`,
    );
    return this.settlementsService.approve(id, req.user.id, dto.note);
  }

  @Post(":id/reject")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "정산 반려",
    description:
      "ADMIN이 정산을 반려합니다. status가 pending → rejected로 전환되며 사유가 필수입니다.",
  })
  @ApiParam({ name: "id", description: "정산 ID" })
  @ApiResponse({ status: 200, description: "정산 반려 성공" })
  @ApiResponse({
    status: 400,
    description: "반려 사유를 입력해주세요 / 대기 상태가 아닙니다.",
  })
  @ApiResponse({ status: 404, description: "정산 정보를 찾을 수 없습니다." })
  @AuditAction({
    action: "settlement.reject",
    resource: "Settlement",
    includeKeys: ["id", "reason"],
  })
  async rejectSettlement(
    @Param("id") id: string,
    @Body() dto: RejectSettlementDto,
    @Request() req: AuthenticatedRequest,
  ) {
    this.logger.log(
      `정산 반려 요청: settlementId=${id}, adminId=${req.user.id}, reason=${dto.reason}`,
    );
    return this.settlementsService.reject(id, req.user.id, dto.reason);
  }

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
  @AuditAction({
    action: "settlement.payout",
    resource: "Settlement",
    includeKeys: ["id", "note"],
  })
  async payoutSettlement(
    @Param("id") id: string,
    @Body() dto: PayoutSettlementDto,
    @Request() req: AuthenticatedRequest,
  ) {
    this.logger.log(
      `정산 지급 요청: settlementId=${id}, adminId=${req.user.id}`,
    );
    return this.settlementsService.payout(
      id,
      req.user.id,
      dto.note,
      dto.expectedAccountUpdatedAt,
    );
  }
}
