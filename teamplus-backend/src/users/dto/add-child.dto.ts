import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

/**
 * 자녀 추가(기존 자녀 User 링크) 요청.
 * birthDate 대조로 임의 자녀 무단 클레임을 차단한다.
 */
export class AddChildDto {
  @ApiProperty({
    description: "자녀 생년월일 (YYYY-MM-DD) — 자녀 프로필과 일치해야 링크 허용",
    example: "2016-03-15",
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "생년월일 형식은 YYYY-MM-DD 여야 합니다.",
  })
  birthDate!: string;
}
