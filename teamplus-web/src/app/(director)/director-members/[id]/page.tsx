'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';
import { resolveImageSrc } from '@/lib/image-url';
import { MESSAGES } from '@/lib/messages';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';

// ── 타입 정의 ──

interface MemberDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: MemberRole;
  status: 'active' | 'inactive' | 'pending';
  joinedAt: string;
  avatarUrl?: string | null;
  address?: string;
  birthDate?: string;
  note?: string;
}

interface AttendanceSummary {
  totalClasses: number;
  attendedClasses: number;
  attendanceRate: number;
}

interface CreditSummary {
  totalCredits: number;
  usedCredits: number;
  remainingCredits: number;
}

type MemberRole = 'COACH' | 'PARENT' | 'TEEN' | 'CHILD';

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: 'COACH', label: '코치' },
  { value: 'PARENT', label: '학부모' },
  { value: 'TEEN', label: '청소년' },
  { value: 'CHILD', label: '아동' },
];

const ROLE_LABEL: Record<MemberRole, string> = {
  COACH: '코치',
  PARENT: '학부모',
  TEEN: '청소년',
  CHILD: '아동',
};

// ICETIMES 프로필 히어로(navy) 위 아바타 — 단일 중성 톤
const ROLE_STYLE: Record<MemberRole, { bg: string; text: string }> = {
  COACH: { bg: 'bg-white/15 dark:bg-white/10', text: 'text-white' },
  PARENT: { bg: 'bg-white/15 dark:bg-white/10', text: 'text-white' },
  TEEN: { bg: 'bg-white/15 dark:bg-white/10', text: 'text-white' },
  CHILD: { bg: 'bg-white/15 dark:bg-white/10', text: 'text-white' },
};

const STATUS_LABEL: Record<MemberDetail['status'], string> = {
  active: '활동 중',
  inactive: '비활성',
  pending: '대기',
};

// 히어로(navy) 위에 얹는 상태 칩 — 흰 글자 기반 반투명 칩
const STATUS_STYLE: Record<MemberDetail['status'], string> = {
  active: 'bg-mint-500/20 text-white',
  inactive: 'bg-white/15 text-white/80',
  pending: 'bg-sun-500/25 text-white',
};

/** 입력 필드 공통 스타일 (ICETIMES — it-fill + 1.5px it-line-strong) */
const INPUT_CLASS =
  'w-full rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-800 px-4 py-3 text-[15px] font-medium text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20';

const INPUT_READONLY_CLASS =
  'w-full rounded-w-md border-[1.5px] border-it-line dark:border-rink-700 bg-it-canvas dark:bg-puck px-4 py-3 text-[15px] font-medium text-it-ink-500 dark:text-wtext-4';

