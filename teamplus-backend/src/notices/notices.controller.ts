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
import { Public } from "@/auth/public.decorator";

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
   * [2026-06-19 사용자 직접 지시] 서비스 공지사항 '전체 읽음' 버튼용.
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
   * 공지사항 생성 (관리자 전용)
   */
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "공지사항 생성",
    description:
      "새로운 공지사항을 생성합니다. ADMIN/SYSTEM/OPER 는 전체 공지(targetTeamId=null) 또는 특정 팀 공지 작성 가능. DIRECTOR/ACADEMY_DIRECTOR/COACH 는 본인이 관리하는 팀 공지만 작성 가능 (targetTeamId 자동 주입 또는 검증).",
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
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
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
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
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
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
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
    description: "특정 팀 ID 필터 (ADMIN/SYSTEM/OPER 만 사용)",
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
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
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
  @Roles("ADMIN", "SYSTEM", "OPER", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
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
    );
  }

  /**
   * 댓글 삭제 (본인만 가능)
   */
  @Delete("comments/:commentId")
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "공지사항 댓글 삭제",
    description: "본인이 작성한 댓글을 삭제합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "댓글 삭제 성공",
  })
  @ApiResponse({
    status: 403,
    description: "본인 댓글만 삭제할 수 있습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "댓글을 찾을 수 없습니다.",
  })
  async deleteComment(
    @Param("commentId") commentId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.noticesService.deleteComment(commentId, req.user.id);
  }

  /**
   * 댓글 목록 조회
   */
  @Get(":noticeId/comments")
  @Public()
  @ApiOperation({
    summary: "공지사항 댓글 목록",
    description: "공지사항의 댓글 목록을 조회합니다.",
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
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.noticesService.getComments(
      noticeId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }
}
