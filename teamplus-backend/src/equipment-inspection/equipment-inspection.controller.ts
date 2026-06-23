import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuditAction } from "@/common/decorators";
import { EquipmentInspectionService } from "./equipment-inspection.service";
import {
  CreateEquipmentInspectionDto,
  UpdateEquipmentInspectionDto,
} from "./dto/equipment-inspection.dto";

/**
 * EquipmentInspectionController (2026-05-14 신규 도메인)
 *
 * 링크/팀 장비 안전 점검 리포트 CRUD.
 *  - 생성/수정/삭제: COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN
 *  - 조회: 인증된 모든 사용자 (학부모/학생도 자기 팀 점검 이력 조회 가능)
 *
 * 이상 발견(condition='critical') 시 알림톡 자동 발송 (Service 내부).
 */
@ApiTags("Equipment Inspection (장비 점검)")
@ApiBearerAuth()
@Controller("api/v1/equipment-inspections")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class EquipmentInspectionController {
  constructor(private readonly service: EquipmentInspectionService) {}

  @Get("teams/:teamId")
  @ApiOperation({ summary: "팀 장비 점검 리포트 목록" })
  @ApiQuery({
    name: "status",
    required: false,
    description: "pending/completed/issue_found",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  list(
    @Param("teamId") teamId: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listByTeam(teamId, {
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "점검 리포트 단건 조회" })
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @AuditAction({
    action: "equipment.inspection.create",
    resource: "EquipmentInspection",
    includeKeys: ["teamId", "venueId"],
  })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "점검 리포트 생성" })
  @ApiResponse({ status: 201, description: "생성 성공" })
  @ApiResponse({
    status: 400,
    description: "items 누락 또는 critical 항목의 issueDetail 누락",
  })
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateEquipmentInspectionDto,
  ) {
    return this.service.create(req.user.id, dto);
  }

  @Patch(":id")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @AuditAction({
    action: "equipment.inspection.update",
    resource: "EquipmentInspection",
    includeKeys: ["id", "status"],
  })
  @ApiOperation({ summary: "점검 리포트 상태/메모 수정" })
  update(@Param("id") id: string, @Body() dto: UpdateEquipmentInspectionDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @Roles("DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @AuditAction({
    action: "equipment.inspection.delete",
    resource: "EquipmentInspection",
    includeKeys: ["id"],
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "점검 리포트 삭제" })
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }

  /**
   * 점검 사진 업로드 (멀티파트)
   *
   * 클라이언트는 항목 photo 를 클립으로 첨부 → `imageUrl` 응답 → CreateInspectionItem
   * 의 `photoUrl` 필드에 그대로 넘긴다. URL 직접 입력 모드(보안 위험)는 점진 폐기.
   *
   * 인증된 코치/감독/원장/관리자만 업로드 가능 (학생/학부모는 read-only 조회만).
   */
  @Post("upload/photo")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @UseInterceptors(FileInterceptor("photo"))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "점검 사진 업로드",
    description:
      "이상 항목 사진을 업로드합니다. 응답의 `imageUrl` 을 InspectionItem.photoUrl 로 사용하세요.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        photo: {
          type: "string",
          format: "binary",
          description: "이미지 파일 (jpg/png/gif/webp/heic, 최대 10MB)",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "업로드 성공",
    schema: {
      example: {
        success: true,
        imageUrl: "/uploads/inspections/1704567890-abc123.jpg",
        filename: "1704567890-abc123.jpg",
        size: 1024000,
        mimetype: "image/jpeg",
      },
    },
  })
  @ApiResponse({ status: 400, description: "잘못된 파일 형식 또는 크기 초과" })
  @HttpCode(HttpStatus.CREATED)
  async uploadPhoto(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|jpg|png|gif|webp|heic|heif)$/,
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("파일이 없습니다.");
    }
    return {
      success: true,
      imageUrl: `/uploads/inspections/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }
}
