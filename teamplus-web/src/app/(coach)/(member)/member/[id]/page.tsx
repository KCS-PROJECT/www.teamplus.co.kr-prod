'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { api } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
interface MemberInfo {
  id: string;
  name: string;
  age: number;
  classLevel: string;
  classLevelColor: string;
  avatar?: string;
}

interface Stats {
  attendanceRate: number;
  remainingCredits: number;
  totalClasses: number;
}

interface ContactInfo {
  label: string;
  phone: string;
  icon: string;
  isEmergency?: boolean;
}

interface AttendanceRecord {
  id: string;
  date: string;
  month: string;
  day: string;
  className: string;
  time: string;
  status: 'present' | 'absent';
}

const CLASS_LEVEL_COLOR = 'bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800 text-ice-500 dark:text-blue-300';

function ProfileHeader({ member }: { member: MemberInfo }) {
  return (
    <section className="flex flex-col items-center gap-4 py-4">
      <div className="relative group cursor-pointer">
        {/* Avatar with ring */}
        <div className="relative bg-wline dark:bg-rink-700 aspect-square bg-cover rounded-w-pill h-28 w-28 ring-4 ring-white dark:ring-rink-800 shadow-md flex items-center justify-center">
          <Icon name="person" className="text-5xl text-wtext-3" />
        </div>
        {/* Skating badge */}
        <div className="absolute bottom-0 right-0 bg-white dark:bg-rink-800 p-1.5 rounded-w-pill shadow-md border border-wline-2 dark:border-rink-700">
          <Icon name="ice_skating" className="text-ice-500 text-[20px]" />
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-wtext-1 dark:text-white text-2xl font-extrabold tracking-tight">
            {member.name}{' '}
            <span className="text-card-title font-medium text-wtext-3 dark:text-rink-300">
              ({member.age}세)
            </span>
          </h1>
        </div>
        <div
          className={`inline-flex items-center px-3 py-1 rounded-w-pill border text-card-body font-bold ${member.classLevelColor}`}
        >
          {member.classLevel}
        </div>
      </div>
    </section>
  );
}

function StatsGrid({ stats }: { stats: Stats }) {
  return (
    <section
      className="grid grid-cols-3 gap-3"
      role="list"
      aria-label="회원 통계 요약"
    >
      {/* Attendance Rate */}
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white dark:bg-rink-800 p-4 shadow-sm border border-transparent dark:border-rink-700"
        role="listitem"
        aria-label={`출석률 ${stats.attendanceRate}%`}
      >
        <div className="flex items-center gap-1 text-wtext-3 dark:text-rink-300 mb-1">
          <Icon name="pie_chart" className="text-[16px]" aria-hidden="true" />
          <p className="text-card-meta font-medium">출석률</p>
        </div>
        <p className="text-emerald-500 text-2xl font-extrabold tracking-tight">
          {stats.attendanceRate}%
        </p>
      </div>

      {/* Remaining Credits - Highlighted */}
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white dark:bg-rink-800 p-4 shadow-sm ring-1 ring-ice-500/20 dark:ring-ice-500/40 relative overflow-hidden"
        role="listitem"
        aria-label={`남은 수업 횟수 ${stats.remainingCredits}회`}
      >
        <div className="absolute top-0 right-0 p-1" aria-hidden="true">
          <div className="size-1.5 rounded-w-pill bg-red-500 animate-pulse motion-reduce:animate-none"></div>
        </div>
        <div className="flex items-center gap-1 text-ice-500 dark:text-blue-300 mb-1">
          <Icon name="hourglass_top" className="text-[16px]" aria-hidden="true" />
          <p className="text-card-meta font-bold">남은 횟수</p>
        </div>
        <p className="text-ice-500 dark:text-blue-400 text-2xl font-extrabold tracking-tight">
          {stats.remainingCredits}회
        </p>
      </div>

      {/* Total Classes */}
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white dark:bg-rink-800 p-4 shadow-sm border border-transparent dark:border-rink-700"
        role="listitem"
        aria-label={`총 수강 ${stats.totalClasses}회`}
      >
        <div className="flex items-center gap-1 text-wtext-3 dark:text-rink-300 mb-1">
          <Icon name="history" className="text-[16px]" aria-hidden="true" />
          <p className="text-card-meta font-medium">총 수강</p>
        </div>
        <p className="text-wtext-1 dark:text-white text-2xl font-extrabold tracking-tight">
          {stats.totalClasses}회
        </p>
      </div>
    </section>
  );
}

