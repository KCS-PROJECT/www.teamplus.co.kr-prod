import sanitizeHtml from "sanitize-html";

/**
 * HTML/XSS 새니타이제이션 유틸리티
 * 사용자 입력 콘텐츠에서 악성 스크립트를 제거합니다.
 */

// 기본 새니타이제이션 옵션 (HTML 태그 완전 제거)
const strictOptions: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
};

// 제한된 HTML 허용 옵션 (기본 텍스트 포맷팅만 허용)
const basicHtmlOptions: sanitizeHtml.IOptions = {
  allowedTags: ["b", "i", "em", "strong", "p", "br", "ul", "ol", "li"],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
};

// 확장 HTML 허용 옵션 (링크, 이미지 포함)
const extendedHtmlOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "b",
    "i",
    "em",
    "strong",
    "p",
    "br",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "h1",
    "h2",
    "h3",
    "blockquote",
  ],
  allowedAttributes: {
    a: ["href", "title", "target"],
    img: ["src", "alt", "title", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  disallowedTagsMode: "discard",
};

/**
 * 모든 HTML 태그를 제거하고 순수 텍스트만 반환
 * 사용: 제목, 이름 등 HTML이 필요 없는 필드
 */
export function sanitizeStrict(input: string): string {
  if (!input) return input;
  return sanitizeHtml(input, strictOptions).trim();
}

/**
 * 기본 HTML 포맷팅만 허용
 * 사용: 댓글, 간단한 설명 등
 */
export function sanitizeBasicHtml(input: string): string {
  if (!input) return input;
  return sanitizeHtml(input, basicHtmlOptions).trim();
}

/**
 * 확장 HTML 허용 (링크, 이미지 포함)
 * 사용: 게시글 본문, 공지사항 내용 등
 */
export function sanitizeExtendedHtml(input: string): string {
  if (!input) return input;
  return sanitizeHtml(input, extendedHtmlOptions).trim();
}

/**
 * 객체의 문자열 필드들을 새니타이즈
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  strictFields: (keyof T)[] = [],
  htmlFields: (keyof T)[] = [],
): T {
  const result = { ...obj };

  for (const key of strictFields) {
    if (typeof result[key] === "string") {
      (result as any)[key] = sanitizeStrict(result[key]);
    }
  }

  for (const key of htmlFields) {
    if (typeof result[key] === "string") {
      (result as any)[key] = sanitizeExtendedHtml(result[key]);
    }
  }

  return result;
}

/**
 * 허용된 MIME 타입 목록
 */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * MIME 타입 검증
 */
export function isAllowedMimeType(
  mimeType: string,
): mimeType is AllowedMimeType {
  return ALLOWED_MIME_TYPES.includes(mimeType as AllowedMimeType);
}
