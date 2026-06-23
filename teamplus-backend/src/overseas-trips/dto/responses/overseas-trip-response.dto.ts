import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 해외 원정 - 팀 정보 (간략)
 */
export class OverseasTripTeamDto {
  @ApiProperty({ description: "팀 ID", example: "clxteam01" })
  id!: string;

  @ApiProperty({ description: "팀(클럽)명", example: "팀플러스 하키클럽" })
  name!: string;
}

/**
 * 해외 원정 - 생성자 정보
 */
export class OverseasTripCreatedByDto {
  @ApiProperty({ description: "생성자 User ID", example: "clxuser01" })
  id!: string;

  @ApiPropertyOptional({
    description: "생성자 이메일",
    example: "director@teamplus.com",
    nullable: true,
    type: String,
  })
  email?: string | null;

  @ApiPropertyOptional({
    description: "생성자 전화번호",
    example: "010-1234-5678",
    nullable: true,
    type: String,
  })
  phone?: string | null;
}

/**
 * 참가 등록 - 회원 정보
 */
export class OverseasTripRegistrationMemberDto {
  @ApiProperty({ description: "회원(TeamMember) ID" })
  id!: string;

  @ApiProperty({ description: "선수명", example: "홍길동" })
  playerName!: string;

  @ApiPropertyOptional({
    description: "선수 나이",
    example: 14,
    nullable: true,
    type: Number,
  })
  playerAge?: number | null;
}

/**
 * 참가 등록 - 학부모/자녀 연락 정보
 */
export class OverseasTripRegistrationContactDto {
  @ApiProperty({ description: "User ID" })
  id!: string;

  @ApiPropertyOptional({
    description: "이메일",
    nullable: true,
    type: String,
  })
  email?: string | null;

  @ApiPropertyOptional({
    description: "전화번호",
    nullable: true,
    type: String,
  })
  phone?: string | null;
}

/**
 * 참가 등록 응답
 */
export class OverseasTripRegistrationResponseDto {
  @ApiProperty({ description: "참가 등록 ID" })
  id!: string;

  @ApiProperty({ description: "등록 일시" })
  createdAt!: Date;

  @ApiPropertyOptional({
    description: "회원(TeamMember) 정보",
    type: OverseasTripRegistrationMemberDto,
  })
  member?: OverseasTripRegistrationMemberDto;

  @ApiPropertyOptional({
    description: "학부모 정보",
    type: OverseasTripRegistrationContactDto,
  })
  parent?: OverseasTripRegistrationContactDto;

  @ApiPropertyOptional({
    description: "자녀 정보 (학부모가 자녀 대신 등록 시)",
    type: OverseasTripRegistrationContactDto,
  })
  child?: OverseasTripRegistrationContactDto;
}

/**
 * 등록 개수 집계
 */
export class OverseasTripCountDto {
  @ApiProperty({ description: "참가 등록 수", example: 5 })
  registrations!: number;
}

/**
 * 해외 원정 상세 응답 DTO
 *
 * `findOneTrip(id)` 에서 사용. include 전체 로드 대신 OVERSEAS_TRIP_DETAIL_SELECT
 * 로 필요한 필드만 노출하여 over-fetching 을 제거.
 *
 * 응답 페이로드 약 70% 감소 (User 전체 → email/phone 만, Team 전체 → id/name 만).
 */
export class OverseasTripResponseDto {
  @ApiProperty({ description: "원정 ID (cuid)" })
  id!: string;

  @ApiProperty({ description: "원정 제목" })
  title!: string;

  @ApiProperty({ description: "국가 (ISO 코드 또는 한글명)" })
  country!: string;

  @ApiProperty({ description: "도시" })
  city!: string;

  @ApiPropertyOptional({
    description: "원정 상세 설명",
    nullable: true,
    type: String,
  })
  description?: string | null;

  @ApiProperty({ description: "원정 시작일" })
  startDate!: Date;

  @ApiProperty({ description: "원정 종료일" })
  endDate!: Date;

  @ApiProperty({ description: "참가 등록 마감일" })
  registrationDeadline!: Date;

  @ApiProperty({ description: "최대 참가 인원", example: 20 })
  maxParticipants!: number;

  @ApiPropertyOptional({
    description: "대상 연령대",
    example: "16년생",
    nullable: true,
    type: String,
  })
  ageGroup?: string | null;

  @ApiPropertyOptional({
    description: "예상 총비용 (원)",
    example: 3000000,
    nullable: true,
    type: Number,
  })
  estimatedCost?: number | null;

  @ApiPropertyOptional({
    description: "예치금 (원)",
    example: 500000,
    nullable: true,
    type: Number,
  })
  depositAmount?: number | null;

  @ApiPropertyOptional({
    description: "예치금 납부 마감일",
    nullable: true,
    type: Date,
  })
  depositDeadline?: Date | null;

  @ApiPropertyOptional({
    description: "항공 정보",
    nullable: true,
    type: String,
  })
  flightInfo?: string | null;

  @ApiPropertyOptional({
    description: "숙소 정보",
    nullable: true,
    type: String,
  })
  hotelInfo?: string | null;

  @ApiPropertyOptional({
    description: "현지 교통 정보",
    nullable: true,
    type: String,
  })
  transportInfo?: string | null;

  @ApiPropertyOptional({
    description: "상세 일정표",
    nullable: true,
    type: String,
  })
  itinerary?: string | null;

  @ApiProperty({
    description: "상태 (draft|open|closed|ongoing|completed|cancelled)",
    example: "open",
  })
  status!: string;

  @ApiPropertyOptional({
    description: "연락처 전화번호",
    nullable: true,
    type: String,
  })
  contactPhone?: string | null;

  @ApiPropertyOptional({
    description: "연락처 이메일",
    nullable: true,
    type: String,
  })
  contactEmail?: string | null;

  @ApiProperty({ description: "생성 일시" })
  createdAt!: Date;

  @ApiProperty({ description: "최종 수정 일시" })
  updatedAt!: Date;

  @ApiProperty({
    description: "팀(클럽) 정보",
    type: OverseasTripTeamDto,
  })
  team!: OverseasTripTeamDto;

  @ApiProperty({
    description: "생성자 정보",
    type: OverseasTripCreatedByDto,
  })
  createdBy!: OverseasTripCreatedByDto;

  @ApiProperty({
    description: "참가 등록 목록 (등록 일시 오름차순)",
    type: [OverseasTripRegistrationResponseDto],
  })
  registrations!: OverseasTripRegistrationResponseDto[];

  @ApiProperty({
    description: "집계 정보",
    type: OverseasTripCountDto,
  })
  _count!: OverseasTripCountDto;
}
