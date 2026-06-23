import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * WebSocket Event Payload DTOs — Chat namespace (`/chat`).
 *
 * 모든 `@SubscribeMessage` 핸들러는 inline 타입 대신 본 DTO 를 사용한다.
 * Gateway 레벨 `@UsePipes(ValidationPipe)` 와 결합하여 잘못된 페이로드를
 * 메서드 진입 전에 차단.
 */

export class WsRoomDto {
  @IsString({ message: "roomId 는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "roomId 는 비어있을 수 없습니다." })
  roomId!: string;
}

export class WsSendMessageDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsString()
  @IsNotEmpty({ message: "content 는 비어있을 수 없습니다." })
  @MaxLength(2000, { message: "메시지는 2000자를 넘을 수 없습니다." })
  content!: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsString({ message: "messageType 은 문자열이어야 합니다." })
  messageType?: string;
}

export class WsTypingDto {
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @IsBoolean({ message: "isTyping 은 boolean 이어야 합니다." })
  isTyping!: boolean;
}
