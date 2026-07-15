import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * 커스텀 fontSize 토큰을 tailwind-merge 의 `font-size` 그룹에 등록.
 *
 * tailwind-merge 는 표준 클래스(text-sm 등)만 fontSize 로 인식하고, 우리 토큰
 * (text-w-*, text-card-*, text-body/caption/heading/muted)은 "텍스트 색상"으로 오인한다.
 * 그 결과 cn() 안에서 색 클래스(text-wtext-3 등)와 공존하면 크기 토큰이 충돌로 제거되어
 * 부모 16px 를 상속하는 버그가 발생한다(2026-06-30 발견).
 *
 * 아래 등록으로 이 토큰들이 fontSize 그룹으로 인식되어 색 클래스와 공존한다.
 * tailwind.config.cjs 의 fontSize 키 + globals.css 의 .text-* 크기 클래스가 SoT.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            // tailwind.config.cjs fontSize 토큰
            'w-caption', 'w-small', 'w-body', 'w-body-lg', 'w-title',
            'w-h3', 'w-h2', 'w-h1', 'w-display', 'w-display-lg',
            'w-caption-fluid', 'w-small-fluid', 'w-body-fluid', 'w-body-lg-fluid',
            'w-title-fluid', 'w-h3-fluid', 'w-h2-fluid', 'w-h1-fluid',
            'w-display-fluid', 'w-display-lg-fluid',
            // globals.css .text-* 크기 클래스
            'card-meta', 'card-body', 'card-title', 'card-emphasis', 'card-section',
            'card-meta-child', 'card-body-child', 'card-title-child',
            'card-emphasis-child', 'card-section-child',
            'body', 'caption', 'heading', 'muted',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 한국나이(세는나이) 계산.
 *
 * 한국나이 = 현재 연도 - 출생 연도 + 1 (생일 무관, 1/1 자정에 일괄 +1).
 *
 * TEAMPLUS 일반 비즈니스 표준 (자녀 표시·CHILD/TEEN 분류·수업 나이 제한·결제 검증 등).
 * 백엔드 `src/common/utils/age.util.ts:calculateKoreanAge` 와 동일 로직.
 *
 * @param birthDate 생년월일 (ISO 문자열 또는 Date)
 * @returns 한국나이. 유효하지 않은 날짜면 null.
 */
export function calculateKoreanAge(birthDate: string | Date | null | undefined): number | null {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  return new Date().getFullYear() - birth.getFullYear() + 1;
}

/**
 * 만나이(국제나이) 계산 (월/일 고려).
 *
 * 「개인정보보호법」 제22조의2, 약관 §1조 9항(만 14세 미만 = 아동 회원),
 * 약관 §8조(만 14세 이상 ~ 만 18세 미만 = 청소년 회원) 등 법령·약관 검증 전용.
 *
 * 일반 비즈니스 로직에서는 calculateKoreanAge 사용.
 *
 * @param birthDate 생년월일 (ISO 문자열 또는 Date)
 * @returns 만나이. 유효하지 않은 날짜면 null.
 */
