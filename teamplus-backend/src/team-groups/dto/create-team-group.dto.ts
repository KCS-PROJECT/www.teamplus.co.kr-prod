import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayUnique,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

// [2026-06-05] 레거시 U8~U12 호환 보존용 export (하위그룹 연령대는 출생연도 문자열로 전환).
export const AGE_GROUPS = ["U8", "U9", "U10", "U11", "U12"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export class CreateTeamGroupDto {
  @ApiProperty({ description: "그룹 이름", example: "선수반 A조" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: "참가 대상 출생연도 (예: \"2016\"). 레거시 U8~U12 값도 허용(호환).",
    required: false,
    example: "2016",
  })
  @IsOptional()
  @IsString()
  ageGroup?: string;

  @ApiProperty({
    description: "그룹에 포함할 ClubMember.id 목록",
    type: [String],
    required: false,
    example: ["cmxxx1", "cmxxx2"],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  memberIds?: string[];
}
