/**
 * @jest-environment jsdom
 *
 * 포스트 본문 살균 — backend `sanitizeBlogHtml` allowlist 와의 1:1 정합 회귀 테스트.
 * 설계 SoT: docs/Planning/SPEC_DASHBOARD_READING_CONTENT.md §2-3·§6-1 (Codex R6-2 #3)
 */

import { sanitizeBlogHtmlForRender } from '../blog-sanitize';

describe('sanitizeBlogHtmlForRender', () => {
  it('허용 태그·속성은 보존한다', () => {
    const out = sanitizeBlogHtmlForRender(
      '<h2>제목</h2><p>본문 <strong>강조</strong></p>' +
        '<img src="https://example.com/a.png" alt="장비" width="640" height="400">' +
        '<a href="https://example.com" title="링크">링크</a>' +
        '<pre><code>code</code></pre><blockquote>인용</blockquote><hr>',
    );
    expect(out).toContain('<h2>제목</h2>');
    expect(out).toContain('src="https://example.com/a.png"');
    expect(out).toContain('alt="장비"');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('<hr>');
  });

  it('태그별 allowlist — a/img 전용 속성이 다른 태그에 남지 않는다 (backend 정합)', () => {
    const out = sanitizeBlogHtmlForRender(
      '<p src="x" href="y" title="t">본문</p><img href="junk" src="https://a/b.png" alt="a">',
    );
    expect(out).not.toContain('<p src');
    expect(out).not.toMatch(/<p[^>]*href/);
    expect(out).not.toMatch(/<p[^>]*title/);
    expect(out).not.toMatch(/<img[^>]*href/);
    expect(out).toContain('src="https://a/b.png"');
  });

  it('XSS 벡터를 제거한다 — script/iframe/이벤트 핸들러/style/class/id', () => {
    const out = sanitizeBlogHtmlForRender(
      '<script>alert(1)</script><iframe src="https://evil"></iframe>' +
        '<img src="https://a/b.png" onerror="alert(1)" style="color:red" class="x" id="y">' +
        '<p onclick="alert(1)" class="c">본문</p>',
    );
    expect(out).not.toContain('script');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('style=');
    expect(out).not.toContain('class=');
    expect(out).not.toContain('id=');
  });

  it('허용 scheme 만 통과한다 — javascript:/data: 차단, https/mailto/상대경로 허용', () => {
    const out = sanitizeBlogHtmlForRender(
      '<a href="javascript:alert(1)">j</a><a href="data:text/html,x">d</a>' +
        '<a href="mailto:a@b.c">m</a><a href="/contents">rel</a>' +
        '<img src="data:image/png;base64,AAAA" alt="d">',
    );
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('data:');
    expect(out).toContain('href="mailto:a@b.c"');
    expect(out).toContain('href="/contents"');
  });

  it('target="_blank" 앵커에 rel="noopener noreferrer" 를 강제한다', () => {
    const out = sanitizeBlogHtmlForRender(
      '<a href="https://example.com" target="_blank">새 창</a>',
    );
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('비허용 태그(h5·table·span·div)는 태그를 벗기고 내용만 남긴다', () => {
    const out = sanitizeBlogHtmlForRender(
      '<h5>소제목</h5><table><tr><td>셀</td></tr></table><span>스팬</span><div>디브</div>',
    );
    expect(out).not.toContain('<h5');
    expect(out).not.toContain('<table');
    expect(out).not.toContain('<span');
    expect(out).not.toContain('<div');
  });
});
