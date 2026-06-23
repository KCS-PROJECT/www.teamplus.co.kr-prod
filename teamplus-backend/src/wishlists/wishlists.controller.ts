import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { WishlistsService } from "./wishlists.service";
import { AddWishlistDto, WishlistTargetType } from "./dto/add-wishlist.dto";
import { QueryWishlistDto } from "./dto/query-wishlist.dto";

/**
 * WishlistsController
 *
 * 통합 찜(Wishlist) API.
 * - polymorphic 방식으로 PRODUCT, CLUB, ACADEMY, COACH, CLASS, TOURNAMENT, VENUE 등을 통합 관리
 * - JwtAuthGuard는 APP_GUARD로 전역 등록되어 있으므로 별도 선언 불필요
 * - RolesGuard만 UseGuards로 적용
 */
@ApiTags("위시리스트 (찜)")
@ApiBearerAuth()
@Controller("api/v1/wishlists")
@UseGuards(RolesGuard)
export class WishlistsController {
  constructor(private readonly wishlistsService: WishlistsService) {}

  /**
   * 찜 추가
   */
  @Post()
  @Roles("PARENT", "TEEN", "CHILD")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "찜 추가" })
  @ApiResponse({ status: 201, description: "찜 추가 성공" })
  @ApiResponse({ status: 400, description: "대상 리소스를 찾을 수 없음" })
  @ApiResponse({ status: 409, description: "이미 찜한 항목" })
  async add(
    @Request() req: { user: { id: string } },
    @Body() dto: AddWishlistDto,
  ) {
    return this.wishlistsService.addToWishlist(req.user.id, dto);
  }

  /**
   * 내 찜 목록 조회
   */
  @Get("my")
  @Roles("PARENT", "TEEN", "CHILD")
  @ApiOperation({ summary: "내 찜 목록 조회" })
  @ApiResponse({ status: 200, description: "찜 목록 조회 성공" })
  async getMy(
    @Request() req: { user: { id: string } },
    @Query() query: QueryWishlistDto,
  ) {
    return this.wishlistsService.getMyWishlists(req.user.id, query);
  }

  /**
   * 타입별 찜 개수 조회
   */
  @Get("count")
  @Roles("PARENT", "TEEN", "CHILD")
  @ApiOperation({ summary: "타입별 찜 개수 조회" })
  @ApiResponse({ status: 200, description: "찜 개수 조회 성공" })
  async getCount(@Request() req: { user: { id: string } }) {
    return this.wishlistsService.getCount(req.user.id);
  }

  /**
   * 특정 대상 찜 여부 확인 (UI 하트 아이콘용)
   */
  @Get("check/:targetType/:targetId")
  @Roles("PARENT", "TEEN", "CHILD")
  @ApiOperation({ summary: "찜 여부 확인" })
  @ApiParam({
    name: "targetType",
    enum: WishlistTargetType,
    description: "대상 타입",
  })
  @ApiParam({ name: "targetId", description: "대상 ID" })
  @ApiResponse({ status: 200, description: "찜 여부 확인 성공" })
  async isWishlisted(
    @Request() req: { user: { id: string } },
    @Param("targetType") targetType: WishlistTargetType,
    @Param("targetId") targetId: string,
  ) {
    return this.wishlistsService.isWishlisted(
      req.user.id,
      targetType,
      targetId,
    );
  }

  /**
   * 찜 삭제
   */
  @Delete(":targetType/:targetId")
  @Roles("PARENT", "TEEN", "CHILD")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "찜 삭제" })
  @ApiParam({
    name: "targetType",
    enum: WishlistTargetType,
    description: "대상 타입",
  })
  @ApiParam({ name: "targetId", description: "대상 ID" })
  @ApiResponse({ status: 200, description: "찜 삭제 성공" })
  @ApiResponse({ status: 404, description: "찜 항목을 찾을 수 없음" })
  async remove(
    @Request() req: { user: { id: string } },
    @Param("targetType") targetType: WishlistTargetType,
    @Param("targetId") targetId: string,
  ) {
    return this.wishlistsService.removeFromWishlist(
      req.user.id,
      targetType,
      targetId,
    );
  }
}
