import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';

// ─── 종료 목록 단계 표시 (수업/대회 목록 공용) ─────
// 종료분은 시즌마다 쌓여 끝이 없으므로 처음 ENDED_PAGE_SIZE 건만 그리고,
//   나머지는 '더보기'로 이어 붙인다. 응답 자체는 전체가 내려오므로 화면 부담만 줄이는 장치다.
//   사용처: 감독/코치 classes-manage 종료 탭 · 학부모 classes/ended.
export const ENDED_PAGE_SIZE = 20;

export function EndedLoadMoreRow({
  remaining,
  onClick,
}: {
  /** 아직 그리지 않은 건수 — 0 이하면 아무것도 그리지 않는다. */
  remaining: number;
  onClick: () => void;
}) {
  if (remaining <= 0) return null;
  return (
    <div className="px-4 sm:px-5 pt-3 pb-4">
      {/* 공지 목록의 더보기 버튼과 같은 모양 — 목록 행 폭 안에서 hairline 테두리 버튼. */}
      <button
        type="button"
        onClick={onClick}
        className="inline-flex w-full items-center justify-center gap-2 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 py-3.5 text-[13px] font-bold text-it-ink-600 dark:text-wtext-4 hover:bg-it-fill dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
      >
        <Icon name="expand_more" className="text-base" aria-hidden="true" />
        <span>{MESSAGES.class.endedLoadMore(remaining)}</span>
      </button>
    </div>
  );
}
