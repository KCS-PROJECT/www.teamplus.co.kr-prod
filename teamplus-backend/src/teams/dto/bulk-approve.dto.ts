import { IsNotEmpty, IsArray, ArrayMinSize, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class BulkApproveMembersDto {
  @ApiProperty({
    example: ["member-uuid-1", "member-uuid-2", "member-uuid-3"],
    description: "승인할 회원 ID 목록",
    type: [String],
  })
  @IsNotEmpty({ message: "회원 ID 목록은 필수입니다." })
  @IsArray({ message: "회원 ID 목록은 배열이어야 합니다." })
  @ArrayMinSize(1, { message: "최소 1명 이상의 회원을 선택해주세요." })
  @IsString({ each: true, message: "회원 ID는 문자열이어야 합니다." })
  memberIds!: string[];
}
