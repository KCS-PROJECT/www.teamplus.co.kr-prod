import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
} from "@nestjs/swagger";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { LevelCalculatorService } from "./level-calculator.service";

@ApiTags("MemberLevel (선수 등급)")
@Controller("api/v1/member-level")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class MemberLevelController {
  constructor(
    private readonly levelCalculatorService: LevelCalculatorService,
  ) {}

  @Get("pending")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "승인 대기 중인 등급 변경 목록 조회" })
  @ApiQuery({
    name: "season",
    required: false,
    description: "시즌 (예: 2025-2026)",
  })
  @ApiResponse({ status: 200, description: "대기 중 등급 목록" })
  async getPendingApprovals(@Query("season") season?: string) {
    return this.levelCalculatorService.getPendingApprovals(season);
  }

  @Patch(":historyId/approve")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "등급 변경 승인" })
  @ApiParam({ name: "historyId", description: "MemberLevelHistory ID" })
  @ApiResponse({ status: 200, description: "등급이 승인되었습니다." })
  @ApiResponse({ status: 404, description: "이력을 찾을 수 없습니다." })
  @ApiResponse({ status: 403, description: "이미 처리된 이력입니다." })
  async approveLevel(
    @Param("historyId") historyId: string,
    @Request() req: { user: { id: string } },
  ) {
    await this.levelCalculatorService.approveLevel(historyId, req.user.id);
    return { message: "등급이 승인되었습니다." };
  }

  @Patch(":historyId/override")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "등급 직접 변경 (감독 오버라이드)" })
  @ApiParam({ name: "historyId", description: "MemberLevelHistory ID" })
  @ApiResponse({ status: 200, description: "등급이 변경되었습니다." })
  @ApiResponse({ status: 404, description: "이력을 찾을 수 없습니다." })
  async overrideLevel(
    @Param("historyId") historyId: string,
    @Body() body: { newLevel: number },
    @Request() req: { user: { id: string } },
  ) {
    await this.levelCalculatorService.overrideLevel(
      historyId,
      req.user.id,
      body.newLevel,
    );
    return { message: "등급이 변경되었습니다." };
  }

  @Post("run")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "등급 계산 수동 실행 (ADMIN 전용)" })
  @ApiResponse({ status: 200, description: "계산 결과 통계" })
  async runCalculation() {
    return this.levelCalculatorService.runMonthlyCalculation();
  }
}
