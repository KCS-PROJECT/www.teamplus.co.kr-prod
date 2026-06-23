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
import { MainPopupsService } from "./main-popups.service";
import {
  CreateMainPopupDto,
  UpdateMainPopupDto,
  ToggleMainPopupDto,
} from "./dto/create-main-popup.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { Public } from "@/auth/public.decorator";

/**
 * 공개 API 컨트롤러 - 활성 팝업 조회
 */
@ApiTags("Main Popups")
@Controller("api/v1/main-popups")
export class MainPopupsPublicController {
  constructor(private readonly mainPopupsService: MainPopupsService) {}

  @Get("active")
  @Public()
  @ApiOperation({
    summary: "활성 팝업 목록 조회",
    description:
      "현재 활성화된 메인 팝업 목록을 조회합니다. userType으로 필터링 가능합니다.",
  })
  @ApiQuery({
    name: "userType",
    required: false,
    description: "사용자 역할 (예: PARENT, COACH)",
    example: "PARENT",
  })
  @ApiResponse({ status: 200, description: "활성 팝업 목록 조회 성공" })
  async getActive(@Query("userType") userType?: string) {
    return this.mainPopupsService.getActive(userType);
  }
}

/**
 * 관리자 API 컨트롤러 - 팝업 CRUD
 */
@ApiTags("Main Popups (Admin)")
@Controller("api/v1/admin/main-popups")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class MainPopupsAdminController {
  constructor(private readonly mainPopupsService: MainPopupsService) {}

  @Get()
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "전체 팝업 목록 조회 (관리자)",
    description: "모든 팝업을 조회합니다. 상태 필터 포함.",
  })
  @ApiQuery({
    name: "isActive",
    required: false,
    description: "활성화 상태 필터",
    type: Boolean,
  })
  @ApiResponse({ status: 200, description: "팝업 목록 조회 성공" })
  async findAll(@Query("isActive") isActive?: string) {
    const activeFilter =
      isActive === "true" ? true : isActive === "false" ? false : undefined;
    return this.mainPopupsService.findAll(activeFilter);
  }

  @Post()
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "팝업 생성",
    description: "새로운 메인 팝업을 생성합니다.",
  })
  @ApiResponse({ status: 201, description: "팝업 생성 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  async create(@Body() dto: CreateMainPopupDto) {
    return this.mainPopupsService.create(dto);
  }

  @Patch(":id")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "팝업 수정",
    description: "기존 팝업 정보를 수정합니다.",
  })
  @ApiResponse({ status: 200, description: "팝업 수정 성공" })
  @ApiResponse({ status: 404, description: "팝업을 찾을 수 없습니다." })
  async update(@Param("id") id: string, @Body() dto: UpdateMainPopupDto) {
    return this.mainPopupsService.update(id, dto);
  }

  @Patch(":id/toggle")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "팝업 활성/비활성 토글",
    description: "팝업의 활성 상태를 변경합니다.",
  })
  @ApiResponse({ status: 200, description: "팝업 상태 변경 성공" })
  @ApiResponse({ status: 404, description: "팝업을 찾을 수 없습니다." })
  async toggle(@Param("id") id: string, @Body() dto: ToggleMainPopupDto) {
    return this.mainPopupsService.toggle(id, dto.isActive);
  }

  @Delete(":id")
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "팝업 삭제",
    description: "팝업을 삭제합니다.",
  })
  @ApiResponse({ status: 200, description: "팝업 삭제 성공" })
  @ApiResponse({ status: 404, description: "팝업을 찾을 수 없습니다." })
  async remove(@Param("id") id: string) {
    return this.mainPopupsService.remove(id);
  }
}
