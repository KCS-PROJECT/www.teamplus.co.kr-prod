import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

/**
 * 학생 본인 출석 체크 (Phase 2 · D-1=B 결정 — 2026-04-28).
 *
 * 회의록 R1 변경: 자녀 본인 QR 출석 → 학부모와 동일한 "버튼" 방식으로 일원화.
 * QR 진입점은 FE 에서 노출 안 하고, scheduleId 만으로 본인 출석 처리.
 *
 * @see attendance.service.ts#selfCheckIn
 */
export class SelfCheckInDto {
  @ApiProperty({
    description: "출석 체크할 수업 일정 ID (ClassSchedule.id)",
    example: "cm5xyz...",
  })
  @IsNotEmpty()
  @IsString()
  scheduleId!: string;
}
