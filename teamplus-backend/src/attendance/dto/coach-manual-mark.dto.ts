import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 2026-05-12: 출석 상태 3-state 단순화 (회의록 결정 — 지각/사유결석/취소 제거).
 *
 * 동작:
 *   - 기존 attendance 레코드 있음 → updateAttendance() 위임 (수업권 복원/차감 자동)
 *   - 없음 → 신규 생성 + present 면 수업권 차감
 *
 * 사용 시나리오:
 *   - 학부모 출석 처리 후 학생이 실제 결석 → 코치가 'absent' 로 변경 → 수업권 복원
 *   - 학부모/QR 미체크 학생 → 코치가 직접 'present' 로 마킹
 */
export class CoachManualMarkDto {
  @ApiProperty({
    example: "schedule-uuid",
    description: "수업 일정 ID",
  })
  @IsNotEmpty({ message: "수업 일정 ID는 필수입니다." })
  @IsString()
  scheduleId!: string;

  @ApiProperty({
    example: "user-uuid",
    description: "출석 마킹 대상 학생의 User.id (= classRegistration.userId)",
  })
  @IsNotEmpty({ message: "학생 ID는 필수입니다." })
  @IsString()
  memberId!: string;

  @ApiProperty({
    example: "present",
    enum: ["present", "absent"],
    description:
      "출석 상태. present 는 출석 처리 (수업권 차감), absent 는 결석 (수업권 복원)",
  })
  @IsNotEmpty({ message: "출석 상태는 필수입니다." })
  @IsIn(["present", "absent"])
  attendanceStatus!: "present" | "absent";

  /**
   * PR-D (v0.8): 수업권 변동 동반 액션(신규 present 마킹) 시 의무 (2~200자).
   * 길이는 DTO, 의무 여부는 attendance.service.ts coachManualMark 에서 분기 검증.
   */
  @ApiProperty({
    example: "현장 확인 결과 출석 정정",
    description:
      "수정 사유 — 신규 present 마킹 시 2~200자 필수, absent 신규는 선택",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "수정 사유는 2자 이상이어야 합니다." })
  @MaxLength(200, { message: "수정 사유는 200자 이하여야 합니다." })
  modifiedReason?: string;
}
