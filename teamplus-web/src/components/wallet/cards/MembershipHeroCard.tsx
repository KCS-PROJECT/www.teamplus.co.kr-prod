"use client";

import { ReactNode } from "react";

/**
 * MembershipHeroCard — B2 탭 hero (등급 배지 + 사용자 정보 + 통계)
 */
export interface MembershipHeroCardProps {
  /** 등급 배지 (GOLD/SILVER/BRONZE 등) */
  grade: string;
  /** 등급 배지 배경색 (기본 flame-500) */
  gradeColor?: string;
  /** 팀명 / 부제 */
  clubName?: string;
  /** 사용자 이름 */
  userName: string;
  /** 회원 코드 + 가입일 — "TEAMPLUS-3054 · 2024.03 가입" */
  memberInfo?: string;
  /** 하단 3 통계 */
  stats?: { label: string; value: string }[];
  /** 우측 상단 데코 SVG (기본 아이스링크 라인 일러스트) */
  decoration?: ReactNode;
}

export function MembershipHeroCard({
  grade,
  gradeColor = "var(--c-flame-500)",
  clubName,
  userName,
  memberInfo,
  stats = [],
  decoration,
}: MembershipHeroCardProps) {
  return (
    <div className="px-3 sm:px-5 pt-4">
      <div className="relative overflow-hidden text-white rounded-[18px] bg-rink-800 dark:bg-puck p-5 sm:p-[22px]">
        {/* 데코 — 기본 또는 커스텀 */}
        {decoration ?? <DefaultDeco />}

        <div className="flex items-center relative gap-2 flex-wrap">
          <span
            className="font-extrabold px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] tracking-[0.04em] whitespace-nowrap"
            style={{
              background: gradeColor,
            }}
          >
            {grade}
          </span>
          {clubName && (
            <span className="opacity-80 font-medium text-[10px] sm:text-[11px] truncate min-w-0">
              {clubName}
            </span>
          )}
        </div>

        <div className="font-extrabold relative text-[clamp(20px,6vw,24px)] tracking-[-0.03em] mt-3 sm:mt-3.5 break-keep">
          {userName}
        </div>

        {memberInfo && (
          <div className="font-num font-medium opacity-80 relative text-[11px] sm:text-[12px] tracking-[0.06em] mt-1 truncate">
            {memberInfo}
          </div>
        )}

        {stats.length > 0 && (
          <div className="flex relative gap-3 sm:gap-4 mt-4 sm:mt-[18px] flex-wrap">
            {stats.map((s, i) => (
              <div key={i} className="min-w-0">
                <div className="opacity-70 font-medium text-[10px] sm:text-[11px] truncate">
                  {s.label}
                </div>
                <div className="font-num font-extrabold text-[14px] sm:text-[15px] mt-0.5 truncate tabular-nums">
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DefaultDeco() {
  return (
    <svg
      viewBox="0 0 320 180"
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.18 }}
      aria-hidden
    >
      <circle
        cx="280"
        cy="40"
        r="80"
        fill="none"
        stroke="#fff"
        strokeWidth="1"
      />
      <circle
        cx="280"
        cy="40"
        r="50"
        fill="none"
        stroke="#fff"
        strokeWidth="1"
        strokeDasharray="3 5"
      />
      <path
        d="M0 150 L120 80"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
