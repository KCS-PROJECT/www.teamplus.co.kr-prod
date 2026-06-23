'use client';

/**
 * /dashboard/academies/[academyId] — 오픈클래스 상세
 *
 * 데이터:
 *  - GET /api/v1/academies/:academyId           → 기본 정보 + director + coaches
 *  - GET /api/v1/academies/:academyId/members   → 수강생 목록
 *  - GET /api/v1/academies/:academyId/classes   → 수업 목록
 *
 * 디자인: /dashboard/teams/[teamId] 와 동일 톤 (감독/코치/수강생/수업 카드).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users, Shield, Sparkles, CalendarDays } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { api } from '@/services/api-client';

interface AcademyDetail {
  id: string;
  name: string;
  code: string;
  region: string | null;
  description: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
  director?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  coaches?: Array<{
    id: string;
    userId?: string;
    user?: {
      id?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    } | null;
  }>;
}

interface MemberItem {
  id: string;
  playerName?: string;
  approvalStatus?: string;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    userType?: string | null;
  } | null;
}

interface ClassItem {
  id: string;
  className: string;
  coach?: string;
  trainingType?: string | null;
  category?: string | null;
}

export default function AcademyDetailPage() {
  const params = useParams<{ academyId: string }>();
  const academyId = params?.academyId;

  const [academy, setAcademy] = useState<AcademyDetail | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!academyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [detailRes, membersRes, classesRes] = await Promise.all([
          api.get<AcademyDetail | { data: AcademyDetail }>(`/academies/${academyId}`),
          api
            .get<
              | MemberItem[]
              | { data?: MemberItem[]; members?: MemberItem[]; total?: number }
            >(`/academies/${academyId}/members`)
            .catch(() => null),
          api
            .get<ClassItem[] | { data?: ClassItem[]; classes?: ClassItem[] }>(
              `/academies/${academyId}/classes`,
            )
            .catch(() => null),
        ]);
        if (cancelled) return;
        const detail =
          (detailRes as { data?: AcademyDetail })?.data ??
          (detailRes as AcademyDetail);

        const memList: MemberItem[] = Array.isArray(membersRes)
          ? membersRes
          : Array.isArray((membersRes as { members?: MemberItem[] })?.members)
            ? (membersRes as { members: MemberItem[] }).members
            : Array.isArray((membersRes as { data?: MemberItem[] })?.data)
              ? (membersRes as { data: MemberItem[] }).data
              : [];

        const clsList: ClassItem[] = Array.isArray(classesRes)
          ? classesRes
          : Array.isArray((classesRes as { classes?: ClassItem[] })?.classes)
            ? (classesRes as { classes: ClassItem[] }).classes
            : Array.isArray((classesRes as { data?: ClassItem[] })?.data)
              ? (classesRes as { data: ClassItem[] }).data
              : [];

        setAcademy(detail);
        setMembers(memList);
        setClasses(clsList);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : '오픈클래스 정보를 불러오지 못했습니다.',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  if (isLoading) return <LoadingSpinner message="오픈클래스 정보를 불러오는 중..." />;

  if (error || !academy) {
    return (
      <div className="space-y-6 pb-10">
        <Link
          href="/dashboard/academies"
          className="inline-flex items-center text-sm text-slate-500 hover:text-primary"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> 오픈클래스 목록으로
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error ?? '오픈클래스를 찾을 수 없습니다.'}
        </div>
      </div>
    );
  }

  const directorName = academy.director
    ? `${academy.director.lastName ?? ''}${academy.director.firstName ?? ''}`.trim()
    : '-';

  return (
    <div className="space-y-6 pb-10">
      <Link
        href="/dashboard/academies"
        className="inline-flex items-center text-sm text-slate-500 hover:text-primary"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> 오픈클래스 목록으로
      </Link>

      {/* 오픈클래스 정보 */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {academy.name}
          </h1>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary/10 text-primary text-sm font-bold tracking-wider">
            {academy.code}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            오픈클래스
          </span>
        </div>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
          {academy.region && `${academy.region}`}
          {academy.region && academy.description ? ' · ' : ''}
          {academy.description ?? ''}
        </p>
      </div>

      {/* 감독 카드 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">감독</h2>
        </div>
        {!academy.director ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            등록된 감독이 없습니다.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 text-sm">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">
                {directorName || '-'}
              </span>
              {academy.director.email && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {academy.director.email}
                </p>
              )}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ACADEMY_DIRECTOR
            </span>
          </div>
        )}
      </Card>

      {/* 코치 카드 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            코치 ({(academy.coaches ?? []).length})
          </h2>
        </div>
        {(academy.coaches ?? []).length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">등록된 코치가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {(academy.coaches ?? []).map((c) => {
              const name = `${c.user?.lastName ?? ''}${c.user?.firstName ?? ''}`.trim();
              return (
                <li
                  key={c.id}
                  className="py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {name || '-'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {c.user?.email ?? '-'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 수강생 카드 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            수강생 ({members.length})
          </h2>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            등록된 수강생이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {members.map((m) => {
              const name =
                m.playerName ??
                `${m.user?.lastName ?? ''}${m.user?.firstName ?? ''}`.trim();
              return (
                <div
                  key={m.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs"
                >
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    {name || '-'}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    {m.user?.userType ?? '-'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 수업 카드 */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            수업 ({classes.length})
          </h2>
        </div>
        {classes.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            등록된 수업이 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {classes.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {c.className}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {c.trainingType ?? c.category ?? '-'}
                    {c.coach ? ` · ${c.coach}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
