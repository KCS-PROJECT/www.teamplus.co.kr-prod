import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 자녀 정보 응답 DTO
 */
export class ChildResponseDto {
  @ApiProperty({ description: "자녀 ID" })
  id!: string;

  @ApiProperty({ description: "자녀 이름" })
  firstName!: string;

  @ApiProperty({ description: "자녀 성" })
  lastName!: string;

  @ApiProperty({ description: "전체 이름" })
  fullName!: string;

  @ApiProperty({ description: "생년월일" })
  birthDate!: Date;

  @ApiProperty({ description: "나이" })
  age!: number;

  @ApiPropertyOptional({ description: "성별 (M/F)" })
  gender?: string;

  @ApiPropertyOptional({ description: "메모/특이사항" })
  note?: string;

  @ApiPropertyOptional({ description: "이메일" })
  email?: string;

  @ApiPropertyOptional({ description: "전화번호" })
  phone?: string;

  @ApiPropertyOptional({
    description: "프로필 사진 URL (/uploads/avatar/...)",
  })
  imageUrl?: string;

  @ApiProperty({ description: "관계 (parent/guardian/grandparent/other)" })
  relationship!: string;

  @ApiProperty({ description: "주 보호자 여부" })
  isPrimary!: boolean;

  @ApiProperty({ description: "등록일" })
  createdAt!: Date;

  @ApiPropertyOptional({ description: "클럽 가입 정보" })
  clubMemberships?: ClubMembershipDto[];
}

/**
 * 클럽 가입 정보 DTO
 */
export class ClubMembershipDto {
  @ApiProperty({ description: "ClubMember PK (수상/출석 등 memberId 참조용)" })
  id!: string;

  @ApiProperty({ description: "클럽 ID" })
  teamId!: string;

  @ApiProperty({ description: "클럽명" })
  clubName!: string;

  @ApiProperty({ description: "승인 상태" })
  approvalStatus!: string;

  @ApiPropertyOptional({
    description: "반려 사유 (approvalStatus=rejected 시)",
  })
  rejectionReason?: string;

  @ApiPropertyOptional({ description: "레벨" })
  playerLevel?: string;

  @ApiProperty({ description: "가입일" })
  joinedAt!: Date;
}

/**
 * 자녀 목록 응답 DTO
 */
export class ChildListResponseDto {
  @ApiProperty({ description: "성공 여부" })
  success!: boolean;

  @ApiProperty({ description: "자녀 목록", type: [ChildResponseDto] })
  data!: ChildResponseDto[];

  @ApiProperty({ description: "총 자녀 수" })
  total!: number;
}

/**
 * 자녀 단건 응답 DTO
 */
export class ChildSingleResponseDto {
  @ApiProperty({ description: "성공 여부" })
  success!: boolean;

  @ApiProperty({ description: "자녀 정보", type: ChildResponseDto })
  data!: ChildResponseDto;
}
