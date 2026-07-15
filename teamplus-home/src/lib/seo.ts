/**
 * TEAMPLUS 홍보 홈페이지 — SEO / GEO / AEO 설정 SoT
 *
 * SEO  : 전통 검색엔진(Google · Naver · Daum/Bing)용 metadata · canonical · sitemap.
 * GEO  : 생성형 엔진(ChatGPT · Claude · Gemini · Grok · Perplexity)용 구조화 데이터(JSON-LD)
 *        + AI 크롤러 허용(robots.ts) + llms.txt.
 * AEO  : 답변 엔진(음성·AI 요약)용 FAQPage · Organization contactPoint 등 Q&A 구조화.
 *
 * ⚠️ 정식 도메인은 teamplus.icetimes.co.kr (라이브 · App Store 마케팅 URL).
 *    teamplus.kr 은 인증서 오류로 죽은 도메인이므로 canonical 로 쓰지 않는다.
 */
import { BRAND, FAQ, APP_DOWNLOAD } from './content';

/** 정식(canonical) 도메인 — 모든 canonical/OG/sitemap URL 의 단일 출처. */
export const SITE_URL = 'https://teamplus.icetimes.co.kr';

/**
 * 네이버 서치어드바이저 사이트 검증 코드.
 * 발급: https://searchadvisor.naver.com/ → 사이트 등록 → HTML 태그 → content 값만 아래에 입력.
 * 빈 문자열이면 meta 태그를 방출하지 않는다(빈 검증 태그는 오히려 감점).
 * (Google 은 public/googled249f39f66ee057d.html 파일 방식으로 이미 검증됨)
 */
export const NAVER_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION ?? '';

/** 상대 경로 → 절대 URL. */
export function absoluteUrl(path = ''): string {
  if (!path) return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * 키워드 전략 (2026-07-14 네이버 데이터랩 + 실제 클럽 블로그 조사 기반).
 *
 * ⚠️ Google 은 <meta keywords> 를 무시한다(2009~). 이 배열의 실효는 네이버 소량 반영 +
 *    "우리가 어떤 주제로 노출되길 원하는가"의 내부 SoT. 실제 랭킹은 이 키워드가
 *    제목·본문·구조화 데이터(knowsAbout)에 자연스럽게 등장해야 발생한다.
 *
 * 분류 우선순위: audience(전환 높은 롱테일) > solution > role > brand > broad(정보성·저전환).
 */
export const KEYWORDS = {
  /** 브랜드 */
  brand: ['팀플러스', '팀플러스+', 'TEAMPLUS', '아이스하키 팀플러스'],
  /** 종목·교육 코어 (제품 카테고리) */
  sport: [
    '아이스하키',
    '아이스하키 앱',
    '아이스하키 교육',
    '아이스하키 교육 앱',
    '아이스하키 강습', // 실제 클럽·학부모가 가장 많이 쓰는 표현
    '아이스하키 레슨',
    '아이스하키 클래스',
  ],
  /** 대상(유소년·역할) — 데이터랩상 가장 일관된 상업 의도 */
  audience: [
    '유소년 아이스하키',
    '어린이 아이스하키',
    '아이스하키 클럽',
    '아이스하키 아카데미',
    '아이스하키 감독',
    '아이스하키 코치',
    '아이스하키 학부모',
    '하키맘', // 블로그 실사용 커뮤니티 용어
    '아이스하키 선수',
  ],
  /**
   * 어린이/유아 연관 검색어 (2026-07-14 데이터랩+블로그 조사).
   * 전국 어린이 아이스하키팀 블로그에서 반복 등장하는 실사용 어휘 + 관문 인접어.
   * '어린이 스케이트/스포츠'는 검색량 최상위(하키 입문 관문), '무료체험'은 학부모 구매의도 신호.
   */
  kids: [
    '유아 아이스하키',
    '어린이 하키',
    '어린이 아이스하키팀',
    '어린이 아이스하키 강습',
    '어린이 아이스하키 클럽',
    '유치부 아이스하키',
    '초등 아이스하키',
    '초등학생 아이스하키',
    '아이스하키 무료체험',
    '아이스하키 체험',
    '어린이 스케이트',
    '어린이 스케이트 강습',
    '어린이 스포츠',
    '유소년 스포츠',
    '스포츠키즈',
  ],
  /** 기능·솔루션 (제품이 실제로 이기는 롱테일) */
  solution: [
    '아이스하키 클럽 관리',
    'QR 출석 앱',
    '출석 관리 앱',
    '수업 관리 앱',
    '유소년 스포츠 앱',
    '스포츠 클럽 관리',
    '수강료 결제 앱',
    '카카오 알림톡',
  ],
  /** 협회·리그·인접(정보성 · 검색량은 크나 전환 약함) */
  broad: [
    '대한아이스하키협회',
    '한국 아이스하키 리그',
    '아시아리그 아이스하키',
    '아이스하키 싸움', // 사용자 요청 · 제품 관련성 낮음(권장: 제거)
    '아이스링크',
    '빙상장',
  ],
} as const;

/** 전역 meta 용 통합 키워드(중복 제거). */
export const SEO_KEYWORDS: string[] = Array.from(
  new Set([
    ...KEYWORDS.audience,
    ...KEYWORDS.kids,
    ...KEYWORDS.solution,
    ...KEYWORDS.sport,
    ...KEYWORDS.brand,
    ...KEYWORDS.broad,
  ]),
);

/**
 * Organization 스키마 — 브랜드·연락처·SNS 를 검색·답변 엔진에 제공.
 * (전자상거래법 §10 법정 표시 + PG 심사와 정합하는 실물 근거 값만 사용)
 */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: BRAND.legal.companyName, // 주식회사 아이스타임즈
    legalName: BRAND.legal.companyName,
    alternateName: [BRAND.legal.companyNameEn, BRAND.name, 'TEAMPLUS'],
    url: SITE_URL,
    logo: absoluteUrl('/images/splash_logo.png'),
    description: BRAND.descriptor,
    email: BRAND.contact.email,
    telephone: BRAND.contact.phone,
    foundingLocation: '대한민국 서울',
    address: {
      '@type': 'PostalAddress',
      streetAddress: BRAND.legal.address,
      addressLocality: '송파구',
      addressRegion: '서울특별시',
      addressCountry: 'KR',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: BRAND.contact.email,
      telephone: BRAND.contact.phone,
      availableLanguage: ['Korean'],
      areaServed: 'KR',
      hoursAvailable: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '18:00',
      },
    },
    sameAs: [
      APP_DOWNLOAD.appStore,
      APP_DOWNLOAD.googlePlay,
    ],
    // 엔티티 주제 연결 — 답변 엔진(GEO/AEO)이 "무엇을 하는 조직인지" 이해하도록.
    knowsAbout: [
      '아이스하키',
      '유소년 아이스하키',
      '어린이 아이스하키',
      '아이스하키 클럽 운영',
      '아이스하키 강습',
      '유치부·초등 아이스하키',
      'QR 출석 관리',
      '수업권 결제',
      '스포츠 클럽 관리 SaaS',
    ],
  };
}

