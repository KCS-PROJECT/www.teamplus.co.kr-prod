import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Public } from "@/auth/public.decorator";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { BlogService } from "./blog.service";
import { CreateBlogDto } from "./dto/create-blog.dto";
import { UpdateBlogDto } from "./dto/update-blog.dto";
import { QueryBlogDto } from "./dto/query-blog.dto";

/**
 * 랜딩 블로그(BlogPost) — 공개 조회 + 관리(SYSTEM/OPER) CRUD.
 *
 * ⚠️ 컨트롤러 레벨 @UseGuards(AuthGuard("jwt")) 를 쓰지 않는다:
 *   raw Passport AuthGuard("jwt") 는 @Public() 을 인식하지 못해, 컨트롤러 레벨에 걸면
 *   공개 GET 까지 401 이 된다(contact-inquiries 와 동일 함정). @Public 바이패스는 전역
 *   JwtAuthGuard 만 지원하므로, 공개/관리가 한 컨트롤러에 공존할 땐 가드를 메서드 레벨로 내린다.
 *
 * 라우트 순서: 공개 상세 GET /:slug 는 /admin/* 와 세그먼트 수가 달라 충돌하지 않지만,
 *   가독성/안전을 위해 param 라우트(:slug)를 맨 마지막에 선언한다.
 */
@ApiTags("Blog")
@Controller("api/v1/blog")
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  /**
   * 공개 목록 (비로그인) — 발행글만, 카테고리 필터/페이지네이션.
   */
  @Get()
  @Public()
  @ApiOperation({
    summary: "블로그 목록 (공개)",
    description:
      "발행(PUBLISHED)된 글만 조회합니다. category/page/pageSize 지원. 고정글 우선 후 발행 최신순.",
  })
  @ApiResponse({ status: 200, description: "목록 조회 성공" })
  async findPublicList(@Query() query: QueryBlogDto) {
    return this.blogService.findPublicList(query);
  }

  /**
   * 관리자 목록 — 임시저장 포함 전체. `/:slug` 보다 먼저 선언.
   */
  @Get("admin/list")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @ApiOperation({
    summary: "블로그 목록 (관리자)",
    description:
      "임시저장 포함 전체 글을 조회합니다. status/category/search 필터 지원.",
  })
  @ApiResponse({ status: 200, description: "목록 조회 성공" })
  async findAdminList(@Query() query: QueryBlogDto) {
    return this.blogService.findAdminList(query);
  }

  /**
   * 관리자 상세 (편집용) — 임시저장 포함.
   */
  @Get("admin/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @ApiOperation({
    summary: "블로그 상세 (관리자)",
    description: "편집용 상세 — 임시저장 글도 조회됩니다.",
  })
  @ApiResponse({ status: 200, description: "상세 조회 성공" })
  @ApiResponse({ status: 404, description: "게시글을 찾을 수 없습니다." })
  async findAdminById(@Param("id") id: string) {
    return this.blogService.findAdminById(id);
  }

  /**
   * 생성 (관리자).
   */
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "블로그 글 등록 (관리자)",
    description:
      "본문(content)은 저장 시 서버에서 살균됩니다. status=PUBLISHED 로 등록하면 즉시 공개됩니다.",
  })
  @ApiResponse({ status: 201, description: "등록 성공" })
  async create(
    @Body() dto: CreateBlogDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.blogService.create(dto, req.user?.id);
  }

  /**
   * 발행 토글 (관리자) — `/:id` 보다 먼저 선언.
   */
  @Patch(":id/publish")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "블로그 발행 토글 (관리자)",
    description: "DRAFT ⇄ PUBLISHED 를 전환합니다. 최초 발행 시 발행시각이 기록됩니다.",
  })
  @ApiResponse({ status: 200, description: "토글 성공" })
  @ApiResponse({ status: 404, description: "게시글을 찾을 수 없습니다." })
  async togglePublish(@Param("id") id: string) {
    return this.blogService.togglePublish(id);
  }

  /**
   * 수정 (관리자).
   */
  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "블로그 글 수정 (관리자)",
    description: "부분 업데이트. content 는 저장 시 재살균됩니다.",
  })
  @ApiResponse({ status: 200, description: "수정 성공" })
  @ApiResponse({ status: 404, description: "게시글을 찾을 수 없습니다." })
  async update(@Param("id") id: string, @Body() dto: UpdateBlogDto) {
    return this.blogService.update(id, dto);
  }

  /**
   * 삭제 (관리자) — soft delete.
   */
  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "블로그 글 삭제 (관리자)",
    description: "soft delete(deletedAt=now) 처리합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "삭제 성공",
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: "게시글을 찾을 수 없습니다." })
  async remove(@Param("id") id: string) {
    return this.blogService.remove(id);
  }

  /**
   * 공개 상세 (비로그인) — slug 기준. param 라우트라 맨 마지막 선언.
   */
  @Get(":slug")
  @Public()
  @ApiOperation({
    summary: "블로그 상세 (공개)",
    description: "발행글 상세를 slug 로 조회합니다. 조회 시 조회수가 1 증가합니다.",
  })
  @ApiResponse({ status: 200, description: "상세 조회 성공" })
  @ApiResponse({ status: 404, description: "게시글을 찾을 수 없습니다." })
  async findPublicBySlug(@Param("slug") slug: string) {
    return this.blogService.findPublicBySlug(slug);
  }
}
