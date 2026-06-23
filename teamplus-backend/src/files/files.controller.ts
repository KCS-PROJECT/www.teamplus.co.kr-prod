import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  FileResponseDto,
  UploadFileDto,
  UploadManyPartialResponseDto,
} from "./dto/upload-file.dto";
import { FilesService } from "./files.service";

/**
 * 통합 업로드 API
 *
 * 모든 첨부파일·사진·프로필·문서·영상의 단일 진입점.
 * 기존 개별 업로드 엔드포인트(shop/chat/tms 등)는 하위 호환을 위해 유지되며
 * 신규 개발은 본 Files API를 사용한다.
 */
@ApiTags("Files - 통합 업로드")
@ApiBearerAuth()
@Controller("api/v1/files")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// [2026-05-13 roles-check] 인증된 모든 사용자 업로드/조회 허용.
//   파일 크기·MIME 제한은 FileInterceptor 옵션으로 강제.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "단일 파일 업로드",
    description:
      "카테고리별 MIME·크기·매직바이트 검증 후 저장합니다. 인증된 사용자만 업로드 가능합니다.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "category"],
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "업로드할 파일",
        },
        category: {
          type: "string",
          enum: ["IMAGE", "DOCUMENT", "VIDEO", "AVATAR", "ATTACHMENT"],
          description: "업로드 카테고리",
        },
        refType: {
          type: "string",
          description: "연결 리소스 타입 (선택)",
        },
        refId: {
          type: "string",
          description: "연결 리소스 ID (선택)",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "업로드 성공",
    type: FileResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "파일 검증 실패 (MIME/크기/시그니처)",
  })
  @ApiResponse({ status: 401, description: "인증 필요" })
  @ApiResponse({ status: 413, description: "파일 크기 초과" })
  async uploadOne(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<FileResponseDto> {
    return this.filesService.uploadOne(
      file,
      dto,
      req.user.id,
      req.user.userType,
    );
  }

  @Post("upload-multiple")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor("files", 10))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "다중 파일 업로드",
    description:
      "최대 10개 · 총 50MB 이내. allowPartial=false (기본) 시 하나라도 실패하면 전체 롤백, true 시 성공한 것만 commit + 실패 리포트 반환.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["files", "category"],
      properties: {
        files: {
          type: "array",
          items: { type: "string", format: "binary" },
          description: "업로드할 파일들 (최대 10개)",
        },
        category: {
          type: "string",
          enum: ["IMAGE", "DOCUMENT", "VIDEO", "AVATAR", "ATTACHMENT"],
        },
        refType: { type: "string" },
        refId: { type: "string" },
        allowPartial: {
          type: "boolean",
          description:
            "다중 업로드 부분 실패 허용 (false=전체 롤백, true=성공한 것만 commit)",
          default: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      "업로드 성공 — allowPartial=false 시 FileResponseDto[], true 시 { succeeded, failed } 형식",
    schema: {
      oneOf: [
        {
          type: "array",
          items: { $ref: "#/components/schemas/FileResponseDto" },
        },
        { $ref: "#/components/schemas/UploadManyPartialResponseDto" },
      ],
    },
  })
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadFileDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<FileResponseDto[] | UploadManyPartialResponseDto> {
    return this.filesService.uploadMany(
      files,
      dto,
      req.user.id,
      req.user.userType,
    );
  }

  @Get(":id")
  @ApiOperation({
    summary: "파일 메타데이터 조회",
    description: "파일 ID로 메타데이터를 조회합니다.",
  })
  @ApiResponse({ status: 200, type: FileResponseDto })
  @ApiResponse({ status: 404, description: "파일을 찾을 수 없음" })
  async findOne(@Param("id") id: string): Promise<FileResponseDto> {
    return this.filesService.findById(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "파일 삭제",
    description: "본인이 업로드한 파일 또는 ADMIN만 삭제할 수 있습니다.",
  })
  @ApiResponse({ status: 200, description: "삭제 성공" })
  @ApiResponse({ status: 403, description: "권한 없음" })
  @ApiResponse({ status: 404, description: "파일을 찾을 수 없음" })
  async remove(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ deleted: true }> {
    return this.filesService.remove(id, req.user.id, req.user.userType);
  }
}
