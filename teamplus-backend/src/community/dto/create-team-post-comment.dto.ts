import { ApiProperty, PartialType } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class CreateTeamPostCommentDto {
  @ApiProperty({
    description: "댓글 내용",
    example: "참가 신청합니다. U10 홍길동 1명입니다.",
  })
  @IsString({ message: "내용은 문자열이어야 합니다." })
  @MaxLength(500, { message: "댓글은 500자 이하여야 합니다." })
  content!: string;
}

export class UpdateTeamPostCommentDto extends PartialType(
  CreateTeamPostCommentDto,
) {}
