import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RsvpResponseDto {
  @ApiProperty({ example: "rsvp-uuid", description: "RSVP ID" })
  id!: string;

  @ApiProperty({ example: "schedule-uuid", description: "수업 일정 ID" })
  scheduleId!: string;

  @ApiProperty({ example: "user-uuid", description: "응답자 User ID" })
  userId!: string;

  @ApiPropertyOptional({ example: "child-uuid", description: "자녀 User ID" })
  childId?: string | null;

  @ApiProperty({
    example: "PENDING",
    description: "RSVP 상태 (PENDING | ATTENDING | DECLINED)",
  })
  status!: string;

  @ApiPropertyOptional({
    example: "2026-03-20T12:00:00Z",
    description: "응답 일시",
  })
  respondedAt?: Date | null;

  @ApiPropertyOptional({
    example: "개인 일정으로 인해 불참합니다.",
    description: "불참 사유",
  })
  note?: string | null;

  @ApiProperty({ example: "2026-03-16T09:00:00Z", description: "생성 일시" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-03-20T12:00:00Z", description: "수정 일시" })
  updatedAt!: Date;

  // 조인 정보 (선택적)
  @ApiPropertyOptional({
    description: "응답자 이름 (조인 시 포함)",
    example: "홍길동",
  })
  userName?: string;

  @ApiPropertyOptional({
    description: "자녀 이름 (조인 시 포함)",
    example: "홍철수",
  })
  childName?: string;
}
