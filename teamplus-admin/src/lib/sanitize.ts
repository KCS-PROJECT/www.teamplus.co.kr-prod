/**
 * DOMPurify 기반 HTML sanitizer.
 *
 * 허용 태그: 서식 관련 안전한 태그만 화이트리스트 방식으로 허용.
 * 제거 대상: script, iframe, object, embed, form, on* 이벤트 핸들러,
 *            javascript: URL, data: URL, style 속성 내 expression() 등.
 */
import DOMPurify from 'dompurify';

/** 상품 설명 등에서 허용하는 안전한 태그 목록 */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'pre', 'code',
  'span', 'div', 'hr', 'sup', 'sub',
];

/** 허용하는 속성 목록 */
const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'width', 'height',
  'class', 'id', 'style', 'target', 'rel',
  'colspan', 'rowspan', 'align', 'valign',
];

export function sanitizeHtml(html: string): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
}
