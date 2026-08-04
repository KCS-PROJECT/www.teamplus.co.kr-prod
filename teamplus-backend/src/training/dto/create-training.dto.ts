import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  IsArray,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 훈련 유형 (수업과 구분되는 훈련 전용 타입)
 * - REGULAR_TRAINING: 정규훈련 (팀 연습)
 * - GAME: 시합 (경기)
 * - FUN: 펀하키 (레크리에이션)
 * - CAMP: 캠프 (다일 행사)
 * - PICKUP: 픽업 게임
 */
export const TRAINING_TYPES = [
  "REGULAR_TRAINING",
  "GAME",
  "FUN",
  "CAMP",
  "PICKUP",
] as const;

export type TrainingTypeValue = (typeof TRAINING_TYPES)[number];

/**
 * [2026-08-04] 훈련 공개 범위 — Prisma ClassVisibility 의 부분집합.
 *   SELECTED_TEAMS 는 노출 팀 선택 UI(ClassTeamVisibility)가 훈련 등록 폼에 없어 제외.
 *   미전송 시 스키마 기본값 TEAM_ONLY(비공개 — 우리 팀에만) 유지.
 */
export const TRAINING_VISIBILITY_VALUES = [
  "PUBLIC",
  "PARENTS_ONLY",
  "TEAM_ONLY",
] as const;

export type TrainingVisibilityValue =
  (typeof TRAINING_VISIBILITY_VALUES)[number];

export class CreateTrainingDto {
  @ApiProperty({
    example: "월요일 정규훈련",
    description: "훈련 세션 이름",
  })
  @IsNotEmpty({ message: "훈련 이름은 필수입니다." })
  @IsString({ message: "훈련 이름은 문자열이어야 합니다." })
  @MaxLength(50, { message: "훈련 이름은 50자 이내여야 합니다." })
  className!: string;

  @ApiPropertyOptional({
    example: "팀 전체 정규 훈련 세션",
    description: "훈련 설명",
  })
  @IsOptional()
  @IsString({ message: "훈련 설명은 문자열이어야 합니다." })
  @MaxLength(500, { message: "설명은 500자 이내여야 합니다." })
  description?: string;

  @ApiProperty({
    description: "훈련 유형",
    example: "REGULAR_TRAINING",
    enum: TRAINING_TYPES,
  })
  @IsNotEmpty({ message: "훈련 유형은 필수입니다." })
  @IsString({ message: "훈련 유형은 문자열이어야 합니다." })
  @IsIn([...TRAINING_TYPES], {
    message:
      "유효한 훈련 유형을 선택해주세요. (REGULAR_TRAINING, GAME, FUN, CAMP, PICKUP)",
  })
  trainingType!: string;

  @ApiProperty({
    example: "김철수 코치",
    description: "담당 코치/강사 이름",
  })
  @IsNotEmpty({ message: "담당 코치 이름은 필수입니다." })
  @IsString({ message: "담당 코치 이름은 문자열이어야 합니다." })
  @MaxLength(30, { message: "코치 이름은 30자 이내여야 합니다." })
  instructorName!: string;

  @ApiPropertyOptional({
    description:
      "공개 범위 — 감독/코치가 등록 시 선택. 미전송 시 TEAM_ONLY(비공개, 우리 팀에만).",
    example: "TEAM_ONLY",
    enum: TRAINING_VISIBILITY_VALUES,
  })
  @IsOptional()
  @IsIn([...TRAINING_VISIBILITY_VALUES], {
    message:
      "유효한 공개 범위를 선택해주세요. (PUBLIC, PARENTS_ONLY, TEAM_ONLY)",
  })
  visibility?: TrainingVisibilityValue;

  @ApiProperty({
    example: 25,
    description: "최대 참가 인원",
  })
  @IsNotEmpty({ message: "최대 인원은 필수입니다." })
  @IsNumber({}, { message: "최대 인원은 숫자여야 합니다." })
  @Min(1, { message: "최대 인원은 1명 이상이어야 합니다." })
  @Max(200, { message: "최대 인원은 200명 이하여야 합니다." })
  capacity!: number;

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
    example: 18,
    description: "최대 연령",
  })
  @IsOptional()
  @IsNumber({}, { message: "최대 연령은 숫자여야 합니다." })
  @Min(0, { message: "최대 연령은 0 이상이어야 합니다." })
  @Max(100, { message: "최대 연령은 100 이하여야 합니다." })
  ageMax?: number;

  @ApiPropertyOptional({
    example: "beginner",
    description: "필요 레벨 (beginner|intermediate|advanced)",
  })
  @IsOptional()
  @IsString({ message: "필요 레벨은 문자열이어야 합니다." })
  levelRequired?: string;

  @ApiProperty({
    example: "2026-04-07T18:00:00Z",
    description: "훈련 시작 시간",
  })
  @IsNotEmpty({ message: "시작 시간은 필수입니다." })
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  // [2026-08-04 fix] Date → string. 전역 ValidationPipe 의 enableImplicitConversion 이
  //   Date 타입 프로퍼티를 Date 인스턴스로 선변환해 @IsDateString(문자열 검증)이 항상
  //   실패 → 훈련 등록이 무조건 400 이던 버그. 서비스가 new Date() 로 직접 변환한다.
  startTime!: string;

  @ApiProperty({
    example: "2026-04-07T20:00:00Z",
    description: "훈련 종료 시간",
  })
  @IsNotEmpty({ message: "종료 시간은 필수입니다." })
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  // [2026-08-04 fix] Date → string — startTime 과 동일한 implicit conversion 버그 수정.
  endTime!: string;

  @ApiPropertyOptional({
    example: ["2026-04-07", "2026-04-14", "2026-04-21"],
    description:
      "일괄 일정 생성용 날짜 배열 (비어 있으면 일정 자동 생성 안 함)",
  })
  @IsOptional()
  @IsArray({ message: "일정 날짜는 배열이어야 합니다." })
  scheduleDates?: string[];
}
