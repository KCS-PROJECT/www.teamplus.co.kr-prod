import { IsString, IsIn } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ApproveMemberDto {
  @ApiProperty({
    description: "승인 상태",
    enum: ["ACTIVE", "REJECTED"],
  })
  @IsString()
  @IsIn(["ACTIVE", "REJECTED"])
  status!: string;
}
