import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsString, Min } from "class-validator";
import { ALLOWED_MIME_TYPES } from "@/common/utils/sanitize.util";

export class AddAttachmentDto {
  @ApiProperty({
    description: "파일 URL (S3)",
    example: "https://s3.amazonaws.com/bucket/file.jpg",
  })
  @IsString({ message: "fileUrl은 문자열이어야 합니다." })
  fileUrl!: string;

  @ApiProperty({ description: "파일명", example: "훈련일정.jpg" })
  @IsString({ message: "fileName은 문자열이어야 합니다." })
  fileName!: string;

  @ApiProperty({
    description: "파일 타입 (MIME type)",
    example: "image/jpeg",
    enum: ALLOWED_MIME_TYPES,
  })
  @IsString({ message: "fileType은 문자열이어야 합니다." })
  @IsIn([...ALLOWED_MIME_TYPES], {
    message:
      "허용되지 않는 파일 형식입니다. (image/jpeg, image/png, image/gif, image/webp, application/pdf, Word, Excel 파일만 허용)",
  })
  fileType!: string;

  @ApiProperty({ description: "파일 크기 (bytes)", example: 102400 })
  @IsInt({ message: "fileSize는 정수여야 합니다." })
  @Min(0, { message: "fileSize는 0 이상이어야 합니다." })
  fileSize!: number;
}
