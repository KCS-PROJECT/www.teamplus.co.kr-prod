import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
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
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { UserSafetyService } from "./user-safety.service";

@ApiTags("User Safety - 차단/신고")
@Controller("api/v1")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class UserSafetyController {
  constructor(private readonly userSafetyService: UserSafetyService) {}

  // ── 차단 ──────────────────────────────────────────────────────────────────

  @Post("users/me/blocks")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "사용자 차단" })
  @ApiResponse({ status: 201, description: "차단 성공" })
  @ApiResponse({ status: 409, description: "이미 차단된 사용자" })
  async blockUser(
    @Request() req: AuthenticatedRequest,
    @Body("blockedId") blockedId: string,
    @Body("reason") reason?: string,
  ) {
    return this.userSafetyService.blockUser(req.user.id, blockedId, reason);
  }

  @Delete("users/me/blocks/:blockedId")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "차단 해제" })
  @ApiResponse({ status: 200, description: "차단 해제 성공" })
  async unblockUser(
    @Request() req: AuthenticatedRequest,
    @Param("blockedId") blockedId: string,
  ) {
    return this.userSafetyService.unblockUser(req.user.id, blockedId);
  }

  @Get("users/me/blocks")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({ summary: "내 차단 목록 조회" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "차단 목록 반환" })
  async getBlockList(
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.userSafetyService.getBlockList(
      req.user.id,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 100) : 20,
    );
  }

  // ── 신고 ──────────────────────────────────────────────────────────────────

  @Post("users/me/reports")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "사용자/콘텐츠 신고",
    description: "동일 대상+targetType에 대해 24시간 1회 제한.",
  })
  @ApiResponse({ status: 201, description: "신고 접수" })
  @ApiResponse({ status: 400, description: "24시간 내 중복 신고" })
  async reportUser(
    @Request() req: AuthenticatedRequest,
    @Body("reportedId") reportedId: string,
    @Body("targetType") targetType: string,
    @Body("category") category: string,
    @Body("targetId") targetId?: string,
    @Body("description") description?: string,
  ) {
    return this.userSafetyService.reportUser(req.user.id, {
      reportedId,
      targetType,
      targetId,
      category,
      description,
    });
  }

  // ── Admin 처리 ────────────────────────────────────────────────────────────

  @Get("admin/reports")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({ summary: "[Admin] 신고 목록 조회" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "신고 목록" })
  async getAdminReports(
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.userSafetyService.getAdminReports({
      status,
      category,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    });
  }

  @Get("admin/reports/:id")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({ summary: "[Admin] 신고 상세 조회" })
  @ApiResponse({ status: 200, description: "신고 상세" })
  @ApiResponse({ status: 404, description: "신고를 찾을 수 없습니다." })
  async getAdminReportDetail(@Param("id") id: string) {
    return this.userSafetyService.getAdminReportDetail(id);
  }

  @Patch("admin/reports/:id")
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "[Admin] 신고 처리 (resolved/rejected)" })
  @ApiResponse({ status: 200, description: "처리 완료" })
  @ApiResponse({ status: 400, description: "이미 처리된 신고" })
  async resolveReport(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body("status") status: "resolved" | "rejected",
    @Body("adminNote") adminNote?: string,
  ) {
    return this.userSafetyService.resolveReport(req.user.id, id, {
      status,
      adminNote,
    });
  }
}
