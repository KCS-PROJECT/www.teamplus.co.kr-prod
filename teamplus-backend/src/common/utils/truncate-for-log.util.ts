/**
 * truncate-for-log.util — 로그용 구조 보존 절단 (2026-05-30)
 *
 * 큰 응답 body 를 로그에 남길 때 `JSON.stringify(...).substring()` 으로 자르면
 * escape 된 JSON 문자열 조각("string object")이 남아 로그 가독성·재파싱(jq/검색)이
 * 모두 깨진다. 본 유틸은 **JSON 객체 구조를 그대로 유지**하면서 대용량 요소만 축약한다.
 *   · 배열   : 앞 maxArrayItems 개만 보존 + `{ __arrayTruncated, total, shown, items }`
 *   · 문자열 : 앞 maxStringLen 자만 보존 + `…(+N자)` 표기
 *   · 깊이   : maxDepth 초과 시 플레이스홀더 문자열로 대체
 * 결과는 항상 직렬화 가능한 JSON 객체/원시값 → 로그에서 정상 JSON 객체로 읽힌다.
 */

/** 로그용 구조 보존 절단 옵션 */
export const LOG_TRUNCATE_OPTS = {
  /** 배열은 앞 N개만 보존 (나머지는 메타로 축약) */
  maxArrayItems: 3,
  /** 긴 문자열은 앞 N자만 보존 + `…(+N자)` 표기 */
  maxStringLen: 256,
  /** 과도한 중첩은 플레이스홀더로 대체 (초대형/예외 방지) */
  maxDepth: 8,
} as const;

/**
 * JSON 객체 구조를 유지한 채 큰 배열/문자열만 축약한다.
 *
 * 주의: 호출부에서 `JSON.stringify(value)` 성공(직렬화 가능) 확인 후 호출하면
 *   순환 참조에 도달하지 않는다(maxDepth 는 추가 안전망).
 *
 * @param value 절단 대상 (응답 body 등 임의 직렬화 가능 값)
 * @param depth 내부 재귀 깊이 (호출부는 생략)
 * @returns 직렬화 가능한 JSON 객체/배열/원시값
 */
export function truncateForLog(value: unknown, depth = 0): unknown {
  const { maxArrayItems, maxStringLen, maxDepth } = LOG_TRUNCATE_OPTS;

  if (value === null || value === undefined) return value;

  // [2026-06-08] Date 는 typeof 'object' 이지만 own enumerable property 가 없어
  //   아래 Object.keys 순회 시 `{}` 로 깨진다(예: responseBody 의 createdAt). ISO 문자열로 보존.
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}B]`;

  const t = typeof value;
  if (t === "string") {
    const s = value as string;
    return s.length > maxStringLen
      ? `${s.slice(0, maxStringLen)}…(+${s.length - maxStringLen}자)`
      : s;
  }
  if (t !== "object") {
    // number / boolean 등 원시값은 그대로 (bigint 는 직렬화 불가하므로 문자열화)
    return t === "bigint" ? `${(value as bigint).toString()}n` : value;
  }

  if (depth >= maxDepth) {
    return Array.isArray(value)
      ? `[Array(${(value as unknown[]).length}) · 깊이 제한 생략]`
      : "{Object · 깊이 제한 생략}";
  }

  if (Array.isArray(value)) {
    const arr = value as unknown[];
    const items = arr
      .slice(0, maxArrayItems)
      .map((v) => truncateForLog(v, depth + 1));
    if (arr.length > maxArrayItems) {
      return {
        __arrayTruncated: true,
        total: arr.length,
        shown: items.length,
        items,
      };
    }
    return items;
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    out[key] = truncateForLog(obj[key], depth + 1);
  }
  return out;
}
