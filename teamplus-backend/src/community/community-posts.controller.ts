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
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { CommunityPostsService } from "./community-posts.service";
import {
  CreateUnitCommentDto,
  CreateUnitPostDto,
  UnitNoticeAttachmentDto,
  UpdateUnitCommentDto,
  UpdateUnitPostDto,
} from "./dto/unit-notice.dto";

/**
 * 열람 역할 — CHILD/TEEN 제외 (사용자 확정: 이 기능에서 CHILD/TEEN 직접 로그인은
 * 사용하지 않는다. 자녀 등록 데이터는 보호자 수신자·자녀 이름 산출에만 쓴다 — Codex R1 H-00)
 */
const VIEWER_ROLES = [
  "PARENT",
  "COACH",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "ADMIN",
  "SYSTEM",
  "OPER",
] as const;

const MANAGER_ROLES = [
  "COACH",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "ADMIN",
  "SYSTEM",
  "OPER",
] as const;

/**
 * 수업/대회 단위 공지 스트림 — 신규 flat API (Phase 1).
 * 기존 teams/:teamId/community 경로는 축(오픈클래스·대회) 표현 불가로 deprecated 예정.
 * 설계 SoT: claudedocs/unit-notice-stream-design-2026-08-19.md §4.5
 */
@ApiTags("Community Posts (단위 공지)")
@Controller("api/v1/community")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class CommunityPostsController {
  constructor(private readonly service: CommunityPostsService) {}

  @Post("posts")
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "단위 공지 작성",
    description:
      "teamId·targetClassId·targetTournamentId 중 정확히 1개 지정 (축 배타). 즉시 게시 시 수신 대상 푸시.",
  })
  async createPost(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateUnitPostDto,
  ) {
    return this.service.createPost(
      { id: req.user.id, userType: req.user.userType },
      dto,
    );
  }

  @Get("posts")
  @Roles(...VIEWER_ROLES)
  @ApiOperation({
    summary: "단위 스트림 목록",
    description: "classId | tournamentId | teamId 중 1개 필수. 열람 권한 검증.",
  })
  @ApiQuery({ name: "classId", required: false })
  @ApiQuery({ name: "tournamentId", required: false })
  @ApiQuery({ name: "teamId", required: false })
  @ApiQuery({ name: "limit", required: false })
  async getPosts(
    @Request() req: AuthenticatedRequest,
    @Query("classId") classId?: string,
    @Query("tournamentId") tournamentId?: string,
    @Query("teamId") teamId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.getPosts(
      { id: req.user.id, userType: req.user.userType },
      { classId, tournamentId, teamId },
      limit ? parseInt(limit, 10) : 30,
    );
  }

  @Get("posts/managed")
  @Roles(...MANAGER_ROLES)
  @ApiOperation({
    summary: "감독·코치 통합 공지함",
    description: "관할 팀+수업+대회 공지 통합 목록 (읽음 N/M 포함 · Phase 2 팀 축 편입).",
  })
  @ApiQuery({
    name: "axis",
    required: false,
    enum: ["team", "class", "tournament", "unit"],
  })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["ongoing", "expired"],
    description: "만료 구분 — ongoing=미만료(예약 포함) · expired=종료일 경과 · 생략=전체",
  })
  async getManagedPosts(
    @Request() req: AuthenticatedRequest,
    @Query("axis") axis?: "team" | "class" | "tournament" | "unit",
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("status") status?: "ongoing" | "expired",
  ) {
    return this.service.getManagedPosts(
      { id: req.user.id, userType: req.user.userType },
      axis,
      limit ? parseInt(limit, 10) : 30,
      offset ? parseInt(offset, 10) : 0,
      status === "ongoing" || status === "expired" ? status : undefined,
    );
  }

  @Get("posts/feed")
  @Roles(...VIEWER_ROLES)
  @ApiOperation({
    summary: "통합 공지 feed",
    description:
      "대시보드 탭 A 단일 소스 — 열람 가능한 팀+수업+대회 공지 통합 (게시 중만). " +
      "childId=학부모 선택 자녀 표시 필터 (열람 권한은 전 자녀 합집합 — 상세 검증 담당).",
  })
  @ApiQuery({ name: "childId", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "offset", required: false })
  async getFeed(
    @Request() req: AuthenticatedRequest,
    @Query("childId") childId?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.service.getFeed(
      { id: req.user.id, userType: req.user.userType },
      {
        childId: childId || undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      },
    );
  }

  @Get("targets")
  @Roles(...MANAGER_ROLES)
  @ApiOperation({
    summary: "공지 대상 픽커",
    description: "작성 가능한 관할 수업(진행 중)·대회(취소 제외) 목록.",
  })
  async getManagedTargets(@Request() req: AuthenticatedRequest) {
    return this.service.getManagedTargets({
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  @Get("class-contacts")
  @Roles(...MANAGER_ROLES)
  @ApiOperation({
    summary: "수업 참가자 연락 대상",
    description:
      "참가자 명단 행 [1:1 문의]용 — 선수별 부모 우선 연락 대상 (관할 감독·코치 전용).",
  })
  @ApiQuery({ name: "classId", required: true })
  async getClassContacts(
    @Request() req: AuthenticatedRequest,
    @Query("classId") classId: string,
  ) {
    return this.service.getClassContacts(
      { id: req.user.id, userType: req.user.userType },
      classId,
    );
  }

  @Get("posts/:postId")
  @Roles(...VIEWER_ROLES)
  @ApiOperation({
    summary: "단위 공지 상세",
    description: "열람 검증 + 읽음 upsert + 1일 1회 조회수.",
  })
  async getPostDetail(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
  ) {
    return this.service.getPostDetail(
      { id: req.user.id, userType: req.user.userType },
      postId,
    );
  }

  @Patch("posts/:postId")
  @Roles(...MANAGER_ROLES)
  @ApiOperation({ summary: "단위 공지 수정" })
  async updatePost(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
    @Body() dto: UpdateUnitPostDto,
  ) {
    return this.service.updatePost(
      { id: req.user.id, userType: req.user.userType },
      postId,
      dto,
    );
  }

  @Delete("posts/:postId")
  @Roles(...MANAGER_ROLES)
  @ApiOperation({
    summary: "단위 공지 삭제 (soft)",
    description: "작성자 + 관할 감독·코치.",
  })
  async deletePost(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
  ) {
    return this.service.deletePost(
      { id: req.user.id, userType: req.user.userType },
      postId,
    );
  }

  @Get("posts/:postId/reads/summary")
  @Roles(...MANAGER_ROLES)
  @ApiOperation({
    summary: "읽음 N/M + 미읽음자 명단",
    description:
      "감독·코치 전용. M=조회 시점 수신자 집합, N=수신자 ∩ 읽음. 미읽음자 명단만 노출 (읽은 사람 목록·읽은 시각 비노출).",
  })
  async getReadsSummary(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
  ) {
    return this.service.getReadsSummary(
      { id: req.user.id, userType: req.user.userType },
      postId,
    );
  }

  @Post("posts/:postId/remind")
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "미읽음자에게 다시 알리기",
    description: "미읽음 수신자 전원에게 재알림 푸시. 게시글당 24시간 1회.",
  })
  async remindUnread(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
  ) {
    return this.service.remindUnread(
      { id: req.user.id, userType: req.user.userType },
      postId,
    );
  }

  @Post("posts/:postId/attachments")
  @Roles(...MANAGER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "첨부 이미지 추가",
    description:
      "공용 files/upload(category=IMAGE) 업로드 선행. 이미지 4종·10MB.",
  })
  async addAttachment(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
    @Body() dto: UnitNoticeAttachmentDto,
  ) {
    return this.service.addAttachment(
      { id: req.user.id, userType: req.user.userType },
      postId,
      dto,
    );
  }

  @Post("posts/:postId/comments")
  @Roles(...VIEWER_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "댓글 작성", description: "열람 가능자 전원." })
  async addComment(
    @Request() req: AuthenticatedRequest,
    @Param("postId") postId: string,
    @Body() dto: CreateUnitCommentDto,
  ) {
    return this.service.addComment(
      { id: req.user.id, userType: req.user.userType },
      postId,
      dto,
    );
  }

  @Patch("comments/:commentId")
  @Roles(...VIEWER_ROLES)
  @ApiOperation({ summary: "댓글 수정", description: "본인만." })
  async updateComment(
    @Request() req: AuthenticatedRequest,
    @Param("commentId") commentId: string,
    @Body() dto: UpdateUnitCommentDto,
  ) {
    return this.service.updateComment(
      { id: req.user.id, userType: req.user.userType },
      commentId,
      dto,
    );
  }

  @Delete("comments/:commentId")
  @Roles(...VIEWER_ROLES)
  @ApiOperation({
    summary: "댓글 삭제",
    description: "본인 + 관할 감독·코치 moderation (감사 로그 기록).",
  })
  async deleteComment(
    @Request() req: AuthenticatedRequest,
    @Param("commentId") commentId: string,
  ) {
    return this.service.deleteComment(
      { id: req.user.id, userType: req.user.userType },
      commentId,
    );
  }
}
