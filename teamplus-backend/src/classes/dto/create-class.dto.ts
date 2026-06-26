import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  Matches,
  ValidateNested,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const DAY_OF_WEEK_VALUES = ["월", "화", "수", "목", "금", "토", "일"] as const;
const TIME_HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 요일별 시간·장소 항목 — ClassDaySchedule 행 1개에 대응.
 * `daySchedules` 배열의 원소.
 */
export class DayScheduleItemDto {
  @ApiProperty({
    example: "월",
    description: "요일 (월|화|수|목|금|토|일)",
    enum: DAY_OF_WEEK_VALUES,
  })
  @IsIn(DAY_OF_WEEK_VALUES, { message: "요일은 월·화·수·목·금·토·일 중 하나여야 합니다." })
  dayOfWeek!: string;

  @ApiProperty({
    example: "17:00",
    description: "시작 시간 (HH:mm 24시간 형식)",
  })
  @Matches(TIME_HH_MM_PATTERN, { message: "시작 시간은 HH:mm 형식이어야 합니다. (예: 17:00)" })
  startTime!: string;

  @ApiProperty({
    example: "18:30",
    description: "종료 시간 (HH:mm 24시간 형식)",
  })
  @Matches(TIME_HH_MM_PATTERN, { message: "종료 시간은 HH:mm 형식이어야 합니다. (예: 18:30)" })
  endTime!: string;

  @ApiPropertyOptional({
    example: "venue-cuid-abc123",
    description: "이 요일에 사용할 장소 ID (미입력 시 수업 기본 장소 사용)",
  })
  @IsOptional()
  @IsString({ message: "장소 ID는 문자열이어야 합니다." })
  venueId?: string;
}

/**
 * [2026-06-09] 오픈클래스(academy) 날짜별 일정 1건 — 미니달력으로 날짜 선택 + 시간 + 장소.
 *   각 원소는 ClassSchedule(scheduledDate + startTime/endTime/venueId)로 저장된다.
 */
export class DateScheduleItemDto {
  @ApiProperty({ example: "2026-06-15", description: "수업 날짜 (YYYY-MM-DD)" })
  @IsString({ message: "날짜는 문자열이어야 합니다." })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "날짜는 YYYY-MM-DD 형식이어야 합니다." })
  date!: string;

  @ApiProperty({ example: "17:00", description: "시작 시간 (HH:mm)" })
  @Matches(TIME_HH_MM_PATTERN, { message: "시작 시간은 HH:mm 형식이어야 합니다." })
  startTime!: string;

  @ApiProperty({ example: "18:30", description: "종료 시간 (HH:mm)" })
  @Matches(TIME_HH_MM_PATTERN, { message: "종료 시간은 HH:mm 형식이어야 합니다." })
  endTime!: string;

  @ApiPropertyOptional({ example: "venue-cuid", description: "장소 ID" })
  @IsOptional()
  @IsString({ message: "장소 ID는 문자열이어야 합니다." })
  venueId?: string;
}

/**
 * classes 도메인 trainingType — SoT: get-classes-query.dto.ts.
 *   - regular: 팀 정기 수업
 *   - lesson:  오픈클래스 레슨 (academyId 기반)
 */
const CLASSES_TRAINING_TYPES = ["regular", "lesson"] as const;

export class CreateClassDto {
  @ApiProperty({
    example: "신규 수강생반",
    description: "수업 이름",
  })
  @IsNotEmpty({ message: "수업 이름은 필수입니다." })
  @IsString({ message: "수업 이름은 문자열이어야 합니다." })
  className!: string;

  @ApiPropertyOptional({
    example: "아이스하키 입문 수업",
    description: "수업 설명",
  })
  @IsOptional()
  @IsString({ message: "수업 설명은 문자열이어야 합니다." })
  description?: string;

  // [2026-06-04] 강사명/정원 입력란을 수업등록 폼에서 제거 — 선택 항목으로 완화.
  //   미입력 시 강사명은 빈 문자열, 정원은 0(무제한 의미)으로 저장된다.
  @ApiPropertyOptional({
    example: "김철수",
    description: "강사 이름 (선택 — 미입력 시 빈 값)",
  })
  @IsOptional()
  @IsString({ message: "강사 이름은 문자열이어야 합니다." })
  instructorName?: string;

