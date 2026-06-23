import {
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  IsBoolean,
  IsArray,
  IsIn,
  ValidateNested,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { DateScheduleItemDto, DayScheduleItemDto } from "./create-class.dto";

/**
 * classes 도메인 trainingType — SoT: get-classes-query.dto.ts.
 * ⚠️ 수정 시 trainingType 변경은 service 레이어에서 차단 (유형 전환 금지).
 */
const CLASSES_TRAINING_TYPES = ["regular", "lesson"] as const;

export class UpdateClassDto {
  @ApiPropertyOptional({
    example: "신규 수강생반",
    description: "수업 이름",
  })
  @IsOptional()
  @IsString({ message: "수업 이름은 문자열이어야 합니다." })
  className?: string;

  @ApiPropertyOptional({
    example: "아이스하키 입문 수업",
    description: "수업 설명",
  })
  @IsOptional()
  @IsString({ message: "수업 설명은 문자열이어야 합니다." })
  description?: string;

  @ApiPropertyOptional({
    example: "김철수",
    description: "강사 이름",
  })
  @IsOptional()
  @IsString({ message: "강사 이름은 문자열이어야 합니다." })
  instructorName?: string;

  @ApiPropertyOptional({
    example: 20,
    description: "정원",
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
      "대상 출생연도 개별 목록(SoT). 비연속 선택 가능. 빈 배열 = 전 연령 대상. ageMin/ageMax 는 서버에서 이 값의 한국나이 min/max 로 자동 파생.",
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
    description: "필요 레벨",
  })
  @IsOptional()
  @IsString({ message: "필요 레벨은 문자열이어야 합니다." })
  levelRequired?: string;

  @ApiPropertyOptional({
    example: "2026-01-04T16:00:00Z",
    description: "시작 시간",
  })
  @IsOptional()
  startTime?: Date;

  @ApiPropertyOptional({
    example: "2026-01-04T17:00:00Z",
    description: "종료 시간",
  })
  @IsOptional()
  endTime?: Date;

  @ApiPropertyOptional({
    example: true,
    description: "활성화 상태",
  })
  @IsOptional()
  @IsBoolean({ message: "활성화 상태는 boolean이어야 합니다." })
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      "수업 유형 (변경 불허 — 등록 후 유형 전환 금지). 다른 값 전달 시 BadRequest.",
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

  @ApiPropertyOptional({ description: "수업 요일 배열" })
  @IsOptional()
  @IsArray()
  classDays?: string[];

  @ApiPropertyOptional({ description: "카테고리 (KIDS|JUNIOR|ADULT)" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: "1회 수강료" })
  @IsOptional()
  @IsNumber()
  singlePrice?: number;

  @ApiPropertyOptional({ description: "정기 패키지 가격 (구 monthlyPrice)" })
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
    description: "정기 패키지 총 회수 (1~728)",
    example: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(728)
  packageTotalSessions?: number;

  // 2026-05-12: 배정 코치 user ID 배열 — ClassCoachAssignment 동기화 + 신규 추가 코치 알림 발송.
  // undefined = 변경 없음 / [] = 모두 제거 (Class.coachId 등록자 폴백) / 배열 = 1번째 LEAD.
  @ApiPropertyOptional({
    description:
      "배정 코치 user ID 배열. 기존 ACCEPTED 배정 동기화: 제거된 코치 REMOVED, 신규 추가 코치 ACCEPTED + 알림 발송.",
    example: ["user-uuid-1", "user-uuid-2"],
  })
  @IsOptional()
  @IsArray()
  coachUserIds?: string[];

  // 2026-05-15: 오픈클래스 팀 노출 ID 배열 — ClassTeamVisibility 전체 replace.
  // undefined = 변경 없음 / [] = 모든 노출 제거 / 배열 = 해당 팀들로 교체.
  @ApiPropertyOptional({
    description:
      "오픈클래스 노출 팀 ID 배열. academyId 수업일 때만 적용. 전달 시 ClassTeamVisibility 를 이 배열로 전체 교체.",
    example: ["team-uuid-1", "team-uuid-2"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleTeamIds?: string[];

  // 2026-06-05: 요일별 시간·장소 — ClassDaySchedule 전체 replace.
  // undefined = 변경 없음(요일 규칙 미변경) / 배열 = 기존 행 전체 삭제 후 재생성.
  @ApiPropertyOptional({
    description:
      "요일별 시간·장소 목록. 전달 시 ClassDaySchedule 을 이 배열로 전체 교체합니다. " +
      "미전달 시 기존 요일 규칙 유지(변경 없음).",
    type: [DayScheduleItemDto],
    example: [
      { dayOfWeek: "월", startTime: "17:00", endTime: "18:30", venueId: "venue-id-1" },
      { dayOfWeek: "수", startTime: "19:00", endTime: "20:30" },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayScheduleItemDto)
  daySchedules?: DayScheduleItemDto[];

  // 날짜별 일정 — ClassSchedule 전체 replace.
  // undefined = 변경 없음(기존 일정 보존) / 배열 = 기존 전체 삭제 후 재생성.
  // 전송 시 classDays 도 날짜 기반 요일 집합으로 자동 갱신.
  @ApiPropertyOptional({
    description:
      "날짜별 일정 목록. 전달 시 ClassSchedule 을 이 배열로 전체 교체합니다. " +
      "미전달 시 기존 일정 보존(변경 없음).",
    type: [DateScheduleItemDto],
    example: [
      { date: "2026-07-01", startTime: "17:00", endTime: "18:30", venueId: "venue-id-1" },
      { date: "2026-07-03", startTime: "17:00", endTime: "18:30" },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DateScheduleItemDto)
  dateSchedules?: DateScheduleItemDto[];
}
