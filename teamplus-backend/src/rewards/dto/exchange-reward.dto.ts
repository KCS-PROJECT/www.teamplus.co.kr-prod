import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ExchangeRewardDto {
  @ApiProperty({ description: "완료된 스티커판 ID" })
  @IsString()
  @IsNotEmpty()
  boardId!: string;
}
