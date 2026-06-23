import { SetMetadata } from "@nestjs/common";

export const CACHE_CONTROL_KEY = "teamplus:cache-control";

/**
 * 응답에 `Cache-Control` 헤더를 명시적으로 부착한다.
 *
 * 사용 예:
 *   @CacheControl('private, max-age=60')
 *   @Get()
 *   findAll() { ... }
 *
 *   @CacheControl('no-store')
 *   @Post('mutate')
 *   mutate(...) { ... }
 *
 * 미명시 시 NestJS / Express 기본 동작 (헤더 없음).
 */
export const CacheControl = (value: string) =>
  SetMetadata(CACHE_CONTROL_KEY, value);
