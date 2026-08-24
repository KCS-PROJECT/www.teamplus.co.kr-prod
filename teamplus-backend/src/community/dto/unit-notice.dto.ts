import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/** 첨부 이미지 허용 MIME — 공용 files/upload category=IMAGE 정책과 동일 (4종·10MB) */
export const UNIT_NOTICE_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export const UNIT_NOTICE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** 공지 1건당 첨부 이미지 최대 장수 — 프론트 IMAGE_MAX_COUNT 와 동일 계약 */
export const UNIT_NOTICE_IMAGE_MAX_COUNT = 5;

export class UnitNoticeAttachmentDto {
  @ApiProperty({
    description: "파일 URL (공용 files/upload category=IMAGE 업로드 선행)",
    example: "/uploads/image/2026/08/xxx.webp",
  })
  @IsString()
  @MaxLength(2048)
  fileUrl!: string;

  @ApiProperty({ description: "파일명", example: "schedule.jpg" })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({
    description: "MIME 타입 (이미지 4종만)",
    enum: UNIT_NOTICE_IMAGE_MIMES,
  })
  @IsString()
  @IsIn([...UNIT_NOTICE_IMAGE_MIMES], {
    message: "이미지 파일만 첨부할 수 있습니다.",
  })
  fileType!: string;

  @ApiProperty({ description: "파일 크기 (bytes, 최대 10MB)" })
  @IsInt()
  @Min(0)
  @Max(UNIT_NOTICE_IMAGE_MAX_BYTES, {
    message: "이미지는 10MB 이하만 첨부할 수 있습니다.",
  })
  fileSize!: number;
}

/**
 * 단위 공지 작성 — 축 배타: teamId·targetClassId·targetTournamentId 중 정확히 1개.
 * (축 배타 검증은 DTO 가 아닌 서비스에서 수행 — DB CHECK 와 동일 판정)
 */
export class CreateUnitPostDto {
  @ApiProperty({ description: "제목", example: "9월 훈련 일정 안내" })
  @IsString({ message: "제목은 문자열이어야 합니다." })
  @MaxLength(200, { message: "제목은 200자 이하여야 합니다." })
  title!: string;

  @ApiProperty({ description: "내용", maxLength: 10000 })
  @IsString({ message: "내용은 문자열이어야 합니다." })
  @MaxLength(10000, { message: "내용은 10000자 이하여야 합니다." })
  content!: string;

  @ApiPropertyOptional({ description: "팀 축 — 팀 게시판 글" })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: "수업 축 — 수업 공지" })
  @IsOptional()
  @IsString()
  targetClassId?: string;

  @ApiPropertyOptional({ description: "대회 축 — 대회 공지" })
  @IsOptional()
  @IsString()
  targetTournamentId?: string;

  @ApiPropertyOptional({ description: "상단 고정 여부" })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({
    description: "예약 게시 시작 (ISO, 미래=예약 — 도래 시 노출만, 자동 푸시 없음)",
  })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ description: "게시 만료 (ISO)" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: "첨부 이미지 목록",
    type: [UnitNoticeAttachmentDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(UNIT_NOTICE_IMAGE_MAX_COUNT, {
    message: `이미지는 최대 ${UNIT_NOTICE_IMAGE_MAX_COUNT}장까지 첨부할 수 있습니다.`,
  })
  @ValidateNested({ each: true })
  @Type(() => UnitNoticeAttachmentDto)
  attachments?: UnitNoticeAttachmentDto[];
}

/** 수정 — 축(스코프)은 수정 불가, 내용·고정·게시기간만 */
export class UpdateUnitPostDto {
  @ApiPropertyOptional({ description: "제목" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: "내용" })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string;

  @ApiPropertyOptional({ description: "상단 고정 여부" })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ description: "예약 게시 시작 (null 전송 시 해제)" })
  @IsOptional()
  @IsDateString()
  startAt?: string | null;

  @ApiPropertyOptional({ description: "게시 만료 (null 전송 시 해제)" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class CreateUnitCommentDto {
  @ApiProperty({ description: "댓글 내용", maxLength: 2000 })
  @IsString({ message: "댓글 내용은 문자열이어야 합니다." })
  @MaxLength(2000, { message: "댓글은 2000자 이하여야 합니다." })
  content!: string;
}

export class UpdateUnitCommentDto extends CreateUnitCommentDto {}
