import { Icon } from '@/components/ui/Icon';

// ─── 섹션 하단 종료 접힘 토글 (수업/대회 목록 공용) ─────
// 종료·취소 항목을 섹션 안 하단에 접어 보관 — 숨기지 않되(이력 접근) 기본 목록은 진행만 유지.
//   사용처: 감독/코치 classes-manage(정규훈련·대회) · 학부모 classes(등록 훈련·대회).
export function EndedCollapseToggle({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="w-full flex items-center gap-2 px-4 sm:px-5 py-3.5 text-left border-t border-it-line dark:border-it-ink-700 active:brightness-95 transition-colors motion-reduce:transition-none"
    >
      {/* 크기는 13px 고정 — 학부모 목록의 섹션 헤더(text-[13px])와 맞춘다.
          text-card-body(clamp 13~14px)를 쓰면 382px 이상 화면에서 헤더보다 커져 위계가 뒤집힌다. */}
      <span className="text-[13px] font-bold text-wtext-3 dark:text-wtext-4">
        {title}
      </span>
      {/* 종료 개수는 휴면 정보 — 섹션 헤더와 달리 중립 회색 카운트. */}
      <span className="text-[13px] font-extrabold text-wtext-3 dark:text-wtext-4 tabular-nums">
        {count}
      </span>
      <Icon
        name={expanded ? 'expand_less' : 'expand_more'}
        className="ml-auto text-xl text-wtext-3 dark:text-wtext-4"
        aria-hidden="true"
      />
    </button>
  );
}
