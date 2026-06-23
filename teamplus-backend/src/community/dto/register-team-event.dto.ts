import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class RegisterTeamEventDto {
  @ApiProperty({
    description: "클럽 회원(ClubMember) ID",
    example: "member-uuid",
  })
  @IsString({ message: "memberId는 문자열이어야 합니다." })
  memberId!: string;

  @ApiPropertyOptional({
    description: "신청 메모",
    example: "U10 홍길동, 토요일만 참석 가능합니다.",
  })
  @IsString({ message: "메모는 문자열이어야 합니다." })
  @MaxLength(500, { message: "메모는 500자 이하여야 합니다." })
  memo?: string;
}
