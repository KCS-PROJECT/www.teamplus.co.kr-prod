import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from "@nestjs/swagger";
import { VideosService } from "./videos.service";
import { CreateVideoDto } from "./dto/create-video.dto";
import { UpdateVideoDto } from "./dto/update-video.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";

@ApiTags("Videos - 영상 관리")
@Controller("api/v1/videos")
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  // ==================== 영상 업로드 (multipart/form-data) ====================

  /**
   * 영상 multipart 업로드 — 모바일 카메라/갤러리·웹 파일 선택 공통 진입점.
   * 학부모는 본인 자녀 관련(memberId) 또는 자신 명의로 자유 업로드 가능,
   * 코치/감독은 수업·팀 영상 업로드, 관리자는 전체.
   *
   * 클라이언트는 사전 압축(예: Flutter video_compress) 으로 50MB 이내로 정렬한다.
   * 서버 검증: MP4 / MOV / AVI / WEBM, 최대 50MB.
   */
  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH", "PARENT")
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "영상 업로드 (multipart/form-data)",
    description:
      "영상 파일을 multipart/form-data 로 업로드합니다. 모바일 카메라 직캡처·갤러리 선택·웹 파일 선택 모두 동일 엔드포인트 사용. (학부모·코치·감독·아카데미감독·관리자) 최대 50MB · mp4/mov/avi/webm 지원. 클라이언트는 video_compress 등으로 사전 압축 권장.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "title"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "영상 파일 (mp4, mov, avi, webm, 최대 50MB)",
        },
        title: {
          type: "string",
          description: "영상 제목",
          example: "U12 훈련 하이라이트",
        },
        description: { type: "string", description: "영상 설명" },
        teamId: { type: "string", description: "팀 ID" },
        videoType: {
          type: "string",
          enum: ["training", "match", "highlight", "other"],
          description: "영상 유형",
          default: "training",
        },
        tournamentId: { type: "string", description: "대회 ID" },
        matchId: { type: "string", description: "경기 ID" },
        classId: { type: "string", description: "수업 ID" },
        isPublic: { type: "boolean", description: "공개 여부", default: false },
        duration: { type: "integer", description: "영상 길이 (초)" },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "영상 업로드 성공",
    schema: {
      example: {
        success: true,
        message: "영상이 성공적으로 업로드되었습니다.",
        data: {
          id: "cuid-string",
          title: "U12 훈련 하이라이트",
          videoUrl: "/uploads/videos/1704567890-abc123.mp4",
          videoType: "training",
          status: "ready",
          createdAt: "2026-04-06T10:00:00.000Z",
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: "잘못된 파일 형식 또는 크기 초과" })
  async uploadVideo(
    @Request() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }), // 50MB
          new FileTypeValidator({
            fileType: /^video\/(mp4|quicktime|x-msvideo|webm)$/,
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body() createVideoDto: CreateVideoDto,
  ) {
    return this.videosService.uploadVideo(req.user.id, file, createVideoDto);
  }

  // ==================== 영상 목록 조회 ====================

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "영상 목록 조회",
    description: "영상 목록을 조회합니다. 필터링 및 페이지네이션을 지원합니다.",
  })
  @ApiQuery({ name: "teamId", required: false, description: "클럽 ID" })
  @ApiQuery({
    name: "videoType",
    required: false,
    enum: ["training", "match", "highlight", "other"],
    description: "영상 유형",
  })
  @ApiQuery({
    name: "tournamentId",
    required: false,
    description: "대회 ID",
  })
  @ApiQuery({ name: "classId", required: false, description: "수업 ID" })
  @ApiQuery({
    name: "memberId",
    required: false,
    description: "특정 회원 ID로 필터링 (해당 회원의 클럽 영상 등)",
  })
  @ApiQuery({
    name: "uploaderId",
    required: false,
    description: "업로더 ID로 필터링 — 특정 사용자가 업로드한 영상만 조회",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["processing", "ready", "failed"],
    description: "영상 상태",
  })
  @ApiQuery({
    name: "isPublic",
    required: false,
    type: Boolean,
    description: "공개 여부",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "검색어 (제목, 설명)",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "페이지 번호 (기본: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "페이지당 항목 수 (기본: 20)",
  })
  @ApiResponse({ status: 200, description: "영상 목록 조회 성공" })
  async getVideos(
    @Query("teamId") teamId?: string,
    @Query("videoType") videoType?: string,
    @Query("tournamentId") tournamentId?: string,
    @Query("classId") classId?: string,
    @Query("memberId") memberId?: string,
    @Query("uploaderId") uploaderId?: string,
    @Query("status") status?: string,
    @Query("isPublic") isPublic?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.videosService.getVideos({
      teamId,
      videoType,
      tournamentId,
      classId,
      memberId,
      uploaderId,
      status,
      isPublic: isPublic !== undefined ? isPublic === "true" : undefined,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  // ==================== 내 업로드 영상 ====================

  @Get("my")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "내 업로드 영상 목록",
    description: "현재 로그인한 사용자가 업로드한 영상 목록을 조회합니다.",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "페이지 번호 (기본: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "페이지당 항목 수 (기본: 20)",
  })
  @ApiResponse({ status: 200, description: "내 영상 목록 조회 성공" })
  async getMyVideos(
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.videosService.getMyVideos(
      req.user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  // ==================== 영상 상세 ====================

  @Get(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "영상 상세 조회",
    description: "영상의 상세 정보를 조회합니다. 조회 시 조회수가 증가합니다.",
  })
  @ApiResponse({ status: 200, description: "영상 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "영상을 찾을 수 없음" })
  async getVideoById(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const userId: string | undefined = req?.user?.id;
    return this.videosService.getVideoById(id, userId);
  }

  // ==================== 영상 수정 ====================

  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "영상 정보 수정",
    description:
      "영상의 메타데이터를 수정합니다. 본인 업로드 영상 또는 관리자/감독만 수정 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "영상 수정 성공" })
  @ApiResponse({ status: 403, description: "수정 권한 없음" })
  @ApiResponse({ status: 404, description: "영상을 찾을 수 없음" })
  async updateVideo(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() updateVideoDto: UpdateVideoDto,
  ) {
    return this.videosService.updateVideo(
      id,
      req.user.id,
      req.user.userType,
      updateVideoDto,
    );
  }

  // ==================== 영상 삭제 ====================

  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "ACADEMY_DIRECTOR")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "영상 삭제",
    description:
      "영상을 삭제합니다. 소유자(uploaderId === 요청자 ID) 또는 ADMIN만 삭제할 수 있습니다. DIRECTOR, COACH, PARENT, ACADEMY_DIRECTOR는 본인 업로드 영상만 삭제 가능합니다.",
  })
  @ApiResponse({ status: 200, description: "영상 삭제 성공" })
  @ApiResponse({
    status: 403,
    description: "삭제 권한 없음 — 소유자 또는 ADMIN만 가능",
  })
  @ApiResponse({ status: 404, description: "영상을 찾을 수 없음" })
  async deleteVideo(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    // 컨트롤러 레이어에서 소유자 또는 ADMIN 여부를 선제 검증합니다.
    // videosService.deleteVideo 내부에도 동일 검증이 있으나,
    // 불필요한 서비스 호출 비용을 줄이기 위해 컨트롤러에서 DB 조회를 수행합니다.
    const video = await this.videosService.findVideoOwner(id);
    if (!video) {
      throw new NotFoundException("영상을 찾을 수 없습니다.");
    }

    const isOwner = video.uploaderId === req.user.id;
    const isAdmin = req.user.userType === "ADMIN";

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        "영상을 삭제할 권한이 없습니다. 본인이 업로드한 영상 또는 ADMIN만 삭제할 수 있습니다.",
      );
    }

    return this.videosService.deleteVideo(id, req.user.id, req.user.userType);
  }
}
