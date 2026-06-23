import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import { GalleryService } from "@/gallery/gallery.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Gallery")
@ApiBearerAuth()
@Controller("api/v1/gallery")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// [2026-05-13 roles-check] 인증된 모든 사용자 조회 허용.
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
  constructor(private readonly galleryService: GalleryService) {}

  /**
   * 앨범 사진 목록 조회.
   *
   * - 페이징: page (1-based), pageSize (기본 20)
   * - 정렬: 최신 생성순 (createdAt DESC)
   */
  @Get("albums/:id/photos")
  @ApiOperation({ summary: "앨범 사진 목록 조회" })
  @ApiParam({ name: "id", description: "앨범(Gallery) ID" })
  @ApiQuery({
    name: "page",
    required: false,
    description: "페이지 번호 (1 이상, 기본 1)",
    example: 1,
  })
  @ApiQuery({
    name: "pageSize",
    required: false,
    description: "페이지 크기 (기본 20)",
    example: 20,
  })
  @ApiResponse({ status: 200, description: "사진 목록 조회 성공" })
  @ApiResponse({ status: 401, description: "인증이 필요합니다." })
  @ApiResponse({ status: 404, description: "갤러리를 찾을 수 없습니다." })
  getAlbumPhotos(
    @Param("id") id: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("pageSize", new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.galleryService.getAlbumPhotos(id, page, pageSize);
  }
}
