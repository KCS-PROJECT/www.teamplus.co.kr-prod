'use client';

import { useState, useRef, useCallback, ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

interface SwipeableItemProps {
  children: ReactNode;
  /** 삭제 콜백 */
  onDelete?: () => void;
  /** 읽음 처리 콜백 */
  onMarkRead?: () => void;
  /** 비활성화 */
  disabled?: boolean;
  /** 이미 읽음 상태 */
  isRead?: boolean;
  /** 클래스 */
  className?: string;
}

const SWIPE_THRESHOLD = 80;
const MAX_SWIPE = 100;

export function SwipeableItem({
  children,
  onDelete,
  onMarkRead,
  disabled = false,
  isRead = false,
  className,
}: SwipeableItemProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  const handleStart = useCallback((clientX: number) => {
    if (disabled) return;
    setIsDragging(true);
    startXRef.current = clientX;
    currentXRef.current = translateX;
  }, [disabled, translateX]);

  const handleMove = useCallback((clientX: number) => {
    if (!isDragging || disabled) return;

    const diff = clientX - startXRef.current;
    let newTranslateX = currentXRef.current + diff;

    // 왼쪽으로 스와이프 (삭제) - 음수
    // 오른쪽으로 스와이프 (읽음) - 양수
    newTranslateX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, newTranslateX));

    setTranslateX(newTranslateX);
  }, [isDragging, disabled]);

  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    // 삭제 액션 (왼쪽으로 스와이프)
    if (translateX < -SWIPE_THRESHOLD && onDelete) {
      onDelete();
      setTranslateX(0);
      return;
    }

    // 읽음 액션 (오른쪽으로 스와이프)
    if (translateX > SWIPE_THRESHOLD && onMarkRead && !isRead) {
      onMarkRead();
      setTranslateX(0);
      return;
    }

    // 임계값 미만이면 원위치
    setTranslateX(0);
  }, [isDragging, translateX, onDelete, onMarkRead, isRead]);

  // 터치 이벤트
  const handleTouchStart = (e: React.TouchEvent) => handleStart(e.touches[0].clientX);
  const handleTouchMove = (e: React.TouchEvent) => handleMove(e.touches[0].clientX);
  const handleTouchEnd = () => handleEnd();

  // 마우스 이벤트
  const handleMouseDown = (e: React.MouseEvent) => handleStart(e.clientX);
  const handleMouseMove = (e: React.MouseEvent) => handleMove(e.clientX);
  const handleMouseUp = () => handleEnd();
  const handleMouseLeave = () => {
    if (isDragging) handleEnd();
  };

  const showDelete = translateX < -20;
  const showRead = translateX > 20 && !isRead;

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      {/* 왼쪽 액션 - 읽음 처리 (파란색) */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 flex items-center justify-start pl-6 bg-blue-500 transition-opacity',
          showRead ? 'opacity-100' : 'opacity-0'
        )}
        style={{ width: MAX_SWIPE }}
      >
        <div className="flex flex-col items-center text-white">
          <Icon name="mark_email_read" className="text-2xl" />
          <span className="text-xs font-bold mt-1">읽음</span>
        </div>
      </div>

      {/* 오른쪽 액션 - 삭제 (빨간색) */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex items-center justify-end pr-6 bg-red-500 transition-opacity',
          showDelete ? 'opacity-100' : 'opacity-0'
        )}
        style={{ width: MAX_SWIPE }}
      >
        <div className="flex flex-col items-center text-white">
          <Icon name="delete" className="text-2xl" />
          <span className="text-xs font-bold mt-1">삭제</span>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div
        className={cn(
          'relative bg-white dark:bg-rink-800 touch-pan-y',
          isDragging ? '' : 'transition-transform duration-200 ease-out'
        )}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
    </div>
  );
}
