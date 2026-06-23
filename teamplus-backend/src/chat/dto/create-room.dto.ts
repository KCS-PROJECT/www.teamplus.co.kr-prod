import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateChatRoomDto {
  @ApiProperty({
    description: "채팅 유형",
    enum: ["DIRECT", "GROUP", "CLUB", "CLASS"],
  })
  @IsString()
  @IsIn(["DIRECT", "GROUP", "CLUB", "CLASS"])
  type!: string;

  @ApiPropertyOptional({
    description: "그룹 채팅방 이름 (GROUP/CLUB/CLASS 필수)",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiProperty({
    description: "초대할 사용자 ID 배열 (DIRECT: 1명, GROUP: 2~49명)",
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(49)
  memberIds!: string[];

  @ApiPropertyOptional({ description: "클럽 ID (type=CLUB 시)" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: "수업 ID (type=CLASS 시)" })
  @IsOptional()
  @IsString()
  classId?: string;
}

export class SendMessageDto {
  @ApiProperty({ description: "메시지 내용" })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;

  @ApiPropertyOptional({
    description: "메시지 유형",
    enum: ["TEXT", "IMAGE", "FILE", "SYSTEM"],
  })
  @IsOptional()
  @IsString()
  @IsIn(["TEXT", "IMAGE", "FILE", "SYSTEM"])
  type?: string;

  @ApiPropertyOptional({ description: "1:1 채팅 수신자 ID" })
  @IsOptional()
  @IsString()
  receiverId?: string;
}
