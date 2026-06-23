import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 대기자 정보 응답 DTO
 */
export class WaitlistResponseDto {
  @ApiProperty({ description: "대기 ID" })
  id!: string;

  @ApiProperty({ description: "수업 ID" })
  classId!: string;

  @ApiProperty({ description: "수업 이름" })
  className!: string;

  @ApiPropertyOptional({ description: "수업 일정 ID" })
  scheduleId?: string;

  @ApiProperty({ description: "등록한 사용자 ID" })
  userId!: string;

  @ApiPropertyOptional({ description: "대기 자녀 ID" })
  childId?: string;

  @ApiPropertyOptional({ description: "대기 자녀 이름" })
  childName?: string;

  @ApiProperty({ description: "대기 순번" })
  position!: number;

  @ApiProperty({
    description: "대기 상태",
    enum: ["WAITING", "CONFIRMED", "CANCELLED", "EXPIRED"],
  })
  status!: string;

  @ApiPropertyOptional({ description: "승격 알림 발송 시각" })
  notifiedAt?: Date;

  @ApiPropertyOptional({ description: "확정 시각" })
  confirmedAt?: Date;

  @ApiPropertyOptional({ description: "확인 응답 기한 (승격 후 24시간)" })
  expiresAt?: Date;

  @ApiProperty({ description: "대기 등록 시각" })
  createdAt!: Date;
}

/**
 * 대기자 단건 응답
 */
export class WaitlistSingleResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: WaitlistResponseDto })
  data!: WaitlistResponseDto;
}

/**
 * 대기자 목록 응답
 */
export class WaitlistListResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: [WaitlistResponseDto] })
  data!: WaitlistResponseDto[];

  @ApiProperty({ description: "전체 대기자 수" })
  total!: number;
}
