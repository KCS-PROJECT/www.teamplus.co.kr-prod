/**
 * `resolveAppStatusVisibility` 회귀 가드 — appstatus-fix F4.
 *
 * AppStatus(네이티브 상태바) 영구 숨김 회귀 systemic 수정의 핵심 불변식:
 *   "풀스크린 의도 화면을 제외한 모든 라우트는 상태바 표시(show)" +
 *   "정당한 풀스크린 4종(splash/onboarding/force-update/갤러리 풀뷰어)은 컨트롤러
 *    force-show 가 침범하지 않도록 skip".
 *
 * 이 테스트가 깨지면:
 *   - 갤러리 풀뷰어/force-update 에서 AppStatusController 의 force-show 가 페이지의
 *     useFullscreen() 을 덮어써 상태바가 깜빡이거나(SPEC §6.2 회귀), 반대로
 *   - 일반 라우트가 잘못 skip/hide 되어 상태바가 영구 숨김(원 회귀)될 수 있다.
 */
import {
  resolveAppStatusVisibility,
  isAppStatusHiddenPath,
  APP_STATUS_HIDDEN_PREFIXES,
} from '../app-status';

describe('resolveAppStatusVisibility — 일반 라우트는 표시(show)', () => {
  const showPaths = [
    '/',
    '/parent',
    '/coach',
    '/director',
    '/admin',
    '/dashboard',
    '/credits',
    '/mypage',
    '/notifications',
    // 갤러리 목록/앨범은 풀스크린이 아니다 → 표시
    '/photos',
    '/photos/album-123',
  ];
  it.each(showPaths)('%s → "show"', (path) => {
    expect(resolveAppStatusVisibility(path)).toBe('show');
  });

  it('null/undefined → "show" (안전 기본값)', () => {
    expect(resolveAppStatusVisibility(null)).toBe('show');
    expect(resolveAppStatusVisibility(undefined)).toBe('show');
  });
});

describe('resolveAppStatusVisibility — 풀스크린 화이트리스트 4종은 skip (F4)', () => {
  const skipPaths = [
    '/splash',
    '/onboarding',
    '/force-update',
    // 갤러리 풀뷰어: (gallery) route group 제거 후 런타임 pathname
    '/photos/album-123/photo-456',
    '/photos/album-123/photo-456/', // trailing slash
  ];
  it.each(skipPaths)('%s → "skip" (컨트롤러 force-show 미관여)', (path) => {
    expect(resolveAppStatusVisibility(path)).toBe('skip');
  });

  it('하위 경로 prefix 매칭 — /splash/* , /onboarding/* , /force-update/* 도 skip', () => {
    expect(resolveAppStatusVisibility('/splash/intro')).toBe('skip');
    expect(resolveAppStatusVisibility('/onboarding/step-2')).toBe('skip');
    expect(resolveAppStatusVisibility('/force-update/details')).toBe('skip');
  });

  it('갤러리 풀뷰어 leaf(3세그먼트)만 skip — 그리드 2종은 절대 skip 아님(상태바 표시 보존)', () => {
    // 1세그먼트(앨범 그리드) — 표시
    expect(resolveAppStatusVisibility('/photos')).toBe('show');
    // 2세그먼트(사진 그리드) — 표시
    expect(resolveAppStatusVisibility('/photos/album-1')).toBe('show');
    // 3세그먼트(풀뷰어 leaf) — skip
    expect(resolveAppStatusVisibility('/photos/album-1/photo-1')).toBe('skip');
  });

  it('정확 매칭($ 앵커) — 가상의 4세그먼트 하위 경로는 skip 아님(과매칭 방지)', () => {
    // leaf 정규식 ^/photos/[^/]+/[^/]+/?$ 는 3세그먼트(+trailing slash)만 매칭.
    // 향후 /photos/{albumId}/{photoId}/comments 같은 하위 경로가 생겨도 풀스크린으로
    // 오분류되지 않도록 회귀 가드.
    expect(resolveAppStatusVisibility('/photos/album-1/photo-1/comments')).toBe(
      'show',
    );
  });
});

describe('숨김(hide) 정책 — 현재 숨김 prefix 없음(2026-06-15 전 인증화면 표시 전환)', () => {
  it('APP_STATUS_HIDDEN_PREFIXES 가 비어 있으면 어떤 라우트도 hide 아님', () => {
    // 정책 SoT: 현재 숨김 대상 없음. 숨김 prefix 추가 시 본 가드를 함께 갱신할 것.
    expect(APP_STATUS_HIDDEN_PREFIXES.length).toBe(0);
    expect(resolveAppStatusVisibility('/login')).toBe('show');
    expect(resolveAppStatusVisibility('/signup')).toBe('show');
    expect(isAppStatusHiddenPath('/login')).toBe(false);
  });
});
