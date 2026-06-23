import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

/**
 * 개별 사진 항목 DTO.
 */
export class PhotoItemDto {
  @ApiProperty({
    description: "원본 사진 URL",
    example: "https://cdn.teamplus.com/galleries/photo1.jpg",
  })
  @IsString()
  photoUrl!: string;

  @ApiProperty({
    description: "썸네일 URL",
    example: "https://cdn.teamplus.com/galleries/photo1_thumb.jpg",
  })
  @IsString()
  thumbnailUrl!: string;

  @ApiProperty({
    description: "사진 캡션 (선택)",
    example: "팀 전체 단체 사진",
    required: false,
  })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiProperty({
    description: "촬영 일시 (ISO-8601, 선택)",
    example: "2026-04-10T14:30:00.000Z",
    required: false,
  })
  @IsOptional()
  @IsDateString({}, { message: "촬영 일시 형식이 올바르지 않습니다." })
  takenAt?: string;

  @ApiProperty({
    description: "정렬 순서 (선택, 기본 0)",
    example: 0,
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @IsInt({ message: "정렬 순서는 정수여야 합니다." })
  @Min(0)
  sortOrder?: number;
}

/**
 * 단일 사진 추가 DTO (POST /:id/photos).
 */
export class AddPhotoDto extends PhotoItemDto {}

/**
 * 다중 사진 일괄 추가 DTO (POST /:id/photos/bulk).
 */
export class BulkAddPhotosDto {
  @ApiProperty({
    description: "추가할 사진 배열 (1장 이상)",
    type: [PhotoItemDto],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "최소 1장 이상의 사진을 포함해야 합니다." })
  @ValidateNested({ each: true })
  @Type(() => PhotoItemDto)
  photos!: PhotoItemDto[];
}