/** WebSite 스키마 — 사이트 정체성 + 사이트링크 검색창(SearchAction) 힌트. */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: `${BRAND.name} · 아이스하키 클럽 통합 운영 플랫폼`,
    description: BRAND.descriptor,
    inLanguage: 'ko-KR',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/**
 * SoftwareApplication 스키마 — 모바일 앱을 제품으로 명시(앱 스토어 리치 결과 후보).
 * ⚠️ 근거 없는 aggregateRating(평점) 은 넣지 않는다(날조 금지).
 */
export function softwareApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    '@id': `${SITE_URL}/#app`,
    name: BRAND.name,
    operatingSystem: 'iOS, Android',
    applicationCategory: 'BusinessApplication',
    description: BRAND.descriptor,
    inLanguage: 'ko-KR',
    url: SITE_URL,
    downloadUrl: [APP_DOWNLOAD.appStore, APP_DOWNLOAD.googlePlay],
    installUrl: [APP_DOWNLOAD.appStore, APP_DOWNLOAD.googlePlay],
    featureList: [
      '수업 일정 관리',
      'QR 출석 자동 기록',
      '성장 기록',
      '결제 · 수업권 관리',
      '카카오 알림톡 연동',
      '역할별 맞춤 화면(보호자 · 코치 · 운영자 · 아동)',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'KRW',
      description: '앱 다운로드 무료 · 클럽 도입 요금은 플랜별 상이',
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/** FAQPage 스키마 — 답변 엔진(AEO)·구글 리치 결과에 Q&A 를 직접 공급. */
export function faqSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/#faq`,
    inLanguage: 'ko-KR',
    mainEntity: FAQ.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

/**
 * BlogPosting 스키마 — 블로그 상세글을 검색·답변 엔진에 기사로 명시(Article 리치 결과 후보).
 * publisher 는 Organization(#organization) 재사용. 날조 금지 — 실제 값(제목/요약/발행일)만.
 */
export function blogPostingSchema(post: {
  slug: string;
  title: string;
  summary: string;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
  updatedAt: string;
  createdAt: string;
}) {
  const url = absoluteUrl(`/blog/${post.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: post.title,
    description: post.summary,
    inLanguage: 'ko-KR',
    ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
    datePublished: post.publishedAt ?? post.createdAt,
    dateModified: post.updatedAt,
    author: { '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/** BreadcrumbList 스키마 — 페이지 위계를 검색엔진에 제공(빵부스러기 리치 결과). */
export function breadcrumbSchema(
  trail: Array<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}
