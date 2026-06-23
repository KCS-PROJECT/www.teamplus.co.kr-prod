/**
 * 모달/오버레이 계층 z-index 공통 상수
 *
 * 이전에는 각 모달이 `z-50` / `z-60` / `z-[9999]` / `z-[10000]` 으로 분산되어
 * 중첩 시 뒤 모달이 앞 모달 위로 침몰하는 버그가 발생할 수 있었다.
 * 본 상수로 **표준 모달(Z_MODAL) < 최우선 모달(Z_MODAL_TOP) < 토스트(Z_TOAST)**
 * 순의 명확한 계층을 부여한다.
 *
 * 사용 예:
 * ```tsx
 * import { Z_MODAL_TOP } from './z-index';
 * <div className="fixed inset-0" style={{ zIndex: Z_MODAL_TOP }}>…</div>
 * // 또는 Tailwind 임의값과 함께
 * <div className={`fixed inset-0 z-[${Z_MODAL_TOP}]`}>
 * ```
 *
 * NOTE: 상수값 자체를 그대로 `style` 또는 `className={'z-['+n+']'}` 로 쓰는 게 가장
 * 안전하다. 동적 Tailwind 클래스는 JIT가 감지 못할 수 있으므로 `z-[9990]` 처럼 이미
 * 존재하는 리터럴을 써도 된다 (tailwind.config content 경로 내라면 JIT 인식).
 */

/** Sticky AppBar/Header 계층 */
export const Z_APPBAR = 20;

/** Full-screen 모달 (FullModal) — body 전체를 덮지만 토스트/알럿보다 아래 */
export const Z_FULL_MODAL = 9980;

/** 표준 모달 — Modal · AlertDialog · BottomSheet */
export const Z_MODAL = 9990;

/** 최우선 모달 — ConfirmDialog · EventPopup (사용자 결정이 필요한 중요한 모달) */
export const Z_MODAL_TOP = 10000;

/** 토스트 · 글로벌 알림 리스너 — 모든 모달 위 */
export const Z_TOAST = 10100;
