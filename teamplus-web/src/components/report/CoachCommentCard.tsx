'use client';

import { Icon } from '@/components/ui/Icon';

interface CoachCommentCardProps {
  content: string;
  date: string;
  onReply?: () => void;
}

export function CoachCommentCard({ content, date, onReply }: CoachCommentCardProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Icon name="format_quote" className="text-ice-500 text-[20px]" />
        <h3 className="font-bold text-wtext-1 dark:text-white text-sm">코치의 한마디</h3>
      </div>
      <div className="bg-white dark:bg-rink-800 rounded-xl p-5 shadow-sm border border-wline-2 dark:border-rink-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Icon name="edit_note" className="text-[64px]" />
        </div>
        <div className="relative z-10">
          <p className="text-wtext-2 dark:text-rink-100 leading-relaxed text-sm whitespace-pre-line">
            {content.split('엣지 컨트롤').map((part, i) =>
              i === 0 ? (
                part
              ) : (
                <span key={i}>
                  <span className="text-ice-500 font-semibold">엣지 컨트롤</span>
                  {part}
                </span>
              )
            )}
          </p>
          <div className="mt-4 pt-4 border-t border-wline-2 dark:border-rink-700 flex justify-between items-center">
            <span className="text-xs text-wtext-3">작성일: {date}</span>
            {onReply && (
              <button type="button"                 onClick={onReply}
                className="text-ice-500 text-xs font-semibold flex items-center gap-1 hover:underline"
              >
                답글 남기기 <Icon name="arrow_forward" className="text-[14px]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
