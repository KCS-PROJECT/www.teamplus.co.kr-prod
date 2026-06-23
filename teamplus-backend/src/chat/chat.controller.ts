import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common";

import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { ChatService } from "./chat.service";
import { CreateChatRoomDto, SendMessageDto } from "./dto/create-room.dto";
import { RolesGuard } from "@/auth/roles.guard";
import { Roles } from "@/auth/roles.decorator";

@ApiTags("Chat")
@Controller("api/v1/chat")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 채팅 — 인증된 모든 사용자 접근.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * 내 채팅방 목록 조회
   */
  @Get("rooms")
  @ApiOperation({
    summary: "채팅방 목록 조회",
    description: "로그인 사용자의 채팅방 목록을 최근 메시지 순으로 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "채팅방 목록 조회 성공" })
  async getMyChatRooms(@Request() req: AuthenticatedRequest) {
    return this.chatService.getMyChatRooms(req.user.id);
  }

  /**
   * 채팅방 생성
   */
  @Post("rooms")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "채팅방 생성",
    description:
      "1:1 또는 그룹 채팅방을 생성합니다. 1:1 채팅방이 이미 존재하면 기존 방 ID를 반환합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "채팅방 생성 완료 (또는 기존 방 반환)",
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않은 입력 (DIRECT 채팅 멤버 수 오류 등)",
  })
  @ApiResponse({ status: 404, description: "존재하지 않는 사용자 포함" })
  async createChatRoom(
    @Body() dto: CreateChatRoomDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.chatService.createChatRoom(dto, req.user.id);
  }

  /**
   * 채팅방 단일 조회
   */
  @Get("rooms/:roomId")
  @ApiOperation({
    summary: "채팅방 상세 정보",
    description: "채팅방 정보 및 온라인 상태를 조회합니다.",
  })
  @ApiParam({ name: "roomId", description: "채팅방 ID" })
  @ApiResponse({ status: 200, description: "채팅방 정보 조회 성공" })
  @ApiResponse({ status: 403, description: "해당 채팅방의 멤버가 아닙니다." })
  async getRoomById(
    @Param("roomId") roomId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.chatService.getRoomById(roomId, req.user.id);
  }

  /**
   * 채팅방 나가기
   */
  @Post("rooms/:roomId/leave")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "채팅방 나가기",
    description: "채팅방 멤버십을 비활성화합니다.",
  })
  @ApiParam({ name: "roomId", description: "채팅방 ID" })
  @ApiResponse({ status: 200, description: "채팅방을 나갔습니다." })
  @ApiResponse({ status: 403, description: "해당 채팅방의 멤버가 아닙니다." })
  async leaveRoom(
    @Param("roomId") roomId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.chatService.leaveRoom(roomId, req.user.id);
  }

  /**
   * 알림 설정 토글
   */
  @Patch("rooms/:roomId/notification")
  @ApiOperation({
    summary: "채팅방 알림 토글",
    description: "채팅방 알림을 켜거나 끕니다.",
  })
  @ApiParam({ name: "roomId", description: "채팅방 ID" })
  @ApiResponse({ status: 200, description: "알림 설정이 변경되었습니다." })
  @ApiResponse({ status: 403, description: "해당 채팅방의 멤버가 아닙니다." })
  async toggleNotification(
    @Param("roomId") roomId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.chatService.toggleNotification(roomId, req.user.id);
  }

  /**
   * 채팅 메시지 목록 조회 (무한 스크롤)
   */
  @Get("rooms/:roomId/messages")
  @ApiOperation({
    summary: "채팅 메시지 목록",
    description:
      "채팅방의 메시지를 최신순으로 조회합니다. cursor 기반 페이지네이션.",
  })
  @ApiParam({ name: "roomId", description: "채팅방 ID" })
  @ApiQuery({
    name: "cursor",
    required: false,
    description: "이전 페이지 마지막 메시지 createdAt ISO 문자열",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "조회 개수 (기본 30, 최대 50)",
  })
  @ApiResponse({ status: 200, description: "메시지 목록 조회 성공" })
  @ApiResponse({ status: 403, description: "해당 채팅방의 멤버가 아닙니다." })
  async getMessages(
    @Param("roomId") roomId: string,
    @Request() req: AuthenticatedRequest,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = Math.min(parseInt(limit ?? "30", 10) || 30, 50);
    return this.chatService.getMessages(
      roomId,
      req.user.id,
      cursor,
      parsedLimit,
    );
  }

  /**
   * 메시지 전송 (REST 폴백 - WebSocket 미지원 환경)
   */
  @Post("rooms/:roomId/messages")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "메시지 전송 (REST)",
    description:
      "채팅 메시지를 전송합니다. WebSocket 미지원 환경에서 사용하세요.",
  })
  @ApiParam({ name: "roomId", description: "채팅방 ID" })
  @ApiResponse({ status: 201, description: "메시지 전송 성공" })
  @ApiResponse({ status: 403, description: "해당 채팅방의 멤버가 아닙니다." })
  async sendMessage(
    @Param("roomId") roomId: string,
    @Body() dto: SendMessageDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.chatService.sendMessage(roomId, req.user.id, dto);
  }

  /**
   * 파일 업로드 (이미지/첨부파일)
   */
  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "파일 업로드",
    description:
      "채팅 첨부파일을 업로드합니다. 최대 10MB, 이미지/문서 형식 지원.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        roomId: { type: "string", description: "채팅방 ID" },
      },
    },
  })
  @ApiResponse({ status: 201, description: "파일 업로드 성공" })
  @ApiResponse({
    status: 400,
    description: "파일 없음 또는 허용되지 않는 형식",
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "./uploads/chat",
        filename: (_req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (_req, file, cb) => {
        const allowedExt = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|zip|mp4)$/i;
        if (!allowedExt.test(file.originalname)) {
          return cb(
            new BadRequestException(
              "허용되지 않는 파일 형식입니다. (jpg/png/gif/webp/pdf/doc/docx/zip/mp4)",
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException("파일이 없습니다.");
    }
    const baseUrl =
      process.env.BACKEND_URL ??
      `http://localhost:${process.env.BACKEND_PORT ?? 4001}`;
    const url = `${baseUrl}/uploads/chat/${file.filename}`;
    void req; // userId 로깅 목적 (미래 감사 로그용)

    return {
      success: true,
      data: {
        url,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      },
    };
  }
}