function ContactItem({ contact }: { contact: ContactInfo }) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-wbg dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none group">
      <div
        className={`flex items-center justify-center rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 shrink-0 size-10 ${
          contact.isEmergency
            ? 'group-hover:bg-red-50 dark:group-hover:bg-red-900/20 group-hover:text-red-500'
            : 'group-hover:bg-ice-500/10 group-hover:text-ice-500'
        } transition-colors motion-reduce:transition-none`}
        aria-hidden="true"
      >
        <Icon name={contact.icon} className="text-[20px]" />
      </div>
      <div className="flex flex-col flex-1">
        <p className="text-wtext-1 dark:text-white text-card-emphasis font-semibold">
          {contact.label}
          {contact.isEmergency && <span className="sr-only"> (긴급연락처)</span>}
        </p>
        <p className="text-wtext-3 dark:text-rink-300 text-card-body">{contact.phone}</p>
      </div>
      <button
        type="button"
        aria-label={`${contact.label}에게 전화 걸기, ${contact.phone}`}
        className={`shrink-0 flex items-center justify-center size-10 rounded-w-pill focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none ${
          contact.isEmergency
            ? 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100 hover:bg-red-500 hover:text-white'
            : 'bg-ice-500/10 text-ice-500 dark:bg-ice-500/20 dark:text-blue-300 hover:bg-ice-500 hover:text-white'
        } transition-all motion-reduce:transition-none`}
      >
        <Icon name="call" className="text-[20px]" aria-hidden="true" />
      </button>
    </div>
  );
}

