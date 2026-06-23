import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 2026-04-27 (Phase 2 · N-4): 감독/코치가 일괄로 출석 체크하는 DTO.
 * - scheduleId: 출석 대상 수업 일정
 * - memberIds: 출석시킬 회원 User.id 배열 (해당 수업에 등록된 자녀들)
 *
 * 부분 실패 허용 (성공/already/insufficient_credit/no_registration 별도 분류).
 */
export class CoachCheckInDto {
  @ApiProperty({
    example: "schedule-uuid",
    description: "출석할 수업 일정 ID",
  })
  @IsNotEmpty({ message: "수업 일정 ID는 필수입니다." })
  @IsString()
  scheduleId!: string;

  @ApiProperty({
    type: [String],
    example: ["user-1", "user-2"],
    description: "출석시킬 회원 User.id 배열",
  })
  @IsArray()
  @ArrayNotEmpty({ message: "체크할 회원이 한 명 이상이어야 합니다." })
  @IsString({ each: true })
  memberIds!: string[];
}
