'use client';

import { NavLink } from '@/components/ui/NavLink';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';

import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
// 참가팀 인터페이스
interface Team {
  id: string;
  name: string;
  shortName: string;
  colorClass: string;
}

// 경기 인터페이스
interface BracketMatch {
  id: string;
  date: string;
  time: string;
  venue: string;
  teamA?: Team;
  teamB?: Team;
  scoreA?: number;
  scoreB?: number;
  isCompleted: boolean;
  round: 'quarter' | 'semi' | 'final';
}

// 목업 팀 데이터
const teams: Record<string, Team> = {
  polarBears: { id: '1', name: 'Polar Bears', shortName: 'P', colorClass: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' },
  tigers: { id: '2', name: 'Tigers', shortName: 'T', colorClass: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300' },
  eagles: { id: '3', name: 'Eagles', shortName: 'E', colorClass: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300' },
  sharks: { id: '4', name: 'Sharks', shortName: 'S', colorClass: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-300' },
  dragons: { id: '5', name: 'Dragons', shortName: 'D', colorClass: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300' },
  lions: { id: '6', name: 'Lions', shortName: 'L', colorClass: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300' },
  knights: { id: '7', name: 'Knights', shortName: 'K', colorClass: 'bg-wline text-wtext-2 dark:bg-rink-500 dark:text-rink-100' },
  wolves: { id: '8', name: 'Wolves', shortName: 'W', colorClass: 'bg-wline text-wtext-2 dark:bg-rink-500 dark:text-rink-100' },
};

// 목업 대진표 데이터
const quarterFinals: BracketMatch[] = [
  {
    id: 'qf1',
    date: '12.01',
    time: '14:00',
    venue: 'Rink 1',
    teamA: teams.polarBears,
    teamB: teams.tigers,
    scoreA: 3,
    scoreB: 1,
    isCompleted: true,
    round: 'quarter',
  },
  {
    id: 'qf2',
    date: '12.01',
    time: '16:00',
    venue: 'Rink 1',
    teamA: teams.eagles,
    teamB: teams.sharks,
    scoreA: 5,
    scoreB: 2,
    isCompleted: true,
    round: 'quarter',
  },
  {
    id: 'qf3',
    date: '12.02',
    time: '14:00',
    venue: 'Rink 2',
    teamA: teams.dragons,
    teamB: teams.lions,
    isCompleted: false,
    round: 'quarter',
  },
  {
    id: 'qf4',
    date: '12.02',
    time: '16:00',
    venue: 'Rink 2',
    teamA: teams.knights,
    teamB: teams.wolves,
    isCompleted: false,
    round: 'quarter',
  },
];

const semiFinals: BracketMatch[] = [
  {
    id: 'sf1',
    date: '12.08',
    time: '14:00',
    venue: 'Rink 1',
    teamA: teams.polarBears,
    teamB: teams.eagles,
    isCompleted: false,
    round: 'semi',
  },
  {
    id: 'sf2',
    date: '12.08',
    time: '16:00',
    venue: 'Rink 1',
    isCompleted: false,
    round: 'semi',
  },
];

const finalMatch: BracketMatch = {
  id: 'final',
  date: '12.15',
  time: '15:00',
  venue: 'Main Rink',
  isCompleted: false,
  round: 'final',
};

// 대진표 매치 카드 컴포넌트
function BracketMatchCard({ match, isFinal = false }: { match: BracketMatch; isFinal?: boolean }) {
  const getTeamDisplay = (team?: Team, score?: number, isWinner?: boolean, isLoser?: boolean) => {
    if (!team) {
      return (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-w-small font-medium text-it-ink-400 italic">TBD</span>
          </div>
          <span className="text-w-small text-it-ink-400">-</span>
        </div>
      );
    }

    return (
      <div className={`flex items-center justify-between ${isLoser ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2">
          <div className={`w-5 h-5 rounded-w-pill flex items-center justify-center text-w-caption font-bold ${team.colorClass}`}>
            {team.shortName}
          </div>
          <span className={`text-w-small truncate max-w-[80px] text-it-ink-800 dark:text-rink-100 ${isWinner ? 'font-bold' : 'font-medium'}`}>
            {team.name}
          </span>
        </div>
        <span className={`text-w-small ${isWinner ? 'font-bold text-it-ink-800 dark:text-white' : score !== undefined ? 'font-medium text-it-ink-800 dark:text-rink-100' : 'text-it-ink-400'}`}>
          {score !== undefined ? score : '-'}
        </span>
      </div>
    );
  };

  const isTeamAWinner = match.isCompleted && match.scoreA !== undefined && match.scoreB !== undefined && match.scoreA > match.scoreB;
  const isTeamBWinner = match.isCompleted && match.scoreA !== undefined && match.scoreB !== undefined && match.scoreB > match.scoreA;

  if (isFinal) {
    return (
      <div className="relative flex w-48 flex-col bg-it-surface dark:bg-rink-800 rounded-w-md shadow-sh-2 border-2 border-it-blue-500 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-it-blue-50 border-b border-it-line dark:border-rink-700">
          <span className="text-w-caption text-it-blue-500 font-bold">{match.date} {match.time}</span>
          <span className="text-w-caption text-it-blue-500/70 font-bold">{match.venue}</span>
        </div>
        <div className="p-4 space-y-4">
          {match.teamA ? (
            <div className="flex items-center justify-center flex-col gap-2">
              <div className={`w-10 h-10 rounded-w-pill flex items-center justify-center text-w-small font-bold ${match.teamA.colorClass}`}>
                {match.teamA.shortName}
              </div>
              <span className="text-w-small font-medium text-it-ink-600 dark:text-rink-100">{match.teamA.name}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center flex-col gap-2">
              <div className="w-10 h-10 rounded-w-pill bg-it-fill dark:bg-rink-700 border-2 border-dashed border-it-line-strong dark:border-rink-300 flex items-center justify-center">
                <Icon name="question_mark" className="text-xl text-it-ink-400" />
              </div>
              <span className="text-w-small font-medium text-it-ink-400">Finalist A</span>
            </div>
          )}
          <div className="flex justify-center text-w-caption text-it-ink-400 font-bold">VS</div>
          {match.teamB ? (
            <div className="flex items-center justify-center flex-col gap-2">
              <div className={`w-10 h-10 rounded-w-pill flex items-center justify-center text-w-small font-bold ${match.teamB.colorClass}`}>
                {match.teamB.shortName}
              </div>
              <span className="text-w-small font-medium text-it-ink-600 dark:text-rink-100">{match.teamB.name}</span>
            </div>
          ) : (
            <div className="flex items-center justify-center flex-col gap-2">
              <div className="w-10 h-10 rounded-w-pill bg-it-fill dark:bg-rink-700 border-2 border-dashed border-it-line-strong dark:border-rink-300 flex items-center justify-center">
                <Icon name="question_mark" className="text-xl text-it-ink-400" />
              </div>
              <span className="text-w-small font-medium text-it-ink-400">Finalist B</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex w-48 flex-col bg-it-surface dark:bg-rink-800 rounded-w-md shadow-sh-1 border border-it-line dark:border-rink-700 overflow-hidden ${!match.isCompleted && !match.teamA && !match.teamB ? 'opacity-80' : ''}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-it-fill dark:bg-rink-900/50 border-b border-it-line dark:border-rink-700">
        <span className="text-w-caption text-it-ink-400 font-medium">{match.date} {match.time}</span>
        <span className="text-w-caption text-it-ink-400">{match.venue}</span>
      </div>
      <div className="p-3 space-y-3">
        {getTeamDisplay(match.teamA, match.scoreA, isTeamAWinner, isTeamBWinner)}
        {getTeamDisplay(match.teamB, match.scoreB, isTeamBWinner, isTeamAWinner)}
      </div>
    </div>
  );
}

// 커넥터 컴포넌트
function BracketConnector({ height, className = '' }: { height: number; className?: string }) {
  return (
    <div className={`w-8 flex flex-col justify-center items-center ${className}`}>
      <div
        className="w-full border-r border-t border-b border-it-line-strong dark:border-rink-700 rounded-r-lg"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}

export default function BracketPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const params = useParams();

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar
        title="대진표"
        // [appbar-harness-v4 분류 C→A] rightActions 단독 사용 시 우측 3 액션(시계/종/메뉴)이 모두 사라짐.
        //   extraActions 로 변환하여 ☰ 메뉴는 항상 노출 (PageAppBar v2.3 SoT 정책).
        extraActions={[
          { icon: 'fullscreen', label: '전체화면', onClick: () => {} },
        ]}
      />

      {/* 대회 정보 요약 — navy 히어로(대회 요약 강조) */}
      <div className="px-4 py-5 bg-it-blue-800 dark:bg-it-blue-950">
        <h1 className="text-w-title font-bold text-white mb-1">
          2024 윈터 아이스하키 리그
        </h1>
        <div className="flex items-center gap-4 text-w-small text-white/70">
          <div className="flex items-center gap-1">
            <Icon name="calendar_today" className="text-w-body-lg" />
            <span>2024.12.01 - 2025.01.15</span>
          </div>
        </div>
      </div>

      {/* 섹션 타이틀 */}
      <div className="flex items-center justify-between px-4 pt-6 pb-2 bg-it-canvas dark:bg-puck">
        <h2 className="text-w-title font-bold text-it-ink-800 dark:text-white">8강 대진표</h2>
        <span className="text-w-caption text-it-blue-500 font-medium bg-it-blue-50 px-2 py-1 rounded-w-pill">
          Update: Today 10:00
        </span>
      </div>

      {/* 대진표 시각화 컨테이너 */}
      <div className="w-full overflow-x-auto pb-8 pt-2 pl-4 bg-it-canvas dark:bg-puck" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        <div className="flex min-w-max gap-4 pr-4">
          {/* 라운드 1: 8강 */}
          <div className="flex flex-col gap-6 pt-0">
            <div className="text-center pb-2 text-w-caption font-bold text-it-ink-400 uppercase tracking-widest">
              Quarter Finals
            </div>
            {quarterFinals.map((match) => (
              <BracketMatchCard key={match.id} match={match} />
            ))}
          </div>

          {/* 커넥터 컬럼 1 */}
          <div className="flex flex-col pt-[60px] pb-[60px] justify-around">
            <BracketConnector height={148} />
            <div className="h-8" />
            <BracketConnector height={148} />
          </div>

          {/* 라운드 2: 4강 */}
          <div className="flex flex-col justify-around pt-0">
            <div className="text-center pb-2 text-w-caption font-bold text-it-ink-400 uppercase tracking-widest mb-[100px]">
              Semi Finals
            </div>
            <div className="flex flex-col gap-[120px]">
              {semiFinals.map((match) => (
                <BracketMatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>

          {/* 커넥터 컬럼 2 */}
          <div className="flex flex-col justify-center">
            <BracketConnector height={290} />
          </div>

          {/* 라운드 3: 결승 */}
          <div className="flex flex-col justify-center pt-0">
            <div className="text-center pb-2 text-w-caption font-bold text-it-blue-500 uppercase tracking-widest mb-2">
              Final
            </div>
            <BracketMatchCard match={finalMatch} isFinal />
          </div>

          {/* 스크롤 여백 */}
          <div className="w-4" />
        </div>
      </div>

      {/* 범례 */}
      <div className="px-4 pb-6 bg-it-canvas dark:bg-puck">
        <div className="bg-it-surface dark:bg-rink-800/50 rounded-w-md p-4">
          <h3 className="text-w-small font-bold text-it-ink-600 dark:text-rink-100 mb-3">범례</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-it-blue-500 rounded-w-pill" />
              <span className="text-w-caption text-it-ink-600 dark:text-rink-300">진행중</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-mint rounded-w-pill" />
              <span className="text-w-caption text-it-ink-600 dark:text-rink-300">완료</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-it-line-strong dark:bg-rink-500 rounded-w-pill" />
              <span className="text-w-caption text-it-ink-600 dark:text-rink-300">예정</span>
            </div>
          </div>
        </div>
      </div>

      {/* 참가팀 목록 */}
      <div className="px-4 pb-8 bg-it-canvas dark:bg-puck">
        <h3 className="text-w-title font-bold text-it-ink-800 dark:text-white mb-4">참가팀</h3>
        <div className="grid grid-cols-2 gap-3">
          {Object.values(teams).map((team) => (
            <div
              key={team.id}
              className="flex items-center gap-3 bg-it-surface dark:bg-rink-800 rounded-w-md p-3 border border-it-line dark:border-rink-700"
            >
              <div className={`w-8 h-8 rounded-w-pill flex items-center justify-center text-w-caption font-bold ${team.colorClass}`}>
                {team.shortName}
              </div>
              <span className="text-w-small font-medium text-it-ink-800 dark:text-white">{team.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-it-surface/90 dark:bg-it-blue-950/90 border-t border-it-line dark:border-rink-700">
        <div className="max-w-md mx-auto flex gap-3">
          <NavLink
            href={`/tournaments/${params?.id ?? ''}`}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-it-fill dark:bg-rink-800 text-it-ink-600 dark:text-rink-100 font-bold rounded-w-md hover:bg-it-line dark:hover:bg-rink-700 transition-colors motion-reduce:transition-none"
          >
            <Icon name="info" className="text-w-title" />
            <span>대회 정보</span>
          </NavLink>
          <button type="button" className="flex-1 flex items-center justify-center gap-2 py-3 bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold rounded-w-md transition-colors motion-reduce:transition-none">
            <Icon name="share" className="text-w-title" />
            <span>공유하기</span>
          </button>
        </div>
      </div>
    </MobileContainer>
  );
}
