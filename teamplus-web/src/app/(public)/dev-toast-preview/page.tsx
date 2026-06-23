'use client';

/**
 * Toast Preview (DEV ONLY) — e2e 검증 인프라.
 * - 참고 디자인 P5~P8 4종 + error 호환 variant 를 수동으로 트리거.
 * - production 빌드에서는 라우트 노출 차단 (NODE_ENV gate).
 * - 라우트: /dev-toast-preview (인증 불필요, (public) 그룹).
 */
import { useToast } from '@/components/ui/Toast';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { usePageReady } from '@/hooks/usePageReady';

export default function DevToastPreviewPage() {
  const { toast } = useToast();
  // v18 (2026-05-20): 정적 dev preview — fetch 없음, 마운트 즉시 ready 신호.
  usePageReady(true);

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const baseBtn =
    'min-h-[44px] rounded-w-lg px-4 py-2.5 text-[14px] font-bold bg-ice-500 text-white hover:bg-ice-700 active:brightness-95 transition-colors motion-reduce:transition-none';

  return (
    <MobileContainer>
      <div className="p-6 flex flex-col gap-3" data-testid="dev-toast-preview">
        <h1 className="text-w-h2 text-wtext-1 font-bold">Toast Preview · DEV ONLY</h1>
        <p className="text-w-small text-wtext-3">
          참고 디자인 P5~P8 4종 + error 5종을 트리거하여 e2e 검증에 사용합니다.
        </p>

        <button
          type="button"
          data-testid="trigger-route"
          className={baseBtn}
          onClick={() =>
            toast.route('아이스링크월드 송파점으로 이동 중', {
              description: '예상 도착 8분 · 지호 수업 시작까지 22분',
              actionLabel: '경로 보기',
              onAction: () => {},
            })
          }
        >
          P5 · 경로 (route)
        </button>

        <button
          type="button"
          data-testid="trigger-info"
          className={baseBtn}
          onClick={() =>
            toast.info('다음 수업은 내일 오후 4시예요', {
              description: '목동 빙상장 · 코치 김유나 · 출석 확인을 잊지 마세요.',
              actionLabel: '확인',
              onAction: () => {},
            })
          }
        >
          P6 · 확인 (info)
        </button>

        <button
          type="button"
          data-testid="trigger-success"
          className={baseBtn}
          onClick={() =>
            toast.success('결제가 정상 처리되었어요', {
              description: '주니어 입문반 · 280,000원 · 신한카드 0123',
            })
          }
        >
          P7 · 정상 (success)
        </button>

        <button
          type="button"
          data-testid="trigger-warning"
          className={baseBtn}
          onClick={() =>
            toast.warning('이번 주 출석률이 60% 이하예요', {
              description: '2회 결석 시 진도 일정이 한 주 밀릴 수 있어요.',
              actionLabel: '자세히',
              onAction: () => {},
            })
          }
        >
          P8 · 주의 (warning)
        </button>

        <button
          type="button"
          data-testid="trigger-error"
          className={baseBtn}
          onClick={() =>
            toast.error('네트워크 연결을 확인해주세요', {
              description: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
            })
          }
        >
          ERROR (호환)
        </button>
      </div>
    </MobileContainer>
  );
}
