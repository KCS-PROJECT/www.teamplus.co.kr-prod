import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { Public } from "@/auth/public.decorator";
import { AcademyService } from "./academy.service";

@ApiTags("Academy Management")
@Controller("api/v1/academies")
export class AcademyPublicController {
  constructor(private readonly academyService: AcademyService) {}

  /**
   * 공개 아카데미 목록 조회 (인증 불필요)
   */
  @Get("public")
  @Public()
  @ApiOperation({
    summary: "공개 아카데미 목록 조회",
    description:
      "활성화된 아카데미 목록을 공개 조회합니다. 검색 및 지역 필터를 지원합니다.",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "검색어 (이름/소개글)",
  })
  @ApiQuery({ name: "region", required: false, description: "지역 필터" })
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiResponse({ status: 200, description: "아카데미 목록 조회 성공" })
  async getPublicAcademies(
    @Query("search") search?: string,
    @Query("region") region?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.academyService.getPublicAcademies(
      search,
      region,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  /**
   * 공개 아카데미 상세 조회 (인증 불필요)
   */
  @Get("public/:academyId")
  @Public()
  @ApiOperation({
    summary: "공개 아카데미 상세 조회",
    description: "특정 아카데미의 공개 정보를 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "아카데미 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "아카데미를 찾을 수 없습니다." })
  async getPublicAcademyDetail(@Param("academyId") academyId: string) {
    return this.academyService.getPublicAcademyDetail(academyId);
  }
}
