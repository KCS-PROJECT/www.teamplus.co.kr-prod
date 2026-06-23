/**
 * `resolveImageUrl` / `resolveImageSrc` / `stripApiBase` 회귀 가드.
 *
 * 백엔드는 업로드 응답으로 상대 경로(`/uploads/...`)만 반환한다. 페이지 호스트가 백엔드와
 * 다를 때(예: Next.js 5001 ↔ NestJS 5003) 그대로 `<img src>` 에 넣으면 페이지 호스트로
 * 해석되어 이미지 404 가 된다. 본 헬퍼는 표시 시점에만 절대 URL 로 변환하며,
 * 이미 절대 URL(외부 CDN/data/blob/protocol-relative)은 그대로 통과시켜야 한다.
 *
 * 이 테스트가 깨지면 안드로이드 실기기 + 호스트 분리 환경에서 이미지가 다시 안 보이는
 * 회귀가 발생할 수 있다.
 */

// jest.mock 은 import 보다 먼저 실행되어야 한다 (hoisting). env 의 fallback 과 일치하도록
// 테스트 전역 apiBase 를 `http://localhost:5003` 으로 고정.
jest.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:5003',
  },
}));

import {
  resolveImageUrl,
  resolveImageSrc,
  stripApiBase,
} from '../image-url';

describe('resolveImageUrl — falsy / placeholder', () => {
  test('null → null', () => {
    expect(resolveImageUrl(null)).toBeNull();
  });
  test('undefined → null', () => {
    expect(resolveImageUrl(undefined)).toBeNull();
  });
  test('빈 문자열 → null', () => {
    expect(resolveImageUrl('')).toBeNull();
  });
  test('공백만 → null', () => {
    expect(resolveImageUrl('   ')).toBeNull();
  });
  test('/placeholder.svg 로 끝나는 값 → null (기존 코드 호환)', () => {
    expect(resolveImageUrl('/placeholder.svg')).toBeNull();
    expect(resolveImageUrl('/images/placeholder.svg')).toBeNull();
  });
});

describe('resolveImageUrl — 상대 경로 → 절대 URL', () => {
  test('/uploads/avatar/x.jpg → apiBase 결합', () => {
    expect(resolveImageUrl('/uploads/avatar/2026/05/16/x.jpg')).toBe(
      'http://localhost:5003/uploads/avatar/2026/05/16/x.jpg',
    );
  });

  test('맨 앞에 / 없는 상대 경로 → /를 추가하여 결합 (방어적)', () => {
    expect(resolveImageUrl('uploads/avatar/x.jpg')).toBe(
      'http://localhost:5003/uploads/avatar/x.jpg',
    );
  });
});

describe('resolveImageUrl — 절대 URL · URI scheme 은 통과', () => {
  test('https:// 절대 URL → 원본 그대로', () => {
    const cdn = 'https://cdn.example.com/x.jpg?v=1';
    expect(resolveImageUrl(cdn)).toBe(cdn);
  });

  test('http:// 절대 URL → 원본 그대로', () => {
    const ext = 'http://other.example/x.jpg';
    expect(resolveImageUrl(ext)).toBe(ext);
  });

  test('data URI → 원본 그대로', () => {
    const data = 'data:image/png;base64,AAA';
    expect(resolveImageUrl(data)).toBe(data);
  });

  test('blob URI → 원본 그대로', () => {
    const blob = 'blob:http://localhost:5001/abc-123';
    expect(resolveImageUrl(blob)).toBe(blob);
  });

  test('protocol-relative // → 원본 그대로', () => {
    const pr = '//cdn.example.com/x.jpg';
    expect(resolveImageUrl(pr)).toBe(pr);
  });
});

describe('resolveImageUrl — 양 끝 공백 trim', () => {
  test('상대 경로 앞뒤 공백 → trim 후 결합', () => {
    expect(resolveImageUrl('  /uploads/x.jpg  ')).toBe(
      'http://localhost:5003/uploads/x.jpg',
    );
  });
});

describe('resolveImageSrc — null → undefined', () => {
  test('null/빈 입력 → undefined (img src 미설정 분기)', () => {
    expect(resolveImageSrc(null)).toBeUndefined();
    expect(resolveImageSrc('')).toBeUndefined();
    expect(resolveImageSrc('/placeholder.svg')).toBeUndefined();
  });

  test('정상 입력 → string', () => {
    expect(resolveImageSrc('/uploads/x.jpg')).toBe(
      'http://localhost:5003/uploads/x.jpg',
    );
    expect(resolveImageSrc('https://cdn.example.com/x.jpg')).toBe(
      'https://cdn.example.com/x.jpg',
    );
  });
});

describe('stripApiBase — DB 저장 안전망', () => {
  test('apiBase 와 동일 origin 절대 URL → pathname 환원', () => {
    expect(
      stripApiBase('http://localhost:5003/uploads/avatar/x.jpg'),
    ).toBe('/uploads/avatar/x.jpg');
  });

  test('apiBase 와 다른 origin 절대 URL → 원본 유지 (외부 CDN 보호)', () => {
    const cdn = 'https://cdn.example.com/x.jpg';
    expect(stripApiBase(cdn)).toBe(cdn);
  });

  test('이미 상대 경로 → 원본 유지', () => {
    expect(stripApiBase('/uploads/x.jpg')).toBe('/uploads/x.jpg');
  });

  test('null/빈 → null', () => {
    expect(stripApiBase(null)).toBeNull();
    expect(stripApiBase('')).toBeNull();
  });

  test('query/hash 포함 → 그대로 환원', () => {
    expect(
      stripApiBase('http://localhost:5003/uploads/x.jpg?v=1#a'),
    ).toBe('/uploads/x.jpg?v=1#a');
  });
});
