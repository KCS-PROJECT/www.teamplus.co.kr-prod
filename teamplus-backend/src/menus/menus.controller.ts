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
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import type { Request as ExpressRequest } from "express";
import { MenusService } from "./menus.service";
import { UserType } from "@prisma/client";
import {
  CreateAppMenuDto,
  UpdateAppMenuDto,
  BulkUpdateAppMenuDto,
  ResetMenuTreeDto,
} from "./dto/app-menu.dto";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

@ApiTags("App Menus (앱 메뉴 관리)")
@Controller("api/v1/menus")
@ApiBearerAuth()
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  /**
   * 로그인 사용자의 역할(JWT)로 메뉴 조회
   * GET /menus/my
   */
  @Get("my")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(
    UserType.ADMIN,
    UserType.DIRECTOR,
    UserType.ACADEMY_DIRECTOR,
    UserType.COACH,
    UserType.PARENT,
    UserType.TEEN,
    UserType.CHILD,
    UserType.SYSTEM,
    UserType.OPER,
  )
  @ApiOperation({ summary: "로그인 사용자 역할 기반 메뉴 조회 (JWT 세션)" })
  async getMyMenus(
    @Request() req: ExpressRequest & { user: { userType: UserType } },
  ) {
    return this.menusService.getMenusByUserType(req.user.userType);
  }

  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserType.ADMIN, UserType.SYSTEM, UserType.OPER)
  @ApiOperation({
    summary: "사용자 유형별 메뉴 조회 (query: userType) — 관리자 전용",
    description:
      "전체 메뉴 트리 또는 특정 역할의 메뉴를 반환합니다. 일반 사용자는 /menus/my 를 사용해야 합니다.",
  })
  async getMenus(@Query("userType") userType: UserType) {
    if (userType) {
      return this.menusService.getMenusByUserType(userType);
    }
    return this.menusService.getAllMenus();
  }

  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserType.ADMIN, UserType.SYSTEM, UserType.OPER)
  @ApiOperation({ summary: "메뉴 생성 (관리자)" })
  async createMenu(@Body() dto: CreateAppMenuDto) {
    return this.menusService.createMenu(dto);
  }

  @Post("sync")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserType.ADMIN, UserType.SYSTEM, UserType.OPER)
  @ApiOperation({ summary: "사용자 유형별 메뉴 일괄 저장 (관리자)" })
  async syncMenus(@Body() dto: BulkUpdateAppMenuDto) {
    return this.menusService.syncMenus(dto.userType, dto.menus);
  }

  @Post("reset-tree")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserType.ADMIN, UserType.SYSTEM, UserType.OPER)
  @ApiOperation({
    summary: "역할 메뉴를 spec 트리로 초기화 (관리자)",
    description:
      "client(admin)가 shared/constants/app-menu-spec.ts 트리를 그대로 보내면 transaction 으로 parent → children 순으로 재생성한다.",
  })
  async resetTree(@Body() dto: ResetMenuTreeDto) {
    return this.menusService.resetTree(dto.userType, dto.groups);
  }

  @Put(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserType.ADMIN, UserType.SYSTEM, UserType.OPER)
  @ApiOperation({ summary: "메뉴 수정 (관리자)" })
  async updateMenu(@Param("id") id: string, @Body() dto: UpdateAppMenuDto) {
    return this.menusService.updateMenu(id, dto);
  }

  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(UserType.ADMIN, UserType.SYSTEM, UserType.OPER)
  @ApiOperation({ summary: "메뉴 삭제 (관리자)" })
  async deleteMenu(@Param("id") id: string) {
    return this.menusService.deleteMenu(id);
  }
}
