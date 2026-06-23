'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export interface ClassManageItemProps {
  id: string;
  title: string;
  coach: string;
  schedule: string;
  status: string;
  onViewDetail?: (id: string) => void;
  onEdit?: (id: string) => void;
}

export function ClassManageItem({ 
  id, 
  title, 
  coach, 
  schedule, 
  status,
  onViewDetail,
  onEdit
}: ClassManageItemProps) {
  return (
    <Card hover className="p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5 flex-1 min-w-0 pr-2">
          <h2 className="text-base font-bold text-wtext-1 dark:text-white truncate">
            {title}
          </h2>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-1.5 font-medium">
              <Icon name="person" className="text-[14px]" />
              {coach}
            </p>
            <p className="text-xs text-wtext-3 dark:text-rink-300 flex items-center gap-1.5 font-medium">
              <Icon name="schedule" className="text-[14px]" />
              {schedule}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-card-meta font-bold text-ice-500 bg-ice-500/10 px-2.5 py-1 rounded-full border border-ice-500/10">
          {status}
        </span>
      </div>
      
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-wline-2 dark:border-rink-700/50 pt-4">
        <Button 
          variant="secondary" 
          size="sm" 
          className="rounded-lg h-9"
          onClick={() => onViewDetail?.(id)}
        >
          상세보기
        </Button>
        <Button 
          size="sm" 
          className="rounded-lg h-9 px-4"
          onClick={() => onEdit?.(id)}
        >
          편집
        </Button>
      </div>
    </Card>
  );
}
