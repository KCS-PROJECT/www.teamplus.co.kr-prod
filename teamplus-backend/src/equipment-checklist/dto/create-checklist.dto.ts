import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
  IsInt,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ChecklistItemDto {
  @ApiProperty({ description: "항목명", example: "헬멧" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  itemName!: string;

  @ApiPropertyOptional({
    description: "Material icon 이름",
    example: "sports_hockey",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  iconName?: string;

  @ApiPropertyOptional({ description: "아이템 이미지 URL" })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: "정렬 순서", default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateChecklistDto {
  @ApiPropertyOptional({
    description: "체크리스트 제목",
    default: "가방 챙기기",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: "연결 수업 ID" })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ description: "클럽 ID" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({
    description: "체크리스트 항목 배열",
    type: [ChecklistItemDto],
    example: [
      { itemName: "헬멧", iconName: "sports_hockey", sortOrder: 0 },
      { itemName: "스케이트", iconName: "ice_skating", sortOrder: 1 },
    ],
  })
  @IsArray()
  @ArrayMinSize(1, { message: "최소 1개 이상의 항목이 필요합니다." })
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items!: ChecklistItemDto[];
}
