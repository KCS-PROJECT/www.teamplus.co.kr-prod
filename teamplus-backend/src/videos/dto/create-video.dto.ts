import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  MaxLength,
  IsIn,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateVideoDto {
  @ApiProperty({ description: "영상 제목", example: "U12 훈련 하이라이트" })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: "영상 설명" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: "클럽 ID" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiProperty({
    description: "영상 유형",
    enum: ["training", "match", "highlight", "other"],
    default: "training",
  })
  @IsOptional()
  @IsString()
  @IsIn(["training", "match", "highlight", "other"])
  videoType?: string;

  @ApiPropertyOptional({ description: "대회 ID" })
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @ApiPropertyOptional({ description: "경기 ID" })
  @IsOptional()
  @IsString()
  matchId?: string;

  @ApiPropertyOptional({ description: "수업 ID" })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ description: "공개 여부", default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isPublic?: boolean;

  @ApiPropertyOptional({ description: "영상 길이 (초 단위)", example: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  duration?: number;
}
