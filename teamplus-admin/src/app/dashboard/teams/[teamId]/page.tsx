'use client';

/**
 * /dashboard/teams/[teamId] — 팀 상세 + 하위 그룹 정보
 *
 * 데이터:
 *  - GET /api/v1/teams/:teamId        → 팀 기본 정보 + roster
 *  - GET /api/v1/teams/:teamId/groups → 하위 그룹 목록
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, Shield, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { api } from '@/services/api-client';

// [수정 2026-04-30] /teams/{id}/roster (TeamGroupMember, 학생만) → /teams/{id}/members (TeamMember 전체) 로 교체.
//  팀 멤버 응답 형식 — TeamMember 단위.
interface MemberItem {
  id: string;
  playerName: string;
  playerAge: number;
  roleInTeam: string | null;
  approvalStatus?: string;
  user?: {
    gender?: string | null;
    userType?: string | null;
    email?: string | null;
    // [추가 2026-07-23] 학생(TEEN/CHILD)의 주 보호자(학부모) — 팀 상세 학부모/학생 표시용.
    //   백엔드 getTeamMembers 가 매니저/ADMIN 조회 시 함께 내려줌(childParents, isPrimary).
    childParents?: Array<{
      parent?: {
        id?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      } | null;
    }> | null;
  } | null;
  // [추가 2026-07-23] 소속 하위그룹 — 하위그룹명 클릭 시 매칭 선수 목록 펼침용.
  teamGroupMembers?: Array<{ group?: { id?: string | null } | null }> | null;
}

interface TeamDetail {
  id: string;
  name: string;
  shortName: string | null;
  // [추가 2026-05-12] 팀 코드 — 회원/코치 가입 시 사용하는 식별 코드
  teamCode: string | null;
  division: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

interface TeamGroupRow {
  id: string;
  name: string;
  ageGroup: string | null;
  isActive: boolean;
  _count?: { members: number };
}

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = params?.teamId;

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<TeamGroupRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [teamRes, membersRes, groupsRes] = await Promise.all([
          api.get<TeamDetail | { data: TeamDetail }>(`/teams/${teamId}`),
          // [수정 2026-04-30] roster → members (TeamMember 전체, 코치/학부모 포함)
          api.get<
            MemberItem[] | { members?: MemberItem[]; data?: MemberItem[]; total?: number }
          >(`/teams/${teamId}/members`, { params: { status: 'approved' } }),
          api.get<TeamGroupRow[]>(`/teams/${teamId}/groups`),
        ]);
        if (cancelled) return;
        const teamData = (teamRes as { data?: TeamDetail })?.data ?? (teamRes as TeamDetail);
        const memAny = membersRes as
          | MemberItem[]
          | { data?: MemberItem[]; members?: MemberItem[] };
        const memList = Array.isArray(memAny)
          ? memAny
          : Array.isArray((memAny as { members?: MemberItem[] }).members)
            ? (memAny as { members: MemberItem[] }).members
            : Array.isArray((memAny as { data?: MemberItem[] }).data)
              ? (memAny as { data: MemberItem[] }).data ?? []
              : [];
        setTeam(teamData);
        setMembers(memList);
        setGroups(Array.isArray(groupsRes) ? groupsRes : []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '팀 정보를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  if (isLoading) return <LoadingSpinner message="팀 정보를 불러오는 중..." />;

  if (error || !team) {
    return (
      <div className="space-y-6 pb-10">
        <Link href="/dashboard/teams" className="inline-flex items-center text-sm text-slate-500 hover:text-primary">
          <ArrowLeft className="w-4 h-4 mr-1" /> 팀 목록으로
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error ?? '팀을 찾을 수 없습니다.'}
        </div>
      </div>
    );
  }

  // [수정 2026-04-30] 4개 카테고리 분류 — 감독 / 코치 / 학부모 / 학생
  // roleInTeam 우선, fallback 으로 user.userType 도 고려.
  const categorize = (m: MemberItem): 'director' | 'coach' | 'parent' | 'student' | 'other' => {
    const role = (m.roleInTeam ?? '').toUpperCase();
    const ut = (m.user?.userType ?? '').toUpperCase();
    if (role === 'HEAD_COACH' || ut === 'DIRECTOR' || ut === 'ACADEMY_DIRECTOR') return 'director';
    if (role === 'COACH' || ut === 'COACH') return 'coach';
    if (role === 'MANAGER' || role === 'PARENT' || ut === 'PARENT') return 'parent';
    if (role === 'PLAYER' || ut === 'TEEN' || ut === 'CHILD' || ut === 'STUDENT') return 'student';
    return 'other';
  };
  // [수정 2026-05-13] 카테고리별 정렬 — 감독: HEAD_COACH 우선, 그 다음 이름순.
  const sortByName = (a: MemberItem, b: MemberItem) =>
    (a.playerName ?? '').localeCompare(b.playerName ?? '', 'ko-KR');
  const directors = members
    .filter((m) => categorize(m) === 'director')
    .sort((a, b) => {
      const aHead = (a.roleInTeam ?? '').toUpperCase() === 'HEAD_COACH';
      const bHead = (b.roleInTeam ?? '').toUpperCase() === 'HEAD_COACH';
      if (aHead !== bHead) return aHead ? -1 : 1;
      return sortByName(a, b);
    });
  const coaches = members.filter((m) => categorize(m) === 'coach').sort(sortByName);
  const parents = members.filter((m) => categorize(m) === 'parent').sort(sortByName);
  const students = members.filter((m) => categorize(m) === 'student').sort(sortByName);

  // [추가 2026-07-23] 학생(자녀)의 주 보호자(학부모) 이름.
  const parentNameOf = (m: MemberItem): string => {
    const p = m.user?.childParents?.[0]?.parent;
    if (!p) return '';
    return `${p.lastName ?? ''}${p.firstName ?? ''}`.trim();
  };
  // 학부모 목록 = 팀멤버 학부모 + 팀 소속 학생들의 보호자(자녀 소속 따라 편입).
  //   이름 기준으로 묶고, 각 학부모의 이 팀 소속 자녀 이름들을 함께 담는다.
  const parentList = (() => {
    const map = new Map<string, { id: string; name: string; children: string[] }>();
    for (const m of parents) {
      const name = (m.playerName ?? '').trim() || '이름 없음';
      if (!map.has(name)) map.set(name, { id: m.id, name, children: [] });
    }
    for (const m of students) {
      const name = parentNameOf(m);
      if (!name) continue;
      if (!map.has(name)) map.set(name, { id: `parent-${name}`, name, children: [] });
      const child = (m.playerName ?? '').trim();
      if (child) map.get(name)!.children.push(child);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'ko-KR'),
    );
  })();

  // [추가 2026-07-23] 하위그룹에 매칭된 선수 목록 (teamGroupMembers 로 그룹 id 매칭).
  const membersOfGroup = (groupId: string): MemberItem[] =>
    students.filter((m) =>
      (m.teamGroupMembers ?? []).some((gm) => gm.group?.id === groupId),
    );
  const toggleGroup = (id: string) =>
    setExpandedGroupId((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-6 pb-10">
      <Link href="/dashboard/teams" className="inline-flex items-center text-sm text-slate-500 hover:text-primary">
        <ArrowLeft className="w-4 h-4 mr-1" /> 팀 목록으로
      </Link>

      {/* 팀 정보 — [수정 2026-05-12] 팀 이름 밑에 팀코드 표시 (chip) */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{team.name}</h1>
          {team.teamCode && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary/10 text-primary text-sm font-bold tracking-wider">
              {team.teamCode}
            </span>
          )}
        </div>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
          {team.shortName && team.shortName !== team.teamCode ? `${team.shortName}` : ''}
          {team.division ? ` · ${team.division}` : ''}
          {team.description ? ` · ${team.description}` : ''}
        </p>
      </div>

      {/* [수정 2026-04-30] 감독 / 코치 / 학부모 / 학생 4개 카드 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">감독 ({directors.length})</h2>
        </div>
        {directors.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">등록된 감독이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {directors.map((m) => (
              <li key={m.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-900 dark:text-white">{m.playerName}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{m.roleInTeam ?? '-'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">코치 ({coaches.length})</h2>
        </div>
        {coaches.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">등록된 코치가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {coaches.map((m) => (
              <li key={m.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-900 dark:text-white">{m.playerName}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{m.roleInTeam ?? '-'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">학부모 ({parentList.length})</h2>
        </div>
        {parentList.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">등록된 학부모가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {parentList.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {p.children.length > 0 ? p.children.join(', ') : '학부모'}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">선수 ({students.length})</h2>
        </div>
        {students.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">등록된 선수가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {students.map((m) => {
              const parentName = parentNameOf(m);
              return (
                <div key={m.id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{m.playerName}</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {parentName ? `${parentName} · ` : ''}{m.playerAge}세
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 하위그룹 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">하위 그룹 ({groups.length})</h2>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">등록된 하위 그룹이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => {
              const groupMembers = membersOfGroup(g.id);
              const isExpanded = expandedGroupId === g.id;
              return (
                <li key={g.id} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    aria-expanded={isExpanded}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none"
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{g.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          선수 {groupMembers.length}명
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded shrink-0 ${g.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                      {g.isActive ? '활성' : '비활성'}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/20">
                      {groupMembers.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500 py-1">매칭된 선수가 없습니다.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {groupMembers.map((m) => {
                            const pn = parentNameOf(m);
                            return (
                              <div key={m.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">{m.playerName}</p>
                                <p className="text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                  {pn ? `${pn} · ` : ''}{m.playerAge}세
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
