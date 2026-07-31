import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";

/**
 * 쇼핑몰 서버측 피처 플래그 게이트 (fail-closed).
 *
 * 배경 (2026-07-30 · 전자상거래법 리스크 차단):
 *   쇼핑몰은 1차 오픈 범위에서 제외되었으나 백엔드 API 는 완비되어 있고
 *   상품 목록·상세는 `@Public()` 으로 비로그인 노출된다. 메뉴 진입점만 제거된
 *   상태였으므로 URL 직접 접근으로 실제 주문 시도가 가능했다.
 *
 *   이 상태에서 주문이 성립하면 아래 결함이 즉시 소비자 피해 + 법령 위반으로
 *   전환된다 (상세: docs/Planning/SHOP_LAUNCH_CHECKLIST.md).
 *     - 주문↔결제(PG) 단절 → 전자상거래법 §13② · §6(5년 보존) 이행 불가
 *     - 배송완료 청약철회 하드 차단 → 전자상거래법 §17① 직접 위반
 *     - 반품·교환 기능 전무 → §17③ · §18② 이행 불가
 *     - 상품정보제공고시 필드 미비 → §13④ + 공정위 고시 위반
 *     - 사업자정보 푸터 미배치 → §10①
 *
 * 정책:
 *   - 기본값 **차단**. `SHOP_ENABLED` 환경변수가 정확히 `"true"`(대소문자 무시,
 *     공백 trim) 일 때만 통과한다. 미설정·오타·빈 문자열은 모두 차단으로 수렴한다.
 *   - `ShopController` **클래스 레벨**에 부착하여 `@Public()` 엔드포인트까지 포함한
 *     전체 라우트를 일괄 차단한다 (데코레이터 누락 위험 제거).
 *   - 응답은 503 Service Unavailable — 기능 자체가 아직 제공되지 않는 상태이므로
 *     "권한 없음(403)" 이나 "리소스 없음(404)" 보다 정확하다. 클라이언트는
 *     `errorCode: SHOP_DISABLED` 로 분기할 수 있다.
 *
 * ⚠️ 부수 영향: 플래그 OFF 동안 teamplus-admin 의 쇼핑몰 관리 화면
 *   (상품/카테고리/배송정책/주문)도 동일하게 503 을 받는다. 카탈로그 준비 작업이
 *   필요한 환경에서는 해당 환경에만 `SHOP_ENABLED=true` 를 설정한다.
 *   (@Public 라우트는 JwtAuthGuard 가 인증을 건너뛰어 request.user 가 비어 있으므로
 *    "관리자만 통과" 같은 역할 기반 예외는 이 게이트에서 구현할 수 없다.)
 */

/** 서버측 쇼핑몰 활성화 환경변수명 (SoT). */
export const SHOP_ENABLED_ENV = "SHOP_ENABLED";

/** 차단 응답 errorCode — AllExceptionsFilter 가 response.error 를 errorCode 로 승격한다. */
export const SHOP_DISABLED_ERROR_CODE = "SHOP_DISABLED";

/** 차단 응답 메시지 (한국어). */
export const SHOP_DISABLED_MESSAGE =
  "쇼핑몰 서비스는 준비 중입니다. 정식 오픈 후 이용할 수 있습니다.";

/**
 * 쇼핑몰 활성화 여부. 기본값 false (fail-closed).
 *
 * 매 호출 시 `process.env` 를 다시 읽는다 — 모듈 로드 시점에 고정하지 않으므로
 * 테스트에서 플래그를 뒤집어 양쪽 경로를 모두 검증할 수 있다.
 */
export function isShopEnabled(): boolean {
  return (process.env[SHOP_ENABLED_ENV] ?? "").trim().toLowerCase() === "true";
}

@Injectable()
export class ShopEnabledGuard implements CanActivate {
  private readonly logger = new Logger(ShopEnabledGuard.name);

  canActivate(context: ExecutionContext): boolean {
    if (isShopEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    this.logger.warn(
      `[ShopEnabledGuard] 쇼핑몰 비활성화 상태 접근 차단: ${request.method} ${request.url}`,
    );

    throw new ServiceUnavailableException({
      message: SHOP_DISABLED_MESSAGE,
      error: SHOP_DISABLED_ERROR_CODE,
    });
  }
}
