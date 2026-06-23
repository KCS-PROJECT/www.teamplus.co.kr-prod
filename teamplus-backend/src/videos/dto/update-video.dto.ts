import { ApiPropertyOptional } from "@nestjs/swagger";
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

export class UpdateVideoDto {
  @ApiPropertyOptional({
    description: "영상 제목",
    example: "U12 훈련 하이라이트",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: "영상 설명" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: "영상 유형",
    enum: ["training", "match", "highlight", "other"],
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

  @ApiPropertyOptional({ description: "공개 여부" })
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

  @ApiPropertyOptional({
    description: "영상 상태",
    enum: ["processing", "ready", "failed"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["processing", "ready", "failed"])
  status?: string;
}
