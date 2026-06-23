'use client';

import { Icon } from '@/components/ui/Icon';

interface TeamHeaderCardProps {
  name: string;
  code: string;
  description: string;
  memberCount: number;
  establishedYear: number;
}

export function TeamHeaderCard({ 
  name, 
  description, 
  memberCount, 
  establishedYear 
}: TeamHeaderCardProps) {
  return (
    <div className="bg-ice-500 rounded-xl p-4 text-white shadow-md">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center">
          <Icon name="sports_hockey" className="text-3xl" />
        </div>
        <div className="flex-1">
          <h2 className="text-card-section">{name}</h2>
          <p className="text-card-body text-white/80 mt-1">{description}</p>
          <div className="flex items-center gap-4 mt-2 text-card-body text-white/70">
            <span className="flex items-center gap-1">
              <Icon name="group" className="text-base" />
              {memberCount}명
            </span>
            <span className="flex items-center gap-1">
              <Icon name="calendar_today" className="text-base" />
              {establishedYear}년 창단
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
