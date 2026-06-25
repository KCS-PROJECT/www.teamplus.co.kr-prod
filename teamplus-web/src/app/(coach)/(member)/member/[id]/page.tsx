'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';

import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
interface MemberInfo {
  id: string;
  name: string;
  age: number;
  classLevel: string;
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

// ─── 프로필 히어로 — navy 밴드 full-bleed ──────────────
function ProfileHero({ member }: { member: MemberInfo }) {
  return (
    <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pb-7 pt-7 flex flex-col items-center gap-4" aria-label="회원 프로필">
      <div className="relative">
        <div className="relative size-24 rounded-w-pill bg-white/15 dark:bg-white/10 flex items-center justify-center">
          <Icon name="person" className="text-5xl text-white" aria-hidden="true" />
        </div>
        {/* 스케이팅 배지 */}
        <div className="absolute bottom-0 right-0 bg-it-surface dark:bg-rink-800 p-1.5 rounded-w-pill border-[1.5px] border-it-line-strong dark:border-rink-700">
          <Icon name="ice_skating" className="text-it-blue-500 text-[20px]" aria-hidden="true" />
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-2">
        <h1 className="text-white text-2xl font-extrabold tracking-[-0.01em]">
          {member.name}{' '}
          <span className="text-card-title font-medium text-white/70">
            ({member.age}세)
          </span>
        </h1>
        <div className="inline-flex items-center rounded-w-pill bg-white/15 px-3 py-1 text-card-body font-bold text-white">
          {member.classLevel}
        </div>
      </div>
    </section>
  );
}

// ─── 통계 — flat 흰 섹션 (inset 박스) ──────────────────
function StatsGrid({ stats }: { stats: Stats }) {
  return (
    <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5" aria-label="회원 통계 요약">
      <div className="grid grid-cols-3 gap-3" role="list">
        {/* 출석률 */}
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-w-md border-[1.5px] border-it-line bg-it-fill dark:bg-rink-700/40 dark:border-rink-700/50 px-2 py-3.5"
          role="listitem"
          aria-label={`출석률 ${stats.attendanceRate}%`}
        >
          <div className="flex items-center gap-1 text-it-ink-500 dark:text-wtext-4 mb-0.5">
            <Icon name="pie_chart" className="text-[16px]" aria-hidden="true" />
            <p className="text-card-meta font-medium">출석률</p>
          </div>
          <p className="text-it-ink-800 dark:text-white text-2xl font-extrabold font-num tabular-nums">
            {stats.attendanceRate}%
          </p>
        </div>

        {/* 남은 횟수 — 강조 */}
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-w-md border-[1.5px] border-it-blue-500/30 bg-it-blue-50 dark:bg-it-blue-900/30 dark:border-it-blue-500/30 px-2 py-3.5"
          role="listitem"
          aria-label={`남은 수업 횟수 ${stats.remainingCredits}회`}
        >
          <div className="flex items-center gap-1 text-it-blue-500 dark:text-it-blue-300 mb-0.5">
            <Icon name="hourglass_top" className="text-[16px]" aria-hidden="true" />
            <p className="text-card-meta font-bold">남은 횟수</p>
          </div>
          <p className="text-it-blue-500 text-2xl font-extrabold font-num tabular-nums">
            {stats.remainingCredits}회
          </p>
        </div>

        {/* 총 수강 */}
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-w-md border-[1.5px] border-it-line bg-it-fill dark:bg-rink-700/40 dark:border-rink-700/50 px-2 py-3.5"
          role="listitem"
          aria-label={`총 수강 ${stats.totalClasses}회`}
        >
          <div className="flex items-center gap-1 text-it-ink-500 dark:text-wtext-4 mb-0.5">
            <Icon name="history" className="text-[16px]" aria-hidden="true" />
            <p className="text-card-meta font-medium">총 수강</p>
          </div>
          <p className="text-it-ink-800 dark:text-white text-2xl font-extrabold font-num tabular-nums">
            {stats.totalClasses}회
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── 연락처 행 (ICETIMES flat — hairline) ──────────────
function ContactItem({ contact, isLast }: { contact: ContactInfo; isLast: boolean }) {
  return (
    <div className={cn('flex items-center gap-4 py-3.5', !isLast && 'border-b border-it-line dark:border-rink-700')}>
      <div
        className={cn(
          'flex items-center justify-center rounded-w-md shrink-0 size-10',
          contact.isEmergency
            ? 'bg-it-red-50 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-300'
            : 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-900/30 dark:text-it-blue-300',
        )}
        aria-hidden="true"
      >
        <Icon name={contact.icon} className="text-[20px]" />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <p className="text-it-ink-800 dark:text-white text-card-emphasis font-semibold">
          {contact.label}
          {contact.isEmergency && <span className="sr-only"> (긴급연락처)</span>}
        </p>
        <p className="text-it-ink-500 dark:text-wtext-4 text-card-body font-num tabular-nums">{contact.phone}</p>
      </div>
      <button
        type="button"
        aria-label={`${contact.label}에게 전화 걸기, ${contact.phone}`}
        className={cn(
          'shrink-0 flex items-center justify-center size-10 rounded-w-pill transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 focus:outline-none active:brightness-95',
          contact.isEmergency
            ? 'bg-it-red-50 text-it-red-500 hover:bg-it-red-500 hover:text-white dark:bg-it-red-500/15 dark:text-it-red-300'
            : 'bg-it-blue-50 text-it-blue-500 hover:bg-it-blue-500 hover:text-white dark:bg-it-blue-900/30 dark:text-it-blue-300',
        )}
      >
        <Icon name="call" className="text-[20px]" aria-hidden="true" />
      </button>
    </div>
  );
}

function ContactSection({ contacts }: { contacts: ContactInfo[] }) {
  return (
    <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-labelledby="contact-section-heading">
      <h3
        id="contact-section-heading"
        className="mb-1 text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white"
      >
        연락처 정보
      </h3>
      <ul className="flex flex-col list-none" role="list" aria-label={`연락처 ${contacts.length}건`}>
        {contacts.map((contact, index) => (
          <li key={index} role="listitem">
            <ContactItem contact={contact} isLast={index === contacts.length - 1} />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── 출석 행 (ICETIMES flat — hairline) ────────────────
function AttendanceItem({ record, isLast }: { record: AttendanceRecord; isLast: boolean }) {
  const isAbsent = record.status === 'absent';

  return (
    <div
      className={cn('flex items-center justify-between py-3.5', !isLast && 'border-b border-it-line dark:border-rink-700')}
      aria-label={`${record.month}월 ${record.day}일, ${record.className}, ${record.time}, ${isAbsent ? '결석' : '출석'}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center justify-center rounded-w-md size-12 border-[1.5px] border-it-line bg-it-fill dark:bg-rink-700/40 dark:border-rink-700/50">
          <span className="text-card-meta uppercase font-bold text-it-ink-500 dark:text-wtext-4">
            {record.month}
          </span>
          <span
            className={cn(
              'text-card-title font-bold leading-none font-num tabular-nums',
              isAbsent ? 'text-it-ink-400 dark:text-wtext-4' : 'text-it-ink-800 dark:text-white',
            )}
          >
            {record.day}
          </span>
        </div>
        <div className="flex flex-col">
          <p
            className={cn(
              'font-semibold',
              isAbsent ? 'text-it-ink-500 dark:text-wtext-4' : 'text-it-ink-800 dark:text-white',
            )}
          >
            {record.className}
          </p>
          <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">{record.time}</p>
        </div>
      </div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-3 py-1 rounded-w-pill',
          isAbsent
            ? 'bg-it-red-50 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-300'
            : 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-900/30 dark:text-it-blue-300',
        )}
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
    <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-labelledby="attendance-history-heading">
      <div className="flex justify-between items-center pb-1">
        <h3
          id="attendance-history-heading"
          className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white"
        >
          최근 출석 기록
        </h3>
        <button
          type="button"
          aria-label="출석 기록 전체보기"
          className="inline-flex items-center gap-0.5 text-card-body font-bold text-it-blue-500 transition-colors motion-reduce:transition-none hover:text-it-blue-600 focus-visible:ring-2 focus-visible:ring-it-blue-500/30 focus:outline-none rounded"
        >
          전체보기
          <Icon name="chevron_right" className="text-[18px]" aria-hidden="true" />
        </button>
      </div>
      <ul className="flex flex-col list-none" role="list" aria-label={`최근 출석 기록 ${records.length}건`}>
        {records.map((record, idx) => (
          <li key={record.id} role="listitem">
            <AttendanceItem record={record} isLast={idx === records.length - 1} />
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
            className: r.className ?? '정규훈련',
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
        <div className="flex-1 flex items-center justify-center bg-it-canvas dark:bg-puck">
          <div className="size-8 border-4 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" role="status" aria-label="불러오는 중" />
        </div>
      </MobileContainer>
    );
  }

  // ─── 에러 ─────────────────────
  if (error || !member) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="회원 상세 정보" />
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center bg-it-canvas dark:bg-puck">
          <div className="size-16 bg-it-red-50 dark:bg-it-red-500/15 rounded-w-pill flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-it-red-500" aria-hidden="true" />
          </div>
          <p className="text-card-emphasis font-semibold text-it-ink-800 dark:text-white mb-1.5">
            회원 정보를 불러올 수 없습니다.
          </p>
          <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 mb-6 max-w-[260px] leading-relaxed">
            {error ?? '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="h-11 px-5 bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-body font-bold rounded-w-md transition-colors motion-reduce:transition-none active:brightness-95"
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={() => back()}
              className="h-11 px-5 bg-it-surface dark:bg-rink-800 hover:bg-it-fill dark:hover:bg-rink-700 border-[1.5px] border-it-line-strong dark:border-rink-700 text-it-ink-800 dark:text-white text-card-body font-bold rounded-w-md transition-colors motion-reduce:transition-none"
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

      {/* Main Content — flat 흰 섹션 + 8px 회색 갭 */}
      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-30" role="main" aria-label="회원 상세 정보">
        <ProfileHero member={member} />

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        <StatsGrid stats={stats} />

        {contacts.length > 0 && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <ContactSection contacts={contacts} />
          </>
        )}

        {attendance.length > 0 && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <AttendanceHistory records={attendance} />
          </>
        )}

        <div className="h-6 bg-it-canvas dark:bg-puck" aria-hidden="true" />
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-0 fixed-center-x p-4 bg-it-canvas/95 dark:bg-puck/95 pt-8 z-40">
        <button
          type="button"
          aria-label={`${member.name} 회원 출석 체크하기`}
          className="w-full flex items-center justify-center gap-2 bg-it-blue-500 hover:bg-it-blue-600 text-white rounded-w-md py-4 transition-colors motion-reduce:transition-none active:brightness-95 focus-visible:ring-2 focus-visible:ring-it-blue-500/30 focus-visible:ring-offset-2 focus:outline-none"
        >
          <Icon name="edit_calendar" aria-hidden="true" />
          <span className="text-card-emphasis font-bold">출석 체크 하기</span>
        </button>
      </div>
    </MobileContainer>
  );
}