function ContactSection({ contacts }: { contacts: ContactInfo[] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="contact-section-heading">
      <h3
        id="contact-section-heading"
        className="text-wtext-1 dark:text-white text-card-title font-bold px-1"
      >
        연락처 정보
      </h3>
      <ul
        className="flex flex-col rounded-2xl bg-white dark:bg-rink-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 list-none"
        role="list"
        aria-label={`연락처 ${contacts.length}건`}
      >
        {contacts.map((contact, index) => (
          <li key={index} role="listitem">
            <ContactItem contact={contact} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AttendanceItem({ record }: { record: AttendanceRecord }) {
  const isAbsent = record.status === 'absent';

  return (
    <div
      className={`flex items-center justify-between p-4 ${
        isAbsent ? 'bg-wbg/50 dark:bg-rink-700/20' : ''
      }`}
      aria-label={`${record.month}월 ${record.day}일, ${record.className}, ${record.time}, ${isAbsent ? '결석' : '출석'}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex flex-col items-center justify-center rounded-lg w-12 h-12 border ${
            isAbsent
              ? 'bg-white dark:bg-rink-700 border-wline dark:border-rink-700'
              : 'bg-wbg dark:bg-rink-700 border-wline-2 dark:border-rink-700'
          }`}
        >
          <span
            className={`text-card-meta uppercase font-bold ${
              isAbsent
                ? 'text-wtext-3 dark:text-rink-300'
                : 'text-wtext-3 dark:text-rink-300'
            }`}
          >
            {record.month}
          </span>
          <span
            className={`text-card-title font-bold leading-none ${
              isAbsent
                ? 'text-wtext-3 dark:text-rink-300 opacity-60'
                : 'text-wtext-1 dark:text-white'
            }`}
          >
            {record.day}
          </span>
        </div>
        <div className="flex flex-col">
          <p
            className={`font-semibold ${
              isAbsent
                ? 'text-wtext-3 dark:text-rink-300'
                : 'text-wtext-1 dark:text-white'
            }`}
          >
            {record.className}
          </p>
          <p className="text-card-meta text-wtext-3 dark:text-rink-300">{record.time}</p>
        </div>
      </div>
      <div
        className={`flex items-center gap-1.5 px-3 py-1 rounded-w-pill ${
          isAbsent
            ? 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400'
            : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
        }`}
        role="status"
      >
        <Icon
          name={isAbsent ? 'cancel' : 'check_circle'}
          filled={!isAbsent}
          className="text-card-title"
          aria-hidden="true"
        />
        <span className="text-card-meta font-bold">{isAbsent ? '결석' : '출석'}</span>
      </div>
    </div>
  );
}

function AttendanceHistory({ records }: { records: AttendanceRecord[] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="attendance-history-heading">
      <div className="flex justify-between items-center px-1">
        <h3
          id="attendance-history-heading"
          className="text-wtext-1 dark:text-white text-card-title font-bold"
        >
          최근 출석 기록
        </h3>
        <button
          type="button"
          aria-label="출석 기록 전체보기"
          className="text-card-body font-medium text-ice-500 dark:text-blue-400 hover:underline focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none rounded"
        >
          전체보기
        </button>
      </div>
      <ul
        className="flex flex-col rounded-2xl bg-white dark:bg-rink-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 list-none"
        role="list"
        aria-label={`최근 출석 기록 ${records.length}건`}
      >
        {records.map((record) => (
          <li key={record.id} role="listitem">
            <AttendanceItem record={record} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function MemberDetailPage() {
  const { back } = useNavigation();
  const params = useParams();
  const memberId = (params?.id as string) || '';

  // [AppBar 보장 2026-05-12] iPhone/Android 실기/시뮬에서 AppBar safe-area 가
  //   항상 보이도록 Native AppBar 활성. Web 환경에서는 DOM PageAppBar 가 자동 표시.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '회원 상세 정보',
    showBackButton: true,
    showBottomNav: true,
  });

  const [member, setMember] = useState<MemberInfo | null>(null);
  const [stats, setStats] = useState<Stats>({ attendanceRate: 0, remainingCredits: 0, totalClasses: 0 });
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);

  const loadMember = useCallback(async () => {
    if (!memberId) {
      throw new Error('유효하지 않은 회원 ID 입니다.');
    }
    const res = await api.get<{
      id: string; name?: string; firstName?: string; lastName?: string;
      age?: number; birthDate?: string;
      classLevel?: string; level?: string;
      avatarUrl?: string | null;
      attendanceRate?: number; remainingCredits?: number; creditCount?: number; totalClasses?: number;
      parents?: { name?: string; phone?: string; phoneNumber?: string; isEmergency?: boolean }[];
      emergencyContact?: { name?: string; phone?: string; phoneNumber?: string };
    }>(`/admin/users/${memberId}`);

    if (!res.success || !res.data) {
      throw new Error(res.error?.message ?? '회원 정보를 불러올 수 없습니다.');
    }

    const d = res.data;
    const rawName = d.name ?? `${d.lastName ?? ''}${d.firstName ?? ''}`.trim();
    const name = rawName || '이름 미등록';
    let age = d.age ?? 0;
    if (!age && d.birthDate) {
      const birth = new Date(d.birthDate);
      age = new Date().getFullYear() - birth.getFullYear();
    }
    setMember({
      id: d.id,
      name,
      age,
      classLevel: d.classLevel ?? d.level ?? '수강생',
      classLevelColor: CLASS_LEVEL_COLOR,
      avatar: d.avatarUrl ?? undefined,
    });
    setStats({
      attendanceRate: d.attendanceRate ?? 0,
      remainingCredits: d.remainingCredits ?? d.creditCount ?? 0,
      totalClasses: d.totalClasses ?? 0,
    });
    const contactList: ContactInfo[] = [];
    (d.parents ?? []).forEach((p) => {
      contactList.push({
        label: p.isEmergency ? '비상 연락처' : '학부모 연락처',
        phone: p.phone ?? p.phoneNumber ?? '',
        icon: p.isEmergency ? 'medical_services' : 'person',
        isEmergency: p.isEmergency,
      });
    });
    if (d.emergencyContact) {
      contactList.push({
        label: '비상 연락처',
        phone: d.emergencyContact.phone ?? d.emergencyContact.phoneNumber ?? '',
        icon: 'medical_services',
        isEmergency: true,
      });
    }
    setContacts(contactList);
  }, [memberId]);

  const loadAttendance = useCallback(async () => {
    if (!memberId) return;
    try {
      const res = await api.get<{
        records?: { id: string; date?: string; checkedAt?: string; className?: string; startTime?: string; endTime?: string; status?: string; attended?: boolean }[];
        data?: { id: string; date?: string; checkedAt?: string; className?: string; startTime?: string; endTime?: string; status?: string; attended?: boolean }[];
      }>(`/attendance/member/${memberId}?limit=10`);

      if (res.success && res.data) {
        const raw = res.data.records ?? res.data.data ?? [];
        const mapped: AttendanceRecord[] = raw.map((r) => {
          const dateStr = r.date ?? r.checkedAt ?? '';
          const dateObj = dateStr ? new Date(dateStr) : new Date();
          const month = dateObj.toLocaleString('en-US', { month: 'short' });
          const day = String(dateObj.getDate()).padStart(2, '0');
          const isAbsent = r.status === 'absent' || r.attended === false;
          const timeStr = r.startTime && r.endTime ? `${r.startTime} - ${r.endTime}` : isAbsent ? '결석 처리됨' : '';
          return {
            id: r.id,
            date: dateStr,
            month,
            day,
            className: r.className ?? '정규수업',
            time: timeStr,
            status: isAbsent ? 'absent' : 'present',
          };
        });
        setAttendance(mapped);
      }
    } catch {
      // 출석 이력 실패는 비치명적 — 빈 배열 유지
      setAttendance([]);
    }
  }, [memberId]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await loadMember();
      await loadAttendance();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '회원 정보를 불러올 수 없습니다.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [loadMember, loadAttendance]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ─── 로딩 ─────────────────────
  if (isLoading) {
    return (
      <MobileContainer hasBottomNav>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-ice-500 border-t-transparent rounded-w-pill animate-spin" role="status" aria-label="불러오는 중" />
        </div>
      </MobileContainer>
    );
  }

  // ─── 에러 ─────────────────────
  if (error || !member) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="회원 상세 정보" />
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-w-pill flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-red-500" aria-hidden="true" />
          </div>
          <p className="text-card-emphasis font-semibold text-wtext-1 dark:text-white mb-1.5">
            회원 정보를 불러올 수 없습니다.
          </p>
          <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-6 max-w-[260px] leading-relaxed">
            {error ?? '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="h-11 px-5 bg-ice-500 hover:bg-ice-700 text-white text-card-body font-semibold rounded-xl transition-colors motion-reduce:transition-none active:brightness-95"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={() => back()}
              className="h-11 px-5 bg-white dark:bg-rink-800 hover:bg-wbg dark:hover:bg-rink-700 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 text-card-body font-semibold rounded-xl transition-colors motion-reduce:transition-none"
            >
              목록으로
            </button>
          </div>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="회원 상세 정보" />

      {/* Main Content */}
      <main className="flex flex-col gap-6 p-4 pb-30">
        <ProfileHeader member={member} />
        <StatsGrid stats={stats} />
        {contacts.length > 0 && <ContactSection contacts={contacts} />}
        {attendance.length > 0 && <AttendanceHistory records={attendance} />}
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-0 fixed-center-x p-4 bg-wbg/95 dark:bg-rink-900/95 pt-8 z-40">
        <button
          type="button"
          aria-label={`${member.name} 회원 출석 체크하기`}
          className="w-full flex items-center justify-center gap-2 bg-ice-500 hover:bg-ice-500/90 text-white rounded-xl py-4 shadow-md transition-all motion-reduce:transition-none transform active:brightness-95 focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 focus:outline-none"
        >
          <Icon name="edit_calendar" aria-hidden="true" />
          <span className="text-card-emphasis font-bold">출석 체크 하기</span>
        </button>
      </div>
    </MobileContainer>
  );
}