  @ApiPropertyOptional({
    example: 15,
    description: "정원 (선택 — 미입력/0 은 무제한)",
  })
  @IsOptional()
  @IsNumber({}, { message: "정원은 숫자여야 합니다." })
  @Min(0, { message: "정원은 0명 이상이어야 합니다." })
  capacity?: number;

  @ApiPropertyOptional({
    example: 7,
    description: "최소 연령",
  })
  @IsOptional()
  @IsNumber({}, { message: "최소 연령은 숫자여야 합니다." })
  @Min(0, { message: "최소 연령은 0 이상이어야 합니다." })
  @Max(100, { message: "최소 연령은 100 이하여야 합니다." })
  ageMin?: number;

  @ApiPropertyOptional({
    example: 12,
    description: "최대 연령",
  })
  @IsOptional()
  @IsNumber({}, { message: "최대 연령은 숫자여야 합니다." })
  @Min(0, { message: "최대 연령은 0 이상이어야 합니다." })
  @Max(100, { message: "최대 연령은 100 이하여야 합니다." })
  ageMax?: number;

  @ApiPropertyOptional({
    example: [2015, 2017, 2019],
    description:
      "대상 출생연도 개별 목록(SoT). 비연속 선택 가능. 빈 배열/미전송 = 전 연령 대상. ageMin/ageMax 는 서버에서 이 값의 한국나이 min/max 로 자동 파생.",
    type: [Number],
  })
  @IsOptional()
  @IsArray({ message: "대상 출생연도는 배열이어야 합니다." })
  @IsInt({ each: true, message: "대상 출생연도는 정수여야 합니다." })
  @Min(1900, { each: true, message: "대상 출생연도가 올바르지 않습니다." })
  @Max(2200, { each: true, message: "대상 출생연도가 올바르지 않습니다." })
  targetBirthYears?: number[];

  @ApiPropertyOptional({
    example: "beginner",
    description: "필요 레벨 (beginner|intermediate|advanced)",
  })
  @IsOptional()
  @IsString({ message: "필요 레벨은 문자열이어야 합니다." })
  levelRequired?: string;

  @ApiPropertyOptional({
    example: "2026-01-04T16:00:00Z",
    description: "시작 시간 (ISO 8601 또는 Date)",
  })
  @IsOptional()
  startTime?: Date;

  @ApiPropertyOptional({
    example: "2026-01-04T17:00:00Z",
    description: "종료 시간 (ISO 8601 또는 Date)",
  })
  @IsOptional()
  endTime?: Date;

