import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { EquipmentChecklistService } from "./equipment-checklist.service";
import { CreateChecklistDto } from "./dto/create-checklist.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Equipment Checklist")
@Controller("api/v1/equipment-checklist")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class EquipmentChecklistController {
  constructor(private readonly checklistService: EquipmentChecklistService) {}

  /**
   * 체크리스트 생성
   */
  @Post()
  @Roles("PARENT", "CHILD", "TEEN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "체크리스트 생성",
    description: "준비물 체크리스트를 생성합니다.",
  })
  @ApiResponse({ status: 201, description: "체크리스트 생성 성공" })
  async createChecklist(
    @Body() dto: CreateChecklistDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.checklistService.createChecklist(dto, req.user.id);
  }

  /**
   * 내 체크리스트 목록 조회
   */
  @Get("me")
  @Roles("PARENT", "CHILD", "TEEN")
  @ApiOperation({
    summary: "내 체크리스트 목록",
    description: "로그인한 사용자의 체크리스트 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "체크리스트 목록 조회 성공" })
  async getMyChecklists(@Request() req: AuthenticatedRequest) {
    return this.checklistService.getMyChecklists(req.user.id);
  }

  /**
   * 체크리스트 상세 조회
   */
  @Get(":id")
  @Roles("PARENT", "CHILD", "TEEN")
  @ApiOperation({
    summary: "체크리스트 상세 조회",
    description: "체크리스트와 항목 목록을 조회합니다.",
  })
  @ApiParam({ name: "id", description: "체크리스트 ID" })
  @ApiResponse({ status: 200, description: "체크리스트 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "체크리스트를 찾을 수 없습니다." })
  async getChecklistDetail(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.checklistService.getChecklistDetail(id, req.user.id);
  }

  /**
   * 체크 항목 토글
   */
  @Patch("items/:itemId/toggle")
  @Roles("PARENT", "CHILD", "TEEN")
  @ApiOperation({
    summary: "체크 항목 토글",
    description: "체크리스트 항목의 체크 상태를 토글합니다.",
  })
  @ApiParam({ name: "itemId", description: "ChecklistItem ID" })
  @ApiResponse({ status: 200, description: "토글 성공" })
  @ApiResponse({ status: 404, description: "항목을 찾을 수 없습니다." })
  async toggleItem(
    @Param("itemId") itemId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.checklistService.toggleItem(itemId, req.user.id);
  }

  /**
   * 체크리스트 전체 초기화
   */
  @Post(":id/reset")
  @Roles("PARENT", "CHILD", "TEEN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "체크리스트 초기화",
    description: "체크리스트의 모든 항목을 미체크 상태로 초기화합니다.",
  })
  @ApiParam({ name: "id", description: "체크리스트 ID" })
  @ApiResponse({ status: 200, description: "초기화 성공" })
  @ApiResponse({ status: 404, description: "체크리스트를 찾을 수 없습니다." })
  async resetChecklist(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.checklistService.resetChecklist(id, req.user.id);
  }

  /**
   * 체크리스트 삭제
   */
  @Delete(":id")
  @Roles("PARENT", "CHILD", "TEEN")
  @ApiOperation({
    summary: "체크리스트 삭제",
    description: "체크리스트와 모든 항목을 삭제합니다.",
  })
  @ApiParam({ name: "id", description: "체크리스트 ID" })
  @ApiResponse({ status: 200, description: "삭제 성공" })
  @ApiResponse({ status: 404, description: "체크리스트를 찾을 수 없습니다." })
  async deleteChecklist(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.checklistService.deleteChecklist(id, req.user.id);
  }
}
