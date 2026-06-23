import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { RsvpResponseDto } from "./rsvp-response.dto";

export class RsvpSummaryDto {
  @ApiProperty({ example: "schedule-uuid", description: "수업 일정 ID" })
  scheduleId!: string;

  @ApiProperty({
    example: "2026-03-20T16:00:00Z",
    description: "수업 예정 일시",
  })
  scheduledDate!: Date;

  @ApiPropertyOptional({
    example: "2026-03-19T16:00:00Z",
    description: "RSVP 마감 일시",
  })
  rsvpDeadline?: Date | null;

  @ApiProperty({ example: false, description: "수업 취소 여부" })
  isCancelled!: boolean;

  @ApiProperty({ example: 20, description: "전체 RSVP 수" })
  total!: number;

  @ApiProperty({ example: 15, description: "참석 응답 수" })
  attending!: number;

  @ApiProperty({ example: 3, description: "불참 응답 수" })
  declined!: number;

  @ApiProperty({ example: 2, description: "미응답 수" })
  pending!: number;

  @ApiProperty({
    example: "75.0",
    description: "참석율 (%)",
  })
  attendingRate!: string;

  @ApiPropertyOptional({
    type: [RsvpResponseDto],
    description: "개별 RSVP 목록 (상세 조회 시)",
  })
  rsvps?: RsvpResponseDto[];
}
