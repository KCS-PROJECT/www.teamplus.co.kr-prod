/**
 * 이미지 표시용 URL 절대화 헬퍼 (SoT · Display-Only)
 *
 * 백엔드(`POST /api/v1/files/upload`)는 응답으로 상대 경로(`/uploads/...`)만 반환하고,
 * DB(`ChildProfile.imageUrl` 등)에도 상대 경로 그대로 저장된다. 페이지 호스트가 백엔드 호스트와
 * 다를 때(예: Next.js 5001 ↔ NestJS 5003, 안드로이드 실기기 LAN IP) 브라우저는 상대 경로를
 * 페이지 호스트로 해석하여 이미지 로드가 실패한다.
 *
 * 본 모듈은 **표시 시점에만** 절대 URL 로 변환한다. 폼 제출/저장은 절대로 거치지 않도록 한다
 * (DB 상대 경로 SoT 보전 · 도메인/CDN 마이그레이션 시 깨지지 않도록).
 *
 * 외부 CDN(`https://`), data URI, blob URI, protocol-relative(`//`) 는 이미 절대 URL 이므로
 * 그대로 통과시킨다 → 모든 `<img src>` 에 안전하게 끼울 수 있다.
 */

import { env } from '@/lib/env';

/** apiBase trailing slash 제거 (한 번 계산 후 모듈 내 재사용) */
const API_BASE = (env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

/**
 * 정적 자원(`/uploads/...`) 절대화 용 origin.
 *
 * `NEXT_PUBLIC_API_URL` 이 `http://localhost:5003/api/v1` 처럼 path suffix 를 포함하면
 * 정적 자원 prefix `/uploads/` 가 `/api/v1/uploads/` 로 합성되어 backend 정적 서빙
 * (`/uploads/` 단일 prefix)과 어긋나 404 발생.
 *
 * 따라서 절대 URL 합성 시에는 origin (scheme + host + port) 만 사용한다.
 * 2026-05-23 hotfix — Admin/.env 의 `/api/v1` suffix 환경에서 발생한 팀 로고 404 차단.
 */
const API_ORIGIN = (() => {
  if (!API_BASE) return '';
  try {
    return new URL(API_BASE).origin;
  } catch {
    return API_BASE;
  }
})();

/** placeholder 로 끝나는지 검사 — 기존 코드(`!imageUrl.endsWith('/placeholder.svg')`) 호환 */
function isPlaceholder(url: string): boolean {
  return url.endsWith('/placeholder.svg');
}

/** 이미 절대 URL 인지 (data/blob/http/https/protocol-relative) */
function isAbsoluteUrl(url: string): boolean {
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('//')
  );
}

/**
 * 이미지 URL 을 표시용 절대 URL 로 정규화한다.
 *
 * - `null` / `undefined` / 빈 문자열 / 공백만 / `/placeholder.svg` 로 끝나는 값 → `null`
 * - `data:` / `blob:` / `http://` / `https://` / `//` 시작 → 원본 그대로 반환 (cacheBust 무시)
 * - `/` 시작 → `${API_BASE}${path}` (apiBase trailing slash 정규화됨)
 * - 그 외 → `${API_BASE}/${path}` (방어적)
 *
 * @param cacheBust 같은 URL 강제 새로 받기 — 프로필 사진 등 즉시 갱신용.
 *   - `Date`/`number`/`string` 값을 그대로 `?v=` query 로 부착.
 *   - data:/blob: URL 은 영향 없음 (cacheBust 인자 무시).
 */
export function resolveImageUrl(
  url: string | null | undefined,
  cacheBust?: number | string | Date | null,
): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (trimmed === '') return null;
  if (isPlaceholder(trimmed)) return null;
  // data:/blob: 는 캐시 무력화 불필요·불가
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  // 정적 자원(`/uploads/...`) 은 API_ORIGIN(scheme+host+port) 기준으로 합성.
  //   `${API_BASE}${trimmed}` 로 합성하면 NEXT_PUBLIC_API_URL 에 `/api/v1` 같은 path suffix 가
  //   포함됐을 때 `/uploads/...` 가 `/api/v1/uploads/...` 가 되어 backend 404 발생.
  const base = isAbsoluteUrl(trimmed)
    ? trimmed
    : trimmed.startsWith('/')
      ? `${API_ORIGIN}${trimmed}`
      : `${API_ORIGIN}/${trimmed}`;

  if (cacheBust == null || cacheBust === '') return base;
  const version =
    cacheBust instanceof Date ? cacheBust.getTime() : String(cacheBust);
  if (!version) return base;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}v=${encodeURIComponent(version)}`;
}

/**
 * `<img src=>` prop 에 바로 넣을 때 편의용. `null` → `undefined` 변환.
 *
 * `<img src={undefined}>` 는 src 미설정과 동일하므로 falsy 분기(`url ? <img/> : <fallback/>`)
 * 와 자연스럽게 호환된다.
 *
 * @param cacheBust 프로필 사진 등 즉시 갱신용. 보통 `user.updatedAt` 또는 `Date.now()` 전달.
 */
export function resolveImageSrc(
  url: string | null | undefined,
  cacheBust?: number | string | Date | null,
): string | undefined {
  const resolved = resolveImageUrl(url, cacheBust);
  return resolved ?? undefined;
}

/**
 * 절대 URL 이 들어왔을 때 백엔드 base 가 매칭되면 상대 경로로 환원한다.
 *
 * 폼 제출 시점 안전망 — 사용자가 `resolveImageUrl()` 결과를 다시 폼 상태에 넣어
 * DB 로 흘려보내는 사고를 차단한다. 현재 호출 흐름(폼은 상대 경로 보존)에선 호출할 일이
 * 거의 없지만, 향후 회귀 차단용으로 노출한다.
 *
 * - apiBase 와 origin 이 일치하는 절대 URL → pathname + query + hash 반환 (`/uploads/...`)
 * - apiBase 와 origin 이 다르거나(외부 CDN), 이미 상대 경로 → 원본 그대로 반환
 */
export function stripApiBase(
  url: string | null | undefined,
): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  if (trimmed === '') return null;
  if (!isAbsoluteUrl(trimmed)) return trimmed;
  if (!API_BASE) return trimmed;
  try {
    const u = new URL(trimmed);
    const base = new URL(API_BASE);
    if (u.origin !== base.origin) return trimmed;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return trimmed;
  }
}
