import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

const CATEGORIES = [
  "helmet",
  "skate",
  "pad",
  "stick",
  "goal",
  "ice",
  "other",
] as const;
const CONDITIONS = ["good", "minor_issue", "critical", "replaced"] as const;
const STATUSES = ["pending", "completed", "issue_found"] as const;

export class InspectionItemDto {
  @ApiProperty({ description: "장비 카테고리", enum: CATEGORIES })
  @IsIn([...CATEGORIES])
  category!: (typeof CATEGORIES)[number];

  @ApiProperty({ description: "항목명", example: "헬멧 #5" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  itemName!: string;

  @ApiPropertyOptional({
    description: "상태",
    enum: CONDITIONS,
    default: "good",
  })
  @IsOptional()
  @IsIn([...CONDITIONS])
  condition?: (typeof CONDITIONS)[number];

  @ApiPropertyOptional({
    description: "이상 상세 (condition != 'good' 일 때 필수)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  issueDetail?: string;

  @ApiPropertyOptional({ description: "사진 URL" })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ description: "액션 필요 여부" })
  @IsOptional()
  @IsBoolean()
  needsAction?: boolean;

  @ApiPropertyOptional({ description: "수리/교체 담당자 User ID" })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: "정렬 순서", default: 0 })
  @IsOptional()
  sortOrder?: number;
}

export class CreateEquipmentInspectionDto {
  @ApiProperty({ description: "팀 ID" })
  @IsString()
  @IsNotEmpty()
  teamId!: string;

  @ApiPropertyOptional({ description: "점검 장소 (Venue ID)" })
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiPropertyOptional({ description: "점검 시각 (ISO). 미지정 시 서버 시간." })
  @IsOptional()
  @IsDateString()
  inspectedAt?: string;

  @ApiPropertyOptional({ description: "종합 메모" })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiProperty({ description: "점검 항목", type: [InspectionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionItemDto)
  items!: InspectionItemDto[];
}

export class UpdateEquipmentInspectionDto {
  @ApiPropertyOptional({ description: "상태", enum: STATUSES })
  @IsOptional()
  @IsIn([...STATUSES])
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ description: "종합 메모" })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
