/**
 * API 에러 타입 안전 헬퍼 (catch (error: any) 제거용 · 2026-06-07 · CODE_REVIEW_ADMIN C-3/D-4)
 *
 * `catch (error: unknown)` 로 받은 에러에서 Axios 응답 status/메시지를 안전하게 추출한다.
 * 기존 `error.response?.status` / `error.response?.data?.error?.message` 접근을
 * 타입 안전하게 대체하면서 동작은 동일(또는 더 견고한 폴백)하게 유지한다.
 */
import { AxiosError } from "axios";

/** 백엔드 표준 에러 바디 `{ success:false, error:{ code, message } }` 또는 `{ message }` */
interface ApiErrorBody {
  error?: { code?: string; message?: string };
  message?: string;
}

/** unknown 에러가 AxiosError 인지 판별 */
export function isAxiosError(error: unknown): error is AxiosError<ApiErrorBody> {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as AxiosError).isAxiosError === true
  );
}

/** HTTP 상태코드 추출 (Axios 응답이 아니면 undefined) */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (isAxiosError(error)) return error.response?.status;
  return undefined;
}

/** 사용자 표시용 에러 메시지 추출 (표준 바디 → message → Error.message → fallback 순) */
export function getApiErrorMessage(
  error: unknown,
  fallback = "요청 처리에 실패했습니다.",
): string {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    return data?.error?.message || data?.message || error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}
