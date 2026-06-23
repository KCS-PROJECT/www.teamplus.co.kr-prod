import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { existsSync, mkdirSync } from "fs";
import { getCategoryDir } from "@/common/upload-paths";
import { TmsService } from "./tms.service";
import {
  CreateTmsPostDto,
  CreateTmsCommentDto,
  UpdateTmsStatusDto,
} from "./dto/create-tms-post.dto";
import { UpdateTmsPostDto } from "./dto/update-tms-post.dto";

@ApiTags("TMS (수정사항 관리)")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ADMIN", "DIRECTOR")
@Controller("api/v1/tms")
export class TmsController {
  constructor(private readonly tmsService: TmsService) {}

  @Get()
  @ApiOperation({
    summary: "TMS 게시글 목록 조회",
    description: "검색, 필터, 페이지네이션을 지원하는 게시글 목록 조회",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "페이지 번호 (기본 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "페이지 크기 (기본 20)",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "제목/내용/작성자 검색",
  })
  @ApiQuery({ name: "platform", required: false, description: "플랫폼 필터" })
  @ApiQuery({ name: "category", required: false, description: "카테고리 필터" })
  @ApiQuery({ name: "status", required: false, description: "상태 필터" })
  @ApiQuery({ name: "priority", required: false, description: "우선순위 필터" })
  async findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("platform") platform?: string,
    @Query("category") category?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
  ) {
    return this.tmsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      platform,
      category,
      status,
      priority,
    });
  }

  @Get(":id")
  @ApiOperation({
    summary: "TMS 게시글 상세 조회",
    description: "조회수 자동 증가",
  })
  async findOne(@Param("id") id: string, @Request() req: AuthenticatedRequest) {
    const userId: string | undefined = req?.user?.id;
    return this.tmsService.findOne(id, userId);
  }

  @Post()
  @ApiOperation({ summary: "TMS 게시글 생성" })
  async create(@Body() dto: CreateTmsPostDto) {
    return this.tmsService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "TMS 게시글 수정" })
  async update(@Param("id") id: string, @Body() dto: UpdateTmsPostDto) {
    return this.tmsService.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "TMS 게시글 삭제 (소프트 삭제)" })
  async remove(@Param("id") id: string) {
    return this.tmsService.remove(id);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "TMS 게시글 상태 변경 (빠른 상태 전환)" })
  async updateStatus(@Param("id") id: string, @Body() dto: UpdateTmsStatusDto) {
    return this.tmsService.updateStatus(id, dto.status);
  }

  @Post(":id/comments")
  @ApiOperation({ summary: "TMS 게시글 댓글 추가" })
  async addComment(@Param("id") id: string, @Body() dto: CreateTmsCommentDto) {
    return this.tmsService.addComment(id, dto);
  }

  @Post("upload")
  @ApiOperation({
    summary: "TMS 파일 업로드",
    description: "이미지/PDF 업로드 (최대 10MB)",
  })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          // 단일 진입점 — UPLOAD_ROOT env 적용. files/videos/chat/shop/inspections 와 동일 베이스.
          const now = new Date();
          const year = String(now.getFullYear());
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const day = String(now.getDate()).padStart(2, "0");
          const dateDir = `${year}${month}${day}`;
          const dir = join(getCategoryDir("tms"), year, dateDir);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          // multer는 originalname을 latin1로 넘기므로 UTF-8로 복원
          const decoded = Buffer.from(file.originalname, "latin1").toString(
            "utf8",
          );
          const now = new Date();
          const month = String(now.getMonth() + 1).padStart(2, "0");
          const day = String(now.getDate()).padStart(2, "0");
          const datePrefix = `${now.getFullYear()}${month}${day}`;
          const ext = extname(decoded);
          const safeName = decoded
            .replace(ext, "")
            .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
            .substring(0, 50);
          cb(null, `${datePrefix}_${safeName}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.tmsService.uploadFile(file);
  }
}
