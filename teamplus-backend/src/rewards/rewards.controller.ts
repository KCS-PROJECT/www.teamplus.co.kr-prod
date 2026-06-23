import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
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
  ApiParam,
} from "@nestjs/swagger";
import { RewardsService } from "./rewards.service";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { ExchangeRewardDto } from "./dto/exchange-reward.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Rewards")
@Controller("api/v1/rewards")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  /**
   * 쿠폰 생성 (ADMIN)
   */
  @Post("coupons")
  @Roles("ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "쿠폰 생성",
    description: "관리자가 새 쿠폰을 생성합니다.",
  })
  @ApiResponse({ status: 201, description: "쿠폰 생성 성공" })
  @ApiResponse({ status: 409, description: "이미 존재하는 쿠폰 코드입니다." })
  async createCoupon(@Body() dto: CreateCouponDto) {
    return this.rewardsService.createCoupon(dto);
  }

  /**
   * 쿠폰 목록 조회 (ADMIN)
   */
  @Get("coupons")
  @Roles("ADMIN")
  @ApiOperation({
    summary: "쿠폰 목록 조회",
    description: "전체 쿠폰 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "쿠폰 목록 조회 성공" })
  async getCoupons() {
    return this.rewardsService.getCoupons();
  }

  /**
   * 내 쿠폰 목록 조회
   */
  @Get("me")
  @Roles("CHILD", "TEEN", "PARENT")
  @ApiOperation({
    summary: "내 쿠폰 목록",
    description: "로그인한 사용자의 보유 쿠폰을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "내 쿠폰 목록 조회 성공" })
  async getMyCoupons(@Request() req: AuthenticatedRequest) {
    return this.rewardsService.getMyCoupons(req.user.id);
  }

  /**
   * 스티커판 완료 → 쿠폰 교환
   */
  @Post("exchange")
  @Roles("CHILD", "TEEN", "PARENT")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "스티커판 보상 교환",
    description: "완료된 스티커판의 보상 쿠폰을 발급받습니다.",
  })
  @ApiResponse({ status: 200, description: "쿠폰 교환 성공" })
  @ApiResponse({ status: 404, description: "스티커판을 찾을 수 없습니다." })
  @ApiResponse({
    status: 409,
    description: "아직 완료되지 않은 스티커판입니다.",
  })
  async exchangeReward(
    @Body() dto: ExchangeRewardDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.rewardsService.exchangeReward(dto, req.user.id);
  }

  /**
   * 쿠폰 사용 처리
   */
  @Patch("coupons/:userCouponId/use")
  @Roles("CHILD", "TEEN", "PARENT")
  @ApiOperation({
    summary: "쿠폰 사용 처리",
    description: "보유 쿠폰을 사용 처리합니다.",
  })
  @ApiParam({ name: "userCouponId", description: "UserCoupon ID" })
  @ApiResponse({ status: 200, description: "쿠폰 사용 처리 성공" })
  @ApiResponse({ status: 404, description: "쿠폰을 찾을 수 없습니다." })
  @ApiResponse({ status: 409, description: "이미 사용된 쿠폰입니다." })
  async useCoupon(
    @Param("userCouponId") userCouponId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.rewardsService.useCoupon(userCouponId, req.user.id);
  }
}
