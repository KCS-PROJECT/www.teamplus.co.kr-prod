import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
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
import { AlimtalkTemplateService } from "./alimtalk-template.service";
import {
  CreateAlimtalkTemplateDto,
  UpdateAlimtalkTemplateDto,
} from "./dto/alimtalk-template.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuditAction } from "@/common/decorators";

/**
 * AlimtalkTemplate Admin CRUD (2026-05-14 Phase D-9 확장).
 *
 * 관리자(ADMIN/SYSTEM/OPER) 만 접근. 운영 중 템플릿 추가/수정/비활성화.
 */
@ApiTags("Admin - Alimtalk Templates")
@ApiBearerAuth()
@Controller("api/v1/admin/alimtalk-templates")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("ADMIN", "SYSTEM", "OPER")
export class AlimtalkTemplateController {
  constructor(private readonly service: AlimtalkTemplateService) {}

  @Get()
  @ApiOperation({ summary: "Alimtalk 템플릿 목록 조회" })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({ name: "isActive", required: false, type: Boolean })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  list(
    @Query("category") category?: string,
    @Query("isActive") isActive?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.list({
      category,
      isActive:
        isActive === undefined
          ? undefined
          : isActive === "true" || isActive === "1",
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Alimtalk 템플릿 단건 조회" })
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AuditAction({
    action: "alimtalk.template.create",
    resource: "AlimtalkTemplate",
    includeKeys: ["templateCode", "name", "category"],
  })
  @ApiOperation({ summary: "Alimtalk 템플릿 생성" })
  @ApiResponse({ status: 201, description: "생성 성공" })
  @ApiResponse({ status: 409, description: "중복 templateCode" })
  create(@Body() dto: CreateAlimtalkTemplateDto) {
    return this.service.create(dto);
  }

  @Put(":id")
  @AuditAction({
    action: "alimtalk.template.update",
    resource: "AlimtalkTemplate",
    includeKeys: ["id"],
  })
  @ApiOperation({ summary: "Alimtalk 템플릿 수정" })
  update(@Param("id") id: string, @Body() dto: UpdateAlimtalkTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @AuditAction({
    action: "alimtalk.template.delete",
    resource: "AlimtalkTemplate",
    includeKeys: ["id"],
  })
  @ApiOperation({ summary: "Alimtalk 템플릿 삭제" })
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
