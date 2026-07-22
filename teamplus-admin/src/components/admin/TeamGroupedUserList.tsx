'use client';

/**
 * TeamGroupedUserList — 팀별 그룹 표시 + 사용자 관리 (수정/삭제)
 *
 * 사용처: /dashboard/directors, /coaches, /parents, /members
 *
 * 기능:
 *  - GET /teams 로 활성 팀 조회 → 팀별 섹션 카드
 *  - GET /admin/users?userType=... 로 사용자 조회 → 각 팀에 매칭
 *  - 사용자 행마다 [수정] [삭제] 버튼
 *  - 삭제: PUT /admin/users/:id 호출, 백엔드가 cascade 차단하면 메시지 토스트
 *  - 수정: 인라인 모달 (이름·이메일·전화·메모)
 *  - "팀 미지정" 그룹: 어느 팀에도 매칭되지 않은 사용자
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Users, AlertCircle, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ConfirmModal, Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/services/api-client';

export interface AdminUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  /** 사용자 역할 — 통합 목록(감독/코치)에서 행별 뱃지 구분용 (backend getUsers 응답) */
  userType?: string;
  /** 단일 팀 ID (legacy) */
  teamId?: string;
  /** 다중 팀 ID — 백엔드 admin.service.getUsers 응답 (2026-05-12) */
  teamIds?: string[];
  teamName?: string;
  /** ACADEMY_DIRECTOR 운영 오픈클래스 — 2026-05-13 */
  academyIds?: string[];
  academyNames?: string[];
  academyName?: string;
  /** [추가 2026-05-13] 학부모일 때 등록된 자녀 수 (backend admin.service.getUsers 응답) */
  childrenCount?: number;
  /** [추가 2026-07-22] 학부모일 때 실제 자녀(선수) 목록 — 부모 행 클릭 시 펼침용 */
  children?: Array<{
    id: string;
    name: string;
    koreanAge?: number | null;
    /** 자녀가 소속된 팀 ID들 — 팀 카드별로 그 팀 소속 자녀만 펼치기 위함 */
    teamIds?: string[];
    teamNames?: string[];
  }>;
  /** [추가 2026-05-13] 학생일 때 한국 나이 — 학생관리에서 ID 뒤에 노출 */
  koreanAge?: number | null;
  createdAt?: string;
}

interface Academy {
  id: string;
  name: string;
  code?: string | null;
  isActive?: boolean;
}

interface Team {
  id: string;
  name: string;
  teamCode?: string | null;
  isActive?: boolean;
  _count?: { members?: number; classes?: number };
}

interface Props {
  /** 페이지 타이틀 (예: "감독 관리") */
  title: string;
  /** 부제 — 보통 "전체 {N}명" */
  subtitleSuffix?: string;
  /** 백엔드 admin/users 의 userType 필터 (예: "DIRECTOR", "COACH", "PARENT", "TEEN,CHILD") */
  userType: string;
  /** 역할 라벨 (예: "감독", "코치", "학부모", "학생") */
  roleLabel: string;
  /** 카드 좌측 line 색상 (Tailwind class) */
  accentClass?: string;
}

interface ApiWrap<T> { success?: boolean; data?: T }

function unwrap<T>(payload: unknown): T | null {
  if (Array.isArray(payload)) return payload as unknown as T;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return ((payload as ApiWrap<T>).data ?? null) as T | null;
  }
  return (payload ?? null) as T | null;
}

function pickName(u: AdminUser): string {
  return (u.name ?? `${u.lastName ?? ''}${u.firstName ?? ''}`.trim()) || '-';
}

/** 행 정렬 우선순위 — 감독 먼저, 그다음 오픈클래스 감독, 코치 순 (그 외는 뒤). */
const ROLE_ORDER: Record<string, number> = {
  DIRECTOR: 0,
  ACADEMY_DIRECTOR: 1,
  COACH: 2,
};
const sortByRole = (a: AdminUser, b: AdminUser): number => {
  const roleDiff =
    (ROLE_ORDER[a.userType ?? ''] ?? 9) - (ROLE_ORDER[b.userType ?? ''] ?? 9);
  if (roleDiff !== 0) return roleDiff;
  // 같은 역할 내에서는 가입일 오래된 순(createdAt 오름차순) — 학부모/선수 정렬 기준.
  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return ta - tb;
};

