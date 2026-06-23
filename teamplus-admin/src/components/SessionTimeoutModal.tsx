'use client';

import { useEffect } from 'react';

interface SessionTimeoutModalProps {
  isOpen: boolean;
  /** 모달을 닫고 현재 세션을 유지(연장)한다. */
  onExtend: () => void;
  /** 로그아웃 후 로그인 페이지로 이동한다. (재로그인) */
  onLogout: () => void;
}

/**
 * 자동 로그아웃 안내 모달
 *
 * 유휴 시간이 임계치에 도달하면 표시된다.
 * - "닫기"  → onExtend: 모달 닫고 세션 유지(타이머 리셋)
 * - "재로그인" → onLogout: 로그아웃 후 로그인 페이지 이동
 */
export function SessionTimeoutModal({
  isOpen,
  onExtend,
  onLogout,
}: SessionTimeoutModalProps) {
  // ESC 키로 닫기 방지 (사용자가 버튼으로 직접 선택하도록)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-6 animate-in fade-in duration-200">
      <div className="w-full max-w-[340px] overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-xl animate-in zoom-in-95 duration-200">
        {/* 본문 */}
        <div className="px-6 pt-8 pb-7 text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            자동 로그아웃 안내
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            안전한 사용을 위해 일정 시간 후
            <br />
            자동으로 로그아웃됩니다.
            <br />
            서비스를 계속 이용하시려면
            <br />
            재로그인 해주세요.
          </p>
        </div>

        {/* 버튼 */}
        <div className="flex border-t border-slate-100 dark:border-slate-700">
          <button
            type="button"
            onClick={onExtend}
            className="flex-1 py-4 text-[15px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex-1 py-4 text-[15px] font-semibold text-white bg-primary hover:bg-primary-dark transition-colors"
          >
            재로그인
          </button>
        </div>
      </div>
    </div>
  );
}
