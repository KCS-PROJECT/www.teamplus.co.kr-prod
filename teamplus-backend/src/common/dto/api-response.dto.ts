import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 공통 API 성공 응답 DTO
 *
 * 모든 성공 응답은 이 형식을 따릅니다.
 * Controller에서 @ApiResponse({ type: ApiSuccessResponse }) 로 문서화할 수 있습니다.
 *
 * @example
 * return { success: true, data: result };
 */
export class ApiSuccessResponse<T = unknown> {
  @ApiProperty({ description: "요청 성공 여부", example: true })
  success!: true;

  @ApiProperty({ description: "응답 데이터" })
  data!: T;

  @ApiPropertyOptional({ description: "추가 메시지" })
  message?: string;
}

/**
 * 공통 API 에러 응답 DTO
 *
 * AllExceptionsFilter가 자동 생성하는 형식과 동일합니다.
 * Swagger 문서에서 에러 응답 형식을 명시할 때 사용합니다.
 */
export class ApiErrorResponseDto {
  @ApiProperty({ description: "항상 false", example: false })
  success!: false;

  @ApiProperty({ description: "HTTP 상태 코드", example: 400 })
  statusCode!: number;

  @ApiProperty({
    description: "타임스탬프",
    example: "2026-04-10T00:00:00.000Z",
  })
  timestamp!: string;

  @ApiProperty({ description: "요청 경로", example: "/api/v1/auth/login" })
  path!: string;

  @ApiProperty({ description: "HTTP 메서드", example: "POST" })
  method!: string;

  @ApiProperty({
    description: "에러 메시지 (한국어)",
    example: "입력값 검증에 실패했습니다.",
  })
  message!: string;

  @ApiPropertyOptional({
    description: "필드별 검증 에러",
    type: "array",
    items: {
      type: "object",
      properties: {
        field: { type: "string", example: "email" },
        message: {
          type: "string",
          example: "유효한 이메일 주소를 입력해주세요.",
        },
      },
    },
  })
  errors?: { field: string; message: string }[];

  @ApiPropertyOptional({
    description: "에러 코드",
    example: "VALIDATION_ERROR",
    enum: [
      "VALIDATION_ERROR",
      "DUPLICATE_ENTRY",
      "FOREIGN_KEY_ERROR",
      "NOT_FOUND",
      "DB_VALIDATION_ERROR",
      "DATA_TOO_LONG",
      "REQUIRED_FIELD_MISSING",
      "INVALID_TOKEN",
      "TOKEN_EXPIRED",
      "HTTP_ERROR",
      "INTERNAL_ERROR",
      "UNKNOWN_ERROR",
    ],
  })
  errorCode?: string;
}

/**
 * 성공 응답 래퍼 헬퍼
 *
 * @example
 * @Post()
 * async create(@Body() dto: CreateDto) {
 *   const result = await this.service.create(dto);
 *   return wrapSuccess(result, '등록되었습니다.');
 * }
 */
export function wrapSuccess<T>(data: T, message?: string) {
  return {
    success: true as const,
    data,
    ...(message && { message }),
  };
}
