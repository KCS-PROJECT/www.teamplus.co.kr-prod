import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * WebSocket Event Payload DTOs — Notifications namespace (`/notifications`).
 *
 * 모든 `@SubscribeMessage` 핸들러는 inline 타입 대신 본 DTO 를 사용한다.
 * Gateway 레벨 `@UsePipes(ValidationPipe)` 와 결합하여 잘못된 페이로드를
 * 메서드 진입 전에 차단.
 */

export class WsMarkAsReadDto {
  @IsString({ message: "notificationId 는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "notificationId 는 비어있을 수 없습니다." })
  notificationId!: string;
}

/**
 * Ref 룸 join/leave 요청 — Phase 2.2 SPEC §4.3
 *
 * 클라이언트가 `${refType}:${refId}` 룸에 가입하여 파일 업로드 이벤트(file:created/updated/deleted)를
 * 수신할 수 있도록 함. 룸 이름은 백엔드에서 일관 표준화하므로 클라이언트는 raw refType + refId 만 전달.
 */
export class WsRefRoomDto {
  @IsString({ message: "refType 은 문자열이어야 합니다." })
  @IsNotEmpty({ message: "refType 은 비어있을 수 없습니다." })
  @MaxLength(50, { message: "refType 은 50자를 초과할 수 없습니다." })
  refType!: string;

  @IsString({ message: "refId 는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "refId 는 비어있을 수 없습니다." })
  @MaxLength(100, { message: "refId 는 100자를 초과할 수 없습니다." })
  refId!: string;
}

/**
 * Ref 룸 leave 요청 (단일 또는 일괄). join 과 동일한 구조를 사용.
 */
export class WsRefRoomLeaveDto extends WsRefRoomDto {
  @IsOptional()
  @IsString()
  // 향후 확장 여지 (e.g. 클라이언트 ID), 현재 미사용
  readonly _placeholder?: string;
}
