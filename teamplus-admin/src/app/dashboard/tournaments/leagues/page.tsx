'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import {
  LEAGUE_STATUSES,
  LEAGUE_STATUS_COLORS,
  LEAGUE_STATUS_DEFAULT,
  LEAGUE_STATUS_LABELS,
  type LeagueStatus,
} from '@/lib/tournament-status';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Trophy,
  ArrowLeft,
  Users,
  ChevronRight,
  Layers,
  Link2,
} from 'lucide-react';

type AgeGroup = '' | 'U9' | 'U12' | 'U15' | 'U18';

interface League {
  id: string;
  name: string;
  season: string;
  year: number;
  ageGroup: string | null;
  region: string | null;
  status: LeagueStatus;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  _count?: {
    divisions: number;
  };
}

interface DivisionTeamRelation {
  id: string;
  teamId: string;
  seed: number | null;
  createdAt: string;
  status?: string;
  team: {
    id: string;
    name: string;
    division: string | null;
    club: {
      id: string;
      clubName: string;
    };
  };
}

interface Division {
  id: string;
  leagueId: string;
  name: string;
  level: number;
  description: string | null;
  maxTeams: number | null;
  sortOrder: number;
  teamDivisions?: DivisionTeamRelation[];
}

interface DivisionDetail extends Division {
  teamDivisions: DivisionTeamRelation[];
}

interface TeamDivision {
  id: string;
  divisionId: string;
  teamId: string;
  teamName: string;
  clubName: string;
  division: string | null;
  seed: number | null;
  joinedAt: string;
}

interface TeamOption {
  id: string;
  name: string;
  shortName: string | null;
  division: string | null;
  club: {
    id: string;
    clubName: string;
  };
  _count?: {
    roster: number;
  };
}

interface LeagueFormState {
  name: string;
  season: string;
  year: number;
  ageGroup: AgeGroup;
  region: string;
  status: LeagueStatus;
  description: string;
  startDate: string;
  endDate: string;
}

interface DivisionFormState {
  name: string;
  level: number;
  description: string;
  maxTeams: number;
  sortOrder: number;
}

interface TeamAssignmentFormState {
  teamId: string;
  seed: string;
}

const emptyLeagueForm: LeagueFormState = {
  name: '',
  season: '',
  year: new Date().getFullYear(),
  ageGroup: '',
  region: '',
  status: LEAGUE_STATUS_DEFAULT,
  description: '',
  startDate: '',
  endDate: '',
};

const emptyDivisionForm: DivisionFormState = {
  name: '',
  level: 1,
  description: '',
  maxTeams: 8,
  sortOrder: 0,
};

