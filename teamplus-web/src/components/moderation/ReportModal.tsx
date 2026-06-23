'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scroll-lock';

interface ReportModalProps {
  /** 신고 대상 사용자 ID (백엔드 reportedId — 필수) */
  reportedId: string;
  /** 신고 대상 유형 (기본 user). 콘텐츠 신고 시 chat_message/gallery_photo/review/notice 등 */
  targetType?:
    | 'user'
    | 'chat_message'
    | 'gallery_photo'
    | 'review'
    | 'notice'
    | 'pickup_match';
  /** 콘텐츠 신고 시 리소스 ID (메시지/리뷰 ID 등) */
  targetId?: string;
  targetName: string;
  onClose: () => void;
}

// label=표시 문구 · value=백엔드 category (spam|harassment|inappropriate|fake_profile|ip_infringement|other)
const REPORT_REASONS = [
  { value: 'spam', label: '스팸 · 광고' },
  { value: 'harassment', label: '욕설 · 비방 · 괴롭힘' },
  { value: 'inappropriate', label: '부적절한 콘텐츠' },
  { value: 'fake_profile', label: '사칭' },
  // 저작권·상표·초상권 침해 (iOS 5.2 / AOS #9888072 — IP takedown 채널)
  { value: 'ip_infringement', label: '저작권 · 상표 · 초상권 침해' },
  { value: 'other', label: '기타' },
] as const;

type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export function ReportModal({
  reportedId,
  targetType = 'user',
  targetId,
  targetName,
  onClose,
}: ReportModalProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // [2026-05-16 v2] 네이티브 status bar 영역만 dim — Sheet 패턴.
  //   wrapper `items-end sm:items-center` 로 모바일에서 BottomSheet, 데스크탑에서
  //   Modal 동작. 모바일(Flutter WebView) 에서는 `bottom: false` 로 시트 패턴 적용.
  //   Modal 표준 컬러 #8C141826 (rink-900/55) 유지 — 데스크탑 isNativeApp=false 이므로 noop.
  //   SoT: docs/Design/MODAL_DIM_POLICY.md (BottomSheet 패턴)
  useNativeScrim(true, '#8C141826', { bottom: false });

  // body scroll lock + ESC 닫기 — Modal 표준 (Modal.tsx 패턴 동일)
  useEffect(() => {
    lockBodyScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockBodyScroll();
    };
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!reason) return;
    setIsSubmitting(true);
    const res = await api.post('/users/me/reports', {
      reportedId,
      targetType,
      targetId,
      category: reason,
      description: detail.trim() || undefined,
    });
    setIsSubmitting(false);
    if (res.success) {
      toast.success('신고가 접수되었습니다. 검토 후 조치하겠습니다.');
      onClose();
    } else {
      const msg = (res.error as { message?: string })?.message;
      if (msg?.includes('24시간') || msg?.includes('already')) {
        toast.error('이미 신고한 대상입니다. 24시간 후 다시 신고할 수 있습니다.');
      } else {
        toast.error(msg ?? '신고 접수에 실패했습니다.');
      }
    }
  }, [reason, detail, reportedId, targetType, targetId, onClose, toast]);

  if (typeof window === 'undefined') return null;

  // SPEC §2 canonical 3-element pattern (wrapper + dim + body)
  //  · 모바일: items-end (바텀시트), sm+: items-center (다이얼로그)
  //  · dim onClick 으로 직접 닫기 — wrapper target 비교 불필요
  //  · body: relative pointer-events-auto z-10
  const content = (
    <div
      className="overlay-fullscreen-wrapper items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="신고하기"
    >
      <div
        className="overlay-fullscreen-dim animate-overlay-in motion-reduce:animate-none"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative pointer-events-auto z-10 w-full sm:max-w-md bg-white dark:bg-rink-900 rounded-t-2xl sm:rounded-2xl p-5 space-y-5"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-wtext-1 dark:text-white">신고하기</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-wline-2 dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none"
            aria-label="닫기"
          >
            <Icon name="close" className="text-xl text-wtext-3 dark:text-rink-300" />
          </button>
        </div>

        {/* 대상 정보 */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-wbg dark:bg-rink-800">
          <div className="w-9 h-9 rounded-full bg-wline dark:bg-rink-700 flex items-center justify-center shrink-0">
            <Icon name="person" className="text-lg text-wtext-3" />
          </div>
          <div>
            <p className="text-xs text-wtext-3 dark:text-rink-300">신고 대상</p>
            <p className="text-sm font-semibold text-wtext-1 dark:text-white">{targetName}</p>
          </div>
        </div>

        {/* 신고 사유 */}
        <div>
          <p className="text-[13px] font-bold text-wtext-3 dark:text-rink-300 mb-2">신고 사유 선택</p>
          <ul className="space-y-1">
            {REPORT_REASONS.map((r) => (
              <li key={r.value}>
                <button
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors motion-reduce:transition-none ${
                    reason === r.value
                      ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                      : 'bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 hover:bg-wbg dark:hover:bg-rink-700/50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    reason === r.value
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-wline dark:border-rink-700'
                  }`}>
                    {reason === r.value && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <span className={`text-sm font-medium ${
                    reason === r.value
                      ? 'text-ice-500 dark:text-blue-300'
                      : 'text-wtext-2 dark:text-rink-100'
                  }`}>
                    {r.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 추가 설명 (기타 선택 시 또는 선택적 입력) */}
        {reason && (
          <div>
            <p className="text-[13px] font-bold text-wtext-3 dark:text-rink-300 mb-2">
              추가 설명 <span className="font-normal text-wtext-3">(선택)</span>
            </p>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="구체적인 내용을 입력해 주세요"
              maxLength={300}
              rows={3}
              className="w-full px-4 py-3 text-sm rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white placeholder-wtext-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-wtext-3 text-right mt-1">{detail.length} / 300</p>
          </div>
        )}

        {/* 제출 버튼 */}
        <Button
          variant="primary"
          size="md"
          onClick={() => void handleSubmit()}
          disabled={!reason || isSubmitting}
          type="button"
          className="w-full"
        >
          {isSubmitting ? '접수 중...' : '신고 접수'}
        </Button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
