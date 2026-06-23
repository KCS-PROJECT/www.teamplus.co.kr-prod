import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsNumber,
  IsPositive,
  IsIn,
  IsBoolean,
  IsArray,
  ArrayUnique,
  Matches,
  Min,
  Max,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

// ==================== Shared Enums ====================

export const MATCH_STATUSES = [
  "scheduled",
  "warmup",
  "in_progress",
  "intermission",
  "completed",
  "postponed",
  "cancelled",
] as const;

export const MATCH_EVENT_TYPES = [
  "goal",
  "assist",
  "penalty",
  "shot",
  "save",
  "timeout",
  "period_start",
  "period_end",
] as const;

export const PENALTY_TYPES = [
  "minor",
  "major",
  "misconduct",
  "game_misconduct",
] as const;

// ==================== Tournament DTOs ====================

export class CreateTournamentDto {
  @ApiProperty({ description: "대회 이름", example: "2026 봄 시즌 토너먼트" })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: "대회 설명" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "주최 클럽 ID" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: "링크 ID" })
  @IsOptional()
  @IsString()
  rinkId?: string;

  @ApiPropertyOptional({ description: "개최 링크장 ID (Venue FK)" })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiProperty({ description: "시작 날짜", example: "2026-04-01T09:00:00Z" })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: "종료 날짜", example: "2026-04-03T18:00:00Z" })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({
    description: "상태",
    enum: ["scheduled", "ongoing", "finished", "cancelled"],
    default: "scheduled",
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: "참가 자격 출생연도 시작 (포함)",
    example: 2014,
  })
  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2030)
  @Type(() => Number)
  eligibleBirthYearFrom?: number;

  @ApiPropertyOptional({
    description: "참가 자격 출생연도 종료 (포함)",
    example: 2016,
  })
  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2030)
  @Type(() => Number)
  eligibleBirthYearTo?: number;

  @ApiPropertyOptional({
    description:
      "참가 자격 출생연도 개별 목록(SoT). 비연속 선택 가능. 비어있으면([]) eligibleBirthYearFrom/To 범위로 폴백. from/to 는 서버에서 이 값의 min/max 로 자동 파생.",
    type: [Number],
    example: [2014, 2016, 2019],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1990, { each: true })
  @Max(2030, { each: true })
  @ArrayUnique()
  @Type(() => Number)
  eligibleBirthYears?: number[];

  @ApiPropertyOptional({ description: "경기당 참가비 (원)", example: 30000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  feePerGame?: number;

  @ApiPropertyOptional({ description: "총 경기 수", example: 3 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  totalGames?: number;

  @ApiPropertyOptional({
    description: "참가비 유형",
    enum: ["PER_GAME", "TOTAL_FIXED"],
    example: "PER_GAME",
  })
  @IsOptional()
  @IsIn(["PER_GAME", "TOTAL_FIXED"])
  feeType?: string;

  @ApiPropertyOptional({ description: "최대 참가 인원", example: 50 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  maxParticipants?: number;

  @ApiPropertyOptional({
    description: "등록 마감일",
    example: "2026-03-25T23:59:59Z",
  })
  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @ApiPropertyOptional({
    description: "참가 연령 그룹",
    enum: ["ALL", "U8", "U9", "U10", "U11", "U12"],
    example: "U10",
  })
  @IsOptional()
  @IsIn(["ALL", "U8", "U9", "U10", "U11", "U12"])
  ageGroup?: "ALL" | "U8" | "U9" | "U10" | "U11" | "U12";

  @ApiPropertyOptional({
    description: "사전 선택한 참가 선수 User.id 리스트",
    type: [String],
    example: ["user_abc", "user_def"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  selectedParticipantIds?: string[];

  @ApiPropertyOptional({
    description: "참가 자격 팀 하위그룹(TeamGroup) ID 리스트",
    type: [String],
    example: ["group_abc", "group_def"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  eligibleGroupIds?: string[];

  // [추가 2026-05-15 db-keeper] T03/H2 — 대회 정보 페이지 노출 필드.
  @ApiPropertyOptional({
    description: "대회 규정 (자유 텍스트)",
    example: "1피리어드 12분 / 3피리어드 / 페널티 룰: USA Hockey U10",
  })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional({
    description: "추가 장소 정보 (rink.location 외 보조 안내)",
    example: "강남 빙상장 제2 링크",
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: "상금 (원)",
    example: 1000000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  prizeAmount?: number;

  @ApiPropertyOptional({
    description:
      "결제 모드 — PREPAID(선불, 신청 시 결제) | POSTPAID(후불, 종료 후 일괄 청구)",
    enum: ["PREPAID", "POSTPAID"],
    default: "PREPAID",
  })
  @IsOptional()
  @IsIn(["PREPAID", "POSTPAID"])
  billingMode?: string;
}

export class UpdateTournamentDto {
  @ApiPropertyOptional({ description: "대회 이름" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: "대회 설명" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "주최 클럽 ID" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: "링크 ID" })
  @IsOptional()
  @IsString()
  rinkId?: string;

  @ApiPropertyOptional({ description: "개최 링크장 ID (Venue FK)" })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiPropertyOptional({ description: "시작 날짜" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "종료 날짜" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: "상태",
    enum: ["scheduled", "ongoing", "finished", "cancelled"],
  })
  @IsOptional()
  @IsString()
  status?: string;

  // [수정 2026-05-15 db-keeper] T02/T04 협업 — ageGroup=ALL 변경 시
  //  birth year 도 명시적으로 NULL 로 보낼 수 있도록 nullable 허용.
  //  null 값일 때는 @IsInt 검증을 건너뛰고 통과 (ValidateIf).
  @ApiPropertyOptional({
    description: "참가 자격 출생연도 시작 (null 명시 시 제한 해제)",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1990)
  @Max(2030)
  @Type(() => Number)
  eligibleBirthYearFrom?: number | null;

  @ApiPropertyOptional({
    description: "참가 자격 출생연도 종료 (null 명시 시 제한 해제)",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1990)
  @Max(2030)
  @Type(() => Number)
  eligibleBirthYearTo?: number | null;

  @ApiPropertyOptional({
    description:
      "참가 자격 출생연도 개별 목록(SoT). 비연속 선택 가능. 미전송 시 기존 배열 보존(보존 가드). 비어있으면([]) from/to 범위로 폴백. from/to 는 서버에서 min/max 로 자동 파생.",
    type: [Number],
    example: [2014, 2016, 2019],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1990, { each: true })
  @Max(2030, { each: true })
  @ArrayUnique()
  @Type(() => Number)
  eligibleBirthYears?: number[];

  @ApiPropertyOptional({ description: "경기당 참가비 (원)" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  feePerGame?: number;

  @ApiPropertyOptional({ description: "총 경기 수" })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  totalGames?: number;

  @ApiPropertyOptional({
    description: "참가비 유형",
    enum: ["PER_GAME", "TOTAL_FIXED"],
  })
  @IsOptional()
  @IsIn(["PER_GAME", "TOTAL_FIXED"])
  feeType?: string;

  @ApiPropertyOptional({ description: "최대 참가 인원" })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  maxParticipants?: number;

  @ApiPropertyOptional({ description: "등록 마감일" })
  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @ApiPropertyOptional({
    description: "참가 연령 그룹",
    enum: ["ALL", "U8", "U9", "U10", "U11", "U12"],
  })
  @IsOptional()
  @IsIn(["ALL", "U8", "U9", "U10", "U11", "U12"])
  ageGroup?: "ALL" | "U8" | "U9" | "U10" | "U11" | "U12";

  @ApiPropertyOptional({
    description: "사전 선택한 참가 선수 User.id 리스트",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  selectedParticipantIds?: string[];

  @ApiPropertyOptional({
    description: "참가 자격 팀 하위그룹(TeamGroup) ID 리스트",
    type: [String],
    example: ["group_abc", "group_def"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  eligibleGroupIds?: string[];

  // [추가 2026-05-15 db-keeper] T03/H2 — 대회 정보 페이지 노출 필드.
  @ApiPropertyOptional({ description: "대회 규정 (자유 텍스트)" })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional({ description: "추가 장소 정보" })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ description: "상금 (원)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  prizeAmount?: number;

  @ApiPropertyOptional({
    description:
      "결제 모드 — PREPAID(선불, 신청 시 결제) | POSTPAID(후불, 종료 후 일괄 청구)",
    enum: ["PREPAID", "POSTPAID"],
  })
  @IsOptional()
  @IsIn(["PREPAID", "POSTPAID"])
  billingMode?: string;
}

// ==================== Tournament Settlement DTO ====================

export class ConfirmTournamentSettlementDto {
  @ApiProperty({
    description: "후불 대회 1인당 참가비 (원) — 참가자 전원 동일 단가 일괄 청구",
    example: 30000,
  })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  feePerPerson!: number;
}

// ==================== Tournament Status DTO ====================

export class ChangeTournamentStatusDto {
  @ApiProperty({
    description: "변경할 상태",
    example: "ACTIVE",
    enum: [
      "DRAFT",
      "ACTIVE",
      "REGISTRATION_OPEN",
      "REGISTRATION_CLOSED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ],
  })
  @IsString()
  @IsIn([
    "DRAFT",
    "ACTIVE",
    "REGISTRATION_OPEN",
    "REGISTRATION_CLOSED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ])
  status!: string;
}

// ==================== Tournament Registration DTOs ====================

export class RegisterTournamentDto {
  @ApiPropertyOptional({ description: "자녀 User ID (자녀 대신 등록 시)" })
  @IsOptional()
  @IsString()
  childId?: string;

  @ApiProperty({ description: "참가 경기 수", example: 3 })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  gamesCount!: number;
}

export class FeePreviewDto {
  @ApiProperty({ description: "참가 경기 수", example: 3 })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  gamesCount!: number;
}

// ==================== Match DTOs ====================

export class CreateMatchDto {
  @ApiPropertyOptional({ description: "토너먼트 ID" })
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @ApiPropertyOptional({ description: "링크 ID" })
  @IsOptional()
  @IsString()
  rinkId?: string;

  @ApiPropertyOptional({ description: "경기장 ID" })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiPropertyOptional({ description: "홈 클럽 ID" })
  @IsOptional()
  @IsString()
  homeClubId?: string;

  @ApiPropertyOptional({ description: "어웨이 클럽 ID" })
  @IsOptional()
  @IsString()
  awayClubId?: string;

  @ApiPropertyOptional({ description: "홈 팀 ID" })
  @IsOptional()
  @IsString()
  homeTeamId?: string;

  @ApiPropertyOptional({ description: "어웨이 팀 ID" })
  @IsOptional()
  @IsString()
  awayTeamId?: string;

  @ApiPropertyOptional({
    description: "상대팀 자유 텍스트 — 등록 팀(awayTeamId) 없이 직접 입력",
    example: "강남 아이스하키 클럽",
  })
  @IsOptional()
  @IsString()
  opponentName?: string;

  @ApiProperty({
    description: "경기 예정 시간",
    example: "2026-04-01T14:00:00Z",
  })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({
    description: "라운드",
    enum: ["group", "quarter", "semi", "final"],
  })
  @IsOptional()
  @IsString()
  round?: string;

  @ApiPropertyOptional({ description: "경기 순서" })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  matchOrder?: number;

  @ApiPropertyOptional({ description: "일정별 참가비 (원) — null/0=무료", example: 15000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fee?: number;

  @ApiPropertyOptional({ description: "주심" })
  @IsOptional()
  @IsString()
  refereeMain?: string;

  @ApiPropertyOptional({ description: "부심" })
  @IsOptional()
  @IsString()
  refereeLines?: string;
}

// NOTE: UpdateMatchDto below. Live-state/Event/Period DTOs are appended at EOF.
export class UpdateMatchDto {
  @ApiPropertyOptional({ description: "링크 ID" })
  @IsOptional()
  @IsString()
  rinkId?: string;

  @ApiPropertyOptional({ description: "경기장 ID" })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiPropertyOptional({ description: "홈 클럽 ID" })
  @IsOptional()
  @IsString()
  homeClubId?: string;

  @ApiPropertyOptional({ description: "어웨이 클럽 ID" })
  @IsOptional()
  @IsString()
  awayClubId?: string;

  @ApiPropertyOptional({ description: "홈 팀 ID" })
  @IsOptional()
  @IsString()
  homeTeamId?: string;

  @ApiPropertyOptional({ description: "어웨이 팀 ID" })
  @IsOptional()
  @IsString()
  awayTeamId?: string;

  @ApiPropertyOptional({
    description: "상대팀 자유 텍스트 — 등록 팀(awayTeamId) 없이 직접 입력",
    example: "강남 아이스하키 클럽",
  })
  @IsOptional()
  @IsString()
  opponentName?: string;

  @ApiPropertyOptional({ description: "경기 예정 시간" })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: "경기 시작 시간" })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ description: "경기 종료 시간" })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ description: "홈 스코어" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  homeScore?: number;

  @ApiPropertyOptional({ description: "어웨이 스코어" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  awayScore?: number;

  @ApiPropertyOptional({
    description: "경기 상태",
    enum: [
      "scheduled",
      "warmup",
      "in_progress",
      "intermission",
      "completed",
      "postponed",
      "cancelled",
    ],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: "현재 피리어드 (1~5)" })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  currentPeriod?: number;

  @ApiPropertyOptional({
    description: "라운드",
    enum: ["group", "quarter", "semi", "final"],
  })
  @IsOptional()
  @IsString()
  round?: string;

  @ApiPropertyOptional({ description: "경기 순서" })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  matchOrder?: number;

  @ApiPropertyOptional({ description: "일정별 참가비 (원) — null/0=무료", example: 15000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fee?: number;

  @ApiPropertyOptional({ description: "주심" })
  @IsOptional()
  @IsString()
  refereeMain?: string;

  @ApiPropertyOptional({ description: "부심" })
  @IsOptional()
  @IsString()
  refereeLines?: string;
}

// ==================== Match Live-State DTOs ====================

export class UpdateMatchScoreDto {
  @ApiProperty({ description: "홈 스코어", example: 3 })
  @IsInt()
  @Min(0)
  @Max(99)
  @Type(() => Number)
  homeScore!: number;

  @ApiProperty({ description: "어웨이 스코어", example: 2 })
  @IsInt()
  @Min(0)
  @Max(99)
  @Type(() => Number)
  awayScore!: number;
}

export class UpdateMatchLiveStateDto {
  @ApiProperty({
    description: "경기 상태",
    enum: MATCH_STATUSES,
    example: "in_progress",
  })
  @IsString()
  @IsIn(MATCH_STATUSES as readonly string[])
  status!: string;

  @ApiPropertyOptional({ description: "현재 피리어드 (1~5)", example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  currentPeriod?: number;

  @ApiPropertyOptional({ description: "경기 시작 시각" })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ description: "경기 종료 시각" })
  @IsOptional()
  @IsDateString()
  endedAt?: string;
}

// ==================== Match Period DTO ====================

export class UpsertMatchPeriodDto {
  @ApiProperty({ description: "피리어드 번호 (1~5)", example: 1 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  periodNumber!: number;

  @ApiPropertyOptional({ description: "피리어드 시작 시각" })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ description: "피리어드 종료 시각" })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ description: "홈 팀 피리어드 스코어" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  homeScore?: number;

  @ApiPropertyOptional({ description: "어웨이 팀 피리어드 스코어" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  awayScore?: number;

  @ApiPropertyOptional({ description: "홈 팀 페널티 분" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  homePenaltyMinutes?: number;

  @ApiPropertyOptional({ description: "어웨이 팀 페널티 분" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  awayPenaltyMinutes?: number;
}

// ==================== Match Event DTOs ====================

export class CreateMatchEventDto {
  @ApiProperty({ description: "피리어드 번호 (1~5)", example: 2 })
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  periodNumber!: number;

  @ApiProperty({ description: "이벤트 시간 (MM:SS)", example: "12:45" })
  @IsString()
  @Matches(/^[0-9]{1,2}:[0-5][0-9]$/, {
    message: "이벤트 시간은 MM:SS 형식이어야 합니다.",
  })
  eventTime!: string;

  @ApiProperty({
    description: "이벤트 타입",
    enum: MATCH_EVENT_TYPES,
    example: "goal",
  })
  @IsString()
  @IsIn(MATCH_EVENT_TYPES as readonly string[])
  eventType!: string;

  @ApiPropertyOptional({ description: "팀 ID (홈 또는 어웨이)" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: "선수 ID (TeamRoster.id)" })
  @IsOptional()
  @IsString()
  playerId?: string;

  @ApiPropertyOptional({ description: "어시스트 1 선수 ID" })
  @IsOptional()
  @IsString()
  assistPlayer1Id?: string;

  @ApiPropertyOptional({ description: "어시스트 2 선수 ID" })
  @IsOptional()
  @IsString()
  assistPlayer2Id?: string;

  @ApiPropertyOptional({ description: "페널티 타입", enum: PENALTY_TYPES })
  @IsOptional()
  @IsIn(PENALTY_TYPES as readonly string[])
  penaltyType?: string;

  @ApiPropertyOptional({ description: "페널티 분" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  penaltyMinutes?: number;

  @ApiPropertyOptional({ description: "설명" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "결승골 여부" })
  @IsOptional()
  @IsBoolean()
  isGameWinner?: boolean;

  @ApiPropertyOptional({ description: "파워플레이 득점 여부" })
  @IsOptional()
  @IsBoolean()
  isPowerPlay?: boolean;

  @ApiPropertyOptional({ description: "쇼트핸디드 득점 여부" })
  @IsOptional()
  @IsBoolean()
  isShortHanded?: boolean;
}

export class UpdateMatchEventDto {
  @ApiPropertyOptional({ description: "피리어드 번호 (1~5)" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  periodNumber?: number;

  @ApiPropertyOptional({ description: "이벤트 시간 (MM:SS)" })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{1,2}:[0-5][0-9]$/, {
    message: "이벤트 시간은 MM:SS 형식이어야 합니다.",
  })
  eventTime?: string;

  @ApiPropertyOptional({ description: "이벤트 타입", enum: MATCH_EVENT_TYPES })
  @IsOptional()
  @IsIn(MATCH_EVENT_TYPES as readonly string[])
  eventType?: string;

  @ApiPropertyOptional({ description: "팀 ID" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: "선수 ID (TeamRoster.id)" })
  @IsOptional()
  @IsString()
  playerId?: string;

  @ApiPropertyOptional({ description: "어시스트 1 선수 ID" })
  @IsOptional()
  @IsString()
  assistPlayer1Id?: string;

  @ApiPropertyOptional({ description: "어시스트 2 선수 ID" })
  @IsOptional()
  @IsString()
  assistPlayer2Id?: string;

  @ApiPropertyOptional({ description: "페널티 타입", enum: PENALTY_TYPES })
  @IsOptional()
  @IsIn(PENALTY_TYPES as readonly string[])
  penaltyType?: string;

  @ApiPropertyOptional({ description: "페널티 분" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  @Type(() => Number)
  penaltyMinutes?: number;

  @ApiPropertyOptional({ description: "설명" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "결승골 여부" })
  @IsOptional()
  @IsBoolean()
  isGameWinner?: boolean;

  @ApiPropertyOptional({ description: "파워플레이 득점 여부" })
  @IsOptional()
  @IsBoolean()
  isPowerPlay?: boolean;

  @ApiPropertyOptional({ description: "쇼트핸디드 득점 여부" })
  @IsOptional()
  @IsBoolean()
  isShortHanded?: boolean;
}
