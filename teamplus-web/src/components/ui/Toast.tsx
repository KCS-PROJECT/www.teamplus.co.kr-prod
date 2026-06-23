'use client';

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, memo, ReactNode } from 'react';
import { Icon } from './Icon';

// ─── 상수 정의 ──────────────────────────────────────────
// 2026-04-22: 사용자 요청으로 공통 4초 적용 (이전 3000ms). success/error/warning/info 전 variant 일괄.
// 개별 호출에서 options.duration 으로 override 가능.
const TOAST_DEFAULT_DURATION_MS = 4000;

// 2026-06-07: 동일 토스트 중복 표시 방지 window (사용자 지시 — "한 동작당 토스트 1개").
// 같은 variant + title + description 조합이 이 시간(ms) 안에 다시 호출되면 무시한다.
// 차단 대상: ① 버튼 더블클릭 ② React StrictMode 개발 모드 이중 effect ③ 전역(401/브릿지)
//   + 페이지 로컬 catch 가 거의 동시에 같은 메시지를 호출하는 경우.
// 1000ms 로 설정해 의도적 연속 동작(보통 1초 이상 간격, 예: 항목 여러 개 연속 삭제)은
// 정상적으로 각각 표시되도록 한다 (정상 동작을 막지 않는 보수적 window).
const TOAST_DEDUP_WINDOW_MS = 1000;
// 모바일에서는 `calc(100vw - 32px)` 로 전폭 활용, 태블릿/데스크톱에서는 이 상한값으로 중앙 정렬.
// 340px 은 iPhone SE 기준으로도 좁아 텍스트가 자주 줄바꿈되던 문제가 있어 440px 로 상향.
const TOAST_MAX_WIDTH = 440;

/**
 * Toast 변종(variant) — TEAMPLUS 디자인 시스템 P. 팝업·바텀시트 영역의 P5~P8.
 *  - route   (경로) — 화면 이동·라우팅 피드백. 다크 네이비 표면 + 화살표 아이콘.
 *  - info    (확인) — 일반 안내·확인. 화이트 표면 + 블루 액센트.
 *  - success (정상) — 성공 완료. 화이트 표면 + 그린 액센트.
 *  - warning (주의) — 주의 환기. 화이트 표면 + 앰버 액센트.
 *  - error          — 오류 (디자인 시스템 외 기본 viable, 빨강 액센트). 호환 유지.
 */
type ToastVariant = 'route' | 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
  onClose?: () => void;
}

interface ToastContextType {
  toast: {
    /**
     * 정상 — 성공·완료 피드백 (그린). 저장/등록/삭제 완료 등.
     * @example toast.success(MESSAGES.save.success);
     */
    success: (message: string, options?: ToastOptions) => void;
    /**
     * 오류 — 실패·예외 (레드). API 에러, 검증 실패 등.
     * @example toast.error(MESSAGES.error.network);
     */
    error: (message: string, options?: ToastOptions) => void;
    /**
     * 주의 — 사용자 환기 (앰버). 만료 임박, 데이터 불완전 등.
     * @example toast.warning('크레딧 만료가 7일 남았습니다.');
     */
    warning: (message: string, options?: ToastOptions) => void;
    /**
     * 확인 — 일반 안내 (블루). 읽음 처리, 정보 노출 등.
     * @example toast.info('설정이 적용되었습니다.');
     */
    info: (message: string, options?: ToastOptions) => void;
    /**
     * 경로 — 화면 이동·라우팅 피드백 (다크 네이비 + 화살표).
     * 사용 가이드: 페이지 전환 후 바로가기·되돌리기 액션을 함께 노출하는 라우팅 컨텍스트에서만 사용.
     * 단순 성공 알림은 `toast.success`, 정보 안내는 `toast.info` 사용 권장.
     * @example
     *   toast.route('수업 신청 완료', {
     *     description: '내 수업 페이지에서 확인할 수 있어요.',
     *     actionLabel: '바로가기',
     *     onAction: () => navigate('/parent/classes'),
     *   });
     */
    route: (message: string, options?: ToastOptions) => void;
    show: (props: Omit<Toast, 'id'>) => void;
  };
}

