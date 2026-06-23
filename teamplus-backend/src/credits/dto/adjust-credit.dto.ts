import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsInt,
  IsNotEmpty,
  Min,
  Max,
  MinLength,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "isNotZero", async: false })
class IsNotZeroConstraint implements ValidatorConstraintInterface {
  validate(value: number) {
    return value !== 0;
  }
  defaultMessage() {
    return "조정 수량은 0이 될 수 없습니다.";
  }
}

export class AdjustCreditDto {
  @ApiProperty({
    description: "수업권을 조정할 사용자 User.id",
    example: "user-uuid",
  })
  @IsString()
  @IsNotEmpty({ message: "사용자 ID는 필수입니다." })
  userId!: string;

  @ApiProperty({
    description: "조정할 크레딧 수량 (양수: 추가, 음수: 차감, 0 불가)",
    minimum: -100,
    maximum: 100,
    example: 5,
  })
  @IsInt({ message: "조정 수량은 정수여야 합니다." })
  @Min(-100, { message: "최소 -100까지 조정 가능합니다." })
  @Max(100, { message: "최대 100까지 조정 가능합니다." })
  @Validate(IsNotZeroConstraint)
  amount!: number;

  @ApiProperty({
    description: "조정 사유",
    minLength: 2,
    maxLength: 200,
    example: "관리자 수동 크레딧 추가",
  })
  @IsString()
  @MinLength(2, { message: "조정 사유는 최소 2자 이상이어야 합니다." })
  @MaxLength(200, { message: "조정 사유는 최대 200자까지 가능합니다." })
  reason!: string;
}
