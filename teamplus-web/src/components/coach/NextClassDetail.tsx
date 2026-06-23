'use client';

import { memo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';
import { resolveImageSrc } from '@/lib/image-url';

export interface StudentInfo {
  name: string;
  avatar?: string;
  initials?: string;
  initialsBg?: string;
  badgeIcon: string;
  badgeColor: string;
}

export interface NextClassDetailProps {
  time: string;
  title: string;
  students: StudentInfo[];
  totalStudents: number;
  onWriteLog?: () => void;
  onRequestEquipment?: () => void;
  classLogHref?: string;
  equipmentHref?: string;
}

/**
 * NextClassDetail - 코치 대시보드 다음 수업 상세 카드
 *
 * 디자인 시안 v3: 좌측 파랑 보더 + 시간 배지 + 수업명
 * + 참석 학생 명단(2x2 그리드) + 수업일지/교구 버튼
 * border 기반 카드 (shadow 없음), dark mode 전면 적용
 */
export const NextClassDetail = memo(function NextClassDetail({
  time,
  title,
  students,
  totalStudents,
  classLogHref = '/coach-schedules',
  equipmentHref = '/inventory',
}: NextClassDetailProps) {
  const displayStudents = students.slice(0, 3);
  const remainingCount = totalStudents - displayStudents.length;

  return (
    <div className="rounded-xl bg-white dark:bg-rink-800 border border-gray-200 dark:border-rink-700 p-6 relative overflow-hidden">
      {/* 시간 배지 + 수업명 */}
      <div className="mb-6">
        <span className="inline-block text-[11px] font-black text-ice-500 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md uppercase">
          {time}
        </span>
        <h4 className="text-xl font-black text-wtext-1 dark:text-white mt-2">{title}</h4>
      </div>

      {/* 참석 학생 명단 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-black text-gray-500 dark:text-rink-300 uppercase tracking-widest">
            {MESSAGES.coach.studentList}
          </p>
          {totalStudents > 0 && (
            <span className="text-[11px] font-black text-wtext-2 dark:text-rink-100">
              {totalStudents}명
            </span>
          )}
        </div>
        {displayStudents.length === 0 && remainingCount > 0 ? (
          <NavLink
            href={classLogHref}
            className="flex items-center justify-center gap-2 w-full p-4 rounded-lg border border-dashed border-gray-300 dark:border-rink-700 hover:bg-gray-50 dark:hover:bg-rink-700/50 transition-colors"
          >
            <Icon
              name="groups"
              className="text-base text-gray-500 dark:text-rink-300"
              aria-hidden="true"
            />
            <span className="text-xs font-black text-gray-500 dark:text-rink-300">
              참석 학생 {totalStudents}명 확인하기
            </span>
          </NavLink>
        ) : displayStudents.length === 0 ? (
          <div className="flex items-center justify-center w-full p-4 rounded-lg bg-gray-50 dark:bg-rink-700/30 border border-gray-200 dark:border-rink-700">
            <span className="text-xs font-bold text-gray-500 dark:text-rink-300">
              참석 학생 정보가 없습니다
            </span>
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-3">
          {displayStudents.map((student, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-rink-700/50 border border-gray-200 dark:border-rink-700"
            >
              {/* 프로필 아바타 */}
              {resolveImageSrc(student.avatar) ? (
                <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-rink-500 overflow-hidden border border-gray-200 dark:border-rink-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveImageSrc(student.avatar)}
                    alt={student.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center border ${
                    student.initialsBg || 'bg-blue-200 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700'
                  }`}
                >
                  <span className="text-[10px] font-black text-blue-800 dark:text-blue-300">
                    {student.initials || student.name.charAt(0)}
                  </span>
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-black text-wtext-1 dark:text-white truncate">
                  {student.name}
                </span>
                <Icon
                  name={student.badgeIcon}
                  className={`text-sm ${student.badgeColor}`}
                  filled
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}

          {/* 더보기 버튼 */}
          {remainingCount > 0 && (
            <NavLink
              href={classLogHref}
              className="flex items-center justify-center p-2.5 rounded-lg border border-dashed border-gray-300 dark:border-rink-700 hover:bg-gray-50 dark:hover:bg-rink-700/50 transition-colors"
            >
              <span className="text-[11px] font-black text-gray-500 dark:text-rink-300">
                {MESSAGES.coach.moreStudents(remainingCount)}
              </span>
            </NavLink>
          )}
        </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-3">
        <NavLink
          href={classLogHref}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-ice-500 hover:bg-ice-700 py-4 text-white text-sm font-black transition-colors active:brightness-95"
        >
          <Icon name="history_edu" className="text-xl text-white" aria-hidden="true" />
          <span>{MESSAGES.coach.writeLog}</span>
        </NavLink>
        <NavLink
          href={equipmentHref}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-rink-700 bg-white dark:bg-rink-800 hover:bg-gray-50 dark:hover:bg-rink-700 py-4 text-wtext-1 dark:text-white text-sm font-black transition-colors active:brightness-95"
        >
          <Icon name="inventory" className="text-xl" aria-hidden="true" />
          <span>{MESSAGES.coach.requestEquipment}</span>
        </NavLink>
      </div>
    </div>
  );
});
