import { IsIn } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ReviewSwapRequestDto {
  @ApiProperty({
    description: "승인 또는 거부",
    enum: ["approved", "rejected"],
  })
  @IsIn(["approved", "rejected"], {
    message: "상태는 approved 또는 rejected만 가능합니다.",
  })
  status!: "approved" | "rejected";
}
