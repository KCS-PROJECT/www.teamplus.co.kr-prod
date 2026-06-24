'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface CoachCommentCardProps {
  content: string;
  date: string;
  onReply?: () => void;
  /** ICETIMES flat 스타일 적용. 기본 false = 기존 카드 외형 그대로 (미전달 화면 영향 0). */
  iceTheme?: boolean;
}

export function CoachCommentCard({ content, date, onReply, iceTheme = false }: CoachCommentCardProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Icon
          name="format_quote"
          className={cn('text-[20px]', iceTheme ? 'text-it-blue-500' : 'text-ice-500')}
        />
        <h3
          className={cn(
            iceTheme
              ? 'text-[15px] font-extrabold text-it-ink-900 dark:text-white'
              : 'text-sm font-bold text-wtext-1 dark:text-white',
          )}
        >
          코치의 한마디
        </h3>
      </div>
      <div
        className={cn(
          'rounded-xl p-5 relative overflow-hidden',
          iceTheme
            ? // ICETIMES flat: hairline + 그림자 제거.
              'bg-it-surface dark:bg-it-ink-900 border border-it-line dark:border-it-ink-700'
            : 'bg-white dark:bg-rink-800 shadow-sm border border-wline-2 dark:border-rink-700',
        )}
      >
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Icon name="edit_note" className="text-[64px]" />
        </div>
        <div className="relative z-10">
          <p
            className={cn(
              'leading-relaxed text-sm whitespace-pre-line',
              iceTheme ? 'text-it-ink-700 dark:text-it-ink-100' : 'text-wtext-2 dark:text-rink-100',
            )}
          >
            {content.split('엣지 컨트롤').map((part, i) =>
              i === 0 ? (
                part
              ) : (
                <span key={i}>
                  <span
                    className={cn(
                      'font-semibold',
                      iceTheme ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-ice-500',
                    )}
                  >
                    엣지 컨트롤
                  </span>
                  {part}
                </span>
              )
            )}
          </p>
          <div
            className={cn(
              'mt-4 pt-4 border-t flex justify-between items-center',
              iceTheme ? 'border-it-line dark:border-it-ink-700' : 'border-wline-2 dark:border-rink-700',
            )}
          >
            <span className={cn('text-xs', iceTheme ? 'text-it-ink-400 dark:text-it-ink-500' : 'text-wtext-3')}>
              작성일: {date}
            </span>
            {onReply && (
              <button
                type="button"
                onClick={onReply}
                className={cn(
                  'text-xs font-semibold flex items-center gap-1 hover:underline',
                  iceTheme ? 'text-it-blue-500 dark:text-it-blue-300' : 'text-ice-500',
                )}
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
