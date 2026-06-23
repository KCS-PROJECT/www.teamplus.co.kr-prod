import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsUrl,
  IsEnum,
  IsArray,
  ArrayMinSize,
  IsInt,
  IsDateString,
  MinLength,
  MaxLength,
  IsBoolean,
} from "class-validator";

export enum PopupLinkType {
  EXTERNAL = "EXTERNAL",
  INTERNAL = "INTERNAL",
  NONE = "NONE",
}

export class CreateMainPopupDto {
  @ApiProperty({
    description: "팝업 제목",
    minLength: 2,
    maxLength: 100,
    example: "신규 회원 이벤트",
  })
  @IsString()
  @MinLength(2, { message: "제목은 최소 2자 이상이어야 합니다." })
  @MaxLength(100, { message: "제목은 최대 100자까지 가능합니다." })
  title!: string;

  @ApiProperty({
    description: "팝업 이미지 URL",
    example: "https://cdn.teamplus.com/popups/event.jpg",
  })
  @IsString()
  @IsUrl({}, { message: "유효한 이미지 URL을 입력해주세요." })
  imageUrl!: string;

  @ApiPropertyOptional({
    description: "클릭 시 이동할 링크 URL",
    example: "https://teamplus.com/events/1",
  })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: "유효한 링크 URL을 입력해주세요." })
  linkUrl?: string;

  @ApiProperty({
    description: "링크 타입",
    enum: PopupLinkType,
    example: PopupLinkType.EXTERNAL,
  })
  @IsEnum(PopupLinkType, {
    message: "링크 타입은 EXTERNAL, INTERNAL, NONE 중 하나여야 합니다.",
  })
  linkType!: PopupLinkType;

  @ApiProperty({
    description: "팝업 대상 역할 목록",
    example: ["PARENT", "COACH"],
    isArray: true,
  })
  @IsArray({ message: "대상 역할은 배열이어야 합니다." })
  @ArrayMinSize(1, { message: "대상 역할은 최소 1개 이상이어야 합니다." })
  @IsString({ each: true })
  targetRoles!: string[];

  @ApiPropertyOptional({
    description: "정렬 순서 (낮을수록 우선)",
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: "정렬 순서는 정수여야 합니다." })
  sortOrder?: number;

  @ApiProperty({
    description: "팝업 시작일시",
    example: "2026-04-12T00:00:00Z",
  })
  @IsDateString({}, { message: "유효한 날짜 형식을 입력해주세요." })
  startAt!: string;

  @ApiProperty({
    description: "팝업 종료일시",
    example: "2026-05-12T23:59:59Z",
  })
  @IsDateString({}, { message: "유효한 날짜 형식을 입력해주세요." })
  endAt!: string;
}

export class UpdateMainPopupDto extends PartialType(CreateMainPopupDto) {}

export class ToggleMainPopupDto {
  @ApiProperty({ description: "활성화 여부", example: true })
  @IsBoolean({ message: "활성화 여부는 boolean이어야 합니다." })
  isActive!: boolean;
}