interface ToastOptions {
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
  onClose?: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// ─── Variant 설정 (솔리드 컬러만, gradient/blur 금지) ─────
// TEAMPLUS 디자인 시스템 P5~P8 매핑 (참고: 팀플러스 추가화면 P5~P8):
//   P5 경로(route)   — 슬레이트 #1F2937 솔리드 + 블루 액센트 라벨
//   P6 확인(info)    — 블루   #2563EB 솔리드 + 라이트 블루 액센트 라벨
//   P7 정상(success) — 에메랄드 #059669 솔리드 + 라이트 그린 액센트 라벨
//   P8 주의(warning) — 앰버  #F59E0B 솔리드 + 오프 화이트 액센트 라벨
//   error            — 호환 유지 (장미 #E11D48 솔리드 + 라이트 핑크 액센트 라벨)
//
// 모든 variant 가 솔리드 컬러 위 화이트 텍스트로 통일됨. dark mode 도 동일 솔리드.
// gradient/backdrop-blur 0건, 컬러 그림자 0건 (sh-3 토큰 사용).
// ariaLive — error 는 assertive, 나머지 polite.
interface VariantStyle {
  icon: string;
  iconBg: string;          // 32×32 반투명 화이트 박스
  iconColor: string;       // 아이콘 색
  surface: string;         // 카드 솔리드 배경
  accent: string;          // 카테고리 라벨 텍스트 색
  label: string;           // 카테고리 라벨 ("경로"/"확인"/"정상"/"주의"/"오류")
  titleColor: string;      // 제목 텍스트 색
  bodyColor: string;       // 보조 설명 색
  closeColor: string;      // 닫기 아이콘 색
  closeHoverBg: string;    // 닫기 hover bg
  actionColor: string;     // CTA 텍스트 색 (transparent + accent)
  ariaLive: 'polite' | 'assertive';
}

// 정확한 hex 매칭 (참고 디자인 TOAST_VARIANTS 100% 일치):
//   route:   bg #1F2937 / accent #60A5FA
//   info:    bg #2563EB / accent #DBEAFE
//   success: bg #059669 / accent #A7F3D0
//   warn:    bg #F59E0B / accent #FFFBEB
//   error:   bg #E11D48 / accent #FECDD3 (호환용, 참고에는 없음)
// iconBg 는 모든 variant 동일 `bg-white/[0.16]` (rgba 255,255,255,0.16).
// bodyColor 는 모든 variant 동일 `text-white/85` (rgba 255,255,255,0.85).
const variantConfig: Record<ToastVariant, VariantStyle> = {
  route: {
    icon: 'route',
    iconBg: 'bg-white/[0.16]',
    iconColor: 'text-white',
    surface: 'bg-[#1F2937] dark:bg-[#1F2937]',
    accent: 'text-[#60A5FA] dark:text-[#60A5FA]',
    label: '경로',
    titleColor: 'text-white',
    bodyColor: 'text-white/85',
    closeColor: 'text-white/80',
    closeHoverBg: 'hover:bg-white/10',
    actionColor: 'text-[#60A5FA]',
    ariaLive: 'polite',
  },
  info: {
    icon: 'info',
    iconBg: 'bg-white/[0.16]',
    iconColor: 'text-white',
    surface: 'bg-[#2563EB] dark:bg-[#2563EB]',
    accent: 'text-[#DBEAFE] dark:text-[#DBEAFE]',
    label: '확인',
    titleColor: 'text-white',
    bodyColor: 'text-white/85',
    closeColor: 'text-white/80',
    closeHoverBg: 'hover:bg-white/15',
    actionColor: 'text-[#DBEAFE]',
    ariaLive: 'polite',
  },
  success: {
    icon: 'check_circle',
    iconBg: 'bg-white/[0.16]',
    iconColor: 'text-white',
    surface: 'bg-[#059669] dark:bg-[#059669]',
    accent: 'text-[#A7F3D0] dark:text-[#A7F3D0]',
    label: '정상',
    titleColor: 'text-white',
    bodyColor: 'text-white/85',
    closeColor: 'text-white/80',
    closeHoverBg: 'hover:bg-white/15',
    actionColor: 'text-[#A7F3D0]',
    ariaLive: 'polite',
  },
  warning: {
    icon: 'warning',
    iconBg: 'bg-white/[0.16]',
    iconColor: 'text-white',
    surface: 'bg-[#F59E0B] dark:bg-[#F59E0B]',
    accent: 'text-[#FFFBEB] dark:text-[#FFFBEB]',
    label: '주의',
    titleColor: 'text-white',
    bodyColor: 'text-white/85',
    closeColor: 'text-white/80',
    closeHoverBg: 'hover:bg-white/15',
    actionColor: 'text-[#FFFBEB]',
    ariaLive: 'polite',
  },
  error: {
    icon: 'error',
    iconBg: 'bg-white/[0.16]',
    iconColor: 'text-white',
    surface: 'bg-[#E11D48] dark:bg-[#E11D48]',
    accent: 'text-[#FECDD3] dark:text-[#FECDD3]',
    label: '오류',
    titleColor: 'text-white',
    bodyColor: 'text-white/85',
    closeColor: 'text-white/80',
    closeHoverBg: 'hover:bg-white/15',
    actionColor: 'text-[#FECDD3]',
    ariaLive: 'assertive',
  },
};

// ─── ToastItem 컴포넌트 (메모이제이션) ───────────────────
interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem = memo(function ToastItem({ toast, onRemove }: ToastItemProps) {
  const config = variantConfig[toast.variant];
  const [isExiting, setIsExiting] = useState(false);

  // Auto-dismiss 타이머
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
    }, toast.duration);

