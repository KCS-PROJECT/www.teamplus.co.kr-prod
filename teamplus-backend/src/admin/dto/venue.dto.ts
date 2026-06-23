import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  IsEnum,
  IsObject,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export enum VenueStatus {
  ACTIVE = "active",
  MAINTENANCE = "maintenance",
  CLOSED = "closed",
}

export enum RinkSize {
  NHL = "NHL",
  INTERNATIONAL = "International",
  OLYMPIC = "Olympic",
}

export class CreateVenueDto {
  @ApiProperty({
    description: "구장명",
    example: "강남 아이스링크",
  })
  @IsNotEmpty({ message: "구장명은 필수입니다." })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: "연결할 클럽 ID",
    example: "club-uuid",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({
    description: "주소",
    example: "서울시 강남구 테헤란로 123",
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: "상세 주소",
    example: "지하 1층",
  })
  @IsOptional()
  @IsString()
  addressDetail?: string;

  @ApiPropertyOptional({
    description: "도시",
    example: "서울",
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: "우편번호",
    example: "06234",
  })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({
    description: "연락처",
    example: "02-1234-5678",
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: "위도",
    example: 37.5012,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({
    description: "경도",
    example: 127.0396,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    description: "수용 인원",
    example: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    description: "링크 사이즈",
    enum: RinkSize,
    example: RinkSize.NHL,
  })
  @IsOptional()
  @IsEnum(RinkSize)
  rinkSize?: RinkSize;

  @ApiPropertyOptional({
    description: "편의시설 (JSON)",
    example: { locker_rooms: true, pro_shop: true, cafe: true, parking: true },
  })
  @IsOptional()
  @IsObject()
  amenities?: Record<string, boolean>;

  @ApiPropertyOptional({
    description: "운영 시간 (JSON)",
    example: {
      monday: { open: "06:00", close: "22:00" },
      tuesday: { open: "06:00", close: "22:00" },
    },
  })
  @IsOptional()
  @IsObject()
  operatingHours?: Record<string, { open: string; close: string }>;

  @ApiPropertyOptional({
    description: "시간당 대여료 (원)",
    example: 150000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({
    description: "관리자 ID",
    example: "user-uuid",
  })
  @IsOptional()
  @IsString()
  managerId?: string;

  @ApiPropertyOptional({
    description: "대표 이미지 URL",
    example: "https://example.com/venue.jpg",
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateVenueDto extends CreateVenueDto {}

export class UpdateVenueStatusDto {
  @ApiProperty({
    description: "변경할 상태",
    enum: VenueStatus,
    example: VenueStatus.MAINTENANCE,
  })
  @IsNotEmpty({ message: "상태는 필수입니다." })
  @IsEnum(VenueStatus)
  status!: VenueStatus;

  @ApiPropertyOptional({
    description: "정비/점검 메모",
    example: "빙질 관리 작업",
  })
  @IsOptional()
  @IsString()
  maintenanceNote?: string;

  @ApiPropertyOptional({
    description: "예상 종료일",
    example: "2026-01-20",
  })
  @IsOptional()
  @IsString()
  expectedEndDate?: string;
}

export class VenueQueryDto {
  @ApiPropertyOptional({
    description: "클럽 ID로 필터링",
    example: "club-uuid",
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({
    description: "도시로 필터링",
    example: "서울",
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: "상태 필터",
    enum: VenueStatus,
  })
  @IsOptional()
  @IsEnum(VenueStatus)
  status?: VenueStatus;

  @ApiPropertyOptional({
    description: "검색어 (구장명, 주소)",
    example: "강남",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "페이지 번호",
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "페이지 크기",
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