/** 역할별 뱃지 라벨·색상·좌측 라인 — 감독/코치 통합 목록에서 행별 구분용. */
const USERTYPE_META: Record<
  string,
  { label: string; badge: string; accent: string }
> = {
  DIRECTOR: {
    label: '감독',
    badge:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-900/40',
    accent: 'border-l-rose-500/70',
  },
  ACADEMY_DIRECTOR: {
    label: '오픈클래스 감독',
    badge:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/40',
    accent: 'border-l-amber-500/70',
  },
  COACH: {
    label: '코치',
    badge:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/40',
    accent: 'border-l-blue-500/70',
  },
  PARENT: {
    label: '학부모',
    badge:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/40',
    accent: 'border-l-emerald-500/70',
  },
  TEEN: {
    label: '선수',
    badge:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/40',
    accent: 'border-l-amber-500/70',
  },
  CHILD: {
    label: '선수',
    badge:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/40',
    accent: 'border-l-amber-500/70',
  },
};

export function TeamGroupedUserList({
  title,
  subtitleSuffix,
  userType,
  roleLabel,
  accentClass = 'border-l-slate-400',
}: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // 부모 행 펼침 — 클릭한 학부모의 실제 자녀(선수) 목록 인라인 표시
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpand = (id: string) =>
    setExpandedId((cur) => (cur === id ? null : id));

  // 수정/삭제 modal 상태
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // [수정 2026-05-13] /academies 도 함께 조회 — ACADEMY_DIRECTOR 의 오픈클래스 그룹 노출용.
      //  코치관리(userType 에 ACADEMY_DIRECTOR 포함) 페이지에서만 useful 하지만, 다른 페이지에서도
      //  ACADEMY_DIRECTOR 가 학부모를 두면 동일하게 필요. 항상 조회.
      const [teamsRes, usersRes, academiesRes] = await Promise.all([
        api.get<Team[] | { data?: Team[] }>('/teams', { params: { limit: 200 } }),
        api.get<AdminUser[] | { data?: AdminUser[] }>('/admin/users', {
          params: { userType, limit: 1000 },
        }),
        // [수정 2026-05-13] /academies 는 admin 전용 collection GET 없음 → /academies/public 사용
        //  (비로그인도 가능한 공개 endpoint 라 admin 권한과 무관하게 OK).
        api
          .get<Academy[] | { data?: Academy[]; academies?: Academy[] }>(
            '/academies/public',
            { params: { limit: 200 } },
          )
          .catch(() => null),
      ]);
      const tlist = Array.isArray(teamsRes) ? teamsRes : unwrap<Team[]>(teamsRes) ?? [];
      const ulist = Array.isArray(usersRes) ? usersRes : unwrap<AdminUser[]>(usersRes) ?? [];
      const aRaw = academiesRes;
      const alist: Academy[] = Array.isArray(aRaw)
        ? aRaw
        : aRaw && typeof aRaw === 'object'
          ? (
              ('academies' in (aRaw as Record<string, unknown>) &&
                Array.isArray((aRaw as { academies?: Academy[] }).academies)
                  ? (aRaw as { academies: Academy[] }).academies
                  : null) ||
              unwrap<Academy[]>(aRaw) ||
              []
            )
          : [];
      setTeams(tlist.filter((t) => t.isActive !== false));
      setAcademies(alist.filter((a) => a.isActive !== false));
      setUsers(ulist);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [userType]);

  useEffect(() => { void load(); }, [load]);

  // 검색 매칭 사용자 풀
  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      pickName(u).toLowerCase().includes(q) ||
      (u.email?.toLowerCase().includes(q) ?? false) ||
      (u.phone?.toLowerCase().includes(q) ?? false) ||
      (u.teamName?.toLowerCase().includes(q) ?? false),
    );
  }, [users, searchTerm]);

  // 팀별 그룹핑 — teamIds 배열 우선, fallback to teamId/teamName, 없으면 __none__.
  //  [수정 2026-05-13] ACADEMY_DIRECTOR 처럼 team 없이 academy 만 운영하는 사용자도 그룹 표시.
  //   academy 그룹은 'academy:<id>' 키로 별도 보관.
  const groupedByTeam = useMemo(() => {
    const m = new Map<string, AdminUser[]>();
    const teamIdSet = new Set(teams.map((t) => t.id));
    const academyIdSet = new Set(academies.map((a) => a.id));
    for (const u of filteredUsers) {
      const teamIds = (u.teamIds && u.teamIds.length > 0)
        ? u.teamIds
        : (u.teamId ? [u.teamId] : []);
      const matchedTeams = teamIds.filter((id) => teamIdSet.has(id));
      const matchedAcademies = (u.academyIds ?? []).filter((id) => academyIdSet.has(id));
      if (matchedTeams.length === 0 && matchedAcademies.length === 0) {
        const arr = m.get('__none__') ?? [];
        arr.push(u);
        m.set('__none__', arr);
        continue;
      }
      for (const tid of matchedTeams) {
        const arr = m.get(tid) ?? [];
        arr.push(u);
        m.set(tid, arr);
      }
      for (const aid of matchedAcademies) {
        const key = `academy:${aid}`;
        const arr = m.get(key) ?? [];
        arr.push(u);
        m.set(key, arr);
      }
    }
    // [학부모/선수 통합] 부모 펼침으로 보이는 자녀(선수)는 최상위 목록에서 제외 — 팀 카드별로.
    //   (그 카드에 부모가 함께 있는 선수만 숨김. 부모가 없는 선수는 그대로 표시해 누락 방지.)
    // 이어서 각 그룹 내 역할 우선 정렬(감독 → 오픈클래스 감독 → 코치).
    for (const [key, arr] of m.entries()) {
      const teamId =
        key === '__none__' || key.startsWith('academy:') ? null : key;
      const parentChildIds = new Set<string>();
      for (const u of arr) {
        if (u.userType !== 'PARENT') continue;
        for (const k of u.children ?? []) {
          // 이 카드(팀)에 소속된 자녀만 — 자녀가 여러 팀이어도 카드별로 분리.
          if (!teamId || (k.teamIds ?? []).includes(teamId)) {
            parentChildIds.add(k.id);
          }
        }
      }
      const filtered = arr.filter(
        (u) =>
          !(
            (u.userType === 'TEEN' || u.userType === 'CHILD') &&
            parentChildIds.has(u.id)
          ),
      );
      filtered.sort(sortByRole);
      m.set(key, filtered);
    }
    return m;
  }, [filteredUsers, teams, academies]);

  const handleEdit = (u: AdminUser) => {
    setEditing(u);
    setEditForm({
      name: pickName(u),
      email: u.email ?? '',
      phone: u.phone ?? '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setIsSaving(true);
    try {
      const body: Record<string, string> = {};
      if (editForm.name) {
        // 이름은 lastName/firstName 으로 분리해서 전송 (백엔드 호환).
        const [last, ...rest] = editForm.name.split(' ');
        body.lastName = last ?? '';
        body.firstName = rest.join(' ');
        if (!body.firstName) {
          // 분리 안 되면 name 한 글자씩 분리 시도 (이름 1자 + 성씨 1자)
          if (editForm.name.length >= 2) {
            body.lastName = editForm.name[0];
            body.firstName = editForm.name.slice(1);
          }
        }
      }
      if (editForm.email) body.email = editForm.email;
      if (editForm.phone) body.phone = editForm.phone;
      await api.put(`/admin/users/${editing.id}`, body);
      setActionMsg({ type: 'success', text: `${roleLabel} 정보가 수정되었습니다.` });
      setEditing(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '수정에 실패했습니다.';
      setActionMsg({ type: 'error', text: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await api.delete(`/admin/users/${deleting.id}`);
      setActionMsg({ type: 'success', text: `${roleLabel}이(가) 삭제되었습니다.` });
      setDeleting(null);
      await load();
    } catch (e) {
      // 백엔드 cascade 차단 메시지 우선
      // axios/api 에러 객체 형태 폴백
      let msg = `${roleLabel} 삭제에 실패했습니다.`;
      if (e && typeof e === 'object') {
        const anyE = e as { response?: { data?: { message?: string } }; message?: string };
        msg = anyE.response?.data?.message ?? anyE.message ?? msg;
      }
      setActionMsg({ type: 'error', text: msg });
      setDeleting(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <LoadingSpinner message={`${roleLabel} 목록을 불러오는 중...`} />;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="rounded-2xl bg-primary text-white shadow-md p-6 sm:p-7">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-white/80">
          {subtitleSuffix ?? `전체 ${users.length}명 · 활성 팀 ${teams.length}개`}
        </p>
      </section>

      {/* 알림 */}
      {actionMsg && (
        <div
          role="alert"
          className={`rounded-lg border p-3 text-sm font-semibold ${
            actionMsg.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="flex-1">{actionMsg.text}</span>
            <button
              type="button"
              onClick={() => setActionMsg(null)}
              className="text-xs opacity-70 hover:opacity-100"
              aria-label="알림 닫기"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Search className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          placeholder={`팀명, ${roleLabel}명, 이메일, 연락처 검색`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          aria-label={`${roleLabel} 검색`}
        />
      </div>

      {/* Body */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {teams.map((team) => {
            const members = groupedByTeam.get(team.id) ?? [];
            const teamLabel = team.teamCode ? `${team.name} (${team.teamCode})` : team.name;
            return (
              <section
                key={team.id}
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                aria-label={`${team.name} 소속 ${roleLabel} 목록`}
              >
                {/* Team header */}
                <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">{teamLabel}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {roleLabel} {members.length}명
                      </p>
                    </div>
                  </div>
                  <a
                    href={`/dashboard/teams/${team.id}`}
                    className="text-xs font-semibold text-primary hover:underline shrink-0"
                  >
                    팀 상세 →
                  </a>
                </header>

                {/* Members list */}
                {members.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    등록된 {roleLabel}이(가) 없습니다
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {members.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        roleLabel={roleLabel}
                        accentClass={accentClass}
                        groupTeamId={team.id}
                        isExpanded={expandedId === u.id}
                        onToggleExpand={() => toggleExpand(u.id)}
                        onEdit={() => handleEdit(u)}
                        onDelete={() => setDeleting(u)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {/* [추가 2026-05-13] 오픈클래스(Academy) 그룹 — ACADEMY_DIRECTOR 가 운영. */}
          {academies.map((academy) => {
            const key = `academy:${academy.id}`;
            const members = groupedByTeam.get(key) ?? [];
            if (members.length === 0) return null;
            return (
              <section
                key={key}
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
                aria-label={`${academy.name} 소속 ${roleLabel} 목록`}
              >
                <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300">
                      <Users className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">
                        {academy.name}
                        <span className="ml-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                          오픈클래스
                        </span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {roleLabel} {members.length}명
                      </p>
                    </div>
                  </div>
                </header>
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {members.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      roleLabel={roleLabel}
                      accentClass={accentClass}
                      isExpanded={expandedId === u.id}
                      onToggleExpand={() => toggleExpand(u.id)}
                      onEdit={() => handleEdit(u)}
                      onDelete={() => setDeleting(u)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          {/* 팀 미지정 그룹 */}
          {(groupedByTeam.get('__none__') ?? []).length > 0 && (
            <section className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <header className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500">
                  <Users className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">소속 팀 없음</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {roleLabel} {(groupedByTeam.get('__none__') ?? []).length}명
                  </p>
                </div>
              </header>
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {(groupedByTeam.get('__none__') ?? []).map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    roleLabel={roleLabel}
                    accentClass={accentClass}
                    isExpanded={expandedId === u.id}
                    onToggleExpand={() => toggleExpand(u.id)}
                    onEdit={() => handleEdit(u)}
                    onDelete={() => setDeleting(u)}
                  />
                ))}
              </ul>
            </section>
          )}

          {teams.length === 0 && (groupedByTeam.get('__none__') ?? []).length === 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-10 text-center text-slate-500 dark:text-slate-400">
              등록된 {roleLabel}이(가) 없습니다
            </div>
          )}
        </div>
      )}

      {/* 수정 Modal */}
      {editing && (
        <Modal isOpen={!!editing} onClose={() => setEditing(null)} size="md">
          <ModalHeader title={`${roleLabel} 정보 수정`} />
          <ModalBody>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">이름</label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">이메일</label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">연락처</label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>취소</Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? '저장 중...' : '저장하기'}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* 삭제 ConfirmModal */}
      <ConfirmModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleConfirmDelete}
        title={`${roleLabel}을(를) 삭제하시겠습니까?`}
        description={
          deleting
            ? `${pickName(deleting)}${roleLabel === '학생' ? '' : ` (${deleting.email})`} 회원을 삭제합니다.\n\n주의: 소속 팀에 코치/학부모/학생이 있으면 삭제되지 않습니다.`
            : ''
        }
        confirmText={isDeleting ? '삭제 중...' : '삭제하기'}
        variant="danger"
      />
    </div>
  );
}

interface UserRowProps {
  user: AdminUser;
  roleLabel: string;
  accentClass: string;
  /** 현재 팀 카드 ID — 부모 펼침 시 이 팀에 소속된 자녀만 표시 (미지정/오픈클래스는 undefined) */
  groupTeamId?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function UserRow({
  user,
  roleLabel,
  accentClass,
  groupTeamId,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
}: UserRowProps) {
  // 역할별 부가 표기 (통합 목록에서는 userType 우선):
  //  · 학부모 → "자녀 N명" 칩 + 행 클릭 시 이 팀 소속 자녀(선수) 펼침
  //  · 선수   → 로그인 미사용(내부 식별자)이라 email 숨기고 나이만 노출
  const isParentRow = user.userType === 'PARENT' || roleLabel === '학부모';
  const isStudent =
    user.userType === 'TEEN' || user.userType === 'CHILD' || roleLabel === '학생';
  const kids = user.children ?? [];
  // 이 팀 카드에 소속된 자녀만 (미지정/오픈클래스 그룹은 전체)
  const visibleKids = groupTeamId
    ? kids.filter((k) => (k.teamIds ?? []).includes(groupTeamId))
    : kids;
  const childrenCount = visibleKids.length;
  const canExpand = isParentRow && visibleKids.length > 0;
  const age = user.koreanAge ?? null;
  // 사용자 실제 역할(userType) 기반 뱃지·라인 — 없으면 페이지 기본값 폴백.
  const meta = user.userType ? USERTYPE_META[user.userType] : undefined;
  const badgeLabel = meta?.label ?? roleLabel;
  const badgeCls =
    meta?.badge ??
    'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600';
  const lineCls = meta?.accent ?? accentClass;
  return (
    <>
      <li className={`flex items-center gap-3 px-5 py-3 border-l-[3px] ${lineCls} hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none`}>
        <div
          className={`min-w-0 flex-1 ${canExpand ? 'cursor-pointer' : ''}`}
          onClick={canExpand ? onToggleExpand : undefined}
          role={canExpand ? 'button' : undefined}
          tabIndex={canExpand ? 0 : undefined}
          aria-expanded={canExpand ? !!isExpanded : undefined}
          onKeyDown={
            canExpand
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleExpand?.();
                  }
                }
              : undefined
          }
        >
          <div className="flex items-center gap-2 flex-wrap">
            {canExpand && (
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform motion-reduce:transition-none ${isExpanded ? '' : '-rotate-90'}`}
                aria-hidden="true"
              />
            )}
            <span className="text-sm font-bold text-slate-900 dark:text-white">{pickName(user)}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${badgeCls}`}>
              {badgeLabel}
            </span>
            {isParentRow && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40">
                자녀 {childrenCount}명
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            {isStudent ? (
              age != null && (
                <span className="text-amber-700 dark:text-amber-400 font-semibold tabular-nums">
                  {age}세
                </span>
              )
            ) : (
              user.email && <span className="truncate">{user.email}</span>
            )}
            {user.phone && <span>· {user.phone}</span>}
            {user.createdAt && (
              <span>· 가입 {new Date(user.createdAt).toLocaleDateString('ko-KR')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-primary hover:bg-primary/10 transition-colors motion-reduce:transition-none"
            aria-label={`${pickName(user)} 수정`}
            title="수정"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors motion-reduce:transition-none"
            aria-label={`${pickName(user)} 삭제`}
            title="삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </li>

      {/* 부모 펼침 — 이 팀 카드에 소속된 자녀(선수) 목록 */}
      {canExpand && isExpanded && (
        <li className="border-l-[3px] border-l-emerald-500/40 bg-slate-50/70 dark:bg-slate-900/30 px-5 py-2.5">
          <p className="mb-1.5 pl-6 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            소속 선수 {visibleKids.length}명
          </p>
          <ul className="space-y-1 pl-6">
            {visibleKids.map((k) => (
              <li key={k.id} className="flex items-center gap-2 flex-wrap text-xs">
                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/40">
                  선수
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{k.name || '-'}</span>
                {k.koreanAge != null && (
                  <span className="text-slate-500 dark:text-slate-400 tabular-nums">{k.koreanAge}세</span>
                )}
                {k.teamNames && k.teamNames.length > 0 && (
                  <span className="text-slate-400 dark:text-slate-500">· {k.teamNames.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        </li>
      )}
    </>
  );
}
