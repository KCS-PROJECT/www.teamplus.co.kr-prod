import { IsString, MinLength, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ChangeMyPasswordDto {
  @ApiProperty({
    description: "현재 비밀번호",
    example: "CurrentPass1!",
  })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    description: "새 비밀번호 (8자 이상, 영문/숫자/특수문자 포함)",
    example: "NewPass1234!",
  })
  @IsString()
  @MinLength(8, { message: "비밀번호는 8자 이상이어야 합니다." })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
    message: "비밀번호는 영문, 숫자, 특수문자를 포함해야 합니다.",
  })
  newPassword!: string;
}
