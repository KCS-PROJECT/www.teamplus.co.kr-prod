import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { Response } from "express";
import { AdminService } from "./admin.service";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { PrismaService } from "../prisma/prisma.service";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserType } from "@prisma/client";
import { UpdateSettlementBankInfoDto } from "./dto/settlement-action.dto";
import { BulkUserStatusDto } from "./dto/bulk-user-status.dto";
import { CreateCoachDto } from "./dto/create-coach.dto";
import { UpdateCoachDto } from "./dto/update-coach.dto";
import {
  CreateVenueDto,
  UpdateVenueDto,
  UpdateVenueStatusDto,
} from "./dto/venue.dto";
import {
  BulkImportTeamsDto,
  BulkImportPlayersDto,
  BulkImportSchedulesDto,
} from "./dto/bulk-import.dto";

// 클래스 레벨 @Roles("ADMIN") — 기본 정책: 관리자 전용.
// SYSTEM/OPER 는 roles.guard.ts 의 super-admin pass-through 로 자동 통과.
// DIRECTOR/ACADEMY_DIRECTOR 가 접근해야 하는 일부 엔드포인트는 메서드 레벨
// @Roles(...) 로 명시적으로 화이트리스트(예: coaches/:id GET/PUT/DELETE).
@ApiTags("Admin")
@ApiBearerAuth()
@Controller("api/v1/admin")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ADMIN")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  // ==================== 사용자 관리 ====================

  @Get("users")
  @ApiOperation({ summary: "사용자 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "userType", required: false, enum: UserType })
  @ApiQuery({ name: "isVerified", required: false, type: Boolean })
  async getUsers(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("userType") userType?: UserType,
    @Query("isVerified") isVerified?: string,
  ) {
    return this.adminService.getUsers({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      search,
      userType,
      isVerified: isVerified !== undefined ? isVerified === "true" : undefined,
    });
  }

  @Put("users/bulk-status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "사용자 일괄 상태 변경" })
  @ApiResponse({
    status: 200,
    description: "일괄 상태 변경 성공",
    schema: {
      example: {
        success: true,
        updatedCount: 5,
        totalRequested: 6,
        skipped: 1,
      },
    },
  })
  async bulkUpdateUserStatus(
    @Body() dto: BulkUserStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.bulkUpdateUserStatus(
      dto.userIds,
      dto.isVerified,
      req.user.id,
    );
  }

  @Get("users/:id")
  @ApiOperation({ summary: "사용자 상세 조회" })
  async getUser(@Param("id") id: string) {
    return this.adminService.getUser(id);
  }

  @Put("users/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "사용자 정보 수정" })
  async updateUser(
    @Param("id") id: string,
    @Body()
    body: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      age?: number;
    },
  ) {
    return this.adminService.updateUser(id, body);
  }

  @Put("users/:id/type")
  @ApiOperation({ summary: "사용자 타입 변경" })
  async updateUserType(
    @Param("id") id: string,
    @Body("userType") userType: UserType,
  ) {
    return this.adminService.updateUserType(id, userType);
  }

  @Put("users/:id/approve")
  @ApiOperation({ summary: "회원 승인 (관리자)" })
  async approveUser(@Param("id") id: string) {
    await this.prisma.user.update({
      where: { id },
      data: { isVerified: true },
    });
    // ClubMember가 있으면 승인 상태도 업데이트
    await this.prisma.teamMember.updateMany({
      where: { userId: id, approvalStatus: "pending" },
      data: { approvalStatus: "approved" },
    });
    return { success: true, message: "회원이 승인되었습니다." };
  }

  @Put("users/:id/reject")
  @ApiOperation({ summary: "회원 거절 (관리자)" })
  async rejectUser(@Param("id") id: string) {
    await this.prisma.teamMember.updateMany({
      where: { userId: id, approvalStatus: "pending" },
      data: { approvalStatus: "rejected" },
    });
    return { success: true, message: "회원이 거절되었습니다." };
  }

  @Delete("users/:id")
  @ApiOperation({ summary: "사용자 삭제" })
  async deleteUser(@Param("id") id: string) {
    return this.adminService.deleteUser(id);
  }

  @Post("admins")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "관리자 계정 생성 (SYSTEM/OPER)" })
  async createAdmin(
    @Body()
    body: {
      email?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      userType?: string;
    },
  ) {
    return this.adminService.createAdminUser(body);
  }

  @Delete("admins/:id")
  @ApiOperation({ summary: "관리자 계정 삭제" })
  async deleteAdmin(@Param("id") id: string) {
    return this.adminService.deleteAdminUser(id);
  }

  // ==================== 정산 관리 ====================

  @Get("settlements")
  @ApiOperation({ summary: "정산 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "period", required: false, type: String })
  @ApiQuery({ name: "teamId", required: false, type: String })
  async getSettlements(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
    @Query("period") period?: string,
    @Query("teamId") teamId?: string,
  ) {
    return this.adminService.getSettlements({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      status,
      period,
      teamId,
    });
  }

  @Get("settlements/export")
  @ApiOperation({ summary: "정산 엑셀(CSV) 다운로드" })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    description: "시작일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    description: "종료일 (YYYY-MM-DD)",
  })
  @ApiResponse({ status: 200, description: "CSV 파일 다운로드" })
  async exportSettlements(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Res() res?: Response,
  ) {
    const csvBuffer = await this.adminService.exportSettlements(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    const filename = `settlements_${new Date().toISOString().slice(0, 10)}.csv`;

    res!.setHeader("Content-Type", "text/csv; charset=utf-8");
    res!.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res!.send(csvBuffer);
  }

  @Get("settlements/:id")
  @ApiOperation({ summary: "정산 상세 조회" })
  async getSettlement(@Param("id") id: string) {
    return this.adminService.getSettlement(id);
  }

  @Post("settlements/:id/approve")
  @ApiOperation({ summary: "정산 승인" })
  async approveSettlement(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.approveSettlement(id, req.user.id);
  }

  @Post("settlements/:id/reject")
  @ApiOperation({ summary: "정산 거절" })
  async rejectSettlement(
    @Param("id") id: string,
    @Body("reason") reason: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.rejectSettlement(id, req.user.id, reason);
  }

  @Put("settlements/:id/bank-info")
  @ApiOperation({ summary: "정산 계좌 정보 업데이트 (암호화 저장)" })
  async updateSettlementBankInfo(
    @Param("id") id: string,
    @Body() body: UpdateSettlementBankInfoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.updateSettlementBankInfo(id, req.user.id, body);
  }

  // ==================== 감사 로그 ====================

  @Get("audit-logs")
  @ApiOperation({ summary: "감사 로그 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "action", required: false, type: String })
  @ApiQuery({ name: "resource", required: false, type: String })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  async getAuditLogs(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("userId") userId?: string,
    @Query("action") action?: string,
    @Query("resource") resource?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.adminService.getAuditLogs({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
      userId,
      action,
      resource,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  // ==================== 시스템 통계 ====================

  @Get("stats")
  @ApiOperation({ summary: "시스템 전체 통계" })
  async getSystemStats() {
    return this.adminService.getSystemStats();
  }

  // ==================== 회원 레벨/포인트 관리 ====================

  @Get("member-levels")
  @ApiOperation({ summary: "회원 레벨 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "levelName", required: false, type: String })
  async getMemberLevels(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("levelName") levelName?: string,
  ) {
    return this.adminService.getMemberLevels({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      levelName,
    });
  }

  @Post("users/:id/points/adjust")
  @ApiOperation({ summary: "포인트 수동 조정" })
  async adjustPoints(
    @Param("id") userId: string,
    @Body("amount") amount: number,
    @Body("reason") reason: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.adjustPoints(userId, amount, reason, req.user.id);
  }

  // ==================== 승인 이력 ====================

  @Get("members/approval-history")
  @ApiOperation({ summary: "회원 승인/거절 이력 조회" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getApprovalHistory(@Query("limit") limit?: string) {
    return this.adminService.getApprovalHistory(limit ? parseInt(limit) : 50);
  }

  // ==================== 권한 관리 ====================

  @Get("users/:id/permissions")
  @ApiOperation({ summary: "사용자 권한 조회" })
  async getUserPermissions(@Param("id") id: string) {
    return this.adminService.getUserPermissions(id);
  }

  @Put("users/:id/permissions")
  @ApiOperation({ summary: "사용자 권한(타입) 변경" })
  async updateUserPermissions(
    @Param("id") id: string,
    @Body("userType") userType: UserType,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.updateUserPermissions(id, userType, req.user.id);
  }

  // ==================== 구장 관리 (Rink - 레거시) ====================

  @Get("rinks")
  @ApiOperation({ summary: "링크장 목록 조회 (레거시)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getRinks(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.adminService.getRinks({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  // ==================== 구장 관리 (Venue - 신규) ====================

  @Get("venues")
  @ApiOperation({ summary: "구장 목록 조회 (관리자)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "city", required: false, type: String })
  @ApiQuery({ name: "teamId", required: false, type: String })
  async getVenues(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("city") city?: string,
    @Query("teamId") teamId?: string,
  ) {
    return this.adminService.getVenues({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      search,
      status,
      city,
      teamId,
    });
  }

  @Get("venues/:id")
  @ApiOperation({ summary: "구장 상세 조회" })
  async getVenue(@Param("id") id: string) {
    return this.adminService.getVenue(id);
  }

  @Post("venues")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "구장 등록" })
  @ApiResponse({ status: 201, description: "구장 등록 성공" })
  async createVenue(@Body() dto: CreateVenueDto) {
    return this.adminService.createVenue(dto);
  }

  @Put("venues/:id")
  @ApiOperation({ summary: "구장 정보 수정" })
  async updateVenue(@Param("id") id: string, @Body() dto: UpdateVenueDto) {
    return this.adminService.updateVenue(id, dto);
  }

  @Put("venues/:id/status")
  @ApiOperation({ summary: "구장 상태 변경" })
  async updateVenueStatus(
    @Param("id") id: string,
    @Body() dto: UpdateVenueStatusDto,
  ) {
    return this.adminService.updateVenueStatus(
      id,
      dto.status,
      dto.maintenanceNote,
    );
  }

  @Delete("venues/:id")
  @ApiOperation({ summary: "구장 삭제" })
  async deleteVenue(@Param("id") id: string) {
    return this.adminService.deleteVenue(id);
  }

  // ==================== 인벤토리 ====================

  @Get("inventory")
  @ApiOperation({ summary: "인벤토리 조회 (준비 중)" })
  async getInventory() {
    return { data: [], total: 0, message: "인벤토리 기능은 준비 중입니다." };
  }

  // ==================== 코치 관리 ====================

  @Post("coaches")
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "코치 등록" })
  @ApiResponse({ status: 201, description: "코치 등록 성공" })
  @ApiResponse({ status: 400, description: "입력값 검증 실패 / 운영 팀 없음" })
  @ApiResponse({ status: 409, description: "아이디 또는 전화번호 중복" })
  async createCoach(
    @Body() dto: CreateCoachDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.createCoach(dto, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  @Get("coaches")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "코치 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "teamId", required: false, type: String })
  async getCoaches(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("teamId") teamId?: string,
  ) {
    return this.adminService.getCoaches({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      teamId,
    });
  }

  /**
   * [신규 2026-05-15] 코치 상세 조회 — DIRECTOR/ACADEMY_DIRECTOR 도 자신 팀 코치 한정 조회 가능.
   * 프론트엔드 director-coaches/[id] 페이지에서 사용.
   */
  @Get("coaches/:id")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "코치 상세 조회" })
  @ApiResponse({ status: 200, description: "코치 상세 조회 성공" })
  @ApiResponse({
    status: 403,
    description: "이 코치를 관리할 권한이 없습니다.",
  })
  @ApiResponse({ status: 404, description: "코치를 찾을 수 없습니다." })
  async getCoach(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.getCoach(id, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * [신규 2026-05-15] 코치 정보 수정 — director-coaches/[id]/edit 페이지에서 사용.
   * 트랜잭션 + 권한 검증(자신 팀 코치 한정) 포함.
   */
  @Put("coaches/:id")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "코치 정보 수정" })
  @ApiResponse({ status: 200, description: "코치 수정 성공" })
  @ApiResponse({ status: 400, description: "입력값 검증 실패" })
  @ApiResponse({
    status: 403,
    description: "이 코치를 관리할 권한이 없습니다.",
  })
  @ApiResponse({ status: 404, description: "코치를 찾을 수 없습니다." })
  @ApiResponse({ status: 409, description: "전화번호 중복" })
  async updateCoach(
    @Param("id") id: string,
    @Body() dto: UpdateCoachDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.updateCoach(id, dto, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * [신규 2026-05-15] 코치 삭제 — director-coaches 목록/상세에서 사용.
   * 권한 검증 + cascade 차단 검사 후 hard delete.
   */
  @Delete("coaches/:id")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "코치 삭제" })
  @ApiResponse({ status: 200, description: "코치 삭제 성공" })
  @ApiResponse({
    status: 400,
    description: "산하 학생/학부모가 있어 삭제 불가",
  })
  @ApiResponse({
    status: 403,
    description: "이 코치를 관리할 권한이 없습니다.",
  })
  @ApiResponse({ status: 404, description: "코치를 찾을 수 없습니다." })
  async deleteCoach(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.deleteCoach(id, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  // ==================== 결제 요약 (감독) ====================

  /**
   * [신규 2026-05-15] DIRECTOR 결제 요약 — director-payments 페이지용.
   *
   * - DIRECTOR/ACADEMY_DIRECTOR: 자신이 운영하는 팀(teams.coachId=self) 만 집계
   * - ADMIN/SYSTEM/OPER: 전체 활성 팀 집계
   * - 운영 팀 0개면 summary/teams 모두 빈 결과 (200 OK)
   *
   * 응답: { summary: PaymentSummary, teams: TeamPayment[] }
   */
  @Get("director-payment-summary")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "감독 결제 요약",
    description:
      "감독이 운영하는 팀들의 결제 완납/미납·정산 예정 통계를 반환합니다.",
  })
  @ApiResponse({ status: 200, description: "결제 요약 조회 성공" })
  async getDirectorPaymentSummary(@Request() req: AuthenticatedRequest) {
    return this.adminService.getDirectorPaymentSummary({
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * [신규] 미수금 회원 상세 — 보호자 연락처 + 미납 내역.
   */
  @Get("director-payments/unpaid/:memberId")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "미수금 회원 상세",
    description:
      "미납 회원의 보호자 연락처와 미납 내역(선불/후불)을 반환합니다.",
  })
  @ApiResponse({ status: 200, description: "미수금 상세 조회 성공" })
  async getDirectorUnpaidMemberDetail(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
  ) {
    return this.adminService.getDirectorUnpaidMemberDetail(
      { id: req.user.id, userType: req.user.userType },
      memberId,
    );
  }

  /**
   * [신규] 미수금 회원 미납 안내 발송 (인앱+푸시) — 보호자 대상, 24h 쿨다운.
   */
  @Post("director-payments/unpaid/:memberId/remind")
  @HttpCode(HttpStatus.OK)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "미수금 회원 미납 안내 발송",
    description:
      "미납 회원의 보호자에게 인앱+푸시 미납 안내를 발송합니다. 24시간 쿨다운이 적용됩니다.",
  })
  @ApiResponse({ status: 200, description: "발송 결과" })
  async sendDirectorUnpaidReminder(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
  ) {
    return this.adminService.sendDirectorUnpaidReminder(
      { id: req.user.id, userType: req.user.userType },
      memberId,
    );
  }

  // ==================== 벌크 임포트 ====================

  @Post("import/members")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "회원 일괄 등록 (엑셀 파일 업로드)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    description: "엑셀 파일 (.xlsx, .xls)",
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "엑셀 파일 (최대 5MB)",
        },
      },
      required: ["file"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "회원 일괄 등록 결과",
    schema: {
      example: {
        success: true,
        totalRows: 50,
        successCount: 48,
        failCount: 2,
        errors: [
          { row: 5, message: "이미 등록된 이메일입니다: user@test.com" },
          { row: 12, message: "전화번호 형식이 올바르지 않습니다." },
        ],
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, callback) => {
        const allowedMimes = [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ];
        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              "엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.",
            ),
            false,
          );
        }
      },
    }),
  )
  async importMembers(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException("파일이 첨부되지 않았습니다.");
    }
    return this.adminService.importMembers(file, req.user.id);
  }

  @Post("import/credits")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "크레딧 일괄 충전 (엑셀 파일 업로드)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    description: "엑셀 파일 (.xlsx, .xls)",
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "엑셀 파일 (최대 5MB)",
        },
      },
      required: ["file"],
    },
  })
  @ApiResponse({
    status: 200,
    description: "크레딧 일괄 충전 결과",
    schema: {
      example: {
        success: true,
        totalRows: 30,
        successCount: 28,
        failCount: 2,
        errors: [
          { row: 3, message: "등록되지 않은 이메일입니다: test@test.com" },
          { row: 15, message: "해당 클럽의 멤버가 아닙니다." },
        ],
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_req, file, callback) => {
        const allowedMimes = [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ];
        if (allowedMimes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              "엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.",
            ),
            false,
          );
        }
      },
    }),
  )
  async importCredits(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException("파일이 첨부되지 않았습니다.");
    }
    return this.adminService.importCredits(file, req.user.id);
  }

  // ==================== 벌크 임포트 (Teams / Players / Schedules) ====================

  @Post("import/teams")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "팀 일괄 등록",
    description: "JSON 배열로 팀을 일괄 등록합니다. (관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "팀 일괄 등록 결과",
    schema: {
      example: {
        success: true,
        totalRequested: 5,
        successCount: 4,
        failCount: 1,
        created: [{ id: "team-uuid", name: "U10 Dragons" }],
        errors: [{ index: 2, message: "클럽을 찾을 수 없습니다: invalid-id" }],
      },
    },
  })
  async importTeams(
    @Body() dto: BulkImportTeamsDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.importTeams(dto.teams, req.user.id);
  }

  @Post("import/players")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "선수 일괄 등록",
    description: "JSON 배열로 팀 로스터(선수)를 일괄 등록합니다. (관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "선수 일괄 등록 결과",
    schema: {
      example: {
        success: true,
        totalRequested: 10,
        successCount: 9,
        failCount: 1,
        created: [
          { id: "roster-uuid", teamId: "team-uuid", memberId: "member-uuid" },
        ],
        errors: [{ index: 3, message: "회원을 찾을 수 없습니다: invalid-id" }],
      },
    },
  })
  async importPlayers(
    @Body() dto: BulkImportPlayersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.importPlayers(dto.players, req.user.id);
  }

  @Post("import/schedules")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "일정 일괄 등록",
    description: "JSON 배열로 수업 일정을 일괄 등록합니다. (관리자 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "일정 일괄 등록 결과",
    schema: {
      example: {
        success: true,
        totalRequested: 20,
        successCount: 20,
        failCount: 0,
        created: [
          {
            id: "schedule-uuid",
            classId: "class-uuid",
            scheduledDate: "2026-04-10T09:00:00.000Z",
          },
        ],
        errors: [],
      },
    },
  })
  async importSchedules(
    @Body() dto: BulkImportSchedulesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.importSchedules(dto.schedules, req.user.id);
  }

  // ==================== 시스템 모니터링 ====================

  @Get("system/status")
  @ApiOperation({ summary: "시스템 상태 모니터링" })
  async getSystemStatus() {
    return this.adminService.getSystemStatus();
  }

  @Get("system/logs")
  @ApiOperation({ summary: "시스템 로그 조회" })
  @ApiQuery({
    name: "level",
    required: false,
    type: String,
    description: "로그 레벨 (ERROR|WARN|INFO|DEBUG)",
  })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getSystemLogs(
    @Query("level") level?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.getSystemLogs({
      level,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  // ==================== 클럽/아카데미 목록 ====================

  @Get("clubs")
  @ApiOperation({ summary: "클럽/아카데미 목록 조회" })
  @ApiQuery({
    name: "type",
    required: false,
    type: String,
    description: "club|academy (미지정 시 전체)",
  })
  async getClubs(@Query("type") type?: string) {
    return this.adminService.getClubs(type);
  }

  // ==================== 수업 승인 관리 ====================

  @Get("classes/approvals")
  @ApiOperation({
    summary: "수업 승인 목록 조회",
    description: "감독/코치가 등록한 수업의 승인 요청 목록을 조회합니다.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    type: String,
    description: "PENDING|APPROVED|REJECTED",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getClassApprovals(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.getClassApprovals({
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Put("classes/:classId/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 승인",
    description: "관리자가 수업을 승인합니다.",
  })
  async approveClass(
    @Param("classId") classId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.approveClass(classId, req.user.id);
  }

  @Put("classes/:classId/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 거절",
    description: "관리자가 수업을 거절합니다.",
  })
  async rejectClass(
    @Param("classId") classId: string,
    @Request() req: AuthenticatedRequest,
    @Body("reason") reason?: string,
  ) {
    return this.adminService.rejectClass(classId, req.user.id, reason);
  }
}
