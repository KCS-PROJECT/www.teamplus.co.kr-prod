/**
 * 쇼핑몰 클라이언트 피처 플래그 (fail-closed).
 *
 * 배경 (2026-07-30 · 전자상거래법 리스크 차단):
 *   쇼핑몰은 1차 오픈 범위에서 제외되었으나 `(shop)` 8개 페이지가 모두 실 API 에
 *   연동되어 있어 URL 직접 입력으로 진입 가능했다. 메뉴 진입점 제거만으로는
 *   차단이 되지 않으므로 라우트 그룹 레이아웃에서 명시적으로 차단한다.
 *
 * 정책:
 *   - 기본값 **차단**. `NEXT_PUBLIC_SHOP_ENABLED` 가 정확히 `"true"` 일 때만 오픈.
 *     미설정·오타·빈 문자열은 모두 차단으로 수렴한다.
 *   - `NEXT_PUBLIC_*` 는 빌드 타임에 인라인되므로 이 값은 런타임 내내 불변이다.
 *     따라서 레이아웃에서 조건 분기(컴포넌트 교체)를 해도 Hook 순서가 흔들리지 않는다.
 *
 * ⚠️ 클라이언트 차단은 **우회 가능**하다(DevTools · 직접 API 호출 · 구 번들 캐시).
 *   실질 차단의 SoT 는 백엔드 `SHOP_ENABLED` + `ShopEnabledGuard`(503 SHOP_DISABLED)이며
 *   이 파일은 사용자에게 깨진 화면 대신 안내를 보여주기 위한 1차 방어선이다.
 *
 * 오픈 전 필수 조치: docs/Planning/SHOP_LAUNCH_CHECKLIST.md
 */

/** 클라이언트 쇼핑몰 활성화 환경변수명 (문서·에러 메시지용). */
export const SHOP_ENABLED_ENV_NAME = 'NEXT_PUBLIC_SHOP_ENABLED';

/** 쇼핑몰 오픈 여부. 기본값 false (fail-closed). */
export const SHOP_ENABLED =
  (process.env.NEXT_PUBLIC_SHOP_ENABLED ?? '').trim().toLowerCase() === 'true';
