'use client';

import { useState, useCallback, useEffect, memo, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';
import { apiClient } from '@/services/api-client';

// ─── Types ──────────────────────────────────────────
interface StudentDetail {
  id: string;
  name: string;
  age: number;
  level: string;
  className: string;
  attendanceRate: number;
  parentName: string;
  parentPhone: string;
  joinedAt: string;
  isActive: boolean;
}

interface AttendanceRecord {
  id: string;
  date: string;
  className: string;
  status: '출석' | '지각' | '결석';
}

interface ClassRecord {
  id: string;
  date: string;
  className: string;
  duration: string;
  coachName: string;
}

// [제거 2026-05-19] CoachNote interface + DetailTab 'notes' 탭 제거.
// 코치 메모 기능은 백엔드 미구현(/coach-notes 엔드포인트 없음) + 공식 PRD/로드맵 등재 없음.
type DetailTab = 'info' | 'attendance';

const LEVEL_MAP: Record<string, { label: string }> = {
  BEGINNER:     { label: '초급' },
  INTERMEDIATE: { label: '중급' },
  ADVANCED:     { label: '고급' },
};

// 히어로(navy) 위 레벨 배지 — 흰 글자 반투명
const HERO_LEVEL_BADGE = 'bg-white/15 text-white';

// ICETIMES 출석 상태 — it-blue(출석)/it-ink(지각)/it-red(결석)
const ATTENDANCE_STATUS_STYLES: Record<string, string> = {
  '출석': 'bg-it-blue-50 text-it-blue-500 dark:bg-it-blue-900/30 dark:text-it-blue-300',
  '지각': 'bg-it-fill text-it-ink-600 dark:bg-rink-700 dark:text-wtext-4',
  '결석': 'bg-it-red-50 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-300',
};

const ATTENDANCE_STAT_COLOR: Record<'present' | 'late' | 'absent', string> = {
  present: 'text-it-blue-500',
  late: 'text-it-ink-600 dark:text-wtext-4',
  absent: 'text-it-red-500',
};

const LEVELS = [
  { value: 'BEGINNER', label: '초급' },
  { value: 'INTERMEDIATE', label: '중급' },
  { value: 'ADVANCED', label: '고급' },
];

// ─── Info Row (ICETIMES) ───────────────────────────
function InfoRow({ icon, label, value, isLast }: { icon: string; label: string; value: string; isLast?: boolean }) {
  return (
    <div className={cn('flex items-start gap-3 py-3', !isLast && 'border-b border-it-line dark:border-rink-700')}>
      <Icon
        name={icon}
        className="mt-0.5 shrink-0 text-card-title text-it-blue-500"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="mb-0.5 text-card-meta font-semibold uppercase tracking-wide text-it-ink-400 dark:text-wtext-4">{label}</p>
        <p className="break-all text-card-body font-medium text-it-ink-800 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

// ─── Attendance Row (ICETIMES flat — hairline) ───────
const AttendanceRow = memo(function AttendanceRow({ record, isLast }: { record: AttendanceRecord; isLast: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-3', !isLast && 'border-b border-it-line dark:border-rink-700')}>
      <div className="flex-1 min-w-0">
        <p className="text-card-body font-medium text-it-ink-800 dark:text-white">{record.className}</p>
        <p className="text-card-meta text-it-ink-500 dark:text-wtext-4 font-num tabular-nums">{record.date}</p>
      </div>
      <span className={cn(
        'shrink-0 rounded-w-pill px-2.5 py-1 text-card-meta font-bold',
        ATTENDANCE_STATUS_STYLES[record.status] ?? 'bg-it-fill text-it-ink-600',
      )}>
        {record.status}
      </span>
    </div>
  );
});

// [제거 2026-05-19] NoteCard / NoteModal / DeleteConfirmModal(메모 삭제용) 컴포넌트 제거.
// 코치 메모 기능 전체 삭제 (백엔드 미구현 + 공식 PRD 등재 없음).

// ─── Level Change Modal (오버레이 — 카드 형태 유지) ──
function LevelChangeModal({
  isOpen,
  currentLevel,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  currentLevel: string;
  onClose: () => void;
  onConfirm: (level: string) => void;
}) {
  const [selectedLevel, setSelectedLevel] = useState(currentLevel);

  useEffect(() => {
    if (isOpen) setSelectedLevel(currentLevel);
  }, [isOpen, currentLevel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" role="presentation">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-sm bg-it-surface dark:bg-rink-800 rounded-w-xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-change-title"
      >
        <h3 id="level-change-title" className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-4">레벨 변경</h3>
        <div
          className="flex flex-col gap-2 mb-6"
          role="radiogroup"
          aria-labelledby="level-change-title"
        >
          {LEVELS.map(level => (
            <button
              key={level.value}
              type="button"
              role="radio"
              aria-checked={selectedLevel === level.value}
              onClick={() => setSelectedLevel(level.value)}
              className={cn(
                'flex items-center justify-between rounded-w-md border-[1.5px] px-4 py-3 text-card-body font-bold transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 focus:outline-none active:brightness-95',
                selectedLevel === level.value
                  ? 'border-it-blue-500 bg-it-blue-50 text-it-blue-500 dark:border-it-blue-500 dark:bg-it-blue-900/30'
                  : 'border-it-line-strong bg-it-surface text-it-ink-800 hover:bg-it-fill dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:hover:bg-rink-700',
              )}
            >
              <span>{level.label}</span>
              {selectedLevel === level.value && (
                <Icon name="check" className="text-card-title text-it-blue-500" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface text-card-body font-bold text-it-ink-800 transition-colors motion-reduce:transition-none hover:bg-it-fill active:brightness-95 dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:hover:bg-rink-700"
            aria-label="레벨 변경 취소"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedLevel)}
            disabled={selectedLevel === currentLevel}
            className="h-12 flex-1 rounded-w-md bg-it-blue-500 text-card-body font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`레벨을 ${LEVELS.find(l => l.value === selectedLevel)?.label ?? ''}로 변경하기`}
          >
            변경하기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────
export default function CoachStudentDetailPage() {
  const params = useParams();
  const studentId = params?.id as string;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [, setClassRecords] = useState<ClassRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 모달 상태 — [제거 2026-05-19] 코치 메모 관련 state 5개 제거 (notes/isNoteModalOpen/editingNote/isDeleteModalOpen/deletingNoteId).
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [, setIsSaving] = useState(false);

  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: student?.name ?? '학생 상세',
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });

  // ─── 데이터 조회 ──────────────────────────────────
  const fetchStudentDetail = useCallback(async () => {
    setIsLoading(true);
    try {
      // [수정 2026-05-19] /coach-notes 가짜 API 호출 제거. 학생 정보만 단일 조회.
      const memberRes = await apiClient.get(`/members/${studentId}`);
      const m = memberRes.data?.data ?? memberRes.data;
      setStudent({
        id: String(m.id ?? studentId),
        name: String(m.name ?? ''),
        age: Number(m.age ?? 0),
        level: String(m.level ?? 'BEGINNER'),
        className: String(m.className ?? ''),
        attendanceRate: Number(m.attendanceRate ?? 0),
        parentName: String(m.parentName ?? ''),
        parentPhone: String(m.parentPhone ?? ''),
        joinedAt: String(m.joinedAt ?? ''),
        isActive: Boolean(m.isActive ?? true),
      });
    } catch {
      toast.error(MESSAGES.error.general);
      setStudent(null);
      setAttendanceRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [studentId, toast]);

  useEffect(() => { fetchStudentDetail(); }, [fetchStudentDetail]);

  // [제거 2026-05-19] handleNoteSubmit / handleDeleteNote 핸들러 제거 (코치 메모 도메인 삭제).

  const handleLevelChange = useCallback(async (newLevel: string) => {
    if (!student) return;
    setIsSaving(true);
    try {
      await apiClient.patch(`/members/${studentId}`, { level: newLevel });
      setStudent(prev => prev ? { ...prev, level: newLevel } : null);
      toast.success(MESSAGES.save.success);
    } catch {
      toast.error(MESSAGES.save.error);
    } finally {
      setIsSaving(false);
      setIsLevelModalOpen(false);
    }
  }, [student, studentId, toast]);

  // [제거 2026-05-19] openEditNote / openDeleteNote 헬퍼 제거 (코치 메모 도메인 삭제).

  // ─── 출석 통계 ─────────────────────────────────────
  const attendanceStats = useMemo(() => {
    const present = attendanceRecords.filter(r => r.status === '출석').length;
    const late = attendanceRecords.filter(r => r.status === '지각').length;
    const absent = attendanceRecords.filter(r => r.status === '결석').length;
    return { present, late, absent, total: attendanceRecords.length };
  }, [attendanceRecords]);

  const levelInfo = student ? (LEVEL_MAP[student.level] ?? { label: student.level }) : null;

  // ─── 렌더링 ─────────────────────────────────────────
  if (isLoading) return null;

  if (!student) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="학생 상세" />
        <main className="flex-1 flex flex-col items-center justify-center px-5 bg-it-canvas dark:bg-puck">
          <div className="size-16 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-wtext-4 font-medium text-center mb-4">
            학생 정보를 불러올 수 없습니다.
          </p>
          <Button variant="outline" onClick={fetchStudentDetail}>
            {MESSAGES.dashboard.errorRetry}
          </Button>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={student.name} />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck pb-30" role="main" aria-label="학생 상세">
        {/* 프로필 히어로 — navy 밴드 full-bleed */}
        <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pb-7 pt-7" aria-label="학생 프로필">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="size-16 rounded-w-pill bg-white/15 dark:bg-white/10 flex items-center justify-center">
                <Icon name="person" className="text-2xl text-white" aria-hidden="true" />
              </div>
              <span className={cn(
                'absolute -bottom-0.5 -right-0.5 size-4 rounded-w-pill border-2 border-it-blue-800 dark:border-it-blue-950',
                student.isActive ? 'bg-mint-500' : 'bg-white/40',
              )} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-white truncate">{student.name}</h2>
                <span className="shrink-0 text-card-meta text-white/70">{student.age}세</span>
              </div>
              <div className="flex items-center gap-2">
                {levelInfo && (
                  <span className={cn('rounded-w-pill px-2.5 py-1 text-card-meta font-bold', HERO_LEVEL_BADGE)}>
                    {levelInfo.label}
                  </span>
                )}
                {student.className && (
                  <span className="text-card-meta text-white/70 truncate">{student.className}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-extrabold font-num tabular-nums text-white">
                {student.attendanceRate}%
              </p>
              <p className="text-card-meta text-white/70">출석률</p>
            </div>
          </div>

          {/* 빠른 액션 — 레벨 변경 (히어로 위 outline 칩) */}
          <button
            type="button"
            onClick={() => setIsLevelModalOpen(true)}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-w-md border-[1.5px] border-white/25 bg-white/10 py-2.5 text-card-body font-bold text-white transition-colors motion-reduce:transition-none hover:bg-white/15 active:brightness-95"
          >
            <Icon name="swap_vert" className="text-card-title" aria-hidden="true" />
            레벨 변경
          </button>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 탭 — 흰 섹션 내부 segmented */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-4 pb-2">
          <div
            className="flex gap-1 rounded-w-md bg-it-fill dark:bg-rink-900 p-1"
            role="tablist"
            aria-label="학생 상세 정보 탭"
          >
            {([
              { key: 'info' as DetailTab, label: '기본 정보', icon: 'person' },
              { key: 'attendance' as DetailTab, label: '출석 이력', icon: 'calendar_month' },
            ]).map(tab => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`student-tab-panel-${tab.key}`}
                id={`student-tab-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 py-2.5 text-card-meta font-bold rounded-w-sm transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 focus:outline-none',
                  activeTab === tab.key
                    ? 'bg-it-surface dark:bg-rink-700 text-it-blue-500'
                    : 'text-it-ink-500 dark:text-wtext-4',
                )}
              >
                <Icon name={tab.icon} className="text-card-body" aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {/* ─── 기본 정보 탭 ────────────────────── */}
        {activeTab === 'info' && (
          <section
            id="student-tab-panel-info"
            role="tabpanel"
            aria-labelledby="student-tab-info"
            className="bg-it-surface dark:bg-rink-800 px-5 pt-1 pb-6"
          >
            <InfoRow icon="person" label="이름" value={student.name} />
            <InfoRow icon="cake" label="나이" value={`${student.age}세`} />
            <InfoRow icon="school" label="수업" value={student.className || '-'} />
            <InfoRow icon="escalator_warning" label="보호자" value={student.parentName || '-'} />
            <InfoRow icon="phone" label="연락처" value={student.parentPhone || '-'} />
            <InfoRow icon="calendar_today" label="가입일" value={student.joinedAt || '-'} />
            <InfoRow icon="signal_cellular_alt" label="레벨" value={levelInfo?.label ?? student.level} isLast />
          </section>
        )}

        {/* ─── 출석 이력 탭 ────────────────────── */}
        {activeTab === 'attendance' && (
          <div
            id="student-tab-panel-attendance"
            role="tabpanel"
            aria-labelledby="student-tab-attendance"
          >
            {/* 출석 통계 — flat 흰 섹션 */}
            <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5">
              <h3 className="mb-4 text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">최근 출석 통계</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className={cn('text-card-section font-extrabold font-num tabular-nums', ATTENDANCE_STAT_COLOR.present)}>{attendanceStats.present}</p>
                  <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">출석</p>
                </div>
                <div>
                  <p className={cn('text-card-section font-extrabold font-num tabular-nums', ATTENDANCE_STAT_COLOR.late)}>{attendanceStats.late}</p>
                  <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">지각</p>
                </div>
                <div>
                  <p className={cn('text-card-section font-extrabold font-num tabular-nums', ATTENDANCE_STAT_COLOR.absent)}>{attendanceStats.absent}</p>
                  <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">결석</p>
                </div>
              </div>
            </section>

            {/* flat 섹션 사이 8px 회색 갭 */}
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

            {/* 출석 이력 목록 — flat 흰 섹션 */}
            <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6">
              <div className="flex items-center justify-between pb-1 border-b border-it-line dark:border-rink-700">
                <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">최근 출석 이력</h3>
                <span className="text-card-meta text-it-ink-500 dark:text-wtext-4 font-num tabular-nums">{attendanceStats.total}건</span>
              </div>
              {attendanceRecords.length > 0 ? (
                <ul className="list-none" role="list" aria-label="최근 출석 이력 목록">
                  {attendanceRecords.map((record, idx) => (
                    <li key={record.id} role="listitem">
                      <AttendanceRow record={record} isLast={idx === attendanceRecords.length - 1} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center py-10" role="status">
                  <Icon name="event_busy" className="text-3xl text-it-ink-300 dark:text-rink-500 mb-2" aria-hidden="true" />
                  <p className="text-card-body text-it-ink-500 dark:text-wtext-4">{MESSAGES.attendance2.emptyHistory}</p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* [제거 2026-05-19] '메모 탭' 패널 통째 삭제 (코치 메모 도메인 전체 제거). */}

        <div className="h-6 bg-it-canvas dark:bg-puck" aria-hidden="true" />
      </main>

      {/* 모달들 — [수정 2026-05-19] NoteModal / DeleteConfirmModal 렌더링 제거. */}
      <LevelChangeModal
        isOpen={isLevelModalOpen}
        currentLevel={student.level}
        onClose={() => setIsLevelModalOpen(false)}
        onConfirm={handleLevelChange}
      />
    </MobileContainer>
  );
}
