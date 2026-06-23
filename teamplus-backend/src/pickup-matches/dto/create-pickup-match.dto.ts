import {
  IsString,
  IsInt,
  IsOptional,
  IsDateString,
  Min,
  IsArray,
  IsIn,
  Length,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 매치 생성 DTO.
 *
 * 관리자/감독/아카데미원장/코치만 호출 가능 (컨트롤러 @Roles 참고).
 */
export class CreatePickupMatchDto {
  @ApiProperty({
    description: "매치 제목",
    example: "주말 오전 친선 매치",
    minLength: 2,
    maxLength: 80,
  })
  @IsString()
  @Length(2, 80, { message: "매치 제목은 2~80자로 입력해주세요." })
  title!: string;

  @ApiProperty({
    description: "경기 일시 (ISO-8601)",
    example: "2026-05-01T10:00:00.000Z",
  })
  @IsDateString({}, { message: "경기 일시 형식이 올바르지 않습니다." })
  scheduledAt!: string;

  @ApiProperty({ description: "링크장 이름", example: "목동 아이스링크" })
  @IsString()
  rinkName!: string;

  @ApiProperty({
    description: "링크장 주소 (선택)",
    example: "서울 양천구 안양천로 939",
    required: false,
  })
  @IsOptional()
  @IsString()
  rinkAddress?: string;

  @ApiProperty({
    description: "구역 상세 (예: 제2경기장)",
    required: false,
  })
  @IsOptional()
  @IsString()
  rinkVenueInfo?: string;

  @ApiProperty({ description: "참가비 (원)", example: 35000, minimum: 0 })
  @IsInt({ message: "참가비는 정수여야 합니다." })
  @Min(0, { message: "참가비는 0원 이상이어야 합니다." })
  price!: number;

  @ApiProperty({
    description: "레벨",
    example: "중급",
    enum: ["입문", "초급", "중급", "고급"],
  })
  @IsString()
  @IsIn(["입문", "초급", "중급", "고급"], {
    message: "레벨은 입문/초급/중급/고급 중 하나여야 합니다.",
  })
  level!: string;

  @ApiProperty({
    description: "레벨 코드",
    example: "B",
    enum: ["A", "B", "C"],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(["A", "B", "C"])
  levelCode?: string;

  @ApiProperty({
    description: "성별 제한",
    example: "혼성",
    enum: ["남성", "여성", "혼성"],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(["남성", "여성", "혼성"])
  gender?: string;

  @ApiProperty({ description: "최대 참가 인원", example: 20, minimum: 1 })
  @IsInt({ message: "모집 인원은 정수여야 합니다." })
  @Min(1, { message: "모집 인원은 1명 이상이어야 합니다." })
  maxParticipants!: number;

  @ApiProperty({ description: "홈팀 이름", required: false })
  @IsOptional()
  @IsString()
  homeTeamName?: string;

  @ApiProperty({ description: "어웨이팀 이름", required: false })
  @IsOptional()
  @IsString()
  awayTeamName?: string;

  @ApiProperty({
    description: "경기 규칙 배열",
    type: [String],
    example: ["정시 시작", "보호장비 필수"],
    required: false,
  })
  @IsOptional()
  @IsArray()
  rules?: string[];

  @ApiProperty({ description: "추가 설명", required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
