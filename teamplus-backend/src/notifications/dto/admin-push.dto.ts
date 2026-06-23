import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

/**
 * 관리자 Push 발송 DTO (POST /api/v1/notifications/admin/push)
 *
 * 기존 인라인 body 타입을 class-validator DTO 로 전환하여 ValidationPipe(whitelist)
 * 가 동작하도록 한다. title/bodyText 의 길이·빈값을 서버에서 검증한다.
 */
export class AdminPushDto {
  @ApiProperty({ description: "알림 제목", maxLength: 50 })
  @IsString()
  @IsNotEmpty({ message: "제목을 입력해주세요." })
  @MaxLength(50, { message: "제목은 50자 이내여야 합니다." })
  title!: string;

  @ApiProperty({ description: "알림 본문", maxLength: 200 })
  @IsString()
  @IsNotEmpty({ message: "본문을 입력해주세요." })
  @MaxLength(200, { message: "본문은 200자 이내여야 합니다." })
  bodyText!: string;

  @ApiProperty({
    description: "발송 대상 유형",
    enum: ["all", "role", "specific"],
  })
  @IsIn(["all", "role", "specific"], {
    message: "targetType 은 all|role|specific 이어야 합니다.",
  })
  targetType!: "all" | "role" | "specific";

  @ApiPropertyOptional({ description: "대상 역할 (targetType=role 일 때 필수)" })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: "대상 사용자 ID 목록 (targetType=specific 일 때 필수)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @ApiPropertyOptional({
    description: "광고성 메시지 여부 (true 시 야간 발송 제한 + 수신거부 제외)",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isMarketing?: boolean;
}
