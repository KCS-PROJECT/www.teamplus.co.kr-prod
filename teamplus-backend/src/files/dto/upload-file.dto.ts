import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { UploadCategory } from "@prisma/client";

/**
 * 단일/다중 파일 업로드 DTO (multipart/form-data 본문의 비파일 필드)
 */
export class UploadFileDto {
  @ApiProperty({
    enum: UploadCategory,
    description: "업로드 카테고리 (이미지/문서/영상/아바타/첨부)",
    example: UploadCategory.IMAGE,
  })
  @IsEnum(UploadCategory, {
    message: "유효하지 않은 업로드 카테고리입니다.",
  })
  category!: UploadCategory;

  @ApiProperty({
    required: false,
    description: "연결 리소스 타입 (예: notice · product · chat)",
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  refType?: string;

  @ApiProperty({
    required: false,
    description: "연결 리소스 ID",
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  refId?: string;

  /**
   * 다중 업로드 부분 실패 허용 플래그 — Phase 2.3 SPEC §4.2
   *
   * - false (기본): 하나라도 실패 시 전체 트랜잭션 롤백 + 디스크 정리
   * - true: 개별 try-catch 로 성공/실패 분리, `{ succeeded, failed }` 응답
   *
   * multipart/form-data 전송 시 boolean 문자열 처리: "true" / "1" → true, 그 외 false.
   */
  @ApiProperty({
    required: false,
    description:
      "다중 업로드 부분 실패 허용 (false=전체 롤백, true=성공한 것만 commit)",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowered = value.toLowerCase().trim();
      return lowered === "true" || lowered === "1";
    }
    return false;
  })
  @Type(() => Boolean)
  allowPartial?: boolean;
}

/**
 * 파일 응답 DTO
 *
 * Backend UploadedFile 모델의 관리 필드 전체를 노출합니다.
 * 모든 업로드 응답은 최초등록일/최초등록자/최종수정일/최종수정자/파일타입/사이즈/확장자를 포함합니다.
 */
export class FileResponseDto {
  @ApiProperty({ description: "파일 ID (cuid)" })
  id!: string;

  @ApiProperty({ enum: UploadCategory })
  category!: UploadCategory;

  @ApiProperty({ description: "사용자가 업로드한 원본 파일명" })
  originalName!: string;

  @ApiProperty({
    description:
      "서버 저장 파일명 — 형식: {사용자명}_{YYYYMMDDHHmm}_{hash}.{ext}",
  })
  storedName!: string;

  @ApiProperty({
    required: false,
    description: "확장자 (소문자, 점 제외) — 예: jpg, pdf, mp4",
  })
  extension?: string;

  @ApiProperty({
    description:
      "공개 접근 URL — /uploads/{category}/{YYYY}/{MM}/{DD}/{파일명}",
  })
  url!: string;

  @ApiProperty({
    required: false,
    description:
      "자동 생성 썸네일 URL (sharp 처리 후 — IMAGE/AVATAR 카테고리) — Phase 2.1 SPEC",
  })
  thumbUrl?: string;

  @ApiProperty({
    required: false,
    description:
      "확대/원본 대체 보관본 URL (프로필/로고/자녀사진 파생 large 1280) — display url 의 .display.webp→.large.webp",
  })
  largeUrl?: string;

  @ApiProperty({
    required: false,
    description:
      "EXIF 메타데이터 JSON (sharp 추출 후 — IMAGE 카테고리) — Phase 2.1 SPEC",
    type: "object",
  })
  exifJson?: Record<string, unknown>;

  @ApiProperty({ description: "MIME 타입" })
  mimeType!: string;

  @ApiProperty({ description: "파일 크기(바이트)" })
  size!: number;

  @ApiProperty({ required: false, description: "이미지/영상 가로" })
  width?: number;

  @ApiProperty({ required: false, description: "이미지/영상 세로" })
  height?: number;

  @ApiProperty({ description: "최초 등록자 ID" })
  uploaderId!: string;

  @ApiProperty({
    required: false,
    description: "최종 수정자 ID — 최초엔 uploaderId와 동일",
  })
  modifiedById?: string;

  @ApiProperty({ required: false, description: "연결 리소스 타입" })
  refType?: string;

  @ApiProperty({ required: false, description: "연결 리소스 ID" })
  refId?: string;

  @ApiProperty({ description: "최초 등록일" })
  createdAt!: Date;

  @ApiProperty({ description: "최종 수정일 — Prisma @updatedAt 자동 갱신" })
  updatedAt!: Date;
}

/**
 * 다중 업로드 부분 실패 응답 (allowPartial=true 시)
 * Phase 2.3 SPEC §4.2
 */
export class UploadManyPartialResponseDto {
  @ApiProperty({ type: [FileResponseDto], description: "성공한 파일 목록" })
  succeeded!: FileResponseDto[];

  @ApiProperty({
    description: "실패한 파일 리포트",
    isArray: true,
    type: "object",
  })
  failed!: Array<{ index: number; originalName: string; message: string }>;
}
