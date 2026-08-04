import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  TRAINING_TYPES,
  TRAINING_VISIBILITY_VALUES,
  type TrainingVisibilityValue,
} from "./create-training.dto";

export class UpdateTrainingDto {
  @ApiPropertyOptional({
    example: "화요일 정규훈련",
    description: "훈련 세션 이름",
  })
  @IsOptional()
  @IsString({ message: "훈련 이름은 문자열이어야 합니다." })
  @MaxLength(50, { message: "훈련 이름은 50자 이내여야 합니다." })
  className?: string;

  @ApiPropertyOptional({
    example: "팀 전체 정규 훈련 세션 - 수정",
    description: "훈련 설명",
  })
  @IsOptional()
  @IsString({ message: "훈련 설명은 문자열이어야 합니다." })
  @MaxLength(500, { message: "설명은 500자 이내여야 합니다." })
  description?: string;

  @ApiPropertyOptional({
    description: "훈련 유형",
    example: "REGULAR_TRAINING",
    enum: TRAINING_TYPES,
  })
  @IsOptional()
  @IsString({ message: "훈련 유형은 문자열이어야 합니다." })
  @IsIn([...TRAINING_TYPES], {
    message:
      "유효한 훈련 유형을 선택해주세요. (REGULAR_TRAINING, GAME, FUN, CAMP, PICKUP)",
  })
  trainingType?: string;

  @ApiPropertyOptional({
    description:
      "공개 범위 — PUBLIC(전체공개) | PARENTS_ONLY(학부모공개) | TEAM_ONLY(비공개)",
    example: "PUBLIC",
    enum: TRAINING_VISIBILITY_VALUES,
  })
  @IsOptional()
  @IsIn([...TRAINING_VISIBILITY_VALUES], {
    message:
      "유효한 공개 범위를 선택해주세요. (PUBLIC, PARENTS_ONLY, TEAM_ONLY)",
  })
  visibility?: TrainingVisibilityValue;

  @ApiPropertyOptional({
    example: "이영희 코치",
    description: "담당 코치/강사 이름",
  })
  @IsOptional()
  @IsString({ message: "담당 코치 이름은 문자열이어야 합니다." })
  @MaxLength(30, { message: "코치 이름은 30자 이내여야 합니다." })
  instructorName?: string;

  @ApiPropertyOptional({
    example: 30,
    description: "최대 참가 인원",
  })
  @IsOptional()
  @IsNumber({}, { message: "최대 인원은 숫자여야 합니다." })
  @Min(1, { message: "최대 인원은 1명 이상이어야 합니다." })
  @Max(200, { message: "최대 인원은 200명 이하여야 합니다." })
  capacity?: number;

  @ApiPropertyOptional({ example: 7, description: "최소 연령" })
  @IsOptional()
  @IsNumber({}, { message: "최소 연령은 숫자여야 합니다." })
  @Min(0)
  @Max(100)
  ageMin?: number;

  @ApiPropertyOptional({ example: 18, description: "최대 연령" })
  @IsOptional()
  @IsNumber({}, { message: "최대 연령은 숫자여야 합니다." })
  @Min(0)
  @Max(100)
  ageMax?: number;

  @ApiPropertyOptional({
    example: "intermediate",
    description: "필요 레벨",
  })
  @IsOptional()
  @IsString()
  levelRequired?: string;

  @ApiPropertyOptional({
    example: "2026-04-07T18:00:00Z",
    description: "훈련 시작 시간",
  })
  @IsOptional()
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  // [2026-08-04 fix] Date → string — enableImplicitConversion 이 Date 인스턴스로
  //   선변환해 @IsDateString 이 항상 실패하던 버그 (create DTO 와 동일).
  startTime?: string;

  @ApiPropertyOptional({
    example: "2026-04-07T20:00:00Z",
    description: "훈련 종료 시간",
  })
  @IsOptional()
  @IsDateString({}, { message: "올바른 날짜 형식을 입력해주세요." })
  // [2026-08-04 fix] Date → string — startTime 과 동일.
  endTime?: string;

  @ApiPropertyOptional({
    example: true,
    description: "활성 상태",
  })
  @IsOptional()
  @IsBoolean({ message: "활성 상태는 boolean이어야 합니다." })
  isActive?: boolean;
}
