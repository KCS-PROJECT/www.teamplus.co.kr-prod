import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuditAction } from "@/common/decorators/audit-action.decorator";
import type { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { TeamSettlementAccountService } from "./team-settlement-account.service";
import { UpsertTeamSettlementAccountDto } from "./dto/upsert-team-settlement-account.dto";

/** 팀 정산 계좌 — 경로는 팀 하위지만 정산 모듈이 소유한다(지급 게이트와 같은 SoT). */
@ApiTags("Settlements")
@Controller("api/v1/teams/:teamId/settlement-account")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class TeamSettlementAccountController {
  constructor(private readonly accountService: TeamSettlementAccountService) {}

  @Get()
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "팀 정산 계좌 조회",
    description:
      "팀 소유 감독은 마스킹된 값, 관리자는 평문을 받습니다. 미등록이면 data=null.",
  })
  @ApiParam({ name: "teamId", description: "팀 ID" })
  @ApiResponse({ status: 200, description: "조회 성공(미등록이면 null)" })
  @ApiResponse({ status: 403, description: "팀 소유 감독 또는 관리자만 조회" })
  @ApiResponse({ status: 404, description: "팀을 찾을 수 없습니다." })
  async get(
    @Param("teamId") teamId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    // 공용 응답 래퍼는 null 을 빈 본문으로 보낸다 — 미등록(null)도 envelope 로 내려 클라이언트가 구분하게 한다.
    const account = await this.accountService.getForTeam(teamId, req.user);
    return { success: true, data: account };
  }

  @Get("policy")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "팀 정산 계좌 저장 정책",
    description:
      "registrationMode(manual=운영자가 나이스에 직접 등록 / api=저장 시 나이스 자동 등록)와 " +
      "saveBlockedReason(지금 저장할 수 없는 이유, 없으면 null). 조회 권한은 계좌 조회와 같습니다.",
  })
  @ApiParam({ name: "teamId", description: "팀 ID" })
  @ApiResponse({ status: 200, description: "조회 성공" })
  @ApiResponse({ status: 403, description: "팀 소유 감독 또는 관리자만 조회" })
  @ApiResponse({ status: 404, description: "팀을 찾을 수 없습니다." })
  async getPolicy(
    @Param("teamId") teamId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.accountService.getRegistrationPolicyForTeam(teamId, req.user);
  }

  @Put()
  @Roles("DIRECTOR")
  @ApiOperation({
    summary: "팀 정산 계좌 저장",
    description:
      "팀 소유 감독만 저장합니다(관리자 포함 그 외 403). 사업자등록번호는 첫 저장에만 필수이고 이후 변경할 수 없습니다. " +
      "수동 운영이면 내용이 바뀔 때 SUBMITTED 로 돌아가 운영자가 나이스에 다시 등록합니다. " +
      "지급대행 live 모드면 저장 직후 나이스 서브몰 등록을 호출해 REGISTERED(성공)·FAILED(거절, lastResultMessage)·SUBMITTED(결과 확인 중)로 정합니다.",
  })
  @ApiParam({ name: "teamId", description: "팀 ID" })
  @ApiResponse({ status: 200, description: "저장 성공(마스킹 응답)" })
  @ApiResponse({ status: 400, description: "입력 오류 · 사업자번호 변경 시도" })
  @ApiResponse({ status: 403, description: "팀 소유 감독만 저장" })
  @ApiResponse({
    status: 409,
    description:
      "23:00~01:00 등록 불가(SUBMALL_WINDOW_CLOSED) · 등록 진행 중 · 동시 수정",
  })
  @AuditAction({
    action: "team.settlement-account.upsert",
    resource: "TeamSettlementAccount",
    // 사업자번호·계좌번호·예금주는 감사 로그에 남기지 않는다.
    includeKeys: ["teamId", "bankCode"],
  })
  async upsert(
    @Param("teamId") teamId: string,
    @Body() dto: UpsertTeamSettlementAccountDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.accountService.upsert(teamId, dto, req.user);
  }
}
