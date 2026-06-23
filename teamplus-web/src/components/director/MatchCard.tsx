'use client';

import { Icon } from '@/components/ui/Icon';

// ─── 참가팀 인터페이스 ──────────────────────────────
export interface ParticipatingTeam {
  id: string;
  name: string;
  shortName: string;
  /** Tailwind 배경+텍스트 색상 클래스 (예: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300') */
  colorClass: string;
}

// ─── 경기 인터페이스 ────────────────────────────────
export interface MatchData {
  id: string;
  date: string;
  time: string;
  venue: string;
  teamA: ParticipatingTeam;
  teamB: ParticipatingTeam;
  scoreA?: number;
  scoreB?: number;
  isCompleted: boolean;
}

// ─── 팀 색상 프리셋 ─────────────────────────────────
export const TEAM_COLORS = [
  'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300',
  'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300',
  'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300',
  'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-300',
  'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300',
  'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300',
  'bg-wline text-wtext-2 dark:bg-rink-500 dark:text-rink-100',
];

interface MatchCardProps {
  match: MatchData;
}

/**
 * 매치 결과/대진 카드 컴포넌트
 * 대회 상세 페이지의 대진표 탭에서 사용합니다.
 */
export function MatchCard({ match }: MatchCardProps) {
  const aWins = match.isCompleted && match.scoreA != null && match.scoreB != null && match.scoreA > match.scoreB;
  const bWins = match.isCompleted && match.scoreA != null && match.scoreB != null && match.scoreB > match.scoreA;

  return (
    <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline dark:border-rink-700 overflow-hidden">
      {/* 매치 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 bg-wbg dark:bg-rink-900/50 border-b border-wline-2 dark:border-rink-700">
        <span className="text-xs text-wtext-3 dark:text-rink-300 font-medium">
          {match.date} {match.time}
        </span>
        <span className="text-xs text-wtext-3 dark:text-rink-300">
          {match.venue}
        </span>
      </div>

      {/* 매치 내용 */}
      <div className="p-3 space-y-3">
        {/* 팀 A */}
        <div
          className={`flex items-center justify-between ${
            match.isCompleted && !aWins && bWins ? 'opacity-50' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${match.teamA.colorClass}`}
            >
              {match.teamA.shortName}
            </div>
            <span
              className={`text-sm truncate max-w-[100px] ${
                aWins ? 'font-bold' : 'font-medium'
              } text-wtext-1 dark:text-white`}
            >
              {match.teamA.name}
            </span>
          </div>
          <span
            className={`text-sm ${
              aWins
                ? 'font-bold text-wtext-1 dark:text-white'
                : 'text-wtext-3 dark:text-rink-300'
            }`}
          >
            {match.scoreA !== undefined ? match.scoreA : '-'}
          </span>
        </div>

        {/* 팀 B */}
        <div
          className={`flex items-center justify-between ${
            match.isCompleted && !bWins && aWins ? 'opacity-50' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${match.teamB.colorClass}`}
            >
              {match.teamB.shortName}
            </div>
            <span
              className={`text-sm truncate max-w-[100px] ${
                bWins ? 'font-bold' : 'font-medium'
              } text-wtext-1 dark:text-white`}
            >
              {match.teamB.name}
            </span>
          </div>
          <span
            className={`text-sm ${
              bWins
                ? 'font-bold text-wtext-1 dark:text-white'
                : 'text-wtext-3 dark:text-rink-300'
            }`}
          >
            {match.scoreB !== undefined ? match.scoreB : '-'}
          </span>
        </div>
      </div>
    </div>
  );
}

interface MatchScheduleCardProps {
  match: MatchData;
}

/**
 * 경기 일정 카드 컴포넌트 (경기 일정 탭용)
 * 날짜/시간 + VS 형태의 가로 레이아웃입니다.
 */
export function MatchScheduleCard({ match }: MatchScheduleCardProps) {
  return (
    <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline dark:border-rink-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon
            name="event"
            className="text-lg text-wtext-3 dark:text-rink-300"
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-wtext-1 dark:text-white">
            {match.date} {match.time}
          </span>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-bold ${
            match.isCompleted
              ? 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100'
              : 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
          }`}
        >
          {match.isCompleted ? '종료' : '예정'}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${match.teamA.colorClass}`}
          >
            {match.teamA.shortName}
          </div>
          <span className="text-sm font-medium text-wtext-1 dark:text-white">
            {match.teamA.name}
          </span>
        </div>
        <span className="text-sm font-bold text-wtext-3 dark:text-rink-300">
          VS
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-wtext-1 dark:text-white">
            {match.teamB.name}
          </span>
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${match.teamB.colorClass}`}
          >
            {match.teamB.shortName}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 text-xs text-wtext-3 dark:text-rink-300">
        <Icon name="location_on" className="text-sm" aria-hidden="true" />
        <span>{match.venue}</span>
      </div>
    </div>
  );
}
