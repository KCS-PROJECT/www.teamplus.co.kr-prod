'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useNavigation } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { usePageReady } from '@/hooks/usePageReady';

/**
 * ReportPage - 사용자 신고
 * Route: /moderation/report?targetId=xxx&targetType=USER&targetName=홍길동
 *
 * API: POST /api/v1/users/me/reports
 */

const REPORT_REASONS = [
  { value: 'SPAM', label: '스팸 · 광고' },
  { value: 'HARASSMENT', label: '욕설 · 비방 · 괴롭힘' },
  { value: 'INAPPROPRIATE', label: '부적절한 콘텐츠' },
  { value: 'IMPERSONATION', label: '사칭' },
  // 저작권·상표·초상권 침해 (iOS 5.2 / AOS #9888072 — IP takedown 채널)
  { value: 'IP_INFRINGEMENT', label: '저작권 · 상표 · 초상권 침해' },
  { value: 'OTHER', label: '기타' },
] as const;

type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export default function ReportPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { back } = useNavigation();
  const { toast } = useToast();
  const params = useSearchParams();

  const targetId = params.get('targetId') ?? '';
  const targetType = (params.get('targetType') ?? 'USER') as 'USER' | 'POST' | 'COMMENT';
  const targetName = params.get('targetName') ?? '알 수 없음';

  const [reason, setReason] = useState<ReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!targetId) back();
  }, [targetId, back]);

  const handleSubmit = async () => {
    if (!reason) return;
    setIsSubmitting(true);
    const res = await api.post('/users/me/reports', {
      targetId,
      targetType,
      reason,
      detail: detail.trim() || undefined,
    });
    setIsSubmitting(false);
    if (res.success) {
      setIsDone(true);
    } else {
      const msg = (res.error as { message?: string })?.message;
      if (msg?.includes('24시간') || msg?.includes('already')) {
        toast.error(MESSAGES.moderation.alreadyReported);
      } else {
        toast.error(msg ?? '신고 접수에 실패했습니다.');
      }
    }
  };

  if (isDone) {
    return (
      <MobileContainer hasBottomNav={false}>
        <PageAppBar title="신고하기" showBack={false} />
        <main className="flex-1 flex flex-col items-center justify-center px-5 py-12 gap-5">
          <div className="w-20 h-20 rounded-w-pill bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <Icon name="check_circle" className="text-4xl text-emerald-500" />
          </div>
          <div className="text-center">
            <p className="text-w-title font-bold text-wtext-1 dark:text-white mb-2">신고가 접수되었습니다</p>
            <p className="text-w-small text-wtext-3 dark:text-rink-300 leading-relaxed">
              검토 후 서비스 정책에 따라 조치하겠습니다.
              <br />
              소중한 의견 감사합니다.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => back()}
            type="button"
            className="w-full max-w-xs"
          >
            확인
          </Button>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="신고하기" />

      <main className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
        {/* 대상 정보 */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-wbg dark:bg-rink-800 border border-wline-2 dark:border-rink-700">
          <div className="w-10 h-10 rounded-w-pill bg-wline dark:bg-rink-700 flex items-center justify-center shrink-0">
            <Icon name="person" className="text-xl text-wtext-3" />
          </div>
          <div>
            <p className="text-w-caption text-wtext-3 mb-0.5">신고 대상</p>
            <p className="text-w-small font-bold text-wtext-1 dark:text-white">{targetName}</p>
          </div>
        </div>

        {/* 안내 */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
          <Icon name="info" className="text-amber-500 text-w-body-lg mt-0.5 shrink-0" />
          <p className="text-w-caption text-amber-700 dark:text-amber-300 leading-relaxed">
            허위 신고는 서비스 이용이 제한될 수 있습니다. 24시간 내 동일 대상 중복 신고는 불가합니다.
          </p>
        </div>

        {/* 신고 사유 */}
        <section>
          <h2 className="text-w-small font-bold text-wtext-3 dark:text-rink-300 tracking-wider uppercase mb-3">
            신고 사유
          </h2>
          <ul className="space-y-2">
            {REPORT_REASONS.map((r) => (
              <li key={r.value}>
                <button
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors motion-reduce:transition-none ${
                    reason === r.value
                      ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                      : 'bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 hover:bg-wbg dark:hover:bg-rink-700/50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-w-pill border-2 flex items-center justify-center shrink-0 transition-colors motion-reduce:transition-none ${
                    reason === r.value
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-wline dark:border-rink-700'
                  }`}>
                    {reason === r.value && (
                      <div className="w-2 h-2 rounded-w-pill bg-white" />
                    )}
                  </div>
                  <span className={`text-w-small font-medium ${
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
        </section>

        {/* 추가 설명 */}
        {reason && (
          <section>
            <h2 className="text-w-small font-bold text-wtext-3 dark:text-rink-300 tracking-wider uppercase mb-3">
              추가 설명 <span className="normal-case font-normal">(선택)</span>
            </h2>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={MESSAGES.placeholders.enterReportContent}
              maxLength={300}
              rows={4}
              className="w-full px-4 py-3 text-w-small rounded-xl border border-wline dark:border-rink-700 bg-white dark:bg-rink-800 text-wtext-1 dark:text-white placeholder-wtext-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-w-caption text-wtext-3 text-right mt-1">{detail.length} / 300</p>
          </section>
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
          {isSubmitting ? '접수 중...' : '신고 접수하기'}
        </Button>
      </main>
    </MobileContainer>
  );
}
