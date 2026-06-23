import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsNumber,
  Min,
  Max,
} from "class-validator";

export class JoinTeamDto {
  @IsString()
  @IsNotEmpty({ message: "팀 초대 코드는 필수입니다." })
  @MinLength(3, { message: "올바른 초대 코드를 입력해주세요." })
  teamCode!: string;

  @IsString()
  @IsNotEmpty({ message: "선수 이름은 필수입니다." })
  @MinLength(2, { message: "선수 이름은 최소 2글자 이상이어야 합니다." })
  playerName!: string;

  @IsNumber()
  @IsNotEmpty({ message: "선수 나이는 필수입니다." })
  @Min(0, { message: "선수 나이는 0 이상이어야 합니다." })
  @Max(120, { message: "선수 나이는 120 이하여야 합니다." })
  playerAge!: number;
}
