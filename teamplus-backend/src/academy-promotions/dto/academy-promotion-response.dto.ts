import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AcademyPromotionResponseDto {
  @ApiProperty({ example: "promo-cuid-abc123" })
  id!: string;

  @ApiProperty({ example: "coach-cuid-xyz" })
  coachId!: string;

  @ApiPropertyOptional({ example: "club-cuid-abc" })
  teamId!: string | null;

  @ApiProperty({ example: "[개인/그룹] 아이스하키 레슨 모집" })
  title!: string;

  @ApiProperty({
    example: "현직 KHL 트레이너 출신 코치가 진행하는 실전 레슨입니다.",
  })
  content!: string;

  @ApiPropertyOptional({
    example: "https://storage.teamplus.com/promotions/lesson-banner.jpg",
  })
  imageUrl!: string | null;

  @ApiProperty({
    example: "PRIVATE",
    enum: ["PRIVATE", "GROUP", "GAME_LESSON", "FUN"],
  })
  lessonType!: string;

  @ApiPropertyOptional({ example: "매주 월/수 19:30~21:00" })
  scheduleInfo!: string | null;

  @ApiPropertyOptional({ example: "3회 20만원 / 4회 26만원" })
  priceInfo!: string | null;

  @ApiPropertyOptional({ example: 6 })
  capacity!: number | null;

  @ApiPropertyOptional({ example: "IN CHEON 블랙아이스A" })
  venueInfo!: string | null;

  @ApiPropertyOptional({ example: "010-1234-5678" })
  contactPhone!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiPropertyOptional({ example: "2026-03-20T00:00:00.000Z" })
  startDate!: Date | null;

  @ApiPropertyOptional({ example: "2026-04-30T23:59:59.000Z" })
  endDate!: Date | null;

  @ApiProperty({ example: 0 })
  viewCount!: number;

  @ApiProperty({ example: "2026-03-16T10:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-03-16T10:00:00.000Z" })
  updatedAt!: Date;

  @ApiPropertyOptional({
    description: "코치 정보 (목록/상세 조회 시 포함)",
    example: { id: "coach-id", email: "coach@teamplus.com" },
  })
  coach?: {
    id: string;
    email: string;
    coachProfiles?: Array<{ firstName: string; lastName: string }>;
  };
}
