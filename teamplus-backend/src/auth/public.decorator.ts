import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

/**
 * Public 데코레이터
 *
 * JWT 인증을 건너뛰고 공개 접근을 허용합니다.
 * 주로 콜백 엔드포인트에서 사용됩니다.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
