import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum AttendanceStatus {
  PRESENT = "present",
  ABSENT = "absent",
}

export class UpdateAttendanceDto {
  @ApiProperty({
    description: "출석 상태",
    enum: AttendanceStatus,
    example: AttendanceStatus.PRESENT,
  })
  @IsEnum(AttendanceStatus)
  attendanceStatus!: AttendanceStatus;

  @ApiPropertyOptional({
    description: "메모 또는 사유",
    example: "현장 확인 결과 출석 정정",
  })
  @IsOptional()
  @IsString()
  note?: string;

  /**
   * 2026-04-27 (F-2 + N-5): 코치 수정 사유.
   * PR-D (v0.8): 수업권 변동 동반 코치 정정 시 의무 (2~200자) — 서비스 레이어에서 조건부 검증.
   * 길이 제약은 DTO 에서, 의무 여부는 attendance.service.ts 에서 attendanceStatus 변동에 따라 분기.
   */
  @ApiPropertyOptional({
    description:
      "수정 사유 — 수업권 변동(present↔absent 전환) 동반 시 2~200자 필수",
    example: "현장 확인 결과 출석 → 결석 정정",
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "수정 사유는 2자 이상이어야 합니다." })
  @MaxLength(200, { message: "수정 사유는 200자 이하여야 합니다." })
  modifiedReason?: string;
}