    return () => clearTimeout(timer);
  }, [toast.duration]);

  // 퇴장 애니메이션 완료 후 제거
  // deps에 toast 객체 전체를 넣으면 상위 ToastProvider 재렌더로 toast 참조가
  // 바뀔 때마다 effect 가 재실행되어 exitTimer 가 중복 등록된다 (Maximum update
  // depth exceeded 원인, WEB-052). 필요한 필드만 추출해서 참조 안정화.
  useEffect(() => {
    if (!isExiting) return;
    const exitTimer = setTimeout(() => {
      onRemove(toast.id);
      toast.onClose?.();
    }, 300);
    return () => clearTimeout(exitTimer);
    // exhaustive-deps 룰은 toast 전체를 요구하지만 의도적으로 id·onClose 만 사용 (WEB-052)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExiting, onRemove, toast.id, toast.onClose]);

  // toast 전체 대신 onAction 만 deps 로 (WEB-052 참조 안정화)
  // 참고 디자인 P5~P8 은 닫기 버튼 없이 auto-dismiss 만 사용하므로 handleClose 제거됨.
  const handleAction = useCallback(() => {
    toast.onAction?.();
    setIsExiting(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.onAction]);

  // 참고 디자인 P5~P8: alignItems 항상 flex-start (description 유무와 무관하게 고정).
  // letterSpacing -0.02em 은 wrapper 에 적용해 모든 자식 텍스트(제목/본문/CTA) 일괄 상속.
  return (
    <div
      className={`
        relative ${config.surface} rounded-[14px]
        flex items-start gap-3 px-4 py-3.5
        transition-all duration-300 ease-out motion-reduce:transition-none
        ${isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0 animate-slide-up'}
      `}
      style={{
        width: '100%',
        letterSpacing: '-0.02em',
        boxShadow:
          '0 12px 28px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(15, 23, 42, 0.10)',
      }}
      role="alert"
      aria-live={config.ariaLive}
    >
      {/* 아이콘 박스 — 32×32 반투명 화이트(rgba 255,255,255,0.16) · marginTop 1px (참고 사양 정확 매칭) */}
      <div
        className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-[10px] mt-px ${config.iconBg}`}
        aria-hidden="true"
      >
        <Icon
          name={config.icon}
          className={`${config.iconColor} text-[20px]`}
          filled
        />
      </div>

      {/* 콘텐츠 — 카테고리 라벨(11/700/0.04em uppercase) → 제목(14/700/1.35) → 본문(12/500/1.45/white85, mt 2px) */}
      <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
        <span
          className={`text-[11px] font-bold uppercase leading-none ${config.accent}`}
          style={{ letterSpacing: '0.04em' }}
        >
          {config.label}
        </span>
        <p className={`text-[14px] font-bold leading-[1.35] ${config.titleColor}`}>
          {toast.title}
        </p>
        {toast.description && (
          <p className={`text-[12px] font-medium leading-[1.45] mt-0.5 ${config.bodyColor}`}>
            {toast.description}
          </p>
        )}
      </div>

      {/* CTA 버튼 — transparent + accent 컬러, padding 6px 4px, fontSize 13/700 (참고 P5/P6/P8 정확 매칭).
          접근성: WCAG AA 44×44 터치 타겟은 자동 dismiss(4초) + 외부 ESC 핸들러 미적용 환경에서
          필수가 아니므로 참고 디자인 padding(6px 4px) 그대로 유지. min-w/h 강제 없음. */}
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          onClick={handleAction}
          className={`shrink-0 self-center inline-flex items-center justify-center bg-transparent border-0 py-1.5 px-1 text-[13px] font-bold leading-none transition-opacity motion-reduce:transition-none hover:opacity-80 active:opacity-70 ${config.actionColor}`}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
});

// ─── ToastProvider ────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 중복 표시 방지 — signature(variant|title|description) → 마지막 표시 시각(ms).
  // ref 라서 재렌더를 유발하지 않고, addToast 의 useCallback deps 도 비울 수 있다.
  const recentToastRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((props: Omit<Toast, 'id'>) => {
    // ── 중복 가드 ──────────────────────────────────────────
    // 같은 variant + title + description 조합이 TOAST_DEDUP_WINDOW_MS 안에 다시
    // 들어오면 무시한다. (더블클릭 · StrictMode 이중 effect · 전역+로컬 동시 호출)
    // 액션(onAction) 콜백 차이는 signature 에서 의도적으로 제외 — 동일 안내문은
    // 한 번만 노출하는 것이 "한 동작당 토스트 1개" 정책에 부합.
    const signature = `${props.variant}|${props.title}|${props.description ?? ''}`;
    const now = Date.now();
    const recent = recentToastRef.current;
    const lastShownAt = recent.get(signature);
    if (lastShownAt !== undefined && now - lastShownAt < TOAST_DEDUP_WINDOW_MS) {
      return; // 중복 — 무시
    }
    recent.set(signature, now);
    // 메모리 누수 방지 — window 가 지난 오래된 signature 정리.
    recent.forEach((shownAt, key) => {
      if (now - shownAt >= TOAST_DEDUP_WINDOW_MS) recent.delete(key);
    });

    const id = `toast-${now}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { id, ...props }]);
  }, []);

  // toast 객체를 useMemo 로 안정화한다. 그렇지 않으면 매 렌더마다 새 객체가
  // 생성되어 이 객체를 useEffect / useCallback deps 에 사용하는 모든 consumer
  // (30+ 파일) 가 무한 재실행 루프에 빠질 수 있다. 실제 `/coach-students` 에서
  // API 실패 → toast.error → setToasts → Provider 재렌더 → toast 참조 변경 →
  // fetchStudents 재생성 → useEffect 재실행 → ... Maximum update depth exceeded.
  const toast = useMemo(
    () => ({
      success: (message: string, options?: ToastOptions) =>
        addToast({
          variant: 'success',
          title: message,
          duration: TOAST_DEFAULT_DURATION_MS,
          ...options,
        }),
      error: (message: string, options?: ToastOptions) =>
        addToast({
          variant: 'error',
          title: message,
          duration: TOAST_DEFAULT_DURATION_MS,
          ...options,
        }),
      warning: (message: string, options?: ToastOptions) =>
        addToast({
          variant: 'warning',
          title: message,
          duration: TOAST_DEFAULT_DURATION_MS,
          ...options,
        }),
      info: (message: string, options?: ToastOptions) =>
        addToast({
          variant: 'info',
          title: message,
          duration: TOAST_DEFAULT_DURATION_MS,
          ...options,
        }),
      route: (message: string, options?: ToastOptions) =>
        addToast({
          variant: 'route',
          title: message,
          duration: TOAST_DEFAULT_DURATION_MS,
          ...options,
        }),
      show: (props: Omit<Toast, 'id'>) => addToast(props),
    }),
    [addToast],
  );

  const contextValue = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast Container — fixed 위치, BottomNav 위 (iOS Safe Area 반영) */}
      {/* width: calc(100vw - 32px) 로 모바일에서 좌우 16px 여백 유지, maxWidth 로 태블릿·데스크톱 상한 */}
      <div
        data-testid="toast-container"
        className="fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none bottom-[calc(6rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]"
        style={{ width: 'calc(100vw - 32px)', maxWidth: TOAST_MAX_WIDTH }}
      >
        <div className="flex flex-col gap-2 pointer-events-auto">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onRemove={removeToast} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
