import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  Matches,
  MinLength,
} from "class-validator";

export class CreateCoachDto {
  @ApiProperty({ example: "김철수", description: "코치 이름" })
  @IsString()
  @IsNotEmpty({ message: "이름을 입력해주세요." })
  name!: string;

  @ApiProperty({ example: "01012345678", description: "전화번호" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10,13}$/, {
    message: "올바른 전화번호 형식이 아닙니다. (숫자 10~13자리)",
  })
  phone!: string;

  @ApiProperty({
    example: "hong123",
    description: "로그인 아이디 (영문 소문자 시작, 영소문자·숫자·_ 4~20자)",
  })
  @IsString()
  @IsNotEmpty({ message: "아이디를 입력해주세요." })
  @Matches(/^[a-z][a-z0-9_]{3,19}$/, {
    message:
      "아이디는 영문 소문자로 시작하고, 영문 소문자·숫자·언더스코어(_)를 사용해 4~20자로 입력해주세요.",
  })
  loginId!: string;

  @ApiProperty({ example: "SecurePass123", description: "비밀번호 (최소 8자)" })
  @IsString()
  @IsNotEmpty({ message: "비밀번호를 입력해주세요." })
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  password!: string;

  @ApiPropertyOptional({
    description: "팀 내 직책 (COACH=코치 · MANAGER=단장). 미지정 시 COACH.",
    enum: ["COACH", "MANAGER"],
    default: "COACH",
  })
  @IsOptional()
  @IsIn(["COACH", "MANAGER"], {
    message: "직책은 코치 또는 단장만 선택할 수 있습니다.",
  })
  roleInTeam?: "COACH" | "MANAGER";
}
