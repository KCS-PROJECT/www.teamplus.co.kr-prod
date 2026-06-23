import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
} from "@nestjs/swagger";
import { AcademyPromotionsService } from "./academy-promotions.service";
import {
  CreateAcademyPromotionDto,
  LessonType,
} from "./dto/create-academy-promotion.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("AcademyPromotions")
@Controller("api/v1/academy-promotions")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// [2026-05-13 roles-check] 기본 — 인증된 모든 사용자 조회. mutation 은 메서드 레벨.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class AcademyPromotionsController {
  constructor(
    private readonly academyPromotionsService: AcademyPromotionsService,
  ) {}

  /**
   * 아카데미 홍보 목록 조회 (공개 - 인증 불필요)
   */
  @Get()
  @ApiOperation({
    summary: "아카데미 홍보 목록 조회",
    description: "공개된 아카데미 레슨 홍보 목록을 조회합니다.",
  })
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiQuery({
    name: "lessonType",
    required: false,
    enum: LessonType,
    description: "레슨 유형 필터",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "클럽 ID 필터",
  })
  @ApiResponse({
    status: 200,
    description: "아카데미 홍보 목록 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "promo-cuid",
            title: "[개인/그룹] 아이스하키 레슨 모집",
            lessonType: "PRIVATE",
            scheduleInfo: "매주 월/수 19:30~21:00",
            priceInfo: "3회 20만원 / 4회 26만원",
            venueInfo: "IN CHEON 블랙아이스A",
            viewCount: 42,
            createdAt: "2026-03-16T10:00:00Z",
          },
        ],
        pagination: { total: 10, page: 1, limit: 10, totalPages: 1 },
      },
    },
  })
  async getPromotions(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("lessonType") lessonType?: string,
    @Query("teamId") teamId?: string,
  ) {
    return this.academyPromotionsService.getPromotions(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      lessonType,
      teamId,
    );
  }

  /**
   * 아카데미 홍보 상세 조회 (공개 - 인증 불필요, viewCount 증가)
   */
  @Get(":promotionId")
  @ApiOperation({
    summary: "아카데미 홍보 상세 조회",
    description:
      "특정 아카데미 레슨 홍보의 상세 내용을 조회합니다. 조회 시 viewCount가 증가합니다.",
  })
  @ApiResponse({ status: 200, description: "아카데미 홍보 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "게시물을 찾을 수 없습니다." })
  async getPromotion(
    @Param("promotionId") promotionId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const userId: string | undefined = req?.user?.id;
    return this.academyPromotionsService.getPromotion(promotionId, userId);
  }

  /**
   * 아카데미 홍보 등록 (COACH, DIRECTOR만)
   */
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "아카데미 홍보 등록",
    description: "레슨 홍보 게시물을 등록합니다. (코치, 감독 전용)",
  })
  @ApiResponse({ status: 201, description: "아카데미 홍보 등록 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  async createPromotion(
    @Request() req: AuthenticatedRequest,
    @Body() createDto: CreateAcademyPromotionDto,
  ) {
    return this.academyPromotionsService.createPromotion(
      req.user.id,
      createDto,
    );
  }

  /**
   * 아카데미 홍보 수정 (작성자 본인만)
   */
  @Put(":promotionId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "아카데미 홍보 수정",
    description: "본인이 등록한 레슨 홍보 게시물을 수정합니다.",
  })
  @ApiResponse({ status: 200, description: "아카데미 홍보 수정 성공" })
  @ApiResponse({
    status: 403,
    description: "본인 게시물만 수정할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "게시물을 찾을 수 없습니다." })
  async updatePromotion(
    @Request() req: AuthenticatedRequest,
    @Param("promotionId") promotionId: string,
    @Body() updateDto: Partial<CreateAcademyPromotionDto>,
  ) {
    return this.academyPromotionsService.updatePromotion(
      req.user.id,
      promotionId,
      updateDto,
    );
  }

  /**
   * 아카데미 홍보 삭제 (작성자 본인 또는 ADMIN)
   */
  @Delete(":promotionId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "아카데미 홍보 삭제",
    description: "레슨 홍보 게시물을 삭제합니다. (작성자 본인 또는 관리자)",
  })
  @ApiResponse({ status: 200, description: "아카데미 홍보 삭제 성공" })
  @ApiResponse({
    status: 403,
    description: "본인 게시물만 삭제할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "게시물을 찾을 수 없습니다." })
  async deletePromotion(
    @Request() req: AuthenticatedRequest,
    @Param("promotionId") promotionId: string,
  ) {
    return this.academyPromotionsService.deletePromotion(
      req.user.id,
      req.user.userType,
      promotionId,
    );
  }
}
