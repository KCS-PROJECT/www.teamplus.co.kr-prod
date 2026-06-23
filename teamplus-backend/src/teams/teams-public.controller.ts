import { Controller, Get, Query } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { Public } from "@/auth/public.decorator";
import { TeamsService } from "./teams.service";

/**
 * 인증 없이 접근 가능한 공개 클럽 목록 API
 * 비로그인 사용자(팀 탐색 화면)를 위한 공개 엔드포인트
 */
@ApiTags("Teams (팀 관리)")
@Controller("api/v1/teams")
export class TeamsPublicController {
  constructor(private readonly teamsService: TeamsService) {}

  /**
   * 공개 클럽 목록 조회 (인증 불필요)
   * 프론트엔드 /teams 탐색 화면에서 사용
   */
  @Get("public")
  @Public()
  @SkipThrottle()
  @ApiOperation({
    summary: "공개 클럽 목록 조회 (비로그인 가능)",
    description:
      "인증 없이 공개된 클럽 목록을 조회합니다. 팀 탐색 화면에서 사용합니다.",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "클럽명 또는 지역으로 검색",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "조회 개수 (기본값: 20)",
    type: Number,
  })
  @ApiQuery({
    name: "offset",
    required: false,
    description: "오프셋 (기본값: 0)",
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: "공개 클럽 목록 조회 성공",
    schema: {
      example: {
        total: 50,
        clubs: [
          {
            id: "club-uuid",
            teamCode: "ACE-hockey",
            name: "서울 아이스 클럽",
            location: "서울시 강남구",
            phone: "02-1234-5678",
            coachName: "이순신",
            createdAt: "2026-01-04T10:00:00Z",
            memberCount: 25,
          },
        ],
      },
    },
  })
  async getPublicTeams(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.teamsService.getPublicTeams(
      search,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
