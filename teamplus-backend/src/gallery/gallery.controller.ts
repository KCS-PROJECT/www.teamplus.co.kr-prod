import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { GalleryService } from "./gallery.service";
import { CreateGalleryDto } from "./dto/create-gallery.dto";
import { UpdateGalleryDto } from "./dto/update-gallery.dto";
import { AddPhotoDto, BulkAddPhotosDto } from "./dto/add-photo.dto";
import { QueryGalleryDto } from "./dto/query-gallery.dto";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";

/**
 * GalleryController
 *
 * 클럽/코치 갤러리(사진첩) CRUD + 사진 관리 엔드포인트.
 *
 * URL 베이스: /api/v1/galleries
 *
 * 권한 매트릭스:
 * - 목록/상세 조회: 인증된 모든 사용자
 * - 앨범 생성/수정/삭제: ADMIN, DIRECTOR, COACH
 * - 사진 추가/삭제: ADMIN, DIRECTOR, COACH
 */
@ApiTags("Gallery")
@Controller("api/v1/galleries")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// [2026-05-13 roles-check] 클래스 레벨 기본 — 인증된 모든 사용자 조회 허용.
//   생성/수정/삭제는 메서드 레벨 @Roles("ADMIN","DIRECTOR","COACH") 명시됨.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class GalleryController {
  constructor(private readonly service: GalleryService) {}

  // ==================== 앨범 CRUD ====================

  /**
   * 갤러리(앨범) 생성.
   */
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "갤러리 생성",
    description:
      "관리자/감독/코치가 새로운 갤러리(앨범)를 생성합니다. coachId는 요청자 ID로 자동 설정됩니다.",
  })
  @ApiBody({ type: CreateGalleryDto })
  @ApiResponse({ status: 201, description: "갤러리 생성 성공" })
  @ApiResponse({ status: 400, description: "입력값 검증 실패" })
  @ApiResponse({ status: 401, description: "인증이 필요합니다." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateGalleryDto) {
    return this.service.createGallery(dto, req.user.id);
  }

  /**
   * 갤러리 목록 조회.
   *
   * teamId, category, visibility 필터 지원. 인증된 사용자 전체 접근.
   */
  @Get()
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth()
  @ApiOperation({
    summary: "갤러리 목록 조회",
    description:
      "인증된 사용자가 갤러리 목록을 조회합니다. teamId, category, visibility 필터 및 페이징을 지원합니다.",
  })
  @ApiResponse({ status: 200, description: "갤러리 목록 조회 성공" })
  @ApiResponse({ status: 401, description: "인증이 필요합니다." })
  findAll(@Query() query: QueryGalleryDto) {
    return this.service.getGalleries({
      teamId: query.teamId,
      category: query.category,
      visibility: query.visibility,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  /**
   * 갤러리 상세 조회 (사진 포함).
   */
  @Get(":id")
  @UseGuards(AuthGuard("jwt"))
  @ApiBearerAuth()
  @ApiOperation({
    summary: "갤러리 상세 조회",
    description:
      "갤러리 상세 정보를 사진 목록과 함께 반환합니다. 사진은 sortOrder 오름차순 정렬.",
  })
  @ApiParam({ name: "id", description: "갤러리 ID (cuid)" })
  @ApiResponse({ status: 200, description: "갤러리 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "갤러리를 찾을 수 없습니다." })
  findOne(@Param("id") id: string) {
    return this.service.getGalleryById(id);
  }

  /**
   * 갤러리 수정.
   */
  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "갤러리 수정",
    description:
      "관리자/감독은 모든 갤러리를, 코치는 본인 갤러리만 수정할 수 있습니다.",
  })
  @ApiParam({ name: "id", description: "갤러리 ID" })
  @ApiBody({ type: UpdateGalleryDto })
  @ApiResponse({ status: 200, description: "갤러리 수정 성공" })
  @ApiResponse({ status: 403, description: "본인 갤러리가 아니거나 권한 없음" })
  @ApiResponse({ status: 404, description: "갤러리를 찾을 수 없습니다." })
  update(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateGalleryDto,
  ) {
    return this.service.updateGallery(id, dto, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 갤러리 삭제.
   *
   * Cascade로 연결된 사진도 함께 삭제.
   */
  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "갤러리 삭제",
    description:
      "관리자/감독은 모든 갤러리를, 코치는 본인 갤러리만 삭제할 수 있습니다. 연결된 사진도 함께 삭제됩니다.",
  })
  @ApiParam({ name: "id", description: "갤러리 ID" })
  @ApiResponse({ status: 200, description: "갤러리 삭제 성공" })
  @ApiResponse({ status: 403, description: "본인 갤러리가 아니거나 권한 없음" })
  @ApiResponse({ status: 404, description: "갤러리를 찾을 수 없습니다." })
  remove(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    return this.service.deleteGallery(id, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  // ==================== 사진 관리 ====================

  /**
   * 사진 추가 (단일, URL 기반).
   */
  @Post(":id/photos")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "사진 추가",
    description: "갤러리에 사진 1장을 추가합니다. photoUrl, thumbnailUrl 필수.",
  })
  @ApiParam({ name: "id", description: "갤러리 ID" })
  @ApiBody({ type: AddPhotoDto })
  @ApiResponse({ status: 201, description: "사진 추가 성공" })
  @ApiResponse({ status: 404, description: "갤러리를 찾을 수 없습니다." })
  addPhoto(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: AddPhotoDto,
  ) {
    return this.service.addPhotos(id, [dto], req.user.id);
  }

  /**
   * 다중 사진 일괄 추가.
   */
  @Post(":id/photos/bulk")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "사진 일괄 추가",
    description: "갤러리에 여러 장의 사진을 한 번에 추가합니다.",
  })
  @ApiParam({ name: "id", description: "갤러리 ID" })
  @ApiBody({ type: BulkAddPhotosDto })
  @ApiResponse({ status: 201, description: "사진 일괄 추가 성공" })
  @ApiResponse({ status: 404, description: "갤러리를 찾을 수 없습니다." })
  bulkAddPhotos(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: BulkAddPhotosDto,
  ) {
    return this.service.bulkAddPhotos(id, dto.photos, req.user.id);
  }

  /**
   * 사진 개별 삭제.
   */
  @Delete(":id/photos/:photoId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "사진 삭제",
    description:
      "갤러리에서 사진 1장을 삭제합니다. 관리자/감독은 모든 사진을, 코치는 본인 업로드 또는 본인 갤러리 사진만 삭제 가능.",
  })
  @ApiParam({ name: "id", description: "갤러리 ID" })
  @ApiParam({ name: "photoId", description: "사진 ID" })
  @ApiResponse({ status: 200, description: "사진 삭제 성공" })
  @ApiResponse({ status: 403, description: "삭제 권한이 없습니다." })
  @ApiResponse({ status: 404, description: "사진을 찾을 수 없습니다." })
  removePhoto(
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.removePhoto(id, photoId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }
}
