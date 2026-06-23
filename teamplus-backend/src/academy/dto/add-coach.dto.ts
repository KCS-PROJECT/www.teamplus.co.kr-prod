import { IsString, IsOptional, IsNotEmpty, IsIn } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AddCoachDto {
  @ApiProperty({ description: "코치 User ID" })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({
    description: "코치 역할",
    enum: ["HEAD_COACH", "ASSISTANT_COACH"],
    default: "ASSISTANT_COACH",
  })
  @IsOptional()
  @IsString()
  @IsIn(["HEAD_COACH", "ASSISTANT_COACH"])
  role?: string;
}
