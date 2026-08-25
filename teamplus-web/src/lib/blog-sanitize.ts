/**
 * 포스트(BlogPost) 본문 렌더용 살균 — backend `sanitizeBlogHtml`(sanitize.util.ts blogHtmlOptions)
 * allowlist 와 1:1 동일. 절대 넓히지 않는다.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-3·§6-1
 *
 * - tags:  p br hr h1~h4 strong b em i u s strike a img ul ol li blockquote pre code
 * - attrs: a[href title target rel] · img[src alt title width height] — **태그별** 제한.
 *   DOMPurify 의 ALLOWED_ATTR 은 전역 합집합이라 그대로 쓰면 backend 가 제거하는
 *   `p[src]`·`img[href]` 류가 보존된다(Codex R6-2 #3). afterSanitizeAttributes hook 으로
 *   태그별 allowlist 외 속성을 전부 제거한다.
 * - schemes: http https mailto (+ 상대경로/#)
 * - `target="_blank"` 앵커는 `rel="noopener noreferrer"` 강제 (backend transformTags 정합).
 *
 * 전역 DOMPurify 인스턴스가 아닌 **전용 인스턴스**를 생성한다 — 기본 인스턴스에 hook 을
 * 걸면 공지 상세 등 다른 화면의 살균 규칙(class 허용 등)까지 오염된다.
 */

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
] as const;

/** 태그별 허용 속성 — 여기 없는 태그는 속성 전부 제거 */
const TAG_ATTR_ALLOWLIST: Record<string, readonly string[]> = {
  A: ['href', 'title', 'target', 'rel'],
  IMG: ['src', 'alt', 'title', 'width', 'height'],
};

/** 허용 scheme — http/https/mailto + 상대경로(/·#). backend allowedSchemes 정합 */
const ALLOWED_URI = /^(?:(?:https?|mailto):|[/#])/i;

type PurifyInstance = ReturnType<typeof DOMPurify>;

let blogPurify: PurifyInstance | null = null;

function getBlogPurify(): PurifyInstance | null {
  if (typeof window === 'undefined') return null;
  if (blogPurify) return blogPurify;

  const instance = DOMPurify(window);
  // dompurify 3.x 는 탭내빙 보호로 `target="_blank"` 를 코어에서 제거한다.
  // backend(sanitize-html)는 a[target] 을 보존 + rel 강제이므로, 동일하게 유지한다.
  instance.addHook('uponSanitizeAttribute', (node, data) => {
    if (
      node.tagName === 'A' &&
      data.attrName === 'target' &&
      data.attrValue === '_blank'
    ) {
      data.forceKeepAttr = true;
    }
  });
  instance.addHook('afterSanitizeAttributes', (node) => {
    const allowed = TAG_ATTR_ALLOWLIST[node.tagName] ?? [];
    for (const attr of Array.from(node.attributes ?? [])) {
      if (!allowed.includes(attr.name.toLowerCase())) {
        node.removeAttribute(attr.name);
      }
    }
    // dompurify 의 ALLOWED_URI_REGEXP 는 img src 의 data: URI 를 내장 예외(DATA_URI_TAGS)로
    // 통과시키므로, backend(allowedSchemes 전역 적용)와 맞추기 위해 URL 속성을 재검사한다.
    for (const urlAttr of ['href', 'src'] as const) {
      const raw = node.getAttribute(urlAttr);
      if (raw && !ALLOWED_URI.test(raw.trim())) {
        node.removeAttribute(urlAttr);
      }
    }
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  blogPurify = instance;
  return instance;
}

export function sanitizeBlogHtmlForRender(dirty: string): string {
  const purify = getBlogPurify();
  if (!purify) return '';
  return purify.sanitize(dirty, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    // 태그별 세분화는 hook 이 담당 — 여기 합집합은 hook 진입 전 1차 필터.
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[/#])/i,
    ALLOW_DATA_ATTR: false,
  });
}
