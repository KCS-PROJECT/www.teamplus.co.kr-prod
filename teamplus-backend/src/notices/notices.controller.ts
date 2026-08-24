import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
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
import { NoticesService } from "./notices.service";
import { CreateNoticeDto } from "./dto/create-notice.dto";
import { UpdateNoticeDto } from "./dto/update-notice.dto";
import { CreateNoticeCommentDto } from "./dto/create-notice-comment.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
// [Phase 0] @Public / OptionalJwtAuthGuard 는 마지막 사용처였던 댓글 목록이
//   JWT 필수로 전환되면서 제거됐다. 이 컨트롤러에 비인증 엔드포인트는 없다.

@ApiTags("Notices")
@Controller("api/v1/notices")
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  /**
   * 공지사항 목록 조회 (인증 필수)
   * - scope=team 처리에 userId 가 필요하므로 @Public 제거.
   *   이전: @Public 으로 JwtAuthGuard 우회 → req.user undefined → scopeTeamIds=[] → 항상 0건 회귀.
   */
  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "TEEN",
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "SYSTEM",
    "OPER",
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: "공지사항 목록 조회",
    description:
      "공지사항 목록을 조회합니다. JWT 인증 필수 (scope=team 처리에 userId 필요). scope=service 또는 미지정 시에도 isRead 정보가 함께 반환됩니다.",
  })
  @ApiQuery({ name: "type", required: false, description: "공지사항 유형" })
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiQuery({
    name: "childBirthYear",
    required: false,
    description: "자녀 출생연도 (학년별 공지 필터, 예: 2017)",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "클럽 ID (클럽별 공지 필터)",
  })
  @ApiQuery({
    name: "childId",
    required: false,
    description:
      "학부모 자녀 선택 스코프 — 지정 시 해당 자녀 소속 팀 공지만 (PARENT 전용)",
  })
  @ApiResponse({
    status: 200,
    description: "공지사항 목록 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "notice-uuid",
            title: "서비스 점검 안내",
            type: "maintenance",
            isPinned: true,
            createdAt: "2026-01-10T10:00:00Z",
          },
        ],
        pagination: {
          total: 20,
          page: 1,
          limit: 10,
          totalPages: 2,
        },
      },
    },
  })
  async getNotices(
    @Request() req: AuthenticatedRequest,
    @Query("type") type?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("childBirthYear") childBirthYear?: string,
    @Query("teamId") teamId?: string,
    @Query("scope") scope?: string,
    @Query("childId") childId?: string,
  ) {
    const userId: string | undefined = req?.user?.id;
    const userType: string | undefined = req?.user?.userType;
    // [2026-05-21] scope — 'service'(서비스 공지) / 'team'(팀 공지) 외 값은 무시.
    //   [2026-08-07 · R10-H1] scope 를 생략해도 서비스가 열람 팀을 해석해
    //   "서비스 공지 ∪ 내 팀 공지" 로 좁힌다. teamId 파라미터는 더 이상 팀 필터로 쓰이지 않는다
    //   (viewer 검증 없이 임의 팀 공지를 노출하던 레거시 경로 — 호출자 실측 0건).
    const normalizedScope: "service" | "team" | undefined =
      scope === "service" || scope === "team" ? scope : undefined;
    return this.noticesService.getNotices(
      {
        targetType: type,
        isActive: true,
        childBirthYear: childBirthYear
          ? parseInt(childBirthYear, 10)
          : undefined,
        teamId,
        scope: normalizedScope,
      },
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      userId,
      userType,
      childId,
    );
  }

  /**
   * 내 미확인 공지 개수 (JWT 필수)
   */
  @Get("mine/unread-count")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: "내 미확인 공지 개수",
    description: "로그인 사용자의 미확인 활성 공지 개수를 조회합니다.",
  })
  async getMyUnreadNoticeCount(@Request() req: AuthenticatedRequest) {
    return this.noticesService.getUnreadNoticeCount(req.user.id);
  }

  /**
   * 내 서비스 공지 전체 읽음 처리 (JWT 필수)
   * [2026-06-19 사용자 직접 지시] 공지사항 '전체 읽음' 버튼용.
   */
  @Post("mine/read-all")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "내 서비스 공지 전체 읽음",
    description: "로그인 사용자의 미확인 활성 서비스 공지를 모두 읽음 처리합니다.",
  })
  async markAllMyNoticesRead(@Request() req: AuthenticatedRequest) {
    return this.noticesService.markAllServiceNoticesRead(req.user.id);
  }

  /**
   * 공지 읽음 마킹 (JWT 필수)
   */
  @Post(":noticeId/read")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "ADMIN",
    "TEEN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "공지 읽음 마킹",
    description: "특정 공지를 읽음 상태로 기록합니다. (upsert)",
  })
  async markNoticeAsRead(
    @Request() req: AuthenticatedRequest,
    @Param("noticeId") noticeId: string,
  ) {
    return this.noticesService.markNoticeAsRead(noticeId, req.user.id);
  }

  /**
   * 공지사항 상세 조회 (인증 필수)
   * - 목록 조회와 동일하게 userId 기반 isRead 주입 + 팀 스코프 검증을 위해 @Public 제거.
   */
  @Get(":noticeId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "TEEN",
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "SYSTEM",
    "OPER",
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: "공지사항 상세 조회",
    description: "특정 공지사항의 상세 내용을 조회합니다. JWT 인증 필수.",
  })
  @ApiResponse({
    status: 200,
    description: "공지사항 조회 성공",
    schema: {
      example: {
        id: "notice-uuid",
        title: "서비스 점검 안내",
        content:
          "2026년 1월 15일 02:00 ~ 06:00 서비스 점검이 예정되어 있습니다.",
        type: "maintenance",
        isPinned: true,
        isPublished: true,
        viewCount: 150,
        createdAt: "2026-01-10T10:00:00Z",
        updatedAt: "2026-01-10T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "공지사항을 찾을 수 없습니다.",
  })
  async getNotice(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const userId: string | undefined = req?.user?.id;
    const userType: string | undefined = req?.user?.userType;
    return this.noticesService.getNotice(noticeId, userId, userType);
  }

  /**
   * 이전/다음 공지 (Phase 5 · F-14 — 클라이언트 limit=100 계산 대체)
   */
  @Get(":noticeId/adjacent")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "TEEN",
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "SYSTEM",
    "OPER",
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: "이전/다음 공지 조회",
    description:
      "현재 공지와 같은 종류(팀/서비스) 풀에서 인접 공지를 반환합니다. " +
      "mode=audience(기본)는 게시 중 공지만, mode=manage 는 관리 권한 확인 후 미게시·예약·만료를 포함합니다. " +
      "권한 없는 manage 요청과 부재 공지는 동일한 404 입니다. 정렬은 createdAt DESC, id DESC 결정론.",
  })
  @ApiQuery({
    name: "mode",
    required: false,
    description: "audience(기본) | manage",
  })
  @ApiResponse({
    status: 200,
    description: "인접 공지 조회 성공 — { next, previous } (없으면 null)",
  })
  @ApiResponse({ status: 404, description: "공지사항을 찾을 수 없습니다." })
  async getAdjacentNotices(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
    @Query("mode") mode?: string,
  ) {
    return this.noticesService.getAdjacentNotices(
      noticeId,
      req?.user?.id,
      req?.user?.userType,
      mode === "manage" ? "manage" : "audience",
    );
  }

  /**
   * 공지사항 생성 (관리자 전용)
   */
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  // [Phase 0 · 결정 4] ACADEMY_DIRECTOR 제외 — 가입 시 Team 을 만들지 않아 팀 공지 관리 권한이 없다.
  //   (오픈클래스 공지는 별도 도메인으로 설계 예정)
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "공지사항 생성",
    description:
      "서비스(전체) 공지를 생성합니다 — 시스템 역할(ADMIN/SYSTEM/OPER) 전용. [Phase 2 봉인] 팀 공지 작성은 커뮤니티 공지 API(/community/posts, teamId 축)로 이관되어 이 엔드포인트의 targetTeamId 지정·팀 스코프 역할(DIRECTOR/COACH) 작성은 400 으로 차단됩니다.",
  })
  @ApiResponse({
    status: 201,
    description: "공지사항 생성 성공",
    schema: {
      example: {
        id: "notice-uuid",
        title: "서비스 점검 안내",
        content:
          "2026년 1월 15일 02:00 ~ 06:00 서비스 점검이 예정되어 있습니다.",
        type: "maintenance",
        isPinned: true,
        isPublished: true,
        createdAt: "2026-01-10T10:00:00Z",
      },
    },
  })
  async createNotice(
    @Request() req: AuthenticatedRequest,
    @Body() createNoticeDto: CreateNoticeDto,
  ) {
    return this.noticesService.createNotice(req.user.id, createNoticeDto);
  }

  /**
   * 공지사항 수정 (관리자 전용)
   */
  @Patch(":noticeId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  // [Phase 0 · 결정 4] ACADEMY_DIRECTOR 제외 — 가입 시 Team 을 만들지 않아 팀 공지 관리 권한이 없다.
  //   (오픈클래스 공지는 별도 도메인으로 설계 예정)
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "공지사항 수정",
    description:
      "기존 공지사항을 수정합니다. DIRECTOR/COACH 는 본인이 관리하는 팀 공지만 수정 가능.",
  })
  @ApiResponse({
    status: 200,
    description: "공지사항 수정 성공",
  })
  @ApiResponse({
    status: 404,
    description: "공지사항을 찾을 수 없습니다.",
  })
  async updateNotice(
    @Request() req: AuthenticatedRequest,
    @Param("noticeId") noticeId: string,
    @Body() updateNoticeDto: UpdateNoticeDto,
  ) {
    return this.noticesService.updateNotice(
      req.user.id,
      noticeId,
      updateNoticeDto,
    );
  }

  /**
   * 공지사항 삭제 (관리자 전용)
   */
  @Delete(":noticeId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  // [Phase 0 · 결정 4] ACADEMY_DIRECTOR 제외 — 가입 시 Team 을 만들지 않아 팀 공지 관리 권한이 없다.
  //   (오픈클래스 공지는 별도 도메인으로 설계 예정)
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "공지사항 삭제",
    description:
      "공지사항을 삭제합니다. DIRECTOR/COACH 는 본인이 관리하는 팀 공지만 삭제 가능.",
  })
  @ApiResponse({
    status: 200,
    description: "공지사항 삭제 성공",
    schema: {
      example: {
        message: "공지사항이 삭제되었습니다.",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "공지사항을 찾을 수 없습니다.",
  })
  async deleteNotice(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.noticesService.deleteNotice(noticeId, req.user.id);
  }

  /**
   * 관리자용 공지사항 목록 (미공개 포함)
   */
  @Get("admin/list")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  // [Phase 0 · 결정 4] ACADEMY_DIRECTOR 제외 — 가입 시 Team 을 만들지 않아 팀 공지 관리 권한이 없다.
  //   (오픈클래스 공지는 별도 도메인으로 설계 예정)
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "관리자용 공지사항 목록",
    description:
      "미공개 공지사항을 포함한 전체 목록을 조회합니다. DIRECTOR/COACH 는 본인 관리 팀 공지만 노출됩니다.",
  })
  @ApiQuery({ name: "type", required: false, description: "공지사항 유형" })
  @ApiQuery({ name: "isPublished", required: false, description: "공개 여부" })
  @ApiQuery({
    name: "displayLocation",
    required: false,
    description: "표시 위치 필터 (app_home|web_home 등)",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description:
      "특정 팀 ID 필터 — 시스템 역할(ADMIN/SYSTEM/OPER)은 임의 팀, DIRECTOR/COACH 는 본인 관리 팀만 허용 (권한 밖 팀은 404)",
  })
  @ApiQuery({
    name: "scope",
    required: false,
    description: "service | team (미지정 시 전체)",
  })
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiResponse({
    status: 200,
    description: "공지사항 목록 조회 성공",
  })
  async getAdminNotices(
    @Request() req: AuthenticatedRequest,
    @Query("type") type?: string,
    @Query("isPublished") isPublished?: string,
    @Query("displayLocation") displayLocation?: string,
    @Query("teamId") teamId?: string,
    @Query("scope") scope?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.noticesService.getAdminNotices(req.user.id, {
      targetType: type,
      isActive: isPublished === undefined ? undefined : isPublished === "true",
      displayLocation,
      teamId,
      scope: scope === "service" || scope === "team" ? scope : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  /**
   * 공지사항 고정 토글 (관리자 전용)
   */
  @Patch(":noticeId/pin")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  // [Phase 0 · 결정 4] ACADEMY_DIRECTOR 제외 — 가입 시 Team 을 만들지 않아 팀 공지 관리 권한이 없다.
  //   (오픈클래스 공지는 별도 도메인으로 설계 예정)
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "공지사항 고정 토글",
    description:
      "공지사항의 상단 고정 상태를 토글합니다. DIRECTOR/COACH 는 본인 관리 팀 공지만 토글 가능.",
  })
  @ApiResponse({
    status: 200,
    description: "고정 상태 변경 성공",
  })
  async togglePin(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.noticesService.togglePin(noticeId, req.user.id);
  }

  /**
   * 공지사항 공개 토글 (관리자 전용)
   */
  @Patch(":noticeId/publish")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  // [Phase 0 · 결정 4] ACADEMY_DIRECTOR 제외 — 가입 시 Team 을 만들지 않아 팀 공지 관리 권한이 없다.
  //   (오픈클래스 공지는 별도 도메인으로 설계 예정)
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "공지사항 공개 토글",
    description:
      "공지사항의 공개 상태를 토글합니다. DIRECTOR/COACH 는 본인 관리 팀 공지만 토글 가능.",
  })
  @ApiResponse({
    status: 200,
    description: "공개 상태 변경 성공",
  })
  async togglePublish(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.noticesService.togglePublish(noticeId, req.user.id);
  }

  // ==================== 이벤트 RSVP ====================

  /**
   * 이벤트 참가 신청 (RSVP)
   */
  @Post(":noticeId/rsvp")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "COACH", "CHILD", "TEEN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "이벤트 참가 신청",
    description: "공지/이벤트에 대한 참가 신청을 합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "참가 신청 성공",
    schema: {
      example: {
        id: "registration-uuid",
        eventId: "event-uuid",
        memberId: "member-uuid",
        status: "pending",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "이벤트를 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 409,
    description: "이미 참가 신청한 이벤트입니다.",
  })
  async createRsvp(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.noticesService.createRsvp(noticeId, req.user.id);
  }

  /**
   * 이벤트 참가 취소
   */
  @Delete(":noticeId/rsvp")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "COACH", "CHILD", "TEEN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "이벤트 참가 취소",
    description: "공지/이벤트에 대한 참가 신청을 취소합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "참가 취소 성공",
    schema: {
      example: { message: "참가 신청이 취소되었습니다." },
    },
  })
  @ApiResponse({
    status: 404,
    description: "참가 신청 기록을 찾을 수 없습니다.",
  })
  async cancelRsvp(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.noticesService.cancelRsvp(noticeId, req.user.id);
  }

  // ==================== 댓글 ====================

  /**
   * 댓글 작성
   */
  @Post(":noticeId/comments")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "TEEN",
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "공지사항 댓글 작성",
    description: "공지사항에 댓글을 작성합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "댓글 작성 성공",
    schema: {
      example: {
        id: "comment-uuid",
        noticeId: "notice-uuid",
        userId: "user-uuid",
        content: "댓글 내용입니다.",
        createdAt: "2026-04-12T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "공지사항을 찾을 수 없습니다.",
  })
  async createComment(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateNoticeCommentDto,
  ) {
    return this.noticesService.createComment(
      noticeId,
      req.user.id,
      dto.content,
      req.user.userType,
    );
  }

  /**
   * 댓글 삭제 — 본인 또는 moderation(해당 공지 관리 팀 관리자·시스템 역할, 감사 로그 동반)
   */
  @Delete("comments/:commentId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  // [P4-R1-01] SYSTEM/OPER 포함 — 서비스 moderation 판정(isNoticeSystemRole)의
  // 시스템 역할 SoT(ADMIN/SYSTEM/OPER)와 선언 계약을 일치시킨다.
  // 현재 RolesGuard 는 이 3종을 super-admin 으로 일괄 통과시켜(런타임 403 은 원래 없었음)
  // 이 목록은 방어적 선언이다 — 우회가 제거되는 순간 조용한 403 회귀를 막고,
  // Swagger/코드 독자의 허용 집합 오독을 방지한다. (허용 집합은 spec 이 메타데이터로 고정)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "TEEN",
    "ADMIN",
    "SYSTEM",
    "OPER",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "공지사항 댓글 삭제",
    description:
      "본인 댓글 또는 (해당 공지를 관리하는 팀 관리자·시스템 역할의) 타인 댓글을 삭제합니다. " +
      "관리자 삭제는 감사 로그와 함께 기록됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "댓글 삭제 성공",
  })
  @ApiResponse({
    status: 404,
    description:
      "댓글을 찾을 수 없습니다. (부재·권한 밖 모두 동일 — 존재 은닉)",
  })
  async deleteComment(
    @Param("commentId") commentId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.noticesService.deleteComment(
      commentId,
      req.user.id,
      req.user.userType,
    );
  }

  /**
   * 댓글 목록 조회
   */
  @Get(":noticeId/comments")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    "PARENT",
    "COACH",
    "CHILD",
    "TEEN",
    "ADMIN",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "SYSTEM",
    "OPER",
  )
  @ApiBearerAuth()
  @ApiOperation({
    summary: "공지사항 댓글 목록",
    description:
      "공지사항의 댓글 목록을 조회합니다. JWT 인증 필수이며, 해당 공지를 열람할 수 있는 사용자만 조회할 수 있습니다. (2026-08-06 Phase 0 — 비로그인 공개 및 팀 격리 부재 해소)",
  })
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiResponse({
    status: 200,
    description: "댓글 목록 조회 성공",
    schema: {
      example: {
        data: [
          {
            id: "comment-uuid",
            content: "댓글 내용입니다.",
            userId: "user-uuid",
            // [P4-R1-03] 인증 필수 전환 후 실계약 = 전체 이름 (마스킹 제거 — AC 4-4)
            userName: "홍길동",
            createdAt: "2026-04-12T10:00:00Z",
          },
        ],
        pagination: { total: 5, page: 1, limit: 10, totalPages: 1 },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "공지사항을 찾을 수 없습니다.",
  })
  async getComments(
    @Param("noticeId") noticeId: string,
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.noticesService.getComments(
      noticeId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      req.user?.id,
      req.user?.userType,
    );
  }
}
