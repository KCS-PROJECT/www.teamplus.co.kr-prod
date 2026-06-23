import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateNoticeCommentDto {
  @ApiProperty({
    description: "댓글 내용",
    example: "공지 내용 확인했습니다.",
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty({ message: "댓글 내용을 입력해주세요." })
  @MaxLength(2000, { message: "댓글은 2000자 이내로 작성해주세요." })
  content!: string;
}
