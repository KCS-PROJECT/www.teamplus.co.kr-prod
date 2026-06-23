import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

/**
 * 코치/감독 팀 Push 발송 DTO (POST /api/v1/notifications/team/:teamId/push)
 *
 * 발송 대상(userIds)은 서버에서 해당 팀의 멤버/학부모/매니저 풀에 속하는지 교차검증한다.
 * linkUrl 은 내부 경로(/ 로 시작)만 허용하여 외부 링크 주입을 차단한다.
 */
export class SendTeamPushDto {
  @ApiProperty({
    type: [String],
    description: "발송 대상 사용자 ID 목록 (팀 멤버/학부모/매니저)",
  })
  @IsArray()
  @ArrayNotEmpty({ message: "발송 대상을 1명 이상 선택해주세요." })
  @ArrayMaxSize(200, { message: "한 번에 최대 200명까지 발송할 수 있습니다." })
  @IsString({ each: true })
  userIds!: string[];

  @ApiProperty({ maxLength: 50, description: "알림 제목" })
  @IsString()
  @IsNotEmpty({ message: "제목을 입력해주세요." })
  @MaxLength(50, { message: "제목은 50자 이내여야 합니다." })
  title!: string;

  @ApiProperty({ maxLength: 200, description: "알림 본문" })
  @IsString()
  @IsNotEmpty({ message: "내용을 입력해주세요." })
  @MaxLength(200, { message: "내용은 200자 이내여야 합니다." })
  message!: string;

  @ApiPropertyOptional({
    maxLength: 300,
    description: "알림 탭 시 이동할 내부 경로 (/ 로 시작)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/[^\s]*$/, {
    message: "linkUrl 은 내부 경로(/로 시작)만 허용됩니다.",
  })
  linkUrl?: string;
}
