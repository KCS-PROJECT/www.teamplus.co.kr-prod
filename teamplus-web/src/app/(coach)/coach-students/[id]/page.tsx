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

const LEVEL_MAP: Record<string, { label: string; className: string }> = {
  BEGINNER:     { label: '초급', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  INTERMEDIATE: { label: '중급', className: 'bg-blue-100 text-ice-500 dark:bg-blue-900/20 dark:text-blue-400' },
  ADVANCED:     { label: '고급', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400' },
};

const ATTENDANCE_STATUS_STYLES: Record<string, string> = {
  '출석': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  '지각': 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  '결석': 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
};

const LEVELS = [
  { value: 'BEGINNER', label: '초급' },
  { value: 'INTERMEDIATE', label: '중급' },
  { value: 'ADVANCED', label: '고급' },
];

// ─── Info Row ──────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-8 h-8 rounded-lg bg-wline-2 dark:bg-rink-700 flex items-center justify-center shrink-0">
        <Icon name={icon} className="text-[16px] text-wtext-3 dark:text-rink-300" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-0.5">{label}</p>
        <p className="text-card-body font-medium text-wtext-1 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Attendance Row ───────────────────────────────
const AttendanceRow = memo(function AttendanceRow({ record }: { record: AttendanceRecord }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-wline-2 dark:border-rink-700/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-card-body font-medium text-wtext-1 dark:text-white">{record.className}</p>
        <p className="text-card-meta text-wtext-3 dark:text-rink-300">{record.date}</p>
      </div>
      <span className={cn(
        'px-2.5 py-1 rounded-w-pill text-card-meta font-bold shrink-0',
        ATTENDANCE_STATUS_STYLES[record.status] ?? 'bg-wline-2 text-wtext-2'
      )}>
        {record.status}
      </span>
    </div>
  );
});

// [제거 2026-05-19] NoteCard / NoteModal / DeleteConfirmModal(메모 삭제용) 컴포넌트 제거.
// 코치 메모 기능 전체 삭제 (백엔드 미구현 + 공식 PRD 등재 없음).

// ─── Level Change Modal ──────────────────────────
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
        className="relative w-full max-w-sm bg-white dark:bg-rink-800 rounded-2xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-change-title"
      >
        <h3 id="level-change-title" className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-4">레벨 변경</h3>
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
                'flex items-center justify-between px-4 py-3 rounded-xl text-card-body font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none',
                selectedLevel === level.value
                  ? 'bg-ice-500 text-white'
                  : 'bg-wbg dark:bg-rink-900 text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-700'
              )}
            >
              <span>{level.label}</span>
              {selectedLevel === level.value && (
                <Icon name="check" className="text-card-title" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1" aria-label="레벨 변경 취소">
            취소
          </Button>
          <Button
            onClick={() => onConfirm(selectedLevel)}
            disabled={selectedLevel === currentLevel}
            className="flex-1"
            aria-label={`레벨을 ${LEVELS.find(l => l.value === selectedLevel)?.label ?? ''}로 변경하기`}
          >
            변경하기
          </Button>
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
  const [classRecords, setClassRecords] = useState<ClassRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 모달 상태 — [제거 2026-05-19] 코치 메모 관련 state 5개 제거 (notes/isNoteModalOpen/editingNote/isDeleteModalOpen/deletingNoteId).
  const [isLevelModalOpen, setIsLevelModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const levelInfo = student ? (LEVEL_MAP[student.level] ?? { label: student.level, className: 'bg-wline-2 text-wtext-2' }) : null;

  // ─── 렌더링 ─────────────────────────────────────────
  if (isLoading) return null;

  if (!student) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="학생 상세" />
        <main className="flex-1 flex flex-col items-center justify-center px-5">
          <div className="size-16 rounded-w-pill bg-wline-2 dark:bg-rink-800 flex items-center justify-center mb-4">
            <Icon name="error_outline" className="text-3xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
          </div>
          <p className="text-card-body text-wtext-3 dark:text-rink-300 font-medium text-center mb-4">
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

      <main className="flex-1 overflow-y-auto hide-scrollbar px-5 py-4 pb-30">
        {/* 학생 프로필 카드 */}
        <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 p-5 mb-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
                <Icon name="person" className="text-2xl text-wtext-3 dark:text-rink-300" aria-hidden="true" />
              </div>
              <div className={cn(
                'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-w-pill border-2 border-white dark:border-rink-800',
                student.isActive ? 'bg-green-500' : 'bg-wtext-4'
              )} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-card-title font-bold text-wtext-1 dark:text-white">{student.name}</h2>
                <span className="text-card-meta text-wtext-3 dark:text-rink-300">{student.age}세</span>
              </div>
              <div className="flex items-center gap-2">
                {levelInfo && (
                  <span className={cn('text-card-meta font-bold px-2 py-0.5 rounded-w-pill', levelInfo.className)}>
                    {levelInfo.label}
                  </span>
                )}
                <span className="text-card-meta text-wtext-3 dark:text-rink-300">{student.className}</span>
              </div>
            </div>
            <div className="text-right">
              <p className={cn(
                'text-2xl font-extrabold tabular-nums',
                student.attendanceRate >= 90 ? 'text-emerald-600 dark:text-emerald-400'
                  : student.attendanceRate >= 70 ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
              )}>
                {student.attendanceRate}%
              </p>
              <p className="text-card-meta text-wtext-3 dark:text-rink-300">출석률</p>
            </div>
          </div>

          {/* 빠른 액션 — [수정 2026-05-19] '메모 작성' 버튼 제거 (코치 메모 도메인 삭제).
              레벨 변경 버튼만 남아 단독으로 가득 채움. */}
          <div className="flex gap-2">
            <button
              onClick={() => setIsLevelModalOpen(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-wbg dark:bg-rink-900 rounded-xl text-card-meta font-medium text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-700 transition-colors active:brightness-95"
            >
              <Icon name="swap_vert" className="text-card-body" aria-hidden="true" />
              레벨 변경
            </button>
          </div>
        </section>

        {/* 탭 */}
        <div
          className="flex gap-1 mb-4 bg-wline-2 dark:bg-rink-800 rounded-lg p-1"
          role="tablist"
          aria-label="학생 상세 정보 탭"
        >
          {/* [수정 2026-05-19] 'notes' 탭 제거 (코치 메모 도메인 삭제). info + attendance 2개 탭만. */}
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
                'flex-1 flex items-center justify-center gap-1 py-2.5 text-card-meta font-medium rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ice-500 focus:outline-none',
                activeTab === tab.key
                  ? 'bg-white dark:bg-rink-700 text-wtext-1 dark:text-white shadow-sm'
                  : 'text-wtext-3 dark:text-rink-300'
              )}
            >
              <Icon name={tab.icon} className="text-card-body" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── 기본 정보 탭 ────────────────────── */}
        {activeTab === 'info' && (
          <section
            id="student-tab-panel-info"
            role="tabpanel"
            aria-labelledby="student-tab-info"
            className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 px-4 divide-y divide-slate-50 dark:divide-slate-700/50"
          >
            <InfoRow icon="person" label="이름" value={student.name} />
            <InfoRow icon="cake" label="나이" value={`${student.age}세`} />
            <InfoRow icon="school" label="수업" value={student.className} />
            <InfoRow icon="escalator_warning" label="보호자" value={student.parentName || '-'} />
            <InfoRow icon="phone" label="연락처" value={student.parentPhone || '-'} />
            <InfoRow icon="calendar_today" label="가입일" value={student.joinedAt || '-'} />
            <InfoRow icon="signal_cellular_alt" label="레벨" value={levelInfo?.label ?? student.level} />
          </section>
        )}

        {/* ─── 출석 이력 탭 ────────────────────── */}
        {activeTab === 'attendance' && (
          <div
            id="student-tab-panel-attendance"
            role="tabpanel"
            aria-labelledby="student-tab-attendance"
            className="flex flex-col gap-4"
          >
            {/* 출석 통계 */}
            <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 p-4">
              <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-3">최근 출석 통계</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-card-title font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{attendanceStats.present}</p>
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300">출석</p>
                </div>
                <div>
                  <p className="text-card-title font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">{attendanceStats.late}</p>
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300">지각</p>
                </div>
                <div>
                  <p className="text-card-title font-extrabold text-red-600 dark:text-red-400 tabular-nums">{attendanceStats.absent}</p>
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300">결석</p>
                </div>
              </div>
            </div>

            {/* 출석 이력 목록 */}
            <div className="bg-white dark:bg-rink-800 rounded-xl border border-wline-2 dark:border-rink-700 px-4">
              <div className="flex items-center justify-between py-3 border-b border-wline-2 dark:border-rink-700/50">
                <h3 className="text-card-body font-bold text-wtext-1 dark:text-white">최근 출석 이력</h3>
                <span className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">{attendanceStats.total}건</span>
              </div>
              {attendanceRecords.length > 0 ? (
                <ul className="list-none" role="list" aria-label="최근 출석 이력 목록">
                  {attendanceRecords.map(record => (
                    <li key={record.id} role="listitem">
                      <AttendanceRow record={record} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center py-10" role="status">
                  <Icon name="event_busy" className="text-3xl text-wtext-4 dark:text-rink-500 mb-2" aria-hidden="true" />
                  <p className="text-card-body text-wtext-3 dark:text-rink-300">{MESSAGES.attendance2.emptyHistory}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* [제거 2026-05-19] '메모 탭' 패널 통째 삭제 (코치 메모 도메인 전체 제거). */}
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
