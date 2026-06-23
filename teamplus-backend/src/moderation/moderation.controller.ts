import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { ModerationService } from "./moderation.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

/**
 * ModerationController — 사용자 차단/신고
 *
 * 일반 사용자: /api/v1/moderation/{blocks,reports}
 * 어드민: /api/v1/admin/moderation/reports
 */
@ApiTags("Moderation")
@Controller()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class ModerationController {
  constructor(private readonly service: ModerationService) {}

  // ──────────────────────────────────────────────────────────────
  // 사용자 - 차단
  // ──────────────────────────────────────────────────────────────

  @Post("api/v1/moderation/blocks")
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
  async blockUser(
    @Request() req: { user: { id: string } },
    @Body() body: { blockedId: string; reason?: string },
  ) {
    return this.service.blockUser(req.user.id, body.blockedId, body.reason);
  }

  @Delete("api/v1/moderation/blocks/:id")
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
  async unblockUser(
    @Request() req: { user: { id: string } },
    @Param("id") id: string,
  ) {
    return this.service.unblockUser(req.user.id, id);
  }

  @Get("api/v1/moderation/blocks/mine")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({ summary: "내 차단 목록" })
  async getMyBlocks(@Request() req: { user: { id: string } }) {
    return this.service.getMyBlocks(req.user.id);
  }

  // ──────────────────────────────────────────────────────────────
  // 사용자 - 신고
  // ──────────────────────────────────────────────────────────────

  @Post("api/v1/moderation/reports")
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
  @ApiOperation({ summary: "사용자/콘텐츠 신고" })
  async createReport(
    @Request() req: { user: { id: string } },
    @Body()
    body: {
      reportedId: string;
      targetType: string;
      targetId?: string;
      category: string;
      description?: string;
    },
  ) {
    return this.service.createReport(req.user.id, body);
  }

  @Get("api/v1/moderation/reports/mine")
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiOperation({ summary: "내 신고 내역" })
  async getMyReports(@Request() req: { user: { id: string } }) {
    return this.service.getMyReports(req.user.id);
  }

  // ──────────────────────────────────────────────────────────────
  // 어드민
  // ──────────────────────────────────────────────────────────────

  @Get("api/v1/admin/moderation/reports")
  @Roles("ADMIN")
  @ApiOperation({ summary: "신고 목록 조회 (어드민)" })
  @ApiQuery({ name: "status", required: false })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getAdminReports(
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.getAdminReports(
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch("api/v1/admin/moderation/reports/:id/status")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "신고 상태 변경 (어드민)" })
  async updateReportStatus(
    @Request() req: { user: { id: string } },
    @Param("id") id: string,
    @Body()
    body: {
      status: "pending" | "reviewing" | "resolved" | "rejected";
      adminNote?: string;
    },
  ) {
    return this.service.updateReportStatus(
      req.user.id,
      id,
      body.status,
      body.adminNote,
    );
  }
}
