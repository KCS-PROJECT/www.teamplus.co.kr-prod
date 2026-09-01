import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

/** "HH:mm" 형식 검증 — ClassSchedule.startTime/endTime 저장 규약(시각 3분류 ③). */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ApplyDraftAdditionDto {
  @ApiProperty({ example: "2026-09-03", description: "회차 날짜 (YYYY-MM-DD)" })
  // IsDateString 은 full ISO 도 통과시킴 — date-only 형태를 정규식으로 강제하고,
  // 실제 달력 날짜 유효성(2026-02-30 등)은 서비스의 왕복 대조가 최종 판정.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date 는 YYYY-MM-DD 형식이어야 합니다.",
  })
  date!: string;

  @ApiPropertyOptional({ example: "17:00", description: "시작 시각 HH:mm (미정 허용)" })
  @IsOptional()
  @Matches(HHMM, { message: "startTime 은 HH:mm 형식이어야 합니다." })
  startTime?: string;

  @ApiPropertyOptional({ example: "18:00" })
  @IsOptional()
  @Matches(HHMM, { message: "endTime 은 HH:mm 형식이어야 합니다." })
  endTime?: string;

  @ApiPropertyOptional({ description: "장소 ID" })
  @IsOptional()
  @IsString()
  venueId?: string;
}

export class ApplyDraftEditDto {
  @ApiProperty({ description: "수정 대상 회차 ID" })
  @IsString()
  scheduleId!: string;

  @ApiProperty({
    description:
      "낙관적 잠금 기준 버전 — GET schedules 의 updatedAt (불일치 시 전체 롤백 + 409)",
  })
  @IsISO8601()
  baseUpdatedAt!: string;

  @ApiPropertyOptional({ example: "17:00", description: "빈 문자열 = 시간 해제" })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: "18:00" })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: "빈 문자열 = 장소 해제" })
  @IsOptional()
  @IsString()
  venueId?: string;
}

export class ApplyDraftCancellationDto {
  @ApiProperty({ description: "취소 대상 회차 ID" })
  @IsString()
  scheduleId!: string;

  @ApiProperty({ description: "낙관적 잠금 기준 버전 (edits 와 동일 계약)" })
  @IsISO8601()
  baseUpdatedAt!: string;

  @ApiProperty({ example: "감독/코치 취소" })
  @IsString()
  @MaxLength(200)
  reason!: string;
}

export class ApplyScheduleDraftDto {
  @ApiProperty({
    description:
      "멱등 키 (클라이언트 생성 uuid) — 같은 id 재요청은 저장된 결과 replay, 같은 id·다른 내용은 409",
  })
  @IsUUID()
  operationId!: string;

  @ApiProperty({ type: [ApplyDraftAdditionDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ApplyDraftAdditionDto)
  additions!: ApplyDraftAdditionDto[];

  @ApiProperty({ type: [ApplyDraftEditDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ApplyDraftEditDto)
  edits!: ApplyDraftEditDto[];

  @ApiProperty({ type: [ApplyDraftCancellationDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ApplyDraftCancellationDto)
  cancellations!: ApplyDraftCancellationDto[];
}