const emptyTeamAssignmentForm: TeamAssignmentFormState = {
  teamId: '',
  seed: '',
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) {
    return '-';
  }

  try {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function toDateInputValue(value: string | null | undefined) {
  return value ? value.split('T')[0] : '';
}

function mapTeamDivisions(detail: DivisionDetail | null): TeamDivision[] {
  if (!detail?.teamDivisions) {
    return [];
  }

  return detail.teamDivisions.map((teamDivision) => ({
    id: teamDivision.id,
    divisionId: detail.id,
    teamId: teamDivision.teamId,
    teamName: teamDivision.team.name,
    clubName: teamDivision.team.club.clubName,
    division: teamDivision.team.division,
    seed: teamDivision.seed,
    joinedAt: teamDivision.createdAt,
  }));
}

export default function LeaguesPage() {
  const [view, setView] = useState<'leagues' | 'divisions' | 'teams'>('leagues');
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<Division | null>(null);

  const [leagues, setLeagues] = useState<League[]>([]);
  const [leagueSearch, setLeagueSearch] = useState('');
  const [isLeagueLoading, setIsLeagueLoading] = useState(true);

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [isDivisionLoading, setIsDivisionLoading] = useState(false);

  const [teamDivisions, setTeamDivisions] = useState<TeamDivision[]>([]);
  const [availableTeams, setAvailableTeams] = useState<TeamOption[]>([]);
  const [isTeamLoading, setIsTeamLoading] = useState(false);

  const [isLeagueModalOpen, setIsLeagueModalOpen] = useState(false);
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingLeague, setEditingLeague] = useState<League | null>(null);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'league'; id: string; name: string }
    | { type: 'division'; id: string; name: string }
    | { type: 'team'; id: string; name: string }
    | null
  >(null);

  const [leagueForm, setLeagueForm] = useState<LeagueFormState>(emptyLeagueForm);
  const [divisionForm, setDivisionForm] = useState<DivisionFormState>(emptyDivisionForm);
  const [teamAssignmentForm, setTeamAssignmentForm] = useState<TeamAssignmentFormState>(emptyTeamAssignmentForm);
  const [isSaving, setIsSaving] = useState(false);

  const loadLeagues = useCallback(async () => {
    setIsLeagueLoading(true);

    try {
      const response = await api.get<League[]>('/leagues');
      setLeagues(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('[리그] 목록 로드 실패:', error);
      setLeagues([]);
    } finally {
      setIsLeagueLoading(false);
    }
  }, []);

  const loadDivisions = useCallback(async (leagueId: string) => {
    setIsDivisionLoading(true);

    try {
      const response = await api.get<Division[]>(`/leagues/${leagueId}/divisions`);
      setDivisions(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('[디비전] 목록 로드 실패:', error);
      setDivisions([]);
    } finally {
      setIsDivisionLoading(false);
    }
  }, []);

  const loadTeamDivisions = useCallback(async (divisionId: string) => {
    setIsTeamLoading(true);

    try {
      const response = await api.get<DivisionDetail>(`/divisions/${divisionId}`);
      setTeamDivisions(mapTeamDivisions(response));
    } catch (error) {
      console.error('[팀배치] 상세 로드 실패:', error);
      setTeamDivisions([]);
    } finally {
      setIsTeamLoading(false);
    }
  }, []);

  const loadAvailableTeams = useCallback(async () => {
    try {
      const response = await api.get<TeamOption[]>('/teams');
      setAvailableTeams(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('[팀배치] 팀 목록 로드 실패:', error);
      setAvailableTeams([]);
    }
  }, []);

  useEffect(() => {
    loadLeagues();
  }, [loadLeagues]);

  const openLeagueModal = (league?: League) => {
    if (league) {
      setEditingLeague(league);
      setLeagueForm({
        name: league.name,
        season: league.season,
        year: league.year,
        ageGroup: (league.ageGroup as AgeGroup) || '',
        region: league.region ?? '',
        status: league.status,
        description: league.description ?? '',
        startDate: toDateInputValue(league.startDate),
        endDate: toDateInputValue(league.endDate),
      });
    } else {
      setEditingLeague(null);
      setLeagueForm(emptyLeagueForm);
    }

    setIsLeagueModalOpen(true);
  };

  const openDivisionModal = (division?: Division) => {
    if (division) {
      setEditingDivision(division);
      setDivisionForm({
        name: division.name,
        level: division.level,
        description: division.description ?? '',
        maxTeams: division.maxTeams ?? 8,
        sortOrder: division.sortOrder,
      });
    } else {
      setEditingDivision(null);
      setDivisionForm({
        name: '',
        level: divisions.length + 1,
        description: '',
        maxTeams: 8,
        sortOrder: divisions.length,
      });
    }

    setIsDivisionModalOpen(true);
  };

  const openTeamModal = async () => {
    setTeamAssignmentForm(emptyTeamAssignmentForm);
    await loadAvailableTeams();
    setIsTeamModalOpen(true);
  };

  const saveLeague = async () => {
    if (!leagueForm.name.trim() || !leagueForm.season.trim()) {
      window.alert('리그명과 시즌을 입력해주세요.');
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        name: leagueForm.name.trim(),
        season: leagueForm.season.trim(),
        year: Number(leagueForm.year),
        ageGroup: leagueForm.ageGroup || undefined,
        region: leagueForm.region.trim() || undefined,
        status: leagueForm.status,
        description: leagueForm.description.trim() || undefined,
        startDate: leagueForm.startDate || undefined,
        endDate: leagueForm.endDate || undefined,
      };

      if (editingLeague) {
        await api.put(`/leagues/${editingLeague.id}`, payload);
      } else {
        await api.post('/leagues', payload);
      }

      setIsLeagueModalOpen(false);
      setEditingLeague(null);
      setLeagueForm(emptyLeagueForm);
      await loadLeagues();
    } catch (error) {
      console.error('[리그] 저장 실패:', error);
      window.alert('리그 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveDivision = async () => {
    if (!selectedLeague || !divisionForm.name.trim()) {
      window.alert('디비전명을 입력해주세요.');
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        name: divisionForm.name.trim(),
        level: Number(divisionForm.level),
        description: divisionForm.description.trim() || undefined,
        maxTeams: Number(divisionForm.maxTeams) || undefined,
        sortOrder: Number(divisionForm.sortOrder),
      };

      if (editingDivision) {
        await api.put(`/divisions/${editingDivision.id}`, payload);
      } else {
        await api.post(`/leagues/${selectedLeague.id}/divisions`, payload);
      }

      setIsDivisionModalOpen(false);
      setEditingDivision(null);
      setDivisionForm(emptyDivisionForm);
      await loadDivisions(selectedLeague.id);
    } catch (error) {
      console.error('[디비전] 저장 실패:', error);
      window.alert('디비전 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const saveTeamAssignment = async () => {
    if (!selectedLeague || !selectedDivision || !teamAssignmentForm.teamId) {
      window.alert('배치할 팀을 선택해주세요.');
      return;
    }

    setIsSaving(true);

    try {
      await api.post(`/divisions/${selectedDivision.id}/teams`, {
        teamId: teamAssignmentForm.teamId,
        season: selectedLeague.season,
        seed: teamAssignmentForm.seed ? Number(teamAssignmentForm.seed) : undefined,
      });

      setIsTeamModalOpen(false);
      setTeamAssignmentForm(emptyTeamAssignmentForm);
      await Promise.all([loadTeamDivisions(selectedDivision.id), loadDivisions(selectedLeague.id)]);
    } catch (error) {
      console.error('[팀배치] 저장 실패:', error);
      window.alert('팀 배치에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      if (deleteTarget.type === 'league') {
        await api.delete(`/leagues/${deleteTarget.id}`);
        await loadLeagues();
      } else if (deleteTarget.type === 'division') {
        await api.delete(`/divisions/${deleteTarget.id}`);
        if (selectedLeague) {
          await loadDivisions(selectedLeague.id);
        }
      } else {
        await api.delete(`/divisions/teams/${deleteTarget.id}`);
        if (selectedDivision) {
          await loadTeamDivisions(selectedDivision.id);
        }
        if (selectedLeague) {
          await loadDivisions(selectedLeague.id);
        }
      }
    } catch (error) {
      console.error('[리그] 삭제 실패:', error);
      window.alert('삭제에 실패했습니다.');
    } finally {
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  const selectLeague = (league: League) => {
    setSelectedLeague(league);
    setSelectedDivision(null);
    setTeamDivisions([]);
    setView('divisions');
    loadDivisions(league.id);
  };

  const selectDivision = (division: Division) => {
    setSelectedDivision(division);
    setView('teams');
    loadTeamDivisions(division.id);
  };

  const goBackToLeagues = () => {
    setView('leagues');
    setSelectedLeague(null);
    setDivisions([]);
  };

  const goBackToDivisions = () => {
    setView('divisions');
    setSelectedDivision(null);
    setTeamDivisions([]);
  };

  const filteredLeagues = leagues.filter((league) => {
    if (!leagueSearch) {
      return true;
    }

    const keyword = leagueSearch.toLowerCase();
    return (
      league.name.toLowerCase().includes(keyword) ||
      league.season.toLowerCase().includes(keyword) ||
      (league.region ?? '').toLowerCase().includes(keyword)
    );
  });

  const availableTeamOptions = availableTeams.filter(
    (team) => !teamDivisions.some((teamDivision) => teamDivision.teamId === team.id)
  );

  return (
    <div className="space-y-6">
      <PageHeader title="리그/디비전 관리" description="리그 생성, 디비전 구성, 팀 배치까지 한 화면에서 관리합니다." />

      {view === 'leagues' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">리그 목록</h2>
              <Badge variant="secondary" className="text-xs">
                {filteredLeagues.length}건
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="리그명, 시즌, 지역 검색"
                  value={leagueSearch}
                  onChange={(event) => setLeagueSearch(event.target.value)}
                  className="w-64 pl-9"
                />
              </div>
              <Button type="button" onClick={() => openLeagueModal()}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                리그 추가
              </Button>
            </div>
          </div>

          {isLeagueLoading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : filteredLeagues.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Trophy className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>등록된 리그가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              <div className="grid grid-cols-[1.8fr_1fr_80px_90px_1fr_90px_80px_100px] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800">
                <span>리그명</span>
                <span>시즌</span>
                <span className="text-center">연도</span>
                <span className="text-center">연령대</span>
                <span>지역</span>
                <span className="text-center">상태</span>
                <span className="text-center">디비전</span>
                <span className="text-center">관리</span>
              </div>

              {filteredLeagues.map((league) => (
                <div
                  key={league.id}
                  className="grid cursor-pointer grid-cols-[1.8fr_1fr_80px_90px_1fr_90px_80px_100px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  onClick={() => selectLeague(league)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{league.name}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(league.startDate)} ~ {formatDate(league.endDate)}
                    </p>
                  </div>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{league.season}</span>
                  <span className="text-center text-sm text-slate-600 dark:text-slate-400">{league.year}</span>
                  <span className="text-center text-sm text-slate-600 dark:text-slate-400">{league.ageGroup || '-'}</span>
                  <span className="truncate text-sm text-slate-600 dark:text-slate-400">{league.region || '-'}</span>
                  <span className="text-center">
                    <Badge className={`text-xs ${LEAGUE_STATUS_COLORS[league.status]}`}>{LEAGUE_STATUS_LABELS[league.status]}</Badge>
                  </span>
                  <span className="text-center">
                    <Badge variant="secondary" className="text-xs">
                      {league._count?.divisions ?? 0}
                    </Badge>
                  </span>
                  <div className="flex items-center justify-center gap-1" onClick={(event) => event.stopPropagation()}>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => openLeagueModal(league)} title="수정" aria-label="리그 수정">
                      <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => {
                        setDeleteTarget({ type: 'league', id: league.id, name: league.name });
                        setIsDeleteModalOpen(true);
                      }}
                      title="삭제"
                      aria-label="리그 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {view === 'divisions' && selectedLeague && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => goBackToLeagues()} aria-label="리그 목록으로 돌아가기">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Layers className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {selectedLeague.name}
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    ({selectedLeague.season} {selectedLeague.year})
                  </span>
                </h2>
                {selectedLeague.description && <p className="mt-0.5 text-xs text-slate-500">{selectedLeague.description}</p>}
              </div>
              <Badge variant="secondary" className="text-xs">
                {divisions.length}개 디비전
              </Badge>
            </div>
            <Button type="button" onClick={() => openDivisionModal()}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              디비전 추가
            </Button>
          </div>

          {isDivisionLoading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : divisions.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Layers className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>등록된 디비전이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              <div className="grid grid-cols-[70px_1.5fr_2fr_90px_90px_100px] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800">
                <span className="text-center">레벨</span>
                <span>디비전명</span>
                <span>설명</span>
                <span className="text-center">최대 팀</span>
                <span className="text-center">현재 팀</span>
                <span className="text-center">관리</span>
              </div>

              {[...divisions]
                .sort((left, right) => left.sortOrder - right.sortOrder)
                .map((division) => (
                  <div
                    key={division.id}
                    className="grid cursor-pointer grid-cols-[70px_1.5fr_2fr_90px_90px_100px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    onClick={() => selectDivision(division)}
                  >
                    <span className="text-center">
                      <Badge className="bg-blue-100 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">DIV {division.level}</Badge>
                    </span>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{division.name}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </div>
                    <span className="truncate text-sm text-slate-500 dark:text-slate-400">{division.description || '-'}</span>
                    <span className="text-center text-sm text-slate-600 dark:text-slate-400">{division.maxTeams ?? '-'}</span>
                    <span className="text-center">
                      <Badge variant="secondary" className="text-xs">
                        {division.teamDivisions?.length ?? 0}
                      </Badge>
                    </span>
                    <div className="flex items-center justify-center gap-1" onClick={(event) => event.stopPropagation()}>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => openDivisionModal(division)} title="수정" aria-label="디비전 수정">
                        <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => {
                          setDeleteTarget({ type: 'division', id: division.id, name: division.name });
                          setIsDeleteModalOpen(true);
                        }}
                        title="삭제"
                        aria-label="디비전 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}

      {view === 'teams' && selectedLeague && selectedDivision && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => goBackToDivisions()} aria-label="디비전 목록으로 돌아가기">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {selectedDivision.name}
                  <span className="ml-2 text-sm font-normal text-slate-400">(DIV {selectedDivision.level})</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedLeague.name} · {selectedLeague.season} {selectedLeague.year}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {teamDivisions.length}/{selectedDivision.maxTeams ?? '-'}팀
              </Badge>
            </div>
            <Button type="button" onClick={() => openTeamModal()}>
              <Link2 className="mr-1 h-4 w-4" aria-hidden="true" />
              팀 배치 추가
            </Button>
          </div>

          {isTeamLoading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : teamDivisions.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="mx-auto mb-3 h-12 w-12 opacity-30" />
              <p>배치된 팀이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              <div className="grid grid-cols-[70px_1.5fr_1.2fr_100px_100px] gap-3 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800">
                <span className="text-center">시드</span>
                <span>팀명</span>
                <span>클럽</span>
                <span className="text-center">배치일</span>
                <span className="text-center">관리</span>
              </div>

              {[...teamDivisions]
                .sort((left, right) => (left.seed ?? 999) - (right.seed ?? 999))
                .map((teamDivision) => (
                  <div
                    key={teamDivision.id}
                    className="grid grid-cols-[70px_1.5fr_1.2fr_100px_100px] items-center gap-3 px-4 py-3"
                  >
                    <span className="text-center text-sm font-medium text-slate-900 dark:text-white">{teamDivision.seed ?? '-'}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{teamDivision.teamName}</p>
                      <p className="text-xs text-slate-500">{teamDivision.division || '부문 미지정'}</p>
                    </div>
                    <span className="truncate text-sm text-slate-600 dark:text-slate-400">{teamDivision.clubName}</span>
                    <span className="text-center text-xs text-slate-500">{formatDate(teamDivision.joinedAt)}</span>
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDeleteTarget({ type: 'team', id: teamDivision.id, name: teamDivision.teamName });
                          setIsDeleteModalOpen(true);
                        }}
                        aria-label={`${teamDivision.teamName} 배치 해제`}
                      >
                        배치 해제
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}

      <Modal isOpen={isLeagueModalOpen} onClose={() => setIsLeagueModalOpen(false)} size="lg">
        <ModalHeader title={editingLeague ? '리그 수정' : '리그 추가'} />
        <ModalBody>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  리그명 <span className="text-red-500">*</span>
                </label>
                <Input value={leagueForm.name} onChange={(event) => setLeagueForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  시즌 <span className="text-red-500">*</span>
                </label>
                <Input value={leagueForm.season} onChange={(event) => setLeagueForm((prev) => ({ ...prev, season: event.target.value }))} placeholder="예: 2026 Spring" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">연도</label>
                <Input
                  type="number"
                  value={leagueForm.year}
                  onChange={(event) => setLeagueForm((prev) => ({ ...prev, year: Number(event.target.value) || new Date().getFullYear() }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">연령대</label>
                <select
                  value={leagueForm.ageGroup}
                  onChange={(event) => setLeagueForm((prev) => ({ ...prev, ageGroup: event.target.value as AgeGroup }))}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">전체</option>
                  <option value="U9">U9</option>
                  <option value="U12">U12</option>
                  <option value="U15">U15</option>
                  <option value="U18">U18</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">지역</label>
                <Input value={leagueForm.region} onChange={(event) => setLeagueForm((prev) => ({ ...prev, region: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">상태</label>
                <select
                  value={leagueForm.status}
                  onChange={(event) => setLeagueForm((prev) => ({ ...prev, status: event.target.value as LeagueStatus }))}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  {LEAGUE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {LEAGUE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">시작일</label>
                <Input
                  type="date"
                  value={leagueForm.startDate}
                  onChange={(event) => setLeagueForm((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">종료일</label>
                <Input type="date" value={leagueForm.endDate} onChange={(event) => setLeagueForm((prev) => ({ ...prev, endDate: event.target.value }))} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">설명</label>
              <Textarea value={leagueForm.description} onChange={(event) => setLeagueForm((prev) => ({ ...prev, description: event.target.value }))} rows={4} />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setIsLeagueModalOpen(false)}>
            취소
          </Button>
          <Button type="button" onClick={() => saveLeague()} disabled={isSaving}>
            {isSaving ? '저장 중...' : editingLeague ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={isDivisionModalOpen} onClose={() => setIsDivisionModalOpen(false)} size="lg">
        <ModalHeader title={editingDivision ? '디비전 수정' : '디비전 추가'} />
        <ModalBody>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  디비전명 <span className="text-red-500">*</span>
                </label>
                <Input value={divisionForm.name} onChange={(event) => setDivisionForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">레벨</label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={divisionForm.level}
                  onChange={(event) => setDivisionForm((prev) => ({ ...prev, level: Number(event.target.value) || 1 }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">최대 팀 수</label>
                <Input
                  type="number"
                  min={1}
                  value={divisionForm.maxTeams}
                  onChange={(event) => setDivisionForm((prev) => ({ ...prev, maxTeams: Number(event.target.value) || 1 }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">정렬 순서</label>
                <Input
                  type="number"
                  min={0}
                  value={divisionForm.sortOrder}
                  onChange={(event) => setDivisionForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) || 0 }))}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">설명</label>
              <Textarea
                value={divisionForm.description}
                onChange={(event) => setDivisionForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={4}
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setIsDivisionModalOpen(false)}>
            취소
          </Button>
          <Button type="button" onClick={() => saveDivision()} disabled={isSaving}>
            {isSaving ? '저장 중...' : editingDivision ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={isTeamModalOpen} onClose={() => setIsTeamModalOpen(false)} size="lg">
        <ModalHeader title="팀 배치 추가" />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                팀 선택 <span className="text-red-500">*</span>
              </label>
              <select
                value={teamAssignmentForm.teamId}
                onChange={(event) => setTeamAssignmentForm((prev) => ({ ...prev, teamId: event.target.value }))}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">배치할 팀을 선택하세요</option>
                {availableTeamOptions.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} / {team.club.clubName} / {team.division || '부문 미지정'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">시드</label>
              <Input
                type="number"
                min={1}
                value={teamAssignmentForm.seed}
                onChange={(event) => setTeamAssignmentForm((prev) => ({ ...prev, seed: event.target.value }))}
                placeholder="선택 입력"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setIsTeamModalOpen(false)}>
            취소
          </Button>
          <Button type="button" onClick={() => saveTeamAssignment()} disabled={isSaving}>
            {isSaving ? '저장 중...' : '배치하기'}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        title="삭제하시겠습니까?"
        description={deleteTarget ? `${deleteTarget.name} 항목이 삭제됩니다.` : ''}
        confirmText="삭제하기"
        cancelText="취소"
        variant="danger"
      />
    </div>
  );
}
