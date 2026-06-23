import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import type { Request as ExpressRequest } from "express";
import { UserType } from "@prisma/client";
import { TeamGroupsService } from "./team-groups.service";
import { CreateTeamGroupDto } from "./dto/create-team-group.dto";
import { UpdateTeamGroupDto } from "./dto/update-team-group.dto";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

@ApiTags("Team Groups (팀 그룹 관리)")
@Controller("api/v1")
@ApiBearerAuth()
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
export class TeamGroupsController {
  constructor(private readonly teamGroupsService: TeamGroupsService) {}

  @Get("teams/:teamId/groups")
  @ApiOperation({ summary: "팀 하위 그룹 목록 조회" })
  async listByTeam(@Param("teamId") teamId: string) {
    return this.teamGroupsService.listByTeam(teamId);
  }

  @Get("teams/:teamId/eligible-members")
  @ApiOperation({
    summary: "그룹 생성 시 후보 ClubMember 목록 (이름/성별/나이) — 실데이터",
  })
  async listEligibleMembers(@Param("teamId") teamId: string) {
    return this.teamGroupsService.listEligibleMembers(teamId);
  }

  @Get("team-groups/:id")
  @ApiOperation({ summary: "그룹 상세 + 멤버 목록" })
  async findOne(@Param("id") id: string) {
    return this.teamGroupsService.findById(id);
  }

  @Post("teams/:teamId/groups")
  @UseGuards(RolesGuard)
  @Roles(
    UserType.DIRECTOR,
    UserType.COACH,
    UserType.ADMIN,
    UserType.SYSTEM,
    UserType.OPER,
  )
  @ApiOperation({ summary: "팀 하위 그룹 생성 (감독/코치 전용)" })
  async create(
    @Param("teamId") teamId: string,
    @Body() dto: CreateTeamGroupDto,
    @Request() req: ExpressRequest & { user: { sub: string } },
  ) {
    return this.teamGroupsService.create(teamId, req.user.sub, dto);
  }

  @Put("team-groups/:id")
  @UseGuards(RolesGuard)
  @Roles(
    UserType.DIRECTOR,
    UserType.COACH,
    UserType.ADMIN,
    UserType.SYSTEM,
    UserType.OPER,
  )
  @ApiOperation({ summary: "그룹 수정 (감독/코치 전용)" })
  async update(@Param("id") id: string, @Body() dto: UpdateTeamGroupDto) {
    return this.teamGroupsService.update(id, dto);
  }

  @Delete("team-groups/:id")
  @UseGuards(RolesGuard)
  @Roles(
    UserType.DIRECTOR,
    UserType.COACH,
    UserType.ADMIN,
    UserType.SYSTEM,
    UserType.OPER,
  )
  @ApiOperation({ summary: "그룹 삭제 (감독/코치 전용)" })
  async delete(@Param("id") id: string) {
    return this.teamGroupsService.delete(id);
  }
}
