import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Length,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * 갤러리 카테고리 — Prisma GalleryCategory enum과 동기화.
 */
export enum GalleryCategoryDto {
  TRAINING = "TRAINING",
  GAME = "GAME",
  EVENT = "EVENT",
  TOURNAMENT = "TOURNAMENT",
  DAILY = "DAILY",
  AWARD = "AWARD",
  OTHER = "OTHER",
}

/**
 * 갤러리 공개 범위 — Prisma GalleryVisibility enum과 동기화.
 */
export enum GalleryVisibilityDto {
  PUBLIC = "PUBLIC",
  CLUB_ONLY = "CLUB_ONLY",
  MEMBERS_ONLY = "MEMBERS_ONLY",
  PRIVATE = "PRIVATE",
}

/**
 * 갤러리(앨범) 생성 DTO.
 *
 * ADMIN / DIRECTOR / COACH만 호출 가능 (컨트롤러 @Roles 참고).
 */
export class CreateGalleryDto {
  @ApiProperty({
    description: "갤러리 제목",
    example: "2026 봄 시즌 훈련",
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @Length(1, 100, { message: "갤러리 제목은 1~100자로 입력해주세요." })
  title!: string;

  @ApiProperty({
    description: "갤러리 설명 (선택)",
    example: "봄 시즌 훈련 사진 모음",
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: "소속 클럽 ID (선택, 코치 개인 갤러리일 경우 생략)",
    example: "clxxx_club_id",
    required: false,
  })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({
    description: "대표 사진 URL (선택)",
    example: "https://cdn.teamplus.com/galleries/cover.jpg",
    required: false,
  })
  @IsOptional()
  @IsString()
  coverPhotoUrl?: string;

  @ApiProperty({
    description: "갤러리 카테고리",
    enum: GalleryCategoryDto,
    example: GalleryCategoryDto.TRAINING,
    default: GalleryCategoryDto.OTHER,
    required: false,
  })
  @IsOptional()
  @IsEnum(GalleryCategoryDto, {
    message:
      "카테고리는 TRAINING, GAME, EVENT, TOURNAMENT, DAILY, AWARD, OTHER 중 하나여야 합니다.",
  })
  category?: GalleryCategoryDto;

  @ApiProperty({
    description: "공개 범위",
    enum: GalleryVisibilityDto,
    example: GalleryVisibilityDto.CLUB_ONLY,
    default: GalleryVisibilityDto.CLUB_ONLY,
    required: false,
  })
  @IsOptional()
  @IsEnum(GalleryVisibilityDto, {
    message:
      "공개 범위는 PUBLIC, CLUB_ONLY, MEMBERS_ONLY, PRIVATE 중 하나여야 합니다.",
  })
  visibility?: GalleryVisibilityDto;

  @ApiProperty({
    description: "정렬 순서 (선택, 기본 0)",
    example: 0,
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @IsInt({ message: "정렬 순서는 정수여야 합니다." })
  @Min(0, { message: "정렬 순서는 0 이상이어야 합니다." })
  sortOrder?: number;
}
