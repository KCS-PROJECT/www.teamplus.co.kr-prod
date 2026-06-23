import { IsString, IsNotEmpty, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class BroadcastNoticeDto {
  @ApiProperty({
    description: "공지 제목",
    example: "4월 수업 일정 안내",
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty({ message: "제목을 입력해주세요." })
  @MaxLength(100, { message: "제목은 100자 이내로 입력해주세요." })
  title!: string;

  @ApiProperty({
    description: "공지 내용",
    example: "4월 수업은 매주 화/목 19:00에 진행됩니다.",
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty({ message: "내용을 입력해주세요." })
  @MaxLength(2000, { message: "내용은 2000자 이내로 입력해주세요." })
  message!: string;
}
