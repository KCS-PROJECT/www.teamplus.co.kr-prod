import { IsString, IsNotEmpty, Length, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * PIN 검증 DTO
 *
 * 자녀 PIN을 검증할 때 사용합니다.
 * 학부모, 청소년, 아동 모두 사용 가능합니다.
 */
export class VerifyPinDto {
  @ApiProperty({
    description: "자녀 프로필 ID",
    example: "clxyz1234567890",
  })
  @IsString({ message: "자녀 프로필 ID는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "자녀 프로필 ID를 입력해주세요." })
  childProfileId!: string;

  @ApiProperty({
    description: "6자리 숫자 PIN",
    example: "482916",
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: "PIN은 문자열이어야 합니다." })
  @IsNotEmpty({ message: "PIN을 입력해주세요." })
  @Length(6, 6, { message: "PIN은 정확히 6자리여야 합니다." })
  @Matches(/^\d{6}$/, { message: "PIN은 6자리 숫자만 가능합니다." })
  pin!: string;
}