  @ApiPropertyOptional({ description: "활성화 상태" })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      "수업 유형 (regular: 정규 수업 | lesson: 오픈클래스 레슨)",
    enum: CLASSES_TRAINING_TYPES,
    example: "regular",
  })
  @IsOptional()
  @IsString()
  @IsIn(CLASSES_TRAINING_TYPES, {
    message: "수업 유형은 regular/lesson 중 하나여야 합니다.",
  })
  trainingType?: string;

  @ApiPropertyOptional({ description: "담당 코치 ID" })
  @IsOptional()
  @IsString()
  coachId?: string;

  @ApiPropertyOptional({ description: "훈련 장소 ID" })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiPropertyOptional({
    description: "수업 요일 배열",
    example: '["월","수","금"]',
  })
  @IsOptional()
  @IsArray()
  classDays?: string[];

  @ApiPropertyOptional({ description: "카테고리 (KIDS|JUNIOR|ADULT)" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description:
      "결제 방식 — PREPAID(선불 번들) | POSTPAID(후불 정산) | BOTH(선택형). 미전송 시 BOTH.",
  })
  @IsOptional()
  @IsIn(["PREPAID", "POSTPAID", "BOTH"])
  billingMode?: string;

  @ApiPropertyOptional({ description: "1회 수강료" })
  @IsOptional()
  @IsNumber()
  singlePrice?: number;

  @ApiPropertyOptional({
    description:
      "정기 패키지 가격 (구 monthlyPrice — 사용자 노출 텍스트는 'N주 정기권')",
  })
  @IsOptional()
  @IsNumber()
  monthlyPrice?: number;

  @ApiPropertyOptional({ description: "정기 패키지 주 수 (1~52)", example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  packageWeeks?: number;

  @ApiPropertyOptional({
    description: "정기 패키지 총 회수 (1~728 = 52주×주14회)",
    example: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(728)
  packageTotalSessions?: number;

  @ApiPropertyOptional({ description: "필요 코치 수", example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  requiredCoaches?: number;

  // ─── 정규 수업 자동 일정 생성 (2026-05-12) ─────────────────
  // autoGenerateSchedules=true 이고 trainingType='regular' 이며 startDate/endDate/classDays 가
  // 모두 채워진 경우, 수업 생성과 동시에 일정 일괄 생성 (트랜잭션 보장).

  @ApiPropertyOptional({
    description: "교육 시작일 (YYYY-MM-DD) — 정규 수업 일정 자동 생성에 사용",
    example: "2026-06-01",
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "교육 종료일 (YYYY-MM-DD) — 정규 수업 일정 자동 생성에 사용",
    example: "2026-08-31",
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      "정규 수업 생성과 동시에 일정 일괄 생성 여부. true 면 startDate~endDate 내 classDays 요일 일정 자동 생성 (트랜잭션).",
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoGenerateSchedules?: boolean;

  // ─── 배정 코치 user ID 배열 (2026-05-12) ─────────────────
  // 폼에서 다중 선택한 코치들을 ClassCoachAssignment 에 ACCEPTED 상태로 자동 배정.
  // 1번째 = LEAD, 나머지 = ASSISTANT. 각 코치에게 "수업 배정" 알림 발송.
  // 회의록(2026-04-23) 정합: "정해진 감독 코치" 만 시스템 사용, 외부 게스트 제외.

  @ApiPropertyOptional({
    description:
      "배정할 코치 user ID 배열. 1번째 = LEAD, 나머지 = ASSISTANT. ClassCoachAssignment ACCEPTED 자동 생성 + 알림 발송.",
    example: ["user-uuid-1", "user-uuid-2"],
  })
  @IsOptional()
  @IsArray()
  coachUserIds?: string[];

  // ─── 오픈클래스 팀 노출 (2026-05-15) ─────────────────
  // 오픈클래스(academyId 수업) 를 어느 팀 소속자에게 노출할지 지정.
  // 여기 등록된 팀의 감독·코치·학부모·학생에게만 수업목록·캘린더·대시보드에 노출.
  // 정규 수업(teamId)에는 적용 안 됨 (무시).

  @ApiPropertyOptional({
    description:
      "오픈클래스 노출 팀 ID 배열. academyId 수업일 때만 적용. 빈 배열/미지정 시 어느 팀에도 노출 안 됨.",
    example: ["team-uuid-1", "team-uuid-2"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleTeamIds?: string[];

  // ─── 요일별 시간·장소 (2026-06-05) ─────────────────────────────
  // ClassDaySchedule 테이블과 1:N 대응.
  // 전송 시: 요일별 시각으로 일정 생성 + ClassDaySchedule 행 생성 + 대표값(Class.startTime 등) 자동 산출.
  // 미전송(undefined/빈배열): 기존 단일 startTime/endTime/venueId/classDays 경로 그대로 동작(하위호환).

  @ApiPropertyOptional({
    description:
      "요일별 시간·장소 목록. 전송 시 각 요일마다 별도 시작/종료시간과 장소를 지정할 수 있습니다. " +
      "미전송 또는 빈 배열이면 기존 단일 startTime/endTime 경로로 동작합니다.",
    type: [DayScheduleItemDto],
    example: [
      { dayOfWeek: "월", startTime: "17:00", endTime: "18:30", venueId: "venue-id-1" },
      { dayOfWeek: "수", startTime: "19:00", endTime: "20:30", venueId: "venue-id-2" },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayScheduleItemDto)
  daySchedules?: DayScheduleItemDto[];

  @ApiPropertyOptional({
    description:
      "오픈클래스(academy) 날짜별 일정 — 각 날짜에 시간·장소 지정. ClassSchedule 로 저장.",
    type: [DateScheduleItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DateScheduleItemDto)
  dateSchedules?: DateScheduleItemDto[];
}
