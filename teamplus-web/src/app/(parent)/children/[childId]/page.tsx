'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { usePageReady } from '@/hooks/usePageReady';
import { useChildren, ChildApiItem } from '@/hooks/useChildren';
import { MESSAGES } from '@/lib/messages';
import { useNativeUI } from '@/hooks/useNativeUI';
import { calculateKoreanAge } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

// ========== 팀 소속 승인 상태 카드 (설계서 §4.5 + BR-12) ==========

function ApprovalStateCard({
  state,
  clubName,
  rejectionReason,
  onRetry,
}: {
  state: 'approved' | 'pending' | 'rejected' | 'none';
  clubName: string | null;
  rejectionReason: string | null;
  onRetry: () => void;
}) {
  if (state === 'approved' && clubName) {
    return (
      <div className="flex items-start gap-3" aria-label="팀 가입 승인 완료">
        <span className="shrink-0 flex size-9 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30">
          <Icon name="check_circle" className="text-[18px] text-it-blue-500" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-card-body font-bold text-it-ink-800 dark:text-white">
            {MESSAGES.team.detailApprovedTitle(clubName)}
          </p>
          <p className="mt-1 text-card-meta text-it-ink-500 dark:text-wtext-4 leading-relaxed">
            {MESSAGES.team.detailApprovedDesc}
          </p>
        </div>
      </div>
    );
  }

  if (state === 'pending' && clubName) {
    return (
      <div className="flex items-start gap-3" aria-label="팀 가입 승인 대기">
        <span className="shrink-0 flex size-9 items-center justify-center rounded-w-md bg-sun-100 dark:bg-sun-500/15">
          <Icon name="hourglass_top" className="text-[18px] text-sun-500" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-card-body font-bold text-it-ink-800 dark:text-white">
            {MESSAGES.team.detailPendingTitle(clubName)}
          </p>
          <p className="mt-1 text-card-meta text-it-ink-500 dark:text-wtext-4 leading-relaxed">
            {MESSAGES.team.detailPendingDesc}
          </p>
        </div>
      </div>
    );
  }

  if (state === 'rejected' && clubName) {
    return (
      <div className="flex items-start gap-3" aria-label="팀 가입 반려">
        <span className="shrink-0 flex size-9 items-center justify-center rounded-w-md bg-it-red-500/10 dark:bg-it-red-500/15">
          <Icon name="block" className="text-[18px] text-it-red-500" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-card-body font-bold text-it-ink-800 dark:text-white">
            {MESSAGES.team.detailRejectedTitle(clubName)}
          </p>
          <p className="mt-1 text-card-meta text-it-ink-500 dark:text-wtext-4 leading-relaxed">
            {MESSAGES.team.detailRejectedDesc}
          </p>
          {rejectionReason && (
            <div className="mt-3 rounded-w-md bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-red-500/30 dark:border-it-red-500/30 p-3">
              <p className="text-card-meta font-semibold text-it-red-500 mb-1">
                {MESSAGES.team.rejectionReasonLabel}
              </p>
              <p className="text-card-meta text-it-ink-800 dark:text-rink-100 leading-relaxed whitespace-pre-line">
                {rejectionReason}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 min-h-[48px] px-4 rounded-w-md bg-it-red-500 hover:bg-it-red-500/90 text-white text-card-body font-semibold transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-red-500/40"
          >
            <Icon name="refresh" className="text-[16px]" aria-hidden="true" />
            {MESSAGES.team.retrySignupCta}
          </button>
        </div>
      </div>
    );
  }

  // state === 'none'
  return (
    <div className="flex items-start gap-3" aria-label="팀 소속 없음">
      <span className="shrink-0 flex size-9 items-center justify-center rounded-w-md bg-it-line dark:bg-rink-700">
        <Icon name="group_off" className="text-[18px] text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-card-body font-bold text-it-ink-800 dark:text-rink-100">
          {MESSAGES.team.detailNoMembershipTitle}
        </p>
        <p className="mt-1 text-card-meta text-it-ink-500 dark:text-wtext-4 leading-relaxed">
          {MESSAGES.team.detailNoMembershipDesc}
        </p>
      </div>
    </div>
  );
}

// ========== 타입 ==========

interface ChildDetail {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  email: string;
  note: string;
  imageUrl: string | null;
  clubName: string | null;
  isActive: boolean;
  relationship: string;
  specialNotes: string;
  // 팀 가입 승인 상태 (설계서 §4.5 + BR-12)
  approvalState: 'approved' | 'pending' | 'rejected' | 'none';
  approvalClubName: string | null;
  rejectionReason: string | null;
}

// ========== 유틸 ==========
// 나이 계산은 @/lib/utils 의 calculateKoreanAge 로 통합 (중복 제거)

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const CHILD_TEEN_BOUNDARY = 10;

// ========== 인라인 편집 필드 ==========

function InlineField({
  label,
  value,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  editValue,
  onEditChange,
  icon,
  type = 'text',
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  editValue: string;
  onEditChange: (v: string) => void;
  icon: string;
  type?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Icon name={icon} className="text-it-blue-500 text-card-title shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-card-meta font-semibold text-it-ink-400 dark:text-wtext-4 mb-0.5">{label}</p>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type={type}
                value={editValue}
                onChange={(e) => onEditChange(e.target.value)}
                placeholder={placeholder}
                maxLength={maxLength}
                aria-label={label}
                className="flex-1 min-h-[48px] px-3 bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-card-body text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 transition-all motion-reduce:transition-none"
                autoFocus
              />
              <button
                type="button"
                onClick={onSave}
                className="shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-w-md bg-it-blue-500 text-white hover:bg-it-blue-600 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
                aria-label={`${label} 저장하기`}
              >
                <Icon name="check" size={18} />
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-w-md bg-it-line dark:bg-rink-700 text-it-ink-800 dark:text-rink-100 hover:bg-it-line-strong dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-ink-400/40"
                aria-label={`${label} 편집 취소`}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          ) : (
            <p className="text-card-body font-medium text-it-ink-800 dark:text-white truncate">
              {value || '-'}
            </p>
          )}
        </div>
      </div>
      {!isEditing && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-w-md hover:bg-it-fill dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
          aria-label={`${label} 수정하기`}
        >
          <Icon name="edit" className="text-it-ink-400 dark:text-wtext-4 text-card-emphasis" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ========== 메인 컴포넌트 ==========

export default function ChildDetailPage() {
  const params = useParams();
  const childId = params?.childId as string;
  const { back, navigate } = useNavigation();
  const { toast } = useToast();
  const { modal } = useModal();
  // [수정 2026-05-12] 자녀 삭제는 어드민 전용으로 이관됨 — deleteChild 제거.
  const { getChild, updateChild } = useChildren();

  // [appbar-harness-v3 / 2026-05-13] 이중 헤더 방지 — Web `<PageAppBar />` 단독 렌더.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  // 상태
  const [child, setChild] = useState<ChildDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 데이터 로딩
  const loadChildDetail = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const result = await getChild(childId);
    if (result.success && result.data) {
      const raw = result.data as ChildApiItem;
      // 승인 상태 선별 우선순위: approved > pending > rejected > none
      const approved = raw.clubMemberships?.find((m) => m.approvalStatus === 'approved');
      const pending = approved
        ? undefined
        : raw.clubMemberships?.find((m) => m.approvalStatus === 'pending');
      const rejected =
        approved || pending
          ? undefined
          : raw.clubMemberships?.find((m) => m.approvalStatus === 'rejected');
      const activeMembership = approved ?? pending ?? rejected;
      const approvalState: ChildDetail['approvalState'] = approved
        ? 'approved'
        : pending
        ? 'pending'
        : rejected
        ? 'rejected'
        : 'none';

      setChild({
        id: raw.id,
        firstName: raw.firstName,
        lastName: raw.lastName,
        birthDate: raw.birthDate ? raw.birthDate.split('T')[0] : '',
        gender: raw.gender ?? '',
        email: raw.email ?? '',
        note: raw.note ?? '',
        imageUrl: raw.imageUrl ?? null,
        clubName: raw.clubName ?? approved?.clubName ?? null,
        isActive: raw.isActive ?? true,
        relationship: raw.relationship ?? '',
        specialNotes: raw.note ?? '',
        approvalState,
        approvalClubName: activeMembership?.clubName ?? null,
        rejectionReason: rejected?.rejectionReason ?? null,
      });
    } else {
      setLoadError(result.error ?? '자녀 정보를 불러올 수 없습니다.');
    }
    setIsLoading(false);
  }, [childId, getChild]);

  useEffect(() => {
    if (childId) loadChildDetail();
  }, [childId, loadChildDetail]);

  // 인라인 편집 시작
  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  // 인라인 편집 저장
  const saveField = async (field: string) => {
    if (!child) return;
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (field === 'note') payload.note = editValue;
      else payload[field] = editValue;

      const result = await updateChild(child.id, payload);
      if (result.success) {
        toast.success(MESSAGES.save.success);
        setChild((prev) => prev ? { ...prev, [field]: editValue } : prev);
        setEditingField(null);
      } else {
        toast.error(result.error ?? MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsSaving(false);
    }
  };

  // [제거 2026-06-17] saveNotes — 특이사항 섹션 삭제로 미사용 제거.
  // [제거 2026-05-12] handleDelete — 자녀 삭제는 어드민(/admin/users) 전용으로 이관.

  // [v16 2026-05-16] 이중 로더 제거 — LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료.
  if (isLoading) return null;

  // 에러 상태
  if (loadError || !child) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="자녀 프로필" forceNative />
        <main className="flex-1 flex flex-col items-center justify-center px-6 bg-it-canvas dark:bg-puck">
          <div className="flex items-center justify-center size-16 rounded-w-pill bg-it-line dark:bg-rink-800 mb-4">
            <Icon name="error_outline" className="text-3xl text-it-ink-400 dark:text-wtext-4" aria-hidden="true" />
          </div>
          <p className="text-card-body text-it-ink-500 dark:text-wtext-4 font-medium text-center mb-4">
            {loadError ?? '자녀 정보를 불러올 수 없습니다.'}
          </p>
          <Button variant="outline" onClick={() => back()}>
            돌아가기
          </Button>
        </main>
      </MobileContainer>
    );
  }

  const age = calculateKoreanAge(child.birthDate) ?? 0;
  const isChildAge = age < CHILD_TEEN_BOUNDARY;
  const fullName = `${child.lastName}${child.firstName}`;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="자녀 프로필" forceNative />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck">

        {/* ========== 프로필 히어로 — navy 밴드 full-bleed ========== */}
        <section className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pb-7 pt-7" aria-label="자녀 프로필">
          <div className="flex flex-col items-center">
            {/* 프로필 사진 */}
            <div className="relative mb-4 shrink-0">
              <div className="size-24 rounded-w-pill overflow-hidden bg-white/15 dark:bg-white/10">
                {resolveImageSrc(child.imageUrl) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolveImageSrc(child.imageUrl)}
                    alt={fullName}
                    width={96}
                    height={96}
                    className="object-cover size-full"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <span className="text-3xl font-extrabold text-white tracking-tight select-none" aria-hidden="true">
                      {fullName.charAt(0) || '?'}
                    </span>
                  </div>
                )}
              </div>
              {/* 사진 변경 버튼 — 시각 마커는 size-9, invisible padding 으로 48dp 터치 영역 확보 */}
              <button
                type="button"
                className="absolute -bottom-2 -right-2 flex min-h-[48px] min-w-[48px] items-center justify-center rounded-w-pill bg-transparent group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-it-blue-800"
                aria-label="프로필 사진 변경하기"
                onClick={() => toast.info(MESSAGES.profile.photoChangeUnavailable)}
              >
                <span
                  aria-hidden="true"
                  className="size-9 rounded-w-pill bg-it-blue-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-it-blue-950 group-hover:bg-it-blue-600 group-active:brightness-95 transition-colors motion-reduce:transition-none"
                >
                  <Icon name="camera_alt" size={16} />
                </span>
              </button>
            </div>

            {/* 이름 */}
            <h2 className="text-[22px] font-extrabold tracking-[-0.01em] text-white">{fullName}</h2>

            {/* 칩들 */}
            <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
              <span className="text-card-meta text-white/70 tabular-nums">{age}세</span>
              <span className="text-card-meta font-bold px-2.5 py-1 rounded-w-pill bg-white/15 text-white">
                {isChildAge ? 'CHILD' : 'TEEN'}
              </span>
              {child.isActive ? (
                <span className="inline-flex items-center gap-1 text-card-meta font-semibold px-2.5 py-1 rounded-w-pill bg-mint-500/20 text-white">
                  <span className="inline-block size-1.5 rounded-w-pill bg-mint-500" aria-hidden="true" />
                  활동중
                </span>
              ) : (
                <span className="text-card-meta font-semibold px-2.5 py-1 rounded-w-pill bg-white/15 text-white/80">
                  비활동
                </span>
              )}
            </div>
            {child.clubName && (
              <p className="text-card-meta text-white/70 mt-2 flex items-center gap-1 truncate max-w-full">
                <Icon name="sports_hockey" className="text-card-body text-white/80 shrink-0" aria-hidden="true" />
                <span className="truncate">{child.clubName}</span>
              </p>
            )}
          </div>

          {/* 빠른 이동 타일 (4열) — navy 위 반투명 타일 */}
          <div className="mt-6 grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => navigate(`/children/${childId}/class-history`)}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-w-md bg-white/10 hover:bg-white/15 transition-colors motion-reduce:transition-none active:brightness-95"
              aria-label="수업 이력 보기"
            >
              <Icon name="event_note" className="text-[20px] text-white" aria-hidden="true" />
              <span className="text-card-meta font-semibold text-white">수업 이력</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/children/${childId}/awards`)}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-w-md bg-white/10 hover:bg-white/15 transition-colors motion-reduce:transition-none active:brightness-95"
              aria-label="수상 이력 보기"
            >
              <Icon name="military_tech" className="text-[20px] text-white" aria-hidden="true" />
              <span className="text-card-meta font-semibold text-white">수상 이력</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/children/${childId}/profile-card`)}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-w-md bg-white/10 hover:bg-white/15 transition-colors motion-reduce:transition-none active:brightness-95"
              aria-label="선수 이력 카드 보기"
            >
              <Icon name="badge" className="text-[20px] text-white" aria-hidden="true" />
              <span className="text-card-meta font-semibold text-white">선수 카드</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`/children/${childId}/edit`)}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-w-md bg-white/10 hover:bg-white/15 transition-colors motion-reduce:transition-none active:brightness-95"
              aria-label="자녀 정보 수정"
            >
              <Icon name="edit" className="text-[20px] text-white" aria-hidden="true" />
              <span className="text-card-meta font-semibold text-white">전체 수정</span>
            </button>
          </div>
        </section>

        {/* 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* ========== 팀 소속 상태 — flat 흰 섹션 (설계서 §4.5 + BR-12) ========== */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-label="팀 소속 상태">
          <ApprovalStateCard
            state={child.approvalState}
            clubName={child.approvalClubName}
            rejectionReason={child.rejectionReason}
            onRetry={() => navigate(`/children/${childId}/edit`)}
          />
        </section>

        {/* 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* ========== 기본 정보 — flat 흰 섹션 ========== */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-label="기본 정보">
          <h3 className="mb-5 flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
            <span className="flex size-7 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30">
              <Icon name="person" className="text-[16px] text-it-blue-500" aria-hidden="true" />
            </span>
            기본 정보
          </h3>

          <div className="divide-y divide-it-line dark:divide-rink-700">
            <InlineField
              label="생년월일"
              value={formatDate(child.birthDate)}
              isEditing={false}
              onEdit={() => {}}
              onSave={() => {}}
              onCancel={() => {}}
              editValue=""
              onEditChange={() => {}}
              icon="cake"
            />

            <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <Icon name="wc" className="text-it-blue-500 text-card-title shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-card-meta font-semibold text-it-ink-400 dark:text-wtext-4 mb-0.5">성별</p>
                  <p className="text-card-body font-medium text-it-ink-800 dark:text-white">
                    {child.gender === 'M' ? '남' : child.gender === 'F' ? '여' : '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* [제거 2026-06-17] 특이사항 섹션 삭제 (사용자 직접 지시) */}
        {/* [제거 2026-05-12] 위험 영역(자녀 삭제) — 어드민 전용으로 이관 */}

        <div className="h-6 bg-it-canvas dark:bg-puck" aria-hidden="true" />
      </main>
    </MobileContainer>
  );
}