export default function DirectorMemberDetailPage() {
  // 인증/권한 체크는 (director)/layout.tsx 에서 단 한 번 수행됨 (중복 호출 금지)
  useNativeUI({ showStatusBar: true, showBottomNav: true });
  const params = useParams();
  const memberId = params?.id as string;
  const { navigate, back } = useNavigation();
  const { toast } = useToast();

  // ── 상태 ──
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // [제거 2026-05-12] 회원 삭제 상태 — 삭제는 어드민 전용으로 이관.

  // 편집 폼 상태
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<MemberRole>('PARENT');
  const [editNote, setEditNote] = useState('');

  // 출석/결제권 요약
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [credit, setCredit] = useState<CreditSummary | null>(null);

  // 역할 선택 시트
  const [showRoleSheet, setShowRoleSheet] = useState(false);

  // ── 데이터 로드 ──
  const loadMember = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<Record<string, unknown>>(`/members/${memberId}`);
      if (res.success && res.data) {
        const d = res.data;
        const user = (d.user ?? d) as Record<string, unknown>;
        const mapped: MemberDetail = {
          id: String(d.id ?? user.id ?? ''),
          name: String(user.name ?? (`${user.lastName ?? ''}${user.firstName ?? ''}`.trim() || user.email || '회원')),
          email: String(user.email ?? ''),
          phone: String(user.phone ?? user.phoneNumber ?? ''),
          role: (String(d.role ?? user.role ?? user.userType ?? 'PARENT').toUpperCase() as MemberRole),
          status: (String(d.status ?? user.status ?? 'active').toLowerCase() as MemberDetail['status']),
          joinedAt: String(d.joinedAt ?? d.createdAt ?? user.createdAt ?? ''),
          avatarUrl: (d.avatarUrl ?? user.avatarUrl) as string | null | undefined,
          address: String(user.address ?? ''),
          birthDate: String(user.birthDate ?? user.birth ?? ''),
          note: String(d.note ?? user.note ?? ''),
        };
        setMember(mapped);
        setEditName(mapped.name);
        setEditPhone(mapped.phone);
        setEditRole(mapped.role);
        setEditNote(mapped.note || '');

        // 출석 요약 (API에서 제공되면)
        if (d.attendance) {
          const att = d.attendance as Record<string, number>;
          setAttendance({
            totalClasses: att.totalClasses ?? 0,
            attendedClasses: att.attendedClasses ?? 0,
            attendanceRate: att.attendanceRate ?? 0,
          });
        }

        // 결제권 요약 (API에서 제공되면)
        if (d.credit || d.credits) {
          const cr = (d.credit ?? d.credits) as Record<string, number>;
          setCredit({
            totalCredits: cr.totalCredits ?? cr.total ?? 0,
            usedCredits: cr.usedCredits ?? cr.used ?? 0,
            remainingCredits: cr.remainingCredits ?? cr.remaining ?? cr.balance ?? 0,
          });
        }
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsLoading(false);
    }
  }, [memberId, toast]);

  useEffect(() => {
    void loadMember();
  }, [loadMember]);

  // ── 수정 모드 핸들러 ──
  const enterEditMode = useCallback(() => {
    if (!member) return;
    setEditName(member.name);
    setEditPhone(member.phone);
    setEditRole(member.role);
    setEditNote(member.note || '');
    setIsEditing(true);
  }, [member]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  /** 전화번호 자동 포맷 */
  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
    let formatted = raw;
    if (raw.length > 3 && raw.length <= 7) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3)}`;
    } else if (raw.length > 7) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7)}`;
    }
    setEditPhone(formatted);
  }, []);

  // ── 저장 ──
  const handleSave = useCallback(async () => {
    if (isSaving || !member) return;
    if (!editName.trim()) {
      toast.error(MESSAGES.directorMembers.nameRequired);
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, string> = {
        name: editName.trim(),
        phone: editPhone.replace(/-/g, ''),
        role: editRole,
        note: editNote.trim(),
      };
      const res = await api.patch(`/members/${memberId}`, payload);
      if (res.success) {
        toast.success(MESSAGES.save.success);
        setIsEditing(false);
        void loadMember();
      } else {
        toast.error(MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.save.error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, member, editName, editPhone, editRole, editNote, memberId, toast, loadMember]);

  // [제거 2026-05-12] handleDelete — 회원 삭제는 어드민 전용으로 이관.

  // ── 날짜 포맷 ──
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return '-';
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '-';
    const raw = phone.replace(/[^0-9]/g, '');
    if (raw.length === 11) return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7)}`;
    if (raw.length === 10) return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6)}`;
    return phone;
  };

  // ── 로딩 ──
  if (isLoading) return null;

  // ── 데이터 없음 ──
  if (!member) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="회원 상세" onBack={back} forceNative />
        <main className="flex-1 flex flex-col items-center justify-center px-4 bg-it-canvas dark:bg-puck">
          <div className="w-16 h-16 rounded-w-pill bg-it-line dark:bg-rink-700 flex items-center justify-center mb-4">
            <Icon name="person_off" className="text-3xl text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
            {MESSAGES.empty('회원')}
          </p>
        </main>
      </MobileContainer>
    );
  }

  const roleStyle = ROLE_STYLE[member.role] || ROLE_STYLE.PARENT;
  const statusStyle = STATUS_STYLE[member.status] || STATUS_STYLE.active;
  const initial = member.name?.charAt(0) || '?';

  return (
    <>
      <MobileContainer hasBottomNav>
        {/* [appbar-harness-v4 · 2026-05-12] rightAction → extraActions 변환:
            시계/종/메뉴 우측 3 액션 SoT 보존하면서 편집 모드 진입 액션 추가. */}
        <PageAppBar
          title="회원 상세"
          onBack={back}
          forceNative
          extraActions={
            !isEditing
              ? [
                  {
                    icon: "edit",
                    onClick: enterEditMode,
                    label: "회원 정보 수정",
                  },
                ]
              : undefined
          }
        />

        <main className="flex-1 overflow-y-auto pb-30 hide-scrollbar bg-it-canvas dark:bg-puck" role="main" aria-label="회원 상세">
          {/* 프로필 히어로 — navy 밴드 full-bleed (요약 강조) */}
          <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pb-7 pt-7" aria-label="회원 프로필">
            <div className="flex flex-col items-center">
              <div className={cn(
                'relative mb-4 flex size-24 items-center justify-center overflow-hidden rounded-w-pill',
                roleStyle.bg,
              )}>
                {resolveImageSrc(member.avatarUrl) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveImageSrc(member.avatarUrl)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className={cn('text-3xl font-extrabold', roleStyle.text)}>{initial}</span>
                )}
              </div>
              <h2 className="text-[22px] font-extrabold tracking-[-0.01em] text-white">{member.name}</h2>
              {member.email && (
                <p className="mt-1 text-card-meta text-white/70 break-all text-center">
                  {member.email}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center rounded-w-pill bg-white/15 px-2.5 py-1 text-card-meta font-bold text-white">
                  {ROLE_LABEL[member.role]}
                </span>
                <span className={cn(
                  'inline-flex items-center rounded-w-pill px-2.5 py-1 text-card-meta font-bold',
                  statusStyle,
                )}>
                  {STATUS_LABEL[member.status]}
                </span>
              </div>
            </div>
          </section>

          {/* flat 섹션 사이 8px 회색 갭 */}
          <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

          {/* 회원 정보 — flat 흰 섹션 (카드 박스 제거) */}
          <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-label="기본 정보">
              <h3 className="mb-5 flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                <span className="flex size-7 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30">
                  <Icon name="person" className="text-[16px] text-it-blue-500" aria-hidden="true" />
                </span>
                기본 정보
              </h3>

              {isEditing ? (
                <div className="space-y-5">
                  {/* 이름 */}
                  <div>
                    <label htmlFor="edit-name" className="mb-1.5 block text-card-meta font-bold text-it-ink-500 dark:text-wtext-4">
                      이름 <span className="text-it-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="edit-name"
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={INPUT_CLASS}
                      required
                      aria-required="true"
                    />
                  </div>

                  {/* 이메일 (읽기 전용) */}
                  <div>
                    <label className="mb-1.5 block text-card-meta font-bold text-it-ink-500 dark:text-wtext-4">이메일</label>
                    <div className={INPUT_READONLY_CLASS}>{member.email || '-'}</div>
                  </div>

                  {/* 연락처 */}
                  <div>
                    <label htmlFor="edit-phone" className="mb-1.5 block text-card-meta font-bold text-it-ink-500 dark:text-wtext-4">연락처</label>
                    <input
                      id="edit-phone"
                      type="tel"
                      value={editPhone}
                      onChange={handlePhoneChange}
                      className={INPUT_CLASS}
                      inputMode="numeric"
                    />
                  </div>

                  {/* 역할 */}
                  <div>
                    <label className="mb-1.5 block text-card-meta font-bold text-it-ink-500 dark:text-wtext-4">역할</label>
                    <button
                      type="button"
                      onClick={() => setShowRoleSheet(true)}
                      className={`${INPUT_CLASS} flex h-12 items-center justify-between text-left`}
                    >
                      <span>{ROLE_LABEL[editRole]}</span>
                      <Icon name="expand_more" className="text-xl text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
                    </button>
                  </div>

                  {/* 메모 */}
                  <div>
                    <label htmlFor="edit-note" className="mb-1.5 block text-card-meta font-bold text-it-ink-500 dark:text-wtext-4">메모</label>
                    <textarea
                      id="edit-note"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      rows={3}
                      className={`${INPUT_CLASS} resize-none`}
                      placeholder={MESSAGES.placeholders.enterAdminMemo}
                    />
                  </div>

                  {/* 저장/취소 버튼 */}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="h-12 flex-1 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-card-body font-bold text-it-ink-800 dark:text-white transition-colors motion-reduce:transition-none hover:bg-it-fill dark:hover:bg-rink-700 active:brightness-95"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || !editName.trim()}
                      className="h-12 flex-[2] rounded-w-md bg-it-blue-500 text-card-body font-bold text-white transition-colors motion-reduce:transition-none hover:bg-it-blue-600 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSaving ? MESSAGES.common.saving : '저장하기'}
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="divide-y divide-it-line dark:divide-rink-700">
                  <InfoRow icon="email" label="이메일" value={member.email || '-'} />
                  <InfoRow icon="phone" label="연락처" value={formatPhone(member.phone)} />
                  <InfoRow icon="badge" label="역할" value={ROLE_LABEL[member.role]} />
                  <InfoRow icon="calendar_today" label="가입일" value={formatDate(member.joinedAt)} />
                  {member.birthDate && (
                    <InfoRow icon="cake" label="생년월일" value={formatDate(member.birthDate)} />
                  )}
                  {member.address && (
                    <InfoRow icon="location_on" label="주소" value={member.address} />
                  )}
                  {member.note && (
                    <InfoRow icon="sticky_note_2" label="메모" value={member.note} />
                  )}
                </dl>
              )}
          </section>

          {/* 출석 이력 요약 — flat 흰 섹션 */}
          {attendance && (
            <>
              <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
              <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-label="출석 현황">
                <h3 className="mb-4 flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                  <span className="flex size-7 items-center justify-center rounded-w-md bg-mint-100 dark:bg-mint-500/15">
                    <Icon name="fact_check" className="text-[16px] text-mint-500" aria-hidden="true" />
                  </span>
                  출석 현황
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="총 수업" value={`${attendance.totalClasses}회`} />
                  <StatBox label="출석" value={`${attendance.attendedClasses}회`} />
                  <StatBox label="출석률" value={`${attendance.attendanceRate}%`} highlight />
                </div>
              </section>
            </>
          )}

          {/* 결제권 요약 — flat 흰 섹션 */}
          {credit && (
            <>
              <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
              <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-label="결제권 현황">
                <h3 className="mb-4 flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
                  <span className="flex size-7 items-center justify-center rounded-w-md bg-sun-100 dark:bg-sun-500/15">
                    <Icon name="toll" className="text-[16px] text-sun-500" aria-hidden="true" />
                  </span>
                  결제권 현황
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="총 결제권" value={`${credit.totalCredits}`} />
                  <StatBox label="사용" value={`${credit.usedCredits}`} />
                  <StatBox label="잔여" value={`${credit.remainingCredits}`} highlight />
                </div>
              </section>
            </>
          )}

          <div className="h-6 bg-it-canvas dark:bg-puck" aria-hidden="true" />
        </main>
      </MobileContainer>

      {/* [제거 2026-05-12] 삭제 확인 시트 — 회원 삭제는 어드민 전용 */}

      {/* 역할 선택 — 공통 BottomSheet */}
      <BottomSheet
        isOpen={showRoleSheet}
        onClose={() => setShowRoleSheet(false)}
        title="역할 선택"
      >
        <div className="flex flex-col gap-1 py-2">
          {ROLE_OPTIONS.map((opt) => {
            const selected = editRole === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setEditRole(opt.value);
                  setShowRoleSheet(false);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-w-md px-4 py-4 text-left transition-colors motion-reduce:transition-none',
                  selected
                    ? 'bg-it-blue-50 dark:bg-it-blue-900/30'
                    : 'hover:bg-it-fill active:bg-it-line dark:hover:bg-rink-700/40 dark:active:bg-rink-700/60',
                )}
              >
                <span
                  className={cn(
                    'text-card-title',
                    selected
                      ? 'font-bold text-it-blue-500'
                      : 'font-medium text-it-ink-800 dark:text-white',
                  )}
                >
                  {opt.label}
                </span>
                {selected && (
                  <Icon name="check_circle" className="text-2xl text-it-blue-500" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}

// ── 서브 컴포넌트 ──

/** 정보 행 */
function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Icon
        name={icon}
        className="mt-0.5 shrink-0 text-card-title text-it-blue-500"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <dt className="mb-0.5 text-card-meta font-semibold uppercase tracking-wide text-it-ink-400 dark:text-wtext-4">
          {label}
        </dt>
        <dd className="break-all text-card-body font-medium text-it-ink-800 dark:text-white">
          {value}
        </dd>
      </div>
    </div>
  );
}

/** 통계 박스 */
function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'flex flex-col items-center gap-1.5 rounded-w-md px-2 py-3.5 border-[1.5px]',
      highlight
        ? 'bg-it-blue-50 border-it-blue-500/30 dark:bg-it-blue-900/30 dark:border-it-blue-500/30'
        : 'bg-it-fill border-it-line dark:bg-rink-700/40 dark:border-rink-700/50',
    )}>
      <span className="text-card-meta font-semibold text-it-ink-500 dark:text-wtext-4">{label}</span>
      <span className={cn(
        'text-card-title font-bold tabular-nums',
        highlight ? 'text-it-blue-500' : 'text-it-ink-800 dark:text-white',
      )}>
        {value}
      </span>
    </div>
  );
}
