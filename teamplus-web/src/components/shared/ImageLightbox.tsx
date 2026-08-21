'use client';

/**
 * ImageLightbox — 이미지 전체화면 라이트박스 (preview lightbox 표준)
 *
 * 모든 이미지 미리보기 컴포넌트(ImageUploader / PhotoUploader / AvatarUploader)에서
 * 공유되는 lightbox 모달. SPEC_POPUP_FULLSCREEN_DIM 표준 준수.
 *
 * 표준 적용:
 *   1. useNativeScrim — Flutter 네이티브 safe-area 영역(상단 status bar / 하단 home
 *      indicator)까지 dim 처리 (Modal 표준 색상 '#8C141826' = rink-900 / 55%)
 *   2. overlay-fullscreen-wrapper + overlay-fullscreen-dim — viewport 100% (100dvh
 *      포함)까지 cover, z-index 9990 (AppBar 30 / BottomNav 40 위)
 *   3. createPortal(document.body) — DOM 상단으로 escape
 *   4. body scroll lock — lockBodyScroll / unlockBodyScroll
 *   5. ESC 키 + 오버레이 클릭 닫기
 *   6. role="dialog" + aria-modal="true" + aria-labelledby
 *
 * 줌: 핀치(2포인터) · 더블탭 토글 · 확대 중 1포인터 팬 · 데스크톱 휠.
 *   Pointer Events 단일 경로로 터치/마우스를 함께 처리하며, 요소 transform 줌이라
 *   WebView 의 페이지 확대 잠금(viewport) 과 무관하게 동작한다.
 *
 * SPEC: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md (2026-05-16)
 *
 * @example
 * <ImageLightbox
 *   isOpen={lightboxIndex !== null}
 *   onClose={() => setLightboxIndex(null)}
 *   src={previews[lightboxIndex].url}
 *   alt={`사진 ${lightboxIndex + 1}`}
 * />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import { resolveImageSrc } from '@/lib/image-url';

export interface ImageLightboxProps {
  /** 열림 상태 */
  isOpen: boolean;
  /** 닫기 핸들러 */
  onClose: () => void;
  /** 이미지 원본 URL (objectURL 또는 서버 URL) */
  src: string;
  /** 접근성 alt 텍스트 (대화상자 라벨로도 사용) */
  alt: string;
  /** 하단 캡션 (선택) */
  caption?: string;
  /** unoptimized — objectURL 등 외부 최적화 불가 시 true */
  unoptimized?: boolean;
}

// Modal 표준 scrim 컬러 (AARRGGBB) — rink-900 / 55%
const MODAL_SCRIM_COLOR = '#8C141826';

