'use client';

import { useState, useCallback, useEffect } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNavigation } from '@/components/ui/NavLink';
import { ChildBigButton } from '@/components/child/ChildBigButton';
import { Icon } from '@/components/ui/Icon';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { MESSAGES } from '@/lib/messages';
import { apiRequest } from '@/services/api-client';

type CheckinState = 'idle' | 'loading' | 'success' | 'error' | 'expired';

// QR code display placeholder (actual QR would come from API)
// WCAG AAA: 7:1 대비, 큰 피드백, 명확한 경계선
function QRCodeDisplay({ qrData, isLoading }: { qrData: string | null; isLoading: boolean }) {
  if (isLoading) {
    return null;
  }

  if (!qrData) {
    return (
      <div
        className="w-full aspect-square max-w-[280px] mx-auto bg-wline-2 dark:bg-rink-700 rounded-3xl border-2 border-wline dark:border-rink-700 flex flex-col items-center justify-center gap-4 p-6"
        role="img"
        aria-label="\uC624\uB298\uC740 \uC218\uC5C5\uC774 \uC5C6\uC5B4\uC694"
      >
        <Icon name="event_busy" className="text-8xl text-wtext-2 dark:text-white" aria-hidden="true" />
        <p className="text-xl font-bold text-wtext-1 dark:text-white text-center">
          {'\uC624\uB298\uC740 \uC218\uC5C5\uC774 \uC5C6\uC5B4\uC694'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-full aspect-square max-w-[280px] mx-auto bg-white dark:bg-rink-800 rounded-3xl border-[5px] border-ice-500 p-4 flex items-center justify-center shadow-lg"
      role="img"
      aria-label="\uCD9C\uC11D QR \uCF54\uB4DC"
    >
      {/* QR code would render here - using placeholder icon */}
      <div className="w-full h-full bg-wbg dark:bg-rink-900 rounded-2xl flex items-center justify-center">
        <Icon name="qr_code_2" className="text-[140px] text-wtext-1 dark:text-white" aria-hidden="true" />
      </div>
    </div>
  );
}

// Success animation — WCAG AAA: 7:1 대비, motion-reduce 지원, 큰 시각 피드백
// v17 anti-flicker: useEffect setTimeout opacity 토글 → CSS animate-modal-card-in 으로 변경
//   (SPEC §2.3 — mount 시 자동 발화, JS 토글 제거로 깜박임 차단)
function SuccessView() {
  return (
    <div
      className="flex flex-col items-center gap-6 animate-modal-card-in motion-reduce:animate-none"
      role="status"
      aria-live="polite"
    >
      <div className="w-36 h-36 rounded-w-pill bg-green-600 flex items-center justify-center shadow-lg">
        <Icon name="check_circle" filled className="text-[112px] text-white" aria-hidden="true" />
      </div>
      <h2 className="text-4xl font-black text-wtext-1 dark:text-white text-center tracking-tight">
        {'\uCD9C\uC11D \uC644\uB8CC!'} {'\u{1F389}'}
      </h2>
      <p className="text-xl font-bold text-wtext-2 dark:text-white text-center">
        {MESSAGES.attendance.checked}
      </p>
    </div>
  );
}

export default function ChildQRCheckinPage() {
  const { navigate } = useNavigation();
  const [checkinState, setCheckinState] = useState<CheckinState>('idle');
  const [qrData, setQrData] = useState<string | null>(null);
  const [isQrLoading, setIsQrLoading] = useState(true);

  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: 'QR \uCD9C\uC11D',
    showBottomNav: true,
    showBackButton: true,
  });
  usePageReady(!isQrLoading);

  // Fetch QR data on mount
  useEffect(() => {
    let isMounted = true;
    const fetchQR = async () => {
      setIsQrLoading(true);
      try {
        const res = await apiRequest<{ qrCode: string; expiresAt: string }>({
          method: 'GET',
          url: '/attendance/my-qr',
          retry: false,
        });
        if (isMounted && res.success && res.data) {
          setQrData(res.data.qrCode);
        }
      } catch {
        // QR not available - show empty state
      } finally {
        if (isMounted) setIsQrLoading(false);
      }
    };
    void fetchQR();
    return () => { isMounted = false; };
  }, []);

  const handleCheckin = useCallback(async () => {
    if (!qrData) return;
    setCheckinState('loading');
    try {
      const res = await apiRequest({
        method: 'POST',
        url: '/attendance/check-in',
        data: { qrCode: qrData },
      });
      if (res.success) {
        setCheckinState('success');
      } else {
        setCheckinState('error');
      }
    } catch {
      setCheckinState('error');
    }
  }, [qrData]);

  const handleRetry = useCallback(() => {
    setCheckinState('idle');
  }, []);

  return (
    <MobileContainer hasBottomNav>
      {/* Header \u2014 WCAG AAA: toneVariant='kid' \uAC00 64px \uB192\uC774 + size-12 \uB4A4\uB85C\uAC00\uAE30 \uC790\uB3D9 \uC801\uC6A9.
          [appbar-harness-v4 \u00A73 \uBD84\uB958 B] showMenu={false} \uC815\uB2F9\uD654: QR \uC2A4\uCE90\uB108\uB294 \uCE74\uBA54\uB77C \uD3EC\uCEE4\uC2A4 \uBAA8\uB4DC\uB85C
          \uD584\uBC84\uAC70 \uBA54\uB274\uAC00 \uC791\uB3D9 \uC2DC \uC778\uD130\uB7FD\uD2B8 \uB418\uBA70, CHILD \uC0AC\uC6A9\uC790\uAC00 \uC758\uB3C4\uCE58 \uC54A\uAC8C \uBA54\uB274\uB97C \uB204\uB97C \uACBD\uC6B0
          \uC2A4\uCE94\uC774 \uC911\uB2E8\uB428. \uCD9C\uC11D \uCCB4\uD06C\uC778 \uC644\uB8CC\uAE4C\uC9C0 \uBA54\uB274 \uBE44\uD65C\uC131 \uC720\uC9C0\uAC00 SPEC 5\uC808 \uD569\uC758. */}
      <PageAppBar
        title="QR \uCD9C\uC11D"
        onBack={() => navigate('/dashboard')}
        showMenu={false}
        toneVariant="kid"
        titleClassName="text-[22px] font-extrabold"
      />

      {/* Main Content */}
      <main
        className="flex-1 px-5 pt-6 pb-30 flex flex-col items-center justify-center gap-6 overflow-y-auto hide-scrollbar"
        role="main"
        aria-label="QR 출석 체크 화면"
      >
        {checkinState === 'success' ? (
          <SuccessView />
        ) : (
          <>
            {/* Title — WCAG AAA 대비율 7:1 확보 */}
            <div
              className="text-center"
              role="status"
              aria-live="polite"
            >
              <h1 className="text-3xl font-black text-wtext-1 dark:text-white mb-3 tracking-tight">
                {checkinState === 'error'
                  ? '\uC5B4? \uC7A0\uC2DC\uB9CC\uC694!'
                  : 'QR\uC744 \uBCF4\uC5EC\uC904\uB798\uC694?'}
              </h1>
              <p className="text-xl font-bold text-wtext-2 dark:text-white">
                {checkinState === 'error'
                  ? '\uB2E4\uC2DC \uD55C \uBC88 \uD574\uBCFC\uAE4C\uC694?'
                  : '\uCF54\uCE58 \uC120\uC0DD\uB2D8\uC5D0\uAC8C QR\uC744 \uBCF4\uC5EC\uC8FC\uC138\uC694.'}
              </p>
            </div>

            {/* QR Code Display (70% of screen width) */}
            <div className="w-[70vw] max-w-[320px]">
              <QRCodeDisplay qrData={qrData} isLoading={isQrLoading} />
            </div>

            {/* Action Button — WCAG AAA: 80px 이상, text-2xl, motion-reduce */}
            <div className="w-full max-w-[320px]">
              {checkinState === 'error' ? (
                <ChildBigButton variant="outline" icon="refresh" onClick={handleRetry}>
                  {'\uB2E4\uC2DC \uC2DC\uB3C4\uD560\uAC8C\uC694'}
                </ChildBigButton>
              ) : (
                <ChildBigButton
                  icon="qr_code_scanner"
                  onClick={handleCheckin}
                  disabled={!qrData || checkinState === 'loading'}
                >
                  {checkinState === 'loading' ? MESSAGES.common.processing : '\uCD9C\uC11D \uB3C4\uC7A5 \uCC0D\uAE30!'}
                </ChildBigButton>
              )}
            </div>
          </>
        )}
      </main>
    </MobileContainer>
  );
}
