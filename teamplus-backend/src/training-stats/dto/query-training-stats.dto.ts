import {
  IsOptional,
  IsInt,
  Min,
  IsDateString,
  IsString,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class QueryTrainingStatsDto {
  @ApiPropertyOptional({ description: "페이지 번호", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "페이지당 항목 수", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ description: "시작일 (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "종료일 (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  // [추가 2026-05-15 db-keeper] T03/L — 통계 teamId 격리.
  //  · 명시 시 같은 회원이라도 다른 팀의 세션은 응답에서 제외.
  //  · 컨트롤러는 호출자 권한과 teamId 소속 여부를 별도 검증한다 (T01과 협업).
  @ApiPropertyOptional({ description: "팀 ID (teamId 격리 필터)" })
  @IsOptional()
  @IsString()
  teamId?: string;
}
