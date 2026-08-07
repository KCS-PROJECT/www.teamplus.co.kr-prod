import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateIf,
  IsDateString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// 화이트리스트 표시 위치 값
export const VALID_DISPLAY_LOCATIONS = [
  "app_home",
  "app_popup",
  "app_mypage",
  "web_home",
  "web_popup",
  "web_dashboard",
] as const;

export enum NoticeType {
  GENERAL = "general",
  IMPORTANT = "important",
  MAINTENANCE = "maintenance",
  EVENT = "event",
}

export class CreateNoticeDto {
  @ApiProperty({
    description: "공지사항 제목",
    example: "서비스 점검 안내",
    minLength: 2,
    maxLength: 200,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: "공지사항 내용",
    example: "2026년 1월 15일 02:00 ~ 06:00 서비스 점검이 예정되어 있습니다.",
    minLength: 10,
    maxLength: 10000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(10000, { message: "공지사항 내용은 10000자 이하여야 합니다." })
  content!: string;

  @ApiPropertyOptional({
    description: "공지사항 유형",
    enum: NoticeType,
    default: NoticeType.GENERAL,
  })
  @IsOptional()
  @IsEnum(NoticeType)
  type?: NoticeType;

  @ApiPropertyOptional({
    description: "점검 사유 (점검 공지 전용 · M4 화면 '점검사유' 행 표시)",
    example: "보안 업데이트",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  maintenanceReason?: string;

  @ApiPropertyOptional({
    description: "상단 고정 여부",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({
    description: "공개 여부",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description:
      "표시 위치 목록 (app_home|app_popup|app_mypage|web_home|web_popup|web_dashboard)",
    example: ["app_home", "web_home"],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  displayLocations?: string[];

  /**
   * 노출 기간 — **A군 절대 시점**(`SystemNotice.startAt`/`expiresAt` = `@db.Timestamptz(3)`).
   *
   * [2026-08-07] 규약(`CLAUDE_STANDARDS.md` ⏰ 시간 처리): 절대 시점은 **UTC ISO 로 주고받고**
   * KST 벽시계 ↔ 절대시각 변환은 **입력 화면이 담당**한다. date-only 계약은 `@db.Date`(B군) 전용이다.
   *   · 팀 공지 폼 — 날짜 선택 → KST 00:00 / 23:59:59.999 로 변환해 ISO 전송
   *   · 어드민 점검 공지 — 분 단위(datetime-local) 입력이 본질이라 ISO 여야 한다
   *
   * `null` 을 보내면 기간 해제(상시 노출) — 값을 지울 수 없던 문제(F-05) 해소.
   */
  @ApiPropertyOptional({
    description:
      "공지 노출 시작 시각 (ISO 8601 절대시각). 화면에서 KST 벽시계를 ISO 로 변환해 전송합니다. null 이면 시작 제한 없음.",
    example: "2026-03-05T15:00:00.000Z",
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsDateString({}, { message: "노출 시작 시각 형식이 올바르지 않습니다." })
  startDate?: string | null;

  @ApiPropertyOptional({
    description:
      "공지 노출 종료 시각 (ISO 8601 절대시각). 날짜 단위 종료는 화면에서 해당일 23:59:59.999 KST 로 변환해 전송합니다. null 이면 종료 제한 없음.",
    example: "2026-03-31T14:59:59.999Z",
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsDateString({}, { message: "노출 종료 시각 형식이 올바르지 않습니다." })
  endDate?: string | null;

  @ApiPropertyOptional({
    description:
      "타겟 출생연도 시작 (학년별 공지용, 예: 2015 → 초등 1학년 이상 포함)",
    example: 2015,
  })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2030)
  targetBirthYearFrom?: number;

  @ApiPropertyOptional({
    description: "타겟 출생연도 종료 (학년별 공지용, 예: 2020 → 5세 이하 포함)",
    example: 2020,
  })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2030)
  targetBirthYearTo?: number;

  /**
   * [Phase 0 · F-EX-04] nullable 계약 — `null`·`""`·공백은 모두 "전역(전체) 공지" 요청으로
   * 정규화되며 시스템 역할만 허용된다. 팀 스코프 작성자는 본인 관리 팀으로 자동 주입/검증된다.
   */
  @ApiPropertyOptional({
    description:
      "특정 팀 대상 공지 (teamId). null/빈 문자열은 전역(전체) 공지 요청이며 시스템 관리자만 허용됩니다.",
    example: "team-cuid-abc123",
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  targetTeamId?: string | null;
}
