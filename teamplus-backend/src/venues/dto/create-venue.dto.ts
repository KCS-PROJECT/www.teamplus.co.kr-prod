import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsNumber,
  IsArray,
  IsIn,
  MaxLength,
  Matches,
  Min,
  Max,
  ValidateNested,
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 운영 시간 서브 DTO
 * - open/close: "HH:mm" 포맷 (예: "09:00")
 */
export class OperatingHoursDto {
  @ApiProperty({ example: "09:00", description: "오픈 시간 (HH:mm)" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "오픈 시간 형식이 올바르지 않습니다. (HH:mm)",
  })
  open!: string;

  @ApiProperty({ example: "22:00", description: "마감 시간 (HH:mm)" })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "마감 시간 형식이 올바르지 않습니다. (HH:mm)",
  })
  close!: string;
}

/**
 * 구장(Venue) 생성 요청 DTO
 *
 * - 권한: ADMIN / DIRECTOR / COACH 만 호출 가능 (컨트롤러에서 @Roles)
 * - XSS 방어는 ValidationPipe(whitelist) + 서비스 레벨 sanitize-html로 2중 적용
 */
export class CreateVenueDto {
  @ApiProperty({ example: "목동 아이스링크 제1경기장", description: "구장명" })
  @IsNotEmpty({ message: "구장명은 필수입니다." })
  @IsString({ message: "구장명은 문자열이어야 합니다." })
  @MaxLength(100, { message: "구장명은 100자 이내로 입력해주세요." })
  name!: string;

  @ApiPropertyOptional({
    example: "서울 양천구 안양천로 939",
    description: "구장 주소",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "주소는 200자 이내로 입력해주세요." })
  address?: string;

  @ApiPropertyOptional({
    example: "지하 1층",
    description: "상세 주소",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressDetail?: string;

  @ApiPropertyOptional({ example: "서울", description: "도시" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  city?: string;

  @ApiPropertyOptional({ example: "07996", description: "우편번호" })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @ApiPropertyOptional({
    example: "02-2649-8454",
    description: "대표 전화번호",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9\-+()\s]{7,20}$/, {
    message: "전화번호 형식이 올바르지 않습니다.",
  })
  phone?: string;

  @ApiPropertyOptional({ example: 37.5247, description: "위도" })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 126.8708, description: "경도" })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: 500, description: "수용 인원" })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    example: "International",
    description: "링크 크기 (NHL|International|Olympic)",
    enum: ["NHL", "International", "Olympic", "Custom"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["NHL", "International", "Olympic", "Custom"])
  rinkSize?: string;

  @ApiPropertyOptional({
    example: ["locker_room", "shower", "parking", "stand"],
    description:
      "시설 목록 (locker_room|shower|parking|stand|cafe|pro_shop|rental|kids_room)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({
    type: OperatingHoursDto,
    description: "운영 시간 (오픈/마감)",
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OperatingHoursDto)
  operatingHours?: OperatingHoursDto;

  @ApiPropertyOptional({
    example: "active",
    description: "운영 상태 (active|maintenance|closed)",
    enum: ["active", "maintenance", "closed"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["active", "maintenance", "closed"])
  status?: string;

  @ApiPropertyOptional({
    example: "https://cdn.teamplus.com/venues/mokdong-1.jpg",
    description: "대표 이미지 URL",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  @ApiPropertyOptional({
    example: 150000,
    description: "시간당 대관료 (원)",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({
    example: "clxy-club-id-123",
    description: "소속 클럽 ID",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({
    example: "지상과 지하 2개 링크 보유. 주차 넉넉.",
    description: "시설 안내 / 소개 텍스트",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "시설 안내는 2000자 이내로 입력해주세요." })
  description?: string;
}
