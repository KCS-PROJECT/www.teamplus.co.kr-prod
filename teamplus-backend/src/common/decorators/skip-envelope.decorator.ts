import { SetMetadata } from "@nestjs/common";

export const SKIP_ENVELOPE_KEY = "teamplus:skip-envelope";

/**
 * ResponseEnvelopeInterceptor 의 자동 `{success:true, data}` 래핑을 건너뛴다.
 *
 * 사용 예:
 *   - file/stream/blob 응답
 *   - 외부 webhook 처리에서 raw 응답을 반환해야 할 때
 *   - 304 등 캐시 응답 직접 제어
 */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
