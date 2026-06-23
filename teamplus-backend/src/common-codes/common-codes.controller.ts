import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CommonCodesService } from "./common-codes.service";
import {
  CreateCodeGroupDto,
  UpdateCodeGroupDto,
  CreateCommonCodeDto,
  UpdateCommonCodeDto,
} from "./dto/common-code.dto";

// ==================== CodeGroup Controller ====================

@Controller("api/v1/common-code-groups")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// [2026-05-13 roles-check] 기본 — 인증된 모든 사용자 조회. mutation 은 메서드 레벨.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class CodeGroupController {
  constructor(private readonly commonCodesService: CommonCodesService) {}

  @Get()
  async findAll(@Query("search") search?: string) {
    const data = await this.commonCodesService.findAllGroups(search);
    return { success: true, data };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.commonCodesService.findOneGroup(id);
    return { success: true, data };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateCodeGroupDto,
  ) {
    const data = await this.commonCodesService.createGroup(req.user.id, dto);
    return { success: true, data };
  }

  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateCodeGroupDto,
  ) {
    const data = await this.commonCodesService.updateGroup(
      req.user.id,
      id,
      dto,
    );
    return { success: true, data };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  async remove(@Param("id") id: string) {
    const data = await this.commonCodesService.removeGroup(id);
    return { success: true, data };
  }
}

// ==================== CommonCode Controller ====================

@Controller("api/v1/common-codes")
@UseGuards(AuthGuard("jwt"))
export class CommonCodeController {
  constructor(private readonly commonCodesService: CommonCodesService) {}

  @Get()
  async findAll(
    @Query("groupId") groupId?: string,
    @Query("parentId") parentId?: string,
    @Query("search") search?: string,
  ) {
    const data = await this.commonCodesService.findAllCodes(
      groupId,
      parentId,
      search,
    );
    return { success: true, data };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const data = await this.commonCodesService.findOneCode(id);
    return { success: true, data };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateCommonCodeDto,
  ) {
    const data = await this.commonCodesService.createCode(req.user.id, dto);
    return { success: true, data };
  }

  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateCommonCodeDto,
  ) {
    const data = await this.commonCodesService.updateCode(req.user.id, id, dto);
    return { success: true, data };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  async remove(@Param("id") id: string) {
    const data = await this.commonCodesService.removeCode(id);
    return { success: true, data };
  }
}
