import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
  Patch,
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
import { ReviewsService } from "./reviews.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { UpdateReviewDto, ToggleVisibilityDto } from "./dto/update-review.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Reviews")
@Controller("api/v1/reviews")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * 리뷰 작성 (학부모)
   */
  @Post()
  @Roles("PARENT", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "수업 리뷰 작성",
    description: "학부모가 수업 리뷰를 작성합니다.",
  })
  @ApiResponse({ status: 201, description: "리뷰가 등록되었습니다." })
  @ApiResponse({
    status: 409,
    description: "이미 해당 수업에 리뷰를 작성하셨습니다.",
  })
  async createReview(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(req.user.id, dto);
  }

  /**
   * 전체 리뷰 목록 (관리자용)
   */
  @Get()
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "전체 리뷰 목록 조회 (관리자)",
    description: "관리자가 모든 리뷰를 페이지네이션으로 조회합니다.",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "페이지 번호 (기본: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "페이지 크기 (기본: 20)",
  })
  @ApiResponse({ status: 200, description: "전체 리뷰 목록 조회 성공" })
  async getAllReviews(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.reviewsService.getAllReviews(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * 내 리뷰 목록
   */
  @Get("me")
  @Roles("PARENT", "ADMIN")
  @ApiOperation({ summary: "내 리뷰 목록 조회" })
  @ApiResponse({ status: 200, description: "리뷰 목록 조회 성공" })
  async getMyReviews(@Request() req: AuthenticatedRequest) {
    return this.reviewsService.getMyReviews(req.user.id);
  }

  /**
   * 수업별 공개 리뷰 목록
   */
  @Get("class/:classId")
  @Roles("PARENT", "CHILD", "TEEN", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "수업별 리뷰 목록",
    description: "해당 수업의 공개 리뷰를 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "리뷰 목록 및 평균 별점 조회 성공" })
  async getReviewsByClass(@Param("classId") classId: string) {
    return this.reviewsService.getReviewsByClass(classId);
  }

  /**
   * 리뷰 수정 (본인만)
   */
  @Patch(":id")
  @Roles("PARENT", "ADMIN")
  @ApiOperation({
    summary: "리뷰 수정",
    description: "본인이 작성한 리뷰를 수정합니다.",
  })
  @ApiResponse({ status: 200, description: "리뷰가 수정되었습니다." })
  @ApiResponse({
    status: 403,
    description: "본인이 작성한 리뷰만 수정할 수 있습니다.",
  })
  async updateReview(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateReview(req.user.id, id, dto);
  }

  /**
   * 리뷰 공개/비공개 토글 (관리자)
   */
  @Patch(":id/visibility")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "리뷰 공개/비공개 설정 (관리자)",
    description: "관리자가 리뷰 공개 여부를 변경합니다.",
  })
  @ApiResponse({ status: 200, description: "공개 여부 변경 성공" })
  async toggleVisibility(
    @Param("id") id: string,
    @Body() dto: ToggleVisibilityDto,
  ) {
    return this.reviewsService.toggleVisibility(id, dto);
  }

  /**
   * 리뷰 삭제 (본인 또는 관리자)
   */
  @Delete(":id")
  @Roles("PARENT", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "리뷰 삭제",
    description: "본인이 작성한 리뷰 또는 관리자가 리뷰를 삭제합니다.",
  })
  @ApiResponse({ status: 200, description: "리뷰가 삭제되었습니다." })
  async deleteReview(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    const isAdmin = req.user.userType === "ADMIN";
    return this.reviewsService.deleteReview(req.user.id, id, isAdmin);
  }
}
