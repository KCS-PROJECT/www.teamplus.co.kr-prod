/**
 * JSON-LD 구조화 데이터 삽입 컴포넌트.
 *
 * 검색·생성형·답변 엔진(Google · Naver · ChatGPT · Claude · Gemini · Perplexity)이
 * 페이지 의미를 정확히 파악하도록 schema.org 데이터를 <script type="application/ld+json"> 로 방출.
 * next.config.js CSP 는 script-src 에 'unsafe-inline' 을 허용하므로 인라인 방출이 안전하다.
 *
 * XSS 방지: JSON 직렬화 후 '<' 를 유니코드 이스케이프해 조기 </script> 종료를 차단.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
