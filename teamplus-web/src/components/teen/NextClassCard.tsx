'use client';

import { NavLink } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';

interface NextClassInfo {
  title: string;
  coach?: string;
  date?: string;
  location?: string;
}

interface NextClassCardProps {
  /** 다음 수업 정보 (null이면 '예정된 수업 없음' 표시) */
  nextClass: NextClassInfo | null;
  /** QR 출석 버튼 경로 (기본: '/qr-scan') */
  qrHref?: string;
  /** QR 버튼 표시 여부 (기본: true) */
  showQrButton?: boolean;
  className?: string;
}

/**
 * 다음 수업 정보 카드
 * 수업명, 시간, 코치명을 표시하고 QR 출석 버튼을 포함
 */
export function NextClassCard({
  nextClass,
  qrHref = '/qr-scan',
  showQrButton = true,
  className = '',
}: NextClassCardProps) {
  return (
    <div
      className={`bg-white dark:bg-rink-800 rounded-xl p-5 shadow-sm border border-wline-2 dark:border-rink-700 ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
          <Icon
            name="sports_hockey"
            className="text-ice-500 text-2xl"
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-wtext-3 dark:text-rink-300 font-medium mb-1">
            다음 수업
          </p>
          <h3 className="text-lg font-bold text-wtext-1 dark:text-white mb-2">
            {nextClass?.title ?? '예정된 수업 없음'}
          </h3>
          {nextClass && (
            <div className="flex flex-col gap-1 text-sm text-wtext-2 dark:text-rink-100">
              {nextClass.date && (
                <div className="flex items-center gap-2">
                  <Icon
                    name="schedule"
                    className="text-[16px] text-wtext-3"
                    aria-hidden="true"
                  />
                  <span>{nextClass.date}</span>
                </div>
              )}
              {nextClass.coach && (
                <div className="flex items-center gap-2">
                  <Icon
                    name="person"
                    className="text-[16px] text-wtext-3"
                    aria-hidden="true"
                  />
                  <span>{nextClass.coach}</span>
                </div>
              )}
              {nextClass.location && (
                <div className="flex items-center gap-2">
                  <Icon
                    name="location_on"
                    className="text-[16px] text-wtext-3"
                    aria-hidden="true"
                  />
                  <span>{nextClass.location}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showQrButton && (
        <NavLink
          href={qrHref}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-ice-500 hover:bg-ice-700 text-white font-bold text-base rounded-xl transition-colors active:brightness-95"
        >
          <Icon
            name="qr_code_scanner"
            className="text-xl"
            aria-hidden="true"
          />
          <span>QR 출석체크</span>
        </NavLink>
      )}
    </div>
  );
}
