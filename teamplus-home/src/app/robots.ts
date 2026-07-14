import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * robots.txt — 크롤러 접근 규칙.
 *
 * GEO 관점: 생성형/답변 엔진의 크롤러를 "명시적으로 허용"해 학습·인용 대상에 포함시킨다.
 *   (ChatGPT=GPTBot·OAI-SearchBot / Claude=ClaudeBot·anthropic-ai / Perplexity=PerplexityBot /
 *    Gemini·Google 학습=Google-Extended / Apple=Applebot-Extended 등)
 * /admin·/api 는 검색·학습 대상에서 제외한다.
 */
export default function robots(): MetadataRoute.Robots {
  const aiCrawlers = [
    'GPTBot', // OpenAI 학습 크롤러
    'OAI-SearchBot', // ChatGPT 검색
    'ChatGPT-User', // ChatGPT 브라우징
    'ClaudeBot', // Anthropic Claude 크롤러
    'anthropic-ai',
    'Claude-Web',
    'Claude-SearchBot',
    'PerplexityBot', // Perplexity
    'Perplexity-User',
    'Google-Extended', // Gemini/Vertex 학습 허용 신호
    'Applebot-Extended', // Apple Intelligence
    'Amazonbot',
    'Bytespider', // TikTok/Doubao
    'CCBot', // Common Crawl(다수 LLM 학습 소스)
    'cohere-ai',
    'YouBot',
    'DuckAssistBot',
  ];

  return {
    rules: [
      // 일반 검색엔진(Googlebot · Yeti(네이버) · Daum · Bingbot 포함)
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/'],
      },
      // AI/답변 엔진 크롤러 명시적 허용
      {
        userAgent: aiCrawlers,
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
