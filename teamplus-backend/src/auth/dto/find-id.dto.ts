import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class FindIdDto {
  @ApiProperty({ example: "홍길동", description: "이름" })
  @IsNotEmpty({ message: "이름은 필수입니다." })
  @IsString()
  name!: string;

  @ApiProperty({ example: "01012345678", description: "휴대폰 번호" })
  @IsNotEmpty({ message: "휴대폰 번호는 필수입니다." })
  @IsString()
  phone!: string;
}
