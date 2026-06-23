'use client';

import { MESSAGES } from '@/lib/messages';

interface EventCardProps {
  id: string;
  title: string;
  description?: string;
  date: string;
  imageUrl?: string;
  status: 'active' | 'member_only' | 'ended';
  onClick?: () => void;
  imagePosition?: 'left' | 'right';
}

interface EventStatusConfigItem {
  dotColor: string;
  textColor: string;
  label: string;
}

const STATUS_CONFIG: Record<'active' | 'member_only' | 'ended', EventStatusConfigItem> = {
  active: {
    dotColor: 'bg-green-500',
    textColor: 'text-green-600 dark:text-green-400',
    label: MESSAGES.notice.eventStatus.active,
  },
  member_only: {
    dotColor: 'bg-ice-500',
    textColor: 'text-ice-500 dark:text-blue-400',
    label: MESSAGES.notice.eventStatus.member_only,
  },
  ended: {
    dotColor: 'bg-gray-400',
    textColor: 'text-gray-500 dark:text-gray-400',
    label: MESSAGES.notice.eventStatus.ended,
  },
};

const STATUS_FALLBACK: EventStatusConfigItem = {
  dotColor: 'bg-wtext-4',
  textColor: 'text-wtext-3 dark:text-rink-300',
  label: '미정',
};

export default function EventCard({
  id,
  title,
  description,
  date,
  imageUrl,
  status,
  onClick,
  imagePosition = 'right',
}: EventCardProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_FALLBACK;
  const isReversed = imagePosition === 'left';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white dark:bg-rink-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow motion-reduce:transition-none active:scale-[0.99] duration-150 ${
        status === 'ended' ? 'opacity-70' : ''
      }`}
      role="article"
      aria-label={`${config.label}: ${title}`}
    >
      <div className={`flex ${isReversed ? 'flex-row-reverse' : ''}`}>
        <div className="flex-1 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
              <span className={`text-xs font-medium ${config.textColor}`}>
                {config.label}
              </span>
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white leading-snug mb-2">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {description}
              </p>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">{date}</p>
        </div>

        {imageUrl && (
          <div className="w-32 h-auto bg-gray-100 dark:bg-gray-700 relative flex-shrink-0">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${imageUrl}')` }}
              role="img"
              aria-label={title}
            />
          </div>
        )}

        {!imageUrl && (
          <div className="w-32 h-auto bg-gray-100 dark:bg-gray-700 relative flex-shrink-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-500">
              image
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
