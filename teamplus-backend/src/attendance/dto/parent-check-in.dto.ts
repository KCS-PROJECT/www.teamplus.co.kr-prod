import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 2026-04-27 (Phase 2 · D-A/D-D/D-E): 학부모가 자녀 출석을 대리 체크하는 DTO.
 * - scheduleId: 출석 대상 수업 일정
 * - childId: 학부모와 ParentChild 관계가 있는 자녀 User.id
 *
 * 시간 윈도우, 자녀 슬라이드 동기화 등 비즈니스 룰은 service 에서 검증.
 */
export class ParentCheckInDto {
  @ApiProperty({
    example: "schedule-uuid",
    description: "출석할 수업 일정 ID",
  })
  @IsNotEmpty({ message: "수업 일정 ID는 필수입니다." })
  @IsString()
  scheduleId!: string;

  @ApiProperty({
    example: "child-user-uuid",
    description: "출석시킬 자녀 User.id (ParentChild 관계 검증 필수)",
  })
  @IsNotEmpty({ message: "자녀 ID는 필수입니다." })
  @IsString()
  childId!: string;
}