export function calculateInternationalAge(
  birthDate: string | Date | null | undefined,
): number | null {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * [2026-05-21] 출생연도 표시 — "2016년생".
 *
 * 시스템 전반에서 자녀/학생 연령을 "N세" 대신 출생연도로 표기한다.
 * birthDate 가 있으면 그 연도를, 없으면 한국나이로 역산
 * (출생연도 = 현재연도 - 한국나이 + 1).
 *
 * @returns "YYYY년생" 또는 정보 부족 시 빈 문자열.
 */
export function formatBirthYear(
  birthDate?: string | Date | null,
  koreanAge?: number | null,
): string {
  if (birthDate) {
    const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
    if (!isNaN(d.getTime())) return `${d.getFullYear()}년생`;
  }
  if (typeof koreanAge === "number" && koreanAge > 0) {
    return `${new Date().getFullYear() - koreanAge + 1}년생`;
  }
  return "";
}

/**
 * 한국나이 ageMin/ageMax 를 출생연도 범위 표시로 환산 (선택적 활용).
 *
 * 일반 검증 메시지에는 "N세" 표기를 권장하며, 코치 수업 등록 화면 등
 * 의도 확인이 필요한 보조 표시에서 사용한다.
 *
 * @example
 * formatBirthYearRange(5, 10) // "2017년생 ~ 2022년생" (2026 기준)
 */
export function formatBirthYearRange(
  ageMin?: number | null,
  ageMax?: number | null,
): string {
  const cy = new Date().getFullYear();
  const maxBy = ageMin ? cy - ageMin + 1 : null;
  const minBy = ageMax ? cy - ageMax + 1 : null;
  if (minBy && maxBy) return `${minBy}년생 ~ ${maxBy}년생`;
  if (maxBy) return `${maxBy}년생 이전`;
  if (minBy) return `${minBy}년생 이후`;
  return '';
}

/**
 * 외부 브라우저로 열 URL 의 스킴을 정규화한다.
 *
 * `www.naver.com` 처럼 스킴이 없는 bare-host 를 넘기면 그대로는 외부로 열리지 않는다
 * (웹 `window.open` 은 앱 도메인 기준 상대경로로 해석, 네이티브 `launchUrl` 은 실패).
 * 이런 경우 `https://` 를 부여해 열리는 절대 URL 로 만든다.
 *
 * - 이미 스킴이 있으면(`https:`, `http:`, `mailto:`, `tel:`, `teamplus:` 등) 그대로 둔다.
 * - 프로토콜-상대(`//host`)는 `https:` 를 부여한다.
 * - 앱 내부 상대경로(`/`, `./`, `../`, `#`, `?` 로 시작)는 그대로 둔다.
 * - 그 외(bare host)는 `https://` 를 앞에 붙인다.
 *
 * @example
 * normalizeExternalUrl('www.naver.com')      // https://www.naver.com
 * normalizeExternalUrl('https://naver.com')  // https://naver.com (그대로)
 * normalizeExternalUrl('//cdn.x.com/a.png')  // https://cdn.x.com/a.png
 * normalizeExternalUrl('/mypage')            // /mypage (그대로)
 */
export function normalizeExternalUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // 이미 스킴 존재
  if (trimmed.startsWith('//')) return `https:${trimmed}`; // 프로토콜-상대
  if (/^[/#?.]/.test(trimmed)) return trimmed; // 앱 내부 상대경로
  return `https://${trimmed}`; // bare host
}

/**
 * 외부 URL 에 쿼리 파라미터를 병합한다.
 *
 * `navigation.openExternal(url, parameter)` 처럼 외부 브라우저로 열 URL 을
 * 조립할 때 사용한다. object·string 두 형태를 모두 받아 동일 규칙으로 처리한다.
 *
 * - **object**: `{ tab: 'info', name: '김철수' }` → `String(v)` 후 인코딩.
 *   `null`/`undefined` 값은 스킵한다.
 * - **string**: `'tab=info&name=김철수'` (앞의 `?`/`&` 는 자동 제거) → `URLSearchParams`
 *   로 파싱 후 값 자동 인코딩. 이미 인코딩된 값도 idempotent 하게 정규화된다.
 * - 파라미터는 기존 쿼리에 **append**(동일 키가 있으면 양쪽 모두 보존).
 * - hash(`#`)가 있으면 쿼리는 hash 앞에 삽입된다(`URL` 표준 처리).
 * - 절대 URL 이 아니면(상대 경로 등) `URL` 생성 실패 → 수동 병합으로 폴백한다.
 *
 * @param url 기준 URL (외부 오픈은 보통 절대 URL)
 * @param parameter 붙일 쿼리 파라미터 (object 또는 쿼리스트링). 생략 시 url 그대로 반환.
 * @returns 파라미터가 병합된 최종 URL
 *
 * @example
 * buildUrlWithParams('https://a.com', { tab: 'info', id: 1 }) // https://a.com/?tab=info&id=1
 * buildUrlWithParams('https://a.com?x=1', 'y=2')              // https://a.com/?x=1&y=2
 * buildUrlWithParams('https://a.com/p#sec', { y: 2 })         // https://a.com/p?y=2#sec
 */
export function buildUrlWithParams(
  url: string,
  parameter?: Record<string, unknown> | string,
): string {
  if (!parameter) return url;

  const extra = new URLSearchParams();
  if (typeof parameter === 'string') {
    const raw = parameter.replace(/^[?&]+/, '');
    if (!raw) return url;
    new URLSearchParams(raw).forEach((v, k) => extra.append(k, v));
  } else {
    for (const [k, v] of Object.entries(parameter)) {
      if (v === undefined || v === null) continue;
      extra.append(k, String(v));
    }
  }

  const extraStr = extra.toString();
  if (!extraStr) return url;

  try {
    const u = new URL(url); // 절대 URL 정상 경로
    extra.forEach((v, k) => u.searchParams.append(k, v));
    return u.toString();
  } catch {
    // 상대/비표준 URL 폴백 — hash 앞에 쿼리 삽입
    const hashIdx = url.indexOf('#');
    const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
    const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${extraStr}${hash}`;
  }
}