const MAX_SCALE = 4;
// 핀치 중에는 1 미만(고무줄)을 허용하고 손을 떼면 1로 스냅백한다
const PINCH_UNDER_SCALE = 0.7;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;
const TAP_MOVE_SLOP_PX = 12;

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const IDENTITY: Transform = { scale: 1, tx: 0, ty: 0 };

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function ImageLightbox({
  isOpen,
  onClose,
  src,
  alt,
  caption,
  // 일반 <img> 렌더링으로 전환되어 더이상 사용하지 않지만 호출부 호환을 위해 prop 시그니처 유지.
  unoptimized: _unoptimized = true,
}: ImageLightboxProps) {
  // ✅ 필수 1: Flutter Native scrim (iOS notch / Home Indicator / Android NavBar)
  useNativeScrim(isOpen, MODAL_SCRIM_COLOR);

  // ✅ 필수 2: body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [isOpen]);

  // ✅ 필수 3: ESC 키 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // 브라우저 당겨서-새로고침 완전 차단 — overscroll-behavior(scroll-lock)로 안 막히는
  // 환경(iOS WebKit·일부 Android Chrome) 대비, 오버레이에서 시작된 터치 스크롤 제스처의
  // 기본 동작을 non-passive 로 직접 취소한다. 줌/팬은 Pointer Events 로 처리되어 무관.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const el = wrapperRef.current;
    if (!el) return;
    const blockTouchMove = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', blockTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', blockTouchMove);
  }, [isOpen]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 오버레이(자기 자신) 클릭 시에만 닫기 — 내부 이미지 클릭은 무시
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // ── 줌/팬 상태 ─────────────────────────────────────────────
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  // 스냅백/더블탭에서만 transition 을 켠다 (제스처 추적 중엔 즉시 반영)
  const [animated, setAnimated] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
    startTx: number;
    startTy: number;
    startMid: { x: number; y: number };
  } | null>(null);
  const panLastRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  // transform 최신값을 이벤트 핸들러에서 재계산 없이 읽기 위한 미러
  const transformRef = useRef<Transform>(IDENTITY);
  transformRef.current = transform;
  // autolayout SoT — 뷰포트 크기는 useScreenMetrics 단일 진입점에서 읽는다
  const { width: viewportW, height: viewportH } = useScreenMetrics();
  const viewportRef = useRef({ w: viewportW, h: viewportH });
  viewportRef.current = { w: viewportW, h: viewportH };

  // 열림/이미지 변경 시 초기화
  useEffect(() => {
    setTransform(IDENTITY);
    setAnimated(false);
    pointersRef.current.clear();
    pinchRef.current = null;
    panLastRef.current = null;
    lastTapRef.current = null;
  }, [isOpen, src]);

  /** 이동 한계 — 확대된 이미지 가장자리가 화면 가장자리 이상 벗어나지 않게 clamp */
  const clampOffset = useCallback((scale: number, tx: number, ty: number) => {
    const img = imgRef.current;
    if (!img) return { tx, ty };
    // offsetWidth/Height = transform 미적용 레이아웃 크기 (표시 기준 크기)
    const { w: vw, h: vh } = viewportRef.current;
    const maxX = Math.max(0, (img.offsetWidth * scale - vw) / 2);
    const maxY = Math.max(0, (img.offsetHeight * scale - vh) / 2);
    return {
      tx: Math.min(maxX, Math.max(-maxX, tx)),
      ty: Math.min(maxY, Math.max(-maxY, ty)),
    };
  }, []);

  /** 화면 좌표 p 를 고정점으로 scale 을 next 로 변경했을 때의 translate 계산 */
  const zoomAt = useCallback(
    (p: { x: number; y: number }, next: number): Transform => {
      const { scale, tx, ty } = transformRef.current;
      const cx = viewportRef.current.w / 2;
      const cy = viewportRef.current.h / 2;
      const k = next / scale;
      const ntx = p.x - cx - (p.x - cx - tx) * k;
      const nty = p.y - cy - (p.y - cy - ty) * k;
      const clamped = clampOffset(next, ntx, nty);
      return { scale: next, ...clamped };
    },
    [clampOffset],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimated(false);
    movedRef.current = false;

    const points = [...pointersRef.current.values()];
    if (points.length === 2) {
      const { scale, tx, ty } = transformRef.current;
      pinchRef.current = {
        startDist: distance(points[0], points[1]),
        startScale: scale,
        startTx: tx,
        startTy: ty,
        startMid: midpoint(points[0], points[1]),
      };
      panLastRef.current = null;
    } else if (points.length === 1) {
      panLastRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current;
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const points = [...pointers.values()];
      if (points.length === 2 && pinchRef.current) {
        const pinch = pinchRef.current;
        const dist = distance(points[0], points[1]);
        if (pinch.startDist <= 0) return;
        const nextScale = Math.min(
          MAX_SCALE,
          Math.max(PINCH_UNDER_SCALE, pinch.startScale * (dist / pinch.startDist)),
        );
        // 시작 중점 기준으로 scale 고정점 유지 + 두 손가락 평행 이동(팬) 반영
        const mid = midpoint(points[0], points[1]);
        const cx = viewportRef.current.w / 2;
        const cy = viewportRef.current.h / 2;
        const k = nextScale / pinch.startScale;
        const anchorTx =
          pinch.startMid.x - cx - (pinch.startMid.x - cx - pinch.startTx) * k;
        const anchorTy =
          pinch.startMid.y - cy - (pinch.startMid.y - cy - pinch.startTy) * k;
        const { tx, ty } = clampOffset(
          nextScale,
          anchorTx + (mid.x - pinch.startMid.x),
          anchorTy + (mid.y - pinch.startMid.y),
        );
        movedRef.current = true;
        setTransform({ scale: nextScale, tx, ty });
        return;
      }

      if (points.length === 1 && panLastRef.current) {
        const dx = e.clientX - panLastRef.current.x;
        const dy = e.clientY - panLastRef.current.y;
        if (Math.hypot(dx, dy) > TAP_MOVE_SLOP_PX) movedRef.current = true;
        const { scale, tx, ty } = transformRef.current;
        if (scale <= 1) return; // 미확대 상태에선 팬 없음 (탭 판정만 유지)
        panLastRef.current = { x: e.clientX, y: e.clientY };
        const clamped = clampOffset(scale, tx + dx, ty + dy);
        setTransform({ scale, ...clamped });
      }
    },
    [clampOffset],
  );

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current;
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);

      const remaining = [...pointers.values()];
      if (remaining.length === 1) {
        // 핀치 → 팬 전환: 남은 손가락 기준으로 팬 기준점 재설정
        pinchRef.current = null;
        panLastRef.current = { x: remaining[0].x, y: remaining[0].y };
        return;
      }
      if (remaining.length > 0) return;

      pinchRef.current = null;
      panLastRef.current = null;

      const { scale } = transformRef.current;
      // 고무줄 스냅백: 핀치로 1 미만이 되었으면 원위치
      if (scale < 1) {
        setAnimated(true);
        setTransform(IDENTITY);
        return;
      }

      // 탭 / 더블탭 판정 (이동이 거의 없었던 짧은 접촉만)
      if (movedRef.current) return;
      const now = Date.now();
      const tap = { time: now, x: e.clientX, y: e.clientY };
      const last = lastTapRef.current;
      if (
        last &&
        now - last.time <= DOUBLE_TAP_MS &&
        distance(last, tap) <= DOUBLE_TAP_SLOP_PX
      ) {
        lastTapRef.current = null;
        setAnimated(true);
        const { scale: cur } = transformRef.current;
        setTransform(cur > 1 ? IDENTITY : zoomAt(tap, DOUBLE_TAP_SCALE));
      } else {
        lastTapRef.current = tap;
      }
    },
    [zoomAt],
  );

  // 데스크톱 휠 줌 (커서 고정점) — body scroll 은 잠겨 있어 페이지 스크롤과 충돌 없음
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const { scale } = transformRef.current;
      const next = Math.min(
        MAX_SCALE,
        Math.max(1, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)),
      );
      if (next === scale) return;
      setAnimated(false);
      setTransform(zoomAt({ x: e.clientX, y: e.clientY }, next));
    },
    [zoomAt],
  );

  if (!isOpen) return null;
  if (typeof window === 'undefined') return null;

  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const lightboxContent = (
    <div
      ref={wrapperRef}
      className="overlay-fullscreen-wrapper touch-none items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={handleOverlayClick}
    >
      <div className="overlay-fullscreen-dim" aria-hidden="true" />

      {/* 닫기 버튼 (우상단 safe-area 고려) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className={cn(
          'absolute z-10',
          'flex h-11 w-11 items-center justify-center rounded-full',
          'bg-black/55 text-white hover:bg-black/75',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
          'transition-colors motion-reduce:transition-none',
        )}
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
        }}
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          close
        </span>
      </button>

      {/* 줌 서피스 — pointer-events-auto 보장, touch-action 차단으로 제스처 독점 */}
      <div
        className={cn(
          'relative pointer-events-auto touch-none select-none',
          'animate-in fade-in zoom-in-95 duration-200 ease-out motion-reduce:animate-none',
        )}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={resolveImageSrc(src)}
          alt={alt}
          draggable={false}
          className="max-h-[80dvh] max-w-[92vw] object-contain will-change-transform"
          style={{
            transform: `translate3d(${transform.tx}px, ${transform.ty}px, 0) scale(${transform.scale})`,
            transformOrigin: 'center',
            transition:
              animated && !prefersReducedMotion ? 'transform 200ms ease-out' : 'none',
          }}
        />
      </div>

      {caption && (
        <p
          className="pointer-events-none absolute left-1/2 max-w-[92vw] -translate-x-1/2 text-center text-sm text-white/90 drop-shadow-sm"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
        >
          {caption}
        </p>
      )}
    </div>
  );

  return createPortal(lightboxContent, document.body);
}

export default ImageLightbox;
