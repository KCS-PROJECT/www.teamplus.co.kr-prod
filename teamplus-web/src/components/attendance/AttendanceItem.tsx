'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export type AttendanceStatus = '출석' | '지각' | '결석' | '미출석' | '조퇴';

export interface AttendanceItemProps {
  id: string;
  name: string;
  className: string;
  status: AttendanceStatus;
  onStatusChange?: (id: string, newStatus: AttendanceStatus) => void;
}

// Button variant 타입에 맞게 매핑 (warning은 outline으로 대체)
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';

export function AttendanceItem({ id, name, className, status, onStatusChange }: AttendanceItemProps) {
  const getStatusVariant = (status: AttendanceStatus): ButtonVariant => {
    switch (status) {
      case '출석': return 'primary';
      case '지각': return 'outline'; // warning 대신 outline 사용
      case '결석': return 'danger';
      case '미출석': return 'secondary';
      case '조퇴': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow motion-reduce:transition-none">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-bold text-wtext-1 dark:text-white">{name}</p>
          <p className="text-xs text-wtext-3 dark:text-rink-300 font-medium">{className}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* In a real app, this might be a dropdown or a set of buttons to change status */}
          <Button
            variant={getStatusVariant(status)}
            size="sm"
            className="min-w-[60px] font-bold"
            onClick={() => onStatusChange?.(id, status)}
          >
            {status}
          </Button>
        </div>
      </div>
    </Card>
  );
}
