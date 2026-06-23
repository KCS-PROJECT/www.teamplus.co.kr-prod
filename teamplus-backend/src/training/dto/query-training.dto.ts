import { IsOptional, IsString, IsNumberString, IsIn } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { TRAINING_TYPES } from "./create-training.dto";

export class QueryTrainingDto {
  @ApiPropertyOptional({
    description: "훈련 유형 필터",
    example: "REGULAR_TRAINING",
    enum: TRAINING_TYPES,
  })
  @IsOptional()
  @IsString()
  @IsIn([...TRAINING_TYPES], {
    message: "유효한 훈련 유형을 선택해주세요.",
  })
  trainingType?: string;

  @ApiPropertyOptional({
    description: "페이지 번호 (기본: 1)",
    example: "1",
  })
  @IsOptional()
  @IsNumberString({}, { message: "페이지 번호는 숫자여야 합니다." })
  page?: string;

  @ApiPropertyOptional({
    description: "페이지당 개수 (기본: 20)",
    example: "20",
  })
  @IsOptional()
  @IsNumberString({}, { message: "페이지 크기는 숫자여야 합니다." })
  limit?: string;

  @ApiPropertyOptional({
    description: "검색어 (훈련 이름, 코치 이름)",
    example: "정규훈련",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "일정 시작일 필터 (YYYY-MM-DD)",
    example: "2026-04-01",
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "일정 종료일 필터 (YYYY-MM-DD)",
    example: "2026-04-30",
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}
