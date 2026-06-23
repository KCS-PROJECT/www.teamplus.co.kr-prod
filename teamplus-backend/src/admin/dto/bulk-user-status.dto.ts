import { IsArray, IsBoolean, IsString, ArrayMinSize } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class BulkUserStatusDto {
  @ApiProperty({
    description: "변경할 사용자 ID 배열",
    example: ["user-uuid-1", "user-uuid-2"],
    type: [String],
  })
  @IsArray({ message: "userIds는 배열이어야 합니다." })
  @ArrayMinSize(1, { message: "최소 1명의 사용자를 지정해야 합니다." })
  @IsString({ each: true, message: "각 userId는 문자열이어야 합니다." })
  userIds!: string[];

  @ApiProperty({
    description: "변경할 인증 상태",
    example: true,
  })
  @IsBoolean({ message: "isVerified는 boolean이어야 합니다." })
  isVerified!: boolean;
}
