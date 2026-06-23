import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { TeamsService } from "./teams.service";
import { TransferService } from "./transfer.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { JoinTeamDto } from "./dto/join-team.dto";
import { ApproveMemberDto } from "./dto/approve-member.dto";
import { BulkApproveMembersDto } from "./dto/bulk-approve.dto";
import { UpdateBillingTimingDto } from "./dto/update-billing-timing.dto";
// Phase 2.5 (2026-04-29) — 옛 TeamsService 흡수: 로스터 관리 DTO
import { AddRosterMemberDto, UpdateRosterMemberDto } from "./dto/roster.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

/**
 * Phase 4 (2026-04-29) — ClubsController → TeamsController rename 완료.
 * API 경로 /api/v1/teams 단일 노출. /api/v1/clubs, /api/v1/team alias 제거.
 */
@ApiTags("Teams (팀 관리)")
@Controller("api/v1/teams")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 기본 권한 — 인증된 모든 사용자 조회/가입 허용.
//   admin-only mutation 은 메서드 레벨 @Roles 로 좁힘 (이미 일부 적용 — COACH/DIRECTOR/ADMIN).
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class TeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly transferService: TransferService,
  ) {}

  /**
   * 새로운 클럽 생성 (감독만)
   */
  @Post()
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "클럽 생성",
    description: "감독만 새로운 클럽을 생성할 수 있습니다.",
  })
  @ApiResponse({
    status: 201,
    description: "클럽이 성공적으로 생성되었습니다.",
    schema: {
      example: {
        id: "club-uuid",
        teamCode: "ACE-hockey",
        name: "서울 아이스 클럽",
        coachName: "이순신 감독",
        phoneNumber: "010-1234-5678",
        location: "서울시 강남구",
        description: "청소년 아이스하키 클럽",
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "감독 프로필이 필요합니다.",
  })
  async createTeam(
    @Request() req: AuthenticatedRequest,
    @Body() createTeamDto: CreateTeamDto,
  ) {
    return this.teamsService.createTeam(req.user.id, createTeamDto);
  }

  /**
   * 모든 팀 조회 (admin + 오픈클래스 감독)
   * GET /api/v1/teams — admin 패널의 팀 목록·드롭다운 전용
   * [2026-05-15] ACADEMY_DIRECTOR 추가 — 오픈클래스 수업의 노출 팀 선택용.
   *   getPublicTeams 는 팀명·코드 등 비민감 정보만 반환하므로 안전.
   */
  @Get()
  @Roles("SYSTEM", "OPER", "ADMIN", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "모든 팀 조회 (admin · 오픈클래스 감독)",
    description:
      "admin 또는 오픈클래스 감독 권한으로 모든 팀 목록을 조회합니다. 검색·페이지네이션 지원.",
  })
  @ApiResponse({
    status: 200,
    description: "팀 목록 조회 성공 (배열 직접 반환)",
  })
  async findAll(
    @Query("search") search?: string,
    @Query("limit", new DefaultValuePipe(100), ParseIntPipe) limit?: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const result = await this.teamsService.getPublicTeams(
      search,
      limit,
      offset,
    );
    // admin client 가 배열 직접 기대 (api.get<Club[]>)
    return result.clubs;
  }

  /**
   * 클럽 초대 코드로 클럽 정보 조회
   */
  @Get("by-code/:teamCode")
  @ApiOperation({
    summary: "클럽 코드로 조회",
    description: "클럽 초대 코드를 사용하여 클럽 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "클럽 정보 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "클럽을 찾을 수 없습니다.",
  })
  async getTeamByCode(@Param("teamCode") teamCode: string) {
    return this.teamsService.getTeamByCode(teamCode);
  }

  /**
   * 클럽에 가입 신청
   */
  @Post("join")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "클럽 가입 신청",
    description: "초대 코드를 사용하여 클럽에 가입을 신청합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "가입 신청이 완료되었습니다.",
    schema: {
      example: {
        id: "member-uuid",
        teamId: "club-uuid",
        name: "서울 아이스 클럽",
        playerName: "김철수",
        status: "pending",
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "올바른 선수 나이를 입력해주세요.",
  })
  @ApiResponse({
    status: 404,
    description: "클럽을 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 409,
    description: "이미 가입되었거나 신청이 대기 중입니다.",
  })
  async joinTeam(
    @Request() req: AuthenticatedRequest,
    @Body() joinTeamDto: JoinTeamDto,
  ) {
    return this.teamsService.joinTeam(req.user.id, joinTeamDto);
  }

  /**
   * 팀 상세 정보 조회
   *
   * [수정 2026-05-21] 응답에 호출자 본인의 `myApprovalStatus` 합성 — 프론트
   *  `isTeamManagerOf(user, team)` 가 pending 코치의 수정 UI 를 차단할 수 있도록.
   */
  @Get(":teamId")
  @ApiOperation({
    summary: "팀 상세 정보 조회",
    description:
      "팀의 상세 정보와 승인된 회원 목록을 조회합니다. 응답에 호출자 본인의 myApprovalStatus(approved/pending/null) 가 포함됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "팀 정보 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "팀을 찾을 수 없습니다.",
  })
  async getTeam(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.teamsService.getTeam(
      teamId,
      req.user?.id,
      req.user?.userType,
    );
  }

  /**
   * 사용자의 모든 팀 조회
   */
  @Get("my/list")
  @ApiOperation({
    summary: "내 팀 목록 조회",
    description: "현재 사용자가 속한 모든 팀을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "팀 목록 조회 성공",
    schema: {
      example: [
        {
          id: "club-uuid",
          teamCode: "ACE-hockey",
          name: "서울 아이스 클럽",
          coachName: "이순신 감독",
          location: "서울시 강남구",
          role: "coach",
          joinedAt: "2026-01-04T10:00:00Z",
        },
      ],
    },
  })
  async getUserTeams(@Request() req: AuthenticatedRequest) {
    return this.teamsService.getUserTeams(req.user.id);
  }

  /**
   * 팀 정보 수정 (감독만)
   */
  @Put(":teamId")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "팀 정보 수정",
    description: "감독만 팀 정보를 수정할 수 있습니다.",
  })
  @ApiResponse({
    status: 200,
    description: "팀 정보가 수정되었습니다.",
  })
  @ApiResponse({
    status: 403,
    description: "감독만 수정할 수 있습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "팀을 찾을 수 없습니다.",
  })
  async updateTeam(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() updateData: Partial<CreateTeamDto>,
  ) {
    return this.teamsService.updateTeam(req.user.id, teamId, updateData);
  }

  /**
   * 팀 초대 코드 재생성 (감독만)
   */
  @Post(":teamId/regenerate-code")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "팀 초대 코드 재생성",
    description: "감독만 팀의 초대 코드를 재생성할 수 있습니다.",
  })
  @ApiResponse({
    status: 200,
    description: "초대 코드가 재생성되었습니다.",
    schema: {
      example: {
        id: "team-uuid",
        teamCode: "ELITE-glacier",
        regeneratedAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "감독만 재생성할 수 있습니다.",
  })
  async regenerateTeamCode(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.teamsService.regenerateTeamCode(req.user.id, teamId);
  }

  /**
   * 회원 승인/거절 (감독만)
   */
  @Put(":teamId/members/:memberId/approve")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 승인/거절",
    description: "감독이 가입 신청한 회원을 승인하거나 거절합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "회원 처리가 완료되었습니다.",
    schema: {
      example: {
        id: "member-uuid",
        playerName: "김철수",
        status: "approved",
        approvedAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "감독만 승인할 수 있습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "팀 또는 회원을 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 409,
    description: "이미 승인된 회원입니다.",
  })
  async approveMember(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("memberId") memberId: string,
    @Body() approveMemberDto: ApproveMemberDto,
  ) {
    return this.teamsService.approveMember(
      req.user.id,
      teamId,
      memberId,
      approveMemberDto,
    );
  }

  /**
   * 대기 중인 회원 목록 조회 (감독용)
   */
  @Get(":teamId/pending-members")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "대기 중인 회원 목록",
    description: "감독이 승인 대기 중인 회원 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "대기 중인 회원 목록 조회 성공",
    schema: {
      example: [
        {
          id: "member-uuid",
          playerName: "김철수",
          playerAge: 7,
          createdAt: "2026-01-04T10:00:00Z",
          user: {
            email: "kim@example.com",
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 403,
    description: "감독만 조회할 수 있습니다.",
  })
  async getPendingMembers(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.teamsService.getPendingMembers(req.user.id, teamId);
  }

  /**
   * 여러 회원 일괄 승인 (감독용)
   */
  @Post(":teamId/members/bulk-approve")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 일괄 승인",
    description: "감독이 여러 회원을 한 번에 승인합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "회원 일괄 승인 성공",
    schema: {
      example: {
        approvedCount: 5,
        approvedMembers: [
          {
            id: "member-uuid-1",
            playerName: "김철수",
            status: "approved",
          },
          {
            id: "member-uuid-2",
            playerName: "이영희",
            status: "approved",
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "감독만 일괄 승인할 수 있습니다.",
  })
  async bulkApproveMembers(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() bulkApproveDto: BulkApproveMembersDto,
  ) {
    return this.teamsService.bulkApproveMembers(
      req.user.id,
      teamId,
      bulkApproveDto,
    );
  }

  /**
   * 감독이 관리하는 팀 목록 조회
   */
  @Get("managed/list")
  @Roles("ADMIN", "DIRECTOR", "COACH", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "관리 팀 목록 조회",
    description: "감독이 관리하는 모든 팀 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "관리 팀 목록 조회 성공",
    schema: {
      example: [
        {
          id: "team-uuid",
          teamCode: "ACE-hockey",
          name: "서울 아이스 팀",
          coachName: "이순신 감독",
          location: "서울시 강남구",
          memberCount: 25,
          pendingCount: 3,
          createdAt: "2026-01-04T10:00:00Z",
        },
      ],
    },
  })
  async getManagedTeams(@Request() req: AuthenticatedRequest) {
    return this.teamsService.getManagedTeams(req.user.id);
  }

  /**
   * 팀 전체 회원 목록 조회 (상태 필터 지원)
   */
  @Get(":teamId/members")
  @ApiOperation({
    summary: "팀 회원 목록 조회",
    description: "팀의 전체 회원 목록을 조회합니다. 상태 필터를 지원합니다.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["all", "pending", "approved", "rejected"],
    description: "회원 상태 필터 (기본값: all)",
  })
  @ApiResponse({
    status: 200,
    description: "회원 목록 조회 성공",
    schema: {
      example: {
        total: 25,
        members: [
          {
            id: "member-uuid",
            playerName: "김철수",
            playerAge: 7,
            approvalStatus: "approved",
            joinedAt: "2026-01-04T10:00:00Z",
            user: {
              id: "user-uuid",
              email: "kim@example.com",
              phone: "010-1234-5678",
            },
            // [2026-05-15 신규 T01/T06] 명단 관리 그룹 배치 차단 UI 활용
            paymentStatus: "paid",
            hasUnpaidBalance: false,
          },
        ],
      },
    },
  })
  async getTeamMembers(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Query("status") status?: string,
  ) {
    return this.teamsService.getTeamMembers(teamId, status, req.user.id);
  }

  /**
   * 팀 탈퇴 (본인)
   */
  @Delete(":teamId/members/me")
  @Roles("PARENT", "COACH", "TEEN", "CHILD")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "팀 탈퇴",
    description:
      "현재 사용자가 팀에서 탈퇴합니다. 감독(DIRECTOR)은 탈퇴할 수 없습니다.",
  })
  @ApiResponse({
    status: 200,
    description: "팀 탈퇴 성공",
    schema: {
      example: {
        success: true,
        message: "팀에서 탈퇴했습니다.",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "감독은 팀을 탈퇴할 수 없습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "회원 정보를 찾을 수 없습니다.",
  })
  async leaveTeam(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.teamsService.leaveTeam(req.user.id, teamId);
  }

  /**
   * 회원 삭제 (감독만)
   */
  @Delete(":teamId/members/:memberId")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "회원 삭제",
    description: "감독이 팀 회원을 삭제합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "회원 삭제 성공",
    schema: {
      example: {
        message: "회원이 삭제되었습니다.",
        deletedMemberId: "member-uuid",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "감독만 회원을 삭제할 수 있습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "회원을 찾을 수 없습니다.",
  })
  async deleteMember(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("memberId") memberId: string,
  ) {
    return this.teamsService.deleteMember(req.user.id, teamId, memberId);
  }

  /**
   * 팀 출석 통계 조회
   */
  @Get(":teamId/attendance-statistics")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "팀 출석 통계",
    description: "팀의 전체 출석 통계를 조회합니다.",
  })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "시작일 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "종료일 (YYYY-MM-DD)",
  })
  @ApiResponse({
    status: 200,
    description: "출석 통계 조회 성공",
  })
  async getTeamAttendanceStatistics(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.teamsService.getTeamAttendanceStatistics(
      req.user.id,
      teamId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * 팀 전체 크레딧 조회
   */
  @Get(":teamId/credits")
  @Roles("COACH", "DIRECTOR")
  @ApiOperation({
    summary: "팀 전체 크레딧 조회",
    description: "팀 회원들의 전체 크레딧 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "크레딧 조회 성공",
  })
  async getTeamCredits(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.teamsService.getTeamCredits(req.user.id, teamId);
  }

  /**
   * 특정 팀에서 내 회원 정보 조회
   */
  @Get(":teamId/my-membership")
  @ApiOperation({
    summary: "내 팀 회원 정보 조회",
    description: "현재 사용자의 특정 팀 내 회원 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "회원 정보 조회 성공",
    schema: {
      example: {
        id: "member-uuid",
        userId: "user-uuid",
        teamId: "team-uuid",
        playerName: "김철수",
        playerAge: 7,
        approvalStatus: "APPROVED",
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "회원 정보를 찾을 수 없습니다.",
  })
  async getMyMembership(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
  ) {
    return this.teamsService.getMyMembership(req.user.id, teamId);
  }

  /**
   * 팀 결제 시점 설정 (DIRECTOR만)
   */
  @Put(":teamId/billing-timing")
  @Roles("DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "팀 결제 시점 설정",
    description:
      "감독(DIRECTOR)이 팀의 기본 결제 시점을 선결제(PREPAID) 또는 후결제(POSTPAID)로 설정합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "결제 시점 설정 성공",
    schema: {
      example: {
        id: "team-uuid",
        name: "서울 아이스 팀",
        defaultBillingTiming: "POSTPAID",
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "이 팀의 감독만 변경할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "팀을 찾을 수 없습니다." })
  async updateBillingTiming(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() dto: UpdateBillingTimingDto,
  ) {
    return this.teamsService.updateBillingTiming(
      req.user.id,
      teamId,
      dto.billingTiming,
    );
  }

  /**
   * 회원 이적 처리 (C-9)
   * POST /api/v1/teams/:newTeamId/transfer-from/:oldTeamId
   */
  @Post(":newTeamId/transfer-from/:oldTeamId")
  @Roles("DIRECTOR", "ADMIN", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "회원 이적 처리 (이전 팀 → 신규 팀)" })
  @ApiResponse({ status: 200, description: "이적 완료" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 404, description: "팀 또는 회원 미존재" })
  @ApiResponse({ status: 409, description: "신규 팀 중복 가입" })
  async transferMember(
    @Request() req: AuthenticatedRequest,
    @Param("newTeamId") newTeamId: string,
    @Param("oldTeamId") oldTeamId: string,
    @Body() body: { userId: string; reason?: string },
  ) {
    return this.transferService.transferMember(
      req.user.id,
      req.user.userType,
      newTeamId,
      oldTeamId,
      body,
    );
  }

  // ========================================================================
  // Phase 4 (2026-04-29) — 팀 로스터·경기·학부모 라우트 7개
  // /api/v1/teams/:teamId/* 단일 경로 노출
  // ========================================================================

  @Get(":teamId/roster")
  @ApiOperation({ summary: "팀 선수 명단 조회" })
  @ApiResponse({ status: 200, description: "선수 명단 조회 성공" })
  async getTeamRoster(@Param("teamId") teamId: string) {
    return this.teamsService.getTeamRoster(teamId);
  }

  @Get(":teamId/available-members")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH", "SYSTEM", "OPER")
  @ApiOperation({ summary: "로스터 추가 후보 회원 목록" })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  async getAvailableTeamMembers(
    @Param("teamId") teamId: string,
    @Query("search") search?: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number = 0,
  ) {
    return this.teamsService.getAvailableTeamMembers(teamId, {
      search,
      limit,
      offset,
    });
  }

  @Post(":teamId/roster")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH", "SYSTEM", "OPER")
  @ApiOperation({ summary: "로스터에 회원 추가" })
  async addTeamRosterMember(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() dto: AddRosterMemberDto,
  ) {
    return this.teamsService.addTeamRosterMember(req.user.id, teamId, dto);
  }

  @Patch(":teamId/roster/:rosterId")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH", "SYSTEM", "OPER")
  @ApiOperation({ summary: "로스터 정보 수정" })
  async updateTeamRosterMember(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("rosterId") rosterId: string,
    @Body() dto: UpdateRosterMemberDto,
  ) {
    return this.teamsService.updateTeamRosterMember(
      req.user.id,
      teamId,
      rosterId,
      dto,
    );
  }

  @Delete(":teamId/roster/:rosterId")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH", "SYSTEM", "OPER")
  @ApiOperation({ summary: "로스터에서 회원 제거 (soft delete)" })
  async removeTeamRosterMember(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("rosterId") rosterId: string,
  ) {
    return this.teamsService.removeTeamRosterMember(
      req.user.id,
      teamId,
      rosterId,
    );
  }

  @Get(":teamId/matches")
  @ApiOperation({ summary: "팀 경기 일정" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getTeamMatches(
    @Param("teamId") teamId: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
  ) {
    return this.teamsService.getTeamMatches(teamId, limit);
  }

  @Get("my/parent")
  @Roles("PARENT")
  @ApiOperation({ summary: "학부모 자녀 소속 팀 목록" })
  async getParentTeams(@Request() req: AuthenticatedRequest) {
    return this.teamsService.getParentVisibleTeams(req.user.id);
  }

  @Get("my/managed")
  @Roles(
    "ADMIN",
    "SYSTEM",
    "OPER",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "COACH",
    "TEEN",
    "CHILD",
    "PARENT",
  )
  @ApiOperation({
    summary: "내가 관리/소속 가능한 팀 목록 (옛 /api/v1/team/my/managed alias)",
    description:
      "본인이 관리 가능한 팀 목록. includePending=true 면 본인 멤버십이 'pending' 인 팀도 함께 반환 (코치 가입 직후 감독 승인 대기 안내용).",
  })
  @ApiQuery({
    name: "includePending",
    required: false,
    description:
      "본인 멤버십이 'pending' 상태인 팀도 포함할지 여부 (기본 false). 응답 항목의 myApprovalStatus 로 구분.",
    type: Boolean,
  })
  async getMyManagedTeams(
    @Request() req: AuthenticatedRequest,
    @Query("includePending") includePending?: string,
  ) {
    return this.teamsService.getManageableTeams(req.user.id, {
      includePending: includePending === "true",
    });
  }
}
