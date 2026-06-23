import {
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsArray,
  IsIn,
  ArrayMinSize,
  IsString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateScheduleDto {
  @ApiProperty({
    example: "2026-01-04T10:00:00Z",
    description: "수업 일정 날짜/시간",
  })
  @IsNotEmpty({ message: "수업 일정 날짜는 필수입니다." })
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  scheduledDate!: string;
}

export class CreateBulkScheduleDto {
  // ── 기간+요일 모드 (dates 미지정 시 사용 · 하위호환) ──
  @ApiPropertyOptional({
    example: "2026-01-01",
    description: "반복 일정 시작일 (YYYY-MM-DD). dates 미지정 시 사용.",
  })
  @IsOptional()
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  startDate?: string;

  @ApiPropertyOptional({
    example: "2026-03-31",
    description: "반복 일정 종료일 (YYYY-MM-DD). dates 미지정 시 사용.",
  })
  @IsOptional()
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  endDate?: string;

  @ApiPropertyOptional({
    example: ["월", "수", "금"],
    description: "수업 요일 (월/화/수/목/금/토/일). dates 미지정 시 사용.",
  })
  @IsOptional()
  @IsArray({ message: "수업 요일은 배열이어야 합니다." })
  @IsIn(["월", "화", "수", "목", "금", "토", "일"], {
    each: true,
    message: "유효한 요일을 입력해주세요. (월/화/수/목/금/토/일)",
  })
  classDays?: string[];

  // ── 날짜 배열 모드 (미니달력으로 선택한 날짜 직접 지정) ──
  @ApiPropertyOptional({
    example: ["2026-06-15", "2026-06-17", "2026-06-22"],
    description:
      "미니달력으로 선택한 날짜 배열 (YYYY-MM-DD). 지정 시 startDate/endDate/classDays 대신 이 날짜들로 일정 생성.",
  })
  @IsOptional()
  @IsArray({ message: "날짜는 배열이어야 합니다." })
  @ArrayMinSize(1, { message: "최소 1개의 날짜를 선택해주세요." })
  @IsDateString({}, { each: true, message: "올바른 날짜 형식을 입력해주세요." })
  dates?: string[];

  @ApiPropertyOptional({
    example: "10:00",
    description: "수업 시작 시간 (HH:mm)",
  })
  @IsOptional()
  @IsString({ message: "시작 시간은 문자열이어야 합니다." })
  startTime?: string;

  @ApiPropertyOptional({
    example: "11:30",
    description: "수업 종료 시간 (HH:mm)",
  })
  @IsOptional()
  @IsString({ message: "종료 시간은 문자열이어야 합니다." })
  endTime?: string;

  @ApiPropertyOptional({
    description: "공통 장소 ID (날짜 배열 모드 — 선택 날짜들에 일괄 적용)",
  })
  @IsOptional()
  @IsString({ message: "장소 ID는 문자열이어야 합니다." })
  venueId?: string;
}

/** 개별 회차 시간·장소 수정 (PUT :classId/schedules/:scheduleId) — 전달된 필드만 부분 반영. */
export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: "10:00", description: "시작 시간 (HH:mm)" })
  @IsOptional()
  @IsString({ message: "시작 시간은 문자열이어야 합니다." })
  startTime?: string;

  @ApiPropertyOptional({ example: "11:30", description: "종료 시간 (HH:mm)" })
  @IsOptional()
  @IsString({ message: "종료 시간은 문자열이어야 합니다." })
  endTime?: string;

  @ApiPropertyOptional({
    description: "장소 ID. 빈 문자열이면 장소 해제(null).",
  })
  @IsOptional()
  @IsString({ message: "장소 ID는 문자열이어야 합니다." })
  venueId?: string;
}
