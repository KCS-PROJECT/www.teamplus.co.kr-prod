/**
 * `buildUrlWithParams` 회귀 가드.
 *
 * `navigation.openExternal(url, parameter)` 가 외부 브라우저로 열 URL 을 조립할 때
 * 쓰는 순수 함수. object·string 두 형태를 동일 규칙(URLSearchParams 파싱 → 자동 인코딩)
 * 으로 처리하고, 기존 쿼리 append·hash 보존·상대 URL 폴백을 보장해야 한다.
 *
 * 이 테스트가 깨지면 파라미터가 인코딩 안 되어 외부 URL 이 깨지거나(한글/특수문자),
 * hash 위치가 틀어져 잘못된 페이지가 열리는 회귀가 발생할 수 있다.
 */

import { buildUrlWithParams, normalizeExternalUrl } from '../utils';

describe('buildUrlWithParams — 파라미터 없음', () => {
  test('parameter 미전달 → url 그대로', () => {
    expect(buildUrlWithParams('https://a.com')).toBe('https://a.com');
  });

  test('undefined parameter → url 그대로', () => {
    expect(buildUrlWithParams('https://a.com', undefined)).toBe('https://a.com');
  });

  test('빈 object → url 그대로', () => {
    expect(buildUrlWithParams('https://a.com', {})).toBe('https://a.com');
  });

  test('빈 문자열 → url 그대로', () => {
    expect(buildUrlWithParams('https://a.com', '')).toBe('https://a.com');
  });

  test('?/& 만 있는 문자열 → url 그대로', () => {
    expect(buildUrlWithParams('https://a.com', '?')).toBe('https://a.com');
    expect(buildUrlWithParams('https://a.com', '&')).toBe('https://a.com');
  });
});

describe('buildUrlWithParams — object 형태', () => {
  test('단일 키 append', () => {
    expect(buildUrlWithParams('https://a.com', { q: 'test' })).toBe(
      'https://a.com/?q=test',
    );
  });

  test('복수 키는 삽입 순서 유지', () => {
    expect(buildUrlWithParams('https://a.com', { tab: 'info', id: 1 })).toBe(
      'https://a.com/?tab=info&id=1',
    );
  });

  test('숫자·불리언은 String() 직렬화', () => {
    expect(buildUrlWithParams('https://a.com', { id: 1, ok: true })).toBe(
      'https://a.com/?id=1&ok=true',
    );
  });

  test('null / undefined 값은 스킵', () => {
    expect(
      buildUrlWithParams('https://a.com', { a: '1', b: null, c: undefined, d: '2' }),
    ).toBe('https://a.com/?a=1&d=2');
  });

  test('모든 값이 null/undefined → url 그대로', () => {
    expect(buildUrlWithParams('https://a.com', { a: null, b: undefined })).toBe(
      'https://a.com',
    );
  });

  test('한글 값 자동 인코딩', () => {
    expect(buildUrlWithParams('https://a.com', { name: '김철수' })).toBe(
      'https://a.com/?name=%EA%B9%80%EC%B2%A0%EC%88%98',
    );
  });

  test('공백·특수문자 인코딩', () => {
    const result = buildUrlWithParams('https://a.com', { q: 'a b&c' });
    // URLSearchParams 는 공백을 + 로, & 를 %26 으로 인코딩
    expect(result).toBe('https://a.com/?q=a+b%26c');
  });
});

describe('buildUrlWithParams — string 형태', () => {
  test('쿼리스트링 파싱 후 append', () => {
    expect(buildUrlWithParams('https://a.com', 'tab=info&id=1')).toBe(
      'https://a.com/?tab=info&id=1',
    );
  });

  test('앞의 ? 자동 제거', () => {
    expect(buildUrlWithParams('https://a.com', '?tab=info')).toBe(
      'https://a.com/?tab=info',
    );
  });

  test('앞의 & 자동 제거', () => {
    expect(buildUrlWithParams('https://a.com', '&tab=info')).toBe(
      'https://a.com/?tab=info',
    );
  });

  test('string 내 한글 값 자동 인코딩', () => {
    expect(buildUrlWithParams('https://a.com', 'name=김철수&tab=info')).toBe(
      'https://a.com/?name=%EA%B9%80%EC%B2%A0%EC%88%98&tab=info',
    );
  });

  test('이미 인코딩된 값은 idempotent 정규화', () => {
    expect(buildUrlWithParams('https://a.com', 'name=%EA%B9%80')).toBe(
      'https://a.com/?name=%EA%B9%80',
    );
  });
});

