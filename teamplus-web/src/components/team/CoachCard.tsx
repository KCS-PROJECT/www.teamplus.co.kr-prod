'use client';

import { Icon } from '@/components/ui/Icon';

interface CoachCardProps {
  name: string;
  role: string;
  career: string;
  onCall?: () => void;
  onChat?: () => void;
}

export function CoachCard({ name, role, career, onCall, onChat }: CoachCardProps) {
  return (
    <div className="bg-white dark:bg-rink-800 rounded-xl p-4 border border-wline dark:border-rink-700 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-wline-2 dark:bg-rink-700 rounded-full flex items-center justify-center flex-shrink-0">
          <Icon name="person" className="text-2xl text-wtext-3 dark:text-rink-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-wtext-1 dark:text-white">{name}</h4>
            <span className="px-2 py-0.5 bg-ice-500/10 text-ice-500 text-[10px] font-bold rounded-full">
              {role}
            </span>
          </div>
          <p className="text-xs text-wtext-3 dark:text-rink-300 mt-1 line-clamp-1">
            {career}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button type="button"               onClick={onCall}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-wbg dark:bg-rink-700 rounded-lg text-xs font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-500 transition-colors"
            >
              <Icon name="call" className="text-base" />
              연락하기
            </button>
            <button type="button"               onClick={onChat}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-wbg dark:bg-rink-700 rounded-lg text-xs font-semibold text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-500 transition-colors"
            >
              <Icon name="chat" className="text-base" />
              메시지
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
