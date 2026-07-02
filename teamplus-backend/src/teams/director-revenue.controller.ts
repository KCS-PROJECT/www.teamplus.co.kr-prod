import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { DirectorRevenueQueryDto } from "./dto/director-revenue-query.dto";
import { DirectorRevenueService } from "./director-revenue.service";

@ApiTags("Statistics")
@Controller("api/v1/statistics/director")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class DirectorRevenueController {
  constructor(
    private readonly directorRevenueService: DirectorRevenueService,
  ) {}

  @Get("revenue")
  @Roles("DIRECTOR", "COACH", "ADMIN")
  @ApiOperation({
    summary: "감독 매출 리포트 통계 조회",
    description:
      "감독이 관리하는 팀의 수납 기준 매출(선불/후불), 추이, 수업별 매출, 후불 정산 현황, 회원 현황을 집계합니다.",
  })
  @ApiQuery({
    name: "scope",
    required: true,
    enum: ["month", "year"],
    description: "집계 스코프 (월간/연간)",
  })
  @ApiQuery({
    name: "anchor",
    required: true,
    description: "기준 기간. month 스코프는 'YYYY-MM', year 스코프는 'YYYY'",
    example: "2026-06",
  })
  @ApiResponse({ status: 200, description: "감독 매출 리포트 조회 성공" })
  @ApiResponse({ status: 400, description: "scope/anchor 형식이 올바르지 않습니다." })
  async getDirectorRevenue(
    @Request() req: AuthenticatedRequest,
    @Query() query: DirectorRevenueQueryDto,
  ) {
    return this.directorRevenueService.getDirectorRevenue(
      { id: req.user.id, userType: req.user.userType },
      query.scope,
      query.anchor,
    );
  }
}
