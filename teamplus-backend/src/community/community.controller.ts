import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
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
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CommunityService } from "./community.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import {
  CreateTeamPostDto as CreateClubPostDto,
  UpdateTeamPostDto as UpdateClubPostDto,
} from "./dto/create-team-post.dto";
import {
  CreateTeamPostCommentDto as CreateClubPostCommentDto,
  UpdateTeamPostCommentDto as UpdateClubPostCommentDto,
} from "./dto/create-team-post-comment.dto";
import {
  CreateTeamEventDto as CreateClubEventDto,
  UpdateTeamEventDto as UpdateClubEventDto,
} from "./dto/create-team-event.dto";
import { RegisterTeamEventDto as RegisterClubEventDto } from "./dto/register-team-event.dto";
import { AddAttachmentDto } from "./dto/add-attachment.dto";

@ApiTags("Community")
@Controller("api/v1/teams/:teamId/community")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ===== Posts =====

  @Get("posts")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "팀 게시글 목록",
    description: "팀의 공지/피드 게시글을 조회합니다.",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "가져올 개수 (기본 20)",
  })
  @ApiQuery({
    name: "postType",
    required: false,
    description:
      "게시글 유형 필터 (announcement|lesson|tournament|friendly|survey)",
  })
  async getTeamPosts(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Query("limit") limit?: string,
    @Query("postType") postType?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.communityService.getTeamPosts(
      teamId,
      { id: req.user.id, userType: req.user.userType },
      parsedLimit,
      postType,
    );
  }

  @Get("posts/:postId")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "게시글 상세",
    description: "단일 게시글 및 댓글을 조회합니다.",
  })
  async getTeamPostDetail(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
  ) {
    return this.communityService.getTeamPostDetail(postId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  @Post("posts")
  @Roles("COACH", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "게시글 작성",
    description: "감독/관리자가 팀 게시글을 작성합니다.",
  })
  async createTeamPost(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() dto: CreateClubPostDto,
  ) {
    return this.communityService.createTeamPost(
      { id: req.user.id, userType: req.user.userType },
      teamId,
      dto,
    );
  }

  @Patch("posts/:postId")
  @Roles("COACH", "ADMIN")
  @ApiOperation({ summary: "게시글 수정", description: "게시글을 수정합니다." })
  async updateTeamPost(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
    @Body() dto: UpdateClubPostDto,
  ) {
    return this.communityService.updateTeamPost(req.user.id, postId, dto);
  }

  @Delete("posts/:postId")
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "게시글 삭제",
    description: "게시글을 삭제합니다 (소프트 삭제).",
  })
  async deleteTeamPost(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
  ) {
    const isAdmin = req.user.userType === "ADMIN";
    return this.communityService.deleteTeamPost(req.user.id, postId, isAdmin);
  }

  // ===== Likes =====

  @Post("posts/:postId/like")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "좋아요 토글",
    description: "게시글에 좋아요를 추가하거나 취소합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "좋아요 상태 반환",
    schema: { example: { liked: true, likeCount: 5 } },
  })
  async toggleLike(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
  ) {
    return this.communityService.toggleLike(req.user.id, postId);
  }

  @Get("posts/:postId/likes")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "좋아요 목록",
    description: "게시글에 좋아요한 사용자 목록을 조회합니다.",
  })
  async getPostLikes(@Param("postId") postId: string) {
    return this.communityService.getPostLikes(postId);
  }

  // ===== Attachments =====

  @Post("posts/:postId/attachments")
  @Roles("COACH", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "첨부파일 추가",
    description: "게시글에 첨부파일을 추가합니다.",
  })
  async addAttachment(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
    @Body() dto: AddAttachmentDto,
  ) {
    return this.communityService.addAttachment(req.user.id, postId, dto);
  }

  @Delete("attachments/:attachmentId")
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "첨부파일 삭제",
    description: "첨부파일을 삭제합니다.",
  })
  async deleteAttachment(
    @Request() req: AuthenticatedRequest,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.communityService.deleteAttachment(req.user.id, attachmentId);
  }

  // ===== Comments =====

  @Post("posts/:postId/comments")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "게시글 댓글 작성",
    description: "게시글에 댓글을 추가합니다.",
  })
  async addComment(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
    @Body() dto: CreateClubPostCommentDto,
  ) {
    return this.communityService.addCommentToPost(req.user.id, postId, dto);
  }

  @Patch("comments/:commentId")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "댓글 수정", description: "댓글을 수정합니다." })
  async updateComment(
    @Request() req: AuthenticatedRequest,
    @Param("commentId") commentId: string,
    @Body() dto: UpdateClubPostCommentDto,
  ) {
    return this.communityService.updateComment(req.user.id, commentId, dto);
  }

  @Delete("comments/:commentId")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({ summary: "댓글 삭제", description: "댓글을 삭제합니다." })
  async deleteComment(
    @Request() req: AuthenticatedRequest,
    @Param("commentId") commentId: string,
  ) {
    const isAdmin = req.user.userType === "ADMIN";
    return this.communityService.deleteComment(req.user.id, commentId, isAdmin);
  }

  // ===== Events =====

  @Get("events")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "클럽 이벤트 목록",
    description: "클럽의 체험/클리닉/대회 등 이벤트 목록을 조회합니다.",
  })
  async getTeamEvents(@Param("teamId") teamId: string) {
    return this.communityService.getTeamEvents(teamId);
  }

  @Get("events/:eventId")
  @Roles("PARENT", "COACH", "CHILD", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "팀 이벤트 상세",
    description: "이벤트 정보 및 참가 신청 현황을 조회합니다.",
  })
  async getTeamEventDetail(@Param("eventId") eventId: string) {
    return this.communityService.getTeamEventDetail(eventId);
  }

  @Post("events")
  @Roles("COACH", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "팀 이벤트 생성",
    description: "감독/관리자가 체험/클리닉/대회 이벤트를 생성합니다.",
  })
  async createTeamEvent(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Body() dto: CreateClubEventDto,
  ) {
    return this.communityService.createTeamEvent(req.user.id, teamId, dto);
  }

  @Patch("events/:eventId")
  @Roles("COACH", "ADMIN")
  @ApiOperation({ summary: "이벤트 수정", description: "이벤트를 수정합니다." })
  async updateTeamEvent(
    @Param("eventId") eventId: string,
    @Body() dto: UpdateClubEventDto,
  ) {
    return this.communityService.updateTeamEvent(eventId, dto);
  }

  @Delete("events/:eventId")
  @Roles("COACH", "ADMIN")
  @ApiOperation({ summary: "이벤트 삭제", description: "이벤트를 취소합니다." })
  async deleteTeamEvent(@Param("eventId") eventId: string) {
    return this.communityService.deleteTeamEvent(eventId);
  }

  @Post("events/:eventId/register")
  @Roles("PARENT", "CHILD")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "이벤트 참가 신청",
    description: "회원이 이벤트 참가를 신청합니다.",
  })
  @ApiResponse({ status: 201, description: "신청 성공" })
  async registerForEvent(
    @Request() req: AuthenticatedRequest,
    @Param("teamId") teamId: string,
    @Param("eventId") eventId: string,
    @Body() dto: RegisterClubEventDto,
  ) {
    return this.communityService.registerForEvent(
      { id: req.user.id, userType: req.user.userType },
      teamId,
      eventId,
      dto,
    );
  }

  @Post("events/:eventId/cancel")
  @Roles("PARENT", "COACH", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "이벤트 참가 취소",
    description: "이벤트 참가 신청을 취소합니다.",
  })
  async cancelEventRegistration(
    @Request() req: AuthenticatedRequest,
    @Param("eventId") eventId: string,
    @Body("memberId") memberId: string,
  ) {
    return this.communityService.cancelEventRegistration(
      { id: req.user.id, userType: req.user.userType },
      eventId,
      memberId,
    );
  }

  // ===== Statistics =====

  @Get("stats")
  @Roles("COACH", "ADMIN")
  @ApiOperation({
    summary: "커뮤니티 통계",
    description: "클럽 커뮤니티 통계를 조회합니다.",
  })
  async getCommunityStats(@Param("teamId") teamId: string) {
    return this.communityService.getCommunityStats(teamId);
  }
}
