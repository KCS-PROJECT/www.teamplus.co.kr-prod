import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { SearchService } from "./search.service";

@ApiTags("Search")
@Controller("api/v1/search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * 전체 검색 (비로그인 접근 가능)
   * 프론트엔드 /search/results 페이지에서 사용
   * @Public() — 비로그인 사용자도 검색 가능해야 하므로 의도적으로 인증 바이패스
   */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @SkipThrottle()
  @ApiOperation({
    summary: "통합 검색",
    description:
      "클럽·수업·코치·공지 등을 한 번에 검색합니다. 인증 없이 접근 가능하며, 로그인한 학부모·학생은 대상 연령 수업만 노출됩니다.",
  })
  @ApiQuery({ name: "q", description: "검색어", required: true })
  @ApiQuery({
    name: "type",
    description: "검색 대상 (기본값: all)",
    required: false,
    enum: ["all", "clubs", "classes", "coaches", "notices"],
  })
  @ApiQuery({
    name: "limit",
    description: "카테고리별 결과 개수 (기본값: 20)",
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: "offset",
    description: "오프셋 (기본값: 0)",
    required: false,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: "검색 성공",
    schema: {
      example: {
        query: "서울",
        total: 12,
        results: {
          clubs: {
            total: 5,
            items: [
              {
                type: "club",
                id: "club-uuid",
                teamCode: "ACE-hockey",
                title: "서울 아이스 클럽",
                subtitle: "서울시 강남구",
                coachName: "이순신",
                memberCount: 25,
                createdAt: "2026-01-04T10:00:00Z",
              },
            ],
          },
          classes: {
            total: 4,
            items: [
              {
                type: "class",
                id: "class-uuid",
                title: "서울 주니어 스케이팅",
                subtitle: "서울 아이스 클럽",
                description: "초보자를 위한 아이스하키 입문 수업",
                capacity: 20,
                ageMin: 6,
                ageMax: 10,
              },
            ],
          },
          coaches: {
            total: 2,
            items: [
              {
                type: "coach",
                id: "user-uuid",
                title: "이순신",
                email: "coach_lee@teamplus.com",
                name: "서울 아이스 클럽",
              },
            ],
          },
          notices: {
            total: 1,
            items: [
              {
                type: "notice",
                id: "notice-uuid",
                title: "서울 지역 클럽 등록 안내",
                description: "서울 지역 클럽 신규 등록 안내입니다...",
                targetType: "all",
                createdAt: "2026-01-04T10:00:00Z",
              },
            ],
          },
        },
      },
    },
  })
  async search(
    @Request() req: AuthenticatedRequest,
    @Query("q") q: string,
    @Query("type") type?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.searchService.search(
      q ?? "",
      (type as any) ?? "all",
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
      req.user,
    );
  }

  /**
   * 인기 검색어 (Public)
   * - 회원수 상위 클럽 + 신규 활성 수업 + 정적 키워드 결합
   * - Web `/search` 페이지의 인기 검색어 섹션에서 사용
   */
  @Public()
  @Get("popular")
  @SkipThrottle()
  @ApiOperation({
    summary: "인기 검색어",
    description:
      "회원수 상위 클럽명, 최근 활성 수업명, 정적 키워드를 결합해 인기 검색어를 반환합니다.",
  })
  @ApiQuery({
    name: "limit",
    description: "반환 개수 (기본값: 10)",
    required: false,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: "조회 성공",
    schema: {
      example: {
        keywords: [
          { rank: 1, keyword: "서울 아이스 클럽", trend: "up" },
          { rank: 2, keyword: "초급 스케이팅", trend: "new" },
          { rank: 3, keyword: "스케이팅", trend: "stable" },
        ],
        updatedAt: "2026-04-30T09:00:00.000Z",
      },
    },
  })
  async popular(@Query("limit") limit?: string) {
    return this.searchService.getPopularKeywords(
      limit ? parseInt(limit, 10) : 10,
    );
  }
}
