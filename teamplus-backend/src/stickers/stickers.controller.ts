import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
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
import { StickersService } from "./stickers.service";
import { CreateStickerBoardDto } from "./dto/create-sticker-board.dto";
import { AwardStickerDto } from "./dto/award-sticker.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Stickers")
@Controller("api/v1/stickers")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class StickersController {
  constructor(private readonly stickersService: StickersService) {}

  /**
   * 스티커판 생성
   */
  @Post("boards")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "스티커판 생성",
    description:
      "아이에게 칭찬 스티커판을 생성합니다. goalCount개의 빈 슬롯이 함께 생성됩니다.",
  })
  @ApiResponse({ status: 201, description: "스티커판 생성 성공" })
  @ApiResponse({
    status: 404,
    description: "아이 또는 클럽을 찾을 수 없습니다.",
  })
  async createBoard(
    @Body() dto: CreateStickerBoardDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.stickersService.createBoard(dto, req.user.id);
  }

  /**
   * 아이의 스티커판 목록 조회
   */
  @Get("boards/child/:childId")
  @Roles("COACH", "DIRECTOR", "PARENT", "CHILD")
  @ApiOperation({
    summary: "아이의 스티커판 목록",
    description: "특정 아이의 스티커판 목록을 조회합니다.",
  })
  @ApiParam({ name: "childId", description: "아이 User ID" })
  @ApiResponse({ status: 200, description: "스티커판 목록 조회 성공" })
  async getBoardsByChild(@Param("childId") childId: string) {
    return this.stickersService.getBoardsByChild(childId);
  }

  /**
   * 스티커판 상세 + 슬롯 조회
   */
  @Get("boards/:boardId")
  @Roles("COACH", "DIRECTOR", "PARENT", "CHILD")
  @ApiOperation({
    summary: "스티커판 상세 조회",
    description: "스티커판 정보와 슬롯 목록을 조회합니다.",
  })
  @ApiParam({ name: "boardId", description: "스티커판 ID" })
  @ApiResponse({ status: 200, description: "스티커판 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "스티커판을 찾을 수 없습니다." })
  async getBoardDetail(@Param("boardId") boardId: string) {
    return this.stickersService.getBoardDetail(boardId);
  }

  /**
   * 스티커 부여
   */
  @Post("boards/:boardId/award")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "스티커 부여",
    description:
      "다음 빈 슬롯에 스티커를 부여합니다. 마지막 슬롯이면 자동 완료 처리됩니다.",
  })
  @ApiParam({ name: "boardId", description: "스티커판 ID" })
  @ApiResponse({ status: 200, description: "스티커 부여 성공" })
  @ApiResponse({ status: 404, description: "스티커판을 찾을 수 없습니다." })
  @ApiResponse({
    status: 409,
    description: "모든 슬롯이 이미 채워져 있습니다.",
  })
  async awardSticker(
    @Param("boardId") boardId: string,
    @Body() dto: AwardStickerDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.stickersService.awardSticker(boardId, dto, req.user.id);
  }

  /**
   * 스티커판 초기화
   */
  @Post("boards/:boardId/reset")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "스티커판 초기화",
    description: "스티커판의 모든 슬롯을 초기화합니다.",
  })
  @ApiParam({ name: "boardId", description: "스티커판 ID" })
  @ApiResponse({ status: 200, description: "스티커판 초기화 성공" })
  @ApiResponse({ status: 404, description: "스티커판을 찾을 수 없습니다." })
  async resetBoard(@Param("boardId") boardId: string) {
    return this.stickersService.resetBoard(boardId);
  }
}
