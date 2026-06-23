import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
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
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from "@nestjs/swagger";
import { BadgesService } from "./badges.service";
import { AwardBadgeDto } from "./dto/award-badge.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Badges")
@Controller("api/v1/badges")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 기본 — 인증된 모든 사용자 조회. 수여는 메서드 레벨 @Roles.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  /**
   * 전체 뱃지 목록 조회
   */
  @Get()
  @ApiOperation({
    summary: "뱃지 목록 조회",
    description: "카테고리/희귀도로 필터링 가능합니다.",
  })
  @ApiQuery({
    name: "category",
    required: false,
    description: "attendance|skill|achievement|special",
  })
  @ApiQuery({
    name: "rarity",
    required: false,
    description: "common|uncommon|rare|epic|legendary",
  })
  @ApiResponse({ status: 200, description: "뱃지 목록 조회 성공" })
  async getBadges(
    @Query("category") category?: string,
    @Query("rarity") rarity?: string,
  ) {
    return this.badgesService.getBadges(category, rarity);
  }

  /**
   * 내 뱃지 목록 조회 (학생 본인)
   */
  @Get("me")
  @Roles("CHILD", "TEEN", "ADMIN")
  @ApiOperation({
    summary: "내 뱃지 목록",
    description: "로그인한 학생의 획득 뱃지를 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "뱃지 목록 + 획득 통계" })
  async getMyBadges(@Request() req: AuthenticatedRequest) {
    return this.badgesService.getMyBadges(req.user.id);
  }

  /**
   * 자녀 뱃지 목록 조회 (학부모/코치/관리자)
   */
  @Get("child/:childId")
  @Roles("PARENT", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "자녀 뱃지 조회",
    description: "특정 자녀의 획득 뱃지 목록을 조회합니다.",
  })
  @ApiParam({ name: "childId", description: "자녀 User ID" })
  @ApiResponse({ status: 200, description: "뱃지 목록 + 획득 통계" })
  @ApiResponse({ status: 404, description: "자녀를 찾을 수 없습니다." })
  async getChildBadges(@Param("childId") childId: string) {
    return this.badgesService.getChildBadges(childId);
  }

  /**
   * 뱃지 수여 (ADMIN/COACH만)
   */
  @Post(":id/award")
  @Roles("ADMIN", "COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "뱃지 수여",
    description: "관리자 또는 코치가 자녀에게 뱃지를 수여합니다.",
  })
  @ApiParam({ name: "id", description: "뱃지 ID" })
  @ApiResponse({
    status: 201,
    description: "뱃지가 성공적으로 수여되었습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "뱃지 또는 자녀를 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 409,
    description: "이미 해당 뱃지를 보유하고 있습니다.",
  })
  async awardBadge(
    @Param("id") badgeId: string,
    @Body() dto: AwardBadgeDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.badgesService.awardBadge(badgeId, dto, req.user.id);
  }

  /**
   * 뱃지 표시 설정 수정 (본인만)
   */
  @Patch("me/:childBadgeId")
  @Roles("CHILD", "TEEN", "ADMIN")
  @ApiOperation({
    summary: "뱃지 표시 설정",
    description: "뱃지의 표시 여부와 순서를 수정합니다.",
  })
  @ApiParam({ name: "childBadgeId", description: "ChildBadge ID" })
  @ApiResponse({ status: 200, description: "수정 완료" })
  @ApiResponse({
    status: 403,
    description: "본인의 뱃지만 수정할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "뱃지를 찾을 수 없습니다." })
  async updateBadgeDisplay(
    @Param("childBadgeId") childBadgeId: string,
    @Body("isDisplayed") isDisplayed: boolean,
    @Body("displayOrder") displayOrder?: number,
    @Request() req?: any,
  ) {
    return this.badgesService.updateBadgeDisplay(
      req.user.id,
      childBadgeId,
      isDisplayed,
      displayOrder,
    );
  }
}