describe('buildUrlWithParams — 기존 쿼리 / hash 병합', () => {
  test('기존 쿼리가 있으면 & 로 병합', () => {
    expect(buildUrlWithParams('https://a.com?x=1', { y: 2 })).toBe(
      'https://a.com/?x=1&y=2',
    );
  });

  test('동일 키는 양쪽 모두 보존(append)', () => {
    expect(buildUrlWithParams('https://a.com?tab=old', { tab: 'new' })).toBe(
      'https://a.com/?tab=old&tab=new',
    );
  });

  test('hash 가 있으면 쿼리는 hash 앞에 삽입', () => {
    expect(buildUrlWithParams('https://a.com/p#sec', { y: 2 })).toBe(
      'https://a.com/p?y=2#sec',
    );
  });

  test('기존 쿼리 + hash 동시 존재', () => {
    expect(buildUrlWithParams('https://a.com/p?x=1#sec', 'y=2')).toBe(
      'https://a.com/p?x=1&y=2#sec',
    );
  });

  test('path 가 있는 URL', () => {
    expect(buildUrlWithParams('https://a.com/foo/bar', { q: 'x' })).toBe(
      'https://a.com/foo/bar?q=x',
    );
  });
});

describe('buildUrlWithParams — 상대/비표준 URL 폴백', () => {
  test('상대 경로 + object → 수동 병합', () => {
    expect(buildUrlWithParams('/foo/bar', { q: 'x' })).toBe('/foo/bar?q=x');
  });

  test('상대 경로 기존 쿼리 있으면 & 병합', () => {
    expect(buildUrlWithParams('/foo?a=1', { b: '2' })).toBe('/foo?a=1&b=2');
  });

  test('상대 경로 + hash → 쿼리는 hash 앞', () => {
    expect(buildUrlWithParams('/foo#sec', { q: 'x' })).toBe('/foo?q=x#sec');
  });

  test('상대 경로 + string 파라미터', () => {
    expect(buildUrlWithParams('/foo', 'a=1&b=2')).toBe('/foo?a=1&b=2');
  });
});

describe('normalizeExternalUrl — 스킴 정규화', () => {
  test('bare host → https:// 부여', () => {
    expect(normalizeExternalUrl('www.naver.com')).toBe('https://www.naver.com');
  });

  test('path 있는 bare host → https:// 부여', () => {
    expect(normalizeExternalUrl('naver.com/search')).toBe('https://naver.com/search');
  });

  test('이미 https 스킴 → 그대로', () => {
    expect(normalizeExternalUrl('https://naver.com')).toBe('https://naver.com');
  });

  test('http 스킴 → 그대로', () => {
    expect(normalizeExternalUrl('http://naver.com')).toBe('http://naver.com');
  });

  test('mailto/tel/teamplus 등 커스텀 스킴 → 그대로', () => {
    expect(normalizeExternalUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(normalizeExternalUrl('tel:01012345678')).toBe('tel:01012345678');
    expect(normalizeExternalUrl('teamplus://home')).toBe('teamplus://home');
  });

  test('프로토콜-상대 //host → https:', () => {
    expect(normalizeExternalUrl('//cdn.x.com/a.png')).toBe('https://cdn.x.com/a.png');
  });

  test('앱 내부 상대경로는 그대로', () => {
    expect(normalizeExternalUrl('/mypage')).toBe('/mypage');
    expect(normalizeExternalUrl('./a')).toBe('./a');
    expect(normalizeExternalUrl('../a')).toBe('../a');
    expect(normalizeExternalUrl('#sec')).toBe('#sec');
    expect(normalizeExternalUrl('?q=1')).toBe('?q=1');
  });

  test('앞뒤 공백 trim', () => {
    expect(normalizeExternalUrl('  www.naver.com  ')).toBe('https://www.naver.com');
  });

  test('빈 문자열 → 그대로', () => {
    expect(normalizeExternalUrl('')).toBe('');
  });
});

describe('normalizeExternalUrl + buildUrlWithParams 조합 — 실제 오픈 시나리오', () => {
  test('www.naver.com + { q: "다음" } → https 절대 URL + 인코딩', () => {
    const final = buildUrlWithParams(normalizeExternalUrl('www.naver.com'), { q: '다음' });
    expect(final).toBe('https://www.naver.com/?q=%EB%8B%A4%EC%9D%8C');
  });
});
